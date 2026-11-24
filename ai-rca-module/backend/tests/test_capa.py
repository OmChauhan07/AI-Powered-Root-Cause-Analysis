import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.database.base import Base
from app.database.session import get_db
from app.main import app
from app.models.investigation import Investigation, CauseCandidate, EvidenceRecord, InvestigationGap, CapaAction
from app.ai.workflow import build_capa_graph
from app.ai.nodes import capa_recommendations_node


@pytest.fixture
def test_db():
    engine = create_engine(
        "sqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
    Base.metadata.create_all(bind=engine)

    db = TestingSessionLocal()
    try:
        yield db
    finally:
        db.close()
        Base.metadata.drop_all(bind=engine)


@pytest.fixture
def client(test_db):
    def override_get_db():
        try:
            yield test_db
        finally:
            pass

    app.dependency_overrides[get_db] = override_get_db
    with TestClient(app) as test_client:
        yield test_client
    app.dependency_overrides.clear()


def test_capa_generation_with_supported_cause():
    """Verify CAPA node generates containment, corrective, preventive actions when cause is supported."""
    state = {
        "investigation_id": "inv-capa-01",
        "incident_fields": {
            "equipment_id": "TEMP-SENSOR-014",
            "batch_number": "BATCH-2026-014",
            "product_name": "API-X",
        },
        "cause_candidates": [
            {
                "id": "cand-sensor-01",
                "candidate_text": "Temperature sensor TEMP-SENSOR-014 calibration drift caused slow crystallization cooling.",
                "review_status": "confirmed",
                "ai_status": "evidence_supported_pending_review",
            }
        ],
        "evidence_records": [
            {
                "id": "ev-cal-01",
                "evidence_type": "calibration_certificate",
                "title": "TEMP-SENSOR-014 Calibration Certificate",
            }
        ],
        "investigation_gaps": [],
    }

    result = capa_recommendations_node(state)
    capas = result["capa_recommendations"]
    assert len(capas) >= 4
    assert result["deferred_reason"] is None

    action_types = [c["action_type"] for c in capas]
    assert "containment" in action_types
    assert "corrective" in action_types
    assert "preventive" in action_types

    # Role-only check: verify no individual employee names are invented
    for c in capas:
        assert c["review_status"] == "pending_review"
        assert c["effectiveness_check"] is not None and len(c["effectiveness_check"]) > 5
        role = c["owner_role"].lower()
        # Verify role represents a title or lead, not a specific personal name
        assert any(k in role for k in ["lead", "supervisor", "manager", "specialist", "engineer"])


def test_capa_deferral_when_no_supported_cause():
    """Verify that unsupported root cause hypotheses defer preventive CAPA and generate follow-up actions."""
    state = {
        "investigation_id": "inv-capa-02",
        "incident_fields": {
            "equipment_id": "TEMP-SENSOR-014",
            "batch_number": "BATCH-2026-014",
            "product_name": "API-X",
        },
        "cause_candidates": [
            {
                "id": "cand-hypo-01",
                "candidate_text": "Unverified theoretical operator error.",
                "review_status": "pending",
                "ai_status": "hypothesis",
            }
        ],
        "evidence_records": [],
        "investigation_gaps": [
            {
                "field_or_record": "cooling_jacket_log",
                "description": "Missing thermal telemetry logs",
                "status": "not_provided",
            }
        ],
    }

    result = capa_recommendations_node(state)
    assert result["deferred_reason"] is not None
    assert "deferred" in result["deferred_reason"].lower()

    capas = result["capa_recommendations"]
    action_types = [c["action_type"] for c in capas]
    assert "investigation_followup" in action_types
    assert "preventive" not in action_types  # No premature preventive actions without evidence


def test_capa_api_generate_and_get(client, test_db):
    """Test POST .../capa-suggestions and GET .../capa-actions endpoints."""
    inv = Investigation(
        id="inv-capa-api-01",
        reference_code="RCA-2026-CAPA",
        title="Test Investigation CAPA",
        product_name="API-X",
        batch_number="BATCH-2026-014",
        equipment_id="TEMP-SENSOR-014",
    )
    test_db.add(inv)

    cand = CauseCandidate(
        id="cand-001",
        investigation_id="inv-capa-api-01",
        candidate_text="TEMP-SENSOR-014 calibration drift.",
        rationale="Sensor error.",
        review_status="confirmed",
        ai_status="evidence_supported_pending_review",
        supporting_evidence_ids=[],
        contradicting_evidence_ids=[],
    )
    test_db.add(cand)
    test_db.commit()

    # Call POST generate
    gen_res = client.post("/api/investigations/inv-capa-api-01/capa-suggestions")
    assert gen_res.status_code == 200
    data = gen_res.json()
    assert data["investigation_id"] == "inv-capa-api-01"
    assert len(data["capa_recommendations"]) >= 4

    # Call GET list
    get_res = client.get("/api/investigations/inv-capa-api-01/capa-actions")
    assert get_res.status_code == 200
    get_data = get_res.json()
    assert len(get_data["capa_recommendations"]) == len(data["capa_recommendations"])


def test_capa_api_review_and_edit(client, test_db):
    """Test human-in-the-loop PATCH review of CAPA action item."""
    inv = Investigation(
        id="inv-capa-api-02",
        reference_code="RCA-2026-CAPA2",
        title="Test Investigation CAPA 2",
    )
    test_db.add(inv)

    action = CapaAction(
        id="act-001",
        investigation_id="inv-capa-api-02",
        action_type="preventive",
        title="Automate CMMS Interlock",
        action_text="Configure CMMS lockout.",
        rationale="Eliminate expired instrument use.",
        owner_role="CSV Lead",
        effectiveness_check="Challenge test.",
        review_status="pending_review",
    )
    test_db.add(action)
    test_db.commit()

    # Reviewer accepts action with edited effectiveness check
    patch_res = client.patch(
        "/api/investigations/inv-capa-api-02/capa-actions/act-001",
        json={
            "review_status": "accepted",
            "effectiveness_check": "Execute 10 challenge tests across 30 days verifying 100% lockout.",
            "reviewer_note": "Approved by QA Operations Lead.",
        },
    )
    assert patch_res.status_code == 200
    patch_data = patch_res.json()
    assert patch_data["review_status"] == "accepted"
    assert "10 challenge tests" in patch_data["effectiveness_check"]

    # Verify database persistence
    test_db.refresh(action)
    assert action.review_status == "accepted"
    assert "10 challenge tests" in action.effectiveness_check
