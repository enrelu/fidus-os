"""Endpoints base del CRM con aislamiento multi-tenant estricto."""

from __future__ import annotations

from datetime import datetime
import json
from typing import Any, Optional

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query, Response, status
from pydantic import BaseModel, EmailStr, Field as PydanticField
from sqlmodel import Session, select

from ai.dispatcher import enqueue_proactive_job
from ai.gateway import AIGateway
from ai.routes import get_ai_gateway
from core.auth import require_tenant_user
from core.database import get_session
from core.models import (
    ActivityLog,
    ActorType,
    Client,
    Lead,
    Opportunity,
    Organization,
    Task,
    User,
    utc_now,
)
from crm.services import (
    get_dashboard_analytics_for_tenant,
    get_today_priorities_for_tenant,
)

router = APIRouter(prefix="/api/v1/crm", tags=["CRM"])


# ---------------------------------------------------------------------------
# Helpers de validación multi-tenant
# ---------------------------------------------------------------------------


def _get_owned_or_404(session: Session, model_cls, record_id: int, tenant_id: int, label: str):
    record = session.exec(
        select(model_cls).where(model_cls.id == record_id, model_cls.tenant_id == tenant_id)
    ).first()
    if record is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"{label} no encontrado.")
    return record


def _assert_fk_owned(session: Session, model_cls, fk_id: Optional[int], tenant_id: int, label: str) -> None:
    if fk_id is None:
        return
    exists = session.exec(
        select(model_cls.id).where(model_cls.id == fk_id, model_cls.tenant_id == tenant_id)
    ).first()
    if exists is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Referencia '{label}' no encontrada en el tenant actual.",
        )


def _record_human_activity(
    session: Session,
    *,
    user: User,
    action: str,
    entity_type: str,
    entity_id: Optional[int],
    details: Optional[dict[str, Any]] = None,
) -> None:
    log = ActivityLog(
        tenant_id=user.tenant_id,
        actor_type=ActorType.HUMAN.value,
        actor_name=user.full_name,
        user_id=user.id,
        model_used=None,
        action=action,
        entity_type=entity_type,
        entity_id=entity_id,
        details_json=json.dumps(details, ensure_ascii=False) if details is not None else None,
    )
    session.add(log)


# ---------------------------------------------------------------------------
# Organizations (CIF, razón social, dirección fiscal)
# ---------------------------------------------------------------------------


class OrganizationCreate(BaseModel):
    name: str = PydanticField(min_length=1, max_length=200)
    cif: Optional[str] = PydanticField(default=None, max_length=20)
    razon_social: Optional[str] = PydanticField(default=None, max_length=255)
    direccion_fiscal: Optional[str] = PydanticField(default=None, max_length=500)
    sector: Optional[str] = PydanticField(default=None, max_length=120)
    website: Optional[str] = PydanticField(default=None, max_length=255)
    phone: Optional[str] = PydanticField(default=None, max_length=50)
    email: Optional[EmailStr] = None
    notes: Optional[str] = None


class OrganizationUpdate(BaseModel):
    name: Optional[str] = PydanticField(default=None, min_length=1, max_length=200)
    cif: Optional[str] = PydanticField(default=None, max_length=20)
    razon_social: Optional[str] = PydanticField(default=None, max_length=255)
    direccion_fiscal: Optional[str] = PydanticField(default=None, max_length=500)
    sector: Optional[str] = PydanticField(default=None, max_length=120)
    website: Optional[str] = PydanticField(default=None, max_length=255)
    phone: Optional[str] = PydanticField(default=None, max_length=50)
    email: Optional[EmailStr] = None
    notes: Optional[str] = None


@router.get("/organizations", response_model=list[Organization])
def list_organizations(
    current_user: User = Depends(require_tenant_user),
    session: Session = Depends(get_session),
) -> list[Organization]:
    return list(
        session.exec(
            select(Organization)
            .where(Organization.tenant_id == current_user.tenant_id)
            .order_by(Organization.id.desc())  # type: ignore[union-attr]
        ).all()
    )


