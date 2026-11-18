"""Herramientas MCP nativas del CRM FidusOS v2 (multi-tenant estricto y mercado español)."""

import json
from typing import Any, Literal, Optional

from mcp.server.fastmcp import FastMCP
from sqlalchemy import func, or_
from sqlmodel import col, select

from core.models import (
    ActivityLog,
    ActorType,
    AgentAction,
    AgentActionStatus,
    Client,
    Lead,
    Opportunity,
    Organization,
    Task,
    utc_now,
)
from mcp_server.context import open_mcp_db_session, require_mcp_scope

mcp = FastMCP(
    name="FidusOS v2 CRM",
    instructions=(
        "Servidor MCP oficial de FidusOS v2 (CRM AI-Ready / Agent-First para pymes y empresas "
        "medianas en España). Todas las operaciones están aisladas por el tenant asociado a tu "
        "AgentApiKey. Usa 'proponer_accion' para acciones que requieran aprobación humana (HITL)."
    ),
    streamable_http_path="/",
    json_response=True,
    stateless_http=True,
)

_ENTITY_MODELS: dict[str, Any] = {
    "organization": Organization,
    "client": Client,
    "lead": Lead,
    "opportunity": Opportunity,
    "task": Task,
}


def _normalize_channel(channel: str) -> str:
    cleaned = channel.strip().lower()
    mapping = {
        "llamada": "llamada",
        "reunion": "reunion",
        "reunión": "reunion",
        "email": "email",
        "whatsapp": "whatsapp",
    }
    if cleaned not in mapping:
        raise ValueError(
            "Canal de interacción no válido. Usa uno de: 'llamada', 'reunion', 'email', 'whatsapp'."
        )
    return mapping[cleaned]


@mcp.tool()
def buscar_crm(query: str, limit: int = 10) -> dict[str, Any]:
    """Busca organizaciones, clientes, leads, oportunidades (EUR) y tareas del tenant actual.

    Requiere scope: `crm:read`.
    """
    ctx = require_mcp_scope("crm:read")
    term = query.strip().lower()
    if not term:
        raise ValueError("El parámetro 'query' no puede estar vacío.")
    safe_limit = max(1, min(limit, 50))

    with open_mcp_db_session(app=ctx.app) as session:
        orgs = session.exec(
            select(Organization)
            .where(
                Organization.tenant_id == ctx.tenant_id,
                or_(
                    func.lower(col(Organization.name)).contains(term),
                    func.lower(func.coalesce(col(Organization.cif), "")).contains(term),
                    func.lower(func.coalesce(col(Organization.razon_social), "")).contains(term),
                    func.lower(func.coalesce(col(Organization.email), "")).contains(term),
                ),
            )
            .limit(safe_limit)
        ).all()

        clients = session.exec(
            select(Client)
            .where(
                Client.tenant_id == ctx.tenant_id,
                or_(
                    func.lower(col(Client.full_name)).contains(term),
                    func.lower(func.coalesce(col(Client.email), "")).contains(term),
                    func.lower(func.coalesce(col(Client.job_title), "")).contains(term),
                ),
            )
            .limit(safe_limit)
        ).all()

        leads = session.exec(
            select(Lead)
            .where(
                Lead.tenant_id == ctx.tenant_id,
                or_(
                    func.lower(col(Lead.full_name)).contains(term),
                    func.lower(func.coalesce(col(Lead.email), "")).contains(term),
                    func.lower(func.coalesce(col(Lead.company_name), "")).contains(term),
                ),
            )
            .limit(safe_limit)
        ).all()

        opportunities = session.exec(
            select(Opportunity)
            .where(
                Opportunity.tenant_id == ctx.tenant_id,
                or_(
                    func.lower(col(Opportunity.title)).contains(term),
                    func.lower(col(Opportunity.stage)).contains(term),
                ),
            )
            .limit(safe_limit)
        ).all()

        tasks = session.exec(
            select(Task)
            .where(
                Task.tenant_id == ctx.tenant_id,
                or_(
                    func.lower(col(Task.title)).contains(term),
                    func.lower(func.coalesce(col(Task.description), "")).contains(term),
                ),
            )
            .limit(safe_limit)
        ).all()

        return {
            "query": query,
            "organizations": [
                {
                    "id": o.id,
                    "name": o.name,
                    "cif": o.cif,
                    "razon_social": o.razon_social,
                    "sector": o.sector,
                }
                for o in orgs
            ],
            "clients": [
                {
                    "id": c.id,
                    "organization_id": c.organization_id,
                    "full_name": c.full_name,
                    "email": c.email,
                    "job_title": c.job_title,
                    "rgpd_consent": c.rgpd_consent,
                }
                for c in clients
            ],
            "leads": [
                {
                    "id": l.id,
                    "full_name": l.full_name,
                    "email": l.email,
                    "company_name": l.company_name,
                    "status": l.status,
                }
                for l in leads
            ],
            "opportunities": [
                {
                    "id": op.id,
                    "organization_id": op.organization_id,
                    "title": op.title,
                    "amount_eur": op.amount_eur,
                    "currency": op.currency,
                    "stage": op.stage,
                    "probability": op.probability,
                }
                for op in opportunities
            ],
            "tasks": [
                {
                    "id": t.id,
                    "title": t.title,
                    "status": t.status,
                    "priority": t.priority,
                    "organization_id": t.organization_id,
                    "opportunity_id": t.opportunity_id,
                }
                for t in tasks
            ],
        }


