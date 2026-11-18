"""Tests de cifrado Fernet, enmascaramiento y Gateway BYOK multi-proveedor."""

from __future__ import annotations

import json

import httpx
from fastapi.testclient import TestClient
from sqlmodel import Session

from ai.gateway import AIGateway
from ai.routes import get_ai_gateway
from core.crypto import decrypt_secret
from core.models import AIProviderConfig


def test_byok_key_is_encrypted_in_db_and_masked_in_api(
    client: TestClient,
    session: Session,
    tenant_a: dict,
    tenant_b: dict,
) -> None:
    raw_secret = "sk-test-openai-secreto-muy-largo-9876"
    create_resp = client.post(
        "/api/v1/ai/providers",
        headers=tenant_a["headers"],
        json={
            "provider": "openai",
            "model_name": "gpt-4o-mini",
            "api_key": raw_secret,
            "is_default": True,
        },
    )
    assert create_resp.status_code == 201, create_resp.text
    created = create_resp.json()

    # La API jamás devuelve la clave en claro ni el ciphertext Fernet
    assert "api_key" not in created
    assert "api_key_encrypted" not in created
    assert raw_secret not in json.dumps(created)
    assert created["has_api_key"] is True
    assert created["api_key_masked"] == "sk-t****9876"
    assert created["is_default"] is True

    # En base de datos sí está cifrada con Fernet y puede descifrarse al valor exacto
    db_cfg = session.get(AIProviderConfig, created["id"])
    assert db_cfg is not None
    assert db_cfg.api_key_encrypted is not None
    assert db_cfg.api_key_encrypted != raw_secret
    assert decrypt_secret(db_cfg.api_key_encrypted) == raw_secret

    # Listado y GET también enmascaran la clave
    list_resp = client.get("/api/v1/ai/providers", headers=tenant_a["headers"])
    assert list_resp.status_code == 200
    assert len(list_resp.json()) == 1
    assert raw_secret not in list_resp.text
    assert list_resp.json()[0]["api_key_masked"] == "sk-t****9876"

    # Tenant B no puede ver, editar ni borrar el proveedor de Tenant A
    assert client.get("/api/v1/ai/providers", headers=tenant_b["headers"]).json() == []
    assert client.get(f"/api/v1/ai/providers/{created['id']}", headers=tenant_b["headers"]).status_code == 404
    assert (
        client.patch(
            f"/api/v1/ai/providers/{created['id']}",
            headers=tenant_b["headers"],
            json={"model_name": "hacked"},
        ).status_code
        == 404
    )
    assert client.delete(f"/api/v1/ai/providers/{created['id']}", headers=tenant_b["headers"]).status_code == 404


def test_byok_default_switching_and_validation(client: TestClient, tenant_a: dict) -> None:
    # Proveedor cloud sin api_key debe fallar
    missing_key = client.post(
        "/api/v1/ai/providers",
        headers=tenant_a["headers"],
        json={"provider": "anthropic", "model_name": "claude-3-5-sonnet-latest"},
    )
    assert missing_key.status_code == 422

    # openai_compatible sin base_url debe fallar
    missing_url = client.post(
        "/api/v1/ai/providers",
        headers=tenant_a["headers"],
        json={"provider": "openai_compatible", "model_name": "llama-3.1-70b"},
    )
    assert missing_url.status_code == 422

    # Crear dos proveedores: el segundo como default desmarca el primero
    p1 = client.post(
        "/api/v1/ai/providers",
        headers=tenant_a["headers"],
        json={
            "provider": "openai",
            "model_name": "gpt-4o-mini",
            "api_key": "sk-primero-1111",
            "is_default": True,
        },
    ).json()
    p2 = client.post(
        "/api/v1/ai/providers",
        headers=tenant_a["headers"],
        json={
            "provider": "ollama",
            "model_name": "llama3.2",
            "base_url": "http://localhost:11434/v1",
            "is_default": True,
        },
    ).json()

    assert p2["is_default"] is True
    assert p2["has_api_key"] is False
    assert p2["api_key_masked"] is None

    p1_refreshed = client.get(f"/api/v1/ai/providers/{p1['id']}", headers=tenant_a["headers"]).json()
    assert p1_refreshed["is_default"] is False


def test_byok_gateway_connection_test_for_multiple_providers(
    client: TestClient,
    tenant_a: dict,
) -> None:
    captured_requests: list[dict] = []

    def mock_handler(request: httpx.Request) -> httpx.Response:
        captured_requests.append(
            {
                "url": str(request.url),
                "headers": dict(request.headers),
            }
        )
        url_str = str(request.url)
        if "anthropic.com" in url_str:
            return httpx.Response(
                200,
                json={
                    "model": "claude-3-5-sonnet-latest",
                    "content": [{"type": "text", "text": "OK"}],
                },
            )
        if "generativelanguage.googleapis.com" in url_str:
            return httpx.Response(
                200,
                json={
                    "candidates": [
                        {"content": {"parts": [{"text": "OK"}]}}
                    ]
                },
            )
        return httpx.Response(
            200,
            json={
                "model": "gpt-4o-mini",
                "choices": [{"message": {"content": "OK"}}],
            },
        )

    transport = httpx.MockTransport(mock_handler)
    app = client.app  # type: ignore[attr-defined]
    app.dependency_overrides[get_ai_gateway] = lambda: AIGateway(transport=transport)

    # 1. OpenAI
    openai_cfg = client.post(
        "/api/v1/ai/providers",
        headers=tenant_a["headers"],
        json={
            "provider": "openai",
            "model_name": "gpt-4o-mini",
            "api_key": "sk-openai-mock-4321",
        },
    ).json()
    test_openai = client.post(
        f"/api/v1/ai/providers/{openai_cfg['id']}/test",
        headers=tenant_a["headers"],
    )
    assert test_openai.status_code == 200
    assert test_openai.json()["ok"] is True
    assert captured_requests[-1]["headers"]["authorization"] == "Bearer sk-openai-mock-4321"

    # 2. Anthropic
    anthropic_cfg = client.post(
        "/api/v1/ai/providers",
        headers=tenant_a["headers"],
        json={
            "provider": "anthropic",
            "model_name": "claude-3-5-sonnet-latest",
            "api_key": "sk-ant-mock-8888",
        },
    ).json()
    test_anthropic = client.post(
        f"/api/v1/ai/providers/{anthropic_cfg['id']}/test",
        headers=tenant_a["headers"],
    )
    assert test_anthropic.status_code == 200
    assert test_anthropic.json()["ok"] is True
    assert captured_requests[-1]["headers"]["x-api-key"] == "sk-ant-mock-8888"

    # 3. Gemini
    gemini_cfg = client.post(
        "/api/v1/ai/providers",
        headers=tenant_a["headers"],
        json={
            "provider": "gemini",
            "model_name": "gemini-2.0-flash",
            "api_key": "AIzaMockGemini9999",
        },
    ).json()
    test_gemini = client.post(
        f"/api/v1/ai/providers/{gemini_cfg['id']}/test",
        headers=tenant_a["headers"],
    )
    assert test_gemini.status_code == 200
    assert test_gemini.json()["ok"] is True
    assert "key=AIzaMockGemini9999" in captured_requests[-1]["url"]
