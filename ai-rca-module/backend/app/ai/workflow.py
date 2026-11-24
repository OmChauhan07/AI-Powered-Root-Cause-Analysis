"""LangGraph workflow definitions for Root Cause Analysis.

Orchestrates:
1. Extraction Workflow: START -> extract_incident_fields -> END
2. Comprehensive RCA Multi-Stage Analysis Workflow:
   START -> extract_incident_fields -> analyze_logs -> generate_hypotheses -> identify_root_cause -> generate_recommendations -> END
"""

import logging
from langgraph.graph import StateGraph, START, END
from app.ai.state import RCAState
from app.ai.nodes import (
    extract_incident_fields_node,
    analyze_evidence_and_gaps_node,
    log_analyzer_node,
    hypothesis_generator_node,
    root_cause_identifier_node,
    recommendation_node,
)

logger = logging.getLogger(__name__)


def build_extraction_graph():
    """Builds and compiles the focused LangGraph workflow for incident extraction."""
    builder = StateGraph(RCAState)

    builder.add_node("extract_incident_fields", extract_incident_fields_node)

    builder.add_edge(START, "extract_incident_fields")
    builder.add_edge("extract_incident_fields", END)

    compiled = builder.compile()
    logger.info("LangGraph Extraction workflow compiled successfully.")
    return compiled


def build_evidence_gap_graph():
    """Builds and compiles the Evidence and Investigation Gap analysis LangGraph workflow."""
    builder = StateGraph(RCAState)

    builder.add_node("analyze_evidence_and_gaps", analyze_evidence_and_gaps_node)

    builder.add_edge(START, "analyze_evidence_and_gaps")
    builder.add_edge("analyze_evidence_and_gaps", END)

    compiled = builder.compile()
    logger.info("LangGraph Evidence & Gap analysis workflow compiled successfully.")
    return compiled


def build_rca_graph():
    """Builds and compiles the complete multi-stage RCA LangGraph workflow."""
    builder = StateGraph(RCAState)

    builder.add_node("extract_incident_fields", extract_incident_fields_node)
    builder.add_node("analyze_logs", log_analyzer_node)
    builder.add_node("generate_hypotheses", hypothesis_generator_node)
    builder.add_node("identify_root_cause", root_cause_identifier_node)
    builder.add_node("generate_recommendations", recommendation_node)

    builder.add_edge(START, "extract_incident_fields")
    builder.add_edge("extract_incident_fields", "analyze_logs")
    builder.add_edge("analyze_logs", "generate_hypotheses")
    builder.add_edge("generate_hypotheses", "identify_root_cause")
    builder.add_edge("identify_root_cause", "generate_recommendations")
    builder.add_edge("generate_recommendations", END)

    compiled = builder.compile()
    logger.info("Comprehensive RCA LangGraph workflow compiled successfully.")
    return compiled