@mcp.tool()
def cuenta_360(organization_id: int) -> dict[str, Any]:
    """Devuelve la vista 360 de una organización del tenant: datos fiscales (CIF, razón social,
    dirección fiscal), contactos, oportunidades en EUR, tareas pendientes y últimos logs de actividad.

    Requiere scope: `crm:read`.
    """
    ctx = require_mcp_scope("crm:read")

    with open_mcp_db_session(app=ctx.app) as session:
        org = session.exec(
            select(Organization).where(
                Organization.id == organization_id,
                Organization.tenant_id == ctx.tenant_id,
            )
        ).first()
        if org is None:
            raise LookupError(f"Organización {organization_id} no encontrada en el tenant.")

        clients = session.exec(
            select(Client)
            .where(
                Client.tenant_id == ctx.tenant_id,
                Client.organization_id == organization_id,
            )
            .order_by(col(Client.id).asc())
        ).all()

        opportunities = session.exec(
            select(Opportunity)
            .where(
                Opportunity.tenant_id == ctx.tenant_id,
                Opportunity.organization_id == organization_id,
            )
            .order_by(col(Opportunity.id).desc())
        ).all()

        pending_tasks = session.exec(
            select(Task)
            .where(
                Task.tenant_id == ctx.tenant_id,
                Task.organization_id == organization_id,
                col(Task.status).notin_(["completed", "cancelled"]),
            )
            .order_by(col(Task.id).desc())
        ).all()

        client_ids = [c.id for c in clients if c.id is not None]
        opp_ids = [op.id for op in opportunities if op.id is not None]
        task_ids = [t.id for t in pending_tasks if t.id is not None]

        activity_filters = [
            (col(ActivityLog.entity_type) == "organization") & (col(ActivityLog.entity_id) == organization_id)
        ]
        if client_ids:
            activity_filters.append(
                (col(ActivityLog.entity_type) == "client") & col(ActivityLog.entity_id).in_(client_ids)
            )
        if opp_ids:
            activity_filters.append(
                (col(ActivityLog.entity_type) == "opportunity") & col(ActivityLog.entity_id).in_(opp_ids)
            )
        if task_ids:
            activity_filters.append(
                (col(ActivityLog.entity_type) == "task") & col(ActivityLog.entity_id).in_(task_ids)
            )

        activities = session.exec(
            select(ActivityLog)
            .where(ActivityLog.tenant_id == ctx.tenant_id, or_(*activity_filters))
            .order_by(col(ActivityLog.id).desc())
            .limit(20)
        ).all()

        pipeline_total_eur = round(
            sum(op.amount_eur for op in opportunities if op.stage != "closed_lost"),
            2,
        )

        return {
            "organization": {
                "id": org.id,
                "name": org.name,
                "cif": org.cif,
                "razon_social": org.razon_social,
                "direccion_fiscal": org.direccion_fiscal,
                "sector": org.sector,
                "website": org.website,
                "phone": org.phone,
                "email": org.email,
                "notes": org.notes,
            },
            "clients": [
                {
                    "id": c.id,
                    "full_name": c.full_name,
                    "email": c.email,
                    "phone": c.phone,
                    "job_title": c.job_title,
                    "rgpd_consent": c.rgpd_consent,
                }
                for c in clients
            ],
            "opportunities": [
                {
                    "id": op.id,
                    "title": op.title,
                    "amount_eur": op.amount_eur,
                    "currency": op.currency,
                    "stage": op.stage,
                    "probability": op.probability,
                }
                for op in opportunities
            ],
            "pipeline_total_eur": pipeline_total_eur,
            "pending_tasks": [
                {
                    "id": t.id,
                    "title": t.title,
                    "status": t.status,
                    "priority": t.priority,
                    "due_date": t.due_date.isoformat() if t.due_date else None,
                }
                for t in pending_tasks
            ],
            "recent_activities": [
                {
                    "id": act.id,
                    "actor_type": act.actor_type,
                    "actor_name": act.actor_name,
                    "model_used": act.model_used,
                    "action": act.action,
                    "entity_type": act.entity_type,
                    "entity_id": act.entity_id,
                    "details_json": act.details_json,
                    "created_at": act.created_at.isoformat(),
                }
                for act in activities
            ],
        }