@router.post("/organizations", response_model=Organization, status_code=status.HTTP_201_CREATED)
def create_organization(
    payload: OrganizationCreate,
    current_user: User = Depends(require_tenant_user),
    session: Session = Depends(get_session),
) -> Organization:
    org = Organization(
        tenant_id=current_user.tenant_id,
        name=payload.name.strip(),
        cif=payload.cif.strip().upper() if payload.cif else None,
        razon_social=payload.razon_social.strip() if payload.razon_social else None,
        direccion_fiscal=payload.direccion_fiscal.strip() if payload.direccion_fiscal else None,
        sector=payload.sector,
        website=payload.website,
        phone=payload.phone,
        email=str(payload.email) if payload.email else None,
        notes=payload.notes,
    )
    session.add(org)
    session.flush()
    _record_human_activity(
        session,
        user=current_user,
        action="create",
        entity_type="organization",
        entity_id=org.id,
    )
    session.commit()
    session.refresh(org)
    return org


@router.get("/organizations/{org_id}", response_model=Organization)
def get_organization(
    org_id: int,
    current_user: User = Depends(require_tenant_user),
    session: Session = Depends(get_session),
) -> Organization:
    return _get_owned_or_404(session, Organization, org_id, current_user.tenant_id, "Organización")


@router.patch("/organizations/{org_id}", response_model=Organization)
def update_organization(
    org_id: int,
    payload: OrganizationUpdate,
    current_user: User = Depends(require_tenant_user),
    session: Session = Depends(get_session),
) -> Organization:
    org = _get_owned_or_404(session, Organization, org_id, current_user.tenant_id, "Organización")
    data = payload.model_dump(exclude_unset=True)
    if "cif" in data and data["cif"] is not None:
        data["cif"] = data["cif"].strip().upper()
    if "email" in data and data["email"] is not None:
        data["email"] = str(data["email"])
    for key, value in data.items():
        setattr(org, key, value)
    org.updated_at = utc_now()
    session.add(org)
    session.commit()
    session.refresh(org)
    return org


@router.delete("/organizations/{org_id}", status_code=status.HTTP_204_NO_CONTENT, response_class=Response)
def delete_organization(
    org_id: int,
    current_user: User = Depends(require_tenant_user),
    session: Session = Depends(get_session),
) -> Response:
    org = _get_owned_or_404(session, Organization, org_id, current_user.tenant_id, "Organización")
    session.delete(org)
    session.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


# ---------------------------------------------------------------------------
# Clients (RGPD)
# ---------------------------------------------------------------------------


class ClientCreate(BaseModel):
    organization_id: Optional[int] = None
    full_name: str = PydanticField(min_length=1, max_length=200)
    email: Optional[EmailStr] = None
    phone: Optional[str] = PydanticField(default=None, max_length=50)
    job_title: Optional[str] = PydanticField(default=None, max_length=120)
    rgpd_consent: bool = False
    notes: Optional[str] = None


class ClientUpdate(BaseModel):
    organization_id: Optional[int] = None
    full_name: Optional[str] = PydanticField(default=None, min_length=1, max_length=200)
    email: Optional[EmailStr] = None
    phone: Optional[str] = PydanticField(default=None, max_length=50)
    job_title: Optional[str] = PydanticField(default=None, max_length=120)
    rgpd_consent: Optional[bool] = None
    notes: Optional[str] = None


@router.get("/clients", response_model=list[Client])
def list_clients(
    current_user: User = Depends(require_tenant_user),
    session: Session = Depends(get_session),
) -> list[Client]:
    return list(
        session.exec(
            select(Client)
            .where(Client.tenant_id == current_user.tenant_id)
            .order_by(Client.id.desc())  # type: ignore[union-attr]
        ).all()
    )


@router.post("/clients", response_model=Client, status_code=status.HTTP_201_CREATED)
def create_client(
    payload: ClientCreate,
    current_user: User = Depends(require_tenant_user),
    session: Session = Depends(get_session),
) -> Client:
    _assert_fk_owned(session, Organization, payload.organization_id, current_user.tenant_id, "organization_id")
    client = Client(
        tenant_id=current_user.tenant_id,
        organization_id=payload.organization_id,
        full_name=payload.full_name.strip(),
        email=str(payload.email) if payload.email else None,
        phone=payload.phone,
        job_title=payload.job_title,
        rgpd_consent=payload.rgpd_consent,
        rgpd_consent_date=utc_now() if payload.rgpd_consent else None,
        notes=payload.notes,
    )
    session.add(client)
    session.flush()
    _record_human_activity(
        session,
        user=current_user,
        action="create",
        entity_type="client",
        entity_id=client.id,
    )
    session.commit()
    session.refresh(client)
    return client


