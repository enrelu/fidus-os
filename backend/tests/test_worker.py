"""Tests unitarios del worker, heartbeat Redis, cola proactiva, radar periódico y claves."""

from __future__ import annotations

import json
from datetime import timedelta
from typing import Any

import httpx
import pytest
from cryptography.fernet import Fernet
from sqlalchemy.engine import Engine
from sqlmodel import Session, SQLModel, create_engine, select

from ai.gateway import AIGateway
from core.config import Settings
from core.crypto import encrypt_secret
from core.models import AIProviderConfig, AgentAction, Lead, Opportunity, Tenant, utc_now
from worker import (
    DEFAULT_JOB_HANDLERS,
    HEARTBEAT_KEY,
    JOBS_QUEUE_KEY,
    RADAR_LAST_RUN_KEY_PREFIX,
    WorkerRunner,
    _handle_qualify_lead_job,
    process_raw_job,
    publish_heartbeat,
    wait_for_database,
    wait_for_redis,
)


class FakeRedis:
    """Cliente Redis en memoria para probar worker sin servidor Redis real."""

    def __init__(self, *, fail_pings: int = 0) -> None:
        self.store: dict[str, tuple[str, int | None]] = {}
        self.queues: dict[str, list[str]] = {}
        self.fail_pings = fail_pings
        self.ping_calls = 0

    def ping(self) -> bool:
        self.ping_calls += 1
        if self.ping_calls <= self.fail_pings:
            raise ConnectionError("Redis temporalmente inaccesible")
        return True

    def get(self, key: str) -> str | None:
        item = self.store.get(key)
        return item[0] if item is not None else None

    def set(self, key: str, value: str, ex: int | None = None) -> bool:
        self.store[key] = (value, ex)
        return True

    def rpush(self, key: str, value: str) -> int:
        self.queues.setdefault(key, []).append(value)
        return len(self.queues[key])

    def blpop(self, key: str, timeout: int = 0) -> tuple[str, str] | None:
        items = self.queues.get(key)
        if not items:
            return None
        return (key, items.pop(0))


def test_wait_for_database_and_redis_with_retry_backoff() -> None:
    engine = create_engine("sqlite://")
    wait_for_database(engine, max_attempts=2, base_delay=0.01, sleep_fn=lambda _: None)

    fake_redis = FakeRedis(fail_pings=2)
    delays: list[float] = []
    wait_for_redis(fake_redis, max_attempts=4, base_delay=0.5, sleep_fn=delays.append)

    assert fake_redis.ping_calls == 3
    assert delays == [0.5, 1.0]

    broken_redis = FakeRedis(fail_pings=5)
    with pytest.raises(RuntimeError, match="No se pudo conectar a Redis"):
        wait_for_redis(broken_redis, max_attempts=2, base_delay=0.1, sleep_fn=lambda _: None)


def test_publish_heartbeat_and_process_jobs() -> None:
    engine = create_engine("sqlite://")
    fake_redis = FakeRedis()

    hb = publish_heartbeat(fake_redis, environment="production", processed_jobs=3, ttl_seconds=45)
    assert hb["status"] == "running"
    assert hb["processed_jobs"] == 3
    stored_raw, stored_ttl = fake_redis.store[HEARTBEAT_KEY]
    assert stored_ttl == 45
    assert json.loads(stored_raw)["environment"] == "production"

    assert process_raw_job(
        json.dumps({"job_type": "ping", "payload": {"echo": "hola"}}),
        engine=engine,
        redis_client=fake_redis,
    )

    assert not process_raw_job("{json_roto", engine=engine, redis_client=fake_redis)
    assert not process_raw_job(
        json.dumps({"job_type": "unknown_job", "payload": {}}),
        engine=engine,
        redis_client=fake_redis,
    )


def test_worker_runner_consumes_queue_and_stops_cleanly() -> None:
    engine = create_engine("sqlite://")
    fake_redis = FakeRedis()
    handled: list[dict[str, Any]] = []

    def custom_handler(payload: dict[str, Any], _eng: Engine, _r: Any) -> dict[str, Any]:
        handled.append(payload)
        return {"ok": True}

    fake_redis.rpush(
        JOBS_QUEUE_KEY,
        json.dumps({"job_type": "custom_test", "payload": {"tenant_id": 1, "note": "demo"}}),
    )

    settings = Settings(ENVIRONMENT="test")
    runner = WorkerRunner(
        settings=settings,
        engine=engine,
        redis_client=fake_redis,
        handlers={"custom_test": custom_handler},
        blpop_timeout=1,
        heartbeat_interval=15,
        radar_interval=0,
    )
    runner.run(max_iterations=2, max_connect_attempts=2, base_delay=0.01)

    assert runner.processed_jobs == 1
    assert handled == [{"tenant_id": 1, "note": "demo"}]
    assert HEARTBEAT_KEY in fake_redis.store


