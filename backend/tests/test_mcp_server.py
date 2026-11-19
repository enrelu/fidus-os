"""Tests de integración del servidor MCP nativo (/mcp) en Streamable HTTP."""

from __future__ import annotations

import json
from typing import Any, Optional

from fastapi.testclient import TestClient
from sqlmodel import Session

from core.models import AgentApiKey, Tenant


def _mcp_rpc(
    client: TestClient,
    method: str,
    params: Optional[dict[str, Any]] = None,
    *,
    headers: Optional[dict[str, str]] = None,
    req_id: int = 1,
) -> tuple[int, dict[str, Any]]:
    req_headers = {
        "Accept": "application/json, text/event-stream",
        "Content-Type": "application/json",
    }
    if headers:
        req_headers.update(headers)
    payload: dict[str, Any] = {
        "jsonrpc": "2.0",
        "id": req_id,
        "method": method,
    }
    if params is not None:
        payload["params"] = params
    resp = client.post("/mcp", headers=req_headers, json=payload)
    return resp.status_code, resp.json()


def _initialize_mcp(client: TestClient, headers: dict[str, str]) -> dict[str, Any]:
    status_code, body = _mcp_rpc(
        client,
        "initialize",
        {
            "protocolVersion": "2025-03-26",
            "capabilities": {},
            "clientInfo": {"name": "pytest-mcp-client", "version": "1.0.0"},
        },
        headers=headers,
        req_id=1,
    )
    assert status_code == 200, body
    assert "result" in body
    return body["result"]


def _call_tool(
    client: TestClient,
    headers: dict[str, str],
    name: str,
    arguments: dict[str, Any],
    req_id: int = 10,
) -> dict[str, Any]:
    status_code, body = _mcp_rpc(
        client,
        "tools/call",
        {"name": name, "arguments": arguments},
        headers=headers,
        req_id=req_id,
    )
    assert status_code == 200, body
    assert "result" in body, body
    return body["result"]


def _extract_tool_json(result: dict[str, Any]) -> dict[str, Any]:
    assert result.get("isError") is not True, result
    if "structuredContent" in result and result["structuredContent"] is not None:
        return result["structuredContent"]
    text = result["content"][0]["text"]
    return json.loads(text)


def test_mcp_authentication_and_scope_enforcement(
    client: TestClient,
    session: Session,
    tenant_a: dict,
) -> None:
    # 1. Sin clave -> 401
    code_missing, _ = _mcp_rpc(client, "tools/list")
    assert code_missing == 401

    # 2. Clave inválida -> 401
    code_invalid, _ = _mcp_rpc(
        client,
        "tools/list",
        headers={"Authorization": "Bearer fos_ag_invalida_12345"},
    )
    assert code_invalid == 401

    # 3. Crear clave solo lectura (crm:read) y probar Bearer
    ro_key_resp = client.post(
        "/api/v1/ai/agent-keys",
        headers=tenant_a["headers"],
        json={"name": "Claude Lectura", "scopes": "crm:read"},
    ).json()
    ro_headers = {"Authorization": f"Bearer {ro_key_resp['raw_key']}"}

    init_res = _initialize_mcp(client, ro_headers)
    assert init_res["serverInfo"]["name"] == "FidusOS v2 CRM"

    # Verificar que se actualizó last_used_at
    db_key = session.get(AgentApiKey, ro_key_resp["id"])
    assert db_key is not None
    assert db_key.last_used_at is not None

    # Scope insuficiente en tools/call -> isError=True sin mutar BD
    err_write = _call_tool(
        client,
        ro_headers,
        "crear_o_actualizar_lead",
        {"full_name": "Lead No Permitido"},
    )
    assert err_write.get("isError") is True
    assert "crm:write" in err_write["content"][0]["text"]

    err_propose = _call_tool(
        client,
        ro_headers,
        "proponer_accion",
        {
            "action_type": "create_task",
            "target_entity_type": "task",
            "payload": {"title": "No permitido"},
        },
    )
    assert err_propose.get("isError") is True
    assert "actions:propose" in err_propose["content"][0]["text"]

    # 4. Revocar clave -> 401
    del_resp = client.delete(
        f"/api/v1/ai/agent-keys/{ro_key_resp['id']}",
        headers=tenant_a["headers"],
    )
    assert del_resp.status_code == 204
    code_revoked, _ = _mcp_rpc(client, "tools/list", headers=ro_headers)
    assert code_revoked == 401

    # 5. Tenant inactivo -> 403
    active_key = client.post(
        "/api/v1/ai/agent-keys",
        headers=tenant_a["headers"],
        json={"name": "Agente Activo", "scopes": "crm:read"},
    ).json()["raw_key"]
    tenant = session.get(Tenant, tenant_a["tenant_id"])
    assert tenant is not None
    tenant.is_active = False
    session.add(tenant)
    session.commit()

    code_inactive, _ = _mcp_rpc(
        client,
        "tools/list",
        headers={"X-Agent-Api-Key": active_key},
    )
    assert code_inactive == 403


