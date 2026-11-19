"""Motor proactivo de agentes BYOK: cualificación de leads, radar comercial e ingesta libre."""

from __future__ import annotations

import json
import logging
import re
from datetime import timedelta
from typing import Any, Literal, Optional

from pydantic import BaseModel, Field as PydanticField, field_validator
from sqlalchemy.engine import Engine
from sqlmodel import Session, select

from ai.gateway import AIGateway, get_default_provider_config
from core.models import (
    AIProviderConfig,
    ActivityLog,
    ActorType,
    AgentAction,
    AgentActionStatus,
    Lead,
    Opportunity,
    Organization,
    Task,
    utc_now,
)

logger = logging.getLogger("fidus.proactive")

QUALIFY_AGENT_NAME = "Agente Cualificador BYOK"
RADAR_AGENT_NAME = "Radar Comercial BYOK"
INGEST_AGENT_NAME = "Agente Ingesta BYOK"

SUPPORTED_PROACTIVE_ACTIONS = ("create_task", "create_lead", "update_opportunity")
ALLOWED_TASK_PRIORITIES = {"low", "medium", "high", "urgent"}


class NoBYOKConfiguredError(RuntimeError):
    """Se lanza cuando una acción proactiva explícita requiere proveedor BYOK activo."""


# ---------------------------------------------------------------------------
# Esquemas Pydantic para validar respuestas JSON de modelos LLM
# ---------------------------------------------------------------------------


class SuggestedTaskOutput(BaseModel):
    title: str = PydanticField(min_length=1, max_length=255)
    description: Optional[str] = None
    priority: str = "medium"

    @field_validator("priority", mode="before")
    @classmethod
    def normalize_priority(cls, value: Any) -> str:
        cleaned = str(value or "medium").strip().lower()
        return cleaned if cleaned in ALLOWED_TASK_PRIORITIES else "medium"


class LeadQualificationOutput(BaseModel):
    score: int = PydanticField(ge=0, le=100)
    summary: str = PydanticField(min_length=1)
    suggested_task: Optional[SuggestedTaskOutput] = None
    first_contact_draft: Optional[str] = None

    @field_validator("score", mode="before")
    @classmethod
    def clamp_score(cls, value: Any) -> int:
        num = int(round(float(value)))
        return max(0, min(100, num))


class ProposedActionItem(BaseModel):
    action_type: Literal["create_task", "create_lead", "update_opportunity"]
    target_entity_type: Optional[str] = None
    target_entity_id: Optional[int] = None
    payload: dict[str, Any] = PydanticField(default_factory=dict)


class RadarOutput(BaseModel):
    briefing: str = PydanticField(min_length=1)
    proposed_actions: list[ProposedActionItem] = PydanticField(default_factory=list)


class IngestOutput(BaseModel):
    summary: str = PydanticField(min_length=1)
    proposed_actions: list[ProposedActionItem] = PydanticField(default_factory=list)


# ---------------------------------------------------------------------------
# Utilidades de parseo JSON y serialización
# ---------------------------------------------------------------------------


def extract_json_object(raw_text: str) -> dict[str, Any]:
    """Extrae y parsea un objeto JSON incluso si el LLM lo envuelve en bloques ```json."""
    text = (raw_text or "").strip()
    if not text:
        raise ValueError("La respuesta del modelo está vacía.")

    fenced_match = re.search(r"```(?:json)?\s*([\s\S]*?)```", text, flags=re.IGNORECASE)
    if fenced_match:
        candidate = fenced_match.group(1).strip()
        try:
            parsed = json.loads(candidate)
            if isinstance(parsed, dict):
                return parsed
        except json.JSONDecodeError:
            pass

    try:
        parsed = json.loads(text)
        if isinstance(parsed, dict):
            return parsed
    except json.JSONDecodeError:
        pass

    start = text.find("{")
    end = text.rfind("}")
    if start != -1 and end > start:
        parsed = json.loads(text[start : end + 1])
        if isinstance(parsed, dict):
            return parsed

    raise ValueError("No se encontró un objeto JSON válido en la respuesta del modelo.")


