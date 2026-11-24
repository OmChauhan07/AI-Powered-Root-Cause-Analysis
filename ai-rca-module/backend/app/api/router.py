from fastapi import APIRouter
from app.api.v1.health import router as health_router
from app.api.v1.documents import router as documents_router
from app.api.v1.investigations import router as investigations_router
from app.api.v1.evidence import router as evidence_router
from app.api.v1.rca_methods import router as rca_methods_router
from app.api.v1.assessment import router as assessment_router
from app.api.v1.capa import router as capa_router

api_router = APIRouter()

# Mount health endpoints: accessible as GET /api/health
api_router.include_router(health_router)

# Mount document intake endpoints: accessible under /api/investigations/...
api_router.include_router(documents_router)

# Mount AI extraction and investigation endpoints: accessible under /api/investigations/...
api_router.include_router(investigations_router)

# Mount evidence and gap analysis endpoints: accessible under /api/investigations/...
api_router.include_router(evidence_router)

# Mount RCA methods (5 Whys & Fishbone) endpoints: accessible under /api/investigations/...
api_router.include_router(rca_methods_router)

# Mount Cause Candidates & Evidence Assessment endpoints: accessible under /api/investigations/...
api_router.include_router(assessment_router)

# Mount CAPA Recommendations endpoints: accessible under /api/investigations/...
api_router.include_router(capa_router)



