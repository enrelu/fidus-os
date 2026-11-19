import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
  ArrowLeft,
  ArrowRightCircle,
  Building2,
  CheckCircle2,
  CheckSquare,
  MessageSquarePlus,
  Pencil,
  Plus,
  ShieldAlert,
  Sparkles,
  Target,
  UserPlus,
  Users,
} from "lucide-react";
import { aiApi, ApiError, crmApi } from "../api/client";
import { POTENTIAL_CHIPS } from "../components/ClientView";
import { ConvertLeadModal } from "../components/ConvertLeadModal";
import { EditClientModal } from "../components/EditClientModal";
import { EditOrganizationModal } from "../components/EditOrganizationModal";
import { LogInteractionModal } from "../components/LogInteractionModal";
import { OpportunityModal } from "../components/OpportunityModal";
import { OPPORTUNITY_STAGE_CHIPS } from "../components/OpportunityTableView";
import { ActorBadge, ChipSelect, type ChipSelectOption, Modal, PriorityBadge, ScorePill } from "../components/ui";
import type {
  Client,
  ClientPotential,
  Entity360Response,
  Entity360Type,
  Lead,
  Opportunity,
  Organization,
  Task,
} from "../types/api";
import { formatDateTimeEs, formatEur } from "../utils/format";

interface EntityDetailPageProps {
  entityType: Entity360Type;
}

const LEAD_STATUS_CHIPS: ChipSelectOption[] = [
  { value: "new", label: "Nuevo", pillClass: "border-sky-200 bg-sky-50 text-sky-700" },
  { value: "contacted", label: "Contactado", pillClass: "border-indigo-200 bg-indigo-50 text-indigo-700" },
  { value: "replied", label: "Respondido", pillClass: "border-violet-200 bg-violet-50 text-violet-700" },
  { value: "Converted", label: "Convertido", pillClass: "border-emerald-200 bg-emerald-50 text-emerald-700" },
  { value: "unqualified", label: "No cualificado", pillClass: "border-neutral-200 bg-neutral-100 text-neutral-600" },
];

const BACK_LINK: Record<Entity360Type, { to: string; label: string; badge: string }> = {
  lead: { to: "/leads", label: "Volver a Leads", badge: "Lead" },
  client: { to: "/clients", label: "Volver a Clientes", badge: "Cliente" },
  organization: { to: "/organizations", label: "Volver a Organizaciones", badge: "Organización" },
  opportunity: { to: "/opportunities", label: "Volver a Oportunidades", badge: "Oportunidad" },
};