@mcp.tool()
def listar_pendientes(limit: int = 20) -> dict[str, Any]:
    """Lista las tareas abiertas y las acciones de agente pendientes de aprobación (HITL) del tenant.

    Requiere scope: `crm:read`.
    """
    ctx = require_mcp_scope("crm:read")
    safe_limit = max(1, min(limit, 100))

    with open_mcp_db_session(app=ctx.app) as session:
        open_tasks = session.exec(
            select(Task)
            .where(
                Task.tenant_id == ctx.tenant_id,
                col(Task.status).notin_(["completed", "cancelled"]),
            )
            .order_by(col(Task.id).desc())
            .limit(safe_limit)
        ).all()

        pending_actions = session.exec(
            select(AgentAction)
            .where(
                AgentAction.tenant_id == ctx.tenant_id,
                AgentAction.status == AgentActionStatus.PENDING_APPROVAL.value,
            )
            .order_by(col(AgentAction.id).desc())
            .limit(safe_limit)
        ).all()

        return {
            "open_tasks": [
                {
                    "id": t.id,
                    "title": t.title,
                    "status": t.status,
                    "priority": t.priority,
                    "organization_id": t.organization_id,
                    "opportunity_id": t.opportunity_id,
                    "due_date": t.due_date.isoformat() if t.due_date else None,
                }
                for t in open_tasks
            ],
            "pending_agent_actions": [
                {
                    "id": a.id,
                    "agent_name": a.agent_name,
                    "model_used": a.model_used,
                    "action_type": a.action_type,
                    "target_entity_type": a.target_entity_type,
                    "target_entity_id": a.target_entity_id,
                    "status": a.status,
                    "created_at": a.created_at.isoformat(),
                }
                for a in pending_actions
            ],
        }


