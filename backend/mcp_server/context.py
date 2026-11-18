"""Contexto multi-tenant y autenticación por AgentApiKey para el servidor MCP."""

from __future__ import annotations

from contextlib import contextmanager
from contextvars import ContextVar
from dataclasses import dataclass
from typing import Any, Generator, Optional

from sqlmodel import Session, select

from core.crypto import hash_api_key
from core.database import get_session
from core.models import AgentApiKey, Tenant, utc_now


class MCPAuthError(Exception):
    """Error de autenticación o autorización MCP con código HTTP asociado."""

    def __init__(self, status_code: int, detail: str) -> None:
        super().__init__(detail)
        self.status_code = status_code
        self.detail = detail


@dataclass
class MCPAgentContext:
    tenant_id: int
    agent_key_id: int
    agent_name: str
    scopes: set[str]
    app: Any = None


_current_mcp_agent: ContextVar[Optional[MCPAgentContext]] = ContextVar(
    "fidus_current_mcp_agent",
    default=None,
)


def set_current_mcp_agent(ctx: Optional[MCPAgentContext]):
    return _current_mcp_agent.set(ctx)


def reset_current_mcp_agent(token) -> None:
    _current_mcp_agent.reset(token)


def get_current_mcp_agent() -> MCPAgentContext:
    ctx = _current_mcp_agent.get()
    if ctx is None:
        raise PermissionError("Contexto de agente MCP no autenticado.")
    return ctx


def require_mcp_scope(required_scope: str) -> MCPAgentContext:
    ctx = get_current_mcp_agent()
    if required_scope not in ctx.scopes:
        raise PermissionError(
            f"Scope insuficiente: la clave de agente '{ctx.agent_name}' requiere el permiso '{required_scope}'."
        )
    return ctx


@contextmanager
def open_mcp_db_session(app: Any = None) -> Generator[Session, None, None]:
    provider = get_session
    if app is not None and hasattr(app, "dependency_overrides"):
        provider = app.dependency_overrides.get(get_session, get_session)
    gen = provider()
    db_session = next(gen)
    try:
        yield db_session
    finally:
        try:
            next(gen)
        except StopIteration:
            pass
        finally:
            gen.close()


def authenticate_agent_token(raw_token: Optional[str], *, app: Any = None) -> MCPAgentContext:
    """Valida una AgentApiKey, comprueba tenant activo, actualiza last_used_at y devuelve MCPAgentContext."""
    if not raw_token or not raw_token.strip():
        raise MCPAuthError(
            401,
            "Autenticación MCP requerida: envía 'Authorization: Bearer fos_ag_...' o cabecera 'X-Agent-Api-Key'.",
        )

    hashed = hash_api_key(raw_token.strip())
    with open_mcp_db_session(app=app) as session:
        api_key = session.exec(
            select(AgentApiKey).where(AgentApiKey.key_hash == hashed)
        ).first()

        if api_key is None or not api_key.is_active:
            raise MCPAuthError(401, "Clave de agente MCP inválida o revocada.")

        tenant = session.get(Tenant, api_key.tenant_id)
        if tenant is None or not tenant.is_active:
            raise MCPAuthError(403, "El tenant asociado a la clave MCP se encuentra inactivo.")

        api_key.last_used_at = utc_now()
        session.add(api_key)
        session.commit()
        session.refresh(api_key)

        scopes = {s.strip() for s in api_key.scopes.split(",") if s.strip()}
        return MCPAgentContext(
            tenant_id=api_key.tenant_id,
            agent_key_id=api_key.id,  # type: ignore[arg-type]
            agent_name=api_key.name,
            scopes=scopes,
            app=app,
        )
