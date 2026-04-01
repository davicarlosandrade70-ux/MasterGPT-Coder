import pytest
from httpx import AsyncClient
from backend.main import app
from backend.database.models import Base
from backend.database.session import engine
import asyncio

@pytest.fixture(scope="session")
def event_loop():
    loop = asyncio.get_event_loop_policy().new_event_loop()
    yield loop
    loop.close()

@pytest.mark.asyncio
async def test_register_user():
    async with AsyncClient(app=app, base_url="http://test") as ac:
        response = await ac.post("/api/auth/register", json={
            "username": "testuser",
            "email": "test@example.com",
            "password": "testpassword"
        })
    assert response.status_code == 200
    assert response.json()["username"] == "testuser"

@pytest.mark.asyncio
async def test_login_user():
    async with AsyncClient(app=app, base_url="http://test") as ac:
        response = await ac.post("/api/auth/login", data={
            "username": "testuser",
            "password": "testpassword"
        })
    assert response.status_code == 200
    assert "access_token" in response.json()

@pytest.mark.asyncio
async def test_get_me():
    async with AsyncClient(app=app, base_url="http://test") as ac:
        login_resp = await ac.post("/api/auth/login", data={
            "username": "testuser",
            "password": "testpassword"
        })
        token = login_resp.json()["access_token"]
        
        response = await ac.get("/api/auth/me", headers={"Authorization": f"Bearer {token}"})
    assert response.status_code == 200
    assert response.json()["username"] == "testuser"