def _serialize_action(action: AgentAction) -> dict[str, Any]:
    try:
        payload = json.loads(action.payload_json or "{}")
    except json.JSONDecodeError:
        payload = {}
    return {
        "id": action.id,
        "tenant_id": action.tenant_id,
        "agent_name": action.agent_name,
        "model_used": action.model_used,
        "action_type": action.action_type,
        "target_entity_type": action.target_entity_type,
        "target_entity_id": action.target_entity_id,
        "payload": payload,
        "status": action.status,
        "reviewed_by_user_id": action.reviewed_by_user_id,
        "reviewed_at": action.reviewed_at.isoformat() if action.reviewed_at else None,
        "review_note": action.review_note,
        "created_at": action.created_at.isoformat(),
        "updated_at": action.updated_at.isoformat(),
    }


def _entity_exists_in_tenant(session: Session, model_cls: Any, entity_id: Any, tenant_id: int) -> Optional[int]:
    if entity_id is None:
        return None
    try:
        eid = int(entity_id)
    except (TypeError, ValueError):
        return None
    found = session.exec(
        select(model_cls.id).where(model_cls.id == eid, model_cls.tenant_id == tenant_id)
    ).first()
    return eid if found is not None else None


def _has_pending_action(
    session: Session,
    *,
    tenant_id: int,
    action_type: str,
    target_entity_type: str,
    target_entity_id: Optional[int],
    agent_name: Optional[str] = None,
    recent_hours: Optional[int] = None,
) -> bool:
    stmt = select(AgentAction).where(
        AgentAction.tenant_id == tenant_id,
        AgentAction.status == AgentActionStatus.PENDING_APPROVAL.value,
        AgentAction.action_type == action_type,
        AgentAction.target_entity_type == target_entity_type,
    )
    if target_entity_id is None:
        stmt = stmt.where(AgentAction.target_entity_id.is_(None))  # type: ignore[union-attr]
    else:
        stmt = stmt.where(AgentAction.target_entity_id == target_entity_id)

    if agent_name is not None:
        stmt = stmt.where(AgentAction.agent_name == agent_name)
    if recent_hours is not None:
        cutoff = utc_now() - timedelta(hours=recent_hours)
        stmt = stmt.where(AgentAction.created_at >= cutoff)

    return session.exec(stmt).first() is not None


def _pick_non_empty_str(raw_payload: dict[str, Any], *keys: str) -> Optional[str]:
    """Devuelve el primer valor string no vacío encontrado entre las claves candidatas."""
    for key in keys:
        val = raw_payload.get(key)
        if val is None:
            continue
        text = str(val).strip()
        if text:
            return text
    return None


def _pick_first_defined(raw_payload: dict[str, Any], *keys: str) -> Any:
    """Devuelve el primer valor distinto de None encontrado entre las claves candidatas."""
    for key in keys:
        if key in raw_payload and raw_payload[key] is not None:
            return raw_payload[key]
    return None


