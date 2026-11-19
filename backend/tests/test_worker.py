"""Tests unitarios del worker base, heartbeat Redis y validación de claves en producción."""

from __future__ import annotations

import json
from typing import Any

import pytest
from cryptography.fernet import Fernet
from sqlalchemy.engine import Engine
from sqlmodel import create_engine

from core.config import Settings
from worker import (
    HEARTBEAT_KEY,
    JOBS_QUEUE_KEY,
    WorkerRunner,
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

    # Job válido 'ping'
    assert process_raw_job(
        json.dumps({"job_type": "ping", "payload": {"echo": "hola"}}),
        engine=engine,
        redis_client=fake_redis,
    )

    # Job con JSON corrupto o tipo desconocido no debe tumbar el worker
    assert not process_raw_job("{json_roto", engine=engine, redis_client=fake_redis)
    assert not process_raw_job(
        json.dumps({"job_type": "future_radar_job", "payload": {}}),
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
    )
    runner.run(max_iterations=2, max_connect_attempts=2, base_delay=0.01)

    assert runner.processed_jobs == 1
    assert handled == [{"tenant_id": 1, "note": "demo"}]
    assert HEARTBEAT_KEY in fake_redis.store


def test_production_security_validation_rejects_missing_or_placeholder_keys() -> None:
    # Falta de claves en producción
    insecure_empty = Settings(ENVIRONMENT="production", ENCRYPTION_KEY="", JWT_SECRET_KEY="")
    with pytest.raises(RuntimeError, match="JWT_SECRET_KEY"):
        insecure_empty.validate_runtime_security()

    # Placeholders del .env.example en producción
    insecure_placeholder = Settings(
        ENVIRONMENT="production",
        JWT_SECRET_KEY="CAMBIAR_POR_SECRETO_JWT_ALEATORIO_Y_LARGO_12345",
        ENCRYPTION_KEY="CAMBIAR_POR_CLAVE_FERNET_DE_32_BYTES_BASE64",
    )
    with pytest.raises(RuntimeError, match="JWT_SECRET_KEY"):
        insecure_placeholder.validate_runtime_security()

    # JWT válido pero ENCRYPTION_KEY placeholder
    insecure_enc = Settings(
        ENVIRONMENT="production",
        JWT_SECRET_KEY="a" * 48,
        ENCRYPTION_KEY="CAMBIAR_POR_CLAVE_FERNET_DE_32_BYTES_BASE64",
    )
    with pytest.raises(RuntimeError, match="ENCRYPTION_KEY"):
        insecure_enc.validate_runtime_security()

    # Claves válidas en producción
    valid_settings = Settings(
        ENVIRONMENT="production",
        JWT_SECRET_KEY="s" * 48,
        ENCRYPTION_KEY=Fernet.generate_key().decode("utf-8"),
    )
    valid_settings.validate_runtime_security()
