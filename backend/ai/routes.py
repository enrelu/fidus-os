"""Rutas de configuración BYOK, claves de agente y flujo Human-in-the-Loop de AgentAction."""

from __future__ import annotations

import json
from datetime import datetime
from typing import Any, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from pydantic import BaseModel, Field as PydanticField
from sqlmodel import Session, select

from ai.gateway import AIGateway, PROVIDERS_REQUIRING_KEY
from core.auth import require_actor_context, require_tenant_user
from core.crypto import encrypt_secret, generate_agent_api_key, mask_encrypted_secret
from core.database import get_session
from core.models import (
    AIProviderConfig,
    AIProviderType,
    ActivityLog,
    ActorType,
    AgentAction,
    AgentActionStatus,
    AgentApiKey,
    Lead,
    Opportunity,
    Organization,
    Task,
    User,
    utc_now,
)

router = APIRouter(prefix="/api/v1/ai", tags=["AI & Agents"])


def get_ai_gateway() -> AIGateway:
    return AIGateway()


# ---------------------------------------------------------------------------
# Esquemas BYOK (AIProviderConfig)
# ---------------------------------------------------------------------------


class AIProviderConfigCreate(BaseModel):
    provider: AIProviderType
    model_name: str = PydanticField(min_length=1, max_length=150)
    base_url: Optional[str] = PydanticField(default=None, max_length=500)
    api_key: Optional[str] = PydanticField(default=None, max_length=500)
    is_default: bool = False
    is_active: bool = True


class AIProviderConfigUpdate(BaseModel):
    model_name: Optional[str] = PydanticField(default=None, min_length=1, max_length=150)
    base_url: Optional[str] = PydanticField(default=None, max_length=500)
    api_key: Optional[str] = PydanticField(default=None, max_length=500)
    is_default: Optional[bool] = None
    is_active: Optional[bool] = None


class AIProviderConfigPublic(BaseModel):
    id: int
    tenant_id: int
    provider: str
    model_name: str
    base_url: Optional[str]
    has_api_key: bool
    api_key_masked: Optional[str]
    is_default: bool
    is_active: bool
    created_at: datetime
    updated_at: datetime


class ConnectionTestResponse(BaseModel):
    ok: bool
    provider: str
    model: str
    latency_ms: int
    detail: str


def _to_public_provider(cfg: AIProviderConfig) -> AIProviderConfigPublic:
    return AIProviderConfigPublic(
        id=cfg.id,  # type: ignore[arg-type]
        tenant_id=cfg.tenant_id,
        provider=cfg.provider,
        model_name=cfg.model_name,
        base_url=cfg.base_url,
        has_api_key=bool(cfg.api_key_encrypted),
        api_key_masked=mask_encrypted_secret(cfg.api_key_encrypted),
        is_default=cfg.is_default,
        is_active=cfg.is_active,
        created_at=cfg.created_at,
        updated_at=cfg.updated_at,
    )


def _clear_default_providers(session: Session, tenant_id: int, exclude_id: Optional[int] = None) -> None:
    existing = session.exec(
        select(AIProviderConfig).where(
            AIProviderConfig.tenant_id == tenant_id,
            AIProviderConfig.is_default == True,  # noqa: E712
        )
    ).all()
    for item in existing:
        if exclude_id is not None and item.id == exclude_id:
            continue
        item.is_default = False
        item.updated_at = utc_now()
        session.add(item)


@router.get("/providers", response_model=list[AIProviderConfigPublic])
def list_ai_providers(
    current_user: User = Depends(require_tenant_user),
    session: Session = Depends(get_session),
) -> list[AIProviderConfigPublic]:
    configs = session.exec(
        select(AIProviderConfig)
        .where(AIProviderConfig.tenant_id == current_user.tenant_id)
        .order_by(AIProviderConfig.id.asc())  # type: ignore[union-attr]
    ).all()
    return [_to_public_provider(cfg) for cfg in configs]


