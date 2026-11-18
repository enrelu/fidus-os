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


@asynccontextmanager
async def lifespan(_app: FastAPI):
    settings = get_settings()
    if settings.ENVIRONMENT.lower() == "development":
        init_db()
    yield


def create_app() -> FastAPI:
    settings = get_settings()
    app = FastAPI(
        title="FidusOS v2 API",
        description="CRM AI-Ready / Agent-First Open-Core orientado a pymes y empresas medianas en España.",
        version="2.0.0-alpha.1",
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
    return app


app = create_app()