@router.get("/clients/{client_id}", response_model=Client)
def get_client(
    client_id: int,
    current_user: User = Depends(require_tenant_user),
    session: Session = Depends(get_session),
) -> Client:
    return _get_owned_or_404(session, Client, client_id, current_user.tenant_id, "Cliente")


@router.patch("/clients/{client_id}", response_model=Client)
def update_client(
    client_id: int,
    payload: ClientUpdate,
    current_user: User = Depends(require_tenant_user),
    session: Session = Depends(get_session),
) -> Client:
    client = _get_owned_or_404(session, Client, client_id, current_user.tenant_id, "Cliente")
    data = payload.model_dump(exclude_unset=True)
    if "organization_id" in data:
        _assert_fk_owned(session, Organization, data["organization_id"], current_user.tenant_id, "organization_id")
    if "email" in data and data["email"] is not None:
        data["email"] = str(data["email"])
    if data.get("rgpd_consent") is True and not client.rgpd_consent:
        client.rgpd_consent_date = utc_now()
    for key, value in data.items():
        setattr(client, key, value)
    client.updated_at = utc_now()
    session.add(client)
    session.commit()
    session.refresh(client)
    return client


@router.delete("/clients/{client_id}", status_code=status.HTTP_204_NO_CONTENT, response_class=Response)
def delete_client(
    client_id: int,
    current_user: User = Depends(require_tenant_user),
    session: Session = Depends(get_session),
) -> Response:
    client = _get_owned_or_404(session, Client, client_id, current_user.tenant_id, "Cliente")
    session.delete(client)
    session.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


# ---------------------------------------------------------------------------
# Leads
# ---------------------------------------------------------------------------


class LeadCreate(BaseModel):
    organization_id: Optional[int] = None
    full_name: str = PydanticField(min_length=1, max_length=200)
    email: Optional[EmailStr] = None
    phone: Optional[str] = PydanticField(default=None, max_length=50)
    company_name: Optional[str] = PydanticField(default=None, max_length=200)
    source: Optional[str] = PydanticField(default=None, max_length=100)
    status: str = PydanticField(default="new", max_length=50)
    score: Optional[int] = PydanticField(default=None, ge=0, le=100)
    notes: Optional[str] = None
    skip_ai_qualification: bool = False


class LeadUpdate(BaseModel):
    organization_id: Optional[int] = None
    full_name: Optional[str] = PydanticField(default=None, min_length=1, max_length=200)
    email: Optional[EmailStr] = None
    phone: Optional[str] = PydanticField(default=None, max_length=50)
    company_name: Optional[str] = PydanticField(default=None, max_length=200)
    source: Optional[str] = PydanticField(default=None, max_length=100)
    status: Optional[str] = PydanticField(default=None, max_length=50)
    score: Optional[int] = PydanticField(default=None, ge=0, le=100)
    notes: Optional[str] = None


@router.get("/leads", response_model=list[Lead])
def list_leads(
    current_user: User = Depends(require_tenant_user),
    session: Session = Depends(get_session),
) -> list[Lead]:
    return list(
        session.exec(
            select(Lead)
            .where(Lead.tenant_id == current_user.tenant_id)
            .order_by(Lead.id.desc())  # type: ignore[union-attr]
        ).all()
    )


