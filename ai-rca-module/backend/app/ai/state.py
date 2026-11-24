from typing import TypedDict, List, Dict, Any, Optional


class RCAState(TypedDict, total=False):
    """State schema for LangGraph Root Cause Analysis workflow."""

    # Input data
    incident_id: str
    title: str
    description: str
    logs: List[Dict[str, Any]]
    metrics: Dict[str, Any]

    # Intermediate agent artifacts
    extracted_anomalies: List[str]
    hypotheses: List[str]

    # Final outputs
    root_cause: Optional[str]
    confidence_score: float
    recommendations: List[str]

    # Workflow tracing
    current_step: str
    errors: List[str]
