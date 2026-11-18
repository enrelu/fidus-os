"""Autenticación JWT, hashing de contraseñas y aislamiento estricto multi-tenant."""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Optional

import bcrypt
import jwt
from fastapi import Depends, Header, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from jwt import InvalidTokenError
from sqlmodel import Session, select

from core.config import get_settings
from core.crypto import hash_api_key
from core.database import get_session
from core.models import AgentApiKey, Tenant, User, utc_now

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/v1/auth/login", auto_error=False)


def hash_password(plain_password: str) -> str:
    salt = bcrypt.gensalt()
    return bcrypt.hashpw(plain_password.encode("utf-8"), salt).decode("utf-8")


def verify_password(plain_password: str, hashed_password: str) -> bool:
    try:
        return bcrypt.checkpw(plain_password.encode("utf-8"), hashed_password.encode("utf-8"))
    except ValueError:
        return False


def create_access_token(
    *,
    user_id: int,
    tenant_id: int,
    role: str,
    expires_delta: Optional[timedelta] = None,
) -> str:
    settings = get_settings()
    now = datetime.now(timezone.utc)
    expire = now + (expires_delta or timedelta(minutes=settings.JWT_EXPIRE_MINUTES))
    payload = {
        "sub": str(user_id),
        "tenant_id": tenant_id,
        "role": role,
        "iat": int(now.timestamp()),
        "exp": int(expire.timestamp()),
    }
    return jwt.encode(payload, settings.resolve_jwt_secret(), algorithm=settings.JWT_ALGORITHM)


def decode_access_token(token: str) -> dict:
    settings = get_settings()
    try:
        payload = jwt.decode(
            token,
            settings.resolve_jwt_secret(),
            algorithms=[settings.JWT_ALGORITHM],
        )
    except InvalidTokenError as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token de autenticación inválido o expirado.",
            headers={"WWW-Authenticate": "Bearer"},
        ) from exc
    return payload


def require_tenant_user(
    token: Optional[str] = Depends(oauth2_scheme),
    session: Session = Depends(get_session),
) -> User:
    """Valida JWT, usuario activo y tenant activo; garantiza aislamiento multi-tenant estricto."""
    if not token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Autenticación requerida.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    payload = decode_access_token(token)
    sub = payload.get("sub")
    token_tenant_id = payload.get("tenant_id")

    if sub is None or token_tenant_id is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token incompleto: faltan reclamaciones de usuario o tenant.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    try:
        user_id = int(sub)
        tenant_id = int(token_tenant_id)
    except (TypeError, ValueError) as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Reclamaciones de token inválidas.",
            headers={"WWW-Authenticate": "Bearer"},
        ) from exc

    user = session.get(User, user_id)
    if user is None or not user.is_active or user.tenant_id != tenant_id:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Usuario inactivo o no pertenece al tenant del token.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    tenant = session.get(Tenant, tenant_id)
    if tenant is None or not tenant.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="El tenant asociado se encuentra inactivo o no existe.",
        )

    return user


def require_agent_api_key(
    x_agent_api_key: Optional[str] = Header(default=None, alias="X-Agent-Api-Key"),
    session: Session = Depends(get_session),
) -> AgentApiKey:
    """Autentica peticiones procedentes de un agente externo mediante X-Agent-Api-Key."""
    if not x_agent_api_key:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Cabecera X-Agent-Api-Key requerida.",
        )

    hashed = hash_api_key(x_agent_api_key.strip())
    api_key = session.exec(
        select(AgentApiKey).where(AgentApiKey.key_hash == hashed)
    ).first()

    if api_key is None or not api_key.is_active:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Clave de agente inválida o revocada.",
        )

    tenant = session.get(Tenant, api_key.tenant_id)
    if tenant is None or not tenant.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="El tenant asociado a la clave de agente está inactivo.",
        )

    api_key.last_used_at = utc_now()
    session.add(api_key)
    session.commit()
    session.refresh(api_key)
    return api_key


def require_actor_context(
    token: Optional[str] = Depends(oauth2_scheme),
    x_agent_api_key: Optional[str] = Header(default=None, alias="X-Agent-Api-Key"),
    session: Session = Depends(get_session),
) -> tuple[int, Optional[User], Optional[AgentApiKey]]:
    """Permite autenticación por JWT humano o por X-Agent-Api-Key, devolviendo (tenant_id, user, agent_key)."""
    if token:
        user = require_tenant_user(token=token, session=session)
        return user.tenant_id, user, None
    if x_agent_api_key:
        agent_key = require_agent_api_key(x_agent_api_key=x_agent_api_key, session=session)
        return agent_key.tenant_id, None, agent_key
    raise HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Se requiere token Bearer o cabecera X-Agent-Api-Key.",
    )
