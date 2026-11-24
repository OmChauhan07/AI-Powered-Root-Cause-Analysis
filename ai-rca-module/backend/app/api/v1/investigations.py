import logging
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from datetime import datetime, timezone
from app.database.session import get_db
from app.models.investigation import (
    Investigation,
    SourceDocument,
    ExtractedFact,
    EvidenceRecord,
    InvestigationGap,
    CauseCandidate,
    CapaAction,
)
from app.schemas.extraction import (
    ExtractionRequest,
    ExtractionResponse,
    ExtractedFactItem,
    MissingInformationItem,
    IncidentFieldsSchema,
)
from app.schemas.dossier import (
    UpdateInvestigationFieldsRequest,
    SaveInvestigationRequest,
    SaveInvestigationResponse,
    InvestigationDossierResponse,
    SourceDocumentSummary,
)
from app.schemas.evidence import EvidenceRecordItem, InvestigationGapItem
from app.schemas.rca_methods import FiveWhysStep, FishboneCategories, CauseCandidateItem
from app.schemas.capa import CapaActionItem
from app.ai.workflow import build_extraction_graph
from app.api.v1.documents import get_or_create_investigation

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/investigations", tags=["AI Extraction & RCA Forms"])


@router.post(
    "/{investigation_id}/extract",
    response_model=ExtractionResponse,
    summary="Trigger AI Incident Fact Extraction",
    description="Invokes LangGraph extraction node using Groq LLM (or deterministic fallback) on attached evidence documents.",
)
async def run_incident_extraction(
    investigation_id: str,
    payload: Optional[ExtractionRequest] = None,
    db: Session = Depends(get_db),
):
    """Executes AI extraction across normalized evidence documents and populates predefined RCA fields."""
    inv = get_or_create_investigation(investigation_id, db)

    # 1. Fetch attached documents
    query = db.query(SourceDocument).filter(SourceDocument.investigation_id == investigation_id)
    if payload and payload.source_document_ids:
        query = query.filter(SourceDocument.id.in_(payload.source_document_ids))
    docs = query.all()

    if not docs:
        logger.warning("No source documents attached to investigation %s", investigation_id)
        return ExtractionResponse(
            investigation_id=investigation_id,
            workflow_status="empty_source",
            incident_fields=IncidentFieldsSchema(),
            extracted_facts=[],
            missing_information=[
                MissingInformationItem(
                    field_name="all_fields",
                    description="No evidence documents attached. Upload a deviation PDF, narrative text, or email first.",
                    importance="critical",
                )
            ],
            warnings=["No evidence documents attached to this investigation."],
        )

    # 2. Prepare normalized source structures for LangGraph
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

    # 3. Invoke LangGraph extraction workflow
    initial_state = {
        "investigation_id": inv.id,
        "reference_code": inv.reference_code,
        "title": inv.title,
        "normalized_sources": normalized_sources,
    }

    try:
        extraction_graph = build_extraction_graph()
        result_state = extraction_graph.invoke(initial_state)
    except Exception as exc:
        logger.error("LangGraph extraction invocation failed: %s", str(exc), exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"LangGraph extraction failed: {str(exc)}",
        )

    incident_data = result_state.get("incident_fields", {})
    extracted_facts_data = result_state.get("extracted_facts", [])
    missing_info_data = result_state.get("missing_information", [])
    warnings_data = result_state.get("warnings", [])
    workflow_status_val = result_state.get("workflow_status", "draft_ready")

    # 4. Save extracted facts into database
    # Clear unreviewed/pending facts from prior runs to prevent duplication
    db.query(ExtractedFact).filter(
        ExtractedFact.investigation_id == investigation_id,
        ExtractedFact.review_status == "pending",
    ).delete(synchronize_session=False)

    doc_filename_map = {d.id: d.original_filename for d in docs}

    for fact_dict in extracted_facts_data:
        fact_model = ExtractedFact(
            investigation_id=investigation_id,
            source_document_id=fact_dict.get("source_document_id"),
            field_name=fact_dict.get("field_name"),
            field_value=fact_dict.get("field_value"),
            source_page=fact_dict.get("source_page"),
            source_excerpt=fact_dict.get("source_excerpt"),
            confidence=int(fact_dict.get("confidence", 1.0) * 100),
            extraction_status=fact_dict.get("status", "extracted"),
            review_status="pending",
        )
        db.add(fact_model)

    # 5. Populate investigation table fields if empty or overwrite explicitly requested
    overwrite = payload.overwrite_user_edits if payload else False

    def update_field_if_eligible(current_val, new_val):
        if new_val and (overwrite or not current_val):
            return new_val
        return current_val

    inv.product_name = update_field_if_eligible(inv.product_name, incident_data.get("product_name"))
    inv.product_code = update_field_if_eligible(inv.product_code, incident_data.get("product_code"))
    inv.batch_number = update_field_if_eligible(inv.batch_number, incident_data.get("batch_number"))
    inv.manufacturing_stage = update_field_if_eligible(inv.manufacturing_stage, incident_data.get("manufacturing_stage"))
    inv.problem_statement = update_field_if_eligible(inv.problem_statement, incident_data.get("problem_statement"))
    inv.immediate_action = update_field_if_eligible(inv.immediate_action, incident_data.get("immediate_action"))
    inv.equipment_id = update_field_if_eligible(inv.equipment_id, incident_data.get("equipment_id"))
    if incident_data.get("severity"):
        inv.severity = incident_data.get("severity")

    db.commit()
    db.refresh(inv)

    # Populate source_filename in facts response
    fact_items = []
    for f in extracted_facts_data:
        doc_id = f.get("source_document_id")
        f["source_filename"] = doc_filename_map.get(doc_id, f.get("source_filename"))
        fact_items.append(ExtractedFactItem(**f))

    missing_items = [MissingInformationItem(**m) for m in missing_info_data]

    return ExtractionResponse(
        investigation_id=investigation_id,
        workflow_status=workflow_status_val,
        incident_fields=IncidentFieldsSchema(**incident_data),
        extracted_facts=fact_items,
        missing_information=missing_items,
        warnings=warnings_data,
    )


