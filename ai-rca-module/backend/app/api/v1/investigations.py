import logging
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.database.session import get_db
from app.models.investigation import Investigation, SourceDocument, ExtractedFact
from app.schemas.extraction import (
    ExtractionRequest,
    ExtractionResponse,
    ExtractedFactItem,
    MissingInformationItem,
    IncidentFieldsSchema,
)
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
