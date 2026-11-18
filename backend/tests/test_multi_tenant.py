"""Tests de aislamiento multi-tenant estricto, autenticación y CRM base."""

from __future__ import annotations

from fastapi.testclient import TestClient
from sqlmodel import Session

from core.auth import create_access_token
from core.db_migrations import run_migrations_upgrade
from core.models import Tenant


def test_health_and_auth_me(client: TestClient, tenant_a: dict) -> None:
    health = client.get("/health")
    assert health.status_code == 200
    assert health.json()["status"] == "ok"

    me = client.get("/api/v1/auth/me", headers=tenant_a["headers"])
    assert me.status_code == 200
    assert me.json()["email"] == "admin.a@iberia-ejemplo.es"
    assert me.json()["tenant_id"] == tenant_a["tenant_id"]


def test_unauthenticated_requests_rejected(client: TestClient) -> None:
    assert client.get("/api/v1/crm/organizations").status_code == 401
    assert client.get("/api/v1/ai/providers").status_code == 401
    assert client.get("/api/v1/ai/agent-actions").status_code == 401


def test_mismatched_jwt_tenant_claim_rejected(client: TestClient, tenant_a: dict, tenant_b: dict) -> None:
    forged_token = create_access_token(
        user_id=tenant_a["user"]["id"],
        tenant_id=tenant_b["tenant_id"],
        role="admin",
    )
    resp = client.get(
        "/api/v1/crm/organizations",
        headers={"Authorization": f"Bearer {forged_token}"},
    )
    assert resp.status_code == 401


def test_inactive_tenant_rejected(client: TestClient, session: Session, tenant_a: dict) -> None:
    tenant = session.get(Tenant, tenant_a["tenant_id"])
    assert tenant is not None
    tenant.is_active = False
    session.add(tenant)
    session.commit()

    resp = client.get("/api/v1/crm/organizations", headers=tenant_a["headers"])
    assert resp.status_code == 403


def test_strict_multi_tenant_isolation_across_crm_entities(
    client: TestClient,
    tenant_a: dict,
    tenant_b: dict,
) -> None:
    # Tenant A crea organización con datos fiscales españoles
    org_resp = client.post(
        "/api/v1/crm/organizations",
        headers=tenant_a["headers"],
        json={
            "name": "Talleres Castilla",
            "cif": "b47001122",
            "razon_social": "Talleres Castilla S.L.",
            "direccion_fiscal": "Polígono San Cristóbal 4, Valladolid",
        },
    )
    assert org_resp.status_code == 201
    org_a = org_resp.json()
    assert org_a["cif"] == "B47001122"
    assert org_a["tenant_id"] == tenant_a["tenant_id"]

    # Tenant A crea cliente RGPD y oportunidad en EUR
    cli_resp = client.post(
        "/api/v1/crm/clients",
        headers=tenant_a["headers"],
        json={
            "organization_id": org_a["id"],
            "full_name": "Lucía Fernández",
            "email": "lucia@castilla-ejemplo.es",
            "rgpd_consent": True,
        },
    )
    assert cli_resp.status_code == 201
    client_a = cli_resp.json()
    assert client_a["rgpd_consent"] is True
    assert client_a["rgpd_consent_date"] is not None

    opp_resp = client.post(
        "/api/v1/crm/opportunities",
        headers=tenant_a["headers"],
        json={
            "organization_id": org_a["id"],
            "client_id": client_a["id"],
            "title": "Implantación ERP + CRM",
            "amount_eur": 24500.0,
            "stage": "proposal",
            "probability": 60,
        },
    )
    assert opp_resp.status_code == 201
    opp_a = opp_resp.json()
    assert opp_a["currency"] == "EUR"
    assert opp_a["amount_eur"] == 24500.0

    # Tenant B NO ve nada de Tenant A en listados
    assert client.get("/api/v1/crm/organizations", headers=tenant_b["headers"]).json() == []
    assert client.get("/api/v1/crm/clients", headers=tenant_b["headers"]).json() == []
    assert client.get("/api/v1/crm/opportunities", headers=tenant_b["headers"]).json() == []
    assert client.get("/api/v1/crm/activities", headers=tenant_b["headers"]).json() == []

    # Tenant B NO puede leer, modificar ni borrar recursos de Tenant A
    assert client.get(f"/api/v1/crm/organizations/{org_a['id']}", headers=tenant_b["headers"]).status_code == 404
    assert (
        client.patch(
            f"/api/v1/crm/organizations/{org_a['id']}",
            headers=tenant_b["headers"],
            json={"name": "Secuestrada"},
        ).status_code
        == 404
    )
    assert client.delete(f"/api/v1/crm/organizations/{org_a['id']}", headers=tenant_b["headers"]).status_code == 404
    assert client.get(f"/api/v1/crm/opportunities/{opp_a['id']}", headers=tenant_b["headers"]).status_code == 404

    # Tenant B NO puede referenciar organization_id de Tenant A al crear un cliente o lead
    cross_fk = client.post(
        "/api/v1/crm/clients",
        headers=tenant_b["headers"],
        json={
            "organization_id": org_a["id"],
            "full_name": "Intruso",
        },
    )
    assert cross_fk.status_code == 404

    # Tenant A sí conserva su ActivityLog con actor_type="human"
    activities_a = client.get("/api/v1/crm/activities", headers=tenant_a["headers"]).json()
    assert len(activities_a) >= 3
    assert all(act["tenant_id"] == tenant_a["tenant_id"] for act in activities_a)
    assert all(act["actor_type"] == "human" for act in activities_a)


def test_alembic_migrations_run_cleanly(tmp_path) -> None:
    db_file = tmp_path / "migration_check.db"
    run_migrations_upgrade("head", database_url=f"sqlite:///{db_file}")
    assert db_file.exists()
