"""Modelos SQLModel de FidusOS v2 (multi-tenant, mercado español, BYOK y Agent-First)."""

from __future__ import annotations

from datetime import datetime, timezone
from enum import Enum
from typing import Optional

from sqlmodel import Field, SQLModel


def utc_now() -> datetime:
    """Devuelve timestamp UTC naive consistente entre SQLite y PostgreSQL sin avisos deprecated."""
    return datetime.now(timezone.utc).replace(tzinfo=None)


class ActorType(str, Enum):
    HUMAN = "human"
    AGENT = "agent"


class AIProviderType(str, Enum):
    OPENAI = "openai"
    ANTHROPIC = "anthropic"
    GEMINI = "gemini"
    OPENROUTER = "openrouter"
    MISTRAL = "mistral"
    OLLAMA = "ollama"
    OPENAI_COMPATIBLE = "openai_compatible"


class AgentActionStatus(str, Enum):
    PENDING_APPROVAL = "pending_approval"
    APPROVED = "approved"
    REJECTED = "rejected"
    EXECUTED = "executed"


class Tenant(SQLModel, table=True):
    __tablename__ = "tenant"

    id: Optional[int] = Field(default=None, primary_key=True)
    name: str = Field(index=True, max_length=200)
    slug: str = Field(unique=True, index=True, max_length=100)
    cif: Optional[str] = Field(default=None, index=True, max_length=20)
    razon_social: Optional[str] = Field(default=None, max_length=255)
    direccion_fiscal: Optional[str] = Field(default=None, max_length=500)
    plan: str = Field(default="open_core", max_length=50)
    is_active: bool = Field(default=True, index=True)
    created_at: datetime = Field(default_factory=utc_now)
    updated_at: datetime = Field(default_factory=utc_now)


class User(SQLModel, table=True):
    __tablename__ = "user"

    id: Optional[int] = Field(default=None, primary_key=True)
    tenant_id: int = Field(foreign_key="tenant.id", index=True)
    email: str = Field(unique=True, index=True, max_length=255)
    full_name: str = Field(max_length=200)
    hashed_password: str = Field(max_length=255)
    role: str = Field(default="admin", max_length=50)
    is_active: bool = Field(default=True, index=True)
    created_at: datetime = Field(default_factory=utc_now)


class Organization(SQLModel, table=True):
    __tablename__ = "organization"

    id: Optional[int] = Field(default=None, primary_key=True)
    tenant_id: int = Field(foreign_key="tenant.id", index=True)
    name: str = Field(index=True, max_length=200)
    cif: Optional[str] = Field(default=None, index=True, max_length=20)
    razon_social: Optional[str] = Field(default=None, max_length=255)
    direccion_fiscal: Optional[str] = Field(default=None, max_length=500)
    sector: Optional[str] = Field(default=None, max_length=120)
    website: Optional[str] = Field(default=None, max_length=255)
    phone: Optional[str] = Field(default=None, max_length=50)
    email: Optional[str] = Field(default=None, max_length=255)
    notes: Optional[str] = Field(default=None)
    created_at: datetime = Field(default_factory=utc_now)
    updated_at: datetime = Field(default_factory=utc_now)


class Client(SQLModel, table=True):
    __tablename__ = "client"

    id: Optional[int] = Field(default=None, primary_key=True)
    tenant_id: int = Field(foreign_key="tenant.id", index=True)
    organization_id: Optional[int] = Field(default=None, foreign_key="organization.id", index=True)
    full_name: str = Field(index=True, max_length=200)
    email: Optional[str] = Field(default=None, index=True, max_length=255)
    phone: Optional[str] = Field(default=None, max_length=50)
    job_title: Optional[str] = Field(default=None, max_length=120)
    rgpd_consent: bool = Field(default=False)
    rgpd_consent_date: Optional[datetime] = Field(default=None)
    notes: Optional[str] = Field(default=None)
    created_at: datetime = Field(default_factory=utc_now)
    updated_at: datetime = Field(default_factory=utc_now)


class Lead(SQLModel, table=True):
    __tablename__ = "lead"

    id: Optional[int] = Field(default=None, primary_key=True)
    tenant_id: int = Field(foreign_key="tenant.id", index=True)
    organization_id: Optional[int] = Field(default=None, foreign_key="organization.id", index=True)
    full_name: str = Field(index=True, max_length=200)
    email: Optional[str] = Field(default=None, index=True, max_length=255)
    phone: Optional[str] = Field(default=None, max_length=50)
    company_name: Optional[str] = Field(default=None, max_length=200)
    source: Optional[str] = Field(default=None, max_length=100)
    status: str = Field(default="new", index=True, max_length=50)
    score: Optional[int] = Field(default=None)
    notes: Optional[str] = Field(default=None)
    created_at: datetime = Field(default_factory=utc_now)
    updated_at: datetime = Field(default_factory=utc_now)


