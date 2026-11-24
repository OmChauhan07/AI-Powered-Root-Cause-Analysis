from typing import Optional, List, Dict, Any, Literal
from datetime import datetime
from pydantic import BaseModel, Field, ConfigDict, field_validator, ValidationInfo

from app.schemas.extraction import ExtractedFactItem, MissingInformationItem
from app.schemas.evidence import EvidenceRecordItem, InvestigationGapItem
from app.schemas.rca_methods import FiveWhysStep, FishboneCategories, CauseCandidateItem
from app.schemas.capa import CapaActionItem


class UpdateInvestigationFieldsRequest(BaseModel):
    """Payload to update editable incident fields."""

    title: Optional[str] = None
    problem_statement: Optional[str] = None
    product_name: Optional[str] = None
    product_code: Optional[str] = None
    batch_number: Optional[str] = None
    manufacturing_stage: Optional[str] = None
    expected_result: Optional[str] = None
    observed_result: Optional[str] = None
    immediate_action: Optional[str] = None
    equipment_id: Optional[str] = None
    severity: Optional[Literal["low", "medium", "high", "critical"]] = None

    model_config = ConfigDict(from_attributes=True)


class SaveInvestigationRequest(BaseModel):
    """Payload to save and sign off a reviewed investigation draft."""

    reviewer_note: Optional[str] = Field(None, description="Investigator summary comments")
    reviewer_name: Optional[str] = Field(None, description="Authorized reviewer name")
    reviewer_role: Optional[str] = Field(None, description="Quality Assurance role")
    status: Literal["draft", "pending_review", "reviewed", "confirmed"] = Field(
        default="reviewed",
        description="Target status for saved investigation",
    )

    @field_validator("reviewer_note")
    @classmethod
    def validate_reviewer_note(cls, v: Optional[str], info: ValidationInfo) -> Optional[str]:
        status_val = info.data.get("status", "reviewed")
        if status_val in ("reviewed", "confirmed"):
            if not v or not v.strip():
                raise ValueError("A qualified reviewer justification note is mandatory for GxP sign-off.")
        return v


class SaveInvestigationResponse(BaseModel):
    """Response from saving an investigation."""

    investigation_id: str
    reference_code: str
    status: str
    saved_at: str
    reviewer_note: Optional[str] = None
    summary: Dict[str, Any]

    model_config = ConfigDict(from_attributes=True)


class SourceDocumentSummary(BaseModel):
    """Metadata summary of an attached source document."""

    id: str
    filename: Optional[str] = None
    source_type: str
    page_count: int = 1
    created_at: Optional[str] = None

    model_config = ConfigDict(from_attributes=True)


class InvestigationDossierResponse(BaseModel):
    """Comprehensive, fully populated investigation dossier."""

    id: str
    reference_code: str
    title: str
    status: str
    severity: str
    created_at: str
    updated_at: str
    reviewer_note: Optional[str] = None

    # Incident Fields
    incident_fields: Dict[str, Any]

    # Child Artifact Collections
    source_documents: List[SourceDocumentSummary] = Field(default_factory=list)
    extracted_facts: List[ExtractedFactItem] = Field(default_factory=list)
    evidence_records: List[EvidenceRecordItem] = Field(default_factory=list)
    investigation_gaps: List[InvestigationGapItem] = Field(default_factory=list)
    five_whys_chains: List[FiveWhysStep] = Field(default_factory=list)
    fishbone_categories: FishboneCategories = Field(default_factory=FishboneCategories)
    cause_candidates: List[CauseCandidateItem] = Field(default_factory=list)
    capa_actions: List[CapaActionItem] = Field(default_factory=list)

    # Verification Statistics
    statistics: Dict[str, int] = Field(default_factory=dict)

    model_config = ConfigDict(from_attributes=True)
