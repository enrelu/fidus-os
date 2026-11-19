"""Servicios CRM compartidos (lectura multi-tenant estricta y trazabilidad de interacciones)."""

from __future__ import annotations

import json
from typing import Any, Optional

from sqlalchemy import func, or_
from sqlmodel import Session, col, select

from core.models import (
    ActivityLog,
    AgentAction,
    AgentActionStatus,
    Client,
    Lead,
    Opportunity,
    Organization,
    Task,
)

ENTITY_MODELS: dict[str, Any] = {
    "organization": Organization,
    "client": Client,
    "lead": Lead,
    "opportunity": Opportunity,
    "task": Task,
}

_PRIORITY_RANK = {
    "urgent": 0,
    "high": 1,
    "medium": 2,
    "low": 3,
}


def normalize_interaction_channel(channel: str) -> str:
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


def _task_sort_key(task: Task) -> tuple[int, int, str, int]:
    rank = _PRIORITY_RANK.get((task.priority or "").strip().lower(), 4)
    has_due = 0 if task.due_date is not None else 1
    due_str = task.due_date.isoformat() if task.due_date is not None else "9999-12-31T23:59:59"
    return (rank, has_due, due_str, -(task.id or 0))


def search_crm_for_tenant(
    session: Session,
    tenant_id: int,
    query: str,
    *,
    limit: int = 10,
) -> dict[str, Any]:
    """Busca organizaciones, clientes, leads, oportunidades (EUR) y tareas del tenant."""
    term = query.strip().lower()
    if not term:
        raise ValueError("El parámetro 'query' no puede estar vacío.")
    safe_limit = max(1, min(int(limit), 50))

    orgs = session.exec(
        select(Organization)
        .where(
            Organization.tenant_id == tenant_id,
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
            Client.tenant_id == tenant_id,
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
            Lead.tenant_id == tenant_id,
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
            Opportunity.tenant_id == tenant_id,
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
            Task.tenant_id == tenant_id,
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
                "phone": l.phone,
                "company_name": l.company_name,
                "status": l.status,
                "score": l.score,
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
                "due_date": t.due_date.isoformat() if t.due_date else None,
            }
            for t in tasks
        ],
    }


