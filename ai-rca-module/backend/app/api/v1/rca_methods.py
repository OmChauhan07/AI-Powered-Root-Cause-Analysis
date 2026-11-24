import uuid
import logging
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.database.session import get_db
from app.models.investigation import Investigation, SourceDocument, EvidenceRecord, CauseCandidate
from app.schemas.rca_methods import (
    FiveWhysStep,
    FishboneCategories,
    CauseCandidateItem,
    RcaAnalysisRequest,
    RcaAnalysisResponse,
    UpdateCauseCandidateRequest,
)
from app.ai.workflow import build_rca_methods_graph
from app.api.v1.documents import get_or_create_investigation

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/investigations", tags=["Root Cause Analysis Methods (5 Whys & Fishbone)"])


@router.post(
    "/{investigation_id}/rca-methods/analyze",
    response_model=RcaAnalysisResponse,
    summary="Run AI RCA Analysis (5 Whys or Fishbone 6M)",
    description="Executes 5 Whys question chains and Fishbone (Ishikawa 6M) analysis across collected incident evidence, generating reviewable cause candidates.",
)
@router.post(
    "/{investigation_id}/analyse",
    response_model=RcaAnalysisResponse,
    include_in_schema=False,
)
async def analyze_rca_methods(
    investigation_id: str,
    request: Optional[RcaAnalysisRequest] = None,
    db: Session = Depends(get_db),
):
    """Executes 5 Whys or Fishbone causal analysis workflow."""
    method = request.method if request else "five_whys"
    inv = get_or_create_investigation(investigation_id, db)

    # Gather evidence records
    ev_records = db.query(EvidenceRecord).filter(EvidenceRecord.investigation_id == investigation_id).all()
    evidence_payloads = [
        {
            "id": r.id,
            "evidence_type": r.evidence_type,
            "title": r.title,
            "summary": r.summary,
            "status": r.status,
            "calibration_status": r.calibration_status,
            "findings": r.findings,
            "document_id": r.document_id,
        }
        for r in ev_records
    ]

    # Gather source documents
    docs = db.query(SourceDocument).filter(SourceDocument.investigation_id == investigation_id).all()
    normalized_sources = [
        {
            "id": d.id,
            "filename": d.original_filename or "document",
            "source_type": d.source_type,
            "extracted_text": d.extracted_text or "",
            "pages": [{"page_number": 1, "text": d.extracted_text or ""}],
        }
        for d in docs
    ]

    incident_fields = {
        "product_name": inv.product_name,
        "product_code": inv.product_code,
        "batch_number": inv.batch_number,
        "manufacturing_stage": inv.manufacturing_stage,
        "incident_date": inv.incident_at.isoformat() if inv.incident_at else None,
        "problem_statement": inv.problem_statement or "Product quality deviation",
        "equipment_id": inv.equipment_id,
        "severity": inv.severity,
    }

    initial_state = {
        "investigation_id": inv.id,
        "investigation_method": method,
        "incident_fields": incident_fields,
        "evidence_records": evidence_payloads,
        "normalized_sources": normalized_sources,
        "five_whys_chains": [],
        "fishbone_categories": {},
        "cause_candidates": [],
        "warnings": [],
    }

    try:
        graph = build_rca_methods_graph()
        result = graph.invoke(initial_state)
    except Exception as exc:
        logger.error("RCA Methods graph execution error: %s", str(exc), exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to execute RCA methods graph: {str(exc)}",
        )

    five_whys_raw = result.get("five_whys_chains", [])
    fishbone_raw = result.get("fishbone_categories", {})
    candidates_raw = result.get("cause_candidates", [])
    warnings_raw = result.get("warnings", [])

    # Update Investigation state
    inv.investigation_method = method
    inv.rca_method_data = {
        "five_whys_chains": five_whys_raw,
        "fishbone_categories": fishbone_raw,
    }

    # Store cause candidates in DB (clear previous unreviewed candidates for same method to prevent unbounded accumulation)
    db.query(CauseCandidate).filter(
        CauseCandidate.investigation_id == investigation_id,
        CauseCandidate.method == method,
        CauseCandidate.review_status == "pending",
    ).delete(synchronize_session=False)

    saved_candidates = []
    for c_data in candidates_raw:
        cand_id = c_data.get("id") or str(uuid.uuid4())
        cand = CauseCandidate(
            id=cand_id,
            investigation_id=inv.id,
            method=method,
            category=c_data.get("category"),
            candidate_text=c_data.get("candidate_text", ""),
            rationale=c_data.get("rationale", ""),
            ai_status=c_data.get("ai_status", "hypothesis"),
            review_status="pending",
            reviewer_note=None,
            supporting_evidence_ids=c_data.get("supporting_evidence_ids", []),
            contradicting_evidence_ids=c_data.get("contradicting_evidence_ids", []),
        )
        db.add(cand)
        saved_candidates.append(cand)

    db.commit()

    # Re-query all cause candidates for this investigation
    all_candidates = db.query(CauseCandidate).filter(CauseCandidate.investigation_id == investigation_id).all()

    return RcaAnalysisResponse(
        investigation_id=inv.id,
        method=method,
        problem_statement=inv.problem_statement or "Product quality deviation",
        five_whys_chains=five_whys_raw,
        fishbone_categories=fishbone_raw,
        cause_candidates=[CauseCandidateItem.model_validate(c) for c in all_candidates],
        warnings=warnings_raw,
    )