def _build_validated_action(
    session: Session,
    *,
    tenant_id: int,
    agent_name: str,
    model_used: str,
    item: ProposedActionItem,
    deduplicate: bool = True,
) -> Optional[AgentAction]:
    """Valida una propuesta del LLM contra las entidades del tenant y ejecutores soportados."""
    if item.action_type not in SUPPORTED_PROACTIVE_ACTIONS:
        return None

    raw_payload = dict(item.payload or {})
    target_type = (item.target_entity_type or "").strip().lower()
    target_id = item.target_entity_id

    if item.action_type == "create_task":
        org_id = _entity_exists_in_tenant(session, Organization, raw_payload.get("organization_id"), tenant_id)
        opp_id = _entity_exists_in_tenant(session, Opportunity, raw_payload.get("opportunity_id"), tenant_id)
        lead_id = _entity_exists_in_tenant(session, Lead, raw_payload.get("lead_id"), tenant_id)

        if target_type == "opportunity":
            valid_target_id = _entity_exists_in_tenant(session, Opportunity, target_id, tenant_id)
            if valid_target_id is not None and opp_id is None:
                opp_id = valid_target_id
        elif target_type == "organization":
            valid_target_id = _entity_exists_in_tenant(session, Organization, target_id, tenant_id)
            if valid_target_id is not None and org_id is None:
                org_id = valid_target_id
        elif target_type == "lead":
            valid_target_id = _entity_exists_in_tenant(session, Lead, target_id, tenant_id)
        else:
            target_type = "opportunity" if opp_id is not None else ("lead" if lead_id is not None else "task")
            valid_target_id = opp_id if target_type == "opportunity" else (lead_id if target_type == "lead" else None)

        priority = str(raw_payload.get("priority") or "medium").strip().lower()
        if priority not in ALLOWED_TASK_PRIORITIES:
            priority = "medium"

        task_title = _pick_non_empty_str(raw_payload, "title", "titulo", "título", "subject", "asunto")
        task_description = _pick_non_empty_str(raw_payload, "description", "descripcion", "descripción")

        clean_payload: dict[str, Any] = {
            "title": (task_title or "Seguimiento propuesto por agente")[:255],
            "priority": priority,
        }
        if task_description is not None:
            clean_payload["description"] = task_description
        if org_id is not None:
            clean_payload["organization_id"] = org_id
        if opp_id is not None:
            clean_payload["opportunity_id"] = opp_id

        final_target_type = target_type or "task"
        final_target_id = valid_target_id

    elif item.action_type == "create_lead":
        org_id = _entity_exists_in_tenant(session, Organization, raw_payload.get("organization_id"), tenant_id)
        full_name = _pick_non_empty_str(
            raw_payload,
            "full_name",
            "name",
            "nombre",
            "nombre_completo",
            "lead_name",
            "contact_name",
        )
        if not full_name:
            return None

        clean_payload = {"full_name": full_name[:200]}
        synonym_map: dict[str, tuple[str, ...]] = {
            "email": ("email", "correo"),
            "phone": ("phone", "telefono", "teléfono", "movil", "móvil"),
            "company_name": ("company_name", "company", "empresa"),
            "source": ("source",),
            "notes": ("notes", "notas"),
        }
        for canonical_key, aliases in synonym_map.items():
            val = _pick_non_empty_str(raw_payload, *aliases)
            if val is not None:
                clean_payload[canonical_key] = val

        if org_id is not None:
            clean_payload["organization_id"] = org_id
        final_target_type = "lead"
        final_target_id = None

    else:  # update_opportunity
        raw_opp_id = target_id if target_id is not None else raw_payload.get("opportunity_id")
        opp_id = _entity_exists_in_tenant(session, Opportunity, raw_opp_id, tenant_id)
        if opp_id is None:
            return None

        clean_payload = {}
        if raw_payload.get("stage") is not None:
            clean_payload["stage"] = str(raw_payload["stage"]).strip()
        raw_amount = _pick_first_defined(raw_payload, "amount_eur", "amount", "importe")
        if raw_amount is not None:
            try:
                amount = float(raw_amount)
                if amount >= 0:
                    clean_payload["amount_eur"] = amount
            except (TypeError, ValueError):
                pass
        if raw_payload.get("probability") is not None:
            try:
                prob = int(raw_payload["probability"])
                if 0 <= prob <= 100:
                    clean_payload["probability"] = prob
            except (TypeError, ValueError):
                pass
        raw_notes = _pick_first_defined(raw_payload, "notes", "notas")
        if raw_notes is not None:
            clean_payload["notes"] = str(raw_notes)

        if not clean_payload:
            return None

        final_target_type = "opportunity"
        final_target_id = opp_id

    if deduplicate and _has_pending_action(
        session,
        tenant_id=tenant_id,
        action_type=item.action_type,
        target_entity_type=final_target_type,
        target_entity_id=final_target_id,
    ):
        return None

    return AgentAction(
        tenant_id=tenant_id,
        agent_name=agent_name,
        model_used=model_used,
        action_type=item.action_type,
        target_entity_type=final_target_type,
        target_entity_id=final_target_id,
        payload_json=json.dumps(clean_payload, ensure_ascii=False),
        status=AgentActionStatus.PENDING_APPROVAL.value,
    )


# ---------------------------------------------------------------------------
# 1. Cualificación automática de Leads
# ---------------------------------------------------------------------------


