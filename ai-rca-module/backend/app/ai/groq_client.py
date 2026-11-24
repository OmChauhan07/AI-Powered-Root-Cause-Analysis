import logging
from typing import Optional
from app.core.config import settings

logger = logging.getLogger(__name__)


def get_groq_llm():
    """Initializes and returns the ChatGroq model instance if an API key is provided."""
    if not settings.GROQ_API_KEY or settings.GROQ_API_KEY.startswith("gsk_your_groq"):
        logger.warning("Groq API key is not configured. AI LLM calls will operate in placeholder/mock mode.")
        return None

    try:
        from langchain_groq import ChatGroq

        return ChatGroq(
            api_key=settings.GROQ_API_KEY,
            model_name=settings.GROQ_MODEL,
            temperature=0.2,
        )
    except Exception as exc:
        logger.error("Failed to initialize Groq LLM client: %s", str(exc))
        return None


def check_groq_status() -> dict:
    """Verifies whether Groq client has credentials configured."""
    has_key = bool(settings.GROQ_API_KEY and not settings.GROQ_API_KEY.startswith("gsk_your_groq"))
    return {
        "status": "ready" if has_key else "unconfigured",
        "message": "Groq API key configured" if has_key else "GROQ_API_KEY missing or placeholder in .env",
        "model": settings.GROQ_MODEL,
    }
