from typing import Optional, List, Dict, Any, Literal
from pydantic import BaseModel, Field, ConfigDict


class ChatMessageItem(BaseModel):
    """An individual message in the multi-turn conversation history."""
    role: Literal["user", "assistant", "system"]
    content: str
    timestamp: Optional[str] = None


class CopilotChatRequest(BaseModel):
    """Payload sent by the user for natural conversational interaction."""
    message: str = Field(..., min_length=1, description="Natural language user message or question")
    conversation_history: List[ChatMessageItem] = Field(
        default_factory=list,
        description="Prior conversation turns for context retention",
    )


class FieldUpdateItem(BaseModel):
    """Details of a field updated dynamically from conversational extraction."""
    old_value: Optional[Any] = None
    new_value: Any
    confidence: Optional[float] = 1.0
    field_label: Optional[str] = None


class CopilotChatResponse(BaseModel):
    """Structured response from the Conversational Copilot."""
    assistant_message: str = Field(..., description="Conversational, natural language reply from the assistant")
    reply: Optional[str] = Field(default=None, description="Alias for assistant_message")
    intent: Literal[
        "general_question",
        "add_incident_info",
        "update_field",
        "evidence_query",
        "run_5_whys",
        "suggest_capa",
        "summary_query",
        "clarification",
        "retrieve_investigation",
        "reset_session",
    ] = Field(default="general_question", description="Classified intent of the user message")
    action_status: Literal["success", "no_action", "clarification_needed", "error"] = Field(
        default="success",
        description="Execution status of any backend state mutation",
    )
    field_updates: Dict[str, Any] = Field(
        default_factory=dict,
        description="Map of updated field names to new values or FieldUpdateItem",
    )
    extracted_facts: List[Dict[str, Any]] = Field(default_factory=list)
    five_whys_chains: List[Dict[str, Any]] = Field(default_factory=list)
    five_whys_chain: Optional[List[Dict[str, Any]]] = Field(default=None, description="Alias for five_whys_chains")
    cause_candidates: List[Dict[str, Any]] = Field(default_factory=list)
    capa_recommendations: List[Dict[str, Any]] = Field(default_factory=list)
    capa_actions: Optional[List[Dict[str, Any]]] = Field(default=None, description="Alias for capa_recommendations")
    investigation_gaps: List[Dict[str, Any]] = Field(default_factory=list)
    missing_gaps: Optional[List[Dict[str, Any]]] = Field(default=None, description="Alias for investigation_gaps")
    investigation_status: str = Field(default="draft", description="Current lifecycle status of the investigation")
    retrieved_investigation_id: Optional[str] = Field(default=None, description="ID of retrieved existing investigation")
    reference_code: Optional[str] = Field(default=None, description="Reference code of the investigation (e.g. RCA-2026-001)")
    is_existing_record: bool = Field(default=False, description="Whether this investigation exists in PostgreSQL database")

    model_config = ConfigDict(from_attributes=True)
