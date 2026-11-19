"""Dispatcher híbrido Redis + Fallback local (FastAPI BackgroundTasks) para jobs proactivos."""

from __future__ import annotations

import asyncio
import json
import logging
from typing import Any, Optional

import redis
from fastapi import BackgroundTasks
from sqlalchemy.engine import Engine
from sqlmodel import Session

from ai.gateway import AIGateway
from ai.proactive import (
    ingest_free_text_for_tenant,
    qualify_lead_for_tenant,
    run_commercial_radar_for_tenant,
)
from core.config import get_settings
from core.database import get_engine

logger = logging.getLogger("fidus.dispatcher")

JOBS_QUEUE_KEY = "fidus:jobs"
HEARTBEAT_KEY = "fidus:worker:heartbeat"


def get_worker_heartbeat(redis_url: Optional[str] = None) -> tuple[bool, Optional[str]]:
    """Consulta de forma rápida si el worker Redis ha publicado heartbeat recientemente."""
    settings = get_settings()
    if settings.ENVIRONMENT.lower() == "test":
        return False, None

    url = redis_url or settings.REDIS_URL
    try:
        client = redis.from_url(
            url,
            socket_connect_timeout=0.25,
            socket_timeout=0.25,
            decode_responses=True,
        )
        raw = client.get(HEARTBEAT_KEY)
        if not raw:
            return False, None
        data = json.loads(raw)
        return True, data.get("timestamp")
    except Exception:
        return False, None


async def execute_proactive_job_async(
    job_type: str,
    payload: dict[str, Any],
    *,
    engine: Optional[Engine] = None,
    gateway: Optional[AIGateway] = None,
) -> dict[str, Any]:
    """Ejecuta un job proactivo en proceso (usado como fallback local o desde tests)."""
    target_engine = engine or get_engine()
    try:
        with Session(target_engine) as session:
            if job_type == "proactive.qualify_lead":
                tenant_id = int(payload["tenant_id"])
                lead_id = int(payload["lead_id"])
                return await qualify_lead_for_tenant(
                    session,
                    tenant_id,
                    lead_id,
                    gateway=gateway,
                )
            if job_type == "proactive.commercial_radar":
                tenant_id = int(payload["tenant_id"])
                stale_days = int(payload.get("stale_days", 7))
                return await run_commercial_radar_for_tenant(
                    session,
                    tenant_id,
                    stale_days=stale_days,
                    gateway=gateway,
                )
            if job_type == "proactive.ingest_text":
                tenant_id = int(payload["tenant_id"])
                text = str(payload.get("text", ""))
                org_id = payload.get("organization_id")
                return await ingest_free_text_for_tenant(
                    session,
                    tenant_id,
                    text,
                    organization_id=int(org_id) if org_id is not None else None,
                    gateway=gateway,
                )
            logger.warning("Job proactivo desconocido ignorado en ejecución local: %s", job_type)
            return {"status": "ignored", "job_type": job_type}
    except Exception:
        logger.exception("Error ejecutando job proactivo local '%s'.", job_type)
        return {"status": "error", "job_type": job_type}


def enqueue_proactive_job(
    job_type: str,
    payload: dict[str, Any],
    *,
    background_tasks: Optional[BackgroundTasks] = None,
    engine: Optional[Engine] = None,
    gateway: Optional[AIGateway] = None,
) -> str:
    """Encola un job en Redis si está disponible; en desarrollo usa BackgroundTasks como fallback."""
    settings = get_settings()
    use_local_only = settings.ENVIRONMENT.lower() == "test" or (
        gateway is not None and gateway.transport is not None
    )

    if not use_local_only:
        try:
            client = redis.from_url(
                settings.REDIS_URL,
                socket_connect_timeout=0.25,
                socket_timeout=0.25,
                decode_responses=True,
            )
            if client.ping():
                message = json.dumps({"job_type": job_type, "payload": payload}, ensure_ascii=False)
                client.rpush(JOBS_QUEUE_KEY, message)
                return "redis"
        except Exception as exc:
            if settings.ENVIRONMENT.lower() == "production":
                logger.warning("Redis no disponible en producción para encolar '%s': %s", job_type, exc)
                return "unavailable"
            logger.debug("Redis no disponible en desarrollo (%s); usando fallback local.", exc)

    if settings.ENVIRONMENT.lower() == "production":
        return "unavailable"

    if background_tasks is not None:
        background_tasks.add_task(
            execute_proactive_job_async,
            job_type,
            payload,
            engine=engine,
            gateway=gateway,
        )
        return "local_background"

    try:
        loop = asyncio.get_running_loop()
        loop.create_task(
            execute_proactive_job_async(
                job_type,
                payload,
                engine=engine,
                gateway=gateway,
            )
        )
    except RuntimeError:
        asyncio.run(
            execute_proactive_job_async(
                job_type,
                payload,
                engine=engine,
                gateway=gateway,
            )
        )
    return "local_background"
