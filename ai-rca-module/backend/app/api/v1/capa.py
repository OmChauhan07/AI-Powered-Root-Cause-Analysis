import uuid
import logging
from typing import List, Optional
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.database.session import get_db
from app.models.investigation import Investigation, CauseCandidate, EvidenceRecord, InvestigationGap, CapaAction
from app.schemas.capa import (
    CapaActionItem,
    CapaSuggestionsRequest,
    CapaSuggestionsResponse,
    UpdateCapaActionRequest,
)
from app.ai.workflow import build_capa_graph
from app.api.v1.documents import get_or_create_investigation

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/investigations", tags=["CAPA Action Recommendations"])


@router.post(
    "/{investigation_id}/capa-suggestions",
    response_model=CapaSuggestionsResponse,
    summary="Generate AI CAPA Action Recommendations",
    description="Generates evidence-linked containment, corrective, and preventive actions with measurable effectiveness checks and role assignments.",
)
@router.post(
    "/{investigation_id}/capa/generate",
    response_model=CapaSuggestionsResponse,
    include_in_schema=False,
)
async def generate_capa_suggestions(
    investigation_id: str,
    request: Optional[CapaSuggestionsRequest] = None,
    db: Session = Depends(get_db),
):
    """Executes the CAPA recommendations LangGraph workflow."""
    inv = get_or_create_investigation(investigation_id, db)
    target_cause_ids = request.cause_candidate_ids if request else []

    candidates = db.query(CauseCandidate).filter(CauseCandidate.investigation_id == investigation_id).all()
    ev_records = db.query(EvidenceRecord).filter(EvidenceRecord.investigation_id == investigation_id).all()
    gaps = db.query(InvestigationGap).filter(InvestigationGap.investigation_id == investigation_id).all()

    cause_payloads = [
        {
            "id": c.id,
            "method": c.method,
            "category": c.category,
            "candidate_text": c.candidate_text,
            "rationale": c.rationale,
            "ai_status": c.ai_status,
            "review_status": c.review_status,
            "supporting_evidence_ids": c.supporting_evidence_ids or [],
            "contradicting_evidence_ids": c.contradicting_evidence_ids or [],
        }
        for c in candidates
    ]

    ev_payloads = [
        {
            "id": ev.id,
            "evidence_type": ev.evidence_type,
            "title": ev.title,
            "summary": ev.description,
            "findings": ev.source_excerpt or ev.description,
            "status": ev.status,
        }
        for ev in ev_records
    ]

    gap_payloads = [
        {
            "id": g.id,
            "gap_type": g.gap_type,
            "field_or_record": g.field_or_record,
            "description": g.description,
            "status": g.status,
        }
        for g in gaps
    ]

    incident_fields = {
        "product_name": inv.product_name or "API-X",
        "batch_number": inv.batch_number or "BATCH-2026-014",
        "equipment_id": inv.equipment_id or "TEMP-SENSOR-014",
        "problem_statement": inv.problem_statement or "Product purity below specification",
        "incident_date": inv.incident_at.isoformat() if inv.incident_at else None,
    }

    initial_state = {
        "investigation_id": inv.id,
        "incident_fields": incident_fields,
        "cause_candidates": cause_payloads,
        "cause_candidate_ids": target_cause_ids or [],
        "evidence_records": ev_payloads,
        "investigation_gaps": gap_payloads,
    }

    try:
        graph = build_capa_graph()
        result = graph.invoke(initial_state)
    except Exception as exc:
        logger.error("CAPA graph execution failed: %s", str(exc), exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to generate CAPA actions: {str(exc)}",
        )

    capa_raw = result.get("capa_recommendations", [])
    deferred_reason = result.get("deferred_reason")
    warnings = result.get("warnings", [])

    # Remove pending unreviewed CAPA actions for this investigation to prevent duplicate accumulation
    db.query(CapaAction).filter(
        CapaAction.investigation_id == investigation_id,
        CapaAction.review_status == "pending_review",
    ).delete(synchronize_session=False)

    saved_actions = []
    for item in capa_raw:
        action_id = item.get("id") or str(uuid.uuid4())
        due_val = None
        if item.get("due_date"):
            try:
                due_val = datetime.fromisoformat(item["due_date"])
            except Exception:
                due_val = None

        action_obj = CapaAction(
            id=action_id,
            investigation_id=inv.id,
            cause_candidate_id=item.get("cause_candidate_id"),
            action_type=item.get("action_type", "corrective"),
            title=item.get("title", "CAPA Action"),
            action_text=item.get("action_text", ""),
            rationale=item.get("rationale", ""),
            owner_role=item.get("owner_role"),
            due_date=due_val,
            effectiveness_check=item.get("effectiveness_check"),
            review_status="pending_review",
            reviewer_note=None,
        )
        db.add(action_obj)
        saved_actions.append(action_obj)

    db.commit()

    all_actions = db.query(CapaAction).filter(CapaAction.investigation_id == investigation_id).all()
    action_items = [
        CapaActionItem(
            id=a.id,
            investigation_id=a.investigation_id,
            cause_candidate_id=a.cause_candidate_id,
            action_type=a.action_type,
            title=a.title,
            action_text=a.action_text,
            rationale=a.rationale,
            owner_role=a.owner_role,
            due_date=a.due_date.isoformat() if a.due_date else None,
            effectiveness_check=a.effectiveness_check,
            review_status=a.review_status,
            reviewer_note=a.reviewer_note,
            created_at=a.created_at.isoformat() if a.created_at else None,
        )
        for a in all_actions
    ]

    return CapaSuggestionsResponse(
        investigation_id=inv.id,
        capa_recommendations=action_items,
        deferred_reason=deferred_reason,
        warnings=warnings,
    )


