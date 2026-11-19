"""Punto de entrada principal de la API FidusOS v2."""

from __future__ import annotations

from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from ai.routes import router as ai_router
from core.auth_routes import router as auth_router
from core.config import get_settings
from core.database import init_db
from crm.routes import router as crm_router
from mcp_server.http_app import create_mcp_http_mount


def create_app() -> FastAPI:
    settings = get_settings()
    mcp_session_manager, mcp_asgi_app = create_mcp_http_mount()

    @asynccontextmanager
    async def lifespan(_app: FastAPI):
        settings.validate_runtime_security()
        if settings.ENVIRONMENT.lower() == "development":
            init_db()
        async with mcp_session_manager.run():
            yield

    app = FastAPI(
        title="FidusOS v2 API",
        description="CRM AI-Ready / Agent-First Open-Core orientado a pymes y empresas medianas en España.",
        version="2.0.0-alpha.2",
        lifespan=lifespan,
    )

    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins_list,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    @app.get("/health", tags=["System"])
    def healthcheck() -> dict[str, str]:
        return {"status": "ok", "service": "fidus-os-v2"}

    app.include_router(auth_router)
    app.include_router(crm_router)
    app.include_router(ai_router)

    # Servidor MCP nativo (Streamable HTTP autenticado por AgentApiKey)
    app.add_route(
        "/mcp",
        mcp_asgi_app,
        methods=["GET", "POST", "DELETE", "OPTIONS"],
        include_in_schema=False,
    )
    app.add_route(
        "/mcp/",
        mcp_asgi_app,
        methods=["GET", "POST", "DELETE", "OPTIONS"],
        include_in_schema=False,
    )

    return app


app = create_app()
