import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.database.base import Base
from app.database.session import get_db
from app.main import app
from app.models.investigation import Investigation, SourceDocument, EvidenceRecord, InvestigationGap, CauseCandidate
from app.ai.workflow import build_cause_assessment_graph
from app.ai.nodes import assess_cause_evidence_matrix_node


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


def test_cause_assessment_node_deterministic_alignment():
    """Verify that cause candidates matching sensor drift receive supporting evidence and alignment."""
    state = {
        "investigation_id": "inv-eval-01",
        "incident_fields": {
            "equipment_id": "TEMP-SENSOR-014",
            "batch_number": "BATCH-2026-014",
            "problem_statement": "API-X Batch BATCH-2026-014 purity was 98.1%.",
        },
        "cause_candidates": [
            {
                "id": "cand-sensor-01",
                "candidate_text": "Temperature sensor TEMP-SENSOR-014 calibration drift caused slow cooling.",
                "rationale": "Thermal offset during crystallization.",
                "review_status": "pending",
                "supporting_evidence_ids": [],
                "contradicting_evidence_ids": [],
            }
        ],
        "evidence_records": [
            {
                "id": "ev-cal-01",
                "evidence_type": "calibration_certificate",
                "title": "TEMP-SENSOR-014 Calibration Certificate",
                "findings": "Observed Error +0.8°C. Out of tolerance.",
                "status": "out_of_tolerance",
            }
        ],
        "investigation_gaps": [],
    }

    result = assess_cause_evidence_matrix_node(state)
    matrix = result["matrix"]
    assert len(matrix) == 1
    item = matrix[0]

    assert item["equipment_aligned"] is True
    assert item["timeline_aligned"] is True
    assert "ev-cal-01" in item["supporting_evidence_ids"]
    assert item["ai_status"] == "evidence_supported_pending_review"
    assert item["review_status"] == "pending"


def test_cause_assessment_contradicting_evidence():
    """Verify that raw material contamination candidate is refuted by valid solvent COA."""
    state = {
        "investigation_id": "inv-eval-02",
        "incident_fields": {
            "equipment_id": "TEMP-SENSOR-014",
            "batch_number": "BATCH-2026-014",
        },
        "cause_candidates": [
            {
                "id": "cand-solvent-01",
                "candidate_text": "Raw material solvent chemical impurity or contamination.",
                "rationale": "Suspected defective solvent lot.",
                "review_status": "pending",
                "supporting_evidence_ids": [],
                "contradicting_evidence_ids": [],
            }
        ],
        "evidence_records": [
            {
                "id": "ev-solv-01",
                "evidence_type": "lab_certificate_of_analysis",
                "title": "Solvent Certificate of Analysis Lot S-8821",
                "findings": "Solvent purity confirmed at 99.8% (specification >=99.5%).",
                "status": "within_specification",
            }
        ],
        "investigation_gaps": [],
    }

    result = assess_cause_evidence_matrix_node(state)
    matrix = result["matrix"]
    assert len(matrix) == 1
    item = matrix[0]

    assert "ev-solv-01" in item["contradicting_evidence_ids"]
    assert item["ai_status"] == "not_supported"
    assert "Contradicted" in item["alignment_details"]


def test_ai_cannot_set_reviewer_confirmed_status():
    """GxP Safety Rule: ensure that LangGraph AI cannot set review_status to confirmed."""
    state = {
        "investigation_id": "inv-eval-03",
        "incident_fields": {"equipment_id": "TEMP-SENSOR-014"},
        "cause_candidates": [
            {
                "id": "cand-03",
                "candidate_text": "Sensor drift hypothesis",
                "review_status": "pending",
            }
        ],
        "evidence_records": [],
        "investigation_gaps": [],
    }

    result = assess_cause_evidence_matrix_node(state)
    for m in result["matrix"]:
        assert m["review_status"] == "pending"
        assert m["review_status"] != "confirmed"


def test_cause_assessment_api_evaluate_and_get(client, test_db):
    """Test POST .../assessment/evaluate and GET .../assessment/matrix endpoints."""
    inv = Investigation(
        id="inv-assess-01",
        reference_code="RCA-2026-001",
        title="Test Investigation",
        equipment_id="TEMP-SENSOR-014",
    )
    test_db.add(inv)

    ev = EvidenceRecord(
        id="ev-cal-088",
        investigation_id="inv-assess-01",
        evidence_type="calibration_certificate",
        title="TEMP-SENSOR-014 Metrology Certificate",
        description="Observed Error +0.8°C exceeding tolerance. Out of tolerance.",
        source_excerpt="Error: +0.8°C (Tolerance ±0.5°C)",
        status="out_of_tolerance",
    )
    test_db.add(ev)

    cand = CauseCandidate(
        id="cand-drift-01",
        investigation_id="inv-assess-01",
        method="five_whys",
        category="machine",
        candidate_text="Temperature sensor TEMP-SENSOR-014 calibration drift.",
        rationale="Thermal deviation during crystallization.",
        ai_status="hypothesis",
        review_status="pending",
        supporting_evidence_ids=[],
        contradicting_evidence_ids=[],
    )
    test_db.add(cand)
    test_db.commit()

    # Call evaluate endpoint
    res = client.post("/api/investigations/inv-assess-01/assessment/evaluate")
    assert res.status_code == 200
    data = res.json()
    assert data["investigation_id"] == "inv-assess-01"
    assert len(data["matrix"]) >= 1

    item = next(m for m in data["matrix"] if m["cause_id"] == "cand-drift-01")
    assert item["ai_status"] == "evidence_supported_pending_review"
    assert item["review_status"] == "pending"
    assert len(item["supporting_evidence"]) >= 1
    assert item["supporting_evidence"][0]["id"] == "ev-cal-088"

    # Call GET matrix endpoint
    get_res = client.get("/api/investigations/inv-assess-01/assessment/matrix")
    assert get_res.status_code == 200
    get_data = get_res.json()
    assert len(get_data["matrix"]) == len(data["matrix"])


def test_mandatory_reviewer_note_on_confirm(client, test_db):
    """GxP Rule: Verify that attempting to confirm or reject without a note raises 422."""
    inv = Investigation(
        id="inv-assess-02",
        reference_code="RCA-2026-002",
        title="Test Investigation 2",
    )
    test_db.add(inv)

    cand = CauseCandidate(
        id="cand-02",
        investigation_id="inv-assess-02",
        candidate_text="Sample cause candidate",
        rationale="Sample rationale",
        review_status="pending",
        supporting_evidence_ids=[],
        contradicting_evidence_ids=[],
    )
    test_db.add(cand)
    test_db.commit()

    # Attempt to confirm with missing reviewer note -> should be rejected with 422
    fail_res = client.patch(
        "/api/investigations/inv-assess-02/causes/cand-02",
        json={"review_status": "confirmed", "reviewer_note": ""},
    )
    assert fail_res.status_code == 422

    # Attempt to confirm with valid reviewer note -> should succeed with 200
    ok_res = client.patch(
        "/api/investigations/inv-assess-02/causes/cand-02",
        json={
            "review_status": "confirmed",
            "reviewer_note": "Confirmed by QA Investigator following batch temperature audit.",
        },
    )
    assert ok_res.status_code == 200
    assert ok_res.json()["review_status"] == "confirmed"