@router.get(
    "/{investigation_id}/capa-actions",
    response_model=CapaSuggestionsResponse,
    summary="Get Stored CAPA Action Plans",
    description="Retrieves all stored containment, corrective, and preventive action recommendations.",
)
async def get_capa_actions(
    investigation_id: str,
    db: Session = Depends(get_db),
):
    """Retrieves all stored CAPA recommendations for an investigation."""
    inv = get_or_create_investigation(investigation_id, db)
    actions = db.query(CapaAction).filter(CapaAction.investigation_id == investigation_id).all()

    action_items = [
        CapaActionItem(
            id=a.id,
            investigation_id=a.investigation_id,
            cause_candidate_id=a.cause_candidate_id,
            action_type=a.action_type,
            title=a.title,
            action_text=a.action_text,
            rationale=a.rationale,
            owner_role=a.owner_role,
            due_date=a.due_date.isoformat() if a.due_date else None,
            effectiveness_check=a.effectiveness_check,
            review_status=a.review_status,
            reviewer_note=a.reviewer_note,
            created_at=a.created_at.isoformat() if a.created_at else None,
        )
        for a in actions
    ]

    return CapaSuggestionsResponse(
        investigation_id=inv.id,
        capa_recommendations=action_items,
        deferred_reason=None,
        warnings=[],
    )


@router.patch(
    "/{investigation_id}/capa-actions/{action_id}",
    response_model=CapaActionItem,
    summary="Review / Accept / Edit CAPA Action (Human-in-the-Loop)",
    description="Allows a quality professional to accept, reject, or edit a CAPA recommendation statement or effectiveness check.",
)
async def update_capa_action(
    investigation_id: str,
    action_id: str,
    payload: UpdateCapaActionRequest,
    db: Session = Depends(get_db),
):
    """Updates a CAPA action's review status, action text, or effectiveness check."""
    action = (
        db.query(CapaAction)
        .filter(CapaAction.id == action_id, CapaAction.investigation_id == investigation_id)
        .first()
    )

    if not action:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"CAPA action '{action_id}' not found for investigation '{investigation_id}'.",
        )

    action.review_status = payload.review_status
    if payload.action_text is not None:
        action.action_text = payload.action_text
    if payload.effectiveness_check is not None:
        action.effectiveness_check = payload.effectiveness_check
    if payload.owner_role is not None:
        action.owner_role = payload.owner_role
    if payload.reviewer_note is not None:
        action.reviewer_note = payload.reviewer_note
    if payload.due_date is not None:
        try:
            action.due_date = datetime.fromisoformat(payload.due_date)
        except Exception:
            pass

    db.commit()
    db.refresh(action)

    return CapaActionItem(
        id=action.id,
        investigation_id=action.investigation_id,
        cause_candidate_id=action.cause_candidate_id,
        action_type=action.action_type,
        title=action.title,
        action_text=action.action_text,
        rationale=action.rationale,
        owner_role=action.owner_role,
        due_date=action.due_date.isoformat() if action.due_date else None,
        effectiveness_check=action.effectiveness_check,
        review_status=action.review_status,
        reviewer_note=action.reviewer_note,
        created_at=action.created_at.isoformat() if action.created_at else None,
    )
