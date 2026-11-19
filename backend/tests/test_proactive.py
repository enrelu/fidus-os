"""Tests del Motor Proactivo BYOK: auto-cualificación de leads, radar comercial e ingesta libre."""

from __future__ import annotations

import json
from datetime import timedelta

import httpx
from fastapi.testclient import TestClient
from sqlmodel import Session, select

from ai.gateway import AIGateway
from ai.routes import get_ai_gateway
from core.models import ActivityLog, AgentAction, Lead, Opportunity, Organization, utc_now


def _register_byok_openai(client: TestClient, headers: dict, *, model_name: str = "gpt-4o-mini") -> dict:
    resp = client.post(
        "/api/v1/ai/providers",
        headers=headers,
        json={
            "provider": "openai",
            "model_name": model_name,
            "api_key": "sk-proactive-test-9999",
            "is_default": True,
            "is_active": True,
        },
    )
    assert resp.status_code == 201, resp.text
    return resp.json()


def test_lead_auto_qualification_with_and_without_byok(
    client: TestClient,
    session: Session,
    tenant_a: dict,
    tenant_b: dict,
) -> None:
    # 1. Sin BYOK configurado (tenant_b): crear Lead NO debe fallar y no genera propuestas
    lead_no_byok = client.post(
        "/api/v1/crm/leads",
        headers=tenant_b["headers"],
        json={
            "full_name": "Javier Mora",
            "email": "jmora@sinbyok.es",
            "company_name": "Mora Logística",
        },
    )
    assert lead_no_byok.status_code == 201, lead_no_byok.text
    assert lead_no_byok.json()["score"] is None
    assert client.get("/api/v1/ai/agent-actions", headers=tenant_b["headers"]).json() == []

    # 2. Con BYOK configurado (tenant_a): mockeamos AIGateway con httpx.MockTransport
    _register_byok_openai(client, tenant_a["headers"])

    def mock_handler(_request: httpx.Request) -> httpx.Response:
        llm_json = {
            "score": 88,
            "summary": "Lead de alta intención del sector industrial en Valencia.",
            "suggested_task": {
                "title": "Llamar a Laura Gómez para demo técnica",
                "description": "Validar integración ERP y presentar propuesta en EUR.",
                "priority": "high",
            },
            "first_contact_draft": "Hola Laura, gracias por contactar con FidusOS...",
        }
        return httpx.Response(
            200,
            json={
                "model": "gpt-4o-mini",
                "choices": [{"message": {"content": json.dumps(llm_json, ensure_ascii=False)}}],
            },
        )

    mock_gateway = AIGateway(transport=httpx.MockTransport(mock_handler))
    client.app.dependency_overrides[get_ai_gateway] = lambda: mock_gateway  # type: ignore[attr-defined]
    try:
        lead_resp = client.post(
            "/api/v1/crm/leads",
            headers=tenant_a["headers"],
            json={
                "full_name": "Laura Gómez",
                "email": "laura@valenciapack.es",
                "company_name": "Valencia Pack S.L.",
                "notes": "Interesada en CRM con MCP.",
            },
        )
        assert lead_resp.status_code == 201, lead_resp.text
        lead_id = lead_resp.json()["id"]
    finally:
        client.app.dependency_overrides.pop(get_ai_gateway, None)  # type: ignore[attr-defined]

    # Verificar que el Lead se actualizó con score y notas preservando la nota previa
    session.expire_all()
    lead_db = session.get(Lead, lead_id)
    assert lead_db is not None
    assert lead_db.score == 88
    assert "Interesada en CRM con MCP." in (lead_db.notes or "")
    assert "Score 88/100" in (lead_db.notes or "")

    # Verificar AgentAction propuesta en pending_approval
    actions = client.get("/api/v1/ai/agent-actions?status=pending_approval", headers=tenant_a["headers"]).json()
    assert len(actions) == 1
    assert actions[0]["action_type"] == "create_task"
    assert actions[0]["target_entity_type"] == "lead"
    assert actions[0]["target_entity_id"] == lead_id
    assert actions[0]["model_used"] == "gpt-4o-mini"

    # Verificar ActivityLog del agente
    activities = client.get("/api/v1/crm/activities?actor_type=agent", headers=tenant_a["headers"]).json()
    assert any(act["action"] == "proactive:qualify_lead" and act["model_used"] == "gpt-4o-mini" for act in activities)


