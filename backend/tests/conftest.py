"""Fixtures compartidas para los tests de FidusOS v2."""

from __future__ import annotations

import os
import secrets
from collections.abc import Generator

import pytest
from cryptography.fernet import Fernet
from fastapi.testclient import TestClient
from sqlalchemy.pool import StaticPool
from sqlmodel import Session, SQLModel, create_engine

# Configuración de entorno de pruebas antes de importar módulos de la app
os.environ["ENVIRONMENT"] = "test"
os.environ["PRELAUNCH_MODE"] = "false"
os.environ["ENCRYPTION_KEY"] = Fernet.generate_key().decode("utf-8")
os.environ["JWT_SECRET_KEY"] = secrets.token_urlsafe(48)

import core.models  # noqa: F401
from core.config import reset_settings_cache
from core.database import get_session
from main import create_app


@pytest.fixture(name="engine")
def engine_fixture():
    reset_settings_cache()
    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    SQLModel.metadata.create_all(engine)
    yield engine
    SQLModel.metadata.drop_all(engine)


@pytest.fixture(name="session")
def session_fixture(engine) -> Generator[Session, None, None]:
    with Session(engine) as session:
        yield session


@pytest.fixture(name="client")
def client_fixture(session: Session) -> Generator[TestClient, None, None]:
    app = create_app()

    def _override_get_session() -> Generator[Session, None, None]:
        yield session

    app.dependency_overrides[get_session] = _override_get_session
    with TestClient(app) as test_client:
        yield test_client
    app.dependency_overrides.clear()


def register_and_get_auth(
    client: TestClient,
    *,
    tenant_name: str,
    email: str,
    password: str = "ClaveSegura2026!",
    full_name: str = "Usuario Demo",
    cif: str = "B12345678",
) -> dict:
    resp = client.post(
        "/api/v1/auth/register",
        json={
            "tenant_name": tenant_name,
            "cif": cif,
            "razon_social": f"{tenant_name} S.L.",
            "direccion_fiscal": "Calle Mayor 10, 28013 Madrid",
            "full_name": full_name,
            "email": email,
            "password": password,
        },
    )
    assert resp.status_code == 201, resp.text
    data = resp.json()
    return {
        "token": data["access_token"],
        "headers": {"Authorization": f"Bearer {data['access_token']}"},
        "user": data["user"],
        "tenant_id": data["user"]["tenant_id"],
    }


@pytest.fixture(name="tenant_a")
def tenant_a_fixture(client: TestClient) -> dict:
    return register_and_get_auth(
        client,
        tenant_name="Iberia Soluciones",
        email="admin.a@iberia-ejemplo.es",
        full_name="Ana García",
        cif="B81234567",
    )


@pytest.fixture(name="tenant_b")
def tenant_b_fixture(client: TestClient) -> dict:
    return register_and_get_auth(
        client,
        tenant_name="Norte Industrial",
        email="admin.b@norte-ejemplo.es",
        full_name="Carlos López",
        cif="B48765432",
    )
