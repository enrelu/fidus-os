"""Tests de Fase 2: Búsqueda global, Enriquecimiento CRM, Ficha 360, Interacciones y Feed."""

from __future__ import annotations

from fastapi.testclient import TestClient


def test_global_search_groups_cif_and_tenant_isolation(
    client: TestClient,
    tenant_a: dict,
    tenant_b: dict,
) -> None:
    org_a = client.post(
        "/api/v1/crm/organizations",
        headers=tenant_a["headers"],
        json={
            "name": "Grupo Levante",
            "cif": "B96112233",
            "razon_social": "Grupo Levante Logística S.L.",
            "sector": "Logística",
        },
    ).json()

    cli_a = client.post(
        "/api/v1/crm/clients",
        headers=tenant_a["headers"],
        json={
            "organization_id": org_a["id"],
            "full_name": "Elena Levante",
            "email": "elena@grupolevante.es",
            "job_title": "Directora Operaciones",
            "rgpd_consent": True,
        },
    ).json()

    opp_a = client.post(
        "/api/v1/crm/opportunities",
        headers=tenant_a["headers"],
        json={
            "organization_id": org_a["id"],
            "client_id": cli_a["id"],
            "title": "Proyecto Levante Cloud",
            "amount_eur": 18500,
            "stage": "proposal",
            "probability": 60,
        },
    ).json()

    task_a = client.post(
        "/api/v1/crm/tasks",
        headers=tenant_a["headers"],
        json={
            "organization_id": org_a["id"],
            "opportunity_id": opp_a["id"],
            "title": "Revisar anexo Levante",
            "priority": "high",
        },
    ).json()

    lead_a = client.post(
        "/api/v1/crm/leads",
        headers=tenant_a["headers"],
        json={
            "full_name": "Carlos Levante",
            "company_name": "Levante Retail",
            "status": "new",
            "skip_ai_qualification": True,
        },
    ).json()

    # Datos de Tenant B con coincidencia "Levante" y CIF similar que NO deben filtrarse
    client.post(
        "/api/v1/crm/organizations",
        headers=tenant_b["headers"],
        json={
            "name": "Levante Secreto B",
            "cif": "B96112233",
            "razon_social": "Levante Secreto Tenant B S.L.",
        },
    )

    # Búsqueda vacía devuelve grupos vacíos
    empty_resp = client.get("/api/v1/crm/search?q=   ", headers=tenant_a["headers"])
    assert empty_resp.status_code == 200
    assert empty_resp.json()["groups"] == []

    # Búsqueda por texto general
    resp = client.get("/api/v1/crm/search?q=Levante", headers=tenant_a["headers"])
    assert resp.status_code == 200, resp.text
    groups = {g["type"]: g["items"] for g in resp.json()["groups"]}

    assert any(it["id"] == org_a["id"] and it["href"] == f"/organization/{org_a['id']}" for it in groups["organization"])
    assert any(it["id"] == cli_a["id"] and it["href"] == f"/client/{cli_a['id']}" for it in groups["client"])
    assert any(it["id"] == opp_a["id"] and it["href"] == f"/opportunity/{opp_a['id']}" for it in groups["opportunity"])
    assert any(it["id"] == task_a["id"] and it["href"] == "/tasks" for it in groups["task"])
    assert any(it["id"] == lead_a["id"] and it["href"] == f"/lead/{lead_a['id']}" for it in groups["lead"])

    # Jamás devuelve entidades de Tenant B
    all_titles = [it["title"] for items in groups.values() for it in items]
    assert "Levante Secreto B" not in all_titles

    # Búsqueda por CIF y razón social
    cif_resp = client.get("/api/v1/crm/search?q=B96112233", headers=tenant_a["headers"])
    assert cif_resp.status_code == 200
    cif_orgs = [g["items"] for g in cif_resp.json()["groups"] if g["type"] == "organization"]
    assert len(cif_orgs) == 1
    assert len(cif_orgs[0]) == 1
    assert cif_orgs[0][0]["id"] == org_a["id"]