def test_worker_dispatches_proactive_qualify_lead_and_periodic_radar() -> None:
    assert "proactive.qualify_lead" in DEFAULT_JOB_HANDLERS
    assert "proactive.commercial_radar" in DEFAULT_JOB_HANDLERS
    assert "proactive.ingest_text" in DEFAULT_JOB_HANDLERS

    engine = create_engine("sqlite://", connect_args={"check_same_thread": False})
    SQLModel.metadata.create_all(engine)

    with Session(engine) as session:
        tenant = Tenant(name="Tenant Worker S.L.", slug="tenant-worker", is_active=True)
        session.add(tenant)
        session.flush()

        cfg = AIProviderConfig(
            tenant_id=tenant.id,  # type: ignore[arg-type]
            provider="openai",
            model_name="gpt-4o-mini",
            api_key_encrypted=encrypt_secret("sk-worker-test-1234"),
            is_default=True,
            is_active=True,
        )
        session.add(cfg)

        lead = Lead(
            tenant_id=tenant.id,  # type: ignore[arg-type]
            full_name="Sofía Navarro",
            company_name="Navarro Tech",
            status="new",
        )
        session.add(lead)

        opp = Opportunity(
            tenant_id=tenant.id,  # type: ignore[arg-type]
            title="Oportunidad estancada worker",
            amount_eur=9500.0,
            stage="proposal",
            probability=45,
            updated_at=utc_now() - timedelta(days=10),
        )
        session.add(opp)
        session.commit()
        session.refresh(lead)
        session.refresh(opp)
        tenant_id = tenant.id  # type: ignore[arg-type]
        lead_id = lead.id  # type: ignore[arg-type]
        opp_id = opp.id  # type: ignore[arg-type]

    def mock_handler(request: httpx.Request) -> httpx.Response:
        body = request.content.decode("utf-8")
        if "Sofía Navarro" in body or "qualify" in body or "lead_id" in body:
            payload = {
                "score": 76,
                "summary": "Lead cualificado desde worker.",
                "suggested_task": {
                    "title": "Llamar a Sofía Navarro",
                    "description": "Seguimiento inicial.",
                    "priority": "medium",
                },
            }
        else:
            payload = {
                "briefing": "1 oportunidad estancada detectada en el ciclo periódico.",
                "proposed_actions": [
                    {
                        "action_type": "create_task",
                        "target_entity_type": "opportunity",
                        "target_entity_id": opp_id,
                        "payload": {
                            "opportunity_id": opp_id,
                            "title": "Seguimiento oportunidad estancada worker",
                            "priority": "high",
                        },
                    }
                ],
            }
        return httpx.Response(
            200,
            json={
                "model": "gpt-4o-mini",
                "choices": [{"message": {"content": json.dumps(payload, ensure_ascii=False)}}],
            },
        )

    mock_gateway = AIGateway(transport=httpx.MockTransport(mock_handler))
    fake_redis = FakeRedis()

    # 1. Despacho de job proactive.qualify_lead
    ok = process_raw_job(
        json.dumps({"job_type": "proactive.qualify_lead", "payload": {"tenant_id": tenant_id, "lead_id": lead_id}}),
        engine=engine,
        redis_client=fake_redis,
        handlers={
            "proactive.qualify_lead": lambda p, eng, rc: _handle_qualify_lead_job(p, eng, rc, gateway=mock_gateway)
        },
    )
    assert ok is True

    with Session(engine) as session:
        refreshed_lead = session.get(Lead, lead_id)
        assert refreshed_lead is not None
        assert refreshed_lead.score == 76

    # 2. Radar periódico en WorkerRunner respeta ventana Redis
    runner = WorkerRunner(
        settings=Settings(ENVIRONMENT="test", PROACTIVE_RADAR_INTERVAL_SECONDS=3600),
        engine=engine,
        redis_client=fake_redis,
        radar_interval=3600,
        gateway=mock_gateway,
    )
    first_count = runner.run_periodic_radar_tick()
    assert first_count == 1
    assert f"{RADAR_LAST_RUN_KEY_PREFIX}:{tenant_id}:last_run" in fake_redis.store

    # Segundo tick dentro del intervalo debe omitirse
    second_count = runner.run_periodic_radar_tick()
    assert second_count == 0

    with Session(engine) as session:
        actions = session.exec(select(AgentAction).where(AgentAction.tenant_id == tenant_id)).all()
        assert len(actions) == 2


def test_production_security_validation_rejects_missing_or_placeholder_keys() -> None:
    insecure_empty = Settings(ENVIRONMENT="production", ENCRYPTION_KEY="", JWT_SECRET_KEY="")
    with pytest.raises(RuntimeError, match="JWT_SECRET_KEY"):
        insecure_empty.validate_runtime_security()

    insecure_placeholder = Settings(
        ENVIRONMENT="production",
        JWT_SECRET_KEY="CAMBIAR_POR_SECRETO_JWT_ALEATORIO_Y_LARGO_12345",
        ENCRYPTION_KEY="CAMBIAR_POR_CLAVE_FERNET_DE_32_BYTES_BASE64",
    )
    with pytest.raises(RuntimeError, match="JWT_SECRET_KEY"):
        insecure_placeholder.validate_runtime_security()

    insecure_enc = Settings(
        ENVIRONMENT="production",
        JWT_SECRET_KEY="a" * 48,
        ENCRYPTION_KEY="CAMBIAR_POR_CLAVE_FERNET_DE_32_BYTES_BASE64",
    )
    with pytest.raises(RuntimeError, match="ENCRYPTION_KEY"):
        insecure_enc.validate_runtime_security()

    valid_settings = Settings(
        ENVIRONMENT="production",
        JWT_SECRET_KEY="s" * 48,
        ENCRYPTION_KEY=Fernet.generate_key().decode("utf-8"),
    )
    valid_settings.validate_runtime_security()
