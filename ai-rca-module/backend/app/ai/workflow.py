"""LangGraph workflow definition for Root Cause Analysis.

Orchestrates sequential or branching evaluation nodes:
Log Analyzer -> Hypothesis Generator -> Root Cause Identifier -> Recommendation Engine
"""

import logging
from langgraph.graph import StateGraph, START, END
from app.ai.state import RCAState
from app.ai.nodes import (
    log_analyzer_node,
    hypothesis_generator_node,
    root_cause_identifier_node,
    recommendation_node,
)

logger = logging.getLogger(__name__)


def build_rca_graph():
    """Builds and compiles the RCA LangGraph state graph."""
    graph_builder = StateGraph(RCAState)

    # Register nodes
    graph_builder.add_node("analyze_logs", log_analyzer_node)
    graph_builder.add_node("generate_hypotheses", hypothesis_generator_node)
    graph_builder.add_node("identify_root_cause", root_cause_identifier_node)
    graph_builder.add_node("generate_recommendations", recommendation_node)

    # Define edges
    graph_builder.add_edge(START, "analyze_logs")
    graph_builder.add_edge("analyze_logs", "generate_hypotheses")
    graph_builder.add_edge("generate_hypotheses", "identify_root_cause")
    graph_builder.add_edge("identify_root_cause", "generate_recommendations")
    graph_builder.add_edge("generate_recommendations", END)

    compiled_graph = graph_builder.compile()
    logger.info("RCA LangGraph successfully built and compiled.")
    return compiled_graph
