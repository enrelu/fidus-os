"""Tests de Fase 1: Prioridades de Hoy, Analítica del Panel, Conversión de Leads y Cualificación manual."""

from __future__ import annotations

import json
from datetime import datetime, timedelta

import httpx
from fastapi.testclient import TestClient
from sqlmodel import Session, select

from ai.gateway import AIGateway
from ai.routes import get_ai_gateway
from core.models import ActivityLog, Client, Lead, Opportunity, Organization, Task, utc_now


def _register_byok_openai(client: TestClient, headers: dict, *, model_name: str = "gpt-4o-mini") -> None:
    resp = client.post(
        "/api/v1/ai/providers",
        headers=headers,
        json={
            "provider": "openai",
            "model_name": model_name,
            "api_key": "sk-phase1-test-1234",
            "is_default": True,
            "is_active": True,
        },
    )
    assert resp.status_code == 201, resp.text


def test_today_priorities_and_tenant_isolation(
    client: TestClient,
    session: Session,
    tenant_a: dict,
    tenant_b: dict,
) -> None:
    now = utc_now()

    org_a = client.post(
        "/api/v1/crm/organizations",
        headers=tenant_a["headers"],
        json={"name": "Soluciones Ibéricas S.L.", "cif": "B11223344"},
    ).json()

    # Tarea vencida urgente en tenant_a
    task_a = client.post(
        "/api/v1/crm/tasks",
        headers=tenant_a["headers"],
        json={
            "organization_id": org_a["id"],
            "title": "Enviar contrato definitivo",
            "priority": "urgent",
            "due_date": (now - timedelta(days=2)).isoformat(),
        },
    ).json()

    # Lead antiguo sin actividad en tenant_a (>10 días)
    lead_a_resp = client.post(
        "/api/v1/crm/leads",
        headers=tenant_a["headers"],
        json={
            "full_name": "Marta Ruiz",
            "company_name": "Textiles Levante",
            "status": "contacted",
            "score": 82,
            "skip_ai_qualification": True,
        },
    )
    lead_a_id = lead_a_resp.json()["id"]
    lead_db = session.get(Lead, lead_a_id)
    assert lead_db is not None
    lead_db.created_at = now - timedelta(days=12)
    lead_db.updated_at = now - timedelta(days=12)
    session.add(lead_db)
    # Retrotraer ActivityLog de creación para simular lead estancado
    for act in session.exec(
        select(ActivityLog).where(
            ActivityLog.tenant_id == tenant_a["tenant_id"],
            ActivityLog.entity_type == "lead",
            ActivityLog.entity_id == lead_a_id,
        )
    ).all():
        act.created_at = now - timedelta(days=12)
        session.add(act)

    # Oportunidad parada y sin tarea abierta en tenant_a
    opp_a = client.post(
        "/api/v1/crm/opportunities",
        headers=tenant_a["headers"],
        json={
            "organization_id": org_a["id"],
            "title": "Implantación ERP 2026",
            "amount_eur": 24000,
            "stage": "proposal",
            "probability": 60,
        },
    ).json()
    for act in session.exec(
        select(ActivityLog).where(
            ActivityLog.tenant_id == tenant_a["tenant_id"],
            ActivityLog.entity_type == "opportunity",
            ActivityLog.entity_id == opp_a["id"],
        )
    ).all():
        act.created_at = now - timedelta(days=11)
        session.add(act)

    # Datos de tenant_b que jamás deben aparecer en tenant_a
    client.post(
        "/api/v1/crm/tasks",
        headers=tenant_b["headers"],
        json={
            "title": "Tarea confidencial Tenant B",
            "priority": "urgent",
            "due_date": (now - timedelta(days=5)).isoformat(),
        },
    )
    session.commit()

    resp_today = client.get("/api/v1/crm/priorities/today", headers=tenant_a["headers"])
    assert resp_today.status_code == 200, resp_today.text
    data = resp_today.json()

    resp_dash = client.get("/api/v1/crm/priorities/dashboard", headers=tenant_a["headers"])
    assert resp_dash.status_code == 200

    titles = [it["title"] for it in data["items"]]
    assert "Enviar contrato definitivo" in titles
    assert "Marta Ruiz" in titles
    assert "Implantación ERP 2026" in titles
    assert "Tarea confidencial Tenant B" not in titles

    # Orden descendente por impacto
    scores = [it["impact_score"] for it in data["items"]]
    assert scores == sorted(scores, reverse=True)
    assert data["items"][0]["entity_id"] == task_a["id"]
    assert data["summary"]["overdue_tasks_count"] == 1
    assert data["summary"]["stale_leads_count"] == 1
    assert data["summary"]["stalled_opportunities_count"] == 1
    assert any(sl["id"] == lead_a_id for sl in data["attention"]["stale_leads"])

    # Al cambiar el estado del lead vía PATCH, registra ActivityLog y deja de estar stale
    patch_resp = client.patch(
        f"/api/v1/crm/leads/{lead_a_id}",
        headers=tenant_a["headers"],
        json={"status": "replied"},
    )
    assert patch_resp.status_code == 200, patch_resp.text

    logs = client.get(
        "/api/v1/crm/activities?entity_type=lead",
        headers=tenant_a["headers"],
    ).json()
    assert any(l["action"] == "status_change" and l["entity_id"] == lead_a_id for l in logs)

    after_data = client.get("/api/v1/crm/priorities/today", headers=tenant_a["headers"]).json()
    assert after_data["summary"]["stale_leads_count"] == 0


