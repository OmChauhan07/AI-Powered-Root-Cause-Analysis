import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.database.base import Base
from app.database.session import get_db
from app.main import app
from app.models.investigation import Investigation, SourceDocument, EvidenceRecord, CauseCandidate
from app.ai.workflow import build_rca_methods_graph
from app.ai.nodes import rca_investigation_methods_node


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


def test_rca_workflow_node_deterministic_five_whys():
    """Verify that rca_investigation_methods_node formulates a compliant 5 Whys chain."""
    state = {
        "investigation_id": "inv-test-01",
        "investigation_method": "five_whys",
        "incident_fields": {
            "product_name": "API-X",
            "batch_number": "BATCH-2026-014",
            "equipment_id": "TEMP-SENSOR-014",
            "problem_statement": "API-X Batch BATCH-2026-014 purity was 98.1%, below 99.0% specification limit.",
        },
        "evidence_records": [
            {
                "id": "ev-01",
                "evidence_type": "calibration_certificate",
                "title": "TEMP-SENSOR-014 Calibration Certificate",
                "findings": "Observed Error +0.8°C (Tolerance ±0.5°C). Out of tolerance.",
                "status": "out_of_tolerance",
            }
        ],
        "normalized_sources": [],
    }

    result = rca_investigation_methods_node(state)
    assert "five_whys_chains" in result
    chains = result["five_whys_chains"]
    assert len(chains) >= 4

    # Check first step
    step1 = chains[0]
    assert step1["step"] == 1
    assert "98.1%" in step1["question"] or "purity" in step1["question"].lower()
    assert step1["is_hypothesis"] is False  # Derived from analytical fact

    # Check deeper step is flagged as hypothesis
    assert any(s.get("is_hypothesis") is True for s in chains)

    # Check cause candidates are generated with unconfirmed status
    candidates = result["cause_candidates"]
    assert len(candidates) > 0
    for cand in candidates:
        assert cand["review_status"] == "pending"
        assert cand["ai_status"] in ["hypothesis", "evidence_supported_pending_review"]


def test_rca_workflow_node_deterministic_fishbone():
    """Verify that Fishbone 6M breakdown categorizes factors correctly."""
    state = {
        "investigation_id": "inv-test-02",
        "investigation_method": "fishbone",
        "incident_fields": {
            "product_name": "API-X",
            "batch_number": "BATCH-2026-014",
            "equipment_id": "TEMP-SENSOR-014",
            "problem_statement": "API-X Batch BATCH-2026-014 purity out of specification.",
        },
        "evidence_records": [
            {
                "id": "ev-cal-01",
                "evidence_type": "calibration_certificate",
                "title": "TEMP-SENSOR-014 Calibration Certificate",
                "findings": "Observed Error +0.8°C. Sensor drift.",
                "status": "out_of_tolerance",
            }
        ],
        "normalized_sources": [],
    }

    result = rca_investigation_methods_node(state)
    assert "fishbone_categories" in result
    fishbone = result["fishbone_categories"]
    assert "machine" in fishbone
    assert "method" in fishbone
    assert "measurement" in fishbone
    assert len(fishbone["machine"]) > 0
    assert len(fishbone["measurement"]) > 0


def test_rca_methods_api_analyze_and_get(client, test_db):
    """Test POST and GET endpoints for RCA methods."""
    inv = Investigation(
        id="inv-rca-01",
        reference_code="RCA-2026-01",
        title="Test Investigation",
        product_name="API-X",
        batch_number="BATCH-2026-014",
        equipment_id="TEMP-SENSOR-014",
        problem_statement="Purity failed at 98.1%",
    )
    test_db.add(inv)
    test_db.commit()

    # Trigger RCA analysis via POST
    response = client.post(
        "/api/investigations/inv-rca-01/rca-methods/analyze",
        json={"method": "five_whys"},
    )
    assert response.status_code == 200
    data = response.json()
    assert data["investigation_id"] == "inv-rca-01"
    assert data["method"] == "five_whys"
    assert len(data["five_whys_chains"]) >= 4
    assert len(data["cause_candidates"]) > 0

    # Retrieve stored RCA data via GET
    get_res = client.get("/api/investigations/inv-rca-01/rca-methods")
    assert get_res.status_code == 200
    get_data = get_res.json()
    assert len(get_data["five_whys_chains"]) == len(data["five_whys_chains"])
    assert len(get_data["cause_candidates"]) == len(data["cause_candidates"])


def test_cause_candidate_human_qualification(client, test_db):
    """Verify that a human reviewer can confirm or reject a candidate root cause."""
    inv = Investigation(
        id="inv-rca-02",
        reference_code="RCA-2026-02",
        title="Test Investigation 2",
    )
    test_db.add(inv)
    test_db.commit()

    # Trigger analysis to generate candidates
    client.post(
        "/api/investigations/inv-rca-02/rca-methods/analyze",
        json={"method": "five_whys"},
    )

    # Fetch candidates from DB
    candidates = test_db.query(CauseCandidate).filter(CauseCandidate.investigation_id == "inv-rca-02").all()
    assert len(candidates) > 0
    cand_to_review = candidates[0]
    assert cand_to_review.review_status == "pending"

    # Human investigator confirms the root cause with review note
    patch_res = client.patch(
        f"/api/investigations/inv-rca-02/causes/{cand_to_review.id}",
        json={
            "review_status": "confirmed",
            "reviewer_note": "Confirmed by QA Metrology based on calibration cert CAL-2026-088.",
        },
    )
    assert patch_res.status_code == 200
    patch_data = patch_res.json()
    assert patch_data["review_status"] == "confirmed"
    assert "CAL-2026-088" in patch_data["reviewer_note"]

    # Verify persisted in database
    test_db.refresh(cand_to_review)
    assert cand_to_review.review_status == "confirmed"
    assert "CAL-2026-088" in cand_to_review.reviewer_note


def test_cause_candidate_not_found(client, test_db):
    """Test 404 when updating non-existent cause candidate."""
    patch_res = client.patch(
        "/api/investigations/inv-fake/causes/non-existent-cause-id",
        json={"review_status": "confirmed"},
    )
    assert patch_res.status_code == 404
