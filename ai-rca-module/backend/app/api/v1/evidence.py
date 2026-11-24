import logging
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.database.session import get_db
from app.models.investigation import Investigation, SourceDocument, EvidenceRecord, InvestigationGap
from app.schemas.evidence import (
    EvidenceRecordItem,
    InvestigationGapItem,
    ConflictDetectionItem,
    EvidenceAnalysisResponse,
    CreateEvidenceRequest,
)
from app.ai.workflow import build_evidence_gap_graph
from app.api.v1.documents import get_or_create_investigation

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/investigations", tags=["Evidence Management & Investigation Gaps"])


@router.post(
    "/{investigation_id}/evidence/analyze",
    response_model=EvidenceAnalysisResponse,
    summary="Run AI Evidence & Gap Analysis",
    description="Indexes attached calibration certificates, batch records, maintenance logs, checks timeline anomalies, and audits investigation gaps.",
)
async def analyze_investigation_evidence(
    investigation_id: str,
    db: Session = Depends(get_db),
):
    """Executes evidence extraction and gap analysis over all attached sources."""
    inv = get_or_create_investigation(investigation_id, db)
    docs = db.query(SourceDocument).filter(SourceDocument.investigation_id == investigation_id).all()

    normalized_sources = []
    for d in docs:
        normalized_sources.append({
            "id": d.id,
            "filename": d.original_filename or "evidence_document",
            "source_type": d.source_type,
            "page_count": d.page_count,
            "extracted_text": d.extracted_text or "",
            "pages": [{"page_number": 1, "text": d.extracted_text or ""}],
        })

    incident_fields = {
        "product_name": inv.product_name,
        "product_code": inv.product_code,
        "batch_number": inv.batch_number,
        "manufacturing_stage": inv.manufacturing_stage,
        "incident_date": inv.incident_at.isoformat() if inv.incident_at else None,
        "problem_statement": inv.problem_statement,
        "equipment_id": inv.equipment_id,
        "severity": inv.severity,
    }

    initial_state = {
        "investigation_id": inv.id,
        "reference_code": inv.reference_code,
        "title": inv.title,
        "incident_fields": incident_fields,
        "normalized_sources": normalized_sources,
    }

    try:
        evidence_graph = build_evidence_gap_graph()
        result_state = evidence_graph.invoke(initial_state)
    except Exception as exc:
        logger.error("Evidence gap graph execution failed: %s", str(exc), exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Evidence analysis failed: {str(exc)}",
        )

    evidence_records_data = result_state.get("evidence_records", [])
    gaps_data = result_state.get("missing_information", [])
    conflicts_data = result_state.get("conflicting_information", [])
    timeline_anomalies_data = result_state.get("timeline_anomalies", [])

    # Clear previous automated evidence records and gaps to avoid duplication
    db.query(EvidenceRecord).filter(
        EvidenceRecord.investigation_id == investigation_id,
        EvidenceRecord.source_document_id.isnot(None),
    ).delete(synchronize_session=False)

    db.query(InvestigationGap).filter(
        InvestigationGap.investigation_id == investigation_id,
        InvestigationGap.status != "resolved",
    ).delete(synchronize_session=False)

    created_evidence_items: List[EvidenceRecordItem] = []
    for ev in evidence_records_data:
        ev_model = EvidenceRecord(
            investigation_id=investigation_id,
            source_document_id=ev.get("source_document_id"),
            evidence_type=ev.get("evidence_type", "batch_record"),
            title=ev.get("title", "Evidence Item"),
            description=ev.get("description", ""),
            source_page=ev.get("source_page"),
            source_excerpt=ev.get("source_excerpt"),
            status=ev.get("status", "available"),
            structured_payload=ev.get("structured_payload"),
        )
        db.add(ev_model)
        db.flush()

        created_evidence_items.append(
            EvidenceRecordItem(
                id=ev_model.id,
                investigation_id=investigation_id,
                source_document_id=ev.get("source_document_id"),
                source_filename=ev.get("source_filename"),
                evidence_type=ev.get("evidence_type", "batch_record"),
                title=ev.get("title", "Evidence Item"),
                description=ev.get("description", ""),
                evidence_date=ev.get("evidence_date"),
                source_page=ev.get("source_page"),
                source_excerpt=ev.get("source_excerpt"),
                status=ev.get("status", "available"),
                structured_payload=ev.get("structured_payload") or {},
            )
        )

    created_gaps: List[InvestigationGapItem] = []
    for g in gaps_data:
        gap_model = InvestigationGap(
            investigation_id=investigation_id,
            gap_type=g.get("gap_type", "missing_record"),
            field_or_record=g.get("field_or_record", "record"),
            description=g.get("description", ""),
            impact_rationale=g.get("impact_rationale", ""),
            status=g.get("status", "not_provided"),
            recommended_action=g.get("recommended_action"),
            importance=g.get("importance", "high"),
        )
        db.add(gap_model)
        db.flush()

        created_gaps.append(
            InvestigationGapItem(
                id=gap_model.id,
                gap_type=g.get("gap_type", "missing_record"),
                field_or_record=g.get("field_or_record", "record"),
                description=g.get("description", ""),
                impact_rationale=g.get("impact_rationale", ""),
                status=g.get("status", "not_provided"),
                recommended_action=g.get("recommended_action"),
                importance=g.get("importance", "high"),
            )
        )

    db.commit()

    conflict_items = [ConflictDetectionItem(**c) for c in conflicts_data]

    return EvidenceAnalysisResponse(
        investigation_id=investigation_id,
        evidence_records=created_evidence_items,
        gaps=created_gaps,
        conflicts=conflict_items,
        timeline_anomalies=timeline_anomalies_data,
        workflow_status="evidence_analyzed",
    )