def test_dashboard_analytics_filters_and_isolation(
    client: TestClient,
    session: Session,
    tenant_a: dict,
    tenant_b: dict,
) -> None:
    org_1 = client.post(
        "/api/v1/crm/organizations",
        headers=tenant_a["headers"],
        json={"name": "Grupo Levante", "cif": "B96001122"},
    ).json()
    org_2 = client.post(
        "/api/v1/crm/organizations",
        headers=tenant_a["headers"],
        json={"name": "Norte Logístico", "cif": "B48009988"},
    ).json()

    # Leads en distintos estados (2026 Q1 y 2025 Q4)
    l1 = client.post(
        "/api/v1/crm/leads",
        headers=tenant_a["headers"],
        json={"full_name": "Lead Uno", "status": "new", "skip_ai_qualification": True},
    ).json()
    l2 = client.post(
        "/api/v1/crm/leads",
        headers=tenant_a["headers"],
        json={"full_name": "Lead Dos", "status": "Converted", "skip_ai_qualification": True},
    ).json()
    l3 = client.post(
        "/api/v1/crm/leads",
        headers=tenant_a["headers"],
        json={"full_name": "Lead 2025", "status": "contacted", "skip_ai_qualification": True},
    ).json()

    for lid, dt in [
        (l1["id"], datetime(2026, 2, 10, 10, 0, 0)),
        (l2["id"], datetime(2026, 2, 15, 10, 0, 0)),
        (l3["id"], datetime(2025, 11, 20, 10, 0, 0)),
    ]:
        row = session.get(Lead, lid)
        assert row is not None
        row.created_at = dt
        session.add(row)

    # Cliente 2026 Q1
    c1 = client.post(
        "/api/v1/crm/clients",
        headers=tenant_a["headers"],
        json={"organization_id": org_1["id"], "full_name": "Elena Vidal", "rgpd_consent": True},
    ).json()
    c_row = session.get(Client, c1["id"])
    assert c_row is not None
    c_row.created_at = datetime(2026, 1, 22, 9, 0, 0)
    session.add(c_row)

    # Oportunidades 2026 Q1 y Q2 + 2025
    client.post(
        "/api/v1/crm/opportunities",
        headers=tenant_a["headers"],
        json={
            "organization_id": org_1["id"],
            "title": "Contrato Q1 Ganado",
            "amount_eur": 15000,
            "stage": "closed_won",
            "probability": 100,
            "expected_close_date": "2026-03-10T12:00:00",
        },
    )
    client.post(
        "/api/v1/crm/opportunities",
        headers=tenant_a["headers"],
        json={
            "organization_id": org_1["id"],
            "title": "Pipeline Q1 Abierto",
            "amount_eur": 20000,
            "stage": "proposal",
            "probability": 50,
            "expected_close_date": "2026-03-20T12:00:00",
        },
    )
    client.post(
        "/api/v1/crm/opportunities",
        headers=tenant_a["headers"],
        json={
            "organization_id": org_2["id"],
            "title": "Pipeline Q2 Abierto",
            "amount_eur": 10000,
            "stage": "negotiation",
            "probability": 80,
            "expected_close_date": "2026-05-05T12:00:00",
        },
    )
    opp_2025 = client.post(
        "/api/v1/crm/opportunities",
        headers=tenant_a["headers"],
        json={
            "organization_id": org_2["id"],
            "title": "Deal 2025",
            "amount_eur": 5000,
            "stage": "closed_lost",
            "probability": 0,
            "expected_close_date": "2025-10-12T12:00:00",
        },
    ).json()
    opp_2025_row = session.get(Opportunity, opp_2025["id"])
    assert opp_2025_row is not None
    opp_2025_row.created_at = datetime(2025, 10, 1, 10, 0, 0)
    session.add(opp_2025_row)

    # Tenant B con oportunidad enorme para verificar aislamiento
    client.post(
        "/api/v1/crm/opportunities",
        headers=tenant_b["headers"],
        json={
            "title": "Mega Deal Tenant B",
            "amount_eur": 999999,
            "stage": "proposal",
            "probability": 90,
            "expected_close_date": "2026-02-01T12:00:00",
        },
    )
    session.commit()

    # Año completo 2026
    resp_2026 = client.get("/api/v1/crm/analytics/dashboard?year=2026", headers=tenant_a["headers"])
    assert resp_2026.status_code == 200, resp_2026.text
    a2026 = resp_2026.json()
    assert a2026["kpis"]["total_leads"] == 2
    assert a2026["kpis"]["conversion_rate"] == 50.0
    assert a2026["kpis"]["pipeline_value"] == 30000.0
    assert a2026["kpis"]["weighted_pipeline"] == 18000.0  # 20k*0.5 + 10k*0.8
    assert a2026["kpis"]["won_value"] == 15000.0
    assert a2026["kpis"]["win_rate"] == 100.0
    assert a2026["concentration"]["top1_name"] == "Grupo Levante"
    assert a2026["concentration"]["top1_share_pct"] == 66.7
    assert len(a2026["monthly_activity"]) == 12
    assert len(a2026["forecast"]) == 4
    assert a2026["forecast"][0]["won_eur"] == 15000.0
    assert a2026["forecast"][1]["pipeline_eur"] == 10000.0

    # Filtro Q1 2026
    resp_q1 = client.get(
        "/api/v1/crm/analytics/dashboard?year=2026&quarter=1",
        headers=tenant_a["headers"],
    )
    assert resp_q1.status_code == 200
    aq1 = resp_q1.json()
    assert aq1["kpis"]["pipeline_value"] == 20000.0
    assert aq1["kpis"]["won_value"] == 15000.0


