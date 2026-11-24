import logging
from typing import Generator
from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker, Session
from app.core.config import settings

logger = logging.getLogger(__name__)

# Initialize database engine with connection pooling and pre-ping
# Handles connection verification gracefully
try:
    engine = create_engine(
        settings.DATABASE_URL,
        pool_pre_ping=True,
        echo=settings.DEBUG,
    )
    SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
except Exception as e:
    logger.warning("Database engine initialization deferred: %s", str(e))
    engine = None
    SessionLocal = None


def get_db() -> Generator[Session, None, None]:
    """Dependency for obtaining database sessions per request."""
    if SessionLocal is None:
        raise RuntimeError("Database session factory is not configured.")
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def check_db_connection() -> dict:
    """Check database connectivity status without raising unhandled exceptions."""
    if engine is None:
        return {
            "status": "unconfigured",
            "message": "Database engine not initialized. Check DATABASE_URL in .env",
        }
    try:
        with engine.connect() as connection:
            connection.execute(text("SELECT 1"))
        return {
            "status": "connected",
            "message": "Successfully connected to PostgreSQL database.",
        }
    except Exception as exc:
        return {
            "status": "disconnected",
            "message": f"Database unreachable: {str(exc)}",
        }
