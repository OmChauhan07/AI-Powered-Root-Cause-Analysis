import uuid
from datetime import datetime, timezone
from sqlalchemy import Column, String, Text, DateTime, JSON, Integer, ForeignKey
from sqlalchemy.orm import relationship
from app.database.base import Base


def generate_uuid() -> str:
    """Generate string representation of UUID4."""
    return str(uuid.uuid4())


class Investigation(Base):
    """SQLAlchemy model for top-level pharmaceutical RCA investigations."""

    __tablename__ = "investigations"

    id = Column(String(36), primary_key=True, default=generate_uuid, index=True)
    reference_code = Column(String(50), unique=True, index=True, nullable=False)
    title = Column(String(255), nullable=False)

    # Incident identification fields
    product_name = Column(String(200), nullable=True)
    product_code = Column(String(100), nullable=True)
    batch_number = Column(String(100), index=True, nullable=True)
    manufacturing_stage = Column(String(200), nullable=True)
    incident_at = Column(DateTime(timezone=True), nullable=True)

    # Observed failure & telemetry
    problem_statement = Column(Text, nullable=True)
    expected_result = Column(JSON, nullable=True)
    observed_result = Column(JSON, nullable=True)
    immediate_action = Column(Text, nullable=True)
    equipment_id = Column(String(100), nullable=True)

    # Workflow status: 'draft', 'pending_review', 'reviewed', 'confirmed', 'closed'
    status = Column(String(50), default="draft", nullable=False)
    severity = Column(String(20), default="medium", nullable=False)

    # Timestamps
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False)
    updated_at = Column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
        nullable=False,
    )

    # Relationships
    documents = relationship("SourceDocument", back_populates="investigation", cascade="all, delete-orphan")
    extracted_facts = relationship("ExtractedFact", back_populates="investigation", cascade="all, delete-orphan")
    evidence_records = relationship("EvidenceRecord", back_populates="investigation", cascade="all, delete-orphan")
    gaps = relationship("InvestigationGap", back_populates="investigation", cascade="all, delete-orphan")


class SourceDocument(Base):
    """Uploaded, pasted, or email evidence document record."""

    __tablename__ = "source_documents"

    id = Column(String(36), primary_key=True, default=generate_uuid, index=True)
    investigation_id = Column(String(36), ForeignKey("investigations.id", ondelete="CASCADE"), nullable=False, index=True)

    source_type = Column(String(50), nullable=False)  # 'pdf', 'pasted_text', 'email', 'eml'
    original_filename = Column(String(255), nullable=True)
    storage_key = Column(String(255), nullable=True)
    content_sha256 = Column(String(64), nullable=True)
    mime_type = Column(String(100), nullable=True)
    page_count = Column(Integer, default=1, nullable=False)
    parse_status = Column(String(50), default="pending", nullable=False)  # 'pending', 'processed', 'failed'
    extracted_text = Column(Text, nullable=True)

    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False)

    # Relationships
    investigation = relationship("Investigation", back_populates="documents")
    extracted_facts = relationship("ExtractedFact", back_populates="source_document")


class ExtractedFact(Base):
    """Granular fact extracted by AI with exact document citation and review state."""

    __tablename__ = "extracted_facts"

    id = Column(String(36), primary_key=True, default=generate_uuid, index=True)
    investigation_id = Column(String(36), ForeignKey("investigations.id", ondelete="CASCADE"), nullable=False, index=True)
    source_document_id = Column(String(36), ForeignKey("source_documents.id", ondelete="SET NULL"), nullable=True, index=True)

    field_name = Column(String(100), nullable=False, index=True)
    field_value = Column(JSON, nullable=True)
    source_page = Column(Integer, nullable=True)
    source_excerpt = Column(Text, nullable=True)
    confidence = Column(Integer, default=100, nullable=False)  # stored as 0-100 integer for simplicity or float
    extraction_status = Column(String(50), default="extracted", nullable=False)  # 'extracted', 'unclear', 'not_provided'
    review_status = Column(String(50), default="pending", nullable=False)  # 'pending', 'accepted', 'edited', 'rejected'

    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False)

    # Relationships
    investigation = relationship("Investigation", back_populates="extracted_facts")
    source_document = relationship("SourceDocument", back_populates="extracted_facts")


class EvidenceRecord(Base):
    """Structured piece of technical or quality evidence associated with an investigation."""

    __tablename__ = "evidence_records"

    id = Column(String(36), primary_key=True, default=generate_uuid, index=True)
    investigation_id = Column(String(36), ForeignKey("investigations.id", ondelete="CASCADE"), nullable=False, index=True)
    source_document_id = Column(String(36), ForeignKey("source_documents.id", ondelete="SET NULL"), nullable=True, index=True)

    evidence_type = Column(String(50), nullable=False)  # 'calibration', 'batch_record', 'maintenance_log', 'lab_result', 'operator_log', 'standard_sop'
    title = Column(String(255), nullable=False)
    description = Column(Text, nullable=False)
    evidence_date = Column(DateTime(timezone=True), nullable=True)
    source_page = Column(Integer, nullable=True)
    source_excerpt = Column(Text, nullable=True)
    status = Column(String(50), default="available", nullable=False)  # 'available', 'not_provided', 'unclear', 'conflicting', 'not_applicable'
    structured_payload = Column(JSON, nullable=True)

    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False)

    # Relationships
    investigation = relationship("Investigation", back_populates="evidence_records")
    source_document = relationship("SourceDocument")


class InvestigationGap(Base):
    """Identified evidence gap, missing record, timeline anomaly, or contradiction."""

    __tablename__ = "investigation_gaps"

    id = Column(String(36), primary_key=True, default=generate_uuid, index=True)
    investigation_id = Column(String(36), ForeignKey("investigations.id", ondelete="CASCADE"), nullable=False, index=True)

    gap_type = Column(String(50), nullable=False)  # 'missing_record', 'conflicting_data', 'timeline_anomaly', 'unclear_evidence'
    field_or_record = Column(String(100), nullable=False)
    description = Column(Text, nullable=False)
    impact_rationale = Column(Text, nullable=False)
    status = Column(String(50), default="not_provided", nullable=False)  # 'not_provided', 'unclear', 'conflicting', 'resolved'
    recommended_action = Column(Text, nullable=True)
    importance = Column(String(20), default="high", nullable=False)  # 'critical', 'high', 'medium', 'low'

    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False)

    # Relationships
    investigation = relationship("Investigation", back_populates="gaps")