def test_convert_lead_atomic_and_isolation(
    client: TestClient,
    session: Session,
    tenant_a: dict,
    tenant_b: dict,
) -> None:
    lead_a = client.post(
        "/api/v1/crm/leads",
        headers=tenant_a["headers"],
        json={
            "full_name": "Paco Martínez",
            "email": "paco@aenor-ejemplo.es",
            "phone": "+34 600 111 222",
            "company_name": "Certificaciones Madrid S.L.",
            "skip_ai_qualification": True,
        },
    ).json()

    org_b = client.post(
        "/api/v1/crm/organizations",
        headers=tenant_b["headers"],
        json={"name": "Org Ajena B", "cif": "B99887766"},
    ).json()

    # Intentar convertir usando org_id de tenant_b -> 404 y lead intacto
    cross_org = client.post(
        f"/api/v1/crm/leads/{lead_a['id']}/convert",
        headers=tenant_a["headers"],
        json={"organization": {"existing_id": org_b["id"]}},
    )
    assert cross_org.status_code == 404
    session.expire_all()
    lead_after_err = session.get(Lead, lead_a["id"])
    assert lead_after_err is not None
    assert lead_after_err.status == "new"

    # Tenant B intenta convertir lead de Tenant A -> 404
    cross_lead = client.post(
        f"/api/v1/crm/leads/{lead_a['id']}/convert",
        headers=tenant_b["headers"],
        json={},
    )
    assert cross_lead.status_code == 404

    # Conversión completa en tenant_a creando Organización, Cliente (RGPD) y Oportunidad EUR
    ok_resp = client.post(
        f"/api/v1/crm/leads/{lead_a['id']}/convert",
        headers=tenant_a["headers"],
        json={
            "organization": {
                "create": True,
                "name": "Certificaciones Madrid S.L.",
                "cif": "b87654321",
                "razon_social": "Certificaciones Madrid Sociedad Limitada",
                "direccion_fiscal": "Paseo de la Castellana 50, Madrid",
                "sector": "Consultoría",
            },
            "client": {
                "create": True,
                "full_name": "Paco Martínez",
                "email": "paco@aenor-ejemplo.es",
                "job_title": "Director de Calidad",
                "rgpd_consent": True,
            },
            "opportunity": {
                "create": True,
                "title": "Licencia anual FidusOS Enterprise",
                "amount_eur": 18500,
                "stage": "proposal",
                "probability": 65,
            },
        },
    )
    assert ok_resp.status_code == 200, ok_resp.text
    body = ok_resp.json()
    assert body["lead"]["status"] == "Converted"
    assert body["organization"]["cif"] == "B87654321"
    assert body["lead"]["organization_id"] == body["organization"]["id"]
    assert body["client"]["rgpd_consent"] is True
    assert body["client"]["organization_id"] == body["organization"]["id"]
    assert body["opportunity"]["amount_eur"] == 18500
    assert body["opportunity"]["currency"] == "EUR"
    assert body["opportunity"]["lead_id"] == lead_a["id"]

    # Re-convertir devuelve 409 Conflict
    dup_resp = client.post(
        f"/api/v1/crm/leads/{lead_a['id']}/convert",
        headers=tenant_a["headers"],
        json={},
    )
    assert dup_resp.status_code == 409

    # Verificar ActivityLog(action="convert", entity_type="lead")
    activities = client.get("/api/v1/crm/activities?entity_type=lead", headers=tenant_a["headers"]).json()
    assert any(a["action"] == "convert" and a["entity_id"] == lead_a["id"] for a in activities)


