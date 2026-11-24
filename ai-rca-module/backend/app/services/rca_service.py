import logging
from typing import Dict, Any, Optional
from sqlalchemy.orm import Session
from app.models.rca import RCARecord
from app.schemas.rca import RCACreate
from app.ai.workflow import build_rca_graph

logger = logging.getLogger(__name__)


class RCAService:
    """Service layer orchestrating database persistence and AI graph execution."""

    def __init__(self):
        self._graph = None

    @property
    def graph(self):
        """Lazy loader for the LangGraph workflow."""
        if self._graph is None:
            self._graph = build_rca_graph()
        return self._graph

    def create_rca_record(self, db: Session, payload: RCACreate) -> RCARecord:
        """Stores a new RCA incident record in the database."""
        record = RCARecord(
            incident_id=payload.incident_id,
            title=payload.title,
            description=payload.description,
            severity=payload.severity,
            logs_data=payload.logs_data,
            metrics_data=payload.metrics_data,
            status="pending",
        )
        db.add(record)
        db.commit()
        db.refresh(record)
        return record

    def run_rca_analysis(self, payload: RCACreate) -> Dict[str, Any]:
        """Runs the LangGraph RCA workflow on input incident data."""
        initial_state = {
            "incident_id": payload.incident_id,
            "title": payload.title,
            "description": payload.description or "",
            "logs": payload.logs_data.get("entries", []) if payload.logs_data else [],
            "metrics": payload.metrics_data or {},
            "current_step": "initialized",
            "errors": [],
        }

        try:
            result = self.graph.invoke(initial_state)
            return {
                "status": "completed",
                "root_cause": result.get("root_cause"),
                "confidence_score": result.get("confidence_score", 0.0),
                "recommendations": result.get("recommendations", []),
                "hypotheses": result.get("hypotheses", []),
            }
        except Exception as exc:
            logger.error("Error executing RCA AI workflow: %s", str(exc))
            return {
                "status": "failed",
                "error": str(exc),
                "root_cause": None,
                "recommendations": [],
            }


rca_service = RCAService()
