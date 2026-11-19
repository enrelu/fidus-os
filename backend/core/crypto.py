"""Utilidades criptográficas para secretos BYOK por tenant y claves de agente."""

from __future__ import annotations

import hashlib
import secrets
from typing import Optional

from cryptography.fernet import Fernet, InvalidToken

from core.config import get_settings, is_placeholder_secret


class CryptoError(RuntimeError):
    """Error de configuración o descifrado criptográfico."""


def get_fernet() -> Fernet:
    raw_key = get_settings().ENCRYPTION_KEY.strip()
    if is_placeholder_secret(raw_key):
        raise CryptoError(
            "ENCRYPTION_KEY no configurada. Genera una clave Fernet válida con: "
            "python -c \"from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())\""
        )
    try:
        return Fernet(raw_key.encode("utf-8"))
    except Exception as exc:
        raise CryptoError("ENCRYPTION_KEY no tiene un formato Fernet válido (32 bytes base64).") from exc


def encrypt_secret(plain_text: str) -> str:
    if not plain_text or not plain_text.strip():
        raise ValueError("El secreto a cifrar no puede estar vacío.")
    fernet = get_fernet()
    return fernet.encrypt(plain_text.strip().encode("utf-8")).decode("utf-8")


def decrypt_secret(cipher_text: str) -> str:
    if not cipher_text:
        raise CryptoError("El texto cifrado está vacío.")
    fernet = get_fernet()
    try:
        return fernet.decrypt(cipher_text.encode("utf-8")).decode("utf-8")
    except InvalidToken as exc:
        raise CryptoError("No se pudo descifrar el secreto: token inválido o clave incorrecta.") from exc


def mask_secret(plain_text: Optional[str]) -> Optional[str]:
    if not plain_text:
        return None
    cleaned = plain_text.strip()
    if len(cleaned) <= 4:
        return "****"
    if len(cleaned) <= 8:
        return f"{cleaned[0]}****{cleaned[-2:]}"
    return f"{cleaned[:4]}****{cleaned[-4:]}"


def mask_encrypted_secret(cipher_text: Optional[str]) -> Optional[str]:
    if not cipher_text:
        return None
    plain = decrypt_secret(cipher_text)
    return mask_secret(plain)


def hash_api_key(raw_key: str) -> str:
    return hashlib.sha256(raw_key.encode("utf-8")).hexdigest()


def generate_agent_api_key() -> tuple[str, str, str]:
    """Genera una clave de agente (raw_key, key_prefix, key_hash)."""
    token = secrets.token_urlsafe(32)
    raw_key = f"fos_ag_{token}"
    key_prefix = raw_key[:14]
    return raw_key, key_prefix, hash_api_key(raw_key)