def test_commercial_radar_detects_stale_opportunity_and_deduplicates(
    client: TestClient,
    session: Session,
    tenant_a: dict,
) -> None:
    # Sin BYOK debe responder 400 claro en español
    no_byok = client.post("/api/v1/ai/proactive/radar", headers=tenant_a["headers"], json={"stale_days": 7})
    assert no_byok.status_code == 400

    _register_byok_openai(client, tenant_a["headers"])

    org_resp = client.post(
        "/api/v1/crm/organizations",
        headers=tenant_a["headers"],
        json={"name": "Industrias Ebro S.A.", "cif": "A50123456"},
    )
    assert org_resp.status_code == 201
    org_id = org_resp.json()["id"]

    # Insertamos oportunidad abierta directamente sin ActivityLog reciente (simula estancamiento)
    stale_opp = Opportunity(
        tenant_id=tenant_a["tenant_id"],
        organization_id=org_id,
        title="Renovación licencia anual",
        amount_eur=18000.0,
        stage="proposal",
        probability=55,
        updated_at=utc_now() - timedelta(days=12),
    )
    session.add(stale_opp)
    session.commit()
    session.refresh(stale_opp)

    llm_calls = 0

    def mock_handler(_request: httpx.Request) -> httpx.Response:
        nonlocal llm_calls
        llm_calls += 1
        radar_payload = {
            "briefing": "Se detectó 1 oportunidad estancada en propuesta sin actividad reciente.",
            "proposed_actions": [
                {
                    "action_type": "create_task",
                    "target_entity_type": "opportunity",
                    "target_entity_id": stale_opp.id,
                    "payload": {
                        "organization_id": org_id,
                        "opportunity_id": stale_opp.id,
                        "title": "Reactivar oportunidad Renovación licencia anual",
                        "description": "Lleva más de 7 días sin seguimiento.",
                        "priority": "high",
                    },
                }
            ],
        }
        return httpx.Response(
            200,
            json={
                "model": "gpt-4o-mini",
                "choices": [{"message": {"content": json.dumps(radar_payload, ensure_ascii=False)}}],
            },
        )

    mock_gateway = AIGateway(transport=httpx.MockTransport(mock_handler))
    client.app.dependency_overrides[get_ai_gateway] = lambda: mock_gateway  # type: ignore[attr-defined]
    try:
        first_run = client.post(
            "/api/v1/ai/proactive/radar",
            headers=tenant_a["headers"],
            json={"stale_days": 7},
        )
        assert first_run.status_code == 200, first_run.text
        body1 = first_run.json()
        assert body1["findings_count"] >= 1
        assert len(body1["created_actions"]) == 1
        assert body1["created_actions"][0]["status"] == "pending_approval"

        # Segunda ejecución inmediata: debe evitar duplicar la AgentAction pendiente
        second_run = client.post(
            "/api/v1/ai/proactive/radar",
            headers=tenant_a["headers"],
            json={"stale_days": 7},
        )
        assert second_run.status_code == 200, second_run.text
        body2 = second_run.json()
        assert body2["created_actions"] == []
        assert llm_calls == 2
    finally:
        client.app.dependency_overrides.pop(get_ai_gateway, None)  # type: ignore[attr-defined]

    all_pending = client.get("/api/v1/ai/agent-actions?status=pending_approval", headers=tenant_a["headers"]).json()
    assert len(all_pending) == 1

    logs = session.exec(
        select(ActivityLog).where(
            ActivityLog.tenant_id == tenant_a["tenant_id"],
            ActivityLog.action == "proactive:commercial_radar",
        )
    ).all()
    assert len(logs) == 2


