"""Rutas de autenticación y registro multi-tenant de FidusOS v2."""

from __future__ import annotations

import re
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, EmailStr, Field as PydanticField
from sqlmodel import Session, select

from core.auth import (
    create_access_token,
    hash_password,
    require_tenant_user,
    verify_password,
)
from core.config import get_settings
from core.database import get_session
from core.models import Tenant, User

router = APIRouter(prefix="/api/v1/auth", tags=["Auth"])


class RegisterRequest(BaseModel):
    tenant_name: str = PydanticField(min_length=2, max_length=200)
    tenant_slug: Optional[str] = PydanticField(default=None, max_length=100)
    cif: Optional[str] = PydanticField(default=None, max_length=20)
    razon_social: Optional[str] = PydanticField(default=None, max_length=255)
    direccion_fiscal: Optional[str] = PydanticField(default=None, max_length=500)
    full_name: str = PydanticField(min_length=2, max_length=200)
    email: EmailStr
    password: str = PydanticField(min_length=8, max_length=128)


class LoginRequest(BaseModel):
    email: EmailStr
    password: str = PydanticField(min_length=1, max_length=128)


class UserPublic(BaseModel):
    id: int
    tenant_id: int
    email: str
    full_name: str
    role: str
    is_active: bool


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserPublic


def _slugify(value: str) -> str:
    slug = re.sub(r"[^a-z0-9]+", "-", value.lower()).strip("-")
    return slug or "tenant"


@router.post("/register", response_model=TokenResponse, status_code=status.HTTP_201_CREATED)
def register_tenant_and_admin(
    payload: RegisterRequest,
    session: Session = Depends(get_session),
) -> TokenResponse:
    if get_settings().PRELAUNCH_MODE:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="El registro público está deshabilitado temporalmente (PRELAUNCH_MODE).",
        )

    normalized_email = payload.email.lower().strip()
    existing_user = session.exec(select(User).where(User.email == normalized_email)).first()
    if existing_user is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Ya existe un usuario registrado con ese correo electrónico.",
        )

    slug = _slugify(payload.tenant_slug or payload.tenant_name)
    existing_tenant = session.exec(select(Tenant).where(Tenant.slug == slug)).first()
    if existing_tenant is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Ya existe una organización/tenant con ese identificador slug.",
        )

    tenant = Tenant(
        name=payload.tenant_name.strip(),
        slug=slug,
        cif=payload.cif.strip().upper() if payload.cif else None,
        razon_social=payload.razon_social.strip() if payload.razon_social else None,
        direccion_fiscal=payload.direccion_fiscal.strip() if payload.direccion_fiscal else None,
    )
    session.add(tenant)
    session.flush()

    user = User(
        tenant_id=tenant.id,  # type: ignore[arg-type]
        email=normalized_email,
        full_name=payload.full_name.strip(),
        hashed_password=hash_password(payload.password),
        role="admin",
    )
    session.add(user)
    session.commit()
    session.refresh(user)

    token = create_access_token(user_id=user.id, tenant_id=user.tenant_id, role=user.role)  # type: ignore[arg-type]
    return TokenResponse(
        access_token=token,
        user=UserPublic(
            id=user.id,  # type: ignore[arg-type]
            tenant_id=user.tenant_id,
            email=user.email,
            full_name=user.full_name,
            role=user.role,
            is_active=user.is_active,
        ),
    )


@router.post("/login", response_model=TokenResponse)
def login(
    payload: LoginRequest,
    session: Session = Depends(get_session),
) -> TokenResponse:
    normalized_email = payload.email.lower().strip()
    user = session.exec(select(User).where(User.email == normalized_email)).first()
    if user is None or not verify_password(payload.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Credenciales inválidas.",
        )
    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Usuario desactivado.",
        )

    tenant = session.get(Tenant, user.tenant_id)
    if tenant is None or not tenant.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Tenant inactivo.",
        )

    token = create_access_token(user_id=user.id, tenant_id=user.tenant_id, role=user.role)  # type: ignore[arg-type]
    return TokenResponse(
        access_token=token,
        user=UserPublic(
            id=user.id,  # type: ignore[arg-type]
            tenant_id=user.tenant_id,
            email=user.email,
            full_name=user.full_name,
            role=user.role,
            is_active=user.is_active,
        ),
    )


@router.get("/me", response_model=UserPublic)
def get_me(current_user: User = Depends(require_tenant_user)) -> UserPublic:
    return UserPublic(
        id=current_user.id,  # type: ignore[arg-type]
        tenant_id=current_user.tenant_id,
        email=current_user.email,
        full_name=current_user.full_name,
        role=current_user.role,
        is_active=current_user.is_active,
    )
