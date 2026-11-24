import logging
from typing import List, Dict, Any
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.database.session import get_db
from app.models.investigation import (
    Investigation,
    SourceDocument,
    EvidenceRecord,
    InvestigationGap,
    CauseCandidate,
    CapaAction,
)
from app.schemas.copilot import (
    CopilotChatRequest,
    CopilotChatResponse,
)
from app.ai.nodes import conversational_copilot_node
from app.api.v1.documents import get_or_create_investigation

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/investigations", tags=["Conversational AI Copilot"])


@router.post(
    "/{investigation_id}/copilot/chat",
    response_model=CopilotChatResponse,
    summary="Natural Conversational Copilot Chat",
    description="LLM-like conversational interaction supporting intent classification, live form updates, 5 Whys, CAPA, and evidence queries.",
)
async def chat_with_copilot(
    investigation_id: str,
    payload: CopilotChatRequest,
    db: Session = Depends(get_db),
):
    """Executes conversational chat, synchronizing the investigation state in real-time."""
    inv = get_or_create_investigation(investigation_id, db)

    # 1. Fetch current investigation context
    docs = db.query(SourceDocument).filter(SourceDocument.investigation_id == investigation_id).all()
    evs = db.query(EvidenceRecord).filter(EvidenceRecord.investigation_id == investigation_id).all()
    gaps = db.query(InvestigationGap).filter(InvestigationGap.investigation_id == investigation_id).all()
    causes = db.query(CauseCandidate).filter(CauseCandidate.investigation_id == investigation_id).all()
    capas = db.query(CapaAction).filter(CapaAction.investigation_id == investigation_id).all()

    rca_data = inv.rca_method_data or {}
    five_whys_raw = rca_data.get("five_whys_chains", [])

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

    source_docs_list = [
        {"id": d.id, "filename": d.original_filename, "source_type": d.source_type}
        for d in docs
    ]
    ev_records_list = [
        {"id": e.id, "title": e.title, "evidence_type": e.evidence_type, "description": e.description}
        for e in evs
    ]
    gaps_list = [
        {"id": g.id, "field_or_record": g.field_or_record, "status": g.status, "description": g.description}
        for g in gaps
    ]
    causes_list = [
        {
            "id": c.id,
            "candidate_text": c.candidate_text,
            "rationale": c.rationale,
            "ai_status": c.ai_status,
            "review_status": c.review_status,
            "category": c.category,
        }
        for c in causes
    ]
    capa_list = [
        {
            "id": a.id,
            "action_type": a.action_type,
            "title": a.title,
            "action_text": a.action_text,
            "rationale": a.rationale,
            "owner_role": a.owner_role,
            "effectiveness_check": a.effectiveness_check,
            "review_status": a.review_status,
        }
        for a in capas
    ]

    # 2. Invoke Conversational Copilot Node
    history_dicts = [h.model_dump() for h in payload.conversation_history]
    copilot_result = conversational_copilot_node(
        user_message=payload.message,
        conversation_history=history_dicts,
        incident_fields=incident_fields_dict,
        source_documents=source_docs_list,
        evidence_records=ev_records_list,
        investigation_gaps=gaps_list,
        five_whys_chains=five_whys_raw,
        cause_candidates=causes_list,
        capa_recommendations=capa_list,
        investigation_status=inv.status,
    )

    # 3. Apply any field updates to database
    field_updates = copilot_result.get("field_updates", {})
    if field_updates:
        for f_name, f_val in field_updates.items():
            if hasattr(inv, f_name) and f_val is not None:
                setattr(inv, f_name, f_val)
        db.commit()
        db.refresh(inv)

    # 4. Save newly generated 5 Whys or CAPA if executed during chat
    new_5whys = copilot_result.get("five_whys_chains", [])
    if new_5whys:
        inv.rca_method_data = {"five_whys_chains": new_5whys}
        db.commit()

    new_causes = copilot_result.get("cause_candidates", [])
    if new_causes and not causes:
        for c_dict in new_causes:
            c_row = CauseCandidate(
                investigation_id=investigation_id,
                method="five_whys",
                category=c_dict.get("category", "machine"),
                candidate_text=c_dict.get("candidate_text", ""),
                rationale=c_dict.get("rationale", ""),
                ai_status=c_dict.get("ai_status", "hypothesis"),
                review_status="pending",
                supporting_evidence_ids=c_dict.get("supporting_evidence_ids", []),
                contradicting_evidence_ids=c_dict.get("contradicting_evidence_ids", []),
            )
            db.add(c_row)
        db.commit()

    new_capas = copilot_result.get("capa_recommendations", [])
    if new_capas and not capas:
        for a_dict in new_capas:
            a_row = CapaAction(
                investigation_id=investigation_id,
                action_type=a_dict.get("action_type", "corrective"),
                title=a_dict.get("title", "Recommended Action"),
                action_text=a_dict.get("action_text", ""),
                rationale=a_dict.get("rationale", ""),
                owner_role=a_dict.get("owner_role", "Quality Assurance Metrology Lead"),
                effectiveness_check=a_dict.get("effectiveness_check"),
                review_status="pending_review",
            )
            db.add(a_row)
        db.commit()

    asst_msg = copilot_result.get("assistant_message", "I have reviewed your message.")
    fw_chains = copilot_result.get("five_whys_chains", [])
    if fw_chains and not any(s.get("is_root_cause") for s in fw_chains):
        fw_chains[-1]["is_root_cause"] = True

    capa_recs = copilot_result.get("capa_recommendations", [])
    for a in capa_recs:
        cat = a.get("action_type") or a.get("category") or "corrective"
        a["category"] = cat
        a["action_type"] = cat

    inv_gaps = copilot_result.get("investigation_gaps", [])

    return CopilotChatResponse(
        assistant_message=asst_msg,
        reply=asst_msg,
        intent=copilot_result.get("intent", "general_question"),
        action_status=copilot_result.get("action_status", "success"),
        field_updates=field_updates,
        five_whys_chains=fw_chains,
        five_whys_chain=fw_chains,
        cause_candidates=copilot_result.get("cause_candidates", []),
        capa_recommendations=capa_recs,
        capa_actions=capa_recs,
        investigation_gaps=inv_gaps,
        missing_gaps=inv_gaps,
        investigation_status=inv.status,
    )
