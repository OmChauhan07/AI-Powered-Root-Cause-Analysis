import re
import logging
from datetime import datetime, date, timedelta, timezone
from typing import List, Dict, Any, Optional, Tuple
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

MONTHS = {
    'january': 1, 'jan': 1, 'february': 2, 'feb': 2, 'march': 3, 'mar': 3,
    'april': 4, 'apr': 4, 'may': 5, 'june': 6, 'jun': 6, 'july': 7, 'jul': 7,
    'august': 8, 'aug': 8, 'september': 9, 'sep': 9, 'sept': 9,
    'october': 10, 'oct': 10, 'november': 11, 'nov': 11, 'december': 12, 'dec': 12
}


def parse_temporal_criteria(text: str) -> Dict[str, Any]:
    """Extracts relative and absolute date criteria and sort ordering (first vs last) from natural language."""
    lower = text.lower()
    now_utc = datetime.now(timezone.utc)
    today = now_utc.date()

    target_date = None
    date_label = None

    # 1. Relative keywords
    if "today" in lower:
        target_date = today
        date_label = "today"
    elif "yesterday" in lower:
        target_date = today - timedelta(days=1)
        date_label = "yesterday"
    elif "tomorrow" in lower:
        target_date = today + timedelta(days=1)
        date_label = "tomorrow"
    else:
        # 2. ISO YYYY-MM-DD
        iso_m = re.search(r'\b(\d{4})[-/](\d{1,2})[-/](\d{1,2})\b', text)
        if iso_m:
            y, m, d = int(iso_m.group(1)), int(iso_m.group(2)), int(iso_m.group(3))
            try:
                target_date = date(y, m, d)
                date_label = str(target_date)
            except ValueError:
                pass

        # 3. DD-MM-YYYY or DD/MM/YYYY
        if not target_date:
            dmy_m = re.search(r'\b(\d{1,2})[-/](\d{1,2})[-/](\d{4})\b', text)
            if dmy_m:
                d, m, y = int(dmy_m.group(1)), int(dmy_m.group(2)), int(dmy_m.group(3))
                try:
                    target_date = date(y, m, d)
                    date_label = str(target_date)
                except ValueError:
                    pass

        # 4. Day Month (e.g. 20 November, 20th Nov 2026)
        if not target_date:
            dm_m = re.search(r'\b(\d{1,2})(?:st|nd|rd|th)?\s+([a-zA-Z]+)(?:\s+(\d{4}))?\b', lower)
            if dm_m and dm_m.group(2) in MONTHS:
                d = int(dm_m.group(1))
                m = MONTHS[dm_m.group(2)]
                y = int(dm_m.group(3)) if dm_m.group(3) else today.year
                try:
                    target_date = date(y, m, d)
                    date_label = f"{d} {dm_m.group(2).title()} {y}"
                except ValueError:
                    pass

        # 5. Month Day (e.g. November 20, Nov 20th, 2026)
        if not target_date:
            md_m = re.search(r'\b([a-zA-Z]+)\s+(\d{1,2})(?:st|nd|rd|th)?(?:\s*,?\s*(\d{4}))?\b', lower)
            if md_m and md_m.group(1) in MONTHS:
                m = MONTHS[md_m.group(1)]
                d = int(md_m.group(2))
                y = int(md_m.group(3)) if md_m.group(3) else today.year
                try:
                    target_date = date(y, m, d)
                    date_label = f"{d} {md_m.group(1).title()} {y}"
                except ValueError:
                    pass

    # Determine order: 'first' / 'earliest' vs 'last' / 'latest' (default: 'desc')
    order = "desc"
    order_label = "latest"
    if any(w in lower for w in ["first", "earliest", "initial", "oldest", "starting"]):
        order = "asc"
        order_label = "first"
    elif any(w in lower for w in ["last", "latest", "most recent", "newest"]):
        order = "desc"
        order_label = "last"

    is_temporal = (target_date is not None) or any(w in lower for w in [
        "last saved", "latest data", "first data", "most recent", "earliest data",
        "today's", "todays", "yesterday's", "yesterdays", "tomorrow's", "tomorrows", "from this date"
    ])

    return {
        "target_date": target_date,
        "date_label": date_label,
        "order": order,
        "order_label": order_label,
        "is_temporal": is_temporal,
    }


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
        "retrieve", "retrive", "find ", "lookup", "look up", "load ", "fetch",
        "search", "what was saved", "get previous", "show saved",
        "open investigation", "find incident", "retrieve incident",
        "pull up", "query ", "previous investigation", "saved investigation",
        "past deviation", "prior incident", "restore ", "last saved", "first data",
        "latest data", "today's", "todays", "yesterday's", "yesterdays", "tomorrow's", "tomorrows", "from this date"
    ]
    if any(t in lower for t in triggers):
        return True
    return parse_temporal_criteria(text)["is_temporal"]