@mcp.tool()
def crear_o_actualizar_lead(
    full_name: str,
    email: Optional[str] = None,
    phone: Optional[str] = None,
    company_name: Optional[str] = None,
    source: Optional[str] = None,
    status: str = "new",
    score: Optional[int] = None,
    notes: Optional[str] = None,
    organization_id: Optional[int] = None,
    lead_id: Optional[int] = None,
    model_used: Optional[str] = None,
) -> dict[str, Any]:
    """Crea o actualiza un Lead en el tenant actual y registra trazabilidad en ActivityLog (`actor_type="agent"`).

    Requiere scope: `crm:write`.
    """
    ctx = require_mcp_scope("crm:write")
    cleaned_name = full_name.strip()
    if not cleaned_name:
        raise ValueError("El nombre del lead ('full_name') no puede estar vacío.")
    if score is not None and (score < 0 or score > 100):
        raise ValueError("El campo 'score' debe estar entre 0 y 100.")

    with open_mcp_db_session(app=ctx.app) as session:
        if organization_id is not None:
            org = session.exec(
                select(Organization).where(
                    Organization.id == organization_id,
                    Organization.tenant_id == ctx.tenant_id,
                )
            ).first()
            if org is None:
                raise LookupError(f"Organización {organization_id} no encontrada en el tenant.")

        normalized_email = email.strip().lower() if email and email.strip() else None
        existing: Optional[Lead] = None

        if lead_id is not None:
            existing = session.exec(
                select(Lead).where(
                    Lead.id == lead_id,
                    Lead.tenant_id == ctx.tenant_id,
                )
            ).first()
            if existing is None:
                raise LookupError(f"Lead {lead_id} no encontrado en el tenant.")
        elif normalized_email is not None:
            existing = session.exec(
                select(Lead).where(
                    Lead.tenant_id == ctx.tenant_id,
                    func.lower(col(Lead.email)) == normalized_email,
                )
            ).first()

        if existing is not None:
            existing.full_name = cleaned_name
            if normalized_email is not None:
                existing.email = normalized_email
            if phone is not None:
                existing.phone = phone
            if company_name is not None:
                existing.company_name = company_name
            if source is not None:
                existing.source = source
            if status:
                existing.status = status
            if score is not None:
                existing.score = score
            if notes is not None:
                existing.notes = notes
            if organization_id is not None:
                existing.organization_id = organization_id
            existing.updated_at = utc_now()
            lead = existing
            operation = "updated"
            action_name = "update"
        else:
            lead = Lead(
                tenant_id=ctx.tenant_id,
                organization_id=organization_id,
                full_name=cleaned_name,
                email=normalized_email,
                phone=phone,
                company_name=company_name,
                source=source or f"mcp:{ctx.agent_name}",
                status=status,
                score=score,
                notes=notes,
            )
            operation = "created"
            action_name = "create"

        session.add(lead)
        session.flush()

        log = ActivityLog(
            tenant_id=ctx.tenant_id,
            actor_type=ActorType.AGENT.value,
            actor_name=ctx.agent_name,
            user_id=None,
            model_used=model_used,
            action=action_name,
            entity_type="lead",
            entity_id=lead.id,
            details_json=json.dumps(
                {
                    "operation": operation,
                    "full_name": lead.full_name,
                    "email": lead.email,
                    "status": lead.status,
                },
                ensure_ascii=False,
            ),
        )
        session.add(log)
        session.commit()
        session.refresh(lead)

        return {
            "operation": operation,
            "lead": {
                "id": lead.id,
                "tenant_id": lead.tenant_id,
                "organization_id": lead.organization_id,
                "full_name": lead.full_name,
                "email": lead.email,
                "phone": lead.phone,
                "company_name": lead.company_name,
                "source": lead.source,
                "status": lead.status,
                "score": lead.score,
                "notes": lead.notes,
            },
        }


