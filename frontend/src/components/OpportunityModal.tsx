import React, { useEffect, useMemo, useState } from "react";
import { ApiError, crmApi } from "../api/client";
import type { Client, Opportunity, OpportunityPayload, Organization } from "../types/api";
import { Modal } from "./ui";

interface OpportunityModalProps {
  open: boolean;
  opportunity: Opportunity | null;
  organizations: Organization[];
  clients: Client[];
  defaultOrganizationId?: number | null;
  defaultClientId?: number | null;
  onClose: () => void;
  onSaved: (opp: Opportunity, isEdit: boolean) => void;
}

export const STAGE_OPTIONS = [
  { value: "qualification", label: "Cualificación" },
  { value: "proposal", label: "Propuesta" },
  { value: "negotiation", label: "Negociación" },
  { value: "closed_won", label: "Ganada" },
  { value: "closed_lost", label: "Perdida" },
];

function toDateInputValue(iso: string | null | undefined): string {
  if (!iso) return "";
  return iso.slice(0, 10);
}

export const OpportunityModal: React.FC<OpportunityModalProps> = ({
  open,
  opportunity,
  organizations,
  clients,
  defaultOrganizationId = null,
  defaultClientId = null,
  onClose,
  onSaved,
}) => {
  const [title, setTitle] = useState("");
  const [organizationId, setOrganizationId] = useState("");
  const [clientId, setClientId] = useState("");
  const [amountEur, setAmountEur] = useState("0");
  const [stage, setStage] = useState("qualification");
  const [probability, setProbability] = useState("30");
  const [expectedCloseDate, setExpectedCloseDate] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setError(null);
    if (opportunity) {
      setTitle(opportunity.title);
      setOrganizationId(opportunity.organization_id ? String(opportunity.organization_id) : "");
      setClientId(opportunity.client_id ? String(opportunity.client_id) : "");
      setAmountEur(String(opportunity.amount_eur));
      setStage(opportunity.stage || "qualification");
      setProbability(String(opportunity.probability));
      setExpectedCloseDate(toDateInputValue(opportunity.expected_close_date));
      setNotes(opportunity.notes || "");
    } else {
      setTitle("");
      setOrganizationId(defaultOrganizationId ? String(defaultOrganizationId) : "");
      setClientId(defaultClientId ? String(defaultClientId) : "");
      setAmountEur("0");
      setStage("qualification");
      setProbability("30");
      setExpectedCloseDate("");
      setNotes("");
    }
  }, [open, opportunity, defaultOrganizationId, defaultClientId]);

  const availableClients = useMemo(() => {
    if (!organizationId) return clients;
    const oid = Number(organizationId);
    const matching = clients.filter((c) => c.organization_id === oid);
    return matching.length > 0 ? matching : clients;
  }, [clients, organizationId]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    setSaving(true);
    setError(null);
    try {
      const payload: OpportunityPayload = {
        title: title.trim(),
        organization_id: organizationId ? Number(organizationId) : null,
        client_id: clientId ? Number(clientId) : null,
        amount_eur: Math.max(0, Number(amountEur) || 0),
        stage,
        probability: Math.min(100, Math.max(0, Number(probability) || 0)),
        expected_close_date: expectedCloseDate ? `${expectedCloseDate}T12:00:00` : null,
        notes: notes.trim() || undefined,
      };
      const saved = opportunity
        ? await crmApi.updateOpportunity(opportunity.id, payload)
        : await crmApi.createOpportunity(payload);
      window.dispatchEvent(new CustomEvent("fidus:crm-updated"));
      onSaved(saved, Boolean(opportunity));
      onClose();
    } catch (err) {
      setError(err instanceof ApiError ? err.detail : "No se pudo guardar la oportunidad.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={opportunity ? "Editar oportunidad" : "Nueva oportunidad"}
      subtitle="Pipeline comercial en EUR con organización y contacto asociado"
    >
      <form onSubmit={(e) => void handleSubmit(e)} className="space-y-4">
        {error && (
          <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">
            {error}
          </div>
        )}

        <div>
          <label className="block text-xs font-medium text-neutral-700">Título de la oportunidad *</label>
          <input
            type="text"
            required
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Ej. Implantación ERP · Grupo Levante"
            className="mt-1 w-full rounded-lg border border-[#e7e7e9] px-3 py-2 text-sm text-[#121212] focus:border-[#0d5fea] focus:outline-none"
          />
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <label className="block text-xs font-medium text-neutral-700">Organización</label>
            <select
              value={organizationId}
              onChange={(e) => setOrganizationId(e.target.value)}
              className="mt-1 w-full rounded-lg border border-[#e7e7e9] bg-white px-3 py-2 text-sm text-[#121212] focus:border-[#0d5fea] focus:outline-none"
            >
              <option value="">Sin organización</option>
              {organizations.map((org) => (
                <option key={org.id} value={org.id}>
                  {org.name} {org.cif ? `(${org.cif})` : ""}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-neutral-700">Contacto (Cliente)</label>
            <select
              value={clientId}
              onChange={(e) => setClientId(e.target.value)}
              className="mt-1 w-full rounded-lg border border-[#e7e7e9] bg-white px-3 py-2 text-sm text-[#121212] focus:border-[#0d5fea] focus:outline-none"
            >
              <option value="">Sin contacto</option>
              {availableClients.map((cli) => (
                <option key={cli.id} value={cli.id}>
                  {cli.full_name} {cli.organization_name ? `· ${cli.organization_name}` : ""}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div>
            <label className="block text-xs font-medium text-neutral-700">Importe (EUR)</label>
            <input
              type="number"
              min={0}
              step="0.01"
              value={amountEur}
              onChange={(e) => setAmountEur(e.target.value)}
              className="mt-1 w-full rounded-lg border border-[#e7e7e9] px-3 py-2 text-sm text-[#121212] focus:border-[#0d5fea] focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-neutral-700">Etapa</label>
            <select
              value={stage}
              onChange={(e) => setStage(e.target.value)}
              className="mt-1 w-full rounded-lg border border-[#e7e7e9] bg-white px-3 py-2 text-sm text-[#121212] focus:border-[#0d5fea] focus:outline-none"
            >
              {STAGE_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-neutral-700">Probabilidad (%)</label>
            <input
              type="number"
              min={0}
              max={100}
              value={probability}
              onChange={(e) => setProbability(e.target.value)}
              className="mt-1 w-full rounded-lg border border-[#e7e7e9] px-3 py-2 text-sm text-[#121212] focus:border-[#0d5fea] focus:outline-none"
            />
          </div>
        </div>

        <div>
          <label className="block text-xs font-medium text-neutral-700">Fecha estimada de cierre</label>
          <input
            type="date"
            value={expectedCloseDate}
            onChange={(e) => setExpectedCloseDate(e.target.value)}
            className="mt-1 w-full rounded-lg border border-[#e7e7e9] px-3 py-2 text-sm text-[#121212] focus:border-[#0d5fea] focus:outline-none"
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-neutral-700">Notas comerciales</label>
          <textarea
            rows={3}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Requisitos, próximos pasos o condiciones de la propuesta..."
            className="mt-1 w-full rounded-lg border border-[#e7e7e9] px-3 py-2 text-sm text-[#121212] focus:border-[#0d5fea] focus:outline-none"
          />
        </div>

        <div className="flex justify-end gap-2 border-t border-[#e7e7e9] pt-3">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-[#e7e7e9] px-3.5 py-2 text-xs font-medium text-neutral-700 hover:bg-[#f7f7f8]"
          >
            Cancelar
          </button>
          <button
            type="submit"
            disabled={saving}
            className="rounded-lg bg-[#0d5fea] px-4 py-2 text-xs font-semibold text-white hover:bg-[#0b52cc] disabled:opacity-50"
          >
            {saving ? "Guardando..." : opportunity ? "Guardar cambios" : "Crear oportunidad"}
          </button>
        </div>
      </form>
    </Modal>
  );
};