@router.post("/leads", response_model=Lead, status_code=status.HTTP_201_CREATED)
def create_lead(
    payload: LeadCreate,
    background_tasks: BackgroundTasks,
    current_user: User = Depends(require_tenant_user),
    session: Session = Depends(get_session),
    gateway: AIGateway = Depends(get_ai_gateway),
) -> Lead:
    _assert_fk_owned(session, Organization, payload.organization_id, current_user.tenant_id, "organization_id")
    lead = Lead(
        tenant_id=current_user.tenant_id,
        organization_id=payload.organization_id,
        full_name=payload.full_name.strip(),
        email=str(payload.email) if payload.email else None,
        phone=payload.phone,
        company_name=payload.company_name,
        source=payload.source,
        status=payload.status,
        score=payload.score,
        notes=payload.notes,
    )
    session.add(lead)
    session.flush()
    _record_human_activity(
        session,
        user=current_user,
        action="create",
        entity_type="lead",
        entity_id=lead.id,
    )
    session.commit()
    session.refresh(lead)

    if not payload.skip_ai_qualification and lead.id is not None:
        bind = session.get_bind()
        target_engine = bind.engine if hasattr(bind, "engine") else bind
        enqueue_proactive_job(
            "proactive.qualify_lead",
            {"tenant_id": current_user.tenant_id, "lead_id": lead.id},
            background_tasks=background_tasks,
            engine=target_engine,
            gateway=gateway,
        )

    return lead


@router.get("/leads/{lead_id}", response_model=Lead)
def get_lead(
    lead_id: int,
    current_user: User = Depends(require_tenant_user),
    session: Session = Depends(get_session),
) -> Lead:
    return _get_owned_or_404(session, Lead, lead_id, current_user.tenant_id, "Lead")


@router.patch("/leads/{lead_id}", response_model=Lead)
def update_lead(
    lead_id: int,
    payload: LeadUpdate,
    current_user: User = Depends(require_tenant_user),
    session: Session = Depends(get_session),
) -> Lead:
    lead = _get_owned_or_404(session, Lead, lead_id, current_user.tenant_id, "Lead")
    previous_status = lead.status
    data = payload.model_dump(exclude_unset=True)
    if "organization_id" in data:
        _assert_fk_owned(session, Organization, data["organization_id"], current_user.tenant_id, "organization_id")
    if "email" in data and data["email"] is not None:
        data["email"] = str(data["email"])
    for key, value in data.items():
        setattr(lead, key, value)
    lead.updated_at = utc_now()
    session.add(lead)
    if data:
        status_changed = "status" in data and data["status"] != previous_status
        _record_human_activity(
            session,
            user=current_user,
            action="status_change" if status_changed else "update",
            entity_type="lead",
            entity_id=lead.id,
            details=(
                {"from_status": previous_status, "to_status": lead.status}
                if status_changed
                else {"updated_fields": sorted(data.keys())}
            ),
        )
    session.commit()
    session.refresh(lead)
    return lead


class ConvertOrganizationInput(BaseModel):
    existing_id: Optional[int] = None
    create: bool = False
    name: Optional[str] = PydanticField(default=None, max_length=200)
    cif: Optional[str] = PydanticField(default=None, max_length=20)
    razon_social: Optional[str] = PydanticField(default=None, max_length=255)
    direccion_fiscal: Optional[str] = PydanticField(default=None, max_length=500)
    sector: Optional[str] = PydanticField(default=None, max_length=120)
    website: Optional[str] = PydanticField(default=None, max_length=255)
    phone: Optional[str] = PydanticField(default=None, max_length=50)
    email: Optional[EmailStr] = None


class ConvertClientInput(BaseModel):
    existing_id: Optional[int] = None
    create: bool = True
    full_name: Optional[str] = PydanticField(default=None, max_length=200)
    email: Optional[EmailStr] = None
    phone: Optional[str] = PydanticField(default=None, max_length=50)
    job_title: Optional[str] = PydanticField(default=None, max_length=120)
    rgpd_consent: bool = False
    notes: Optional[str] = None


class ConvertOpportunityInput(BaseModel):
    create: bool = True
    title: Optional[str] = PydanticField(default=None, max_length=255)
    amount_eur: float = PydanticField(default=0.0, ge=0.0)
    stage: str = PydanticField(default="qualification", max_length=50)
    probability: int = PydanticField(default=25, ge=0, le=100)
    expected_close_date: Optional[datetime] = None
    notes: Optional[str] = None


class LeadConvertRequest(BaseModel):
    organization: Optional[ConvertOrganizationInput] = None
    client: Optional[ConvertClientInput] = None
    opportunity: Optional[ConvertOpportunityInput] = None


class LeadConvertResponse(BaseModel):
    lead: Lead
    organization: Optional[Organization] = None
    client: Optional[Client] = None
    opportunity: Optional[Opportunity] = None


