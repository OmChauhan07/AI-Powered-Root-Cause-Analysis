import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from app.database.base import Base
from app.models.investigation import Investigation, SourceDocument


@pytest.fixture
def in_memory_db():
    """Provides an isolated SQLite in-memory session for model validation."""
    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(bind=engine)
    Session = sessionmaker(bind=engine)
    session = Session()
    yield session
    session.close()


def test_investigation_model_creation(in_memory_db):
    """Verifies that an Investigation record can be persisted and queried."""
    inv = Investigation(
        reference_code="RCA-TEST-001",
        title="Test Incident Investigation",
        product_name="API-X",
        batch_number="BATCH-2026-014",
        status="draft",
        severity="high",
        problem_statement="Test purity out of spec",
    )
    in_memory_db.add(inv)
    in_memory_db.commit()

    retrieved = in_memory_db.query(Investigation).filter_by(reference_code="RCA-TEST-001").first()
    assert retrieved is not None
    assert retrieved.product_name == "API-X"
    assert retrieved.batch_number == "BATCH-2026-014"
    assert retrieved.status == "draft"
    assert retrieved.id is not None


def test_source_document_cascade_relationship(in_memory_db):
    """Verifies that SourceDocument links to Investigation with cascade support."""
    inv = Investigation(
        reference_code="RCA-TEST-002",
        title="Cascade Test",
    )
    doc = SourceDocument(
        investigation=inv,
        source_type="pdf",
        original_filename="incident_report.pdf",
        parse_status="processed",
        page_count=3,
        extracted_text="Sample extracted text",
    )
    in_memory_db.add(inv)
    in_memory_db.commit()

    retrieved_inv = in_memory_db.query(Investigation).filter_by(reference_code="RCA-TEST-002").first()
    assert len(retrieved_inv.documents) == 1
    assert retrieved_inv.documents[0].original_filename == "incident_report.pdf"
