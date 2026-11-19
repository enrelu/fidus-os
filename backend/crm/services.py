"""Servicios CRM compartidos (lectura multi-tenant estricta y trazabilidad de interacciones)."""

from __future__ import annotations

import json
from datetime import datetime, timedelta
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
    utc_now,
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


# ---------------------------------------------------------------------------
# Fase 1: Prioridades de Hoy, Analítica del Panel y Conversión de Leads
# ---------------------------------------------------------------------------

_CLOSED_LEAD_STATUSES = {"converted", "unqualified", "disqualified", "lost"}
_CLOSED_OPP_STAGES = {"closed_won", "closed_lost"}


def _latest_activity_map(
    session: Session,
    tenant_id: int,
    entity_type: str,
) -> dict[int, datetime]:
    logs = session.exec(
        select(ActivityLog)
        .where(
            ActivityLog.tenant_id == tenant_id,
            ActivityLog.entity_type == entity_type,
            ActivityLog.entity_id.is_not(None),  # type: ignore[union-attr]
        )
        .order_by(col(ActivityLog.created_at).desc(), col(ActivityLog.id).desc())
    ).all()
    latest: dict[int, datetime] = {}
    for row in logs:
        if row.entity_id is not None and row.entity_id not in latest:
            latest[row.entity_id] = row.created_at
    return latest