@router.post(
    "/providers",
    response_model=AIProviderConfigPublic,
    status_code=status.HTTP_201_CREATED,
)
def create_ai_provider(
    payload: AIProviderConfigCreate,
    current_user: User = Depends(require_tenant_user),
    session: Session = Depends(get_session),
) -> AIProviderConfigPublic:
    provider_value = payload.provider.value

    if provider_value in PROVIDERS_REQUIRING_KEY and (not payload.api_key or not payload.api_key.strip()):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"El proveedor '{provider_value}' requiere una 'api_key'.",
        )
    if provider_value == AIProviderType.OPENAI_COMPATIBLE.value and (
        not payload.base_url or not payload.base_url.strip()
    ):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="El proveedor 'openai_compatible' requiere 'base_url'.",
        )

    encrypted_key = encrypt_secret(payload.api_key) if payload.api_key and payload.api_key.strip() else None

    if payload.is_default:
        _clear_default_providers(session, current_user.tenant_id)

    cfg = AIProviderConfig(
        tenant_id=current_user.tenant_id,
        provider=provider_value,
        model_name=payload.model_name.strip(),
        base_url=payload.base_url.strip().rstrip("/") if payload.base_url else None,
        api_key_encrypted=encrypted_key,
        is_default=payload.is_default,
        is_active=payload.is_active,
    )
    session.add(cfg)
    session.commit()
    session.refresh(cfg)
    return _to_public_provider(cfg)


@router.get("/providers/{provider_id}", response_model=AIProviderConfigPublic)
def get_ai_provider(
    provider_id: int,
    current_user: User = Depends(require_tenant_user),
    session: Session = Depends(get_session),
) -> AIProviderConfigPublic:
    cfg = session.exec(
        select(AIProviderConfig).where(
            AIProviderConfig.id == provider_id,
            AIProviderConfig.tenant_id == current_user.tenant_id,
        )
    ).first()
    if cfg is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Proveedor de IA no encontrado.")
    return _to_public_provider(cfg)


@router.patch("/providers/{provider_id}", response_model=AIProviderConfigPublic)
def update_ai_provider(
    provider_id: int,
    payload: AIProviderConfigUpdate,
    current_user: User = Depends(require_tenant_user),
    session: Session = Depends(get_session),
) -> AIProviderConfigPublic:
    cfg = session.exec(
        select(AIProviderConfig).where(
            AIProviderConfig.id == provider_id,
            AIProviderConfig.tenant_id == current_user.tenant_id,
        )
    ).first()
    if cfg is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Proveedor de IA no encontrado.")

    if payload.model_name is not None:
        cfg.model_name = payload.model_name.strip()
    if payload.base_url is not None:
        cfg.base_url = payload.base_url.strip().rstrip("/") if payload.base_url.strip() else None
    if payload.api_key is not None and payload.api_key.strip():
        cfg.api_key_encrypted = encrypt_secret(payload.api_key)
    if payload.is_active is not None:
        cfg.is_active = payload.is_active
    if payload.is_default is not None:
        if payload.is_default:
            _clear_default_providers(session, current_user.tenant_id, exclude_id=cfg.id)
        cfg.is_default = payload.is_default

    cfg.updated_at = utc_now()
    session.add(cfg)
    session.commit()
    session.refresh(cfg)
    return _to_public_provider(cfg)


@router.delete("/providers/{provider_id}", status_code=status.HTTP_204_NO_CONTENT, response_class=Response)
def delete_ai_provider(
    provider_id: int,
    current_user: User = Depends(require_tenant_user),
    session: Session = Depends(get_session),
) -> Response:
    cfg = session.exec(
        select(AIProviderConfig).where(
            AIProviderConfig.id == provider_id,
            AIProviderConfig.tenant_id == current_user.tenant_id,
        )
    ).first()
    if cfg is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Proveedor de IA no encontrado.")
    session.delete(cfg)
    session.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post("/providers/{provider_id}/test", response_model=ConnectionTestResponse)
async def test_ai_provider_connection(
    provider_id: int,
    current_user: User = Depends(require_tenant_user),
    session: Session = Depends(get_session),
    gateway: AIGateway = Depends(get_ai_gateway),
) -> ConnectionTestResponse:
    cfg = session.exec(
        select(AIProviderConfig).where(
            AIProviderConfig.id == provider_id,
            AIProviderConfig.tenant_id == current_user.tenant_id,
        )
    ).first()
    if cfg is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Proveedor de IA no encontrado.")

    result = await gateway.test_connection(cfg)
    return ConnectionTestResponse(
        ok=result.ok,
        provider=result.provider,
        model=result.model,
        latency_ms=result.latency_ms,
        detail=result.detail,
    )


# ---------------------------------------------------------------------------
# Esquemas y rutas AgentApiKey
# ---------------------------------------------------------------------------


class AgentApiKeyCreate(BaseModel):
    name: str = PydanticField(min_length=2, max_length=150)
    scopes: str = PydanticField(default="crm:read,actions:propose", max_length=500)