@router.get(
    "/{investigation_id}/facts",
    response_model=List[ExtractedFactItem],
    summary="List Extracted Facts with Provenance",
    description="Retrieves all extracted facts and their review status for an investigation.",
)
async def list_extracted_facts(
    investigation_id: str,
    db: Session = Depends(get_db),
):
    """Returns granular extracted facts with document provenance and review status."""
    facts = db.query(ExtractedFact).filter(ExtractedFact.investigation_id == investigation_id).all()
    results = []
    for f in facts:
        results.append(
            ExtractedFactItem(
                field_name=f.field_name,
                field_value=f.field_value,
                source_document_id=f.source_document_id,
                source_filename=f.source_document.original_filename if f.source_document else None,
                source_page=f.source_page,
                source_excerpt=f.source_excerpt,
                confidence=float(f.confidence) / 100.0,
                status=f.extraction_status,
                review_status=f.review_status,
            )
        )
    return results


@router.patch(
    "/{investigation_id}/facts/{fact_id}",
    summary="Review Extracted Fact",
    description="Human-in-the-loop validation endpoint: accept, edit, or reject an AI-extracted fact.",
)
async def review_fact(
    investigation_id: str,
    fact_id: str,
    review_status: str,  # 'accepted', 'edited', 'rejected'
    reviewer_note: Optional[str] = None,
    db: Session = Depends(get_db),
):
    """Allows a quality professional to confirm or reject an AI-extracted fact."""
    fact = db.query(ExtractedFact).filter(
        ExtractedFact.id == fact_id,
        ExtractedFact.investigation_id == investigation_id,
    ).first()

    if not fact:
        raise HTTPException(status_code=404, detail="Extracted fact not found.")

    if review_status not in {"accepted", "edited", "rejected", "pending"}:
        raise HTTPException(status_code=400, detail="Invalid review status.")

    fact.review_status = review_status
    db.commit()
    return {"message": "Fact review status updated.", "fact_id": fact_id, "review_status": review_status}