@router.get(
    "/{investigation_id}/rca-methods",
    response_model=RcaAnalysisResponse,
    summary="Get Stored RCA Methods Data",
    description="Retrieves the current 5 Whys chain, Fishbone 6M breakdown, and cause candidates for the investigation.",
)
async def get_rca_methods(
    investigation_id: str,
    db: Session = Depends(get_db),
):
    """Retrieves saved 5 Whys, Fishbone, and Cause Candidates."""
    inv = get_or_create_investigation(investigation_id, db)
    rca_data = inv.rca_method_data or {}

    five_whys = rca_data.get("five_whys_chains", [])
    fishbone = rca_data.get("fishbone_categories", {})

    candidates = db.query(CauseCandidate).filter(CauseCandidate.investigation_id == investigation_id).all()

    return RcaAnalysisResponse(
        investigation_id=inv.id,
        method=inv.investigation_method or "five_whys",
        problem_statement=inv.problem_statement or "Product quality deviation",
        five_whys_chains=five_whys,
        fishbone_categories=fishbone,
        cause_candidates=[CauseCandidateItem.model_validate(c) for c in candidates],
        warnings=[],
    )


@router.patch(
    "/{investigation_id}/causes/{cause_id}",
    response_model=CauseCandidateItem,
    summary="Review and Qualify Cause Candidate (Human-in-the-Loop)",
    description="Allows a qualified QA investigator to confirm, reject, or edit an AI-generated root cause candidate.",
)
async def update_cause_candidate(
    investigation_id: str,
    cause_id: str,
    payload: UpdateCauseCandidateRequest,
    db: Session = Depends(get_db),
):
    """Updates the human review status and notes for a candidate root cause."""
    candidate = (
        db.query(CauseCandidate)
        .filter(CauseCandidate.id == cause_id, CauseCandidate.investigation_id == investigation_id)
        .first()
    )

    if not candidate:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Cause candidate '{cause_id}' not found for investigation '{investigation_id}'.",
        )

    # GxP compliance check: require a reviewer note or basis when confirming or rejecting
    if payload.review_status in ["confirmed", "rejected"]:
        if not payload.reviewer_note or not payload.reviewer_note.strip():
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=f"A reviewer justification note is required to set cause status to '{payload.review_status}'.",
            )

    candidate.review_status = payload.review_status
    if payload.reviewer_note is not None:
        candidate.reviewer_note = payload.reviewer_note
    if payload.candidate_text is not None:
        candidate.candidate_text = payload.candidate_text

    db.commit()
    db.refresh(candidate)

    return CauseCandidateItem.model_validate(candidate)