class AgentApiKeyPublic(BaseModel):
    id: int
    tenant_id: int
    name: str
    key_prefix: str
    scopes: str
    is_active: bool
    last_used_at: Optional[datetime]
    created_at: datetime


class AgentApiKeyCreated(AgentApiKeyPublic):
    raw_key: str


@router.get("/agent-keys", response_model=list[AgentApiKeyPublic])
def list_agent_keys(
    current_user: User = Depends(require_tenant_user),
    session: Session = Depends(get_session),
) -> list[AgentApiKeyPublic]:
    keys = session.exec(
        select(AgentApiKey)
        .where(AgentApiKey.tenant_id == current_user.tenant_id)
        .order_by(AgentApiKey.id.asc())  # type: ignore[union-attr]
    ).all()
    return [
        AgentApiKeyPublic(
            id=k.id,  # type: ignore[arg-type]
            tenant_id=k.tenant_id,
            name=k.name,
            key_prefix=k.key_prefix,
            scopes=k.scopes,
            is_active=k.is_active,
            last_used_at=k.last_used_at,
            created_at=k.created_at,
        )
        for k in keys
    ]


@router.post(
    "/agent-keys",
    response_model=AgentApiKeyCreated,
    status_code=status.HTTP_201_CREATED,
)
def create_agent_key(
    payload: AgentApiKeyCreate,
    current_user: User = Depends(require_tenant_user),
    session: Session = Depends(get_session),
) -> AgentApiKeyCreated:
    raw_key, key_prefix, key_hash = generate_agent_api_key()
    record = AgentApiKey(
        tenant_id=current_user.tenant_id,
        name=payload.name.strip(),
        key_prefix=key_prefix,
        key_hash=key_hash,
        scopes=payload.scopes.strip(),
    )
    session.add(record)
    session.commit()
    session.refresh(record)
    return AgentApiKeyCreated(
        id=record.id,  # type: ignore[arg-type]
        tenant_id=record.tenant_id,
        name=record.name,
        key_prefix=record.key_prefix,
        scopes=record.scopes,
        is_active=record.is_active,
        last_used_at=record.last_used_at,
        created_at=record.created_at,
        raw_key=raw_key,
    )


@router.delete("/agent-keys/{key_id}", status_code=status.HTTP_204_NO_CONTENT, response_class=Response)
def revoke_agent_key(
    key_id: int,
    current_user: User = Depends(require_tenant_user),
    session: Session = Depends(get_session),
) -> Response:
    record = session.exec(
        select(AgentApiKey).where(
            AgentApiKey.id == key_id,
            AgentApiKey.tenant_id == current_user.tenant_id,
        )
    ).first()
    if record is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Clave de agente no encontrada.")
    record.is_active = False
    session.add(record)
    session.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


# ---------------------------------------------------------------------------
# Esquemas y rutas AgentAction (Human-in-the-Loop)
# ---------------------------------------------------------------------------


class AgentActionCreate(BaseModel):
    agent_name: str = PydanticField(min_length=1, max_length=150)
    model_used: Optional[str] = PydanticField(default=None, max_length=150)
    action_type: str = PydanticField(min_length=1, max_length=100)
    target_entity_type: str = PydanticField(min_length=1, max_length=80)
    target_entity_id: Optional[int] = None
    payload: dict[str, Any] = PydanticField(default_factory=dict)


class AgentActionReview(BaseModel):
    review_note: Optional[str] = PydanticField(default=None, max_length=500)


class AgentActionPublic(BaseModel):
    id: int
    tenant_id: int
    agent_name: str
    model_used: Optional[str]
    action_type: str
    target_entity_type: str
    target_entity_id: Optional[int]
    payload: dict[str, Any]
    status: str
    reviewed_by_user_id: Optional[int]
    reviewed_at: Optional[datetime]
    review_note: Optional[str]
    created_at: datetime
    updated_at: datetime


def _to_public_action(action: AgentAction) -> AgentActionPublic:
    try:
        parsed_payload = json.loads(action.payload_json) if action.payload_json else {}
    except json.JSONDecodeError:
        parsed_payload = {}
    return AgentActionPublic(
        id=action.id,  # type: ignore[arg-type]
        tenant_id=action.tenant_id,
        agent_name=action.agent_name,
        model_used=action.model_used,
        action_type=action.action_type,
        target_entity_type=action.target_entity_type,
        target_entity_id=action.target_entity_id,
        payload=parsed_payload,
        status=action.status,
        reviewed_by_user_id=action.reviewed_by_user_id,
        reviewed_at=action.reviewed_at,
        review_note=action.review_note,
        created_at=action.created_at,
        updated_at=action.updated_at,
    )