@router.post("/leads/{lead_id}/convert", response_model=LeadConvertResponse)
def convert_lead(
    lead_id: int,
    payload: Optional[LeadConvertRequest] = None,
    current_user: User = Depends(require_tenant_user),
    session: Session = Depends(get_session),
) -> LeadConvertResponse:
    tenant_id = current_user.tenant_id
    lead = _get_owned_or_404(session, Lead, lead_id, tenant_id, "Lead")
    if (lead.status or "").strip().lower() == "converted":
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="El lead ya ha sido convertido previamente.",
        )

    req = payload or LeadConvertRequest()
    org_obj: Optional[Organization] = None

    if req.organization is not None:
        if req.organization.existing_id is not None:
            org_obj = _get_owned_or_404(
                session, Organization, req.organization.existing_id, tenant_id, "Organización"
            )
        elif req.organization.create or (req.organization.name and req.organization.name.strip()):
            org_name = (
                (req.organization.name or "").strip()
                or (lead.company_name or "").strip()
                or f"Empresa de {lead.full_name}"
            )
            org_obj = Organization(
                tenant_id=tenant_id,
                name=org_name[:200],
                cif=req.organization.cif.strip().upper() if req.organization.cif else None,
                razon_social=req.organization.razon_social.strip() if req.organization.razon_social else None,
                direccion_fiscal=(
                    req.organization.direccion_fiscal.strip() if req.organization.direccion_fiscal else None
                ),
                sector=req.organization.sector.strip() if req.organization.sector else None,
                website=req.organization.website.strip() if req.organization.website else None,
                phone=req.organization.phone.strip() if req.organization.phone else None,
                email=str(req.organization.email) if req.organization.email else None,
            )
            session.add(org_obj)
            session.flush()
    else:
        if lead.organization_id is not None:
            org_obj = _get_owned_or_404(
                session, Organization, lead.organization_id, tenant_id, "Organización"
            )
        elif lead.company_name and lead.company_name.strip():
            org_obj = Organization(
                tenant_id=tenant_id,
                name=lead.company_name.strip()[:200],
            )
            session.add(org_obj)
            session.flush()

    resolved_org_id = org_obj.id if org_obj is not None else lead.organization_id

    client_obj: Optional[Client] = None
    if req.client is not None:
        if req.client.existing_id is not None:
            client_obj = _get_owned_or_404(session, Client, req.client.existing_id, tenant_id, "Cliente")
        elif req.client.create:
            client_obj = Client(
                tenant_id=tenant_id,
                organization_id=resolved_org_id,
                full_name=(req.client.full_name or lead.full_name).strip()[:200],
                email=str(req.client.email) if req.client.email else lead.email,
                phone=req.client.phone if req.client.phone is not None else lead.phone,
                job_title=req.client.job_title,
                rgpd_consent=req.client.rgpd_consent,
                rgpd_consent_date=utc_now() if req.client.rgpd_consent else None,
                notes=req.client.notes if req.client.notes is not None else lead.notes,
            )
            session.add(client_obj)
            session.flush()
    else:
        client_obj = Client(
            tenant_id=tenant_id,
            organization_id=resolved_org_id,
            full_name=lead.full_name.strip()[:200],
            email=lead.email,
            phone=lead.phone,
            rgpd_consent=False,
            notes=lead.notes,
        )
        session.add(client_obj)
        session.flush()

    opp_obj: Optional[Opportunity] = None
    if req.opportunity is None or req.opportunity.create:
        opp_in = req.opportunity or ConvertOpportunityInput()
        default_title = f"Oportunidad · {org_obj.name if org_obj else (lead.company_name or lead.full_name)}"
        opp_obj = Opportunity(
            tenant_id=tenant_id,
            organization_id=resolved_org_id,
            client_id=client_obj.id if client_obj is not None else None,
            lead_id=lead.id,
            title=(opp_in.title.strip() if opp_in.title and opp_in.title.strip() else default_title)[:255],
            amount_eur=opp_in.amount_eur,
            currency="EUR",
            stage=opp_in.stage.strip() or "qualification",
            probability=opp_in.probability,
            expected_close_date=opp_in.expected_close_date,
            notes=opp_in.notes,
        )
        session.add(opp_obj)
        session.flush()

    lead.status = "Converted"
    if resolved_org_id is not None:
        lead.organization_id = resolved_org_id
    lead.updated_at = utc_now()
    session.add(lead)

    _record_human_activity(
        session,
        user=current_user,
        action="convert",
        entity_type="lead",
        entity_id=lead.id,
        details={
            "organization_id": org_obj.id if org_obj else None,
            "client_id": client_obj.id if client_obj else None,
            "opportunity_id": opp_obj.id if opp_obj else None,
        },
    )

    session.commit()
    session.refresh(lead)
    if org_obj is not None:
        session.refresh(org_obj)
    if client_obj is not None:
        session.refresh(client_obj)
    if opp_obj is not None:
        session.refresh(opp_obj)

    return LeadConvertResponse(
        lead=lead,
        organization=org_obj,
        client=client_obj,
        opportunity=opp_obj,
    )


