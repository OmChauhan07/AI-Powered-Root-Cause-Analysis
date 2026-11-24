import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.database.base import Base
from app.database.session import get_db
from app.main import app
from app.models.investigation import (
    Investigation,
    SourceDocument,
    EvidenceRecord,
    InvestigationGap,
    CauseCandidate,
    CapaAction,
)


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


def test_update_investigation_fields(client, test_db):
    """Verify PATCH /api/investigations/{id} updates incident fields in database."""
    inv = Investigation(
        id="inv-persist-01",
        reference_code="RCA-2026-PERSIST",
        title="Initial Investigation Title",
        product_name="Old Product",
        batch_number="OLD-BATCH-001",
        problem_statement="Initial observed issue",
        severity="medium",
        status="draft",
    )
    test_db.add(inv)
    test_db.commit()

    payload = {
        "product_name": "API-X (Active Pharmaceutical Ingredient)",
        "batch_number": "BATCH-2026-014",
        "problem_statement": "Assay purity 98.1% below 99.0% specification limit.",
        "manufacturing_stage": "Crystallization",
        "severity": "critical",
    }

    response = client.patch("/api/investigations/inv-persist-01", json=payload)
    assert response.status_code == 200
    data = response.json()
    assert data["product_name"] == "API-X (Active Pharmaceutical Ingredient)"
    assert data["batch_number"] == "BATCH-2026-014"
    assert data["severity"] == "critical"

    # Verify directly in database
    refreshed = test_db.query(Investigation).filter(Investigation.id == "inv-persist-01").first()
    assert refreshed.product_name == "API-X (Active Pharmaceutical Ingredient)"
    assert refreshed.severity == "critical"


def test_save_investigation_dossier_reviewed(client, test_db):
    """Verify POST /api/investigations/{id}/save persists reviewer sign-off without auto-closing."""
    inv = Investigation(
        id="inv-persist-02",
        reference_code="RCA-2026-PERSIST-02",
        title="API-X Investigation",
        status="in_progress",
    )
    test_db.add(inv)

    # Add child records
    doc = SourceDocument(
        id="doc-persist-01",
        investigation_id="inv-persist-02",
        original_filename="calibration_record.pdf",
        source_type="pdf",
        parse_status="processed",
    )
    cause = CauseCandidate(
        id="cause-persist-01",
        investigation_id="inv-persist-02",
        candidate_text="Temperature sensor drift during crystallization",
        rationale="Sensor reading was skewed by +0.8C causing temperature drift.",
        review_status="confirmed",
        reviewer_note="Calibration drift confirmed via QA log",
    )
    capa = CapaAction(
        id="capa-persist-01",
        investigation_id="inv-persist-02",
        action_type="corrective",
        title="Sensor recalibration",
        action_text="Recalibrate temperature sensor",
        rationale="Restore sensor measurement accuracy within +/- 0.5C.",
        review_status="accepted",
    )
    test_db.add_all([doc, cause, capa])
    test_db.commit()

    save_payload = {
        "reviewer_note": "Concur with root cause identification. Calibration log confirms +0.8C drift. CAPA accepted.",
        "status": "reviewed",
        "reviewer_name": "Dr. Eleanor Vance",
        "reviewer_role": "Quality Assurance Lead",
    }

    response = client.post("/api/investigations/inv-persist-02/save", json=save_payload)
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "reviewed"
    assert "Dr. Eleanor Vance" in data["summary"]["reviewer_name"]
    assert data["summary"]["confirmed_root_causes"] == 1
    assert data["summary"]["accepted_capa_actions"] == 1

    # Verify status in DB
    refreshed = test_db.query(Investigation).filter(Investigation.id == "inv-persist-02").first()
    assert refreshed.status == "reviewed"
    assert refreshed.reviewer_note == save_payload["reviewer_note"]
    # Ensure it did NOT close automatically
    assert refreshed.status != "closed"


