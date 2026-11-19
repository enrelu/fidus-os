import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  CheckCircle2,
  Kanban,
  Plus,
  Search,
  Send,
  ShieldAlert,
  Sparkles,
  Table2,
  UserPlus,
} from "lucide-react";
import { aiApi, ApiError, crmApi } from "../api/client";
import { ConvertLeadModal } from "../components/ConvertLeadModal";
import { LeadKanbanBoard } from "../components/LeadKanbanBoard";
import { LeadTableView } from "../components/LeadTableView";
import { Modal } from "../components/ui";
import type { Client, Lead, Organization } from "../types/api";

type ScopeFilter = "open" | "all" | "closed";
type ViewMode = "table" | "kanban";

const CLOSED_STATUSES = new Set(["converted", "unqualified", "disqualified", "lost"]);

export const LeadsPage: React.FC = () => {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [search, setSearch] = useState("");
  const [scopeFilter, setScopeFilter] = useState<ScopeFilter>("open");
  const [viewMode, setViewMode] = useState<ViewMode>("table");
  const [qualifyingId, setQualifyingId] = useState<number | null>(null);

  // Modales
  const [formOpen, setFormOpen] = useState(false);
  const [editingLead, setEditingLead] = useState<Lead | null>(null);
  const [savingLead, setSavingLead] = useState(false);
  const [leadForm, setLeadForm] = useState({
    organization_id: "",
    full_name: "",
    company_name: "",
    email: "",
    phone: "",
    source: "",
    status: "new",
    score: "",
    notes: "",
  });

  const [convertingLead, setConvertingLead] = useState<Lead | null>(null);

  // Modal Ingesta IA
  const [ingestOpen, setIngestOpen] = useState(false);
  const [ingestText, setIngestText] = useState("");
  const [ingestOrgId, setIngestOrgId] = useState("");
  const [ingesting, setIngesting] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [lds, orgs, clis] = await Promise.all([
        crmApi.listLeads(),
        crmApi.listOrganizations(),
        crmApi.listClients(),
      ]);
      setLeads(lds);
      setOrganizations(orgs);
      setClients(clis);
    } catch (err) {
      setError(err instanceof ApiError ? err.detail : "Error al cargar los leads.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  useEffect(() => {
    const onUpdated = () => void loadData();
    window.addEventListener("fidus:crm-updated", onUpdated);
    return () => window.removeEventListener("fidus:crm-updated", onUpdated);
  }, [loadData]);

  const filteredLeads = useMemo(() => {
    const q = search.trim().toLowerCase();
    return leads.filter((l) => {
      const st = (l.status || "new").trim().toLowerCase();
      const isClosed = CLOSED_STATUSES.has(st);
      if (scopeFilter === "open" && isClosed) return false;
      if (scopeFilter === "closed" && !isClosed) return false;
      if (!q) return true;
      return (
        l.full_name.toLowerCase().includes(q) ||
        (l.company_name || "").toLowerCase().includes(q) ||
        (l.email || "").toLowerCase().includes(q) ||
        (l.source || "").toLowerCase().includes(q)
      );
    });
  }, [leads, scopeFilter, search]);

  const openCreateModal = () => {
    setEditingLead(null);
    setLeadForm({
      organization_id: "",
      full_name: "",
      company_name: "",
      email: "",
      phone: "",
      source: "",
      status: "new",
      score: "",
      notes: "",
    });
    setFormOpen(true);
  };

  const openEditModal = (lead: Lead) => {
    setEditingLead(lead);
    setLeadForm({
      organization_id: lead.organization_id ? String(lead.organization_id) : "",
      full_name: lead.full_name,
      company_name: lead.company_name || "",
      email: lead.email || "",
      phone: lead.phone || "",
      source: lead.source || "",
      status: lead.status,
      score: lead.score !== null ? String(lead.score) : "",
      notes: lead.notes || "",
    });
    setFormOpen(true);
  };

  const handleSaveLead = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingLead(true);
    setError(null);
    setNotice(null);
    try {
      const payload = {
        organization_id: leadForm.organization_id ? Number(leadForm.organization_id) : null,
        full_name: leadForm.full_name.trim(),
        company_name: leadForm.company_name.trim() || undefined,
        email: leadForm.email.trim() || undefined,
        phone: leadForm.phone.trim() || undefined,
        source: leadForm.source.trim() || undefined,
        status: leadForm.status,
        score: leadForm.score !== "" ? Number(leadForm.score) : null,
        notes: leadForm.notes.trim() || undefined,
      };
      if (editingLead) {
        await crmApi.updateLead(editingLead.id, payload);
        setNotice(`Lead «${payload.full_name}» actualizado.`);
      } else {
        await crmApi.createLead(payload);
        setNotice(`Lead «${payload.full_name}» creado correctamente.`);
      }
      setFormOpen(false);
      window.dispatchEvent(new CustomEvent("fidus:crm-updated"));
      await loadData();
    } catch (err) {
      setError(err instanceof ApiError ? err.detail : "No se pudo guardar el lead.");
    } finally {
      setSavingLead(false);
    }
  };

  const handleStatusChange = async (lead: Lead, nextStatus: string) => {
    setError(null);
    try {
      await crmApi.updateLead(lead.id, { status: nextStatus });
      window.dispatchEvent(new CustomEvent("fidus:crm-updated"));
      await loadData();
    } catch (err) {
      setError(err instanceof ApiError ? err.detail : "No se pudo cambiar el estado del lead.");
    }
  };

  const handleQualifyLead = async (lead: Lead) => {
    setQualifyingId(lead.id);
    setError(null);
    setNotice(null);
    try {
      const res = await aiApi.qualifyLead(lead.id);
      setNotice(
        `Lead «${lead.full_name}» cualificado (${res.score ?? "—"}/100).${
          res.created_action ? " Se ha propuesto tarea de seguimiento en Bandeja HITL." : ""
        }`
      );
      window.dispatchEvent(new CustomEvent("fidus:crm-updated"));
      await loadData();
    } catch (err) {
      setError(err instanceof ApiError ? err.detail : "No se pudo cualificar el lead con IA.");
    } finally {
      setQualifyingId(null);
    }
  };

  const handleDeleteLead = async (lead: Lead) => {
    setError(null);
    try {
      await crmApi.deleteLead(lead.id);
      window.dispatchEvent(new CustomEvent("fidus:crm-updated"));
      await loadData();
    } catch (err) {
      setError(err instanceof ApiError ? err.detail : "No se pudo eliminar el lead.");
    }
  };

  const handleAskCopilot = (lead: Lead) => {
    window.dispatchEvent(
      new CustomEvent("fidus:open-copilot", {
        detail: {
          context: {
            view: "leads",
            entity_type: "lead",
            entity_id: lead.id,
            entity_label: lead.full_name,
          },
          organizationId: lead.organization_id,
          prompt: `Prepara un seguimiento comercial para este lead: ${lead.full_name}`,
        },
      })
    );
  };

  const handleIngestSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!ingestText.trim()) return;
    setIngesting(true);
    setError(null);
    setNotice(null);
    try {
      const res = await aiApi.ingestProactiveText({
        text: ingestText.trim(),
        organization_id: ingestOrgId ? Number(ingestOrgId) : null,
      });
      setIngestText("");
      setIngestOpen(false);
      setNotice(
        res.created_actions.length > 0
          ? `Ingesta IA completada: ${res.created_actions.length} propuesta(s) enviadas a la Bandeja HITL. (${res.summary})`
          : `Ingesta IA completada sin acciones válidas (${res.summary}).`
      );
      window.dispatchEvent(new CustomEvent("fidus:crm-updated"));
    } catch (err) {
      setError(err instanceof ApiError ? err.detail : "No se pudo procesar la Ingesta IA.");
    } finally {
      setIngesting(false);
    }
  };

  return (
    <div className="space-y-5">
      {/* Cabecera */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <UserPlus className="h-5 w-5 text-[#0d5fea]" />
            <h1 className="text-xl font-semibold tracking-tight text-[#121212]">Leads</h1>
          </div>
          <p className="mt-1 text-xs text-neutral-500">
            Gestiona prospectos en Tabla o Kanban, cualifica con BYOK y convierte a Organización + Cliente + Oportunidad.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setIngestOpen(true)}
            className="inline-flex items-center gap-1.5 rounded-lg border border-[#e7e7e9] bg-white px-3 py-1.5 text-xs font-medium text-[#121212] transition hover:bg-[#f7f7f8]"
          >
            <Sparkles className="h-3.5 w-3.5 text-[#0d5fea]" />
            Ingesta IA
          </button>

          <button
            type="button"
            onClick={openCreateModal}
            className="inline-flex items-center gap-1.5 rounded-lg bg-[#0d5fea] px-3.5 py-1.5 text-xs font-semibold text-white transition hover:bg-[#0b52cc]"
          >
            <Plus className="h-3.5 w-3.5" />
            Nuevo lead
          </button>
        </div>
      </div>

      {/* Barra de búsqueda, filtro Abiertos/Todos/Cerrados y selector Tabla/Kanban */}
      <div className="flex flex-col gap-3 rounded-xl border border-[#e7e7e9] bg-white p-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative flex-1 max-w-md">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-neutral-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por nombre, empresa, email u origen..."
            className="w-full rounded-lg border border-[#e7e7e9] bg-[#f7f7f8] py-1.5 pl-8 pr-3 text-xs text-[#121212] placeholder-neutral-400 focus:border-[#0d5fea] focus:bg-white focus:outline-none"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex rounded-lg border border-[#e7e7e9] bg-[#f7f7f8] p-0.5">
            {(
              [
                { id: "open", label: "Abiertos" },
                { id: "all", label: "Todos" },
                { id: "closed", label: "Cerrados" },
              ] as { id: ScopeFilter; label: string }[]
            ).map((opt) => (
              <button
                key={opt.id}
                type="button"
                onClick={() => setScopeFilter(opt.id)}
                className={`rounded-md px-2.5 py-1 text-xs font-medium transition ${
                  scopeFilter === opt.id
                    ? "bg-white text-[#121212] shadow-2xs"
                    : "text-neutral-600 hover:text-[#121212]"
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>

          <div className="inline-flex rounded-lg border border-[#e7e7e9] bg-[#f7f7f8] p-0.5">
            <button
              type="button"
              onClick={() => setViewMode("table")}
              className={`inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-medium transition ${
                viewMode === "table"
                  ? "bg-white text-[#121212] shadow-2xs"
                  : "text-neutral-600 hover:text-[#121212]"
              }`}
            >
              <Table2 className="h-3.5 w-3.5" />
              Tabla
            </button>
            <button
              type="button"
              onClick={() => setViewMode("kanban")}
              className={`inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-medium transition ${
                viewMode === "kanban"
                  ? "bg-white text-[#121212] shadow-2xs"
                  : "text-neutral-600 hover:text-[#121212]"
              }`}
            >
              <Kanban className="h-3.5 w-3.5" />
              Kanban
            </button>
          </div>
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

      {loading ? (
        <div className="rounded-xl border border-[#e7e7e9] bg-white p-12 text-center text-xs text-neutral-500">
          Cargando leads...
        </div>
      ) : viewMode === "table" ? (
        <LeadTableView
          leads={filteredLeads}
          qualifyingId={qualifyingId}
          onStatusChange={(l, st) => void handleStatusChange(l, st)}
          onQualify={(l) => void handleQualifyLead(l)}
          onConvert={(l) => setConvertingLead(l)}
          onEdit={openEditModal}
          onDelete={(l) => void handleDeleteLead(l)}
          onAskCopilot={handleAskCopilot}
        />
      ) : (
        <LeadKanbanBoard
          leads={filteredLeads}
          qualifyingId={qualifyingId}
          onMoveStatus={(l, st) => void handleStatusChange(l, st)}
          onQualify={(l) => void handleQualifyLead(l)}
          onConvert={(l) => setConvertingLead(l)}
          onEdit={openEditModal}
          onAskCopilot={handleAskCopilot}
        />
      )}

      {/* Modal Crear / Editar Lead */}
      <Modal
        open={formOpen}
        onClose={() => setFormOpen(false)}
        title={editingLead ? `Editar lead: ${editingLead.full_name}` : "Nuevo lead"}
        subtitle="Si tienes un proveedor BYOK activo, al crear un lead se cualificará automáticamente."
      >
        <form onSubmit={(e) => void handleSaveLead(e)} className="space-y-3.5">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className="block text-xs font-medium text-neutral-700">Nombre completo *</label>
              <input
                type="text"
                required
                value={leadForm.full_name}
                onChange={(e) => setLeadForm({ ...leadForm, full_name: e.target.value })}
                className="mt-1 w-full rounded-lg border border-[#e7e7e9] px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-neutral-700">Empresa</label>
              <input
                type="text"
                value={leadForm.company_name}
                onChange={(e) => setLeadForm({ ...leadForm, company_name: e.target.value })}
                className="mt-1 w-full rounded-lg border border-[#e7e7e9] px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-neutral-700">Email</label>
              <input
                type="email"
                value={leadForm.email}
                onChange={(e) => setLeadForm({ ...leadForm, email: e.target.value })}
                className="mt-1 w-full rounded-lg border border-[#e7e7e9] px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-neutral-700">Teléfono</label>
              <input
                type="text"
                value={leadForm.phone}
                onChange={(e) => setLeadForm({ ...leadForm, phone: e.target.value })}
                className="mt-1 w-full rounded-lg border border-[#e7e7e9] px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-neutral-700">Origen</label>
              <input
                type="text"
                value={leadForm.source}
                onChange={(e) => setLeadForm({ ...leadForm, source: e.target.value })}
                placeholder="web / referido / evento"
                className="mt-1 w-full rounded-lg border border-[#e7e7e9] px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-neutral-700">Organización vinculada</label>
              <select
                value={leadForm.organization_id}
                onChange={(e) => setLeadForm({ ...leadForm, organization_id: e.target.value })}
                className="mt-1 w-full rounded-lg border border-[#e7e7e9] bg-white px-3 py-2 text-sm"
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
              <label className="block text-xs font-medium text-neutral-700">Estado</label>
              <select
                value={leadForm.status}
                onChange={(e) => setLeadForm({ ...leadForm, status: e.target.value })}
                className="mt-1 w-full rounded-lg border border-[#e7e7e9] bg-white px-3 py-2 text-sm"
              >
                <option value="new">Nuevo</option>
                <option value="contacted">Contactado</option>
                <option value="replied">Respondido</option>
                <option value="unqualified">No cualificado</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-neutral-700">Score (0-100)</label>
              <input
                type="number"
                min={0}
                max={100}
                value={leadForm.score}
                onChange={(e) => setLeadForm({ ...leadForm, score: e.target.value })}
                className="mt-1 w-full rounded-lg border border-[#e7e7e9] px-3 py-2 text-sm"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-neutral-700">Notas</label>
            <textarea
              rows={3}
              value={leadForm.notes}
              onChange={(e) => setLeadForm({ ...leadForm, notes: e.target.value })}
              className="mt-1 w-full rounded-lg border border-[#e7e7e9] px-3 py-2 text-sm"
            />
          </div>

          <div className="flex justify-end gap-2 border-t border-[#e7e7e9] pt-3">
            <button
              type="button"
              onClick={() => setFormOpen(false)}
              className="rounded-lg border border-[#e7e7e9] px-4 py-2 text-xs font-medium text-neutral-700 hover:bg-[#f7f7f8]"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={savingLead}
              className="rounded-lg bg-[#0d5fea] px-4 py-2 text-xs font-semibold text-white hover:bg-[#0b52cc] disabled:opacity-50"
            >
              {savingLead ? "Guardando..." : "Guardar lead"}
            </button>
          </div>
        </form>
      </Modal>

      {/* Modal Ingesta IA */}
      <Modal
        open={ingestOpen}
        onClose={() => setIngestOpen(false)}
        title="Ingesta IA de texto libre"
        subtitle="Pega un correo, nota de reunión o mensaje de WhatsApp. El agente BYOK extraerá leads o tareas hacia la Bandeja HITL."
      >
        <form onSubmit={(e) => void handleIngestSubmit(e)} className="space-y-3.5">
          <textarea
            rows={5}
            required
            value={ingestText}
            onChange={(e) => setIngestText(e.target.value)}
            placeholder="Ej: Llamó Laura Gómez de Valencia Pack S.L. (laura@valenciapack.es, +34 611 222 333) interesada en 25 licencias..."
            className="w-full rounded-lg border border-[#e7e7e9] px-3 py-2 text-sm text-[#121212] focus:border-[#0d5fea] focus:outline-none"
          />
          <select
            value={ingestOrgId}
            onChange={(e) => setIngestOrgId(e.target.value)}
            className="w-full rounded-lg border border-[#e7e7e9] bg-white px-3 py-2 text-xs text-[#121212]"
          >
            <option value="">Detección automática de organización...</option>
            {organizations.map((o) => (
              <option key={o.id} value={o.id}>
                {o.name} {o.cif ? `(${o.cif})` : ""}
              </option>
            ))}
          </select>

          <div className="flex justify-end gap-2 border-t border-[#e7e7e9] pt-3">
            <button
              type="button"
              onClick={() => setIngestOpen(false)}
              className="rounded-lg border border-[#e7e7e9] px-4 py-2 text-xs font-medium text-neutral-700 hover:bg-[#f7f7f8]"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={ingesting || !ingestText.trim()}
              className="inline-flex items-center gap-1.5 rounded-lg bg-[#0d5fea] px-4 py-2 text-xs font-semibold text-white hover:bg-[#0b52cc] disabled:opacity-50"
            >
              <Send className="h-3.5 w-3.5" />
              {ingesting ? "Analizando..." : "Analizar y proponer HITL"}
            </button>
          </div>
        </form>
      </Modal>

      {/* Modal Convertir Lead */}
      <ConvertLeadModal
        lead={convertingLead}
        organizations={organizations}
        clients={clients}
        onClose={() => setConvertingLead(null)}
        onConverted={(res) => {
          setConvertingLead(null);
          setNotice(
            `Lead «${res.lead.full_name}» convertido${
              res.opportunity ? ` con oportunidad «${res.opportunity.title}»` : ""
            }.`
          );
          void loadData();
        }}
      />
    </div>
  );
};