@router.delete("/leads/{lead_id}", status_code=status.HTTP_204_NO_CONTENT, response_class=Response)
def delete_lead(
    lead_id: int,
    current_user: User = Depends(require_tenant_user),
    session: Session = Depends(get_session),
) -> Response:
    lead = _get_owned_or_404(session, Lead, lead_id, current_user.tenant_id, "Lead")
    session.delete(lead)
    session.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


# ---------------------------------------------------------------------------
# Opportunities (EUR)
# ---------------------------------------------------------------------------


class OpportunityCreate(BaseModel):
    organization_id: Optional[int] = None
    client_id: Optional[int] = None
    lead_id: Optional[int] = None
    title: str = PydanticField(min_length=1, max_length=255)
    amount_eur: float = PydanticField(default=0.0, ge=0.0)
    stage: str = PydanticField(default="qualification", max_length=50)
    probability: int = PydanticField(default=20, ge=0, le=100)
    expected_close_date: Optional[datetime] = None
    notes: Optional[str] = None


class OpportunityUpdate(BaseModel):
    organization_id: Optional[int] = None
    client_id: Optional[int] = None
    lead_id: Optional[int] = None
    title: Optional[str] = PydanticField(default=None, min_length=1, max_length=255)
    amount_eur: Optional[float] = PydanticField(default=None, ge=0.0)
    stage: Optional[str] = PydanticField(default=None, max_length=50)
    probability: Optional[int] = PydanticField(default=None, ge=0, le=100)
    expected_close_date: Optional[datetime] = None
    notes: Optional[str] = None


@router.get("/opportunities", response_model=list[Opportunity])
def list_opportunities(
    current_user: User = Depends(require_tenant_user),
    session: Session = Depends(get_session),
) -> list[Opportunity]:
    return list(
        session.exec(
            select(Opportunity)
            .where(Opportunity.tenant_id == current_user.tenant_id)
            .order_by(Opportunity.id.desc())  # type: ignore[union-attr]
        ).all()
    )


@router.post("/opportunities", response_model=Opportunity, status_code=status.HTTP_201_CREATED)
def create_opportunity(
    payload: OpportunityCreate,
    current_user: User = Depends(require_tenant_user),
    session: Session = Depends(get_session),
) -> Opportunity:
    _assert_fk_owned(session, Organization, payload.organization_id, current_user.tenant_id, "organization_id")
    _assert_fk_owned(session, Client, payload.client_id, current_user.tenant_id, "client_id")
    _assert_fk_owned(session, Lead, payload.lead_id, current_user.tenant_id, "lead_id")

    opp = Opportunity(
        tenant_id=current_user.tenant_id,
        organization_id=payload.organization_id,
        client_id=payload.client_id,
        lead_id=payload.lead_id,
        title=payload.title.strip(),
        amount_eur=payload.amount_eur,
        currency="EUR",
        stage=payload.stage,
        probability=payload.probability,
        expected_close_date=payload.expected_close_date,
        notes=payload.notes,
    )
    session.add(opp)
    session.flush()
    _record_human_activity(
        session,
        user=current_user,
        action="create",
        entity_type="opportunity",
        entity_id=opp.id,
    )
    session.commit()
    session.refresh(opp)
    return opp


