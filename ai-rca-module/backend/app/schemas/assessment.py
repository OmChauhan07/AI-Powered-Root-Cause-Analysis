from typing import Optional, List, Dict, Any, Literal
from pydantic import BaseModel, Field, ConfigDict


class EvidenceCorrelationItem(BaseModel):
    """Structured evidence item linked to a cause candidate."""

    id: str = Field(..., description="Evidence record UUID")
    title: str = Field(..., description="Document or certificate title")
    evidence_type: str = Field(..., description="calibration_certificate, batch_record, etc.")
    findings: str = Field(..., description="Relevant analytical findings or excerpt")
    status: Optional[str] = Field(None, description="out_of_tolerance, in_tolerance, etc.")
    document_id: Optional[str] = Field(None, description="Parent document UUID")
    document_name: Optional[str] = Field(None, description="Original filename or document title")

    model_config = ConfigDict(from_attributes=True)


class CauseEvidenceMatrixItem(BaseModel):
    """Detailed cause candidate correlated against supporting, contradicting, and missing evidence."""

    cause_id: str = Field(..., description="UUID of cause candidate")
    candidate_text: str = Field(..., description="Core cause statement")
    category: Optional[str] = Field(None, description="Fishbone 6M category")
    rationale: str = Field(..., description="AI or investigative justification")
    ai_status: Literal["hypothesis", "needs_evidence", "evidence_supported_pending_review", "not_supported"] = Field(
        ...,
        description="AI plausibility assessment based on evidence",
    )
    review_status: Literal["pending", "confirmed", "rejected", "edited"] = Field(
        default="pending",
        description="GxP human investigator review decision (never set by AI)",
    )
    reviewer_note: Optional[str] = Field(None, description="Human reviewer rationale")
    timeline_aligned: bool = Field(default=True, description="True if evidence dates match incident timeframe")
    equipment_aligned: bool = Field(default=True, description="True if equipment identifiers match")
    alignment_details: Optional[str] = Field(None, description="Details of equipment and timeline checks")
    supporting_evidence: List[EvidenceCorrelationItem] = Field(
        default_factory=list,
        description="Primary evidence records that confirm or corroborate this cause",
    )
    contradicting_evidence: List[EvidenceCorrelationItem] = Field(
        default_factory=list,
        description="Evidence records that refute or rule out this cause",
    )
    evidence_gaps: List[str] = Field(
        default_factory=list,
        description="Missing data or tests required to fully verify this cause",
    )

    model_config = ConfigDict(from_attributes=True)


class CauseAssessmentResponse(BaseModel):
    """Full Cause vs Evidence assessment response."""

    investigation_id: str = Field(..., description="Investigation UUID")
    matrix: List[CauseEvidenceMatrixItem] = Field(
        default_factory=list,
        description="Evaluated cause candidates with evidence correlations",
    )
    summary: Dict[str, int] = Field(
        default_factory=dict,
        description="Summary counts: hypotheses, evidence_supported, not_supported, confirmed, rejected",
    )
    unresolved_gaps_count: int = Field(default=0, description="Count of open investigation gaps")

    model_config = ConfigDict(from_attributes=True)