def test_save_investigation_requires_reviewer_note(client, test_db):
    """Verify GxP constraint: saving sign-off requires reviewer note."""
    inv = Investigation(
        id="inv-persist-03",
        reference_code="RCA-2026-PERSIST-03",
        title="API-X Investigation",
        status="in_progress",
    )
    test_db.add(inv)
    test_db.commit()

    invalid_payload = {
        "reviewer_note": "",  # Empty note
        "status": "reviewed",
    }
    response = client.post("/api/investigations/inv-persist-03/save", json=invalid_payload)
    assert response.status_code == 422


def test_get_complete_investigation_dossier_reload(client, test_db):
    """Verify GET /api/investigations/{id} reloads full dossier with all child entities."""
    inv = Investigation(
        id="inv-persist-04",
        reference_code="RCA-2026-PERSIST-04",
        title="Complete API-X Dossier",
        product_name="API-X",
        batch_number="BATCH-2026-014",
        problem_statement="Out of specification purity",
        status="reviewed",
        reviewer_note="Formal review complete.",
        rca_method_data={
            "five_whys_chains": [
                {"step": 1, "why": "Why purity low?", "because": "Excess isomer impurity formed"}
            ],
            "fishbone_categories": {
                "machine": [{"cause": "Sensor calibration offset", "detail": "+0.8C error"}]
            },
        },
    )
    test_db.add(inv)

    doc = SourceDocument(
        id="doc-dossier-01",
        investigation_id="inv-persist-04",
        original_filename="deviations_log.pdf",
        source_type="pdf",
        parse_status="processed",
    )
    ev = EvidenceRecord(
        id="ev-dossier-01",
        investigation_id="inv-persist-04",
        source_document_id="doc-dossier-01",
        evidence_type="calibration",
        title="Sensor Calibration Certificate",
        description="Sensor +0.8C error",
        status="accepted",
    )
    gap = InvestigationGap(
        id="gap-dossier-01",
        investigation_id="inv-persist-04",
        gap_type="missing_record",
        field_or_record="Solvent batch COA",
        description="COA needed for Lot S-8821",
        impact_rationale="Solvent purity must be certified to rule out chemical contaminant.",
        status="resolved",
    )
    cause = CauseCandidate(
        id="cause-dossier-01",
        investigation_id="inv-persist-04",
        candidate_text="Temperature sensor drift during crystallization",
        rationale="Cooling jacket temp exceeded target by 0.8C.",
        review_status="confirmed",
        category="machine",
        supporting_evidence_ids=["ev-dossier-01"],
        contradicting_evidence_ids=[],
    )
    capa = CapaAction(
        id="capa-dossier-01",
        investigation_id="inv-persist-04",
        action_type="corrective",
        title="Perform immediate calibration verification",
        action_text="Perform immediate calibration verification",
        rationale="Ensure equipment operates within validated calibration limits.",
        review_status="accepted",
    )
    test_db.add_all([doc, ev, gap, cause, capa])
    test_db.commit()

    response = client.get("/api/investigations/inv-persist-04")
    assert response.status_code == 200
    data = response.json()

    assert data["id"] == "inv-persist-04"
    assert data["reference_code"] == "RCA-2026-PERSIST-04"
    assert data["status"] == "reviewed"
    assert data["reviewer_note"] == "Formal review complete."
    assert data["incident_fields"]["product_name"] == "API-X"
    assert len(data["source_documents"]) == 1
    assert data["source_documents"][0]["filename"] == "deviations_log.pdf"
    assert len(data["evidence_records"]) == 1
    assert data["evidence_records"][0]["title"] == "Sensor Calibration Certificate"
    assert len(data["investigation_gaps"]) == 1
    assert data["investigation_gaps"][0]["status"] == "resolved"
    assert len(data["five_whys_chains"]) == 1
    assert data["five_whys_chains"][0]["step"] == 1
    assert len(data["cause_candidates"]) == 1
    assert data["cause_candidates"][0]["review_status"] == "confirmed"
    assert len(data["capa_actions"]) == 1
    assert data["capa_actions"][0]["review_status"] == "accepted"
    assert data["statistics"]["confirmed_causes_count"] == 1
    assert data["statistics"]["accepted_capa_count"] == 1