@router.patch(
    "/{investigation_id}",
    response_model=IncidentFieldsSchema,
    summary="Update Editable Incident Fields",
    description="Updates user-edited investigation and incident fields in PostgreSQL, preserving human reviewer corrections.",
)
async def update_investigation_fields(
    investigation_id: str,
    payload: UpdateInvestigationFieldsRequest,
    db: Session = Depends(get_db),
):
    """Updates editable incident fields on the investigation record."""
    inv = get_or_create_investigation(investigation_id, db)

    for field, val in payload.model_dump(exclude_unset=True).items():
        if hasattr(inv, field) and val is not None:
            setattr(inv, field, val)

    inv.updated_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(inv)

    return IncidentFieldsSchema(
        product_name=inv.product_name,
        product_code=inv.product_code,
        batch_number=inv.batch_number,
        manufacturing_stage=inv.manufacturing_stage,
        problem_statement=inv.problem_statement,
        incident_date=inv.incident_at.isoformat() if inv.incident_at else None,
        expected_result=inv.expected_result,
        observed_result=inv.observed_result,
        immediate_action=inv.immediate_action,
        equipment_id=inv.equipment_id,
        severity=inv.severity,
    )


@router.post(
    "/{investigation_id}/save",
    response_model=SaveInvestigationResponse,
    summary="Save Reviewed Investigation Dossier",
    description="Persists reviewed investigation status, reviewer sign-off notes, and verifies transactional consistency in PostgreSQL without premature closure.",
)
async def save_reviewed_investigation(
    investigation_id: str,
    payload: SaveInvestigationRequest,
    db: Session = Depends(get_db),
):
    """Persists human reviewer sign-off and state changes to PostgreSQL."""
    inv = get_or_create_investigation(investigation_id, db)

    inv.status = payload.status
    if payload.reviewer_note:
        inv.reviewer_note = payload.reviewer_note
    inv.updated_at = datetime.now(timezone.utc)

    # Calculate summary metrics
    fact_count = db.query(ExtractedFact).filter(ExtractedFact.investigation_id == investigation_id).count()
    ev_count = db.query(EvidenceRecord).filter(EvidenceRecord.investigation_id == investigation_id).count()
    gap_count = db.query(InvestigationGap).filter(InvestigationGap.investigation_id == investigation_id).count()
    cause_count = db.query(CauseCandidate).filter(CauseCandidate.investigation_id == investigation_id).count()
    confirmed_causes = db.query(CauseCandidate).filter(
        CauseCandidate.investigation_id == investigation_id,
        CauseCandidate.review_status == "confirmed",
    ).count()
    capa_count = db.query(CapaAction).filter(CapaAction.investigation_id == investigation_id).count()
    accepted_capas = db.query(CapaAction).filter(
        CapaAction.investigation_id == investigation_id,
        CapaAction.review_status == "accepted",
    ).count()

    db.commit()
    db.refresh(inv)

    return SaveInvestigationResponse(
        investigation_id=inv.id,
        reference_code=inv.reference_code,
        status=inv.status,
        saved_at=inv.updated_at.isoformat(),
        reviewer_note=inv.reviewer_note,
        summary={
            "extracted_facts": fact_count,
            "evidence_records": ev_count,
            "open_gaps": gap_count,
            "total_cause_candidates": cause_count,
            "confirmed_root_causes": confirmed_causes,
            "total_capa_actions": capa_count,
            "accepted_capa_actions": accepted_capas,
            "reviewer_name": payload.reviewer_name or "Authorized QA Investigator",
            "reviewer_role": payload.reviewer_role or "Quality Assurance Operations",
        },
    )