def get_today_priorities_for_tenant(
    session: Session,
    tenant_id: int,
    *,
    stale_days: int = 7,
) -> dict[str, Any]:
    """Genera la cola de impacto de Hoy y el panel de atención comercial del tenant."""
    now = utc_now()
    stale_cutoff = now - timedelta(days=max(1, stale_days))
    client_followup_cutoff = now - timedelta(days=14)

    orgs = session.exec(select(Organization).where(Organization.tenant_id == tenant_id)).all()
    org_name_by_id = {o.id: o.name for o in orgs if o.id is not None}

    opps = session.exec(select(Opportunity).where(Opportunity.tenant_id == tenant_id)).all()
    opp_by_id = {op.id: op for op in opps if op.id is not None}

    open_tasks = session.exec(
        select(Task).where(
            Task.tenant_id == tenant_id,
            col(Task.status).notin_(["completed", "cancelled"]),
        )
    ).all()

    opp_ids_with_open_task = {
        t.opportunity_id for t in open_tasks if t.opportunity_id is not None
    }

    lead_activity = _latest_activity_map(session, tenant_id, "lead")
    opp_activity = _latest_activity_map(session, tenant_id, "opportunity")
    client_activity = _latest_activity_map(session, tenant_id, "client")

    items: list[dict[str, Any]] = []
    overdue_tasks_count = 0

    # 1. Tareas vencidas o abiertas ordenadas por vencimiento y prioridad
    priority_base = {"urgent": 95, "high": 82, "medium": 65, "low": 45}
    for task in open_tasks:
        prio = (task.priority or "medium").strip().lower()
        is_overdue = bool(task.due_date is not None and task.due_date < now)
        if is_overdue:
            overdue_tasks_count += 1
        impact = priority_base.get(prio, 60) + (25 if is_overdue else 0)
        org_name = org_name_by_id.get(task.organization_id) if task.organization_id else None
        opp_obj = opp_by_id.get(task.opportunity_id) if task.opportunity_id else None

        reason_parts = []
        if is_overdue and task.due_date is not None:
            days_late = max(1, (now - task.due_date).days)
            reason_parts.append(f"Vencida hace {days_late} día(s)")
        elif task.due_date is not None:
            reason_parts.append(f"Vence el {task.due_date.strftime('%d/%m/%Y')}")
        else:
            reason_parts.append("Tarea abierta")
        if org_name:
            reason_parts.append(org_name)

        items.append(
            {
                "id": f"task-{task.id}",
                "kind": "task",
                "entity_type": "task",
                "entity_id": task.id,
                "title": task.title,
                "reason": " · ".join(reason_parts),
                "priority": prio if prio in _PRIORITY_RANK else "medium",
                "impact_score": impact,
                "status": task.status,
                "due_date": task.due_date.isoformat() if task.due_date else None,
                "is_overdue": is_overdue,
                "amount_eur": opp_obj.amount_eur if opp_obj else None,
                "organization_id": task.organization_id,
                "organization_name": org_name,
                "opportunity_id": task.opportunity_id,
                "opportunity_title": opp_obj.title if opp_obj else None,
                "score": None,
            }
        )

    # 2. Leads abiertos sin actividad reciente (>=7 días) o con score alto en seguimiento
    all_leads = session.exec(select(Lead).where(Lead.tenant_id == tenant_id)).all()
    stale_leads: list[dict[str, Any]] = []
    for lead in all_leads:
        status_norm = (lead.status or "new").strip().lower()
        if status_norm in _CLOSED_LEAD_STATUSES:
            continue
        last_act = lead_activity.get(lead.id) if lead.id is not None else None
        ref_dt = last_act or lead.updated_at or lead.created_at
        is_stale = ref_dt < stale_cutoff
        days_idle = max(0, (now - ref_dt).days)

        if is_stale:
            stale_leads.append(
                {
                    "id": lead.id,
                    "full_name": lead.full_name,
                    "company_name": lead.company_name,
                    "status": lead.status,
                    "score": lead.score,
                    "days_without_activity": days_idle,
                    "last_activity_at": ref_dt.isoformat(),
                }
            )

        if is_stale or (lead.score is not None and lead.score >= 70) or status_norm == "new":
            lead_impact = 72 if is_stale else (68 if (lead.score or 0) >= 70 else 55)
            if lead.score is not None and lead.score >= 80:
                lead_impact += 8
            lead_prio = "high" if lead_impact >= 78 else ("medium" if lead_impact >= 60 else "low")
            reason = (
                f"Lead sin actividad hace {days_idle} día(s)"
                if is_stale
                else (
                    f"Lead cualificado (Score {lead.score}/100)"
                    if lead.score is not None
                    else "Nuevo lead pendiente de primer contacto"
                )
            )
            if lead.company_name:
                reason = f"{reason} · {lead.company_name}"
            items.append(
                {
                    "id": f"lead-{lead.id}",
                    "kind": "lead_followup",
                    "entity_type": "lead",
                    "entity_id": lead.id,
                    "title": lead.full_name,
                    "reason": reason,
                    "priority": lead_prio,
                    "impact_score": lead_impact,
                    "status": lead.status,
                    "due_date": None,
                    "is_overdue": is_stale,
                    "amount_eur": None,
                    "organization_id": lead.organization_id,
                    "organization_name": lead.company_name,
                    "opportunity_id": None,
                    "opportunity_title": None,
                    "score": lead.score,
                }
            )

    # 3. Oportunidades paradas o sin tarea abierta
    stale_opportunities: list[dict[str, Any]] = []
    for opp in opps:
        stage_norm = (opp.stage or "").strip().lower()
        if stage_norm in _CLOSED_OPP_STAGES:
            continue
        last_act = opp_activity.get(opp.id) if opp.id is not None else None
        ref_dt = last_act or opp.updated_at or opp.created_at
        is_stale = ref_dt < stale_cutoff
        has_open_task = opp.id in opp_ids_with_open_task
        days_idle = max(0, (now - ref_dt).days)
        org_name = org_name_by_id.get(opp.organization_id) if opp.organization_id else None

        if is_stale or not has_open_task:
            reason_bits = []
            if is_stale:
                reason_bits.append(f"Parada {days_idle} día(s) sin actividad")
            if not has_open_task:
                reason_bits.append("Sin tarea abierta")
            if org_name:
                reason_bits.append(org_name)

            opp_entry = {
                "id": opp.id,
                "title": opp.title,
                "organization_id": opp.organization_id,
                "organization_name": org_name,
                "amount_eur": opp.amount_eur,
                "stage": opp.stage,
                "probability": opp.probability,
                "days_without_activity": days_idle,
                "has_open_task": has_open_task,
            }
            stale_opportunities.append(opp_entry)

            opp_impact = 78 if (is_stale and opp.amount_eur >= 10000) else (70 if is_stale else 62)
            opp_prio = "high" if opp_impact >= 74 else "medium"
            items.append(
                {
                    "id": f"opportunity-{opp.id}",
                    "kind": "opportunity_stalled",
                    "entity_type": "opportunity",
                    "entity_id": opp.id,
                    "title": opp.title,
                    "reason": " · ".join(reason_bits),
                    "priority": opp_prio,
                    "impact_score": opp_impact,
                    "status": opp.stage,
                    "due_date": opp.expected_close_date.isoformat() if opp.expected_close_date else None,
                    "is_overdue": is_stale,
                    "amount_eur": opp.amount_eur,
                    "organization_id": opp.organization_id,
                    "organization_name": org_name,
                    "opportunity_id": opp.id,
                    "opportunity_title": opp.title,
                    "score": None,
                }
            )

    # 4. Clientes pendientes de seguimiento (>= 14 días sin actividad)
    clients = session.exec(select(Client).where(Client.tenant_id == tenant_id)).all()
    clients_pending_count = 0
    for cli in clients:
        last_act = client_activity.get(cli.id) if cli.id is not None else None
        ref_dt = last_act or cli.updated_at or cli.created_at
        if ref_dt < client_followup_cutoff or last_act is None:
            clients_pending_count += 1
            if clients_pending_count <= 5:
                days_idle = max(0, (now - ref_dt).days)
                org_name = org_name_by_id.get(cli.organization_id) if cli.organization_id else None
                reason = (
                    f"Cliente sin interacción hace {days_idle} día(s)"
                    if last_act is not None
                    else "Cliente pendiente de primera interacción registrada"
                )
                if org_name:
                    reason = f"{reason} · {org_name}"
                items.append(
                    {
                        "id": f"client-{cli.id}",
                        "kind": "client_followup",
                        "entity_type": "client",
                        "entity_id": cli.id,
                        "title": cli.full_name,
                        "reason": reason,
                        "priority": "low",
                        "impact_score": 48,
                        "status": "active",
                        "due_date": None,
                        "is_overdue": False,
                        "amount_eur": None,
                        "organization_id": cli.organization_id,
                        "organization_name": org_name,
                        "opportunity_id": None,
                        "opportunity_title": None,
                        "score": None,
                    }
                )

    items.sort(key=lambda it: (-int(it["impact_score"]), str(it["title"])))

    pending_hitl_count = session.exec(
        select(func.count())
        .select_from(AgentAction)
        .where(
            AgentAction.tenant_id == tenant_id,
            AgentAction.status == AgentActionStatus.PENDING_APPROVAL.value,
        )
    ).one()

    return {
        "generated_at": now.isoformat(),
        "items": items,
        "attention": {
            "stale_leads": stale_leads[:20],
            "stale_opportunities": stale_opportunities[:20],
        },
        "summary": {
            "overdue_tasks_count": overdue_tasks_count,
            "open_tasks_count": len(open_tasks),
            "stale_leads_count": len(stale_leads),
            "stalled_opportunities_count": len(stale_opportunities),
            "clients_pending_count": clients_pending_count,
            "total_action_items": len(items),
            "pending_hitl_count": int(pending_hitl_count),
        },
    }


