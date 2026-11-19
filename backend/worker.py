"""Worker base de FidusOS v2 (heartbeat en Redis + cola fidus:jobs para tareas asíncronas)."""

from __future__ import annotations

import json
import logging
import os
import signal
import threading
import time
from datetime import datetime, timezone
from typing import Any, Callable

import redis
from sqlalchemy import text
from sqlalchemy.engine import Engine

from core.config import Settings, get_settings
from core.database import get_engine

logger = logging.getLogger("fidus.worker")

HEARTBEAT_KEY = "fidus:worker:heartbeat"
JOBS_QUEUE_KEY = "fidus:jobs"
DEFAULT_BLPOP_TIMEOUT_SECONDS = 2
DEFAULT_HEARTBEAT_INTERVAL_SECONDS = 15
DEFAULT_HEARTBEAT_TTL_SECONDS = 45

JobHandler = Callable[[dict[str, Any], Engine, Any], dict[str, Any]]


def _handle_ping_job(payload: dict[str, Any], _engine: Engine, _redis_client: Any) -> dict[str, Any]:
    return {"status": "pong", "echo": payload.get("echo")}


DEFAULT_JOB_HANDLERS: dict[str, JobHandler] = {
    "ping": _handle_ping_job,
}


def wait_for_database(
    engine: Engine,
    *,
    max_attempts: int = 10,
    base_delay: float = 1.0,
    sleep_fn: Callable[[float], None] = time.sleep,
) -> None:
    """Verifica la conexión a la base de datos (SQLite / PostgreSQL) con backoff exponencial."""
    last_error: Exception | None = None
    for attempt in range(1, max_attempts + 1):
        try:
            with engine.connect() as conn:
                conn.execute(text("SELECT 1"))
            logger.info("Conexión a base de datos verificada (intento %d/%d).", attempt, max_attempts)
            return
        except Exception as exc:
            last_error = exc
            if attempt >= max_attempts:
                break
            delay = min(base_delay * (2 ** (attempt - 1)), 15.0)
            logger.warning(
                "Base de datos no disponible (intento %d/%d): %s. Reintentando en %.1fs...",
                attempt,
                max_attempts,
                exc,
                delay,
            )
            sleep_fn(delay)

    raise RuntimeError(f"No se pudo conectar a la base de datos tras {max_attempts} intentos: {last_error}")


def wait_for_redis(
    redis_client: Any,
    *,
    max_attempts: int = 10,
    base_delay: float = 1.0,
    sleep_fn: Callable[[float], None] = time.sleep,
) -> None:
    """Verifica la conexión a Redis mediante PING con backoff exponencial."""
    last_error: Exception | None = None
    for attempt in range(1, max_attempts + 1):
        try:
            if redis_client.ping():
                logger.info("Conexión a Redis verificada (intento %d/%d).", attempt, max_attempts)
                return
            raise RuntimeError("Redis respondió falsy a PING.")
        except Exception as exc:
            last_error = exc
            if attempt >= max_attempts:
                break
            delay = min(base_delay * (2 ** (attempt - 1)), 15.0)
            logger.warning(
                "Redis no disponible (intento %d/%d): %s. Reintentando en %.1fs...",
                attempt,
                max_attempts,
                exc,
                delay,
            )
            sleep_fn(delay)

    raise RuntimeError(f"No se pudo conectar a Redis tras {max_attempts} intentos: {last_error}")


def publish_heartbeat(
    redis_client: Any,
    *,
    environment: str,
    processed_jobs: int = 0,
    ttl_seconds: int = DEFAULT_HEARTBEAT_TTL_SECONDS,
) -> dict[str, Any]:
    """Publica el estado de salud del worker en Redis con TTL para monitorización."""
    payload = {
        "status": "running",
        "pid": os.getpid(),
        "environment": environment,
        "processed_jobs": processed_jobs,
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }
    redis_client.set(HEARTBEAT_KEY, json.dumps(payload), ex=ttl_seconds)
    return payload


