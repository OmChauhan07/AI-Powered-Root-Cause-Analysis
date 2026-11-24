import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.database.base import Base
from app.database.session import get_db
from app.main import app
from app.models.investigation import Investigation


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


def test_copilot_general_question(client, test_db):
    """General pharmaceutical questions should receive natural conversational answers without modifying incident fields."""
    inv = Investigation(
        id="inv-copilot-1",
        reference_code="RCA-2026-001",
        title="Test Deviation",
        product_name="API-X",
        batch_number="BATCH-2026-014",
    )
    test_db.add(inv)
    test_db.commit()

    payload = {
        "message": "Why is temperature sensor calibration critical during crystallization?",
        "conversation_history": [],
    }
    resp = client.post("/api/investigations/inv-copilot-1/copilot/chat", json=payload)
    assert resp.status_code == 200
    data = resp.json()

    assert "reply" in data
    assert len(data["reply"]) > 20
    assert data["field_updates"] is None or len(data["field_updates"]) == 0


def test_copilot_extract_new_incident_info(client, test_db):
    """Supplying new batch and equipment info conversationally should update the live database and return field_updates."""
    inv = Investigation(
        id="inv-copilot-2",
        reference_code="RCA-2026-002",
        title="Deviation Intake",
        product_name="Pending",
    )
    test_db.add(inv)
    test_db.commit()

    payload = {
        "message": "We observed a purity deviation in batch BATCH-2026-099 with product API-X on equipment TEMP-SENSOR-099. Observed result was 97.8%.",
        "conversation_history": [],
    }
    resp = client.post("/api/investigations/inv-copilot-2/copilot/chat", json=payload)
    assert resp.status_code == 200
    data = resp.json()

    assert "reply" in data
    assert data["field_updates"] is not None
    assert "BATCH-2026-099" in str(data["field_updates"].get("batch_number"))

    # Verify DB update
    test_db.refresh(inv)
    assert inv.batch_number == "BATCH-2026-099"


def test_copilot_request_five_whys(client, test_db):
    """Asking for 5 Whys analysis should invoke the 5 Whys node and return a structured causal path."""
    inv = Investigation(
        id="inv-copilot-3",
        reference_code="RCA-2026-003",
        title="Purity OOS",
        product_name="API-X",
        batch_number="BATCH-2026-014",
        equipment_id="TEMP-SENSOR-014",
        observed_result="98.1%",
        problem_statement="Out of specification purity observed during release testing.",
    )
    test_db.add(inv)
    test_db.commit()

    payload = {
        "message": "Run the 5 Whys analysis on this deviation.",
        "conversation_history": [],
    }
    resp = client.post("/api/investigations/inv-copilot-3/copilot/chat", json=payload)
    assert resp.status_code == 200
    data = resp.json()

    assert "reply" in data
    assert data["five_whys_chain"] is not None
    assert len(data["five_whys_chain"]) >= 3
    # Check that root cause is highlighted in the chain
    has_root_cause = any(step.get("is_root_cause") for step in data["five_whys_chain"])
    assert has_root_cause is True


def test_copilot_request_capa_suggestions(client, test_db):
    """Asking for CAPA actions should return containment, corrective, and preventive measures."""
    inv = Investigation(
        id="inv-copilot-4",
        reference_code="RCA-2026-004",
        title="Purity OOS",
        product_name="API-X",
        batch_number="BATCH-2026-014",
        equipment_id="TEMP-SENSOR-014",
    )
    test_db.add(inv)
    test_db.commit()

    payload = {
        "message": "Suggest corrective and preventive actions for the identified temperature drift.",
        "conversation_history": [],
    }
    resp = client.post("/api/investigations/inv-copilot-4/copilot/chat", json=payload)
    assert resp.status_code == 200
    data = resp.json()

    assert "reply" in data
    assert data["capa_actions"] is not None
    assert len(data["capa_actions"]) >= 2
    categories = [a.get("category") for a in data["capa_actions"]]
    assert "corrective" in categories or "preventive" in categories or "containment" in categories


def test_copilot_request_evidence_gaps(client, test_db):
    """Asking which evidence or documents are missing should return evidence gaps."""
    inv = Investigation(
        id="inv-copilot-5",
        reference_code="RCA-2026-005",
        title="Purity OOS",
        product_name="API-X",
        batch_number="BATCH-2026-014",
    )
    test_db.add(inv)
    test_db.commit()

    payload = {
        "message": "Which information is still missing from the investigation?",
        "conversation_history": [],
    }
    resp = client.post("/api/investigations/inv-copilot-5/copilot/chat", json=payload)
    assert resp.status_code == 200
    data = resp.json()

    assert "reply" in data
    assert data["missing_gaps"] is not None
    assert len(data["missing_gaps"]) >= 1


def test_copilot_request_summary(client, test_db):
    """Asking to summarize the current investigation should return an organized summary."""
    inv = Investigation(
        id="inv-copilot-6",
        reference_code="RCA-2026-006",
        title="Purity OOS",
        product_name="API-X",
        batch_number="BATCH-2026-014",
        severity="high",
        observed_result="98.1%",
    )
    test_db.add(inv)
    test_db.commit()

    payload = {
        "message": "Summarize the current investigation status.",
        "conversation_history": [],
    }
    resp = client.post("/api/investigations/inv-copilot-6/copilot/chat", json=payload)
    assert resp.status_code == 200
    data = resp.json()

    assert "reply" in data
    assert "BATCH-2026-014" in data["reply"] or "API-X" in data["reply"]
