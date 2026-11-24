from typing import Optional, List, Dict, Any, Literal
from pydantic import BaseModel, Field, ConfigDict


class CapaActionItem(BaseModel):
    """Structured Corrective, Preventive, or Containment Action Item."""

    id: Optional[str] = Field(None, description="UUID of CAPA action")
    investigation_id: str = Field(..., description="UUID of investigation")
    cause_candidate_id: Optional[str] = Field(None, description="UUID of linked root cause candidate")
    action_type: Literal["containment", "corrective", "preventive", "investigation_followup"] = Field(
        ...,
        description="Type of action: immediate containment, corrective fix, systemic prevention, or gap follow-up",
    )
    title: str = Field(..., description="Action title")
    action_text: str = Field(..., description="Detailed action implementation plan")
    rationale: str = Field(..., description="Direct connection to root cause or investigation gap")
    owner_role: Optional[str] = Field(None, description="Functional role responsible (no personal names)")
    due_date: Optional[str] = Field(None, description="Reviewer-assigned target completion date")
    effectiveness_check: Optional[str] = Field(None, description="Measurable verification criteria")
    review_status: Literal["pending_review", "accepted", "rejected", "edited"] = Field(
        default="pending_review",
        description="Quality reviewer acceptance status",
    )
    reviewer_note: Optional[str] = Field(None, description="Reviewer comments or modifications")
    created_at: Optional[str] = Field(None, description="Creation timestamp")

    model_config = ConfigDict(from_attributes=True)


class CapaSuggestionsRequest(BaseModel):
    """Request payload to generate evidence-linked CAPA actions."""

    cause_candidate_ids: Optional[List[str]] = Field(
        default_factory=list,
        description="Optional list of specific cause IDs to target",
    )
    include_followup_investigations: bool = Field(
        default=True,
        description="True to include investigation follow-up actions for open gaps",
    )


class CapaSuggestionsResponse(BaseModel):
    """Structured CAPA recommendations response."""

    investigation_id: str = Field(..., description="UUID of investigation")
    capa_recommendations: List[CapaActionItem] = Field(default_factory=list, description="Generated CAPA recommendations")
    deferred_reason: Optional[str] = Field(None, description="Reason if preventive CAPA is deferred due to lack of supported causes")
    warnings: List[str] = Field(default_factory=list, description="Warnings regarding gaps or unsupported assumptions")

    model_config = ConfigDict(from_attributes=True)


class UpdateCapaActionRequest(BaseModel):
    """Payload to review or edit a CAPA action item."""

    review_status: Literal["pending_review", "accepted", "rejected", "edited"] = Field(..., description="Reviewer acceptance decision")
    action_text: Optional[str] = Field(None, description="Updated action wording")
    effectiveness_check: Optional[str] = Field(None, description="Updated measurable check")
    owner_role: Optional[str] = Field(None, description="Updated functional role")
    due_date: Optional[str] = Field(None, description="Target completion date")
    reviewer_note: Optional[str] = Field(None, description="Reviewer comments or justification")
