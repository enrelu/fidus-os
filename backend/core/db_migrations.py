"""Utilidades programáticas para ejecutar y verificar migraciones Alembic."""

from __future__ import annotations

from pathlib import Path

from alembic import command
from alembic.config import Config

from core.config import BACKEND_DIR, get_settings


def get_alembic_config(database_url: str | None = None) -> Config:
    ini_path = BACKEND_DIR / "alembic.ini"
    cfg = Config(str(ini_path))
    cfg.set_main_option("script_location", str(BACKEND_DIR / "migrations"))
    cfg.set_main_option("sqlalchemy.url", database_url or get_settings().DATABASE_URL)
    return cfg


def run_migrations_upgrade(revision: str = "head", database_url: str | None = None) -> None:
    """Aplica las migraciones de Alembic hasta la revisión indicada."""
    cfg = get_alembic_config(database_url=database_url)
    command.upgrade(cfg, revision)


def run_migrations_current(database_url: str | None = None) -> None:
    """Muestra la revisión actual aplicada en la base de datos."""
    cfg = get_alembic_config(database_url=database_url)
    command.current(cfg)