export const EntityDetailPage: React.FC<EntityDetailPageProps> = ({ entityType }) => {
  const { id } = useParams<{ id: string }>();
  const entityId = Number(id);

  const [data, setData] = useState<Entity360Response | null>(null);
  const [allOrgs, setAllOrgs] = useState<Organization[]>([]);
  const [allClients, setAllClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [interactionOpen, setInteractionOpen] = useState(false);
  const [qualifying, setQualifying] = useState(false);
  const [convertOpen, setConvertOpen] = useState(false);

  // Modales de edición por entidad
  const [editOrgOpen, setEditOrgOpen] = useState(false);
  const [editClientOpen, setEditClientOpen] = useState(false);
  const [editOppOpen, setEditOppOpen] = useState(false);
  const [editLeadOpen, setEditLeadOpen] = useState(false);
  const [leadForm, setLeadForm] = useState({
    full_name: "",
    company_name: "",
    email: "",
    phone: "",
    source: "",
    notes: "",
  });
  const [savingLead, setSavingLead] = useState(false);

  // Quick add task
  const [newTaskTitle, setNewTaskTitle] = useState("");
  const [newTaskPriority, setNewTaskPriority] = useState<"low" | "medium" | "high" | "urgent">("medium");
  const [addingTask, setAddingTask] = useState(false);

  const load360 = useCallback(async () => {
    if (!Number.isFinite(entityId) || entityId <= 0) {
      setError("Identificador de entidad no válido.");
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const [res, orgs, clis] = await Promise.all([
        crmApi.getEntity360(entityType, entityId),
        crmApi.listOrganizations(),
        crmApi.listClients(),
      ]);
      setData(res);
      setAllOrgs(orgs);
      setAllClients(clis);
    } catch (err) {
      setError(err instanceof ApiError ? err.detail : "No se pudo cargar la ficha 360.");
    } finally {
      setLoading(false);
    }
  }, [entityType, entityId]);

  useEffect(() => {
    void load360();
  }, [load360]);

  useEffect(() => {
    const onUpdated = () => void load360();
    window.addEventListener("fidus:crm-updated", onUpdated);
    return () => window.removeEventListener("fidus:crm-updated", onUpdated);
  }, [load360]);

  const entityLabel = useMemo(() => {
    if (!data) return "";
    const raw = data.entity;
    return String(raw.title || raw.full_name || raw.name || `#${entityId}`);
  }, [data, entityId]);

  const organizationIdForContext = useMemo(() => {
    if (!data) return null;
    if (entityType === "organization") return entityId;
    const rawOrgId = data.entity.organization_id;
    return typeof rawOrgId === "number" ? rawOrgId : data.organization?.id ?? null;
  }, [data, entityId, entityType]);

  const openEditModal = () => {
    if (!data) return;
    if (entityType === "organization") setEditOrgOpen(true);
    else if (entityType === "client") setEditClientOpen(true);
    else if (entityType === "opportunity") setEditOppOpen(true);
    else {
      const ld = data.entity as unknown as Lead;
      setLeadForm({
        full_name: ld.full_name || "",
        company_name: ld.company_name || "",
        email: ld.email || "",
        phone: ld.phone || "",
        source: ld.source || "",
        notes: ld.notes || "",
      });
      setEditLeadOpen(true);
    }
  };

  const handleSaveLead = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!leadForm.full_name.trim()) return;
    setSavingLead(true);
    setError(null);
    try {
      await crmApi.updateLead(entityId, {
        full_name: leadForm.full_name.trim(),
        company_name: leadForm.company_name.trim() || undefined,
        email: leadForm.email.trim() || undefined,
        phone: leadForm.phone.trim() || undefined,
        source: leadForm.source.trim() || undefined,
        notes: leadForm.notes.trim() || undefined,
      });
      setEditLeadOpen(false);
      setNotice("Lead actualizado.");
      window.dispatchEvent(new CustomEvent("fidus:crm-updated"));
      await load360();
    } catch (err) {
      setError(err instanceof ApiError ? err.detail : "No se pudo actualizar el lead.");
    } finally {
      setSavingLead(false);
    }
  };

  const handleAskCopilot = () => {
    window.dispatchEvent(
      new CustomEvent("fidus:open-copilot", {
        detail: {
          context: {
            view: `${entityType}_detail`,
            entity_type: entityType,
            entity_id: entityId,
            entity_label: entityLabel,
          },
          organizationId: organizationIdForContext,
          prompt: `Resume el contexto de ${entityLabel} y sugiere la mejor siguiente acción comercial.`,
        },
      })
    );
  };

  const handleQualifyLead = async () => {
    setQualifying(true);
    setError(null);
    setNotice(null);
    try {
      const res = await aiApi.qualifyLead(entityId);
      setNotice(
        `Lead cualificado (${res.score ?? "—"}/100).${
          res.created_action ? " Propuesta HITL creada." : ""
        }`
      );
      window.dispatchEvent(new CustomEvent("fidus:crm-updated"));
      await load360();
    } catch (err) {
      setError(err instanceof ApiError ? err.detail : "No se pudo cualificar el lead.");
    } finally {
      setQualifying(false);
    }
  };

  const handleInlineStateChange = async (nextValue: string) => {
    setError(null);
    setNotice(null);
    try {
      if (entityType === "lead") {
        if (nextValue === "Converted") {
          setConvertOpen(true);
          return;
        }
        await crmApi.updateLead(entityId, { status: nextValue });
      } else if (entityType === "opportunity") {
        await crmApi.updateOpportunity(entityId, { stage: nextValue });
      } else if (entityType === "client") {
        await crmApi.updateClient(entityId, { potential: nextValue as ClientPotential });
      }
      setNotice("Estado actualizado.");
      window.dispatchEvent(new CustomEvent("fidus:crm-updated"));
      await load360();
    } catch (err) {
      setError(err instanceof ApiError ? err.detail : "No se pudo actualizar el estado.");
    }
  };

  const handleAddTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTaskTitle.trim() || !data) return;
    setAddingTask(true);
    setError(null);
    try {
      await crmApi.createTask({
        title: newTaskTitle.trim(),
        priority: newTaskPriority,
        status: "pending",
        organization_id: organizationIdForContext,
        client_id:
          entityType === "client"
            ? entityId
            : typeof data.entity.client_id === "number"
            ? data.entity.client_id
            : null,
        opportunity_id: entityType === "opportunity" ? entityId : null,
      });
      setNewTaskTitle("");
      setNotice("Tarea vinculada creada.");
      window.dispatchEvent(new CustomEvent("fidus:crm-updated"));
      await load360();
    } catch (err) {
      setError(err instanceof ApiError ? err.detail : "No se pudo crear la tarea.");
    } finally {
      setAddingTask(false);
    }
  };

  const handleToggleTask = async (task: Task) => {
    const nextStatus = task.status === "completed" ? "pending" : "completed";
    try {
      await crmApi.updateTask(task.id, { status: nextStatus });
      window.dispatchEvent(new CustomEvent("fidus:crm-updated"));
      await load360();
    } catch (err) {
      setError(err instanceof ApiError ? err.detail : "No se pudo actualizar la tarea.");
    }
  };

  const backMeta = BACK_LINK[entityType];

  if (loading && !data) {
    return (
      <div className="rounded-xl border border-[#e7e7e9] bg-white p-10 text-center text-xs text-neutral-500">
        Cargando ficha 360...
      </div>
    );
  }

  if (!data) {
    return (
      <div className="space-y-4">
        <Link
          to={backMeta.to}
          className="inline-flex items-center gap-1.5 text-xs font-medium text-neutral-600 hover:text-[#121212]"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          {backMeta.label}
        </Link>
        <div className="rounded-xl border border-rose-200 bg-rose-50 p-6 text-xs text-rose-800">
          {error || "Entidad no encontrada."}
        </div>
      </div>
    );
  }

  const raw = data.entity;
  const leadEntity = entityType === "lead" ? (raw as unknown as Lead) : null;
  const clientEntity = entityType === "client" ? (raw as unknown as Client) : null;
  const orgEntity = entityType === "organization" ? (raw as unknown as Organization) : null;
  const oppEntity = entityType === "opportunity" ? (raw as unknown as Opportunity) : null;

  const isLeadConverted =
    leadEntity && (leadEntity.status || "").trim().toLowerCase() === "converted";

  return (
    <div className="space-y-5">
      {/* Top breadcrumb & actions */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-1.5">
          <Link
            to={backMeta.to}
            className="inline-flex items-center gap-1.5 text-xs font-medium text-neutral-500 hover:text-[#121212]"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            {backMeta.label}
          </Link>

          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-md border border-[#e7e7e9] bg-white px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-neutral-600">
              {backMeta.badge}
            </span>
            <h1 className="text-xl font-semibold tracking-tight text-[#121212]">{entityLabel}</h1>

            {leadEntity && (
              <>
                <ChipSelect
                  ariaLabel="Estado del lead"
                  value={
                    (leadEntity.status || "").toLowerCase() === "converted"
                      ? "Converted"
                      : (leadEntity.status || "new").toLowerCase()
                  }
                  disabled={Boolean(isLeadConverted)}
                  options={LEAD_STATUS_CHIPS}
                  onChange={(v) => void handleInlineStateChange(v)}
                />
                <ScorePill score={leadEntity.score} />
              </>
            )}

            {oppEntity && (
              <>
                <ChipSelect
                  ariaLabel="Etapa de la oportunidad"
                  value={oppEntity.stage || "qualification"}
                  options={OPPORTUNITY_STAGE_CHIPS}
                  onChange={(v) => void handleInlineStateChange(v)}
                />
                <span className="rounded-md border border-emerald-200 bg-emerald-50 px-2 py-0.5 font-mono text-xs font-semibold text-emerald-700">
                  {formatEur(oppEntity.amount_eur)}
                </span>
              </>
            )}

            {clientEntity && (
              <>
                <ChipSelect
                  ariaLabel="Potencial del cliente"
                  value={clientEntity.potential || "medium"}
                  options={POTENTIAL_CHIPS}
                  onChange={(v) => void handleInlineStateChange(v)}
                />
                <ScorePill score={clientEntity.score} />
              </>
            )}

            {orgEntity?.cif && (
              <span className="rounded-md border border-[#e7e7e9] bg-white px-2 py-0.5 font-mono text-xs font-semibold text-neutral-700">
                {orgEntity.cif}
              </span>
            )}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setInteractionOpen(true)}
            className="inline-flex items-center gap-1.5 rounded-lg border border-[#e7e7e9] bg-white px-3 py-1.5 text-xs font-medium text-[#121212] transition hover:bg-[#f7f7f8]"
          >
            <MessageSquarePlus className="h-3.5 w-3.5 text-[#0d5fea]" />
            Registrar interacción
          </button>

          {leadEntity && (
            <button
              type="button"
              disabled={qualifying}
              onClick={() => void handleQualifyLead()}
              className="inline-flex items-center gap-1.5 rounded-lg border border-[#0d5fea]/30 bg-[#0d5fea]/5 px-3 py-1.5 text-xs font-semibold text-[#0d5fea] transition hover:bg-[#0d5fea]/10 disabled:opacity-50"
            >
              <Sparkles className={`h-3.5 w-3.5 ${qualifying ? "animate-spin" : ""}`} />
              {qualifying ? "Cualificando..." : "Cualificar IA"}
            </button>
          )}

          {leadEntity && !isLeadConverted && (
            <button
              type="button"
              onClick={() => setConvertOpen(true)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-700 transition hover:bg-emerald-100"
            >
              <ArrowRightCircle className="h-3.5 w-3.5" />
              Convertir a CRM
            </button>
          )}

          <button
            type="button"
            onClick={handleAskCopilot}
            className="inline-flex items-center gap-1.5 rounded-lg bg-[#0d5fea] px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-[#0b52cc]"
          >
            <Sparkles className="h-3.5 w-3.5" />
            Preguntar al Copiloto
          </button>

          <button
            type="button"
            onClick={openEditModal}
            className="inline-flex items-center gap-1.5 rounded-lg border border-[#e7e7e9] bg-white px-3 py-1.5 text-xs font-medium text-neutral-700 transition hover:bg-[#f7f7f8]"
          >
            <Pencil className="h-3.5 w-3.5" />
            Editar
          </button>
        </div>
      </div>

      {error && (
        <div className="flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-xs text-rose-800">
          <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {notice && (
        <div className="flex items-start gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-xs text-emerald-800">
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{notice}</span>
        </div>
      )}

      {/* 2-Column 360 Workspace */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Left column (2/3) */}
        <div className="space-y-5 lg:col-span-2">
          {/* Metadata card */}
          <div className="rounded-xl border border-[#e7e7e9] bg-white p-5">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-neutral-500">
              Ficha técnica y comercial
            </h2>

            {orgEntity && (
              <dl className="mt-3 grid grid-cols-1 gap-3 text-xs sm:grid-cols-2">
                <div>
                  <dt className="text-neutral-400">Razón social</dt>
                  <dd className="mt-0.5 font-medium text-[#121212]">{orgEntity.razon_social || "—"}</dd>
                </div>
                <div>
                  <dt className="text-neutral-400">CIF / NIF</dt>
                  <dd className="mt-0.5 font-mono font-medium text-[#121212]">{orgEntity.cif || "—"}</dd>
                </div>
                <div>
                  <dt className="text-neutral-400">Dirección fiscal</dt>
                  <dd className="mt-0.5 text-[#121212]">{orgEntity.direccion_fiscal || "—"}</dd>
                </div>
                <div>
                  <dt className="text-neutral-400">Sector / Web</dt>
                  <dd className="mt-0.5 text-[#121212]">
                    {orgEntity.sector || "—"} {orgEntity.website ? `· ${orgEntity.website}` : ""}
                  </dd>
                </div>
                <div>
                  <dt className="text-neutral-400">Email / Teléfono</dt>
                  <dd className="mt-0.5 text-[#121212]">
                    {orgEntity.email || "—"} {orgEntity.phone ? `· ${orgEntity.phone}` : ""}
                  </dd>
                </div>
                <div>
                  <dt className="text-neutral-400">Pipeline abierto</dt>
                  <dd className="mt-0.5 font-mono font-semibold text-emerald-700">
                    {formatEur(orgEntity.open_pipeline_eur ?? 0)} ({orgEntity.open_opportunities_count ?? 0})
                  </dd>
                </div>
              </dl>
            )}

            {clientEntity && (
              <dl className="mt-3 grid grid-cols-1 gap-3 text-xs sm:grid-cols-2">
                <div>
                  <dt className="text-neutral-400">Cargo</dt>
                  <dd className="mt-0.5 font-medium text-[#121212]">{clientEntity.job_title || "—"}</dd>
                </div>
                <div>
                  <dt className="text-neutral-400">RGPD / LOPDGDD</dt>
                  <dd className="mt-0.5 font-medium text-[#121212]">
                    {clientEntity.rgpd_consent
                      ? `Consentido (${formatDateTimeEs(clientEntity.rgpd_consent_date)})`
                      : "Pendiente de consentimiento"}
                  </dd>
                </div>
                <div>
                  <dt className="text-neutral-400">Email</dt>
                  <dd className="mt-0.5 text-[#121212]">{clientEntity.email || "—"}</dd>
                </div>
                <div>
                  <dt className="text-neutral-400">Teléfono</dt>
                  <dd className="mt-0.5 text-[#121212]">{clientEntity.phone || "—"}</dd>
                </div>
                <div>
                  <dt className="text-neutral-400">Pipeline asociado</dt>
                  <dd className="mt-0.5 font-mono font-semibold text-emerald-700">
                    {formatEur(clientEntity.open_pipeline_eur ?? 0)}
                  </dd>
                </div>
                <div>
                  <dt className="text-neutral-400">Actualizado</dt>
                  <dd className="mt-0.5 text-neutral-600">{formatDateTimeEs(clientEntity.updated_at)}</dd>
                </div>
              </dl>
            )}

            {leadEntity && (
              <dl className="mt-3 grid grid-cols-1 gap-3 text-xs sm:grid-cols-2">
                <div>
                  <dt className="text-neutral-400">Empresa</dt>
                  <dd className="mt-0.5 font-medium text-[#121212]">{leadEntity.company_name || "—"}</dd>
                </div>
                <div>
                  <dt className="text-neutral-400">Origen</dt>
                  <dd className="mt-0.5 text-[#121212]">{leadEntity.source || "—"}</dd>
                </div>
                <div>
                  <dt className="text-neutral-400">Email</dt>
                  <dd className="mt-0.5 text-[#121212]">{leadEntity.email || "—"}</dd>
                </div>
                <div>
                  <dt className="text-neutral-400">Teléfono</dt>
                  <dd className="mt-0.5 text-[#121212]">{leadEntity.phone || "—"}</dd>
                </div>
              </dl>
            )}

            {oppEntity && (
              <dl className="mt-3 grid grid-cols-1 gap-3 text-xs sm:grid-cols-2">
                <div>
                  <dt className="text-neutral-400">Importe</dt>
                  <dd className="mt-0.5 font-mono font-semibold text-[#121212]">
                    {formatEur(oppEntity.amount_eur)}
                  </dd>
                </div>
                <div>
                  <dt className="text-neutral-400">Probabilidad de cierre</dt>
                  <dd className="mt-0.5 font-medium text-[#121212]">{oppEntity.probability}%</dd>
                </div>
                <div>
                  <dt className="text-neutral-400">Cierre previsto</dt>
                  <dd className="mt-0.5 text-[#121212]">
                    {oppEntity.expected_close_date
                      ? formatDateTimeEs(oppEntity.expected_close_date)
                      : "Sin fecha"}
                  </dd>
                </div>
                <div>
                  <dt className="text-neutral-400">Última actualización</dt>
                  <dd className="mt-0.5 text-neutral-600">{formatDateTimeEs(oppEntity.updated_at)}</dd>
                </div>
              </dl>
            )}

            {typeof raw.notes === "string" && raw.notes.trim() && (
              <div className="mt-4 rounded-lg border border-[#e7e7e9] bg-[#f7f7f8] p-3 text-xs text-neutral-700 whitespace-pre-wrap">
                {raw.notes}
              </div>
            )}
          </div>

          {/* Linked tasks + Quick Add */}
          <div className="rounded-xl border border-[#e7e7e9] bg-white p-5 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <CheckSquare className="h-4 w-4 text-[#0d5fea]" />
                <h2 className="text-xs font-semibold uppercase tracking-wider text-neutral-500">
                  Tareas vinculadas ({data.tasks.length})
                </h2>
              </div>
              <Link to="/tasks" className="text-[11px] font-medium text-[#0d5fea] hover:underline">
                Ir a Tareas
              </Link>
            </div>

            <form onSubmit={(e) => void handleAddTask(e)} className="flex flex-wrap gap-2">
              <input
                type="text"
                value={newTaskTitle}
                onChange={(e) => setNewTaskTitle(e.target.value)}
                placeholder="Añadir tarea de seguimiento..."
                className="flex-1 min-w-[200px] rounded-lg border border-[#e7e7e9] bg-[#f7f7f8] px-3 py-1.5 text-xs text-[#121212] focus:border-[#0d5fea] focus:bg-white focus:outline-none"
              />
              <select
                value={newTaskPriority}
                onChange={(e) =>
                  setNewTaskPriority(e.target.value as "low" | "medium" | "high" | "urgent")
                }
                className="rounded-lg border border-[#e7e7e9] bg-white px-2.5 py-1.5 text-xs text-[#121212] focus:border-[#0d5fea] focus:outline-none"
              >
                <option value="urgent">Urgente</option>
                <option value="high">Alta</option>
                <option value="medium">Media</option>
                <option value="low">Baja</option>
              </select>
              <button
                type="submit"
                disabled={addingTask || !newTaskTitle.trim()}
                className="inline-flex items-center gap-1 rounded-lg bg-[#121212] px-3 py-1.5 text-xs font-semibold text-white hover:bg-neutral-800 disabled:opacity-50"
              >
                <Plus className="h-3.5 w-3.5" />
                Añadir
              </button>
            </form>

            {data.tasks.length === 0 ? (
              <div className="rounded-lg border border-dashed border-[#e7e7e9] py-6 text-center text-xs text-neutral-400">
                Sin tareas vinculadas todavía.
              </div>
            ) : (
              <div className="space-y-2">
                {data.tasks.map((task) => {
                  const done = task.status === "completed";
                  return (
                    <div
                      key={task.id}
                      className="flex items-center justify-between gap-3 rounded-lg border border-[#e7e7e9] px-3 py-2 text-xs"
                    >
                      <label className="flex items-center gap-2.5 min-w-0 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={done}
                          onChange={() => void handleToggleTask(task)}
                          className="h-4 w-4 rounded border-neutral-300 text-[#0d5fea]"
                        />
                        <span className={`truncate font-medium ${done ? "line-through text-neutral-400" : "text-[#121212]"}`}>
                          {task.title}
                        </span>
                      </label>
                      <div className="flex items-center gap-2 shrink-0">
                        <PriorityBadge priority={task.priority} />
                        {task.due_date && (
                          <span className="text-[11px] text-neutral-400">
                            {formatDateTimeEs(task.due_date)}
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Timeline */}
          <div className="rounded-xl border border-[#e7e7e9] bg-white p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-xs font-semibold uppercase tracking-wider text-neutral-500">
                Cronología de actividad ({data.activities.length})
              </h2>
              <button
                type="button"
                onClick={() => setInteractionOpen(true)}
                className="text-[11px] font-semibold text-[#0d5fea] hover:underline"
              >
                + Registrar interacción
              </button>
            </div>

            {data.activities.length === 0 ? (
              <div className="rounded-lg border border-dashed border-[#e7e7e9] py-6 text-center text-xs text-neutral-400">
                Sin actividad registrada todavía.
              </div>
            ) : (
              <div className="space-y-3">
                {data.activities.map((act) => (
                  <div
                    key={act.id}
                    className="rounded-lg border border-[#e7e7e9] bg-[#f7f7f8]/60 p-3 space-y-1.5"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <ActorBadge
                        actorType={act.actor_type}
                        actorName={act.actor_name}
                        modelUsed={act.model_used}
                      />
                      <span className="text-[11px] text-neutral-400">
                        {formatDateTimeEs(act.timestamp || act.created_at)}
                      </span>
                    </div>
                    <div className="text-xs font-medium text-[#121212]">
                      {act.description || act.action}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Right column: Relations (1/3) */}
        <div className="space-y-4">
          {data.organization && entityType !== "organization" && (
            <div className="rounded-xl border border-[#e7e7e9] bg-white p-4 space-y-2">
              <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-neutral-500">
                <Building2 className="h-3.5 w-3.5 text-[#0d5fea]" />
                Organización
              </div>
              <Link
                to={`/organization/${data.organization.id}`}
                className="block rounded-lg border border-[#e7e7e9] bg-[#f7f7f8] p-3 transition hover:border-[#0d5fea]/40"
              >
                <div className="text-xs font-semibold text-[#121212]">{data.organization.name}</div>
                <div className="mt-0.5 text-[11px] text-neutral-500">
                  {data.organization.cif || "Sin CIF"} · {formatEur(data.organization.open_pipeline_eur ?? 0)}
                </div>
              </Link>
            </div>
          )}

          <div className="rounded-xl border border-[#e7e7e9] bg-white p-4 space-y-2.5">
            <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-neutral-500">
              <Target className="h-3.5 w-3.5 text-[#0d5fea]" />
              Oportunidades ({data.opportunities.length})
            </div>
            {data.opportunities.length === 0 ? (
              <div className="text-xs text-neutral-400">Sin oportunidades vinculadas.</div>
            ) : (
              <div className="space-y-2">
                {data.opportunities.map((op) => (
                  <Link
                    key={op.id}
                    to={`/opportunity/${op.id}`}
                    className="block rounded-lg border border-[#e7e7e9] bg-[#f7f7f8] p-2.5 transition hover:border-[#0d5fea]/40"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate text-xs font-semibold text-[#121212]">{op.title}</span>
                      <span className="shrink-0 font-mono text-[11px] font-semibold text-emerald-700">
                        {formatEur(op.amount_eur)}
                      </span>
                    </div>
                    <div className="mt-0.5 text-[10px] text-neutral-500">
                      Etapa: {op.stage} · {op.probability}%
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </div>

          <div className="rounded-xl border border-[#e7e7e9] bg-white p-4 space-y-2.5">
            <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-neutral-500">
              <Users className="h-3.5 w-3.5 text-[#0d5fea]" />
              Contactos / Clientes ({data.clients.length})
            </div>
            {data.clients.length === 0 ? (
              <div className="text-xs text-neutral-400">Sin contactos asociados.</div>
            ) : (
              <div className="space-y-2">
                {data.clients.map((cli) => (
                  <Link
                    key={cli.id}
                    to={`/client/${cli.id}`}
                    className="block rounded-lg border border-[#e7e7e9] bg-[#f7f7f8] p-2.5 transition hover:border-[#0d5fea]/40"
                  >
                    <div className="text-xs font-semibold text-[#121212]">{cli.full_name}</div>
                    <div className="mt-0.5 text-[11px] text-neutral-500">
                      {cli.job_title || cli.email || "Contacto"}
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </div>

          {data.leads.length > 0 && entityType !== "lead" && (
            <div className="rounded-xl border border-[#e7e7e9] bg-white p-4 space-y-2.5">
              <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-neutral-500">
                <UserPlus className="h-3.5 w-3.5 text-[#0d5fea]" />
                Leads relacionados ({data.leads.length})
              </div>
              <div className="space-y-2">
                {data.leads.map((ld) => (
                  <Link
                    key={ld.id}
                    to={`/lead/${ld.id}`}
                    className="flex items-center justify-between rounded-lg border border-[#e7e7e9] bg-[#f7f7f8] p-2.5 transition hover:border-[#0d5fea]/40"
                  >
                    <div className="min-w-0">
                      <div className="truncate text-xs font-semibold text-[#121212]">{ld.full_name}</div>
                      <div className="text-[10px] text-neutral-500">{ld.status}</div>
                    </div>
                    <ScorePill score={ld.score} />
                  </Link>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Modales */}
      <LogInteractionModal
        open={interactionOpen}
        entityType={entityType}
        entityId={entityId}
        entityLabel={entityLabel}
        onClose={() => setInteractionOpen(false)}
        onSaved={() => {
          setNotice("Interacción registrada en la cronología.");
          void load360();
        }}
      />

      {orgEntity && (
        <EditOrganizationModal
          open={editOrgOpen}
          organization={orgEntity}
          onClose={() => setEditOrgOpen(false)}
          onSaved={() => {
            setNotice("Organización actualizada.");
            void load360();
          }}
        />
      )}

      {clientEntity && (
        <EditClientModal
          open={editClientOpen}
          client={clientEntity}
          organizations={allOrgs}
          onClose={() => setEditClientOpen(false)}
          onSaved={() => {
            setNotice("Cliente actualizado.");
            void load360();
          }}
        />
      )}

      {oppEntity && (
        <OpportunityModal
          open={editOppOpen}
          opportunity={oppEntity}
          organizations={allOrgs}
          clients={allClients}
          onClose={() => setEditOppOpen(false)}
          onSaved={() => {
            setNotice("Oportunidad actualizada.");
            void load360();
          }}
        />
      )}

      {leadEntity && (
        <>
          <ConvertLeadModal
            lead={convertOpen ? leadEntity : null}
            organizations={allOrgs}
            clients={allClients}
            onClose={() => setConvertOpen(false)}
            onConverted={() => {
              setConvertOpen(false);
              setNotice("Lead convertido a Organización + Cliente + Oportunidad.");
              void load360();
            }}
          />

          <Modal
            open={editLeadOpen}
            onClose={() => setEditLeadOpen(false)}
            title="Editar lead"
            maxWidthClass="max-w-lg"
          >
            <form onSubmit={(e) => void handleSaveLead(e)} className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-neutral-700">Nombre *</label>
                <input
                  type="text"
                  required
                  value={leadForm.full_name}
                  onChange={(e) => setLeadForm((p) => ({ ...p, full_name: e.target.value }))}
                  className="mt-1 w-full rounded-lg border border-[#e7e7e9] px-3 py-2 text-sm text-[#121212] focus:border-[#0d5fea] focus:outline-none"
                />
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label className="block text-xs font-medium text-neutral-700">Empresa</label>
                  <input
                    type="text"
                    value={leadForm.company_name}
                    onChange={(e) => setLeadForm((p) => ({ ...p, company_name: e.target.value }))}
                    className="mt-1 w-full rounded-lg border border-[#e7e7e9] px-3 py-2 text-sm text-[#121212] focus:border-[#0d5fea] focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-neutral-700">Origen</label>
                  <input
                    type="text"
                    value={leadForm.source}
                    onChange={(e) => setLeadForm((p) => ({ ...p, source: e.target.value }))}
                    className="mt-1 w-full rounded-lg border border-[#e7e7e9] px-3 py-2 text-sm text-[#121212] focus:border-[#0d5fea] focus:outline-none"
                  />
                </div>
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label className="block text-xs font-medium text-neutral-700">Email</label>
                  <input
                    type="email"
                    value={leadForm.email}
                    onChange={(e) => setLeadForm((p) => ({ ...p, email: e.target.value }))}
                    className="mt-1 w-full rounded-lg border border-[#e7e7e9] px-3 py-2 text-sm text-[#121212] focus:border-[#0d5fea] focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-neutral-700">Teléfono</label>
                  <input
                    type="text"
                    value={leadForm.phone}
                    onChange={(e) => setLeadForm((p) => ({ ...p, phone: e.target.value }))}
                    className="mt-1 w-full rounded-lg border border-[#e7e7e9] px-3 py-2 text-sm text-[#121212] focus:border-[#0d5fea] focus:outline-none"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-neutral-700">Notas</label>
                <textarea
                  rows={3}
                  value={leadForm.notes}
                  onChange={(e) => setLeadForm((p) => ({ ...p, notes: e.target.value }))}
                  className="mt-1 w-full rounded-lg border border-[#e7e7e9] px-3 py-2 text-sm text-[#121212] focus:border-[#0d5fea] focus:outline-none"
                />
              </div>
              <div className="flex justify-end gap-2 border-t border-[#e7e7e9] pt-3">
                <button
                  type="button"
                  onClick={() => setEditLeadOpen(false)}
                  className="rounded-lg border border-[#e7e7e9] px-3.5 py-2 text-xs font-medium text-neutral-700 hover:bg-[#f7f7f8]"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={savingLead}
                  className="rounded-lg bg-[#0d5fea] px-4 py-2 text-xs font-semibold text-white hover:bg-[#0b52cc] disabled:opacity-50"
                >
                  {savingLead ? "Guardando..." : "Guardar cambios"}
                </button>
              </div>
            </form>
          </Modal>
        </>
      )}
    </div>
  );
};
