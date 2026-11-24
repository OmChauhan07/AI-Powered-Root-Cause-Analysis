from datetime import datetime, timezone
from typing import List, Dict, Any, Optional
from pydantic import BaseModel, Field, ConfigDict


class NormalizedPage(BaseModel):
    """Normalized content and reference for a single document page."""
    model_config = ConfigDict(from_attributes=True)

    page_number: int
    text: str
    char_count: int


class NormalizedSource(BaseModel):
    """Common normalized source representation across PDF, pasted text, and email."""
    model_config = ConfigDict(from_attributes=True)

    source_id: str
    source_type: str  # 'pdf', 'pasted_text', 'email', 'eml'
    filename: Optional[str] = None
    content_text: str
    pages: List[NormalizedPage] = Field(default_factory=list)
    metadata: Dict[str, Any] = Field(default_factory=dict)
    total_pages: int = 1
    char_count: int = 0
    parse_status: str = "processed"  # 'processed', 'partial', 'failed', 'empty'
    warnings: List[str] = Field(default_factory=list)


class TextIntakeRequest(BaseModel):
    """Payload to ingest pasted text content."""
    content: str = Field(..., min_length=5, description="Pasted incident text narrative or log")
    title: Optional[str] = Field(default="Pasted Incident Narrative", description="Optional title label")


class EmailIntakeRequest(BaseModel):
    """Payload to ingest structured email communication records."""
    subject: str = Field(..., min_length=2, description="Email subject line")
    body: str = Field(..., min_length=5, description="Email body text")
    sender: Optional[str] = Field(default=None, description="Sender address or department")
    received_at: Optional[str] = Field(default=None, description="Received timestamp if known")


class DocumentUploadResponse(BaseModel):
    """API response returned after document ingestion and normalization."""
    model_config = ConfigDict(from_attributes=True)

    document_id: str
    investigation_id: str
    source_type: str
    filename: str
    page_count: int
    char_count: int
    parse_status: str
    preview: str
    warnings: List[str] = Field(default_factory=list)
    created_at: str
