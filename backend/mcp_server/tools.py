"""Herramientas MCP nativas del CRM FidusOS v2 (multi-tenant estricto y mercado español)."""

import json
from typing import Any, Literal, Optional

from mcp.server.fastmcp import FastMCP
from sqlalchemy import func
from sqlmodel import col, select

from core.models import (
    ActivityLog,
    ActorType,
    AgentAction,
    AgentActionStatus,
    Lead,
    Organization,
    utc_now,
)
from crm.services import (
    ENTITY_MODELS,
    get_account_360_for_tenant,
    list_pending_for_tenant,
    log_interaction_for_tenant,
    search_crm_for_tenant,
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


@mcp.tool()
def buscar_crm(query: str, limit: int = 10) -> dict[str, Any]:
    """Busca organizaciones, clientes, leads, oportunidades (EUR) y tareas del tenant actual.

    Requiere scope: `crm:read`.
    """
    ctx = require_mcp_scope("crm:read")
    with open_mcp_db_session(app=ctx.app) as session:
        return search_crm_for_tenant(session, ctx.tenant_id, query, limit=limit)


@mcp.tool()
def cuenta_360(organization_id: int) -> dict[str, Any]:
    """Devuelve la vista 360 de una organización del tenant: datos fiscales (CIF, razón social,
    dirección fiscal), contactos, oportunidades en EUR, tareas pendientes y últimos logs de actividad.

    Requiere scope: `crm:read`.
    """
    ctx = require_mcp_scope("crm:read")
    with open_mcp_db_session(app=ctx.app) as session:
        return get_account_360_for_tenant(session, ctx.tenant_id, organization_id)


@mcp.tool()
def listar_pendientes(limit: int = 20) -> dict[str, Any]:
    """Lista las tareas abiertas y las acciones de agente pendientes de aprobación (HITL) del tenant.

    Requiere scope: `crm:read`.
    """
    ctx = require_mcp_scope("crm:read")
    with open_mcp_db_session(app=ctx.app) as session:
        return list_pending_for_tenant(session, ctx.tenant_id, limit=limit)


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
    with open_mcp_db_session(app=ctx.app) as session:
        return log_interaction_for_tenant(
            session,
            ctx.tenant_id,
            actor_type=ActorType.AGENT.value,
            actor_name=ctx.agent_name,
            channel=channel,
            entity_type=entity_type,
            entity_id=entity_id,
            summary=summary,
            outcome=outcome,
            user_id=None,
            model_used=model_used,
            commit=True,
        )


_SUPPORTED_PROPOSED_ACTIONS = ("create_task", "create_lead", "update_opportunity")


@mcp.tool()
def proponer_accion(
    action_type: str,
    target_entity_type: str,
    payload: dict[str, Any],
    target_entity_id: Optional[int] = None,
    model_used: Optional[str] = None,
) -> dict[str, Any]:
    """Propone una AgentAction en estado `pending_approval` para revisión humana (Human-in-the-Loop).

    `action_type` soportados: `create_task`, `create_lead`, `update_opportunity`.
    Requiere scope: `actions:propose`.
    """
    ctx = require_mcp_scope("actions:propose")
    cleaned_action = action_type.strip()
    cleaned_entity_type = target_entity_type.strip()
    if not cleaned_action or not cleaned_entity_type:
        raise ValueError("'action_type' y 'target_entity_type' son obligatorios.")
    if cleaned_action not in _SUPPORTED_PROPOSED_ACTIONS:
        supported = ", ".join(_SUPPORTED_PROPOSED_ACTIONS)
        raise ValueError(
            f"Tipo de acción '{cleaned_action}' no soportado. Valores permitidos: {supported}."
        )

    with open_mcp_db_session(app=ctx.app) as session:
        if target_entity_id is not None and cleaned_entity_type in ENTITY_MODELS:
            model_cls = ENTITY_MODELS[cleaned_entity_type]
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