@router.get("/opportunities/{opp_id}", response_model=Opportunity)
def get_opportunity(
    opp_id: int,
    current_user: User = Depends(require_tenant_user),
    session: Session = Depends(get_session),
) -> Opportunity:
    return _get_owned_or_404(session, Opportunity, opp_id, current_user.tenant_id, "Oportunidad")


@router.patch("/opportunities/{opp_id}", response_model=Opportunity)
def update_opportunity(
    opp_id: int,
    payload: OpportunityUpdate,
    current_user: User = Depends(require_tenant_user),
    session: Session = Depends(get_session),
) -> Opportunity:
    opp = _get_owned_or_404(session, Opportunity, opp_id, current_user.tenant_id, "Oportunidad")
    data = payload.model_dump(exclude_unset=True)
    if "organization_id" in data:
        _assert_fk_owned(session, Organization, data["organization_id"], current_user.tenant_id, "organization_id")
    if "client_id" in data:
        _assert_fk_owned(session, Client, data["client_id"], current_user.tenant_id, "client_id")
    if "lead_id" in data:
        _assert_fk_owned(session, Lead, data["lead_id"], current_user.tenant_id, "lead_id")
    for key, value in data.items():
        setattr(opp, key, value)
    opp.updated_at = utc_now()
    session.add(opp)
    session.commit()
    session.refresh(opp)
    return opp


@router.delete("/opportunities/{opp_id}", status_code=status.HTTP_204_NO_CONTENT, response_class=Response)
def delete_opportunity(
    opp_id: int,
    current_user: User = Depends(require_tenant_user),
    session: Session = Depends(get_session),
) -> Response:
    opp = _get_owned_or_404(session, Opportunity, opp_id, current_user.tenant_id, "Oportunidad")
    session.delete(opp)
    session.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


# ---------------------------------------------------------------------------
# Tasks
# ---------------------------------------------------------------------------


class TaskCreate(BaseModel):
    assigned_user_id: Optional[int] = None
    organization_id: Optional[int] = None
    client_id: Optional[int] = None
    opportunity_id: Optional[int] = None
    title: str = PydanticField(min_length=1, max_length=255)
    description: Optional[str] = None
    status: str = PydanticField(default="pending", max_length=50)
    priority: str = PydanticField(default="medium", max_length=30)
    due_date: Optional[datetime] = None


class TaskUpdate(BaseModel):
    assigned_user_id: Optional[int] = None
    organization_id: Optional[int] = None
    client_id: Optional[int] = None
    opportunity_id: Optional[int] = None
    title: Optional[str] = PydanticField(default=None, min_length=1, max_length=255)
    description: Optional[str] = None
    status: Optional[str] = PydanticField(default=None, max_length=50)
    priority: Optional[str] = PydanticField(default=None, max_length=30)
    due_date: Optional[datetime] = None


@router.get("/tasks", response_model=list[Task])
def list_tasks(
    current_user: User = Depends(require_tenant_user),
    session: Session = Depends(get_session),
) -> list[Task]:
    return list(
        session.exec(
            select(Task)
            .where(Task.tenant_id == current_user.tenant_id)
            .order_by(Task.id.desc())  # type: ignore[union-attr]
        ).all()
    )


@router.post("/tasks", response_model=Task, status_code=status.HTTP_201_CREATED)
def create_task(
    payload: TaskCreate,
    current_user: User = Depends(require_tenant_user),
    session: Session = Depends(get_session),
) -> Task:
    _assert_fk_owned(session, User, payload.assigned_user_id, current_user.tenant_id, "assigned_user_id")
    _assert_fk_owned(session, Organization, payload.organization_id, current_user.tenant_id, "organization_id")
    _assert_fk_owned(session, Client, payload.client_id, current_user.tenant_id, "client_id")
    _assert_fk_owned(session, Opportunity, payload.opportunity_id, current_user.tenant_id, "opportunity_id")

    task = Task(
        tenant_id=current_user.tenant_id,
        assigned_user_id=payload.assigned_user_id,
        organization_id=payload.organization_id,
        client_id=payload.client_id,
        opportunity_id=payload.opportunity_id,
        title=payload.title.strip(),
        description=payload.description,
        status=payload.status,
        priority=payload.priority,
        due_date=payload.due_date,
    )
    session.add(task)
    session.flush()
    _record_human_activity(
        session,
        user=current_user,
        action="create",
        entity_type="task",
        entity_id=task.id,
    )
    session.commit()
    session.refresh(task)
    return task


