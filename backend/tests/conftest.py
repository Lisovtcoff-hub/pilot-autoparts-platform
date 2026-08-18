import os

os.environ["APP_ENV"] = "testing"
os.environ["DATABASE_URL"] = "sqlite+aiosqlite:////tmp/pilot_api_tests.db"
os.environ["ADMIN_USERNAME"] = "cashier"
os.environ["ADMIN_PASSWORD"] = "test-password"
os.environ["SESSION_SECRET"] = "test-session-secret-that-is-long-enough"
os.environ["SMTP_HOST"] = ""
os.environ["FRONTEND_ORIGIN"] = "http://test"

import httpx
import pytest_asyncio

from app.database import Base, SessionFactory, engine
from app.main import app, seed_catalog


@pytest_asyncio.fixture(autouse=True)
async def reset_database():
    async with engine.begin() as connection:
        await connection.run_sync(Base.metadata.drop_all)
        await connection.run_sync(Base.metadata.create_all)
    async with SessionFactory() as session:
        await seed_catalog(session)


@pytest_asyncio.fixture
async def client():
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as api_client:
        yield api_client


@pytest_asyncio.fixture
async def admin_client(client: httpx.AsyncClient):
    response = await client.post("/api/auth/login", json={"username": "cashier", "password": "test-password"})
    assert response.status_code == 200
    return client
