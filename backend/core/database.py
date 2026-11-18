"""Gestión de motor SQLAlchemy/SQLModel y sesiones por petición."""

from __future__ import annotations

from collections.abc import Generator
from functools import lru_cache

from sqlalchemy.engine import Engine
from sqlmodel import Session, SQLModel, create_engine

from core.config import get_settings


def _build_engine(database_url: str) -> Engine:
    connect_args = {"check_same_thread": False} if database_url.startswith("sqlite") else {}
    return create_engine(database_url, echo=False, pool_pre_ping=True, connect_args=connect_args)


@lru_cache(maxsize=4)
def get_engine(database_url: str | None = None) -> Engine:
    url = database_url or get_settings().DATABASE_URL
    return _build_engine(url)


def reset_engine_cache() -> None:
    get_engine.cache_clear()


def init_db(engine: Engine | None = None) -> None:
    """Crea las tablas declaradas en SQLModel (útil en tests o arranque local rápido)."""
    import core.models  # noqa: F401

    target_engine = engine or get_engine()
    SQLModel.metadata.create_all(target_engine)


def get_session() -> Generator[Session, None, None]:
    with Session(get_engine()) as session:
        yield session