@router.get(
    "/search",
    summary="Search Saved Investigations",
    description="Search database for previously saved investigations by batch number, product name, product code, or reference code.",
)
async def search_investigations(
    q: Optional[str] = None,
    db: Session = Depends(get_db),
):
    """Searches PostgreSQL for saved investigations matching search terms."""
    query = db.query(Investigation).filter(
        (Investigation.product_name.isnot(None)) | (Investigation.batch_number.isnot(None))
    )
    if q and q.strip():
        term = q.strip()
        query = query.filter(
            (Investigation.batch_number.ilike(f"%{term}%"))
            | (Investigation.product_name.ilike(f"%{term}%"))
            | (Investigation.product_code.ilike(f"%{term}%"))
            | (Investigation.reference_code.ilike(f"%{term}%"))
            | (Investigation.equipment_id.ilike(f"%{term}%"))
        )
    investigations = query.order_by(Investigation.updated_at.desc()).limit(20).all()
    return [
        {
            "id": inv.id,
            "reference_code": inv.reference_code,
            "title": inv.title,
            "product_name": inv.product_name,
            "product_code": inv.product_code,
            "batch_number": inv.batch_number,
            "status": inv.status,
            "updated_at": inv.updated_at.isoformat() if inv.updated_at else None,
        }
        for inv in investigations
    ]


@router.get(
    "/check-duplicate",
    summary="Validate Duplicate Incident Parameters",
    description="Checks whether incident parameters (e.g. batch number) already exist in an existing investigation in PostgreSQL.",
)
async def check_duplicate_parameters(
    batch_number: Optional[str] = None,
    product_code: Optional[str] = None,
    exclude_id: Optional[str] = None,
    db: Session = Depends(get_db),
):
    """Validates if a batch number or product code is already recorded in another investigation."""
    if not batch_number or not batch_number.strip():
        return {
            "is_duplicate": False,
            "field": "batch_number",
            "message": "No batch number provided for duplicate check.",
            "existing_investigation": None,
        }

    clean_batch = batch_number.strip()
    query = db.query(Investigation).filter(Investigation.batch_number.ilike(clean_batch))
    if exclude_id and exclude_id.strip():
        query = query.filter(Investigation.id != exclude_id.strip())

    match = query.order_by(Investigation.updated_at.desc()).first()
    if match:
        return {
            "is_duplicate": True,
            "field": "batch_number",
            "message": f"Batch '{match.batch_number}' is already recorded under investigation {match.reference_code} (Product: {match.product_name or 'N/A'}).",
            "existing_investigation": {
                "id": match.id,
                "reference_code": match.reference_code,
                "title": match.title,
                "product_name": match.product_name,
                "product_code": match.product_code,
                "batch_number": match.batch_number,
                "status": match.status,
                "updated_at": match.updated_at.isoformat() if match.updated_at else None,
            },
        }

    return {
        "is_duplicate": False,
        "field": "batch_number",
        "message": f"Batch '{clean_batch}' is unique and not previously recorded.",
        "existing_investigation": None,
    }