def search_saved_investigation(user_message: str, current_inv_id: str, db: Session) -> Tuple[Optional[Investigation], Optional[str]]:
    """Finds a saved investigation in PostgreSQL matching user query parameters or time criteria."""
    temporal = parse_temporal_criteria(user_message)

    base_query = db.query(Investigation).filter(
        (Investigation.product_name.isnot(None)) | (Investigation.batch_number.isnot(None))
    )

    # 1. Temporal search with specific target_date
    if temporal["target_date"]:
        t_date = temporal["target_date"]
        start_tz = datetime.combine(t_date, datetime.min.time()).replace(tzinfo=timezone.utc)
        end_tz = datetime.combine(t_date, datetime.max.time()).replace(tzinfo=timezone.utc)
        date_filter = (
            ((Investigation.updated_at >= start_tz) & (Investigation.updated_at <= end_tz)) |
            ((Investigation.created_at >= start_tz) & (Investigation.created_at <= end_tz)) |
            ((Investigation.incident_at >= start_tz) & (Investigation.incident_at <= end_tz))
        )
        t_query = base_query.filter(date_filter)

        # Check if an entity keyword is also in the query
        b_m = re.search(r'\b(BATCH-[A-Za-z0-9-]+)\b', user_message, re.IGNORECASE)
        if b_m:
            t_query = t_query.filter(Investigation.batch_number.ilike(f"%{b_m.group(1)}%"))

        p_m = re.search(r'(?:product(?:\s+name)?|for\s+product)\s*([A-Za-z0-9-]+)', user_message, re.IGNORECASE)
        if p_m and p_m.group(1).lower() not in ['name', 'product', 'is', 'the', 'for', 'data', 'this', 'last', 'first']:
            t_query = t_query.filter(Investigation.product_name.ilike(f"%{p_m.group(1)}%"))

        if temporal["order"] == "asc":
            match = t_query.order_by(Investigation.updated_at.asc()).first()
        else:
            match = t_query.order_by(Investigation.updated_at.desc()).first()

        desc = f"{temporal['date_label']}'s {temporal['order_label']} saved investigation"
        return match, desc

    # 2. Temporal search without specific date (e.g. "retrieve the latest saved data" or "earliest data")
    if temporal["is_temporal"]:
        if temporal["order"] == "asc":
            match = base_query.order_by(Investigation.updated_at.asc()).first()
        else:
            match = base_query.order_by(Investigation.updated_at.desc()).first()
        desc = f"the {temporal['order_label']} saved investigation"
        if match:
            return match, desc

    # 3. Entity search: Try extracting batch number
    b_match = re.search(r'(?:batch(?:\s+number)?|lot(?:\s+number)?)\s*(?:is|:|=|\s+for|\s+of)?\s*([A-Za-z0-9_-]+)', user_message, re.IGNORECASE) or \
              re.search(r'\b(BATCH-[A-Za-z0-9-]+)\b', user_message, re.IGNORECASE)
    batch_val = b_match.group(1).strip() if b_match else None

    # Try extracting product code
    c_match = re.search(r'(?:product\s+code|item\s+code|code)\s*(?:is|:|=|\s+for|\s+of)?\s*([A-Za-z0-9_-]+)', user_message, re.IGNORECASE) or \
              re.search(r'\b([A-Z0-9]+-[A-Z0-9]+-[0-9]+)\b', user_message)
    code_val = c_match.group(1).strip() if c_match else None

    # Try extracting reference code
    r_match = re.search(r'\b(RCA-[A-Za-z0-9-]+)\b', user_message, re.IGNORECASE)
    ref_val = r_match.group(1).strip() if r_match else None

    # Try extracting product name
    p_match = re.search(r'(?:product(?:\s+name)?|for\s+product|drug\s+product|substance)\s*(?:is|:|=|\s+for|\s+of)?\s*([A-Za-z0-9-]+)', user_message, re.IGNORECASE)
    prod_val = p_match.group(1).strip() if p_match else None

    # Entity after "for", "about", "investigation"
    gen_match = re.search(r'(?:for|about|record|investigation)\s+([A-Za-z0-9_-]+)', user_message, re.IGNORECASE)
    gen_val = gen_match.group(1).strip() if gen_match else None

    if batch_val and batch_val.lower() not in ['number', 'is', 'the', 'for', 'a', 'to', 'data']:
        match = base_query.filter(Investigation.batch_number.ilike(f"%{batch_val}%")).order_by(Investigation.updated_at.desc()).first()
        if match:
            return match, f"investigation for batch {match.batch_number}"

    if ref_val:
        match = base_query.filter(Investigation.reference_code.ilike(f"%{ref_val}%")).order_by(Investigation.updated_at.desc()).first()
        if match:
            return match, f"investigation {match.reference_code}"

    if code_val and code_val.lower() not in ['code', 'is', 'the', 'for', 'a', 'data']:
        match = base_query.filter(Investigation.product_code.ilike(f"%{code_val}%")).order_by(Investigation.updated_at.desc()).first()
        if match:
            return match, f"investigation for product code {match.product_code}"

    if prod_val and prod_val.lower() not in ['name', 'product', 'is', 'the', 'for', 'deviation', 'stage', 'data']:
        match = base_query.filter(Investigation.product_name.ilike(f"%{prod_val}%")).order_by(Investigation.updated_at.desc()).first()
        if match:
            return match, f"investigation for product {match.product_name}"

    if gen_val and gen_val.lower() not in ['the', 'this', 'that', 'saved', 'previous', 'an', 'a', 'it', 'me', 'batch', 'product', 'data']:
        match = base_query.filter(
            (Investigation.batch_number.ilike(f"%{gen_val}%")) |
            (Investigation.product_name.ilike(f"%{gen_val}%")) |
            (Investigation.product_code.ilike(f"%{gen_val}%")) |
            (Investigation.equipment_id.ilike(f"%{gen_val}%"))
        ).order_by(Investigation.updated_at.desc()).first()
        if match:
            return match, f"investigation matching '{gen_val}'"

    # Search each candidate token >= 4 chars
    tokens = [t for t in re.findall(r'[A-Za-z0-9_-]+', user_message) if len(t) >= 4 and t.lower() not in [
        'retrieve', 'information', 'saved', 'before', 'product', 'batch', 'investigation', 'incident', 'which', 'about', 'from', 'other', 'something', 'data', 'today', 'yesterday', 'tomorrow'
    ]]
    for t in tokens:
        match = base_query.filter(
            (Investigation.batch_number.ilike(f"%{t}%")) |
            (Investigation.product_name.ilike(f"%{t}%")) |
            (Investigation.product_code.ilike(f"%{t}%"))
        ).order_by(Investigation.updated_at.desc()).first()
        if match:
            return match, f"investigation matching '{t}'"

    return None, None


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
        match, desc = search_saved_investigation(payload.message, investigation_id, db)
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

            if desc:
                asst_msg = (
                    f"I retrieved {desc} ({match.reference_code}) for product '{match.product_name}' "
                    f"(Batch: {match.batch_number}). All parameters have been populated into the live form and the "
                    f"5 Whys causal analysis and CAPA recommendations are restored. You can now update or change any fields directly."
                )
            else:
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
            temp_crit = parse_temporal_criteria(payload.message)
            if temp_crit.get("target_date"):
                date_str = temp_crit["target_date"].strftime("%Y-%m-%d")
                asst_msg = (
                    f"I searched the database for an investigation from {date_str}, but no matching saved record was found. "
                    f"You can provide incident parameters in the chat or specify another date or batch number."
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

    # 3. Apply any field updates to database with duplicate and redundant fill prevention
    raw_field_updates = copilot_result.get("field_updates", {})
    duplicate_warning = None
    duplicate_batch_info = None

    # A. Redundant duplicate re-fill prevention:
    # Check if fields are already filled with these exact values in the current form
    identical_fields = []
    field_updates = {}
    for f_name, f_val in raw_field_updates.items():
        curr_val = getattr(inv, f_name, None)
        if curr_val is not None and str(curr_val).strip().lower() == str(f_val).strip().lower():
            identical_fields.append(f_name)
        else:
            field_updates[f_name] = f_val

    if raw_field_updates and not field_updates and copilot_result.get("intent") in ["add_incident_info", "update_field"]:
        identical_names = [f.replace("_", " ") for f in identical_fields]
        copilot_result["assistant_message"] = (
            f"The field(s) {', '.join(identical_names)} are already filled with these exact details in the form. "
            f"No duplicate changes were applied."
        )

    # B. Database duplicate check:
    # Check if the batch number is already recorded in another saved investigation
    candidate_batch = raw_field_updates.get("batch_number") or inv.batch_number
    if candidate_batch and isinstance(candidate_batch, str) and candidate_batch.strip():
        c_batch_clean = candidate_batch.strip()
        dup_inv = db.query(Investigation).filter(
            Investigation.batch_number.ilike(c_batch_clean),
            Investigation.id != inv.id,
        ).order_by(Investigation.updated_at.desc()).first()

        if dup_inv:
            duplicate_warning = (
                f"⚠️ Duplicate Batch Notice: Batch '{c_batch_clean}' is already recorded in saved investigation "
                f"{dup_inv.reference_code} (Product: {dup_inv.product_name or 'N/A'})."
            )
            duplicate_batch_info = {
                "id": dup_inv.id,
                "reference_code": dup_inv.reference_code,
                "product_name": dup_inv.product_name,
                "batch_number": dup_inv.batch_number,
                "status": dup_inv.status,
            }
            if raw_field_updates.get("batch_number"):
                asst_text = copilot_result.get("assistant_message", "")
                copilot_result["assistant_message"] = (
                    f"{duplicate_warning} If this is the same investigation, you can ask me to retrieve it or update it directly. "
                    f"Otherwise, I have populated the form for your new record.\n\n{asst_text}"
                )

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
        duplicate_warning=duplicate_warning,
        duplicate_batch_info=duplicate_batch_info,
    )