class Opportunity(SQLModel, table=True):
    __tablename__ = "opportunity"

    id: Optional[int] = Field(default=None, primary_key=True)
    tenant_id: int = Field(foreign_key="tenant.id", index=True)
    organization_id: Optional[int] = Field(default=None, foreign_key="organization.id", index=True)
    client_id: Optional[int] = Field(default=None, foreign_key="client.id", index=True)
    lead_id: Optional[int] = Field(default=None, foreign_key="lead.id", index=True)
    title: str = Field(index=True, max_length=255)
    amount_eur: float = Field(default=0.0)
    currency: str = Field(default="EUR", max_length=10)
    stage: str = Field(default="qualification", index=True, max_length=50)
    probability: int = Field(default=20)
    expected_close_date: Optional[datetime] = Field(default=None)
    notes: Optional[str] = Field(default=None)
    created_at: datetime = Field(default_factory=utc_now)
    updated_at: datetime = Field(default_factory=utc_now)


class Task(SQLModel, table=True):
    __tablename__ = "task"

    id: Optional[int] = Field(default=None, primary_key=True)
    tenant_id: int = Field(foreign_key="tenant.id", index=True)
    assigned_user_id: Optional[int] = Field(default=None, foreign_key="user.id", index=True)
    organization_id: Optional[int] = Field(default=None, foreign_key="organization.id", index=True)
    client_id: Optional[int] = Field(default=None, foreign_key="client.id", index=True)
    opportunity_id: Optional[int] = Field(default=None, foreign_key="opportunity.id", index=True)
    title: str = Field(max_length=255)
    description: Optional[str] = Field(default=None)
    status: str = Field(default="pending", index=True, max_length=50)
    priority: str = Field(default="medium", max_length=30)
    due_date: Optional[datetime] = Field(default=None)
    created_at: datetime = Field(default_factory=utc_now)
    updated_at: datetime = Field(default_factory=utc_now)


class ActivityLog(SQLModel, table=True):
    __tablename__ = "activity_log"

    id: Optional[int] = Field(default=None, primary_key=True)
    tenant_id: int = Field(foreign_key="tenant.id", index=True)
    actor_type: str = Field(default=ActorType.HUMAN.value, index=True, max_length=20)
    actor_name: str = Field(max_length=200)
    user_id: Optional[int] = Field(default=None, foreign_key="user.id", index=True)
    model_used: Optional[str] = Field(default=None, max_length=150)
    action: str = Field(max_length=120)
    entity_type: str = Field(index=True, max_length=80)
    entity_id: Optional[int] = Field(default=None, index=True)
    details_json: Optional[str] = Field(default=None)
    created_at: datetime = Field(default_factory=utc_now)


class AIProviderConfig(SQLModel, table=True):
    __tablename__ = "ai_provider_config"

    id: Optional[int] = Field(default=None, primary_key=True)
    tenant_id: int = Field(foreign_key="tenant.id", index=True)
    provider: str = Field(index=True, max_length=50)
    model_name: str = Field(max_length=150)
    base_url: Optional[str] = Field(default=None, max_length=500)
    api_key_encrypted: Optional[str] = Field(default=None)
    is_default: bool = Field(default=False, index=True)
    is_active: bool = Field(default=True, index=True)
    created_at: datetime = Field(default_factory=utc_now)
    updated_at: datetime = Field(default_factory=utc_now)


class AgentApiKey(SQLModel, table=True):
    __tablename__ = "agent_api_key"

    id: Optional[int] = Field(default=None, primary_key=True)
    tenant_id: int = Field(foreign_key="tenant.id", index=True)
    name: str = Field(max_length=150)
    key_prefix: str = Field(index=True, max_length=32)
    key_hash: str = Field(unique=True, index=True, max_length=128)
    scopes: str = Field(default="crm:read,actions:propose", max_length=500)
    is_active: bool = Field(default=True, index=True)
    last_used_at: Optional[datetime] = Field(default=None)
    created_at: datetime = Field(default_factory=utc_now)


class AgentAction(SQLModel, table=True):
    __tablename__ = "agent_action"

    id: Optional[int] = Field(default=None, primary_key=True)
    tenant_id: int = Field(foreign_key="tenant.id", index=True)
    agent_name: str = Field(max_length=150)
    model_used: Optional[str] = Field(default=None, max_length=150)
    action_type: str = Field(index=True, max_length=100)
    target_entity_type: str = Field(max_length=80)
    target_entity_id: Optional[int] = Field(default=None, index=True)
    payload_json: str = Field(default="{}")
    status: str = Field(default=AgentActionStatus.PENDING_APPROVAL.value, index=True, max_length=30)
    reviewed_by_user_id: Optional[int] = Field(default=None, foreign_key="user.id", index=True)
    reviewed_at: Optional[datetime] = Field(default=None)
    review_note: Optional[str] = Field(default=None, max_length=500)
    created_at: datetime = Field(default_factory=utc_now)
    updated_at: datetime = Field(default_factory=utc_now)