@router.post(
    "/agent-actions",
    response_model=AgentActionPublic,
    status_code=status.HTTP_201_CREATED,
)
def propose_agent_action(
    payload: AgentActionCreate,
    actor: tuple[int, Optional[User], Optional[AgentApiKey]] = Depends(require_actor_context),
    session: Session = Depends(get_session),
) -> AgentActionPublic:
    tenant_id, user, agent_key = actor

    if agent_key is not None and "actions:propose" not in {
        s.strip() for s in agent_key.scopes.split(",") if s.strip()
    }:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="La clave de agente no tiene permiso 'actions:propose'.",
        )

    action = AgentAction(
        tenant_id=tenant_id,
        agent_name=payload.agent_name.strip(),
        model_used=payload.model_used.strip() if payload.model_used else None,
        action_type=payload.action_type.strip(),
        target_entity_type=payload.target_entity_type.strip(),
        target_entity_id=payload.target_entity_id,
        payload_json=json.dumps(payload.payload, ensure_ascii=False),
        status=AgentActionStatus.PENDING_APPROVAL.value,
    )
    session.add(action)
    session.flush()

    log = ActivityLog(
        tenant_id=tenant_id,
        actor_type=ActorType.AGENT.value,
        actor_name=action.agent_name,
        user_id=user.id if user else None,
        model_used=action.model_used,
        action=f"propose:{action.action_type}",
        entity_type="agent_action",
        entity_id=action.id,
        details_json=action.payload_json,
    )
    session.add(log)
    session.commit()
    session.refresh(action)
    return _to_public_action(action)


@router.get("/agent-actions", response_model=list[AgentActionPublic])
def list_agent_actions(
    status_filter: Optional[AgentActionStatus] = Query(default=None, alias="status"),
    current_user: User = Depends(require_tenant_user),
    session: Session = Depends(get_session),
) -> list[AgentActionPublic]:
    stmt = select(AgentAction).where(AgentAction.tenant_id == current_user.tenant_id)
    if status_filter is not None:
        stmt = stmt.where(AgentAction.status == status_filter.value)
    stmt = stmt.order_by(AgentAction.id.desc())  # type: ignore[union-attr]
    actions = session.exec(stmt).all()
    return [_to_public_action(a) for a in actions]


@router.get("/agent-actions/{action_id}", response_model=AgentActionPublic)
def get_agent_action(
    action_id: int,
    current_user: User = Depends(require_tenant_user),
    session: Session = Depends(get_session),
) -> AgentActionPublic:
    action = session.exec(
        select(AgentAction).where(
            AgentAction.id == action_id,
            AgentAction.tenant_id == current_user.tenant_id,
        )
    ).first()
    if action is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Acción de agente no encontrada.")
    return _to_public_action(action)


@router.post("/agent-actions/{action_id}/approve", response_model=AgentActionPublic)
def approve_agent_action(
    action_id: int,
    review: Optional[AgentActionReview] = None,
    current_user: User = Depends(require_tenant_user),
    session: Session = Depends(get_session),
) -> AgentActionPublic:
    action = session.exec(
        select(AgentAction).where(
            AgentAction.id == action_id,
            AgentAction.tenant_id == current_user.tenant_id,
        )
    ).first()
    if action is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Acción de agente no encontrada.")
    if action.status != AgentActionStatus.PENDING_APPROVAL.value:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"La acción está en estado '{action.status}' y no puede aprobarse.",
        )

    now = utc_now()
    action.status = AgentActionStatus.APPROVED.value
    action.reviewed_by_user_id = current_user.id
    action.reviewed_at = now
    action.review_note = review.review_note if review else None
    action.updated_at = now
    session.add(action)

    log = ActivityLog(
        tenant_id=current_user.tenant_id,
        actor_type=ActorType.HUMAN.value,
        actor_name=current_user.full_name,
        user_id=current_user.id,
        model_used=None,
        action="approve:agent_action",
        entity_type="agent_action",
        entity_id=action.id,
        details_json=json.dumps({"review_note": action.review_note}, ensure_ascii=False),
    )
    session.add(log)
    session.commit()
    session.refresh(action)
    return _to_public_action(action)


