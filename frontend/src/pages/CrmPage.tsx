import React, { useCallback, useEffect, useState } from "react";
import {
  Building2,
  CheckSquare,
  Pencil,
  Plus,
  ShieldCheck,
  Sparkles,
  Target,
  Trash2,
  UserPlus,
  Users,
  X,
} from "lucide-react";
import { aiApi, ApiError, crmApi } from "../api/client";
import type { Client, Lead, Opportunity, Organization, Task } from "../types/api";
import { formatDateTimeEs, formatEur } from "../utils/format";

type CrmTab = "organizations" | "clients" | "leads" | "opportunities" | "tasks";

const TABS: { key: CrmTab; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { key: "organizations", label: "Organizaciones", icon: Building2 },
  { key: "clients", label: "Contactos", icon: Users },
  { key: "leads", label: "Leads", icon: UserPlus },
  { key: "opportunities", label: "Oportunidades", icon: Target },
  { key: "tasks", label: "Tareas", icon: CheckSquare },
];

export const CrmPage: React.FC = () => {
  const [tab, setTab] = useState<CrmTab>("organizations");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [hasDefaultByok, setHasDefaultByok] = useState(false);

  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [opportunities, setOpportunities] = useState<Opportunity[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);

  // Modal de creación/edición
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);

  // Campos compartidos de formulario según subpestaña
  const [orgForm, setOrgForm] = useState({
    name: "",
    cif: "",
    razon_social: "",
    direccion_fiscal: "",
    sector: "",
    email: "",
    phone: "",
    website: "",
  });

  const [clientForm, setClientForm] = useState({
    organization_id: "",
    full_name: "",
    email: "",
    phone: "",
    job_title: "",
    rgpd_consent: false,
  });

  const [leadForm, setLeadForm] = useState({
    organization_id: "",
    full_name: "",
    company_name: "",
    email: "",
    phone: "",
    source: "",
    status: "new",
    score: "",
  });

  const [oppForm, setOppForm] = useState({
    organization_id: "",
    client_id: "",
    title: "",
    amount_eur: "0",
    stage: "qualification",
    probability: "25",
  });

  const [taskForm, setTaskForm] = useState({
    organization_id: "",
    opportunity_id: "",
    title: "",
    description: "",
    status: "pending",
    priority: "medium",
  });

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [orgs, clis, lds, opps, tks, proactive] = await Promise.all([
        crmApi.listOrganizations(),
        crmApi.listClients(),
        crmApi.listLeads(),
        crmApi.listOpportunities(),
        crmApi.listTasks(),
        aiApi.getProactiveStatus().catch(() => null),
      ]);
      setOrganizations(orgs);
      setClients(clis);
      setLeads(lds);
      setOpportunities(opps);
      setTasks(tks);
      setHasDefaultByok(Boolean(proactive?.has_default_byok));
    } catch (err) {
      setError(err instanceof ApiError ? err.detail : "Error al cargar los datos del CRM.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const orgNameById = (id: number | null) =>
    organizations.find((o) => o.id === id)?.name || (id ? `#${id}` : "—");

  const openCreateModal = () => {
    setEditingId(null);
    setOrgForm({
      name: "",
      cif: "",
      razon_social: "",
      direccion_fiscal: "",
      sector: "",
      email: "",
      phone: "",
      website: "",
    });
    setClientForm({
      organization_id: "",
      full_name: "",
      email: "",
      phone: "",
      job_title: "",
      rgpd_consent: false,
    });
    setLeadForm({
      organization_id: "",
      full_name: "",
      company_name: "",
      email: "",
      phone: "",
      source: "",
      status: "new",
      score: "",
    });
    setOppForm({
      organization_id: "",
      client_id: "",
      title: "",
      amount_eur: "0",
      stage: "qualification",
      probability: "25",
    });
    setTaskForm({
      organization_id: "",
      opportunity_id: "",
      title: "",
      description: "",
      status: "pending",
      priority: "medium",
    });
    setModalOpen(true);
  };

  const openEditOrganization = (o: Organization) => {
    setEditingId(o.id);
    setOrgForm({
      name: o.name,
      cif: o.cif || "",
      razon_social: o.razon_social || "",
      direccion_fiscal: o.direccion_fiscal || "",
      sector: o.sector || "",
      email: o.email || "",
      phone: o.phone || "",
      website: o.website || "",
    });
    setModalOpen(true);
  };

  const openEditClient = (c: Client) => {
    setEditingId(c.id);
    setClientForm({
      organization_id: c.organization_id ? String(c.organization_id) : "",
      full_name: c.full_name,
      email: c.email || "",
      phone: c.phone || "",
      job_title: c.job_title || "",
      rgpd_consent: c.rgpd_consent,
    });
    setModalOpen(true);
  };

  const openEditLead = (l: Lead) => {
    setEditingId(l.id);
    setLeadForm({
      organization_id: l.organization_id ? String(l.organization_id) : "",
      full_name: l.full_name,
      company_name: l.company_name || "",
      email: l.email || "",
      phone: l.phone || "",
      source: l.source || "",
      status: l.status,
      score: l.score !== null ? String(l.score) : "",
    });
    setModalOpen(true);
  };

  const openEditOpportunity = (op: Opportunity) => {
    setEditingId(op.id);
    setOppForm({
      organization_id: op.organization_id ? String(op.organization_id) : "",
      client_id: op.client_id ? String(op.client_id) : "",
      title: op.title,
      amount_eur: String(op.amount_eur),
      stage: op.stage,
      probability: String(op.probability),
    });
    setModalOpen(true);
  };

  const openEditTask = (t: Task) => {
    setEditingId(t.id);
    setTaskForm({
      organization_id: t.organization_id ? String(t.organization_id) : "",
      opportunity_id: t.opportunity_id ? String(t.opportunity_id) : "",
      title: t.title,
      description: t.description || "",
      status: t.status,
      priority: t.priority,
    });
    setModalOpen(true);
  };

  const handleSaveModal = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      if (tab === "organizations") {
        const payload = {
          name: orgForm.name.trim(),
          cif: orgForm.cif.trim() || undefined,
          razon_social: orgForm.razon_social.trim() || undefined,
          direccion_fiscal: orgForm.direccion_fiscal.trim() || undefined,
          sector: orgForm.sector.trim() || undefined,
          email: orgForm.email.trim() || undefined,
          phone: orgForm.phone.trim() || undefined,
          website: orgForm.website.trim() || undefined,
        };
        if (editingId) await crmApi.updateOrganization(editingId, payload);
        else await crmApi.createOrganization(payload);
      } else if (tab === "clients") {
        const payload = {
          organization_id: clientForm.organization_id ? Number(clientForm.organization_id) : null,
          full_name: clientForm.full_name.trim(),
          email: clientForm.email.trim() || undefined,
          phone: clientForm.phone.trim() || undefined,
          job_title: clientForm.job_title.trim() || undefined,
          rgpd_consent: clientForm.rgpd_consent,
        };
        if (editingId) await crmApi.updateClient(editingId, payload);
        else await crmApi.createClient(payload);
      } else if (tab === "leads") {
        const payload = {
          organization_id: leadForm.organization_id ? Number(leadForm.organization_id) : null,
          full_name: leadForm.full_name.trim(),
          company_name: leadForm.company_name.trim() || undefined,
          email: leadForm.email.trim() || undefined,
          phone: leadForm.phone.trim() || undefined,
          source: leadForm.source.trim() || undefined,
          status: leadForm.status,
          score: leadForm.score !== "" ? Number(leadForm.score) : null,
        };
        if (editingId) {
          await crmApi.updateLead(editingId, payload);
        } else {
          await crmApi.createLead(payload);
          if (hasDefaultByok) {
            setNotice(
              "Lead guardado. El agente BYOK lo está analizando para proponer seguimiento en Supervisión HITL."
            );
          }
        }
      } else if (tab === "opportunities") {
        const payload = {
          organization_id: oppForm.organization_id ? Number(oppForm.organization_id) : null,
          client_id: oppForm.client_id ? Number(oppForm.client_id) : null,
          title: oppForm.title.trim(),
          amount_eur: Number(oppForm.amount_eur || 0),
          stage: oppForm.stage,
          probability: Number(oppForm.probability || 0),
        };
        if (editingId) await crmApi.updateOpportunity(editingId, payload);
        else await crmApi.createOpportunity(payload);
      } else if (tab === "tasks") {
        const payload = {
          organization_id: taskForm.organization_id ? Number(taskForm.organization_id) : null,
          opportunity_id: taskForm.opportunity_id ? Number(taskForm.opportunity_id) : null,
          title: taskForm.title.trim(),
          description: taskForm.description.trim() || undefined,
          status: taskForm.status,
          priority: taskForm.priority,
        };
        if (editingId) await crmApi.updateTask(editingId, payload);
        else await crmApi.createTask(payload);
      }
      setModalOpen(false);
      await loadData();
    } catch (err) {
      setError(err instanceof ApiError ? err.detail : "No se pudo guardar el registro.");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (entity: CrmTab, id: number) => {
    setError(null);
    try {
      if (entity === "organizations") await crmApi.deleteOrganization(id);
      else if (entity === "clients") await crmApi.deleteClient(id);
      else if (entity === "leads") await crmApi.deleteLead(id);
      else if (entity === "opportunities") await crmApi.deleteOpportunity(id);
      else await crmApi.deleteTask(id);
      await loadData();
    } catch (err) {
      setError(err instanceof ApiError ? err.detail : "No se pudo eliminar el registro.");
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">CRM Operativo</h1>
          <p className="mt-1 text-sm text-slate-600">
            Gestión base multi-tenant con datos fiscales españoles, consentimiento RGPD y oportunidades en EUR.
          </p>
        </div>

        <button
          type="button"
          onClick={openCreateModal}
          className="inline-flex items-center gap-1.5 self-start rounded-lg bg-indigo-600 px-3.5 py-2 text-xs font-semibold text-white shadow-xs transition hover:bg-indigo-500"
        >
          <Plus className="h-4 w-4" />
          Nuevo registro
        </button>
      </div>

      <div className="flex flex-wrap gap-2 border-b border-slate-200 pb-3">
        {TABS.map((t) => {
          const Icon = t.icon;
          return (
            <button
              key={t.key}
              type="button"
              onClick={() => setTab(t.key)}
              className={`inline-flex items-center gap-1.5 rounded-lg px-3.5 py-1.5 text-sm font-medium transition ${
                tab === t.key
                  ? "bg-slate-900 text-white"
                  : "border border-slate-200 bg-white text-slate-600 hover:bg-slate-100"
              }`}
            >
              <Icon className="h-4 w-4" />
              {t.label}
            </button>
          );
        })}
      </div>

      {error && (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
          {error}
        </div>
      )}

      {notice && (
        <div className="flex items-start gap-2 rounded-xl border border-indigo-200 bg-indigo-50 px-4 py-3 text-sm text-indigo-900">
          <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-indigo-600" />
          <span>{notice}</span>
        </div>
      )}

      {loading ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-10 text-center text-sm text-slate-500">
          Cargando registros del CRM...
        </div>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-xs">
          {tab === "organizations" && (
            <table className="w-full text-left text-xs">
              <thead className="border-b border-slate-200 bg-slate-50 text-slate-600">
                <tr>
                  <th className="px-4 py-3 font-semibold">Nombre</th>
                  <th className="px-4 py-3 font-semibold">CIF</th>
                  <th className="px-4 py-3 font-semibold">Razón social</th>
                  <th className="px-4 py-3 font-semibold">Dirección fiscal</th>
                  <th className="px-4 py-3 font-semibold">Sector</th>
                  <th className="px-4 py-3 text-right font-semibold">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {organizations.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-8 text-center text-slate-500">
                      Sin organizaciones registradas.
                    </td>
                  </tr>
                ) : (
                  organizations.map((o) => (
                    <tr key={o.id} className="hover:bg-slate-50/70">
                      <td className="px-4 py-3 font-semibold text-slate-900">{o.name}</td>
                      <td className="px-4 py-3 font-mono text-slate-700">{o.cif || "—"}</td>
                      <td className="px-4 py-3 text-slate-700">{o.razon_social || "—"}</td>
                      <td className="px-4 py-3 text-slate-600">{o.direccion_fiscal || "—"}</td>
                      <td className="px-4 py-3 text-slate-600">{o.sector || "—"}</td>
                      <td className="px-4 py-3 text-right space-x-1.5">
                        <button
                          type="button"
                          onClick={() => openEditOrganization(o)}
                          className="inline-flex rounded-md border border-slate-200 p-1.5 text-slate-600 hover:bg-slate-100"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => void handleDelete("organizations", o.id)}
                          className="inline-flex rounded-md border border-rose-200 p-1.5 text-rose-600 hover:bg-rose-50"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          )}

          {tab === "clients" && (
            <table className="w-full text-left text-xs">
              <thead className="border-b border-slate-200 bg-slate-50 text-slate-600">
                <tr>
                  <th className="px-4 py-3 font-semibold">Nombre completo</th>
                  <th className="px-4 py-3 font-semibold">Organización</th>
                  <th className="px-4 py-3 font-semibold">Cargo</th>
                  <th className="px-4 py-3 font-semibold">Email</th>
                  <th className="px-4 py-3 font-semibold">Consentimiento RGPD</th>
                  <th className="px-4 py-3 text-right font-semibold">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {clients.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-8 text-center text-slate-500">
                      Sin contactos registrados.
                    </td>
                  </tr>
                ) : (
                  clients.map((c) => (
                    <tr key={c.id} className="hover:bg-slate-50/70">
                      <td className="px-4 py-3 font-semibold text-slate-900">{c.full_name}</td>
                      <td className="px-4 py-3 text-slate-700">{orgNameById(c.organization_id)}</td>
                      <td className="px-4 py-3 text-slate-600">{c.job_title || "—"}</td>
                      <td className="px-4 py-3 text-slate-600">{c.email || "—"}</td>
                      <td className="px-4 py-3">
                        {c.rgpd_consent ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-0.5 font-medium text-emerald-700 border border-emerald-200">
                            <ShieldCheck className="h-3 w-3" />
                            Aceptado ({formatDateTimeEs(c.rgpd_consent_date)})
                          </span>
                        ) : (
                          <span className="rounded-full bg-amber-50 px-2.5 py-0.5 font-medium text-amber-700 border border-amber-200">
                            Sin consentimiento
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right space-x-1.5">
                        <button
                          type="button"
                          onClick={() => openEditClient(c)}
                          className="inline-flex rounded-md border border-slate-200 p-1.5 text-slate-600 hover:bg-slate-100"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => void handleDelete("clients", c.id)}
                          className="inline-flex rounded-md border border-rose-200 p-1.5 text-rose-600 hover:bg-rose-50"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          )}

          {tab === "leads" && (
            <table className="w-full text-left text-xs">
              <thead className="border-b border-slate-200 bg-slate-50 text-slate-600">
                <tr>
                  <th className="px-4 py-3 font-semibold">Nombre</th>
                  <th className="px-4 py-3 font-semibold">Empresa</th>
                  <th className="px-4 py-3 font-semibold">Email</th>
                  <th className="px-4 py-3 font-semibold">Origen</th>
                  <th className="px-4 py-3 font-semibold">Estado</th>
                  <th className="px-4 py-3 font-semibold">Score</th>
                  <th className="px-4 py-3 text-right font-semibold">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {leads.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-4 py-8 text-center text-slate-500">
                      Sin leads registrados.
                    </td>
                  </tr>
                ) : (
                  leads.map((l) => (
                    <tr key={l.id} className="hover:bg-slate-50/70">
                      <td className="px-4 py-3 font-semibold text-slate-900">{l.full_name}</td>
                      <td className="px-4 py-3 text-slate-700">{l.company_name || "—"}</td>
                      <td className="px-4 py-3 text-slate-600">{l.email || "—"}</td>
                      <td className="px-4 py-3 text-slate-600">{l.source || "—"}</td>
                      <td className="px-4 py-3">
                        <span className="rounded-md bg-slate-100 px-2 py-0.5 font-mono text-[11px] text-slate-700">
                          {l.status}
                        </span>
                      </td>
                      <td className="px-4 py-3 font-semibold text-slate-700">
                        {l.score !== null ? `${l.score}/100` : "—"}
                      </td>
                      <td className="px-4 py-3 text-right space-x-1.5">
                        <button
                          type="button"
                          onClick={() => openEditLead(l)}
                          className="inline-flex rounded-md border border-slate-200 p-1.5 text-slate-600 hover:bg-slate-100"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => void handleDelete("leads", l.id)}
                          className="inline-flex rounded-md border border-rose-200 p-1.5 text-rose-600 hover:bg-rose-50"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          )}

          {tab === "opportunities" && (
            <table className="w-full text-left text-xs">
              <thead className="border-b border-slate-200 bg-slate-50 text-slate-600">
                <tr>
                  <th className="px-4 py-3 font-semibold">Título</th>
                  <th className="px-4 py-3 font-semibold">Organización</th>
                  <th className="px-4 py-3 font-semibold">Importe (EUR)</th>
                  <th className="px-4 py-3 font-semibold">Etapa</th>
                  <th className="px-4 py-3 font-semibold">Probabilidad</th>
                  <th className="px-4 py-3 text-right font-semibold">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {opportunities.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-8 text-center text-slate-500">
                      Sin oportunidades registradas.
                    </td>
                  </tr>
                ) : (
                  opportunities.map((op) => (
                    <tr key={op.id} className="hover:bg-slate-50/70">
                      <td className="px-4 py-3 font-semibold text-slate-900">{op.title}</td>
                      <td className="px-4 py-3 text-slate-700">{orgNameById(op.organization_id)}</td>
                      <td className="px-4 py-3 font-semibold text-emerald-700">
                        {formatEur(op.amount_eur)}
                      </td>
                      <td className="px-4 py-3">
                        <span className="rounded-md bg-indigo-50 px-2 py-0.5 font-mono text-[11px] text-indigo-700">
                          {op.stage}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-slate-700">{op.probability}%</td>
                      <td className="px-4 py-3 text-right space-x-1.5">
                        <button
                          type="button"
                          onClick={() => openEditOpportunity(op)}
                          className="inline-flex rounded-md border border-slate-200 p-1.5 text-slate-600 hover:bg-slate-100"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => void handleDelete("opportunities", op.id)}
                          className="inline-flex rounded-md border border-rose-200 p-1.5 text-rose-600 hover:bg-rose-50"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          )}

          {tab === "tasks" && (
            <table className="w-full text-left text-xs">
              <thead className="border-b border-slate-200 bg-slate-50 text-slate-600">
                <tr>
                  <th className="px-4 py-3 font-semibold">Título</th>
                  <th className="px-4 py-3 font-semibold">Organización</th>
                  <th className="px-4 py-3 font-semibold">Estado</th>
                  <th className="px-4 py-3 font-semibold">Prioridad</th>
                  <th className="px-4 py-3 text-right font-semibold">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {tasks.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-4 py-8 text-center text-slate-500">
                      Sin tareas registradas.
                    </td>
                  </tr>
                ) : (
                  tasks.map((t) => (
                    <tr key={t.id} className="hover:bg-slate-50/70">
                      <td className="px-4 py-3 font-semibold text-slate-900">
                        <div>{t.title}</div>
                        {t.description && (
                          <div className="mt-0.5 font-normal text-slate-500">{t.description}</div>
                        )}
                      </td>
                      <td className="px-4 py-3 text-slate-700">{orgNameById(t.organization_id)}</td>
                      <td className="px-4 py-3">
                        <span className="rounded-md bg-slate-100 px-2 py-0.5 font-mono text-[11px] text-slate-700">
                          {t.status}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-slate-700">{t.priority}</td>
                      <td className="px-4 py-3 text-right space-x-1.5">
                        <button
                          type="button"
                          onClick={() => openEditTask(t)}
                          className="inline-flex rounded-md border border-slate-200 p-1.5 text-slate-600 hover:bg-slate-100"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => void handleDelete("tasks", t.id)}
                          className="inline-flex rounded-md border border-rose-200 p-1.5 text-rose-600 hover:bg-rose-50"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* Modal crear / editar */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4">
          <div className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h2 className="text-base font-bold text-slate-900">
                {editingId ? "Editar registro" : "Nuevo registro"} ·{" "}
                {TABS.find((t) => t.key === tab)?.label}
              </h2>
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={handleSaveModal} className="mt-4 space-y-3">
              {tab === "organizations" && (
                <>
                  <div>
                    <label className="block text-xs font-medium text-slate-700">Nombre *</label>
                    <input
                      type="text"
                      required
                      value={orgForm.name}
                      onChange={(e) => setOrgForm({ ...orgForm, name: e.target.value })}
                      className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                    />
                  </div>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <div>
                      <label className="block text-xs font-medium text-slate-700">CIF / NIF</label>
                      <input
                        type="text"
                        value={orgForm.cif}
                        onChange={(e) => setOrgForm({ ...orgForm, cif: e.target.value })}
                        placeholder="B12345678"
                        className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm uppercase"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-700">Sector</label>
                      <input
                        type="text"
                        value={orgForm.sector}
                        onChange={(e) => setOrgForm({ ...orgForm, sector: e.target.value })}
                        className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-700">Razón social</label>
                    <input
                      type="text"
                      value={orgForm.razon_social}
                      onChange={(e) => setOrgForm({ ...orgForm, razon_social: e.target.value })}
                      className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-700">Dirección fiscal</label>
                    <input
                      type="text"
                      value={orgForm.direccion_fiscal}
                      onChange={(e) => setOrgForm({ ...orgForm, direccion_fiscal: e.target.value })}
                      className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                    />
                  </div>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <div>
                      <label className="block text-xs font-medium text-slate-700">Email</label>
                      <input
                        type="email"
                        value={orgForm.email}
                        onChange={(e) => setOrgForm({ ...orgForm, email: e.target.value })}
                        className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-700">Teléfono</label>
                      <input
                        type="text"
                        value={orgForm.phone}
                        onChange={(e) => setOrgForm({ ...orgForm, phone: e.target.value })}
                        className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                      />
                    </div>
                  </div>
                </>
              )}

              {tab === "clients" && (
                <>
                  <div>
                    <label className="block text-xs font-medium text-slate-700">Nombre completo *</label>
                    <input
                      type="text"
                      required
                      value={clientForm.full_name}
                      onChange={(e) => setClientForm({ ...clientForm, full_name: e.target.value })}
                      className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-700">Organización</label>
                    <select
                      value={clientForm.organization_id}
                      onChange={(e) => setClientForm({ ...clientForm, organization_id: e.target.value })}
                      className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                    >
                      <option value="">Sin organización</option>
                      {organizations.map((o) => (
                        <option key={o.id} value={o.id}>
                          {o.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <div>
                      <label className="block text-xs font-medium text-slate-700">Email</label>
                      <input
                        type="email"
                        value={clientForm.email}
                        onChange={(e) => setClientForm({ ...clientForm, email: e.target.value })}
                        className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-700">Cargo</label>
                      <input
                        type="text"
                        value={clientForm.job_title}
                        onChange={(e) => setClientForm({ ...clientForm, job_title: e.target.value })}
                        className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                      />
                    </div>
                  </div>
                  <label className="inline-flex items-center gap-2 pt-1 text-xs font-medium text-slate-700">
                    <input
                      type="checkbox"
                      checked={clientForm.rgpd_consent}
                      onChange={(e) => setClientForm({ ...clientForm, rgpd_consent: e.target.checked })}
                      className="rounded border-slate-300 text-indigo-600"
                    />
                    Cuenta con consentimiento RGPD / LOPDGDD
                  </label>
                </>
              )}

              {tab === "leads" && (
                <>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <div>
                      <label className="block text-xs font-medium text-slate-700">Nombre completo *</label>
                      <input
                        type="text"
                        required
                        value={leadForm.full_name}
                        onChange={(e) => setLeadForm({ ...leadForm, full_name: e.target.value })}
                        className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-700">Empresa</label>
                      <input
                        type="text"
                        value={leadForm.company_name}
                        onChange={(e) => setLeadForm({ ...leadForm, company_name: e.target.value })}
                        className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <div>
                      <label className="block text-xs font-medium text-slate-700">Email</label>
                      <input
                        type="email"
                        value={leadForm.email}
                        onChange={(e) => setLeadForm({ ...leadForm, email: e.target.value })}
                        className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-700">Origen</label>
                      <input
                        type="text"
                        value={leadForm.source}
                        onChange={(e) => setLeadForm({ ...leadForm, source: e.target.value })}
                        placeholder="web / referido / evento"
                        className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <div>
                      <label className="block text-xs font-medium text-slate-700">Estado</label>
                      <select
                        value={leadForm.status}
                        onChange={(e) => setLeadForm({ ...leadForm, status: e.target.value })}
                        className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                      >
                        <option value="new">new</option>
                        <option value="contacted">contacted</option>
                        <option value="qualified">qualified</option>
                        <option value="disqualified">disqualified</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-700">Score (0-100)</label>
                      <input
                        type="number"
                        min={0}
                        max={100}
                        value={leadForm.score}
                        onChange={(e) => setLeadForm({ ...leadForm, score: e.target.value })}
                        className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                      />
                    </div>
                  </div>
                </>
              )}

              {tab === "opportunities" && (
                <>
                  <div>
                    <label className="block text-xs font-medium text-slate-700">Título *</label>
                    <input
                      type="text"
                      required
                      value={oppForm.title}
                      onChange={(e) => setOppForm({ ...oppForm, title: e.target.value })}
                      className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                    />
                  </div>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <div>
                      <label className="block text-xs font-medium text-slate-700">Organización</label>
                      <select
                        value={oppForm.organization_id}
                        onChange={(e) => setOppForm({ ...oppForm, organization_id: e.target.value })}
                        className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                      >
                        <option value="">Sin organización</option>
                        {organizations.map((o) => (
                          <option key={o.id} value={o.id}>
                            {o.name}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-700">Importe (EUR)</label>
                      <input
                        type="number"
                        min={0}
                        step="0.01"
                        value={oppForm.amount_eur}
                        onChange={(e) => setOppForm({ ...oppForm, amount_eur: e.target.value })}
                        className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <div>
                      <label className="block text-xs font-medium text-slate-700">Etapa</label>
                      <select
                        value={oppForm.stage}
                        onChange={(e) => setOppForm({ ...oppForm, stage: e.target.value })}
                        className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                      >
                        <option value="qualification">qualification</option>
                        <option value="proposal">proposal</option>
                        <option value="negotiation">negotiation</option>
                        <option value="closed_won">closed_won</option>
                        <option value="closed_lost">closed_lost</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-700">Probabilidad (%)</label>
                      <input
                        type="number"
                        min={0}
                        max={100}
                        value={oppForm.probability}
                        onChange={(e) => setOppForm({ ...oppForm, probability: e.target.value })}
                        className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                      />
                    </div>
                  </div>
                </>
              )}

              {tab === "tasks" && (
                <>
                  <div>
                    <label className="block text-xs font-medium text-slate-700">Título *</label>
                    <input
                      type="text"
                      required
                      value={taskForm.title}
                      onChange={(e) => setTaskForm({ ...taskForm, title: e.target.value })}
                      className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-700">Descripción</label>
                    <textarea
                      rows={2}
                      value={taskForm.description}
                      onChange={(e) => setTaskForm({ ...taskForm, description: e.target.value })}
                      className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                    />
                  </div>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                    <div>
                      <label className="block text-xs font-medium text-slate-700">Organización</label>
                      <select
                        value={taskForm.organization_id}
                        onChange={(e) => setTaskForm({ ...taskForm, organization_id: e.target.value })}
                        className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                      >
                        <option value="">Ninguna</option>
                        {organizations.map((o) => (
                          <option key={o.id} value={o.id}>
                            {o.name}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-700">Estado</label>
                      <select
                        value={taskForm.status}
                        onChange={(e) => setTaskForm({ ...taskForm, status: e.target.value })}
                        className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                      >
                        <option value="pending">pending</option>
                        <option value="in_progress">in_progress</option>
                        <option value="completed">completed</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-700">Prioridad</label>
                      <select
                        value={taskForm.priority}
                        onChange={(e) => setTaskForm({ ...taskForm, priority: e.target.value })}
                        className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                      >
                        <option value="low">low</option>
                        <option value="medium">medium</option>
                        <option value="high">high</option>
                      </select>
                    </div>
                  </div>
                </>
              )}

              <div className="flex justify-end gap-2 border-t border-slate-100 pt-4">
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  className="rounded-lg border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="rounded-lg bg-slate-900 px-4 py-2 text-xs font-semibold text-white hover:bg-slate-800 disabled:opacity-50"
                >
                  {saving ? "Guardando..." : "Guardar"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
