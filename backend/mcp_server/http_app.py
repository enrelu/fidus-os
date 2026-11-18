"""Transporte Streamable HTTP autenticado para montar el servidor MCP en FastAPI (/mcp)."""

from __future__ import annotations

from typing import Optional

from mcp.server.streamable_http_manager import StreamableHTTPSessionManager
from starlette.datastructures import Headers
from starlette.responses import JSONResponse
from starlette.types import Receive, Scope, Send

from mcp_server.context import (
    MCPAuthError,
    authenticate_agent_token,
    reset_current_mcp_agent,
    set_current_mcp_agent,
)
from mcp_server.tools import mcp


def _extract_agent_token(headers: Headers) -> Optional[str]:
    auth_header = headers.get("authorization")
    if auth_header:
        parts = auth_header.strip().split(" ", 1)
        if len(parts) == 2 and parts[0].lower() == "bearer" and parts[1].strip():
            return parts[1].strip()
    x_key = headers.get("x-agent-api-key")
    if x_key and x_key.strip():
        return x_key.strip()
    return None


class AuthenticatedMCPASGIApp:
    """Aplicación ASGI que autentica AgentApiKey antes de delegar al StreamableHTTPSessionManager."""

    def __init__(self, session_manager: StreamableHTTPSessionManager) -> None:
        self.session_manager = session_manager

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            return

        headers = Headers(scope=scope)
        raw_token = _extract_agent_token(headers)
        app = scope.get("app")

        try:
            agent_ctx = authenticate_agent_token(raw_token, app=app)
        except MCPAuthError as exc:
            response = JSONResponse({"detail": exc.detail}, status_code=exc.status_code)
            await response(scope, receive, send)
            return

        ctx_token = set_current_mcp_agent(agent_ctx)
        try:
            await self.session_manager.handle_request(scope, receive, send)
        finally:
            reset_current_mcp_agent(ctx_token)


def create_mcp_http_mount() -> tuple[StreamableHTTPSessionManager, AuthenticatedMCPASGIApp]:
    """Crea una instancia limpia de StreamableHTTPSessionManager y su ASGI app autenticada."""
    session_manager = StreamableHTTPSessionManager(
        app=mcp._mcp_server,
        event_store=None,
        json_response=True,
        stateless=True,
    )
    return session_manager, AuthenticatedMCPASGIApp(session_manager)
