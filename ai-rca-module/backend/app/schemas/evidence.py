from typing import Optional, List, Dict, Any, Literal
from datetime import datetime
from pydantic import BaseModel, Field, ConfigDict


class CalibrationPayload(BaseModel):
    """Structured parameters extracted from an equipment calibration certificate."""

    equipment_code: Optional[str] = Field(None, description="Equipment identifier (e.g. TEMP-SENSOR-014)")
    equipment_name: Optional[str] = Field(None, description="Equipment descriptive name")
    certificate_number: Optional[str] = Field(None, description="Calibration certificate serial number")
    calibration_date: Optional[str] = Field(None, description="Date calibration was executed")
    due_date: Optional[str] = Field(None, description="Next calibration expiration / due date")
    calibration_result: Optional[str] = Field(None, description="Stated certificate status: 'pass', 'fail', 'out_of_tolerance', 'adjusted'")
    tolerance_limit: Optional[str] = Field(None, description="Permissible error tolerance (e.g. '±0.5°C')")
    observed_error: Optional[str] = Field(None, description="Measured error value (e.g. '+0.8°C')")
    as_found_result: Optional[str] = Field(None, description="Measurement state before adjustment")
    as_left_result: Optional[str] = Field(None, description="Measurement state after adjustment/service")
    performed_by: Optional[str] = Field(None, description="Metrology technician or department name")

    model_config = ConfigDict(from_attributes=True)


class EvidenceRecordItem(BaseModel):
    """Individual piece of technical evidence extracted from attached documents or entered manually."""

    id: Optional[str] = Field(None, description="UUID identifier")
    investigation_id: str = Field(..., description="UUID of associated investigation")
    source_document_id: Optional[str] = Field(None, description="Originating document UUID")
    source_filename: Optional[str] = Field(None, description="Document filename for display")
    evidence_type: str = Field(
        ...,
        description="Type: 'calibration', 'batch_record', 'maintenance_log', 'lab_result', 'operator_log', 'standard_sop'",
    )
    title: str = Field(..., description="Short descriptive title of the evidence")
    description: str = Field(..., description="Detailed factual summary")
    evidence_date: Optional[str] = Field(None, description="Event or record date (ISO string)")
    source_page: Optional[int] = Field(None, description="Document page number")
    source_excerpt: Optional[str] = Field(None, description="Exact verbatim supporting quote")
    status: str = Field(
        default="available",
        description="Status: 'available', 'not_provided', 'unclear', 'conflicting', 'not_applicable'",
    )
    structured_payload: Optional[Dict[str, Any]] = Field(default_factory=dict, description="Structured metadata (e.g. calibration details)")

    model_config = ConfigDict(from_attributes=True)


class InvestigationGapItem(BaseModel):
    """Specific missing, unclear, or contradictory evidence gap requiring investigator attention."""

    id: Optional[str] = Field(None, description="UUID identifier")
    gap_type: str = Field(
        ...,
        description="Type: 'missing_record', 'conflicting_data', 'timeline_anomaly', 'unclear_evidence'",
    )
    field_or_record: str = Field(..., description="Impacted record or field name (e.g. 'calibration_certificate')")
    description: str = Field(..., description="Clear explanation of the detected gap or contradiction")
    impact_rationale: str = Field(..., description="GxP justification of why this gap matters to the root cause investigation")
    status: str = Field(
        default="not_provided",
        description="Status: 'not_provided', 'unclear', 'conflicting', 'resolved'",
    )
    recommended_action: Optional[str] = Field(None, description="Recommended investigative follow-up task")
    importance: str = Field(default="high", description="Severity: 'critical', 'high', 'medium', 'low'")

    model_config = ConfigDict(from_attributes=True)


class ConflictDetectionItem(BaseModel):
    """Discrepancy or contradiction detected between two or more evidence sources."""

    conflict_type: str = Field(..., description="Type: 'date_mismatch', 'equipment_id_mismatch', 'result_conflict'")
    description: str = Field(..., description="Explanation of the discrepancy")
    source_a: Dict[str, Any] = Field(..., description="First contradictory source citation")
    source_b: Dict[str, Any] = Field(..., description="Second contradictory source citation")
    resolution_guidance: str = Field(..., description="Investigator guidance on how to reconcile the contradiction")


class EvidenceAnalysisResponse(BaseModel):
    """Complete response returned by the Evidence and Gap Analysis workflow."""

    investigation_id: str = Field(..., description="Investigation UUID")
    evidence_records: List[EvidenceRecordItem] = Field(default_factory=list, description="Indexed evidence items")
    gaps: List[InvestigationGapItem] = Field(default_factory=list, description="Identified missing records and gaps")
    conflicts: List[ConflictDetectionItem] = Field(default_factory=list, description="Detected cross-document contradictions")
    timeline_anomalies: List[Dict[str, Any]] = Field(default_factory=list, description="Events dated post-incident or outside valid sequence")
    workflow_status: str = Field(default="evidence_analyzed", description="Status of evidence pipeline")

    model_config = ConfigDict(from_attributes=True)


class CreateEvidenceRequest(BaseModel):
    """Payload to add a manual or external evidence entry."""

    evidence_type: str = Field(..., description="'calibration', 'batch_record', 'maintenance_log', 'lab_result', 'operator_log'")
    title: str = Field(..., description="Short title")
    description: str = Field(..., description="Detailed description")
    evidence_date: Optional[str] = Field(None, description="ISO date string")
    status: str = Field(default="available", description="'available', 'not_provided', 'unclear', 'conflicting'")
    structured_payload: Optional[Dict[str, Any]] = Field(default_factory=dict)
