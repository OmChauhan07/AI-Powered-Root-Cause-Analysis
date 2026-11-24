import io
import pymupdf
import pytest
from fastapi.testclient import TestClient
from app.main import app
from app.database.session import get_db, SessionLocal
from app.database.base import Base
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker


from sqlalchemy.pool import StaticPool


@pytest.fixture
def client_with_db():
    """Creates TestClient with isolated in-memory SQLite database supporting multi-threading."""
    engine = create_engine(
        "sqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(bind=engine)
    TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

    def override_get_db():
        db = TestingSessionLocal()
        try:
            yield db
        finally:
            db.close()

    app.dependency_overrides[get_db] = override_get_db
    with TestClient(app) as client:
        yield client
    app.dependency_overrides.clear()


def test_create_investigation_endpoint(client_with_db):
    """POST /api/investigations creates an investigation shell."""
    response = client_with_db.post("/api/investigations?title=Batch+2026-014+Purity+OOS")
    assert response.status_code == 200
    data = response.json()
    assert "id" in data
    assert "reference_code" in data
    assert data["status"] == "draft"


def test_ingest_pasted_text_endpoint(client_with_db):
    """POST /api/investigations/{id}/documents/text ingests narrative."""
    payload = {
        "title": "Shift Logbook Excerpt",
        "content": "Operator noted cooling jacket valve delay of approximately 8 minutes.",
    }
    response = client_with_db.post("/api/investigations/inv-test-01/documents/text", json=payload)
    assert response.status_code == 200
    data = response.json()
    assert data["source_type"] == "pasted_text"
    assert data["parse_status"] == "processed"
    assert "cooling jacket" in data["preview"]


def test_ingest_email_record_endpoint(client_with_db):
    """POST /api/investigations/{id}/documents/email ingests email."""
    payload = {
        "subject": "Crystallizer Temperature Drift Alert",
        "body": "Sensor TEMP-SENSOR-014 indicates +0.8C deviation from reference thermometer.",
        "sender": "lead-engineer@pharma.invalid",
    }
    response = client_with_db.post("/api/investigations/inv-test-01/documents/email", json=payload)
    assert response.status_code == 200
    data = response.json()
    assert data["source_type"] == "email"
    assert "TEMP-SENSOR-014" in data["preview"]


def test_upload_pdf_document_endpoint(client_with_db):
    """POST /api/investigations/{id}/documents/upload extracts PDF content."""
    doc = pymupdf.open()
    page = doc.new_page()
    page.insert_text((50, 72), "Official Deviation Investigation Report - Purity Failure")
    pdf_bytes = doc.tobytes()
    doc.close()

    files = {"file": ("deviation_report.pdf", io.BytesIO(pdf_bytes), "application/pdf")}
    response = client_with_db.post("/api/investigations/inv-test-01/documents/upload", files=files)
    assert response.status_code == 200
    data = response.json()
    assert data["source_type"] == "pdf"
    assert data["filename"] == "deviation_report.pdf"
    assert data["page_count"] == 1
    assert data["parse_status"] == "processed"
    assert "Deviation Investigation" in data["preview"]


def test_upload_invalid_file_extension_rejected(client_with_db):
    """POST /api/investigations/{id}/documents/upload rejects unsafe file types."""
    files = {"file": ("malicious.exe", io.BytesIO(b"MZ..."), "application/octet-stream")}
    response = client_with_db.post("/api/investigations/inv-test-01/documents/upload", files=files)
    assert response.status_code == 400
    assert "Unsupported file type" in response.json()["detail"]


def test_list_documents_endpoint(client_with_db):
    """GET /api/investigations/{id}/documents returns all attached sources."""
    # Insert two items
    client_with_db.post(
        "/api/investigations/inv-list-01/documents/text",
        json={"title": "Note 1", "content": "Sample content text narrative 1"},
    )
    client_with_db.post(
        "/api/investigations/inv-list-01/documents/email",
        json={"subject": "Email 2", "body": "Sample email body communication 2"},
    )

    response = client_with_db.get("/api/investigations/inv-list-01/documents")
    assert response.status_code == 200
    docs = response.json()
    assert len(docs) == 2
    types = {d["source_type"] for d in docs}
    assert "pasted_text" in types
    assert "email" in types