@router.post("/agent-actions/{action_id}/reject", response_model=AgentActionPublic)
def reject_agent_action(
    action_id: int,
    review: Optional[AgentActionReview] = None,
    current_user: User = Depends(require_tenant_user),
    session: Session = Depends(get_session),
) -> AgentActionPublic:
    action = session.exec(
        select(AgentAction).where(
            AgentAction.id == action_id,
            AgentAction.tenant_id == current_user.tenant_id,
        )
    ).first()
    if action is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Acción de agente no encontrada.")
    if action.status != AgentActionStatus.PENDING_APPROVAL.value:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"La acción está en estado '{action.status}' y no puede rechazarse.",
        )

    now = utc_now()
    action.status = AgentActionStatus.REJECTED.value
    action.reviewed_by_user_id = current_user.id
    action.reviewed_at = now
    action.review_note = review.review_note if review else None
    action.updated_at = now
    session.add(action)

    log = ActivityLog(
        tenant_id=current_user.tenant_id,
        actor_type=ActorType.HUMAN.value,
        actor_name=current_user.full_name,
        user_id=current_user.id,
        model_used=None,
        action="reject:agent_action",
        entity_type="agent_action",
        entity_id=action.id,
        details_json=json.dumps({"review_note": action.review_note}, ensure_ascii=False),
    )
    session.add(log)
    session.commit()
    session.refresh(action)
    return _to_public_action(action)


def _validate_tenant_fk(
    session: Session,
    model_cls: Any,
    fk_id: Optional[int],
    tenant_id: int,
    label: str,
) -> None:
    if fk_id is None:
        return
    exists = session.exec(
        select(model_cls.id).where(model_cls.id == fk_id, model_cls.tenant_id == tenant_id)
    ).first()
    if exists is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Entidad '{label}' ({fk_id}) no encontrada en el tenant.",
        )


def _execute_create_task(
    session: Session,
    action: AgentAction,
    tenant_id: int,
    payload_data: dict[str, Any],
) -> Optional[int]:
    org_id = payload_data.get("organization_id")
    if org_id is not None:
        _validate_tenant_fk(session, Organization, int(org_id), tenant_id, "organization_id")

    opp_id = payload_data.get("opportunity_id")
    if opp_id is not None:
        _validate_tenant_fk(session, Opportunity, int(opp_id), tenant_id, "opportunity_id")

    task = Task(
        tenant_id=tenant_id,
        organization_id=int(org_id) if org_id is not None else None,
        opportunity_id=int(opp_id) if opp_id is not None else None,
        title=str(payload_data.get("title") or "Tarea generada por agente"),
        description=payload_data.get("description"),
        priority=str(payload_data.get("priority") or "medium"),
        status="pending",
    )
    session.add(task)
    session.flush()
    return task.id


def _execute_create_lead(
    session: Session,
    action: AgentAction,
    tenant_id: int,
    payload_data: dict[str, Any],
) -> Optional[int]:
    org_id = payload_data.get("organization_id")
    if org_id is not None:
        _validate_tenant_fk(session, Organization, int(org_id), tenant_id, "organization_id")

    lead = Lead(
        tenant_id=tenant_id,
        organization_id=int(org_id) if org_id is not None else None,
        full_name=str(payload_data.get("full_name") or "Lead generado por agente"),
        email=payload_data.get("email"),
        phone=payload_data.get("phone"),
        company_name=payload_data.get("company_name"),
        source=payload_data.get("source") or f"agent:{action.agent_name}",
        notes=payload_data.get("notes"),
    )
    session.add(lead)
    session.flush()
    return lead.id


def _execute_update_opportunity(
    session: Session,
    action: AgentAction,
    tenant_id: int,
    payload_data: dict[str, Any],
) -> Optional[int]:
    raw_opp_id = action.target_entity_id if action.target_entity_id is not None else payload_data.get("opportunity_id")
    if raw_opp_id is None:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="La acción 'update_opportunity' requiere 'target_entity_id' u 'opportunity_id'.",
        )
    opp_id = int(raw_opp_id)
    opp = session.exec(
        select(Opportunity).where(
            Opportunity.id == opp_id,
            Opportunity.tenant_id == tenant_id,
        )
    ).first()
    if opp is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Oportunidad {opp_id} no encontrada en el tenant.",
        )

    allowed_fields = {"stage", "amount_eur", "probability", "notes"}
    updated = False
    for field in allowed_fields:
        if field in payload_data and payload_data[field] is not None:
            value = payload_data[field]
            if field == "amount_eur":
                value = float(value)
                if value < 0:
                    raise HTTPException(
                        status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                        detail="'amount_eur' debe ser mayor o igual a 0.",
                    )
            elif field == "probability":
                value = int(value)
                if value < 0 or value > 100:
                    raise HTTPException(
                        status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                        detail="'probability' debe estar entre 0 y 100.",
                    )
            setattr(opp, field, value)
            updated = True

    if not updated:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="La acción 'update_opportunity' debe incluir al menos un campo válido (stage, amount_eur, probability, notes).",
        )

    opp.updated_at = utc_now()
    session.add(opp)
    session.flush()
    return opp.id


