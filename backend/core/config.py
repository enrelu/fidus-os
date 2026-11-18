"""Configuración centralizada de FidusOS v2 mediante variables de entorno."""

from functools import lru_cache
from pathlib import Path
import secrets
from pydantic_settings import BaseSettings, SettingsConfigDict

_EPHEMERAL_DEV_JWT_SECRET: str | None = None

BACKEND_DIR = Path(__file__).resolve().parent.parent


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=str(BACKEND_DIR / ".env"),
        env_file_encoding="utf-8",
        extra="ignore",
    )

    ENVIRONMENT: str = "development"
    PRELAUNCH_MODE: bool = False

    DATABASE_URL: str = "sqlite:///./fidus_dev.db"
    REDIS_URL: str = "redis://localhost:6379/0"

    ENCRYPTION_KEY: str = ""
    JWT_SECRET_KEY: str = ""
    JWT_ALGORITHM: str = "HS256"
    JWT_EXPIRE_MINUTES: int = 1440

    CORS_ORIGINS: str = "http://localhost:5173,http://127.0.0.1:5173"

    @property
    def cors_origins_list(self) -> list[str]:
        return [origin.strip() for origin in self.CORS_ORIGINS.split(",") if origin.strip()]

    def resolve_jwt_secret(self) -> str:
        global _EPHEMERAL_DEV_JWT_SECRET
        key = self.JWT_SECRET_KEY.strip()
        if key and not key.startswith("CAMBIAR_"):
            return key
        if self.ENVIRONMENT.lower() == "production":
            raise RuntimeError(
                "JWT_SECRET_KEY debe configurarse explícitamente en entorno de producción."
            )
        if _EPHEMERAL_DEV_JWT_SECRET is None:
            _EPHEMERAL_DEV_JWT_SECRET = secrets.token_urlsafe(48)
        return _EPHEMERAL_DEV_JWT_SECRET


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    return Settings()


def reset_settings_cache() -> None:
    get_settings.cache_clear()
