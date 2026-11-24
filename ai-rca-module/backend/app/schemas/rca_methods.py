from typing import Optional, List, Dict, Any, Literal
from pydantic import BaseModel, Field, ConfigDict, field_validator


class FiveWhysStep(BaseModel):
    """Individual iterative step in the 5 Whys causal chain."""

    step: int = Field(..., description="Step sequence number (1, 2, 3...)")
    question: str = Field(..., description="Why question probing the previous symptom or cause")
    answer: str = Field(..., description="Causal answer or rationale supported by evidence")
    evidence_basis: Optional[str] = Field(None, description="Primary document or record reference")
    supporting_evidence_ids: List[str] = Field(default_factory=list, description="UUIDs of supporting evidence records")
    missing_evidence: Optional[str] = Field(None, description="Evidence gap or test needed to confirm step")
    is_hypothesis: bool = Field(default=True, description="True if based on unverified inference; False if supported by primary data")

    model_config = ConfigDict(from_attributes=True)


class FishboneFactor(BaseModel):
    """Specific contributing factor within an Ishikawa 6M category."""

    factor: str = Field(..., description="Descriptive factor title")
    rationale: str = Field(..., description="How this factor could have contributed to the deviation")
    ai_status: str = Field(
        default="hypothesis",
        description="Status: 'hypothesis', 'evidence_supported_pending_review', 'needs_evidence'",
    )
    supporting_evidence_ids: List[str] = Field(default_factory=list, description="IDs of linked evidence records")

    model_config = ConfigDict(from_attributes=True)


class FishboneCategories(BaseModel):
    """The 6M Ishikawa Fishbone categories for pharmaceutical manufacturing."""

    people: List[FishboneFactor] = Field(default_factory=list, description="Personnel, training, shift handovers")
    machine: List[FishboneFactor] = Field(default_factory=list, description="Equipment, reactors, sensors, calibration")
    method: List[FishboneFactor] = Field(default_factory=list, description="SOPs, cooling ramps, stirring protocols")
    material: List[FishboneFactor] = Field(default_factory=list, description="Raw materials, solvents, reagents, lot quality")
    measurement: List[FishboneFactor] = Field(default_factory=list, description="HPLC assay, temperature sensors, testing tolerances")
    environment: List[FishboneFactor] = Field(default_factory=list, description="Ambient temperature, humidity, cleanroom conditions")

    model_config = ConfigDict(from_attributes=True)


class CauseCandidateItem(BaseModel):
    """Candidate root cause or contributing factor ready for human reviewer qualification."""

    id: Optional[str] = Field(None, description="UUID of cause candidate")
    investigation_id: str = Field(..., description="UUID of investigation")
    method: str = Field(default="five_whys", description="'five_whys' or 'fishbone'")
    category: Optional[str] = Field(None, description="6M category (e.g. 'machine', 'method')")
    candidate_text: str = Field(..., description="Core cause statement")
    rationale: str = Field(..., description="Physical and investigative justification")
    ai_status: str = Field(
        default="hypothesis",
        description="Status: 'hypothesis', 'needs_evidence', 'evidence_supported_pending_review', 'not_supported'",
    )
    review_status: str = Field(
        default="pending",
        description="Human reviewer status: 'pending', 'confirmed', 'rejected', 'edited'",
    )
    reviewer_note: Optional[str] = Field(None, description="Notes written by qualified QA investigator")
    supporting_evidence_ids: Optional[List[str]] = Field(default_factory=list, description="UUIDs of supporting evidence")
    contradicting_evidence_ids: Optional[List[str]] = Field(default_factory=list, description="UUIDs of contradicting evidence")

    @field_validator("supporting_evidence_ids", "contradicting_evidence_ids", mode="before")
    @classmethod
    def coerce_none_to_list(cls, v):
        if v is None:
            return []
        return v

    model_config = ConfigDict(from_attributes=True)


class RcaAnalysisRequest(BaseModel):
    """Request payload to execute 5 Whys or Fishbone analysis."""

    method: Literal["five_whys", "fishbone"] = Field(default="five_whys", description="Selected RCA methodology")


class RcaAnalysisResponse(BaseModel):
    """Structured output returned by the RCA Methods workflow."""

    investigation_id: str = Field(..., description="Investigation UUID")
    method: str = Field(..., description="Selected RCA method")
    problem_statement: str = Field(..., description="Problem statement used as analysis root")
    five_whys_chains: List[FiveWhysStep] = Field(default_factory=list, description="5 Whys questioning sequence")
    fishbone_categories: FishboneCategories = Field(default_factory=FishboneCategories, description="Ishikawa 6M factor breakdown")
    cause_candidates: List[CauseCandidateItem] = Field(default_factory=list, description="Synthesized cause candidates")
    warnings: List[str] = Field(default_factory=list, description="Ambiguities or gaps in evidence support")

    model_config = ConfigDict(from_attributes=True)


class UpdateCauseCandidateRequest(BaseModel):
    """Human-in-the-loop qualification request."""

    review_status: Literal["pending", "confirmed", "rejected", "edited"] = Field(..., description="Reviewer decision")
    reviewer_note: Optional[str] = Field(None, description="Investigator notes explaining decision")
    candidate_text: Optional[str] = Field(None, description="Updated wording if edited by reviewer")
