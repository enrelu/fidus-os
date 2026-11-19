import React, { useEffect, useState } from "react";
import { ApiError, crmApi } from "../api/client";
import type { Organization, OrganizationPayload } from "../types/api";
import { Modal } from "./ui";

interface EditOrganizationModalProps {
  open: boolean;
  organization: Organization | null;
  onClose: () => void;
  onSaved: (org: Organization, isEdit: boolean) => void;
}

export const EditOrganizationModal: React.FC<EditOrganizationModalProps> = ({
  open,
  organization,
  onClose,
  onSaved,
}) => {
  const [name, setName] = useState("");
  const [cif, setCif] = useState("");
  const [razonSocial, setRazonSocial] = useState("");
  const [direccionFiscal, setDireccionFiscal] = useState("");
  const [sector, setSector] = useState("");
  const [website, setWebsite] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setError(null);
    if (organization) {
      setName(organization.name);
      setCif(organization.cif || "");
      setRazonSocial(organization.razon_social || "");
      setDireccionFiscal(organization.direccion_fiscal || "");
      setSector(organization.sector || "");
      setWebsite(organization.website || "");
      setPhone(organization.phone || "");
      setEmail(organization.email || "");
      setNotes(organization.notes || "");
    } else {
      setName("");
      setCif("");
      setRazonSocial("");
      setDireccionFiscal("");
      setSector("");
      setWebsite("");
      setPhone("");
      setEmail("");
      setNotes("");
    }
  }, [open, organization]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    setSaving(true);
    setError(null);
    try {
      const payload: OrganizationPayload = {
        name: name.trim(),
        cif: cif.trim().toUpperCase() || undefined,
        razon_social: razonSocial.trim() || undefined,
        direccion_fiscal: direccionFiscal.trim() || undefined,
        sector: sector.trim() || undefined,
        website: website.trim() || undefined,
        phone: phone.trim() || undefined,
        email: email.trim() || undefined,
        notes: notes.trim() || undefined,
      };
      const saved = organization
        ? await crmApi.updateOrganization(organization.id, payload)
        : await crmApi.createOrganization(payload);
      window.dispatchEvent(new CustomEvent("fidus:crm-updated"));
      onSaved(saved, Boolean(organization));
      onClose();
    } catch (err) {
      setError(err instanceof ApiError ? err.detail : "No se pudo guardar la organización.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={organization ? "Editar organización" : "Nueva organización"}
      subtitle="Datos fiscales y comerciales (CIF, razón social y dirección fiscal)"
    >
      <form onSubmit={(e) => void handleSubmit(e)} className="space-y-4">
        {error && (
          <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">
            {error}
          </div>
        )}

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <label className="block text-xs font-medium text-neutral-700">Nombre comercial *</label>
            <input
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ej. Grupo Levante"
              className="mt-1 w-full rounded-lg border border-[#e7e7e9] px-3 py-2 text-sm text-[#121212] focus:border-[#0d5fea] focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-neutral-700">CIF / NIF</label>
            <input
              type="text"
              value={cif}
              onChange={(e) => setCif(e.target.value)}
              placeholder="Ej. B96112233"
              className="mt-1 w-full rounded-lg border border-[#e7e7e9] px-3 py-2 font-mono text-sm uppercase text-[#121212] focus:border-[#0d5fea] focus:outline-none"
            />
          </div>
        </div>

        <div>
          <label className="block text-xs font-medium text-neutral-700">Razón Social</label>
          <input
            type="text"
            value={razonSocial}
            onChange={(e) => setRazonSocial(e.target.value)}
            placeholder="Ej. Grupo Levante Logística S.L."
            className="mt-1 w-full rounded-lg border border-[#e7e7e9] px-3 py-2 text-sm text-[#121212] focus:border-[#0d5fea] focus:outline-none"
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-neutral-700">Dirección Fiscal</label>
          <input
            type="text"
            value={direccionFiscal}
            onChange={(e) => setDireccionFiscal(e.target.value)}
            placeholder="Calle, número, código postal, ciudad"
            className="mt-1 w-full rounded-lg border border-[#e7e7e9] px-3 py-2 text-sm text-[#121212] focus:border-[#0d5fea] focus:outline-none"
          />
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <label className="block text-xs font-medium text-neutral-700">Sector</label>
            <input
              type="text"
              value={sector}
              onChange={(e) => setSector(e.target.value)}
              placeholder="Ej. Logística, SaaS, Industria..."
              className="mt-1 w-full rounded-lg border border-[#e7e7e9] px-3 py-2 text-sm text-[#121212] focus:border-[#0d5fea] focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-neutral-700">Sitio web</label>
            <input
              type="text"
              value={website}
              onChange={(e) => setWebsite(e.target.value)}
              placeholder="https://empresa.es"
              className="mt-1 w-full rounded-lg border border-[#e7e7e9] px-3 py-2 text-sm text-[#121212] focus:border-[#0d5fea] focus:outline-none"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <label className="block text-xs font-medium text-neutral-700">Email corporativo</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="contacto@empresa.es"
              className="mt-1 w-full rounded-lg border border-[#e7e7e9] px-3 py-2 text-sm text-[#121212] focus:border-[#0d5fea] focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-neutral-700">Teléfono</label>
            <input
              type="text"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="+34 910 000 000"
              className="mt-1 w-full rounded-lg border border-[#e7e7e9] px-3 py-2 text-sm text-[#121212] focus:border-[#0d5fea] focus:outline-none"
            />
          </div>
        </div>

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
            {saving ? "Guardando..." : organization ? "Guardar cambios" : "Crear organización"}
          </button>
        </div>
      </form>
    </Modal>
  );
};
