from datetime import datetime
from typing import Dict, Any
from pydantic import BaseModel, Field


class ServiceStatus(BaseModel):
    """Status details for internal services."""
    status: str
    message: str


class HealthResponse(BaseModel):
    """Health check response schema."""
    status: str = Field(..., example="ok")
    version: str = Field(..., example="0.1.0")
    environment: str = Field(..., example="development")
    timestamp: datetime
    services: Dict[str, Any] = Field(default_factory=dict)