async def qualify_lead_for_tenant(
    session: Session,
    tenant_id: int,
    lead_id: int,
    *,
    gateway: Optional[AIGateway] = None,
    require_byok: bool = False,
) -> dict[str, Any]:
    """Cualifica un Lead con el proveedor BYOK del tenant y propone seguimiento HITL."""
    config = get_default_provider_config(session, tenant_id)
    if config is None:
        if require_byok:
            raise NoBYOKConfiguredError(
                "No hay ningún proveedor BYOK activo configurado en el tenant. Configúralo en Ajustes > IA (BYOK)."
            )
        return {"status": "skipped", "skipped": "no_byok", "lead_id": lead_id}

    lead = session.exec(
        select(Lead).where(Lead.id == lead_id, Lead.tenant_id == tenant_id)
    ).first()
    if lead is None:
        return {"status": "skipped", "skipped": "lead_not_found", "lead_id": lead_id}

    org: Optional[Organization] = None
    if lead.organization_id is not None:
        org = session.exec(
            select(Organization).where(
                Organization.id == lead.organization_id,
                Organization.tenant_id == tenant_id,
            )
        ).first()

    ai_gateway = gateway or AIGateway()
    lead_context = {
        "lead_id": lead.id,
        "full_name": lead.full_name,
        "email": lead.email,
        "phone": lead.phone,
        "company_name": lead.company_name,
        "source": lead.source,
        "status": lead.status,
        "notes": lead.notes,
        "organization": (
            {
                "id": org.id,
                "name": org.name,
                "cif": org.cif,
                "sector": org.sector,
            }
            if org is not None
            else None
        ),
    }

    messages = [
        {
            "role": "system",
            "content": (
                "Eres un analista comercial B2B en España para FidusOS v2. "
                "Evalúa el lead recibido y responde EXCLUSIVAMENTE con un JSON válido con las claves: "
                "score (entero 0-100), summary (resumen breve en español), "
                "suggested_task ({title, description, priority: low|medium|high|urgent}) y "
                "first_contact_draft (borrador corto en español)."
            ),
        },
        {
            "role": "user",
            "content": json.dumps(lead_context, ensure_ascii=False),
        },
    ]

    response = await ai_gateway.complete(config, messages, temperature=0.2, max_tokens=600)
    parsed = LeadQualificationOutput.model_validate(extract_json_object(response.content))

    now = utc_now()
    lead.score = parsed.score
    note_addition = f"[Cualificación IA ({response.model}) · Score {parsed.score}/100]: {parsed.summary}"
    if parsed.first_contact_draft:
        note_addition += f"\nBorrador primer contacto: {parsed.first_contact_draft}"
    lead.notes = f"{lead.notes.rstrip()}\n\n{note_addition}" if lead.notes and lead.notes.strip() else note_addition
    lead.updated_at = now
    session.add(lead)

    log = ActivityLog(
        tenant_id=tenant_id,
        actor_type=ActorType.AGENT.value,
        actor_name=QUALIFY_AGENT_NAME,
        user_id=None,
        model_used=response.model,
        action="proactive:qualify_lead",
        entity_type="lead",
        entity_id=lead.id,
        details_json=json.dumps(
            {
                "score": parsed.score,
                "summary": parsed.summary,
                "first_contact_draft": parsed.first_contact_draft,
            },
            ensure_ascii=False,
        ),
    )
    session.add(log)

    created_action: Optional[AgentAction] = None
    already_pending = _has_pending_action(
        session,
        tenant_id=tenant_id,
        action_type="create_task",
        target_entity_type="lead",
        target_entity_id=lead.id,
        agent_name=QUALIFY_AGENT_NAME,
        recent_hours=24,
    )
    if not already_pending:
        task_info = parsed.suggested_task or SuggestedTaskOutput(
            title=f"Contactar a {lead.full_name} (Score {parsed.score}/100)",
            description=parsed.summary,
            priority="high" if parsed.score >= 70 else "medium",
        )
        task_description = task_info.description or parsed.summary
        if parsed.first_contact_draft:
            task_description = f"{task_description}\n\nBorrador sugerido:\n{parsed.first_contact_draft}"

        task_payload: dict[str, Any] = {
            "title": task_info.title,
            "description": task_description,
            "priority": task_info.priority,
        }
        if lead.organization_id is not None:
            task_payload["organization_id"] = lead.organization_id

        created_action = AgentAction(
            tenant_id=tenant_id,
            agent_name=QUALIFY_AGENT_NAME,
            model_used=response.model,
            action_type="create_task",
            target_entity_type="lead",
            target_entity_id=lead.id,
            payload_json=json.dumps(task_payload, ensure_ascii=False),
            status=AgentActionStatus.PENDING_APPROVAL.value,
        )
        session.add(created_action)

    session.commit()
    session.refresh(lead)
    if created_action is not None:
        session.refresh(created_action)

    return {
        "status": "qualified",
        "lead_id": lead.id,
        "score": lead.score,
        "model_used": response.model,
        "created_action": _serialize_action(created_action) if created_action else None,
    }