def test_enriched_organizations_clients_potential_and_safe_delete(
    client: TestClient,
    tenant_a: dict,
    tenant_b: dict,
) -> None:
    org = client.post(
        "/api/v1/crm/organizations",
        headers=tenant_a["headers"],
        json={
            "name": "Acero Ibérico",
            "cif": "A28001100",
            "razon_social": "Acero Ibérico S.A.",
            "direccion_fiscal": "Calle Mayor 12, Madrid",
        },
    ).json()
    assert org["contacts_count"] == 0
    assert org["open_pipeline_eur"] == 0.0

    cli = client.post(
        "/api/v1/crm/clients",
        headers=tenant_a["headers"],
        json={
            "organization_id": org["id"],
            "full_name": "Javier Sanz",
            "email": "javier@acero.es",
            "job_title": "CEO",
            "rgpd_consent": True,
        },
    ).json()
    assert cli["organization_name"] == "Acero Ibérico"
    assert isinstance(cli["score"], int)
    assert cli["potential"] in {"low", "medium", "high"}

    opp_open = client.post(
        "/api/v1/crm/opportunities",
        headers=tenant_a["headers"],
        json={
            "organization_id": org["id"],
            "client_id": cli["id"],
            "title": "Suministro Anual",
            "amount_eur": 12000,
            "stage": "negotiation",
            "probability": 75,
        },
    ).json()
    assert opp_open["organization_name"] == "Acero Ibérico"
    assert opp_open["client_name"] == "Javier Sanz"

    client.post(
        "/api/v1/crm/tasks",
        headers=tenant_a["headers"],
        json={
            "organization_id": org["id"],
            "client_id": cli["id"],
            "opportunity_id": opp_open["id"],
            "title": "Enviar oferta firmada",
            "priority": "medium",
        },
    )

    orgs_list = client.get("/api/v1/crm/organizations", headers=tenant_a["headers"]).json()
    org_item = next(o for o in orgs_list if o["id"] == org["id"])
    assert org_item["contacts_count"] == 1
    assert org_item["contacts_preview"][0]["full_name"] == "Javier Sanz"
    assert org_item["open_opportunities_count"] == 1
    assert org_item["open_pipeline_eur"] == 12000.0
    assert org_item["open_tasks_count"] == 1

    # Actualizar potencial de cliente vía PATCH y verificar persistencia
    bad_pot = client.patch(
        f"/api/v1/crm/clients/{cli['id']}",
        headers=tenant_a["headers"],
        json={"potential": "ultra"},
    )
    assert bad_pot.status_code == 422

    patch_cli = client.patch(
        f"/api/v1/crm/clients/{cli['id']}",
        headers=tenant_a["headers"],
        json={"potential": "low"},
    )
    assert patch_cli.status_code == 200, patch_cli.text
    assert patch_cli.json()["potential"] == "low"

    fetched_cli = client.get(f"/api/v1/crm/clients/{cli['id']}", headers=tenant_a["headers"]).json()
    assert fetched_cli["potential"] == "low"
    assert fetched_cli["open_pipeline_eur"] == 12000.0

    # Aislamiento cross-tenant en GET/PATCH/DELETE
    assert client.get(f"/api/v1/crm/organizations/{org['id']}", headers=tenant_b["headers"]).status_code == 404
    assert client.patch(
        f"/api/v1/crm/clients/{cli['id']}",
        headers=tenant_b["headers"],
        json={"potential": "high"},
    ).status_code == 404

    # Borrado seguro de organización desvincula FKs sin romper registros hijos
    del_resp = client.delete(f"/api/v1/crm/organizations/{org['id']}", headers=tenant_a["headers"])
    assert del_resp.status_code == 204
    cli_after = client.get(f"/api/v1/crm/clients/{cli['id']}", headers=tenant_a["headers"]).json()
    assert cli_after["organization_id"] is None
    assert cli_after["organization_name"] is None


