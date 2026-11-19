import React, { useEffect, useState } from "react";
import { ApiError, crmApi } from "../api/client";
import type { Client, ClientPayload, ClientPotential, Organization } from "../types/api";
import { Modal } from "./ui";

interface EditClientModalProps {
  open: boolean;
  client: Client | null;
  organizations: Organization[];
  defaultOrganizationId?: number | null;
  onClose: () => void;
  onSaved: (cli: Client, isEdit: boolean) => void;
}

export const EditClientModal: React.FC<EditClientModalProps> = ({
  open,
  client,
  organizations,
  defaultOrganizationId = null,
  onClose,
  onSaved,
}) => {
  const [fullName, setFullName] = useState("");
  const [organizationId, setOrganizationId] = useState("");
  const [jobTitle, setJobTitle] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [rgpdConsent, setRgpdConsent] = useState(false);
  const [potential, setPotential] = useState<ClientPotential>("medium");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setError(null);
    if (client) {
      setFullName(client.full_name);
      setOrganizationId(client.organization_id ? String(client.organization_id) : "");
      setJobTitle(client.job_title || "");
      setEmail(client.email || "");
      setPhone(client.phone || "");
      setRgpdConsent(client.rgpd_consent);
      setPotential(client.potential || "medium");
      setNotes(client.notes || "");
    } else {
      setFullName("");
      setOrganizationId(defaultOrganizationId ? String(defaultOrganizationId) : "");
      setJobTitle("");
      setEmail("");
      setPhone("");
      setRgpdConsent(false);
      setPotential("medium");
      setNotes("");
    }
  }, [open, client, defaultOrganizationId]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!fullName.trim()) return;
    setSaving(true);
    setError(null);
    try {
      const basePayload: ClientPayload = {
        organization_id: organizationId ? Number(organizationId) : null,
        full_name: fullName.trim(),
        job_title: jobTitle.trim() || undefined,
        email: email.trim() || undefined,
        phone: phone.trim() || undefined,
        rgpd_consent: rgpdConsent,
        notes: notes.trim() || undefined,
      };
      let saved: Client;
      if (client) {
        saved = await crmApi.updateClient(client.id, { ...basePayload, potential });
      } else {
        const created = await crmApi.createClient(basePayload);
        saved =
          potential !== "medium"
            ? await crmApi.updateClient(created.id, { potential })
            : created;
      }
      window.dispatchEvent(new CustomEvent("fidus:crm-updated"));
      onSaved(saved, Boolean(client));
      onClose();
    } catch (err) {
      setError(err instanceof ApiError ? err.detail : "No se pudo guardar el cliente.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={client ? "Editar cliente" : "Nuevo cliente"}
      subtitle="Contacto activo con trazabilidad RGPD / LOPDGDD y potencial comercial"
    >
      <form onSubmit={(e) => void handleSubmit(e)} className="space-y-4">
        {error && (
          <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">
            {error}
          </div>
        )}

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <label className="block text-xs font-medium text-neutral-700">Nombre completo *</label>
            <input
              type="text"
              required
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="Ej. Elena Vidal"
              className="mt-1 w-full rounded-lg border border-[#e7e7e9] px-3 py-2 text-sm text-[#121212] focus:border-[#0d5fea] focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-neutral-700">Cargo</label>
            <input
              type="text"
              value={jobTitle}
              onChange={(e) => setJobTitle(e.target.value)}
              placeholder="Ej. Directora Financiera"
              className="mt-1 w-full rounded-lg border border-[#e7e7e9] px-3 py-2 text-sm text-[#121212] focus:border-[#0d5fea] focus:outline-none"
            />
          </div>
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
            <label className="block text-xs font-medium text-neutral-700">Potencial</label>
            <select
              value={potential}
              onChange={(e) => setPotential(e.target.value as ClientPotential)}
              className="mt-1 w-full rounded-lg border border-[#e7e7e9] bg-white px-3 py-2 text-sm text-[#121212] focus:border-[#0d5fea] focus:outline-none"
            >
              <option value="high">Alto</option>
              <option value="medium">Medio</option>
              <option value="low">Bajo</option>
            </select>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <label className="block text-xs font-medium text-neutral-700">Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="elena@empresa.es"
              className="mt-1 w-full rounded-lg border border-[#e7e7e9] px-3 py-2 text-sm text-[#121212] focus:border-[#0d5fea] focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-neutral-700">Teléfono</label>
            <input
              type="text"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="+34 600 000 000"
              className="mt-1 w-full rounded-lg border border-[#e7e7e9] px-3 py-2 text-sm text-[#121212] focus:border-[#0d5fea] focus:outline-none"
            />
          </div>
        </div>

        <label className="flex items-center gap-2 rounded-lg border border-[#e7e7e9] bg-[#f7f7f8] px-3 py-2.5 text-xs text-[#121212]">
          <input
            type="checkbox"
            checked={rgpdConsent}
            onChange={(e) => setRgpdConsent(e.target.checked)}
            className="h-4 w-4 rounded border-neutral-300 text-[#0d5fea] focus:ring-[#0d5fea]"
          />
          <span>Consentimiento RGPD / LOPDGDD verificado para comunicaciones comerciales</span>
        </label>

        <div>
          <label className="block text-xs font-medium text-neutral-700">Notas</label>
          <textarea
            rows={2}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
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
            {saving ? "Guardando..." : client ? "Guardar cambios" : "Crear cliente"}
          </button>
        </div>
      </form>
    </Modal>
  );
};