@mcp.tool()
def registrar_interaccion(
    channel: str,
    entity_type: Literal["organization", "client", "lead", "opportunity", "task"],
    entity_id: int,
    summary: str,
    outcome: Optional[str] = None,
    model_used: Optional[str] = None,
) -> dict[str, Any]:
    """Registra una interacción comercial (llamada, reunión, email o whatsapp) en ActivityLog.

    Verifica estrictamente que la entidad pertenezca al tenant actual.
    Requiere scope: `crm:write`.
    """
    ctx = require_mcp_scope("crm:write")
    normalized_channel = _normalize_channel(channel)
    cleaned_summary = summary.strip()
    if not cleaned_summary:
        raise ValueError("El campo 'summary' no puede estar vacío.")

    model_cls = _ENTITY_MODELS.get(entity_type)
    if model_cls is None:
        raise ValueError(f"Tipo de entidad '{entity_type}' no soportado.")

    with open_mcp_db_session(app=ctx.app) as session:
        entity = session.exec(
            select(model_cls).where(model_cls.id == entity_id, model_cls.tenant_id == ctx.tenant_id)
        ).first()
        if entity is None:
            raise LookupError(f"Entidad {entity_type}:{entity_id} no encontrada en el tenant.")

        details = {
            "channel": normalized_channel,
            "summary": cleaned_summary,
            "outcome": outcome,
        }
        log = ActivityLog(
            tenant_id=ctx.tenant_id,
            actor_type=ActorType.AGENT.value,
            actor_name=ctx.agent_name,
            user_id=None,
            model_used=model_used,
            action=f"interaction:{normalized_channel}",
            entity_type=entity_type,
            entity_id=entity_id,
            details_json=json.dumps(details, ensure_ascii=False),
        )
        session.add(log)
        session.commit()
        session.refresh(log)

        return {
            "id": log.id,
            "tenant_id": log.tenant_id,
            "actor_type": log.actor_type,
            "actor_name": log.actor_name,
            "model_used": log.model_used,
            "action": log.action,
            "entity_type": log.entity_type,
            "entity_id": log.entity_id,
            "details": details,
            "created_at": log.created_at.isoformat(),
        }


@mcp.tool()
def proponer_accion(
    action_type: str,
    target_entity_type: str,
    payload: dict[str, Any],
    target_entity_id: Optional[int] = None,
    model_used: Optional[str] = None,
) -> dict[str, Any]:
    """Propone una AgentAction en estado `pending_approval` para revisión humana (Human-in-the-Loop).

    Ejemplos de `action_type`: `create_task`, `create_lead`, `update_opportunity`.
    Requiere scope: `actions:propose`.
    """
    ctx = require_mcp_scope("actions:propose")
    cleaned_action = action_type.strip()
    cleaned_entity_type = target_entity_type.strip()
    if not cleaned_action or not cleaned_entity_type:
        raise ValueError("'action_type' y 'target_entity_type' son obligatorios.")

    with open_mcp_db_session(app=ctx.app) as session:
        if target_entity_id is not None and cleaned_entity_type in _ENTITY_MODELS:
            model_cls = _ENTITY_MODELS[cleaned_entity_type]
            target = session.exec(
                select(model_cls.id).where(
                    model_cls.id == target_entity_id,
                    model_cls.tenant_id == ctx.tenant_id,
                )
            ).first()
            if target is None:
                raise LookupError(
                    f"La entidad objetivo {cleaned_entity_type}:{target_entity_id} no pertenece al tenant."
                )

        payload_str = json.dumps(payload or {}, ensure_ascii=False)
        action = AgentAction(
            tenant_id=ctx.tenant_id,
            agent_name=ctx.agent_name,
            model_used=model_used,
            action_type=cleaned_action,
            target_entity_type=cleaned_entity_type,
            target_entity_id=target_entity_id,
            payload_json=payload_str,
            status=AgentActionStatus.PENDING_APPROVAL.value,
        )
        session.add(action)
        session.flush()

        log = ActivityLog(
            tenant_id=ctx.tenant_id,
            actor_type=ActorType.AGENT.value,
            actor_name=ctx.agent_name,
            user_id=None,
            model_used=model_used,
            action=f"propose:{cleaned_action}",
            entity_type="agent_action",
            entity_id=action.id,
            details_json=payload_str,
        )
        session.add(log)
        session.commit()
        session.refresh(action)

        return {
            "id": action.id,
            "tenant_id": action.tenant_id,
            "agent_name": action.agent_name,
            "model_used": action.model_used,
            "action_type": action.action_type,
            "target_entity_type": action.target_entity_type,
            "target_entity_id": action.target_entity_id,
            "status": action.status,
            "created_at": action.created_at.isoformat(),
        }