# ---------------------------------------------------------------------------
# 2. Radar Comercial Proactivo
# ---------------------------------------------------------------------------


def _scan_pipeline_signals(
    session: Session,
    tenant_id: int,
    *,
    stale_days: int = 7,
) -> dict[str, Any]:
    now = utc_now()
    cutoff = now - timedelta(days=max(0, stale_days))

    # Oportunidades abiertas sin ActivityLog reciente
    open_opps = session.exec(
        select(Opportunity).where(
            Opportunity.tenant_id == tenant_id,
            Opportunity.stage.notin_(["closed_won", "closed_lost"]),  # type: ignore[attr-defined]
        )
    ).all()

    stale_opportunities: list[dict[str, Any]] = []
    for opp in open_opps:
        latest_opp_log = session.exec(
            select(ActivityLog)
            .where(
                ActivityLog.tenant_id == tenant_id,
                ActivityLog.entity_type == "opportunity",
                ActivityLog.entity_id == opp.id,
            )
            .order_by(ActivityLog.created_at.desc())  # type: ignore[union-attr]
        ).first()
        is_stale = latest_opp_log is None or latest_opp_log.created_at < cutoff
        if is_stale:
            stale_opportunities.append(
                {
                    "id": opp.id,
                    "title": opp.title,
                    "organization_id": opp.organization_id,
                    "amount_eur": opp.amount_eur,
                    "stage": opp.stage,
                    "probability": opp.probability,
                    "last_activity_at": latest_opp_log.created_at.isoformat() if latest_opp_log else None,
                }
            )

    # Leads en estado 'new' antiguos o sin ActivityLog
    new_leads = session.exec(
        select(Lead).where(Lead.tenant_id == tenant_id, Lead.status == "new")
    ).all()
    stale_leads: list[dict[str, Any]] = []
    for lead in new_leads:
        latest_lead_log = session.exec(
            select(ActivityLog)
            .where(
                ActivityLog.tenant_id == tenant_id,
                ActivityLog.entity_type == "lead",
                ActivityLog.entity_id == lead.id,
            )
            .order_by(ActivityLog.created_at.desc())  # type: ignore[union-attr]
        ).first()
        is_stale = latest_lead_log is None or lead.created_at < cutoff
        if is_stale:
            stale_leads.append(
                {
                    "id": lead.id,
                    "full_name": lead.full_name,
                    "company_name": lead.company_name,
                    "organization_id": lead.organization_id,
                    "score": lead.score,
                    "created_at": lead.created_at.isoformat(),
                }
            )

    # Tareas abiertas vencidas
    open_tasks = session.exec(
        select(Task).where(
            Task.tenant_id == tenant_id,
            Task.status.notin_(["completed", "cancelled"]),  # type: ignore[attr-defined]
            Task.due_date.is_not(None),  # type: ignore[union-attr]
            Task.due_date < now,  # type: ignore[operator]
        )
    ).all()
    overdue_tasks = [
        {
            "id": t.id,
            "title": t.title,
            "priority": t.priority,
            "organization_id": t.organization_id,
            "opportunity_id": t.opportunity_id,
            "due_date": t.due_date.isoformat() if t.due_date else None,
        }
        for t in open_tasks
    ]

    findings_count = len(stale_opportunities) + len(stale_leads) + len(overdue_tasks)
    return {
        "stale_days": stale_days,
        "findings_count": findings_count,
        "stale_opportunities": stale_opportunities,
        "stale_leads": stale_leads,
        "overdue_tasks": overdue_tasks,
    }


