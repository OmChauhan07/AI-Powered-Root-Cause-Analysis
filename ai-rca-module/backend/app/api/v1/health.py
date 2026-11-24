from datetime import datetime, timezone
from fastapi import APIRouter
from app.core.config import settings
from app.schemas.health import HealthResponse
from app.database.session import check_db_connection
from app.ai.groq_client import check_groq_status

router = APIRouter(tags=["Health"])


@router.get(
    "/health",
    response_model=HealthResponse,
    summary="System Health & Diagnostic Check",
    description="Returns the health status of the API, environment metadata, and connectivity to PostgreSQL and Groq.",
)
async def health_check() -> HealthResponse:
    """Verifies backend system operational status and dependent services."""
    db_status = check_db_connection()
    groq_status = check_groq_status()

    return HealthResponse(
        status="ok",
        version=settings.VERSION,
        environment=settings.ENVIRONMENT,
        timestamp=datetime.now(timezone.utc),
        services={
            "api": {"status": "healthy", "service": settings.PROJECT_NAME},
            "database": db_status,
            "ai_engine": groq_status,
        },
    )