def test_entity_360_interactions_and_activity_feed(
    client: TestClient,
    tenant_a: dict,
    tenant_b: dict,
) -> None:
    org = client.post(
        "/api/v1/crm/organizations",
        headers=tenant_a["headers"],
        json={"name": "Energía Sur", "cif": "B41002233"},
    ).json()
    cli = client.post(
        "/api/v1/crm/clients",
        headers=tenant_a["headers"],
        json={
            "organization_id": org["id"],
            "full_name": "Lucía Gómez",
            "email": "lucia@energiasur.es",
            "rgpd_consent": True,
        },
    ).json()
    lead = client.post(
        "/api/v1/crm/leads",
        headers=tenant_a["headers"],
        json={
            "organization_id": org["id"],
            "full_name": "Pedro Torres",
            "company_name": "Energía Sur",
            "status": "contacted",
            "skip_ai_qualification": True,
        },
    ).json()
    opp = client.post(
        "/api/v1/crm/opportunities",
        headers=tenant_a["headers"],
        json={
            "organization_id": org["id"],
            "client_id": cli["id"],
            "lead_id": lead["id"],
            "title": "Auditoría Fotovoltaica",
            "amount_eur": 30000,
            "stage": "qualification",
            "probability": 40,
        },
    ).json()
    task = client.post(
        "/api/v1/crm/tasks",
        headers=tenant_a["headers"],
        json={
            "organization_id": org["id"],
            "client_id": cli["id"],
            "opportunity_id": opp["id"],
            "title": "Preparar estudio técnico",
            "priority": "high",
        },
    ).json()

    # Registrar interacción humana válida (incluyendo alias en inglés "call")
    inter_resp = client.post(
        "/api/v1/crm/interactions",
        headers=tenant_a["headers"],
        json={
            "entity_type": "opportunity",
            "entity_id": opp["id"],
            "channel": "call",
            "summary": "Revisión de presupuesto con dirección técnica.",
            "outcome": "Pide propuesta final el viernes",
        },
    )
    assert inter_resp.status_code == 201, inter_resp.text
    assert inter_resp.json()["action"] == "interaction:llamada"

    # Canal inválido o entidad inválida -> 422
    bad_ch = client.post(
        "/api/v1/crm/interactions",
        headers=tenant_a["headers"],
        json={
            "entity_type": "opportunity",
            "entity_id": opp["id"],
            "channel": "fax",
            "summary": "Intento de fax",
        },
    )
    assert bad_ch.status_code == 422

    bad_ent = client.post(
        "/api/v1/crm/interactions",
        headers=tenant_a["headers"],
        json={
            "entity_type": "task",
            "entity_id": task["id"],
            "channel": "nota",
            "summary": "No soportado",
        },
    )
    assert bad_ent.status_code == 422

    # Interacción cross-tenant -> 404
    cross_inter = client.post(
        "/api/v1/crm/interactions",
        headers=tenant_b["headers"],
        json={
            "entity_type": "opportunity",
            "entity_id": opp["id"],
            "channel": "nota",
            "summary": "Intento indebido",
        },
    )
    assert cross_inter.status_code == 404

    # Cambiar etapa de oportunidad para generar stage_change en feed
    stage_resp = client.patch(
        f"/api/v1/crm/opportunities/{opp['id']}",
        headers=tenant_a["headers"],
        json={"stage": "proposal"},
    )
    assert stage_resp.status_code == 200

    # Ficha 360 para los 4 tipos de entidad
    for etype, eid in [
        ("organization", org["id"]),
        ("client", cli["id"]),
        ("lead", lead["id"]),
        ("opportunity", opp["id"]),
    ]:
        r360 = client.get(f"/api/v1/crm/entities/{etype}/{eid}/360", headers=tenant_a["headers"])
        assert r360.status_code == 200, f"{etype} 360 failed: {r360.text}"
        payload = r360.json()
        assert payload["entity_type"] == etype
        assert payload["entity_id"] == eid
        assert payload["organization"]["id"] == org["id"]
        assert any(o["id"] == opp["id"] for o in payload["opportunities"])
        assert any(t["id"] == task["id"] for t in payload["tasks"])
        assert len(payload["activities"]) >= 1
        assert all("description" in a and "timestamp" in a for a in payload["activities"])

        # Aislamiento cross-tenant en 360
        r360_b = client.get(f"/api/v1/crm/entities/{etype}/{eid}/360", headers=tenant_b["headers"])
        assert r360_b.status_code == 404

    # Tipo no soportado -> 400
    assert client.get("/api/v1/crm/entities/invoice/1/360", headers=tenant_a["headers"]).status_code == 400

    # Feed de actividades enriquecido
    feed = client.get("/api/v1/crm/activities?limit=20", headers=tenant_a["headers"])
    assert feed.status_code == 200
    rows = feed.json()
    assert len(rows) >= 5
    assert any(r["action"] == "interaction:llamada" and "Llamada en Auditoría Fotovoltaica" in r["description"] for r in rows)
    assert any(r["action"] == "stage_change" and r["entity_label"] == "Auditoría Fotovoltaica" for r in rows)
