import re
import logging
from typing import List, Dict, Any, Optional
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
from app.ai.nodes import (
    conversational_copilot_node,
    _execute_deterministic_rca_methods,
    _execute_deterministic_capa,
)
from app.api.v1.documents import get_or_create_investigation

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/investigations", tags=["Conversational AI Copilot"])


def is_reset_query(text: str) -> bool:
    """Detects if the user is asking to start a fresh chat or reset the workspace."""
    lower = text.lower().strip()
    return any(r in lower for r in [
        "start a new chat", "new chat", "new investigation", 
        "clear form", "clear the form", "reset session", 
        "reset investigation", "start over", "blank form"
    ])


def is_retrieval_query(text: str) -> bool:
    """Detects if the user wants to lookup or retrieve a previously saved investigation."""
    lower = text.lower()
    triggers = [
        "retrieve", "find ", "lookup", "look up", "load ", "fetch",
        "search", "what was saved", "get previous", "show saved",
        "open investigation", "find incident", "retrieve incident",
        "pull up", "query ", "previous investigation", "saved investigation",
        "past deviation", "prior incident", "restore "
    ]
    return any(t in lower for t in triggers)


def search_saved_investigation(user_message: str, current_inv_id: str, db: Session) -> Optional[Investigation]:
    """Finds a saved investigation in PostgreSQL matching user query parameters."""
    # 1. Try extracting batch number
    b_match = re.search(r'(?:batch(?:\s+number)?|lot(?:\s+number)?)\s*(?:is|:|=|\s+for|\s+of)?\s*([A-Za-z0-9_-]+)', user_message, re.IGNORECASE) or \
              re.search(r'\b(BATCH-[A-Za-z0-9-]+)\b', user_message, re.IGNORECASE)
    batch_val = b_match.group(1).strip() if b_match else None

    # 2. Try extracting product code
    c_match = re.search(r'(?:product\s+code|item\s+code|code)\s*(?:is|:|=|\s+for|\s+of)?\s*([A-Za-z0-9_-]+)', user_message, re.IGNORECASE) or \
              re.search(r'\b([A-Z0-9]+-[A-Z0-9]+-[0-9]+)\b', user_message)
    code_val = c_match.group(1).strip() if c_match else None

    # 3. Try extracting reference code
    r_match = re.search(r'\b(RCA-[A-Za-z0-9-]+)\b', user_message, re.IGNORECASE)
    ref_val = r_match.group(1).strip() if r_match else None

    # 4. Try extracting product name
    p_match = re.search(r'(?:product(?:\s+name)?|for\s+product|drug\s+product|substance)\s*(?:is|:|=|\s+for|\s+of)?\s*([A-Za-z0-9-]+)', user_message, re.IGNORECASE)
    prod_val = p_match.group(1).strip() if p_match else None

    # 5. Entity after "for", "about", "investigation"
    gen_match = re.search(r'(?:for|about|record|investigation)\s+([A-Za-z0-9_-]+)', user_message, re.IGNORECASE)
    gen_val = gen_match.group(1).strip() if gen_match else None

    base_query = db.query(Investigation).filter(
        (Investigation.product_name.isnot(None)) | (Investigation.batch_number.isnot(None))
    )

    if batch_val and batch_val.lower() not in ['number', 'is', 'the', 'for', 'a', 'to']:
        match = base_query.filter(Investigation.batch_number.ilike(f"%{batch_val}%")).order_by(Investigation.updated_at.desc()).first()
        if match:
            return match

    if ref_val:
        match = base_query.filter(Investigation.reference_code.ilike(f"%{ref_val}%")).order_by(Investigation.updated_at.desc()).first()
        if match:
            return match

    if code_val and code_val.lower() not in ['code', 'is', 'the', 'for', 'a']:
        match = base_query.filter(Investigation.product_code.ilike(f"%{code_val}%")).order_by(Investigation.updated_at.desc()).first()
        if match:
            return match

    if prod_val and prod_val.lower() not in ['name', 'product', 'is', 'the', 'for', 'deviation', 'stage']:
        match = base_query.filter(Investigation.product_name.ilike(f"%{prod_val}%")).order_by(Investigation.updated_at.desc()).first()
        if match:
            return match

    if gen_val and gen_val.lower() not in ['the', 'this', 'that', 'saved', 'previous', 'an', 'a', 'it', 'me', 'batch', 'product']:
        match = base_query.filter(
            (Investigation.batch_number.ilike(f"%{gen_val}%")) |
            (Investigation.product_name.ilike(f"%{gen_val}%")) |
            (Investigation.product_code.ilike(f"%{gen_val}%")) |
            (Investigation.equipment_id.ilike(f"%{gen_val}%"))
        ).order_by(Investigation.updated_at.desc()).first()
        if match:
            return match

    # Search each candidate token >= 4 chars
    tokens = [t for t in re.findall(r'[A-Za-z0-9_-]+', user_message) if len(t) >= 4 and t.lower() not in [
        'retrieve', 'information', 'saved', 'before', 'product', 'batch', 'investigation', 'incident', 'which', 'about', 'from', 'other', 'something'
    ]]
    for t in tokens:
        match = base_query.filter(
            (Investigation.batch_number.ilike(f"%{t}%")) |
            (Investigation.product_name.ilike(f"%{t}%")) |
            (Investigation.product_code.ilike(f"%{t}%"))
        ).order_by(Investigation.updated_at.desc()).first()
        if match:
            return match

    return None


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
    # 0. Check if user is asking to start a fresh chat or reset session
    if is_reset_query(payload.message):
        return CopilotChatResponse(
            assistant_message="I have reset the workspace for a new investigation session. The live form and investigation state have been cleared so you can log a fresh deviation.",
            reply="I have reset the workspace for a new investigation session. The live form and investigation state have been cleared so you can log a fresh deviation.",
            intent="reset_session",
            action_status="success",
            field_updates={
                "product_name": "",
                "product_code": "",
                "batch_number": "",
                "manufacturing_stage": "",
                "problem_statement": "",
                "incident_date": "",
                "expected_result": "",
                "observed_result": "",
                "immediate_action": "",
                "equipment_id": "",
                "severity": "medium",
            },
            five_whys_chains=[],
            cause_candidates=[],
            capa_recommendations=[],
            investigation_gaps=[],
            is_existing_record=False,
            investigation_status="draft",
        )

    # 1. Check if user is asking to retrieve a previously saved investigation
    if is_retrieval_query(payload.message):
        match = search_saved_investigation(payload.message, investigation_id, db)
        if match:
            retrieved_fields = {
                "product_name": match.product_name or "",
                "product_code": match.product_code or "",
                "batch_number": match.batch_number or "",
                "manufacturing_stage": match.manufacturing_stage or "",
                "problem_statement": match.problem_statement or "",
                "incident_date": match.incident_at.isoformat() if match.incident_at else None,
                "expected_result": match.expected_result,
                "observed_result": match.observed_result,
                "immediate_action": match.immediate_action or "",
                "equipment_id": match.equipment_id or "",
                "severity": match.severity or "medium",
            }
            # Fetch 5 Whys
            rca_data = match.rca_method_data or {}
            match_5whys = rca_data.get("five_whys_chains", [])
            if not match_5whys and match.product_name:
                res = _execute_deterministic_rca_methods("five_whys", retrieved_fields, [])
                match_5whys = res.get("five_whys_chains", [])

            # Fetch causes
            m_causes = db.query(CauseCandidate).filter(CauseCandidate.investigation_id == match.id).all()
            causes_list = [
                {
                    "id": c.id,
                    "candidate_text": c.candidate_text,
                    "rationale": c.rationale,
                    "ai_status": c.ai_status,
                    "review_status": c.review_status,
                    "category": c.category,
                }
                for c in m_causes
            ]
            if not causes_list and match_5whys:
                causes_list = [
                    {
                        "id": f"cause-{i+1}",
                        "candidate_text": step.get("answer", ""),
                        "rationale": step.get("rationale", ""),
                        "ai_status": "evidence_supported_pending_review" if step.get("is_root_cause") else "hypothesis",
                        "review_status": "pending",
                        "category": "machine" if "sensor" in step.get("answer", "").lower() else "process",
                    }
                    for i, step in enumerate(match_5whys)
                ]

            # Fetch CAPAs
            m_capas = db.query(CapaAction).filter(CapaAction.investigation_id == match.id).all()
            capas_list = [
                {
                    "id": a.id,
                    "action_type": a.action_type,
                    "category": a.action_type,
                    "title": a.title,
                    "action_text": a.action_text,
                    "rationale": a.rationale,
                    "owner_role": a.owner_role,
                    "effectiveness_check": a.effectiveness_check,
                    "review_status": a.review_status,
                }
                for a in m_capas
            ]
            if not capas_list and match.product_name:
                capa_res = _execute_deterministic_capa(causes_list, [], [], retrieved_fields, [])
                capas_list = capa_res.get("capa_recommendations", [])

            # Fetch gaps
            m_gaps = db.query(InvestigationGap).filter(InvestigationGap.investigation_id == match.id).all()
            gaps_list = [
                {
                    "id": g.id,
                    "field_or_record": g.field_or_record,
                    "status": g.status,
                    "description": g.description,
                }
                for g in m_gaps
            ]

            asst_msg = (
                f"I found the previously saved investigation {match.reference_code} for product '{match.product_name}' "
                f"(Batch: {match.batch_number}). I have retrieved all parameters into the live form and restored "
                f"the 5 Whys causal analysis and CAPA recommendations. You can now update or change any fields directly."
            )
            return CopilotChatResponse(
                assistant_message=asst_msg,
                reply=asst_msg,
                intent="retrieve_investigation",
                action_status="success",
                field_updates=retrieved_fields,
                five_whys_chains=match_5whys,
                five_whys_chain=match_5whys,
                cause_candidates=causes_list,
                capa_recommendations=capas_list,
                capa_actions=capas_list,
                investigation_gaps=gaps_list,
                missing_gaps=gaps_list,
                retrieved_investigation_id=match.id,
                reference_code=match.reference_code,
                is_existing_record=True,
                investigation_status=match.status,
            )
        else:
            asst_msg = (
                f"I searched the database for an investigation matching your query, but no matching saved record was found. "
                f"You can provide incident parameters in the chat to start a new investigation."
            )
            return CopilotChatResponse(
                assistant_message=asst_msg,
                reply=asst_msg,
                intent="retrieve_investigation",
                action_status="no_action",
                field_updates={},
                five_whys_chains=[],
                cause_candidates=[],
                capa_recommendations=[],
                investigation_gaps=[],
                is_existing_record=False,
                investigation_status="draft",
            )

    inv = get_or_create_investigation(investigation_id, db)

    # 2. Fetch current investigation context
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

    is_existing = bool(
        (inv.status and inv.status != "draft")
        or (inv.batch_number and inv.product_name)
    )

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
        retrieved_investigation_id=inv.id,
        reference_code=inv.reference_code,
        is_existing_record=is_existing,
    )