def test_mcp_full_tools_flow_and_multi_tenant_isolation(
    client: TestClient,
    tenant_a: dict,
    tenant_b: dict,
) -> None:
    # Preparar datos de Tenant A y Tenant B
    org_a = client.post(
        "/api/v1/crm/organizations",
        headers=tenant_a["headers"],
        json={
            "name": "Grupo Levante",
            "cif": "B96112233",
            "razon_social": "Grupo Levante Sistemas S.L.",
            "direccion_fiscal": "Avda. del Puerto 45, Valencia",
            "sector": "Tecnología",
        },
    ).json()
    client_a = client.post(
        "/api/v1/crm/clients",
        headers=tenant_a["headers"],
        json={
            "organization_id": org_a["id"],
            "full_name": "Marta Soler",
            "email": "marta@levante-ejemplo.es",
            "job_title": "Directora Financiera",
            "rgpd_consent": True,
        },
    ).json()
    opp_a = client.post(
        "/api/v1/crm/opportunities",
        headers=tenant_a["headers"],
        json={
            "organization_id": org_a["id"],
            "client_id": client_a["id"],
            "title": "Proyecto Migración Cloud Levante",
            "amount_eur": 38500.0,
            "stage": "proposal",
            "probability": 65,
        },
    ).json()
    client.post(
        "/api/v1/crm/tasks",
        headers=tenant_a["headers"],
        json={
            "organization_id": org_a["id"],
            "opportunity_id": opp_a["id"],
            "title": "Revisar anexo RGPD",
            "priority": "high",
        },
    )

    org_b = client.post(
        "/api/v1/crm/organizations",
        headers=tenant_b["headers"],
        json={
            "name": "Secreto Norte S.A.",
            "cif": "A48999999",
            "razon_social": "Secreto Norte S.A.",
            "direccion_fiscal": "Gran Vía 1, Bilbao",
        },
    ).json()

    # Claves completas para Tenant A (Bearer) y Tenant B (X-Agent-Api-Key)
    key_a = client.post(
        "/api/v1/ai/agent-keys",
        headers=tenant_a["headers"],
        json={"name": "Cursor Copiloto A", "scopes": "crm:read,crm:write,actions:propose"},
    ).json()["raw_key"]
    key_b = client.post(
        "/api/v1/ai/agent-keys",
        headers=tenant_b["headers"],
        json={"name": "OpenClaw B", "scopes": "crm:read,crm:write,actions:propose"},
    ).json()["raw_key"]

    mcp_headers_a = {"Authorization": f"Bearer {key_a}"}
    mcp_headers_b = {"X-Agent-Api-Key": key_b}

    _initialize_mcp(client, mcp_headers_a)

    # 1. tools/list expone las 6 tools y ninguna acepta tenant_id
    list_code, list_body = _mcp_rpc(client, "tools/list", headers=mcp_headers_a, req_id=2)
    assert list_code == 200
    tools = list_body["result"]["tools"]
    tool_names = {t["name"] for t in tools}
    assert tool_names == {
        "buscar_crm",
        "cuenta_360",
        "listar_pendientes",
        "crear_o_actualizar_lead",
        "registrar_interaccion",
        "proponer_accion",
    }
    for t in tools:
        assert "tenant_id" not in (t["inputSchema"].get("properties") or {})

    # 2. buscar_crm encuentra solo datos de Tenant A, nunca de Tenant B
    search_a = _extract_tool_json(
        _call_tool(client, mcp_headers_a, "buscar_crm", {"query": "Levante"}, req_id=3)
    )
    assert len(search_a["organizations"]) == 1
    assert search_a["organizations"][0]["cif"] == "B96112233"
    assert len(search_a["opportunities"]) == 1
    assert search_a["opportunities"][0]["amount_eur"] == 38500.0

    search_a_for_b = _extract_tool_json(
        _call_tool(client, mcp_headers_a, "buscar_crm", {"query": "Secreto Norte"}, req_id=4)
    )
    assert search_a_for_b["organizations"] == []

    # 3. cuenta_360 de Tenant A devuelve datos fiscales + clientes + EUR + tareas + logs
    c360 = _extract_tool_json(
        _call_tool(client, mcp_headers_a, "cuenta_360", {"organization_id": org_a["id"]}, req_id=5)
    )
    assert c360["organization"]["cif"] == "B96112233"
    assert c360["organization"]["direccion_fiscal"] == "Avda. del Puerto 45, Valencia"
    assert len(c360["clients"]) == 1
    assert c360["pipeline_total_eur"] == 38500.0
    assert len(c360["pending_tasks"]) == 1

    # Aislamiento estricto: Tenant B no puede abrir cuenta_360 de org_a ni Tenant A la de org_b
    c360_cross = _call_tool(client, mcp_headers_a, "cuenta_360", {"organization_id": org_b["id"]}, req_id=6)
    assert c360_cross.get("isError") is True

    # 4. crear_o_actualizar_lead crea y luego actualiza por email en Tenant A
    created_lead = _extract_tool_json(
        _call_tool(
            client,
            mcp_headers_a,
            "crear_o_actualizar_lead",
            {
                "full_name": "Elena Navarro",
                "email": "elena@mediterraneo-ejemplo.es",
                "company_name": "Mediterráneo Tech",
                "organization_id": org_a["id"],
                "model_used": "claude-3-7-sonnet",
            },
            req_id=7,
        )
    )
    assert created_lead["operation"] == "created"
    lead_id = created_lead["lead"]["id"]

    updated_lead = _extract_tool_json(
        _call_tool(
            client,
            mcp_headers_a,
            "crear_o_actualizar_lead",
            {
                "full_name": "Elena Navarro Gómez",
                "email": "elena@mediterraneo-ejemplo.es",
                "status": "qualified",
                "score": 88,
                "model_used": "claude-3-7-sonnet",
            },
            req_id=8,
        )
    )
    assert updated_lead["operation"] == "updated"
    assert updated_lead["lead"]["id"] == lead_id
    assert updated_lead["lead"]["score"] == 88

    # Tenant B no puede actualizar el lead de Tenant A por ID
    cross_lead = _call_tool(
        client,
        mcp_headers_b,
        "crear_o_actualizar_lead",
        {"full_name": "Hack", "lead_id": lead_id},
        req_id=9,
    )
    assert cross_lead.get("isError") is True

    # 5. registrar_interaccion persiste ActivityLog(actor_type="agent") y bloquea cross-tenant
    interaction = _extract_tool_json(
        _call_tool(
            client,
            mcp_headers_a,
            "registrar_interaccion",
            {
                "channel": "llamada",
                "entity_type": "opportunity",
                "entity_id": opp_a["id"],
                "summary": "Llamada con Marta Soler confirmando presupuesto en EUR",
                "outcome": "Positivo",
                "model_used": "claude-3-7-sonnet",
            },
            req_id=10,
        )
    )
    assert interaction["actor_type"] == "agent"
    assert interaction["actor_name"] == "Cursor Copiloto A"
    assert interaction["action"] == "interaction:llamada"

    cross_interaction = _call_tool(
        client,
        mcp_headers_b,
        "registrar_interaccion",
        {
            "channel": "email",
            "entity_type": "organization",
            "entity_id": org_a["id"],
            "summary": "Intento cross-tenant",
        },
        req_id=11,
    )
    assert cross_interaction.get("isError") is True

    # 6. proponer_accion crea AgentAction HITL y aparece en listar_pendientes
    proposed = _extract_tool_json(
        _call_tool(
            client,
            mcp_headers_a,
            "proponer_accion",
            {
                "action_type": "update_opportunity",
                "target_entity_type": "opportunity",
                "target_entity_id": opp_a["id"],
                "payload": {"stage": "negotiation", "probability": 85},
                "model_used": "claude-3-7-sonnet",
            },
            req_id=12,
        )
    )
    assert proposed["status"] == "pending_approval"

    cross_propose = _call_tool(
        client,
        mcp_headers_b,
        "proponer_accion",
        {
            "action_type": "update_opportunity",
            "target_entity_type": "opportunity",
            "target_entity_id": opp_a["id"],
            "payload": {"stage": "closed_lost"},
        },
        req_id=13,
    )
    assert cross_propose.get("isError") is True

    pendientes = _extract_tool_json(
        _call_tool(client, mcp_headers_a, "listar_pendientes", {"limit": 10}, req_id=14)
    )
    assert len(pendientes["open_tasks"]) == 1
    assert len(pendientes["pending_agent_actions"]) == 1
    assert pendientes["pending_agent_actions"][0]["id"] == proposed["id"]

    # Humano aprueba y ejecuta la acción propuesta desde MCP
    assert (
        client.post(
            f"/api/v1/ai/agent-actions/{proposed['id']}/approve",
            headers=tenant_a["headers"],
        ).status_code
        == 200
    )
    assert (
        client.post(
            f"/api/v1/ai/agent-actions/{proposed['id']}/execute",
            headers=tenant_a["headers"],
        ).status_code
        == 200
    )
    opp_after = client.get(f"/api/v1/crm/opportunities/{opp_a['id']}", headers=tenant_a["headers"]).json()
    assert opp_after["stage"] == "negotiation"
    assert opp_after["probability"] == 85

    # Auditoría completa de agente en BD
    agent_logs = client.get("/api/v1/crm/activities?actor_type=agent", headers=tenant_a["headers"]).json()
    actions_logged = {log["action"] for log in agent_logs}
    assert {
        "create",
        "update",
        "interaction:llamada",
        "propose:update_opportunity",
        "execute:update_opportunity",
    }.issubset(actions_logged)

    # 7. proponer_accion rechaza action_type no soportado con error inmediato
    invalid_propose = _call_tool(
        client,
        mcp_headers_a,
        "proponer_accion",
        {
            "action_type": "send_bulk_whatsapp",
            "target_entity_type": "client",
            "payload": {"message": "Hola"},
        },
        req_id=15,
    )
    assert invalid_propose.get("isError") is True
    assert "no soportado" in invalid_propose["content"][0]["text"]

