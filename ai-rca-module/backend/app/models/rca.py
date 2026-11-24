from datetime import datetime
from sqlalchemy import Column, Integer, String, Text, DateTime, JSON
from app.database.base import Base


class RCARecord(Base):
    """SQLAlchemy model for Root Cause Analysis incidents and findings."""

    __tablename__ = "rca_records"

    id = Column(Integer, primary_key=True, index=True)
    incident_id = Column(String(100), unique=True, index=True, nullable=False)
    title = Column(String(255), nullable=False)
    description = Column(Text, nullable=True)
    status = Column(String(50), default="pending", nullable=False)
    severity = Column(String(20), default="medium", nullable=False)
    logs_data = Column(JSON, nullable=True)
    metrics_data = Column(JSON, nullable=True)
    root_cause = Column(Text, nullable=True)
    recommendations = Column(JSON, nullable=True)
    ai_metadata = Column(JSON, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)
