import pytest
from app.ai.workflow import build_rca_graph
from app.ai.groq_client import check_groq_status


def test_langgraph_compilation():
    """Verifies that the LangGraph StateGraph builds and compiles without syntax error."""
    graph = build_rca_graph()
    assert graph is not None
    assert hasattr(graph, "invoke")


def test_langgraph_graph_execution():
    """Verifies execution flow through the sequential analysis nodes."""
    graph = build_rca_graph()
    initial_state = {
        "incident_id": "TEST-001",
        "title": "API-X Purity Excursion",
        "description": "Observed 98.1% vs expected 99.0%",
        "logs": [{"timestamp": "2026-11-20T08:00:00Z", "level": "ERROR", "msg": "Temp drift"}],
        "metrics": {"temperature_error": 0.8},
    }

    result = graph.invoke(initial_state)
    assert result is not None
    assert "extracted_anomalies" in result
    assert "hypotheses" in result
    assert "root_cause" in result
    assert "recommendations" in result
    assert result["current_step"] == "workflow_complete"


def test_groq_status_check():
    """Verifies the Groq credential diagnostic probe."""
    status = check_groq_status()
    assert "status" in status
    assert "model" in status
    assert status["model"] == "llama-3.3-70b-versatile"