@router.get(
    "/{investigation_id}/evidence",
    response_model=EvidenceAnalysisResponse,
    summary="Get Evidence Records & Gaps",
    description="Retrieves all indexed evidence records and active investigation gaps.",
)
async def get_investigation_evidence(
    investigation_id: str,
    db: Session = Depends(get_db),
):
    """Returns stored evidence items and gaps for an investigation."""
    ev_records = db.query(EvidenceRecord).filter(EvidenceRecord.investigation_id == investigation_id).all()
    gaps = db.query(InvestigationGap).filter(InvestigationGap.investigation_id == investigation_id).all()

    evidence_items = []
    for r in ev_records:
        evidence_items.append(
            EvidenceRecordItem(
                id=r.id,
                investigation_id=r.investigation_id,
                source_document_id=r.source_document_id,
                source_filename=r.source_document.original_filename if r.source_document else None,
                evidence_type=r.evidence_type,
                title=r.title,
                description=r.description,
                evidence_date=r.evidence_date.isoformat() if r.evidence_date else None,
                source_page=r.source_page,
                source_excerpt=r.source_excerpt,
                status=r.status,
                structured_payload=r.structured_payload or {},
            )
        )

    gap_items = []
    for g in gaps:
        gap_items.append(
            InvestigationGapItem(
                id=g.id,
                gap_type=g.gap_type,
                field_or_record=g.field_or_record,
                description=g.description,
                impact_rationale=g.impact_rationale,
                status=g.status,
                recommended_action=g.recommended_action,
                importance=g.importance,
            )
        )

    return EvidenceAnalysisResponse(
        investigation_id=investigation_id,
        evidence_records=evidence_items,
        gaps=gap_items,
        conflicts=[],
        timeline_anomalies=[],
        workflow_status="loaded",
    )


@router.post(
    "/{investigation_id}/evidence",
    response_model=EvidenceRecordItem,
    summary="Add Manual Evidence Record",
    description="Allows investigators to manually add an evidence item or external document reference.",
)
async def create_manual_evidence(
    investigation_id: str,
    payload: CreateEvidenceRequest,
    db: Session = Depends(get_db),
):
    """Manually attaches an evidence record to an investigation."""
    get_or_create_investigation(investigation_id, db)

    ev_model = EvidenceRecord(
        investigation_id=investigation_id,
        source_document_id=None,
        evidence_type=payload.evidence_type,
        title=payload.title,
        description=payload.description,
        status=payload.status,
        structured_payload=payload.structured_payload,
    )
    db.add(ev_model)
    db.commit()
    db.refresh(ev_model)

    return EvidenceRecordItem(
        id=ev_model.id,
        investigation_id=ev_model.investigation_id,
        source_document_id=None,
        source_filename="Manual Entry",
        evidence_type=ev_model.evidence_type,
        title=ev_model.title,
        description=ev_model.description,
        status=ev_model.status,
        structured_payload=ev_model.structured_payload or {},
    )


@router.patch(
    "/{investigation_id}/gaps/{gap_id}/resolve",
    summary="Resolve Investigation Gap",
    description="Marks a previously identified evidence gap as resolved by investigator.",
)
async def resolve_gap(
    investigation_id: str,
    gap_id: str,
    db: Session = Depends(get_db),
):
    """Resolves an investigation gap."""
    gap = db.query(InvestigationGap).filter(
        InvestigationGap.id == gap_id,
        InvestigationGap.investigation_id == investigation_id,
    ).first()

    if not gap:
        raise HTTPException(status_code=404, detail="Investigation gap not found.")

    gap.status = "resolved"
    db.commit()
    return {"message": "Investigation gap marked as resolved.", "gap_id": gap_id, "status": "resolved"}