def _in_period(dt: datetime, year: Optional[int], quarter: Optional[int]) -> bool:
    if year is not None and dt.year != year:
        return False
    if quarter is not None:
        dt_quarter = ((dt.month - 1) // 3) + 1
        if dt_quarter != quarter:
            return False
    return True


def get_dashboard_analytics_for_tenant(
    session: Session,
    tenant_id: int,
    *,
    year: Optional[int] = None,
    quarter: Optional[int] = None,
) -> dict[str, Any]:
    """Calcula KPIs, embudo de leads, pipeline EUR, previsión trimestral y concentración."""
    now = utc_now()
    active_year = year or now.year

    all_leads = session.exec(select(Lead).where(Lead.tenant_id == tenant_id)).all()
    all_clients = session.exec(select(Client).where(Client.tenant_id == tenant_id)).all()
    all_opps = session.exec(select(Opportunity).where(Opportunity.tenant_id == tenant_id)).all()
    all_orgs = session.exec(select(Organization).where(Organization.tenant_id == tenant_id)).all()
    all_activities = session.exec(
        select(ActivityLog).where(ActivityLog.tenant_id == tenant_id)
    ).all()

    org_by_id = {o.id: o for o in all_orgs if o.id is not None}

    years_set = {now.year}
    for lead in all_leads:
        years_set.add(lead.created_at.year)
    for cli in all_clients:
        years_set.add(cli.created_at.year)
    for opp in all_opps:
        ref_dt = opp.expected_close_date or opp.created_at
        years_set.add(ref_dt.year)
        years_set.add(opp.created_at.year)
    available_years = sorted(years_set, reverse=True)

    # Filtrado por año/trimestre si se especifican
    leads = [l for l in all_leads if _in_period(l.created_at, year, quarter)]
    clients = [c for c in all_clients if _in_period(c.created_at, year, quarter)]
    opps = [
        op
        for op in all_opps
        if _in_period(op.expected_close_date or op.created_at, year, quarter)
    ]

    # 1. KPIs
    total_leads = len(leads)
    total_clients = len(clients)
    converted_leads = sum(
        1 for l in leads if (l.status or "").strip().lower() == "converted"
    )
    conversion_rate = round((converted_leads / total_leads) * 100.0, 1) if total_leads > 0 else 0.0

    open_opps = [
        op for op in opps if (op.stage or "").strip().lower() not in _CLOSED_OPP_STAGES
    ]
    won_opps = [op for op in opps if (op.stage or "").strip().lower() == "closed_won"]
    lost_opps = [op for op in opps if (op.stage or "").strip().lower() == "closed_lost"]

    pipeline_value = round(sum(float(op.amount_eur) for op in open_opps), 2)
    weighted_pipeline = round(
        sum(float(op.amount_eur) * (float(op.probability) / 100.0) for op in open_opps),
        2,
    )
    won_value = round(sum(float(op.amount_eur) for op in won_opps), 2)
    decided_count = len(won_opps) + len(lost_opps)
    win_rate = round((len(won_opps) / decided_count) * 100.0, 1) if decided_count > 0 else 0.0

    # 2. Lead funnel
    funnel_defs = [
        ("new", "Novedades"),
        ("contacted", "Contactados"),
        ("replied", "Respondidos"),
        ("converted", "Convertidos"),
        ("unqualified", "No cualificados"),
    ]
    funnel_counts: dict[str, int] = {key: 0 for key, _ in funnel_defs}
    for l in leads:
        st = (l.status or "new").strip().lower()
        if st == "qualified":
            st = "replied"
        elif st in {"disqualified", "lost"}:
            st = "unqualified"
        if st in funnel_counts:
            funnel_counts[st] += 1
        else:
            funnel_counts["new"] += 1
    lead_funnel = [
        {"status": key, "label": label, "count": funnel_counts[key]}
        for key, label in funnel_defs
    ]

    # 3. Opportunity pipeline by stage
    stage_defs = [
        ("qualification", "Cualificación"),
        ("proposal", "Propuesta"),
        ("negotiation", "Negociación"),
        ("closed_won", "Ganadas"),
        ("closed_lost", "Perdidas"),
    ]
    stage_stats: dict[str, dict[str, Any]] = {
        key: {"stage": key, "label": label, "value": 0.0, "count": 0}
        for key, label in stage_defs
    }
    for op in opps:
        st = (op.stage or "qualification").strip().lower()
        bucket = stage_stats.get(st)
        if bucket is None:
            bucket = {"stage": st, "label": st, "value": 0.0, "count": 0}
            stage_stats[st] = bucket
        bucket["value"] = round(float(bucket["value"]) + float(op.amount_eur), 2)
        bucket["count"] += 1
    opp_pipeline = list(stage_stats.values())

    # 4. Monthly activity (12 meses del año activo)
    month_names = [
        "Ene", "Feb", "Mar", "Abr", "May", "Jun",
        "Jul", "Ago", "Sep", "Oct", "Nov", "Dic",
    ]
    monthly_activity = [
        {"month": idx + 1, "label": month_names[idx], "activities": 0, "leads": 0, "opportunities_eur": 0.0}
        for idx in range(12)
    ]
    for act in all_activities:
        if act.created_at.year == active_year:
            monthly_activity[act.created_at.month - 1]["activities"] += 1
    for l in all_leads:
        if l.created_at.year == active_year:
            monthly_activity[l.created_at.month - 1]["leads"] += 1
    for op in all_opps:
        ref_dt = op.expected_close_date or op.created_at
        if ref_dt.year == active_year and (op.stage or "").lower() != "closed_lost":
            idx = ref_dt.month - 1
            monthly_activity[idx]["opportunities_eur"] = round(
                monthly_activity[idx]["opportunities_eur"] + float(op.amount_eur), 2
            )

    # 5. Forecast trimestral del año activo
    quarter_labels = [
        ("Q1", "T1 (Ene-Mar)"),
        ("Q2", "T2 (Abr-Jun)"),
        ("Q3", "T3 (Jul-Sep)"),
        ("Q4", "T4 (Oct-Dic)"),
    ]
    forecast = [
        {
            "quarter": q_code,
            "label": q_label,
            "pipeline_eur": 0.0,
            "weighted_eur": 0.0,
            "won_eur": 0.0,
            "count": 0,
        }
        for q_code, q_label in quarter_labels
    ]
    for op in all_opps:
        ref_dt = op.expected_close_date or op.created_at
        if ref_dt.year != active_year:
            continue
        q_idx = (ref_dt.month - 1) // 3
        stage_norm = (op.stage or "").strip().lower()
        if stage_norm == "closed_lost":
            continue
        forecast[q_idx]["count"] += 1
        if stage_norm == "closed_won":
            forecast[q_idx]["won_eur"] = round(forecast[q_idx]["won_eur"] + float(op.amount_eur), 2)
        else:
            forecast[q_idx]["pipeline_eur"] = round(
                forecast[q_idx]["pipeline_eur"] + float(op.amount_eur), 2
            )
            forecast[q_idx]["weighted_eur"] = round(
                forecast[q_idx]["weighted_eur"]
                + float(op.amount_eur) * (float(op.probability) / 100.0),
                2,
            )

    # 6. Top clients / organizations & concentration
    org_totals: dict[int, dict[str, Any]] = {}
    for op in opps:
        stage_norm = (op.stage or "").strip().lower()
        if stage_norm == "closed_lost" or op.organization_id is None:
            continue
        org = org_by_id.get(op.organization_id)
        if org is None:
            continue
        entry = org_totals.setdefault(
            op.organization_id,
            {
                "organization_id": org.id,
                "name": org.name,
                "cif": org.cif,
                "pipeline_eur": 0.0,
                "won_eur": 0.0,
                "total_eur": 0.0,
                "opportunities_count": 0,
            },
        )
        entry["opportunities_count"] += 1
        entry["total_eur"] = round(entry["total_eur"] + float(op.amount_eur), 2)
        if stage_norm == "closed_won":
            entry["won_eur"] = round(entry["won_eur"] + float(op.amount_eur), 2)
        else:
            entry["pipeline_eur"] = round(entry["pipeline_eur"] + float(op.amount_eur), 2)

    top_clients = sorted(
        org_totals.values(),
        key=lambda item: (-float(item["total_eur"]), str(item["name"])),
    )[:5]

    open_by_org = sorted(
        [item for item in org_totals.values() if item["pipeline_eur"] > 0],
        key=lambda item: -float(item["pipeline_eur"]),
    )
    if pipeline_value > 0 and open_by_org:
        top1_share_pct = round((float(open_by_org[0]["pipeline_eur"]) / pipeline_value) * 100.0, 1)
        top3_sum = sum(float(item["pipeline_eur"]) for item in open_by_org[:3])
        top3_share_pct = round((top3_sum / pipeline_value) * 100.0, 1)
        top1_name = open_by_org[0]["name"]
    else:
        top1_share_pct = 0.0
        top3_share_pct = 0.0
        top1_name = None

    # 7. Recent wins
    sorted_wins = sorted(
        won_opps,
        key=lambda op: (op.updated_at, op.id or 0),
        reverse=True,
    )[:5]
    recent_wins = [
        {
            "id": op.id,
            "title": op.title,
            "organization_id": op.organization_id,
            "organization_name": org_by_id[op.organization_id].name
            if op.organization_id and op.organization_id in org_by_id
            else None,
            "amount_eur": op.amount_eur,
            "updated_at": op.updated_at.isoformat(),
        }
        for op in sorted_wins
    ]

    return {
        "filters": {
            "year": active_year,
            "quarter": quarter,
            "available_years": available_years,
        },
        "kpis": {
            "total_leads": total_leads,
            "total_clients": total_clients,
            "pipeline_value": pipeline_value,
            "weighted_pipeline": weighted_pipeline,
            "won_value": won_value,
            "conversion_rate": conversion_rate,
            "win_rate": win_rate,
        },
        "lead_funnel": lead_funnel,
        "opp_pipeline": opp_pipeline,
        "monthly_activity": monthly_activity,
        "forecast": forecast,
        "top_clients": top_clients,
        "recent_wins": recent_wins,
        "concentration": {
            "top1_name": top1_name,
            "top1_share_pct": top1_share_pct,
            "top3_share_pct": top3_share_pct,
        },
    }

