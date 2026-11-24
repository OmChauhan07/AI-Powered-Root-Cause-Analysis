import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.database.base import Base
from app.database.session import get_db
from app.main import app
from app.ai.workflow import build_evidence_gap_graph
from app.ai.nodes import analyze_evidence_and_gaps_node


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


SAMPLE_CALIBRATION_CERTIFICATE = """
METROLOGY CALIBRATION CERTIFICATE
Certificate Number: CAL-2026-088
Equipment ID: TEMP-SENSOR-014
Calibration Date: 2026-11-22
Due Date: 2027-11-22
Tolerance Limit: ±0.5°C
Observed Error: +0.8°C
As-Found Result: 25.8°C at 25.0°C reference
As-Left Result: 25.0°C after thermal realignment
Status: Out of Tolerance
Metrology Technician: J. Doe
"""

SAMPLE_SHIFT_NOTE_NO_CAL = """
OPERATOR SHIFT NOTE:
Batch BATCH-2026-014 of API-X observed lower purity 98.1%.
Reactor crystallization was completed at 08:30 on 2026-11-20.
No instruments were tested today.
"""

SAMPLE_DOC_CONFLICT_A = """
BATCH SHEET 1:
Batch BATCH-2026-014 charged into Reactor CRYST-REACTOR-02 using temperature sensor TEMP-SENSOR-014.
"""

SAMPLE_DOC_CONFLICT_B = """
SHIFT HANDOVER NOTE:
Batch BATCH-2026-014 recorded on secondary temperature sensor TEMP-SENSOR-012 port B.
"""


def test_evidence_gap_graph_compilation():
    """Verifies that the evidence gap workflow graph compiles."""
    graph = build_evidence_gap_graph()
    assert graph is not None
    assert hasattr(graph, "invoke")


def test_calibration_extraction_with_error_and_tolerance():
    """Verifies that calibration certificates are parsed into structured evidence records."""
    state = {
        "investigation_id": "inv-cal-01",
        "incident_fields": {"incident_date": "2026-11-20T08:30:00Z"},
        "normalized_sources": [
            {
                "id": "doc-cal-01",
                "filename": "calibration_cert.txt",
                "pages": [{"page_number": 1, "text": SAMPLE_CALIBRATION_CERTIFICATE}],
            }
        ],
    }

    result = analyze_evidence_and_gaps_node(state)
    assert result["workflow_status"] == "evidence_ready"
    records = result["evidence_records"]
    assert len(records) >= 1

    cal_rec = next(r for r in records if r["evidence_type"] == "calibration")
    payload = cal_rec["structured_payload"]
    assert payload["equipment_code"] == "TEMP-SENSOR-014"
    assert payload["certificate_number"] == "CAL-2026-088"
    assert payload["tolerance_limit"] == "±0.5°C"
    assert payload["observed_error"] == "+0.8°C"
    assert "2026-11-22" in payload["calibration_date"]


def test_missing_calibration_record_rule():
    """Verifies that missing calibration records are flagged as 'not_provided', NOT as 'failed'."""
    state = {
        "investigation_id": "inv-no-cal",
        "incident_fields": {"incident_date": "2026-11-20T08:30:00Z"},
        "normalized_sources": [
            {
                "id": "doc-note-01",
                "filename": "shift_note.txt",
                "pages": [{"page_number": 1, "text": SAMPLE_SHIFT_NOTE_NO_CAL}],
            }
        ],
    }

    result = analyze_evidence_and_gaps_node(state)
    gaps = result["missing_information"]
    cal_gap = next((g for g in gaps if g["field_or_record"] == "calibration_certificate"), None)
    assert cal_gap is not None
    assert cal_gap["status"] == "not_provided"
    assert "not failed" in cal_gap["impact_rationale"].lower() or "not_provided" in cal_gap["impact_rationale"].lower()


def test_post_incident_timeline_anomaly():
    """Verifies detection when calibration or evidence is dated after the incident occurred."""
    state = {
        "investigation_id": "inv-anomaly-01",
        "incident_fields": {"incident_date": "2026-11-20T08:30:00Z"},
        "normalized_sources": [
            {
                "id": "doc-post-cal",
                "filename": "cal_post_incident.txt",
                "pages": [{"page_number": 1, "text": SAMPLE_CALIBRATION_CERTIFICATE}],  # Dated 2026-11-22
            }
        ],
    }

    result = analyze_evidence_and_gaps_node(state)
    anomalies = result["timeline_anomalies"]
    assert len(anomalies) > 0
    anomaly = anomalies[0]
    assert "2026-11-22" in anomaly["event_date"]
    assert "2026-11-20" in anomaly["incident_date"]
    assert "post-incident" in anomaly["discrepancy_explanation"].lower()


def test_cross_document_conflict_detection():
    """Verifies that contradictory equipment IDs across documents are flagged as conflicts."""
    state = {
        "investigation_id": "inv-conflict-01",
        "incident_fields": {},
        "normalized_sources": [
            {
                "id": "doc-a",
                "filename": "batch_sheet_1.txt",
                "pages": [{"page_number": 1, "text": SAMPLE_DOC_CONFLICT_A}],  # TEMP-SENSOR-014
            },
            {
                "id": "doc-b",
                "filename": "shift_handover.txt",
                "pages": [{"page_number": 1, "text": SAMPLE_DOC_CONFLICT_B}],  # TEMP-SENSOR-012
            },
        ],
    }

    result = analyze_evidence_and_gaps_node(state)
    conflicts = result["conflicting_information"]
    assert len(conflicts) > 0
    assert conflicts[0]["conflict_type"] == "equipment_id_mismatch"
    assert "TEMP-SENSOR-014" in conflicts[0]["description"]
    assert "TEMP-SENSOR-012" in conflicts[0]["description"]


def test_evidence_api_analyze_and_get(client):
    """Integration test for POST .../evidence/analyze and GET .../evidence."""
    inv_id = "test-inv-evidence-api"

    # 1. Ingest calibration certificate text
    client.post(
        f"/api/investigations/{inv_id}/documents/text",
        json={"title": "Metrology Cert", "content": SAMPLE_CALIBRATION_CERTIFICATE},
    )

    # 2. Trigger evidence analysis
    analyze_res = client.post(f"/api/investigations/{inv_id}/evidence/analyze")
    assert analyze_res.status_code == 200
    data = analyze_res.json()

    assert data["investigation_id"] == inv_id
    assert len(data["evidence_records"]) >= 1
    assert any(e["evidence_type"] == "calibration" for e in data["evidence_records"])
    assert len(data["gaps"]) > 0

    # 3. Retrieve stored evidence
    get_res = client.get(f"/api/investigations/{inv_id}/evidence")
    assert get_res.status_code == 200
    get_data = get_res.json()
    assert len(get_data["evidence_records"]) >= 1

    # 4. Resolve a gap
    gap_id = get_data["gaps"][0]["id"]
    resolve_res = client.patch(f"/api/investigations/{inv_id}/gaps/{gap_id}/resolve")
    assert resolve_res.status_code == 200
    assert resolve_res.json()["status"] == "resolved"