@router.get(
    "/{investigation_id}",
    response_model=InvestigationDossierResponse,
    summary="Retrieve Complete Investigation Dossier",
    description="Loads the entire investigation state from PostgreSQL, including source documents, facts, evidence, gaps, RCA methods, cause candidates, and CAPA actions.",
)
async def get_investigation_dossier(
    investigation_id: str,
    db: Session = Depends(get_db),
):
    """Retrieves full investigation dossier for reloading and report generation."""
    inv = get_or_create_investigation(investigation_id, db)

    docs = db.query(SourceDocument).filter(SourceDocument.investigation_id == investigation_id).all()
    facts = db.query(ExtractedFact).filter(ExtractedFact.investigation_id == investigation_id).all()
    evs = db.query(EvidenceRecord).filter(EvidenceRecord.investigation_id == investigation_id).all()
    gaps = db.query(InvestigationGap).filter(InvestigationGap.investigation_id == investigation_id).all()
    causes = db.query(CauseCandidate).filter(CauseCandidate.investigation_id == investigation_id).all()
    capas = db.query(CapaAction).filter(CapaAction.investigation_id == investigation_id).all()

    rca_data = inv.rca_method_data or {}
    five_whys_raw = rca_data.get("five_whys_chains", [])
    fishbone_raw = rca_data.get("fishbone_categories", {})

    doc_summaries = [
        SourceDocumentSummary(
            id=d.id,
            filename=d.original_filename,
            source_type=d.source_type,
            page_count=d.page_count,
            created_at=d.created_at.isoformat() if d.created_at else None,
        )
        for d in docs
    ]

    fact_items = [
        ExtractedFactItem(
            field_name=f.field_name,
            field_value=f.field_value,
            source_document_id=f.source_document_id,
            source_filename=f.source_document.original_filename if f.source_document else None,
            source_page=f.source_page,
            source_excerpt=f.source_excerpt,
            confidence=float(f.confidence) / 100.0,
            status=f.extraction_status,
            review_status=f.review_status,
        )
        for f in facts
    ]

    ev_items = [
        EvidenceRecordItem(
            id=e.id,
            investigation_id=e.investigation_id,
            source_document_id=e.source_document_id,
            evidence_type=e.evidence_type,
            title=e.title,
            description=e.description,
            evidence_date=e.evidence_date.isoformat() if e.evidence_date else None,
            source_page=e.source_page,
            source_excerpt=e.source_excerpt,
            status=e.status,
            calibration=None,
        )
        for e in evs
    ]

    gap_items = [
        InvestigationGapItem(
            id=g.id,
            investigation_id=g.investigation_id,
            gap_type=g.gap_type,
            field_or_record=g.field_or_record,
            description=g.description,
            impact_rationale=g.impact_rationale,
            status=g.status,
            recommended_action=g.recommended_action,
            importance=g.importance,
        )
        for g in gaps
    ]

    cause_items = [
        CauseCandidateItem(
            id=c.id,
            investigation_id=c.investigation_id,
            method=c.method,
            category=c.category,
            candidate_text=c.candidate_text,
            rationale=c.rationale,
            ai_status=c.ai_status,
            review_status=c.review_status,
            reviewer_note=c.reviewer_note,
            supporting_evidence_ids=c.supporting_evidence_ids or [],
            contradicting_evidence_ids=c.contradicting_evidence_ids or [],
        )
        for c in causes
    ]

    capa_items = [
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
        for a in capas
    ]

    incident_fields_dict = {
        "product_name": inv.product_name,
        "product_code": inv.product_code,
        "batch_number": inv.batch_number,
        "manufacturing_stage": inv.manufacturing_stage,
        "problem_statement": inv.problem_statement,
        "incident_date": inv.incident_at.isoformat() if inv.incident_at else None,
        "expected_result": inv.expected_result,
        "observed_result": inv.observed_result,
        "immediate_action": inv.immediate_action,
        "equipment_id": inv.equipment_id,
        "severity": inv.severity,
    }

    stats = {
        "source_documents_count": len(doc_summaries),
        "extracted_facts_count": len(fact_items),
        "evidence_records_count": len(ev_items),
        "investigation_gaps_count": len(gap_items),
        "cause_candidates_count": len(cause_items),
        "confirmed_causes_count": sum(1 for c in cause_items if c.review_status == "confirmed"),
        "capa_actions_count": len(capa_items),
        "accepted_capa_count": sum(1 for a in capa_items if a.review_status == "accepted"),
    }

    return InvestigationDossierResponse(
        id=inv.id,
        reference_code=inv.reference_code,
        title=inv.title,
        status=inv.status,
        severity=inv.severity,
        created_at=inv.created_at.isoformat() if inv.created_at else datetime.now(timezone.utc).isoformat(),
        updated_at=inv.updated_at.isoformat() if inv.updated_at else datetime.now(timezone.utc).isoformat(),
        reviewer_note=inv.reviewer_note,
        incident_fields=incident_fields_dict,
        source_documents=doc_summaries,
        extracted_facts=fact_items,
        evidence_records=ev_items,
        investigation_gaps=gap_items,
        five_whys_chains=[FiveWhysStep(**w) for w in five_whys_raw if isinstance(w, dict)],
        fishbone_categories=FishboneCategories(**fishbone_raw) if isinstance(fishbone_raw, dict) else FishboneCategories(),
        cause_candidates=cause_items,
        capa_actions=capa_items,
        statistics=stats,
    )