async def run_commercial_radar_for_tenant(
    session: Session,
    tenant_id: int,
    *,
    stale_days: int = 7,
    gateway: Optional[AIGateway] = None,
    require_byok: bool = False,
) -> dict[str, Any]:
    """Escanea el pipeline del tenant y propone acciones HITL mediante el modelo BYOK."""
    config = get_default_provider_config(session, tenant_id)
    if config is None:
        if require_byok:
            raise NoBYOKConfiguredError(
                "No hay ningún proveedor BYOK activo configurado en el tenant. Configúralo en Configuración IA."
            )
        return {
            "status": "skipped",
            "skipped": "no_byok",
            "briefing": "Proveedor BYOK no configurado.",
            "findings_count": 0,
            "created_actions": [],
        }

    signals = _scan_pipeline_signals(session, tenant_id, stale_days=stale_days)
    if signals["findings_count"] == 0:
        return {
            "briefing": "Pipeline sano: no se detectaron oportunidades estancadas, leads nuevos sin atender ni tareas vencidas.",
            "findings_count": 0,
            "created_actions": [],
        }

    ai_gateway = gateway or AIGateway()
    messages = [
        {
            "role": "system",
            "content": (
                "Eres el Radar Comercial Proactivo de FidusOS v2 (mercado español, importes en EUR). "
                "Analiza las señales de riesgo y responde EXCLUSIVAMENTE con un JSON válido: "
                "{\"briefing\": \"resumen ejecutivo en español\", "
                "\"proposed_actions\": [{\"action_type\": \"create_task\" | \"update_opportunity\", "
                "\"target_entity_type\": \"opportunity\" | \"lead\" | \"task\", "
                "\"target_entity_id\": <id entero o null>, \"payload\": {...}}]}. "
                "Para create_task usa payload {title, description, priority, organization_id?, opportunity_id?}. "
                "Para update_opportunity usa target_entity_id de la oportunidad y payload con stage/amount_eur/probability/notes."
            ),
        },
        {
            "role": "user",
            "content": json.dumps(signals, ensure_ascii=False),
        },
    ]

    response = await ai_gateway.complete(config, messages, temperature=0.2, max_tokens=900)
    parsed = RadarOutput.model_validate(extract_json_object(response.content))

    created_actions: list[AgentAction] = []
    for item in parsed.proposed_actions:
        if item.action_type not in {"create_task", "update_opportunity"}:
            continue
        action = _build_validated_action(
            session,
            tenant_id=tenant_id,
            agent_name=RADAR_AGENT_NAME,
            model_used=response.model,
            item=item,
            deduplicate=True,
        )
        if action is not None:
            session.add(action)
            created_actions.append(action)

    session.flush()
    log = ActivityLog(
        tenant_id=tenant_id,
        actor_type=ActorType.AGENT.value,
        actor_name=RADAR_AGENT_NAME,
        user_id=None,
        model_used=response.model,
        action="proactive:commercial_radar",
        entity_type="tenant",
        entity_id=tenant_id,
        details_json=json.dumps(
            {
                "stale_days": stale_days,
                "findings_count": signals["findings_count"],
                "created_actions_count": len(created_actions),
                "briefing": parsed.briefing,
            },
            ensure_ascii=False,
        ),
    )
    session.add(log)
    session.commit()

    for act in created_actions:
        session.refresh(act)

    return {
        "briefing": parsed.briefing,
        "findings_count": signals["findings_count"],
        "created_actions": [_serialize_action(act) for act in created_actions],
    }


# ---------------------------------------------------------------------------
# 3. Ingesta de texto libre (Notas, Email, WhatsApp, Llamada)
# ---------------------------------------------------------------------------


