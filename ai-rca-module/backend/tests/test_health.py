import pytest
from fastapi.testclient import TestClient
from app.main import app


@pytest.fixture
def client():
    return TestClient(app)


def test_health_check_endpoint(client):
    """GET /api/health returns 200 with structured service diagnostics."""
    response = client.get("/api/health")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "ok"
    assert data["version"] == "0.1.0"
    assert "services" in data
    assert data["services"]["api"]["status"] == "healthy"
    assert data["services"]["api"]["service"] == "AI RCA Module"
    assert "database" in data["services"]
    assert "ai_engine" in data["services"]


def test_root_landing_endpoint(client):
    """GET / returns operational landing details."""
    response = client.get("/")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "operational"
    assert "Welcome to AI RCA Module" in data["message"]
    assert data["docs"] == "/docs"
    assert data["health_check"] == "/api/health"
