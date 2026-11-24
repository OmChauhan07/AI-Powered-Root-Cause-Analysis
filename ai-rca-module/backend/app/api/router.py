from fastapi import APIRouter
from app.api.v1.health import router as health_router

api_router = APIRouter()

# Mount health endpoints: accessible as GET /api/health and GET /health
api_router.include_router(health_router)