_ACTION_EXECUTORS = {
    "create_task": _execute_create_task,
    "create_lead": _execute_create_lead,
    "update_opportunity": _execute_update_opportunity,
}


def _run_action_execution(
    session: Session,
    action: AgentAction,
    current_user: User,
) -> int | None:
    executor = _ACTION_EXECUTORS.get(action.action_type)
    if executor is None:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Tipo de acción '{action.action_type}' no soportado para ejecución automática.",
        )

    try:
        payload_data = json.loads(action.payload_json or "{}")
    except json.JSONDecodeError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="El payload JSON de la acción es inválido.",
        ) from exc

    return executor(session, action, current_user.tenant_id, payload_data)


@router.post("/agent-actions/{action_id}/execute", response_model=AgentActionPublic)
def execute_agent_action(
    action_id: int,
    current_user: User = Depends(require_tenant_user),
    session: Session = Depends(get_session),
) -> AgentActionPublic:
    action = session.exec(
        select(AgentAction).where(
            AgentAction.id == action_id,
            AgentAction.tenant_id == current_user.tenant_id,
        )
    ).first()
    if action is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Acción de agente no encontrada.")
    if action.status != AgentActionStatus.APPROVED.value:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Solo se pueden ejecutar acciones aprobadas (estado actual: '{action.status}').",
        )

    created_entity_id = _run_action_execution(session, action, current_user)

    now = utc_now()
    action.status = AgentActionStatus.EXECUTED.value
    action.target_entity_id = created_entity_id
    action.updated_at = now
    session.add(action)

    log = ActivityLog(
        tenant_id=current_user.tenant_id,
        actor_type=ActorType.AGENT.value,
        actor_name=action.agent_name,
        user_id=current_user.id,
        model_used=action.model_used,
        action=f"execute:{action.action_type}",
        entity_type=action.target_entity_type,
        entity_id=created_entity_id,
        details_json=action.payload_json,
    )
    session.add(log)
    session.commit()
    session.refresh(action)
    return _to_public_action(action)


@router.post("/agent-actions/{action_id}/approve-and-execute", response_model=AgentActionPublic)
def approve_and_execute_agent_action(
    action_id: int,
    review: Optional[AgentActionReview] = None,
    current_user: User = Depends(require_tenant_user),
    session: Session = Depends(get_session),
) -> AgentActionPublic:
    action = session.exec(
        select(AgentAction).where(
            AgentAction.id == action_id,
            AgentAction.tenant_id == current_user.tenant_id,
        )
    ).first()
    if action is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Acción de agente no encontrada.")
    if action.status != AgentActionStatus.PENDING_APPROVAL.value:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"La acción está en estado '{action.status}' y no puede aprobarse y ejecutarse.",
        )

    now = utc_now()
    review_note = review.review_note if review else None

    try:
        created_entity_id = _run_action_execution(session, action, current_user)
    except Exception:
        session.rollback()
        raise

    action.status = AgentActionStatus.EXECUTED.value
    action.reviewed_by_user_id = current_user.id
    action.reviewed_at = now
    action.review_note = review_note
    action.target_entity_id = created_entity_id
    action.updated_at = now
    session.add(action)

    approve_log = ActivityLog(
        tenant_id=current_user.tenant_id,
        actor_type=ActorType.HUMAN.value,
        actor_name=current_user.full_name,
        user_id=current_user.id,
        model_used=None,
        action="approve:agent_action",
        entity_type="agent_action",
        entity_id=action.id,
        details_json=json.dumps({"review_note": review_note}, ensure_ascii=False),
    )
    exec_log = ActivityLog(
        tenant_id=current_user.tenant_id,
        actor_type=ActorType.AGENT.value,
        actor_name=action.agent_name,
        user_id=current_user.id,
        model_used=action.model_used,
        action=f"execute:{action.action_type}",
        entity_type=action.target_entity_type,
        entity_id=created_entity_id,
        details_json=action.payload_json,
    )
    session.add(approve_log)
    session.add(exec_log)
    session.commit()
    session.refresh(action)
    return _to_public_action(action)
