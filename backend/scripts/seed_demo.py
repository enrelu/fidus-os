"""Script manual bajo demanda para sembrar datos demo en español (SQLite o PostgreSQL).

Uso:
    cd backend
    python -m scripts.seed_demo
"""

from __future__ import annotations

import argparse
import json
import sys

from sqlmodel import Session, select

from core.auth import hash_password
from core.config import get_settings
from core.database import get_engine, init_db
from core.models import (
    ActivityLog,
    ActorType,
    AgentAction,
    AgentActionStatus,
    Client,
    Lead,
    Opportunity,
    Organization,
    Tenant,
    User,
)


def seed_demo(*, force: bool = False) -> None:
    settings = get_settings()
    if settings.ENVIRONMENT.lower() == "production" and not force:
        raise SystemExit(
            "Seed bloqueado en ENVIRONMENT=production por seguridad. "
            "Si realmente deseas sembrar datos demo, ejecuta: python -m scripts.seed_demo --force"
        )

    engine = get_engine(settings.DATABASE_URL)
    init_db(engine)

    with Session(engine) as session:
        existing_user = session.exec(select(User).where(User.email == "demo@fidusos.es")).first()
        if existing_user is not None:
            print(
                f"El usuario demo ya existe ({existing_user.email}, tenant_id={existing_user.tenant_id}). "
                "No se realizaron cambios."
            )
            return

        tenant = Tenant(
            name="Fidus Demo Iberia S.L.",
            slug="fidus-demo-iberia",
            cif="B87654321",
            razon_social="Fidus Demo Iberia Sociedad Limitada",
            direccion_fiscal="Paseo de la Castellana 95, 28046 Madrid",
            plan="open_core",
            is_active=True,
        )
        session.add(tenant)
        session.flush()

        user = User(
            tenant_id=tenant.id,  # type: ignore[arg-type]
            email="demo@fidusos.es",
            full_name="Elena Navarro (Admin Demo)",
            hashed_password=hash_password("FidusDemo2026!"),
            role="admin",
            is_active=True,
        )
        session.add(user)
        session.flush()

        org = Organization(
            tenant_id=tenant.id,  # type: ignore[arg-type]
            name="Soluciones Industriales Levante S.L.",
            cif="B98123456",
            razon_social="Soluciones Industriales Levante Sociedad Limitada",
            direccion_fiscal="Av. del Puerto 140, 46023 Valencia",
            sector="Fabricación y Automatización",
            website="https://sil-levante.example.es",
            phone="+34 960 123 456",
            email="compras@sil-levante.example.es",
            notes="Cuenta estratégica en expansión hacia automatización comercial.",
        )
        session.add(org)
        session.flush()

        client = Client(
            tenant_id=tenant.id,  # type: ignore[arg-type]
            organization_id=org.id,
            full_name="Carlos Martínez",
            email="cmartinez@sil-levante.example.es",
            phone="+34 611 223 344",
            job_title="Director de Operaciones",
            rgpd_consent=True,
        )
        session.add(client)

        lead = Lead(
            tenant_id=tenant.id,  # type: ignore[arg-type]
            organization_id=org.id,
            full_name="Marta Ruiz",
            email="mruiz@gruposur-ejemplo.es",
            phone="+34 655 987 654",
            company_name="Grupo Sur Logística S.A.",
            source="web_inbound",
            status="qualified",
            score=82,
            notes="Solicitó demo de supervisión HITL para equipo de 15 comerciales.",
        )
        session.add(lead)

        opp = Opportunity(
            tenant_id=tenant.id,  # type: ignore[arg-type]
            organization_id=org.id,
            title="Implantación CRM Agent-First + Automatización ERP",
            amount_eur=24500.0,
            currency="EUR",
            stage="proposal",
            probability=65,
            notes="Propuesta presentada al comité de dirección; pendiente revisión técnica.",
        )
        session.add(opp)
        session.flush()

        payload = {
            "organization_id": org.id,
            "opportunity_id": opp.id,
            "title": "Preparar anexo técnico RGPD y agendar cierre con Dirección Financiera",
            "description": (
                "El agente detectó que la oportunidad lleva fase de propuesta y requiere "
                "validación de cumplimiento LOPDGDD antes de la firma."
            ),
            "priority": "high",
        }
        action = AgentAction(
            tenant_id=tenant.id,  # type: ignore[arg-type]
            agent_name="Claude Desktop (Comercial MCP)",
            model_used="claude-3-7-sonnet",
            action_type="create_task",
            target_entity_type="task",
            target_entity_id=None,
            payload_json=json.dumps(payload, ensure_ascii=False),
            status=AgentActionStatus.PENDING_APPROVAL.value,
        )
        session.add(action)
        session.flush()

        log = ActivityLog(
            tenant_id=tenant.id,  # type: ignore[arg-type]
            actor_type=ActorType.AGENT.value,
            actor_name="Claude Desktop (Comercial MCP)",
            user_id=None,
            model_used="claude-3-7-sonnet",
            action="propose:create_task",
            entity_type="agent_action",
            entity_id=action.id,
            details_json=json.dumps(payload, ensure_ascii=False),
        )
        session.add(log)
        session.commit()

        print("Datos demo creados correctamente:")
        print(f"  - Tenant: {tenant.name} (id={tenant.id}, CIF={tenant.cif})")
        print("  - Usuario admin: demo@fidusos.es / FidusDemo2026!")
        print(f"  - Organización: {org.name} (CIF={org.cif})")
        print(f"  - Oportunidad: {opp.title} ({opp.amount_eur} EUR)")
        print(f"  - AgentAction HITL pendiente: id={action.id}")


def main() -> int:
    parser = argparse.ArgumentParser(description="Sembrar datos demo en español para FidusOS v2.")
    parser.add_argument(
        "--force",
        action="store_true",
        help="Permite ejecutar el seed incluso con ENVIRONMENT=production.",
    )
    args = parser.parse_args()
    seed_demo(force=args.force)
    return 0


if __name__ == "__main__":
    sys.exit(main())
