"""Tests de AgentApiKey, ciclo Human-in-the-Loop de AgentAction y trazabilidad."""

from __future__ import annotations

from fastapi.testclient import TestClient
from sqlmodel import Session

from core.models import AgentApiKey


def test_agent_key_lifecycle_and_action_approval_execution(
    client: TestClient,
    session: Session,
    tenant_a: dict,
    tenant_b: dict,
) -> None:
    # 1. Tenant A crea una AgentApiKey: solo se muestra raw_key en la creación
    key_resp = client.post(
        "/api/v1/ai/agent-keys",
        headers=tenant_a["headers"],
        json={
            "name": "Agente Comercial MCP",
            "scopes": "crm:read,actions:propose",
        },
    )
    assert key_resp.status_code == 201, key_resp.text
    key_data = key_resp.json()
    raw_agent_key = key_data["raw_key"]
    assert raw_agent_key.startswith("fos_ag_")

    db_key = session.get(AgentApiKey, key_data["id"])
    assert db_key is not None
    assert db_key.key_hash != raw_agent_key

    # El listado nunca devuelve raw_key ni key_hash
    list_keys = client.get("/api/v1/ai/agent-keys", headers=tenant_a["headers"]).json()
    assert len(list_keys) == 1
    assert "raw_key" not in list_keys[0]
    assert "key_hash" not in list_keys[0]

    # 2. El agente propone una acción usando X-Agent-Api-Key
    propose_resp = client.post(
        "/api/v1/ai/agent-actions",
        headers={"X-Agent-Api-Key": raw_agent_key},
        json={
            "agent_name": "claude-comercial",
            "model_used": "claude-3-7-sonnet",
            "action_type": "create_task",
            "target_entity_type": "task",
            "payload": {
                "title": "Enviar propuesta comercial actualizada (EUR)",
                "description": "Seguimiento tras reunión con dirección financiera",
                "priority": "high",
            },
        },
    )
    assert propose_resp.status_code == 201, propose_resp.text
    action = propose_resp.json()
    assert action["status"] == "pending_approval"
    assert action["tenant_id"] == tenant_a["tenant_id"]
    assert action["reviewed_by_user_id"] is None

    # 3. Una clave de agente NO puede auto-aprobar su acción (requiere humano JWT)
    self_approve = client.post(
        f"/api/v1/ai/agent-actions/{action['id']}/approve",
        headers={"X-Agent-Api-Key": raw_agent_key},
    )
    assert self_approve.status_code == 401

    # 4. Aislamiento multi-tenant: Tenant B no ve ni puede aprobar/rechazar la acción de Tenant A
    assert client.get("/api/v1/ai/agent-actions", headers=tenant_b["headers"]).json() == []
    assert (
        client.get(
            f"/api/v1/ai/agent-actions/{action['id']}",
            headers=tenant_b["headers"],
        ).status_code
        == 404
    )
    assert (
        client.post(
            f"/api/v1/ai/agent-actions/{action['id']}/approve",
            headers=tenant_b["headers"],
        ).status_code
        == 404
    )

    # 5. No se puede ejecutar antes de aprobar
    premature_exec = client.post(
        f"/api/v1/ai/agent-actions/{action['id']}/execute",
        headers=tenant_a["headers"],
    )
    assert premature_exec.status_code == 409

    # 6. Humano de Tenant A aprueba la acción
    approve_resp = client.post(
        f"/api/v1/ai/agent-actions/{action['id']}/approve",
        headers=tenant_a["headers"],
        json={"review_note": "Correcto, crear tarea de seguimiento."},
    )
    assert approve_resp.status_code == 200
    approved = approve_resp.json()
    assert approved["status"] == "approved"
    assert approved["reviewed_by_user_id"] == tenant_a["user"]["id"]
    assert approved["reviewed_at"] is not None
    assert approved["review_note"] == "Correcto, crear tarea de seguimiento."

    # No se puede volver a aprobar ni rechazar una acción ya aprobada
    assert (
        client.post(
            f"/api/v1/ai/agent-actions/{action['id']}/approve",
            headers=tenant_a["headers"],
        ).status_code
        == 409
    )
    assert (
        client.post(
            f"/api/v1/ai/agent-actions/{action['id']}/reject",
            headers=tenant_a["headers"],
        ).status_code
        == 409
    )

    # 7. Ejecutar la acción aprobada crea la tarea en el CRM y pasa a 'executed'
    exec_resp = client.post(
        f"/api/v1/ai/agent-actions/{action['id']}/execute",
        headers=tenant_a["headers"],
    )
    assert exec_resp.status_code == 200
    executed = exec_resp.json()
    assert executed["status"] == "executed"
    assert executed["target_entity_id"] is not None

    tasks_a = client.get("/api/v1/crm/tasks", headers=tenant_a["headers"]).json()
    assert len(tasks_a) == 1
    assert tasks_a[0]["id"] == executed["target_entity_id"]
    assert tasks_a[0]["title"] == "Enviar propuesta comercial actualizada (EUR)"

    # 8. Auditoría ActivityLog refleja tanto al agente como al humano aprobador
    agent_logs = client.get(
        "/api/v1/crm/activities?actor_type=agent",
        headers=tenant_a["headers"],
    ).json()
    assert len(agent_logs) == 2
    assert {log["action"] for log in agent_logs} == {"propose:create_task", "execute:create_task"}
    assert all(log["model_used"] == "claude-3-7-sonnet" for log in agent_logs)

    human_logs = client.get(
        "/api/v1/crm/activities?actor_type=human",
        headers=tenant_a["headers"],
    ).json()
    assert any(log["action"] == "approve:agent_action" for log in human_logs)


def test_agent_action_rejection_and_revoked_key(client: TestClient, tenant_a: dict) -> None:
    key_resp = client.post(
        "/api/v1/ai/agent-keys",
        headers=tenant_a["headers"],
        json={"name": "Agente Temporal"},
    ).json()
    raw_key = key_resp["raw_key"]

    action = client.post(
        "/api/v1/ai/agent-actions",
        headers={"X-Agent-Api-Key": raw_key},
        json={
            "agent_name": "agente-temporal",
            "model_used": "gpt-4o-mini",
            "action_type": "create_lead",
            "target_entity_type": "lead",
            "payload": {"full_name": "Lead Dudoso"},
        },
    ).json()

    reject_resp = client.post(
        f"/api/v1/ai/agent-actions/{action['id']}/reject",
        headers=tenant_a["headers"],
        json={"review_note": "Contacto duplicado"},
    )
    assert reject_resp.status_code == 200
    rejected = reject_resp.json()
    assert rejected["status"] == "rejected"
    assert rejected["reviewed_by_user_id"] == tenant_a["user"]["id"]

    # Revocar clave de agente impide nuevas propuestas
    del_resp = client.delete(
        f"/api/v1/ai/agent-keys/{key_resp['id']}",
        headers=tenant_a["headers"],
    )
    assert del_resp.status_code == 204

    blocked = client.post(
        "/api/v1/ai/agent-actions",
        headers={"X-Agent-Api-Key": raw_key},
        json={
            "agent_name": "agente-temporal",
            "action_type": "create_lead",
            "target_entity_type": "lead",
            "payload": {"full_name": "No debería entrar"},
        },
    )
    assert blocked.status_code == 401
