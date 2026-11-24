from datetime import datetime
from typing import Optional, List, Dict, Any
from pydantic import BaseModel, Field, ConfigDict


class RCABase(BaseModel):
    """Base schema for RCA records."""
    title: str = Field(..., description="Short incident summary")
    description: Optional[str] = Field(None, description="Detailed incident description")
    severity: str = Field(default="medium", description="Incident severity level")
    logs_data: Optional[Dict[str, Any]] = Field(default_factory=dict, description="Related system logs")
    metrics_data: Optional[Dict[str, Any]] = Field(default_factory=dict, description="Related service metrics")


class RCACreate(RCABase):
    """Payload schema to request an RCA run."""
    incident_id: str = Field(..., description="Unique incident identifier")


class RCAResponse(RCABase):
    """Schema returned for an RCA inquiry."""
    id: int
    incident_id: str
    status: str
    root_cause: Optional[str] = None
    recommendations: Optional[List[str]] = None
    ai_metadata: Optional[Dict[str, Any]] = None
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)
