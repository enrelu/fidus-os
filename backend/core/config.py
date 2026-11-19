"""Configuración centralizada de FidusOS v2 mediante variables de entorno."""

from functools import lru_cache
from pathlib import Path
import secrets
from cryptography.fernet import Fernet
from pydantic_settings import BaseSettings, SettingsConfigDict

_EPHEMERAL_DEV_JWT_SECRET: str | None = None

BACKEND_DIR = Path(__file__).resolve().parent.parent

_PLACEHOLDER_PREFIXES = ("CAMBIAR_", "CHANGE_ME", "GENERAR_", "<")


def is_placeholder_secret(value: str) -> bool:
    cleaned = value.strip()
    if not cleaned:
        return True
    upper = cleaned.upper()
    return any(upper.startswith(prefix) for prefix in _PLACEHOLDER_PREFIXES)


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
    PROACTIVE_RADAR_INTERVAL_SECONDS: int = 3600

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
        if key and not is_placeholder_secret(key):
            return key
        if self.ENVIRONMENT.lower() == "production":
            raise RuntimeError(
                "JWT_SECRET_KEY no configurada o contiene un placeholder en entorno de producción. "
                "Genera un secreto válido con: python -c \"import secrets; print(secrets.token_urlsafe(48))\""
            )
        if _EPHEMERAL_DEV_JWT_SECRET is None:
            _EPHEMERAL_DEV_JWT_SECRET = secrets.token_urlsafe(48)
        return _EPHEMERAL_DEV_JWT_SECRET

    def validate_runtime_security(self) -> None:
        """Valida en producción que JWT_SECRET_KEY y ENCRYPTION_KEY estén configuradas y sean válidas."""
        if self.ENVIRONMENT.lower() != "production":
            return

        jwt_key = self.JWT_SECRET_KEY.strip()
        if is_placeholder_secret(jwt_key) or len(jwt_key) < 32:
            raise RuntimeError(
                "Configuración insegura en producción: JWT_SECRET_KEY es obligatoria (mínimo 32 caracteres y sin placeholders). "
                "Copia .env.example a .env y genera una clave con: python -c \"import secrets; print(secrets.token_urlsafe(48))\""
            )

        enc_key = self.ENCRYPTION_KEY.strip()
        if is_placeholder_secret(enc_key):
            raise RuntimeError(
                "Configuración insegura en producción: ENCRYPTION_KEY es obligatoria y no puede usar un placeholder. "
                "Genera una clave Fernet con: python -c \"from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())\""
            )
        try:
            Fernet(enc_key.encode("utf-8"))
        except Exception as exc:
            raise RuntimeError(
                "Configuración insegura en producción: ENCRYPTION_KEY no tiene formato Fernet válido (32 bytes en base64 urlsafe)."
            ) from exc


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    return Settings()


def reset_settings_cache() -> None:
    get_settings.cache_clear()
