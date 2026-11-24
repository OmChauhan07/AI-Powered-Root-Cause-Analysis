"""API V1 endpoints package."""

from app.api.v1.health import router as health_router

__all__ = ["health_router"]