def get_account_360_for_tenant(
    session: Session,
    tenant_id: int,
    organization_id: int,
) -> dict[str, Any]:
    """Devuelve la ficha 360 de una organización perteneciente al tenant."""
    org = session.exec(
        select(Organization).where(
            Organization.id == organization_id,
            Organization.tenant_id == tenant_id,
        )
    ).first()
    if org is None:
        raise LookupError(f"Organización {organization_id} no encontrada en el tenant.")

    clients = session.exec(
        select(Client)
        .where(
            Client.tenant_id == tenant_id,
            Client.organization_id == organization_id,
        )
        .order_by(col(Client.id).asc())
    ).all()

    opportunities = session.exec(
        select(Opportunity)
        .where(
            Opportunity.tenant_id == tenant_id,
            Opportunity.organization_id == organization_id,
        )
        .order_by(col(Opportunity.id).desc())
    ).all()

    pending_tasks = session.exec(
        select(Task)
        .where(
            Task.tenant_id == tenant_id,
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
        .where(ActivityLog.tenant_id == tenant_id, or_(*activity_filters))
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


def list_pending_for_tenant(
    session: Session,
    tenant_id: int,
    *,
    limit: int = 20,
) -> dict[str, Any]:
    """Lista tareas abiertas (prioridad/vencimiento) y acciones HITL pendientes del tenant."""
    safe_limit = max(1, min(int(limit), 100))

    all_open_tasks = session.exec(
        select(Task).where(
            Task.tenant_id == tenant_id,
            col(Task.status).notin_(["completed", "cancelled"]),
        )
    ).all()
    sorted_tasks = sorted(all_open_tasks, key=_task_sort_key)[:safe_limit]

    pending_actions = session.exec(
        select(AgentAction)
        .where(
            AgentAction.tenant_id == tenant_id,
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
                "description": t.description,
                "status": t.status,
                "priority": t.priority,
                "organization_id": t.organization_id,
                "opportunity_id": t.opportunity_id,
                "due_date": t.due_date.isoformat() if t.due_date else None,
            }
            for t in sorted_tasks
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


def get_crm_summary_for_tenant(
    session: Session,
    tenant_id: int,
    *,
    limit: int = 15,
) -> dict[str, Any]:
    """Devuelve un resumen operativo completo del tenant: tareas urgentes, oportunidades EUR, leads e HITL."""
    safe_limit = max(1, min(int(limit), 50))

    all_open_tasks = session.exec(
        select(Task).where(
            Task.tenant_id == tenant_id,
            col(Task.status).notin_(["completed", "cancelled"]),
        )
    ).all()
    sorted_tasks = sorted(all_open_tasks, key=_task_sort_key)[:safe_limit]

    open_opps = session.exec(
        select(Opportunity)
        .where(
            Opportunity.tenant_id == tenant_id,
            col(Opportunity.stage).notin_(["closed_won", "closed_lost"]),
        )
        .order_by(col(Opportunity.amount_eur).desc(), col(Opportunity.id).desc())
        .limit(safe_limit)
    ).all()

    all_open_opps_amounts = session.exec(
        select(Opportunity.amount_eur).where(
            Opportunity.tenant_id == tenant_id,
            col(Opportunity.stage).notin_(["closed_won", "closed_lost"]),
        )
    ).all()

    recent_leads = session.exec(
        select(Lead)
        .where(Lead.tenant_id == tenant_id)
        .order_by(col(Lead.id).desc())
        .limit(safe_limit)
    ).all()

    pending_actions = session.exec(
        select(AgentAction)
        .where(
            AgentAction.tenant_id == tenant_id,
            AgentAction.status == AgentActionStatus.PENDING_APPROVAL.value,
        )
        .order_by(col(AgentAction.id).desc())
        .limit(safe_limit)
    ).all()

    total_pending_actions = session.exec(
        select(func.count())
        .select_from(AgentAction)
        .where(
            AgentAction.tenant_id == tenant_id,
            AgentAction.status == AgentActionStatus.PENDING_APPROVAL.value,
        )
    ).one()

    orgs = session.exec(
        select(Organization)
        .where(Organization.tenant_id == tenant_id)
        .order_by(col(Organization.id).desc())
        .limit(safe_limit)
    ).all()
    org_name_by_id = {o.id: o.name for o in orgs if o.id is not None}

    return {
        "counts": {
            "open_tasks_total": len(all_open_tasks),
            "open_opportunities_total": len(all_open_opps_amounts),
            "open_pipeline_eur": round(sum(float(a) for a in all_open_opps_amounts), 2),
            "pending_hitl_actions_total": int(total_pending_actions),
        },
        "open_tasks": [
            {
                "id": t.id,
                "title": t.title,
                "description": t.description,
                "status": t.status,
                "priority": t.priority,
                "organization_id": t.organization_id,
                "opportunity_id": t.opportunity_id,
                "due_date": t.due_date.isoformat() if t.due_date else None,
            }
            for t in sorted_tasks
        ],
        "open_opportunities": [
            {
                "id": op.id,
                "title": op.title,
                "organization_id": op.organization_id,
                "organization_name": org_name_by_id.get(op.organization_id) if op.organization_id else None,
                "amount_eur": op.amount_eur,
                "currency": op.currency,
                "stage": op.stage,
                "probability": op.probability,
            }
            for op in open_opps
        ],
        "recent_leads": [
            {
                "id": l.id,
                "full_name": l.full_name,
                "company_name": l.company_name,
                "email": l.email,
                "phone": l.phone,
                "status": l.status,
                "score": l.score,
                "organization_id": l.organization_id,
            }
            for l in recent_leads
        ],
        "pending_hitl_actions": [
            {
                "id": a.id,
                "agent_name": a.agent_name,
                "action_type": a.action_type,
                "target_entity_type": a.target_entity_type,
                "target_entity_id": a.target_entity_id,
                "payload": json.loads(a.payload_json or "{}"),
                "created_at": a.created_at.isoformat(),
            }
            for a in pending_actions
        ],
        "organizations": [
            {
                "id": o.id,
                "name": o.name,
                "cif": o.cif,
            }
            for o in orgs
        ],
    }


def log_interaction_for_tenant(
    session: Session,
    tenant_id: int,
    *,
    actor_type: str,
    actor_name: str,
    channel: str,
    entity_type: str,
    entity_id: int,
    summary: str,
    outcome: Optional[str] = None,
    user_id: Optional[int] = None,
    model_used: Optional[str] = None,
    commit: bool = True,
) -> dict[str, Any]:
    """Registra una interacción comercial en ActivityLog validando estrictamente el tenant."""
    normalized_channel = normalize_interaction_channel(channel)
    cleaned_summary = summary.strip()
    if not cleaned_summary:
        raise ValueError("El campo 'summary' no puede estar vacío.")

    model_cls = ENTITY_MODELS.get(entity_type)
    if model_cls is None:
        raise ValueError(f"Tipo de entidad '{entity_type}' no soportado.")

    entity = session.exec(
        select(model_cls).where(model_cls.id == entity_id, model_cls.tenant_id == tenant_id)
    ).first()
    if entity is None:
        raise LookupError(f"Entidad {entity_type}:{entity_id} no encontrada en el tenant.")

    details = {
        "channel": normalized_channel,
        "summary": cleaned_summary,
        "outcome": outcome,
    }
    log = ActivityLog(
        tenant_id=tenant_id,
        actor_type=actor_type,
        actor_name=actor_name,
        user_id=user_id,
        model_used=model_used,
        action=f"interaction:{normalized_channel}",
        entity_type=entity_type,
        entity_id=entity_id,
        details_json=json.dumps(details, ensure_ascii=False),
    )
    session.add(log)
    if commit:
        session.commit()
        session.refresh(log)
    else:
        session.flush()

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