def test_free_text_ingest_parses_fenced_json_and_status_endpoint(
    client: TestClient,
    tenant_a: dict,
) -> None:
    # Status inicial sin BYOK
    st0 = client.get("/api/v1/ai/proactive/status", headers=tenant_a["headers"])
    assert st0.status_code == 200
    assert st0.json()["has_default_byok"] is False
    assert st0.json()["pending_actions_count"] == 0

    # Ingesta sin BYOK -> 400
    no_byok = client.post(
        "/api/v1/ai/proactive/ingest",
        headers=tenant_a["headers"],
        json={"text": "Reunión con cliente interesada en ampliar contrato."},
    )
    assert no_byok.status_code == 400

    _register_byok_openai(client, tenant_a["headers"], model_name="gpt-4o")

    org = client.post(
        "/api/v1/crm/organizations",
        headers=tenant_a["headers"],
        json={"name": "Grupo Norte S.L.", "cif": "B48001122"},
    ).json()
    opp = client.post(
        "/api/v1/crm/opportunities",
        headers=tenant_a["headers"],
        json={
            "organization_id": org["id"],
            "title": "Despliegue FidusOS Sede Bilbao",
            "amount_eur": 12000.0,
            "stage": "qualification",
            "probability": 30,
        },
    ).json()

    fenced_response = """Aquí tienes las acciones extraídas:
```json
{
  "summary": "El cliente aprueba pasar a negociación por 15.000 EUR y pide contrato.",
  "proposed_actions": [
    {
      "action_type": "update_opportunity",
      "target_entity_type": "opportunity",
      "target_entity_id": %d,
      "payload": {
        "stage": "negotiation",
        "amount_eur": 15000,
        "probability": 80
      }
    },
    {
      "action_type": "create_task",
      "target_entity_type": "task",
      "payload": {
        "organization_id": %d,
        "opportunity_id": %d,
        "title": "Enviar borrador de contrato a Grupo Norte",
        "priority": "urgent"
      }
    }
  ]
}
```""" % (
        opp["id"],
        org["id"],
        opp["id"],
    )

    def mock_handler(_request: httpx.Request) -> httpx.Response:
        return httpx.Response(
            200,
            json={
                "model": "gpt-4o",
                "choices": [{"message": {"content": fenced_response}}],
            },
        )

    mock_gateway = AIGateway(transport=httpx.MockTransport(mock_handler))
    client.app.dependency_overrides[get_ai_gateway] = lambda: mock_gateway  # type: ignore[attr-defined]
    try:
        ingest_resp = client.post(
            "/api/v1/ai/proactive/ingest",
            headers=tenant_a["headers"],
            json={
                "organization_id": org["id"],
                "text": "Llamada con Dirección de Grupo Norte: confirman presupuesto de 15.000 EUR y piden contrato esta semana.",
            },
        )
        assert ingest_resp.status_code == 200, ingest_resp.text
        data = ingest_resp.json()
        assert "15.000 EUR" in data["summary"]
        assert len(data["created_actions"]) == 2
        types = [a["action_type"] for a in data["created_actions"]]
        assert types == ["update_opportunity", "create_task"]
    finally:
        client.app.dependency_overrides.pop(get_ai_gateway, None)  # type: ignore[attr-defined]

    # Verificar status con BYOK activo y 2 acciones pendientes
    st1 = client.get("/api/v1/ai/proactive/status", headers=tenant_a["headers"])
    assert st1.status_code == 200
    assert st1.json()["has_default_byok"] is True
    assert st1.json()["default_provider"] == "openai"
    assert st1.json()["default_model"] == "gpt-4o"
    assert st1.json()["pending_actions_count"] == 2

    # Verificar ActivityLog de ingesta
    activities = client.get("/api/v1/crm/activities?actor_type=agent", headers=tenant_a["headers"]).json()
    assert any(act["action"] == "proactive:ingest" and act["model_used"] == "gpt-4o" for act in activities)


