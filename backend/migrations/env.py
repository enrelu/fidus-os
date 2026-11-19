"""Entorno de migraciones Alembic para FidusOS v2."""

from __future__ import annotations

from logging.config import fileConfig
import os

from alembic import context
from sqlalchemy import engine_from_config, pool
from sqlmodel import SQLModel

import core.models  # noqa: F401 - registra todas las tablas en SQLModel.metadata
from core.config import get_settings
from core.database import normalize_database_url

config = context.config

if config.config_file_name is not None:
    fileConfig(config.config_file_name)


def _resolve_sqlalchemy_url() -> str:
    ini_url = (config.get_main_option("sqlalchemy.url") or "").strip()
    env_url = os.environ.get("DATABASE_URL", "").strip()
    if not ini_url or (env_url and ini_url == "sqlite:///./fidus_dev.db"):
        resolved = env_url or get_settings().DATABASE_URL
    else:
        resolved = ini_url
    normalized = normalize_database_url(resolved)
    config.set_main_option("sqlalchemy.url", normalized)
    return normalized


_resolved_url = _resolve_sqlalchemy_url()
target_metadata = SQLModel.metadata


def run_migrations_offline() -> None:
    url = _resolved_url
    context.configure(
        url=url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
        render_as_batch=url.startswith("sqlite"),
    )

    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    url = _resolved_url
    configuration = config.get_section(config.config_ini_section, {})
    configuration["sqlalchemy.url"] = url

    connectable = engine_from_config(
        configuration,
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )

    with connectable.connect() as connection:
        context.configure(
            connection=connection,
            target_metadata=target_metadata,
            render_as_batch=url.startswith("sqlite"),
        )

        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