def test_manual_qualify_and_contextual_copilot(
    client: TestClient,
    tenant_a: dict,
    tenant_b: dict,
) -> None:
    lead_a = client.post(
        "/api/v1/crm/leads",
        headers=tenant_a["headers"],
        json={
            "full_name": "Sofía Navarro",
            "company_name": "BioTech Valencia",
            "skip_ai_qualification": True,
        },
    ).json()

    # Sin BYOK -> 400
    no_byok = client.post(f"/api/v1/ai/proactive/qualify/{lead_a['id']}", headers=tenant_a["headers"])
    assert no_byok.status_code == 400

    # Configurar BYOK en tenant_a
    _register_byok_openai(client, tenant_a["headers"])

    # Cross-tenant -> 404
    cross = client.post(f"/api/v1/ai/proactive/qualify/{lead_a['id']}", headers=tenant_b["headers"])
    assert cross.status_code == 404

    captured_prompts: list[str] = []

    def mock_handler(request: httpx.Request) -> httpx.Response:
        req_json = json.loads(request.content.decode("utf-8"))
        sys_msg = req_json["messages"][0]["content"]
        captured_prompts.append(sys_msg)
        if "Eres el Copiloto Operativo CRM" in sys_msg:
            return httpx.Response(
                200,
                json={
                    "model": "gpt-4o-mini",
                    "choices": [
                        {
                            "message": {
                                "content": json.dumps(
                                    {
                                        "answer": "He preparado el seguimiento para Sofía Navarro.",
                                        "proposed_actions": [],
                                    },
                                    ensure_ascii=False,
                                )
                            }
                        }
                    ],
                },
            )
        return httpx.Response(
            200,
            json={
                "model": "gpt-4o-mini",
                "choices": [
                    {
                        "message": {
                            "content": json.dumps(
                                {
                                    "score": 91,
                                    "summary": "Alta prioridad comercial.",
                                    "suggested_task": {
                                        "title": "Llamar a Sofía Navarro",
                                        "priority": "high",
                                    },
                                    "first_contact_draft": "Hola Sofía...",
                                },
                                ensure_ascii=False,
                            )
                        }
                    }
                ],
            },
        )

    mock_gateway = AIGateway(transport=httpx.MockTransport(mock_handler))
    client.app.dependency_overrides[get_ai_gateway] = lambda: mock_gateway  # type: ignore[attr-defined]
    try:
        qual_resp = client.post(
            f"/api/v1/ai/proactive/qualify/{lead_a['id']}",
            headers=tenant_a["headers"],
        )
        assert qual_resp.status_code == 200, qual_resp.text
        qdata = qual_resp.json()
        assert qdata["status"] == "qualified"
        assert qdata["score"] == 91
        assert qdata["created_action"]["action_type"] == "create_task"

        # Contexto cross-tenant en Copilot -> 404
        lead_b = client.post(
            "/api/v1/crm/leads",
            headers=tenant_b["headers"],
            json={"full_name": "Lead B Ajeno", "skip_ai_qualification": True},
        ).json()
        bad_ctx = client.post(
            "/api/v1/ai/proactive/chat",
            headers=tenant_a["headers"],
            json={
                "messages": [{"role": "user", "content": "Analiza este lead"}],
                "context": {"view": "leads", "entity_type": "lead", "entity_id": lead_b["id"]},
            },
        )
        assert bad_ctx.status_code == 404

        # Chat contextual válido
        chat_resp = client.post(
            "/api/v1/ai/proactive/chat",
            headers=tenant_a["headers"],
            json={
                "messages": [{"role": "user", "content": "Prepara un seguimiento para este lead"}],
                "context": {
                    "view": "leads",
                    "entity_type": "lead",
                    "entity_id": lead_a["id"],
                    "entity_label": "Sofía Navarro",
                },
            },
        )
        assert chat_resp.status_code == 200, chat_resp.text
        assert "Sofía Navarro" in chat_resp.json()["answer"]
    finally:
        client.app.dependency_overrides.pop(get_ai_gateway, None)  # type: ignore[attr-defined]

    assert any("entity_type=lead" in p and "etiqueta=Sofía Navarro" in p for p in captured_prompts)