async def ingest_free_text_for_tenant(
    session: Session,
    tenant_id: int,
    text: str,
    *,
    organization_id: Optional[int] = None,
    gateway: Optional[AIGateway] = None,
) -> dict[str, Any]:
    """Analiza texto libre comercial con el modelo BYOK y genera acciones HITL validadas."""
    config = get_default_provider_config(session, tenant_id)
    if config is None:
        raise NoBYOKConfiguredError(
            "No hay ningún proveedor BYOK activo configurado en el tenant. Configúralo en Configuración IA."
        )

    cleaned_text = text.strip()
    if not cleaned_text:
        raise ValueError("El texto a analizar no puede estar vacío.")

    orgs = session.exec(
        select(Organization)
        .where(Organization.tenant_id == tenant_id)
        .order_by(Organization.id.desc())  # type: ignore[union-attr]
        .limit(25)
    ).all()
    opps = session.exec(
        select(Opportunity)
        .where(Opportunity.tenant_id == tenant_id)
        .order_by(Opportunity.id.desc())  # type: ignore[union-attr]
        .limit(25)
    ).all()

    crm_context = {
        "selected_organization_id": organization_id,
        "organizations": [{"id": o.id, "name": o.name, "cif": o.cif} for o in orgs],
        "opportunities": [
            {
                "id": op.id,
                "title": op.title,
                "organization_id": op.organization_id,
                "stage": op.stage,
                "amount_eur": op.amount_eur,
                "probability": op.probability,
            }
            for op in opps
        ],
    }

    ai_gateway = gateway or AIGateway()
    messages = [
        {
            "role": "system",
            "content": (
                "Eres un asistente comercial de FidusOS v2. Extrae acciones estructuradas para aprobación HITL "
                "a partir de notas de reunión, correos, llamadas o WhatsApp. "
                "Responde EXCLUSIVAMENTE con un JSON válido: "
                "{\"summary\": \"resumen en español\", "
                "\"proposed_actions\": [{\"action_type\": \"create_task\" | \"create_lead\" | \"update_opportunity\", "
                "\"target_entity_type\": \"task\" | \"lead\" | \"opportunity\", "
                "\"target_entity_id\": <id entero o null>, \"payload\": {...}}]}. "
                "Claves EXACTAS obligatorias para payload según action_type: "
                "- create_lead: {\"full_name\" (obligatorio), \"email\"?, \"phone\"?, \"company_name\"?, \"source\"?, \"notes\"?, \"organization_id\"?}. "
                "- create_task: {\"title\" (obligatorio), \"description\"?, \"priority\" (low|medium|high|urgent)?, \"organization_id\"?, \"opportunity_id\"?}. "
                "- update_opportunity (requiere target_entity_id de oportunidad existente): {\"stage\"?, \"amount_eur\"?, \"probability\" (0-100)?, \"notes\"?}. "
                "Usa los IDs reales de organizaciones y oportunidades del contexto cuando correspondan."
            ),
        },
        {
            "role": "user",
            "content": json.dumps(
                {"crm_context": crm_context, "raw_text": cleaned_text},
                ensure_ascii=False,
            ),
        },
    ]

    response = await ai_gateway.complete(config, messages, temperature=0.2, max_tokens=900)
    parsed = IngestOutput.model_validate(extract_json_object(response.content))

    created_actions: list[AgentAction] = []
    for item in parsed.proposed_actions:
        if organization_id is not None and "organization_id" not in item.payload and item.action_type in {
            "create_task",
            "create_lead",
        }:
            item.payload["organization_id"] = organization_id

        action = _build_validated_action(
            session,
            tenant_id=tenant_id,
            agent_name=INGEST_AGENT_NAME,
            model_used=response.model,
            item=item,
            deduplicate=False,
        )
        if action is not None:
            session.add(action)
            created_actions.append(action)

    session.flush()
    log = ActivityLog(
        tenant_id=tenant_id,
        actor_type=ActorType.AGENT.value,
        actor_name=INGEST_AGENT_NAME,
        user_id=None,
        model_used=response.model,
        action="proactive:ingest",
        entity_type="organization" if organization_id is not None else "tenant",
        entity_id=organization_id if organization_id is not None else tenant_id,
        details_json=json.dumps(
            {
                "summary": parsed.summary,
                "created_actions_count": len(created_actions),
                "source_excerpt": cleaned_text[:300],
            },
            ensure_ascii=False,
        ),
    )
    session.add(log)
    session.commit()

    for act in created_actions:
        session.refresh(act)

    return {
        "summary": parsed.summary,
        "created_actions": [_serialize_action(act) for act in created_actions],
    }


def list_active_tenant_ids_with_byok(session: Session) -> list[int]:
    """Devuelve los tenant_id únicos que tienen al menos un proveedor BYOK activo."""
    rows = session.exec(
        select(AIProviderConfig.tenant_id)
        .where(AIProviderConfig.is_active == True)  # noqa: E712
        .distinct()
    ).all()
    return [int(tid) for tid in rows if tid is not None]


def run_with_engine_session(engine: Engine, fn: Any, *args: Any, **kwargs: Any) -> Any:
    """Ejecuta una corrutina o función proactiva abriendo una sesión limpia sobre el engine."""
    with Session(engine) as session:
        return fn(session, *args, **kwargs)