def process_raw_job(
    raw_job: str | bytes,
    *,
    engine: Engine,
    redis_client: Any,
    handlers: dict[str, JobHandler] | None = None,
) -> bool:
    """Deserializa y despacha un trabajo de la cola fidus:jobs sin abortar el bucle ante errores."""
    if isinstance(raw_job, bytes):
        raw_job = raw_job.decode("utf-8", errors="replace")

    try:
        job_data = json.loads(raw_job)
    except json.JSONDecodeError as exc:
        logger.error("Job ignorado en '%s': JSON inválido (%s).", JOBS_QUEUE_KEY, exc)
        return False

    if not isinstance(job_data, dict):
        logger.error("Job ignorado en '%s': se esperaba un objeto JSON.", JOBS_QUEUE_KEY)
        return False

    job_type = str(job_data.get("job_type") or job_data.get("type") or "").strip()
    if not job_type:
        logger.error("Job ignorado en '%s': falta el campo 'job_type'.", JOBS_QUEUE_KEY)
        return False

    registry = handlers if handlers is not None else DEFAULT_JOB_HANDLERS
    handler = registry.get(job_type)
    if handler is None:
        logger.warning(
            "Tipo de job '%s' recibido sin handler registrado (reservado para workers proactivos Hito 5).",
            job_type,
        )
        return False

    payload = job_data.get("payload") if isinstance(job_data.get("payload"), dict) else {}
    try:
        result = handler(payload, engine, redis_client)
        logger.info("Job '%s' procesado correctamente: %s", job_type, result)
        return True
    except Exception:
        logger.exception("Error ejecutando el job '%s'.", job_type)
        return False


class WorkerRunner:
    """Orquestador del ciclo de vida del worker con parada limpia ante SIGTERM/SIGINT."""

    def __init__(
        self,
        *,
        settings: Settings | None = None,
        engine: Engine | None = None,
        redis_client: Any | None = None,
        handlers: dict[str, JobHandler] | None = None,
        blpop_timeout: int = DEFAULT_BLPOP_TIMEOUT_SECONDS,
        heartbeat_interval: float = DEFAULT_HEARTBEAT_INTERVAL_SECONDS,
    ) -> None:
        self.settings = settings or get_settings()
        self.engine = engine or get_engine(self.settings.DATABASE_URL)
        self.redis_client = redis_client or redis.from_url(self.settings.REDIS_URL, decode_responses=True)
        self.handlers = handlers if handlers is not None else dict(DEFAULT_JOB_HANDLERS)
        self.blpop_timeout = blpop_timeout
        self.heartbeat_interval = heartbeat_interval
        self.stop_event = threading.Event()
        self.processed_jobs = 0

    def request_stop(self, *_args: Any) -> None:
        logger.info("Señal de parada recibida. Finalizando worker limpiamente...")
        self.stop_event.set()

    def run_once(self) -> bool:
        """Ejecuta una iteración BLPOP sobre fidus:jobs. Devuelve True si procesó un job."""
        item = self.redis_client.blpop(JOBS_QUEUE_KEY, timeout=self.blpop_timeout)
        if not item:
            return False

        # redis-py devuelve una tupla (key, value)
        raw_value = item[1] if isinstance(item, (tuple, list)) and len(item) >= 2 else item
        ok = process_raw_job(
            raw_value,
            engine=self.engine,
            redis_client=self.redis_client,
            handlers=self.handlers,
        )
        if ok:
            self.processed_jobs += 1
        return ok

    def run(
        self,
        *,
        max_iterations: int | None = None,
        max_connect_attempts: int = 10,
        base_delay: float = 1.0,
    ) -> None:
        self.settings.validate_runtime_security()
        wait_for_database(self.engine, max_attempts=max_connect_attempts, base_delay=base_delay)
        wait_for_redis(self.redis_client, max_attempts=max_connect_attempts, base_delay=base_delay)

        last_heartbeat = 0.0
        iterations = 0

        logger.info(
            "FidusOS v2 Worker iniciado (env=%s, cola=%s).",
            self.settings.ENVIRONMENT,
            JOBS_QUEUE_KEY,
        )

        while not self.stop_event.is_set():
            now = time.monotonic()
            if now - last_heartbeat >= self.heartbeat_interval:
                publish_heartbeat(
                    self.redis_client,
                    environment=self.settings.ENVIRONMENT,
                    processed_jobs=self.processed_jobs,
                )
                last_heartbeat = now

            try:
                self.run_once()
            except redis.RedisError as exc:
                logger.warning("Error transitorio leyendo de Redis: %s", exc)
                if not self.stop_event.is_set():
                    time.sleep(1.0)

            iterations += 1
            if max_iterations is not None and iterations >= max_iterations:
                break

        logger.info("Worker detenido limpiamente (jobs procesados=%d).", self.processed_jobs)


def main() -> None:
    logging.basicConfig(
        level=os.environ.get("LOG_LEVEL", "INFO"),
        format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    )
    runner = WorkerRunner()
    signal.signal(signal.SIGTERM, runner.request_stop)
    signal.signal(signal.SIGINT, runner.request_stop)
    runner.run()


if __name__ == "__main__":
    main()
