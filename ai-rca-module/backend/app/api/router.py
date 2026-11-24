from fastapi import APIRouter
from app.api.v1.health import router as health_router
from app.api.v1.documents import router as documents_router
from app.api.v1.investigations import router as investigations_router
from app.api.v1.evidence import router as evidence_router

api_router = APIRouter()

# Mount health endpoints: accessible as GET /api/health
api_router.include_router(health_router)

# Mount document intake endpoints: accessible under /api/investigations/...
api_router.include_router(documents_router)

# Mount AI extraction and investigation endpoints: accessible under /api/investigations/...
api_router.include_router(investigations_router)

# Mount evidence and gap analysis endpoints: accessible under /api/investigations/...
api_router.include_router(evidence_router)