@router.get("/tasks/{task_id}", response_model=Task)
def get_task(
    task_id: int,
    current_user: User = Depends(require_tenant_user),
    session: Session = Depends(get_session),
) -> Task:
    return _get_owned_or_404(session, Task, task_id, current_user.tenant_id, "Tarea")


@router.patch("/tasks/{task_id}", response_model=Task)
def update_task(
    task_id: int,
    payload: TaskUpdate,
    current_user: User = Depends(require_tenant_user),
    session: Session = Depends(get_session),
) -> Task:
    task = _get_owned_or_404(session, Task, task_id, current_user.tenant_id, "Tarea")
    data = payload.model_dump(exclude_unset=True)
    if "assigned_user_id" in data:
        _assert_fk_owned(session, User, data["assigned_user_id"], current_user.tenant_id, "assigned_user_id")
    if "organization_id" in data:
        _assert_fk_owned(session, Organization, data["organization_id"], current_user.tenant_id, "organization_id")
    if "client_id" in data:
        _assert_fk_owned(session, Client, data["client_id"], current_user.tenant_id, "client_id")
    if "opportunity_id" in data:
        _assert_fk_owned(session, Opportunity, data["opportunity_id"], current_user.tenant_id, "opportunity_id")
    for key, value in data.items():
        setattr(task, key, value)
    task.updated_at = utc_now()
    session.add(task)
    session.commit()
    session.refresh(task)
    return task


@router.delete("/tasks/{task_id}", status_code=status.HTTP_204_NO_CONTENT, response_class=Response)
def delete_task(
    task_id: int,
    current_user: User = Depends(require_tenant_user),
    session: Session = Depends(get_session),
) -> Response:
    task = _get_owned_or_404(session, Task, task_id, current_user.tenant_id, "Tarea")
    session.delete(task)
    session.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


# ---------------------------------------------------------------------------
# ActivityLog (Auditoría humanos y agentes)
# ---------------------------------------------------------------------------


@router.get("/activities", response_model=list[ActivityLog])
def list_activities(
    actor_type: Optional[ActorType] = Query(default=None),
    entity_type: Optional[str] = Query(default=None),
    current_user: User = Depends(require_tenant_user),
    session: Session = Depends(get_session),
) -> list[ActivityLog]:
    stmt = select(ActivityLog).where(ActivityLog.tenant_id == current_user.tenant_id)
    if actor_type is not None:
        stmt = stmt.where(ActivityLog.actor_type == actor_type.value)
    if entity_type is not None:
        stmt = stmt.where(ActivityLog.entity_type == entity_type)
    stmt = stmt.order_by(ActivityLog.id.desc())  # type: ignore[union-attr]
    return list(session.exec(stmt).all())


# ---------------------------------------------------------------------------
# Prioridades (Hoy) y Analítica del Panel (Fase 1)
# ---------------------------------------------------------------------------


@router.get("/priorities/today")
def get_priorities_today(
    stale_days: int = Query(default=7, ge=1, le=365),
    current_user: User = Depends(require_tenant_user),
    session: Session = Depends(get_session),
) -> dict[str, Any]:
    return get_today_priorities_for_tenant(
        session,
        current_user.tenant_id,
        stale_days=stale_days,
    )


@router.get("/priorities/dashboard")
def get_priorities_dashboard(
    stale_days: int = Query(default=7, ge=1, le=365),
    current_user: User = Depends(require_tenant_user),
    session: Session = Depends(get_session),
) -> dict[str, Any]:
    return get_today_priorities_for_tenant(
        session,
        current_user.tenant_id,
        stale_days=stale_days,
    )


@router.get("/analytics/dashboard")
def get_analytics_dashboard(
    year: Optional[int] = Query(default=None, ge=2000, le=2100),
    quarter: Optional[int] = Query(default=None, ge=1, le=4),
    current_user: User = Depends(require_tenant_user),
    session: Session = Depends(get_session),
) -> dict[str, Any]:
    return get_dashboard_analytics_for_tenant(
        session,
        current_user.tenant_id,
        year=year,
        quarter=quarter,
    )

