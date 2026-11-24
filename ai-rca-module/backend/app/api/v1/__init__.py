"""API V1 endpoints package."""

from app.api.v1.health import router as health_router
from app.api.v1.documents import router as documents_router

__all__ = ["health_router", "documents_router"]
