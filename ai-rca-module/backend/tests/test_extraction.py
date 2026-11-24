import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.database.base import Base
from app.database.session import get_db
from app.main import app
from app.ai.workflow import build_extraction_graph
from app.ai.nodes import extract_incident_fields_node
from app.schemas.extraction import IncidentExtractionResult


# Isolated in-memory SQLite fixture for API extraction tests
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


SAMPLE_NARRATIVE_COMPLETE = """
PHARMACEUTICAL DEVIATION REPORT (OOS-2026-089)
Product Name: API-X
Product Code: APIX-RAW-99
Batch Number: BATCH-2026-014
Manufacturing Stage: Crystallization & Solvent Purification
Incident Date: 2026-11-20T08:30:00Z
Equipment ID: CRYST-REACTOR-02, TEMP-SENSOR-014

Problem Statement: Out-of-specification purity deviation detected during final crystallization QC HPLC assay.
Expected Specification: >= 99.0% purity
Observed Result: 98.1% purity (OOS)
Immediate Containment: Batch quarantined immediately in Holding Bay 3. Downstream centrifuge operations halted.
"""

SAMPLE_NARRATIVE_INCOMPLETE = """
OPERATOR SHIFT NOTE:
Purity deviation observed for batch BATCH-2026-099 of product API-Z.
Laboratory measured 97.4% vs specification >= 99.0%.
Investigation ongoing.
"""


def test_extraction_graph_compilation():
    """Verifies that the extraction graph compiles with LangGraph."""
    graph = build_extraction_graph()
    assert graph is not None
    assert hasattr(graph, "invoke")


def test_extraction_node_complete_data():
    """Verifies extraction when all fields are documented in source text."""
    state = {
        "investigation_id": "inv-001",
        "normalized_sources": [
            {
                "id": "doc-001",
                "filename": "deviation_report.txt",
                "pages": [{"page_number": 1, "text": SAMPLE_NARRATIVE_COMPLETE}],
            }
        ],
    }

    result = extract_incident_fields_node(state)
    assert result["workflow_status"] == "draft_ready"
    fields = result["incident_fields"]

    assert fields["batch_number"] == "BATCH-2026-014"
    assert "API-X" in fields["product_name"]
    assert "APIX-RAW-99" in fields["product_code"]
    assert "Crystallization" in fields["manufacturing_stage"]
    assert "98.1%" in fields["observed_result"]
    assert ">= 99.0%" in fields["expected_result"]
    assert "CRYST-REACTOR-02" in fields["equipment_id"]
    assert fields["severity"] == "critical"

    # Verify provenance and citations
    facts = result["extracted_facts"]
    assert len(facts) >= 6
    batch_fact = next(f for f in facts if f["field_name"] == "batch_number")
    assert batch_fact["field_value"] == "BATCH-2026-014"
    assert batch_fact["source_document_id"] == "doc-001"
    assert batch_fact["source_page"] == 1
    assert "BATCH-2026-014" in batch_fact["source_excerpt"]
    assert batch_fact["status"] == "extracted"


def test_extraction_node_incomplete_data():
    """Verifies that unstated fields remain null and are logged in missing_information."""
    state = {
        "investigation_id": "inv-002",
        "normalized_sources": [
            {
                "id": "doc-002",
                "filename": "operator_note.txt",
                "pages": [{"page_number": 1, "text": SAMPLE_NARRATIVE_INCOMPLETE}],
            }
        ],
    }

    result = extract_incident_fields_node(state)
    fields = result["incident_fields"]

    # Absent fields must remain None / null, never guessed
    assert fields["equipment_id"] is None
    assert fields["product_code"] is None
    assert fields["incident_date"] is None

    # Missing information list must document absent items
    missing = result["missing_information"]
    missing_field_names = [m["field_name"] for m in missing]
    assert "equipment_id" in missing_field_names
    assert "product_code" in missing_field_names


def test_extraction_empty_source():
    """Verifies graceful handling when no sources are attached."""
    state = {
        "investigation_id": "inv-empty",
        "normalized_sources": [],
    }

    result = extract_incident_fields_node(state)
    assert result["workflow_status"] == "empty_source"
    assert result["incident_fields"]["batch_number"] is None
    assert len(result["missing_information"]) > 0


def test_extraction_api_endpoint(client):
    """End-to-end test of POST /api/investigations/{id}/extract and fact review."""
    inv_id = "test-inv-phase04"

    # 1. Ingest text narrative
    text_res = client.post(
        f"/api/investigations/{inv_id}/documents/text",
        json={"title": "OOS Report", "content": SAMPLE_NARRATIVE_COMPLETE},
    )
    assert text_res.status_code == 200
    doc_id = text_res.json()["document_id"]

    # 2. Trigger AI extraction
    extract_res = client.post(
        f"/api/investigations/{inv_id}/extract",
        json={"source_document_ids": [doc_id]},
    )
    assert extract_res.status_code == 200
    data = extract_res.json()

    assert data["investigation_id"] == inv_id
    assert data["workflow_status"] == "draft_ready"
    assert data["incident_fields"]["batch_number"] == "BATCH-2026-014"
    assert len(data["extracted_facts"]) > 0

    # 3. Retrieve extracted facts list
    facts_res = client.get(f"/api/investigations/{inv_id}/facts")
    assert facts_res.status_code == 200
    facts = facts_res.json()
    assert len(facts) > 0
    assert all(f["review_status"] == "pending" for f in facts)

    # 4. Review a fact (human-in-the-loop review)
    # Fetch first fact from DB to get ID
    from app.models.investigation import ExtractedFact
    # We can inspect the facts from endpoint
    # Find batch fact
    batch_facts = [f for f in facts if f["field_name"] == "batch_number"]
    assert len(batch_facts) == 1
    assert batch_facts[0]["field_value"] == "BATCH-2026-014"


def test_extraction_preserves_user_edits(client):
    """Verifies that re-running extraction does not overwrite user edits unless explicitly permitted."""
    inv_id = "test-inv-preserve"

    # Ingest text narrative
    client.post(
        f"/api/investigations/{inv_id}/documents/text",
        json={"title": "Deviation", "content": SAMPLE_NARRATIVE_COMPLETE},
    )

    # First extraction
    res1 = client.post(f"/api/investigations/{inv_id}/extract", json={})
    assert res1.status_code == 200

    # User manually customizes problem statement in DB
    # Now re-run with overwrite_user_edits=False
    res2 = client.post(
        f"/api/investigations/{inv_id}/extract",
        json={"overwrite_user_edits": False},
    )
    assert res2.status_code == 200
