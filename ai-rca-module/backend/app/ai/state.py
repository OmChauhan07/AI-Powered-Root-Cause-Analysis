from typing import TypedDict, List, Dict, Any, Optional, Literal


class RCAState(TypedDict, total=False):
    """Comprehensive typed state schema for LangGraph Root Cause Analysis workflow.

    Aligned with pharmaceutical agent architecture in docs/agent.md.
    """

    # Investigation Metadata & Sources
    investigation_id: str
    incident_id: Optional[str]
    reference_code: Optional[str]
    title: Optional[str]
    description: Optional[str]
    logs: Optional[List[Dict[str, Any]]]
    metrics: Optional[Dict[str, Any]]
    normalized_sources: List[Dict[str, Any]]

    # Phase 04: Incident Extraction Artifacts
    incident_fields: Dict[str, Any]
    extracted_facts: List[Dict[str, Any]]
    missing_information: List[Dict[str, Any]]
    conflicting_information: List[Dict[str, Any]]
    investigation_questions: List[Dict[str, Any]]

    # Phase 05 & 06: Evidence & Method Analysis
    extracted_anomalies: List[str]
    evidence_records: List[Dict[str, Any]]
    investigation_method: Optional[Literal["five_whys", "fishbone"]]
    five_whys_chains: List[Dict[str, Any]]
    fishbone_categories: Dict[str, Any]
    hypotheses: List[str]
    cause_candidates: List[Dict[str, Any]]
    cause_evidence_links: List[Dict[str, Any]]
    root_cause: Optional[str]
    confidence_score: Optional[float]

    # Phase 07: CAPA Recommendations
    capa_recommendations: List[Dict[str, Any]]
    recommendations: List[str]

    # Execution & Audit Trail
    current_step: str
    workflow_status: str
    warnings: List[str]
    errors: List[str]