def test_free_text_ingest_normalizes_llm_payload_synonyms_and_executes_lead(
    client: TestClient,
    session: Session,
    tenant_a: dict,
) -> None:
    _register_byok_openai(client, tenant_a["headers"], model_name="gemini-flash-lite-latest")

    opp = client.post(
        "/api/v1/crm/opportunities",
        headers=tenant_a["headers"],
        json={
            "title": "Certificación ISO AENOR",
            "amount_eur": 5000.0,
            "stage": "qualification",
            "probability": 25,
        },
    ).json()

    llm_payload = {
        "summary": "Detectado nuevo lead Paco Martinez de la empresa AENOR con teléfono 680909090.",
        "proposed_actions": [
            {
                "action_type": "create_lead",
                "target_entity_type": "lead",
                "target_entity_id": None,
                "payload": {
                    "name": "Paco Martinez",
                    "company": "AENOR",
                    "telefono": "680909090",
                    "correo": "paco@aenor.example",
                    "notas": "Contacto entrante de prueba",
                },
            },
            {
                "action_type": "create_task",
                "target_entity_type": "task",
                "target_entity_id": None,
                "payload": {
                    "titulo": "Llamar a Paco Martinez (AENOR)",
                    "descripcion": "Primer contacto comercial en frío.",
                    "priority": "high",
                },
            },
            {
                "action_type": "update_opportunity",
                "target_entity_type": "opportunity",
                "target_entity_id": opp["id"],
                "payload": {
                    "importe": 7500,
                },
            },
        ],
    }

    def mock_handler(request: httpx.Request) -> httpx.Response:
        # Comprobamos también que el prompt incluya el esquema exacto esperado
        req_body = json.loads(request.content.decode("utf-8"))
        system_msg = req_body["messages"][0]["content"]
        assert "full_name" in system_msg
        assert "company_name" in system_msg
        return httpx.Response(
            200,
            json={
                "model": "gemini-flash-lite-latest",
                "choices": [{"message": {"content": json.dumps(llm_payload, ensure_ascii=False)}}],
            },
        )

    mock_gateway = AIGateway(transport=httpx.MockTransport(mock_handler))
    client.app.dependency_overrides[get_ai_gateway] = lambda: mock_gateway  # type: ignore[attr-defined]
    try:
        ingest_resp = client.post(
            "/api/v1/ai/proactive/ingest",
            headers=tenant_a["headers"],
            json={"text": "Nuevo lead -> Paco Martinez. empresa AENOR. Teléfono: 680909090"},
        )
        assert ingest_resp.status_code == 200, ingest_resp.text
        data = ingest_resp.json()
        assert len(data["created_actions"]) == 3
    finally:
        client.app.dependency_overrides.pop(get_ai_gateway, None)  # type: ignore[attr-defined]

    lead_action, task_action, opp_action = data["created_actions"]

    # 1. Validar normalización de create_lead
    assert lead_action["action_type"] == "create_lead"
    assert lead_action["payload"] == {
        "full_name": "Paco Martinez",
        "email": "paco@aenor.example",
        "phone": "680909090",
        "company_name": "AENOR",
        "notes": "Contacto entrante de prueba",
    }

    # 2. Validar normalización de create_task y update_opportunity
    assert task_action["payload"]["title"] == "Llamar a Paco Martinez (AENOR)"
    assert task_action["payload"]["description"] == "Primer contacto comercial en frío."
    assert opp_action["payload"]["amount_eur"] == 7500.0

    # 3. Aprobar y ejecutar create_lead y verificar que el Lead se crea en BD con los campos normalizados
    exec_resp = client.post(
        f"/api/v1/ai/agent-actions/{lead_action['id']}/approve-and-execute",
        headers=tenant_a["headers"],
    )
    assert exec_resp.status_code == 200, exec_resp.text
    executed = exec_resp.json()
    assert executed["status"] == "executed"
    created_lead_id = executed["target_entity_id"]
    assert created_lead_id is not None

    session.expire_all()
    lead_db = session.get(Lead, created_lead_id)
    assert lead_db is not None
    assert lead_db.tenant_id == tenant_a["tenant_id"]
    assert lead_db.full_name == "Paco Martinez"
    assert lead_db.company_name == "AENOR"
    assert lead_db.phone == "680909090"
    assert lead_db.email == "paco@aenor.example"
    assert lead_db.notes == "Contacto entrante de prueba"

