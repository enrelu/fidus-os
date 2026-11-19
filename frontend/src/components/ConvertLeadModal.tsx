import React, { useEffect, useState } from "react";
import { Building2, ChevronDown, ChevronRight, ShieldCheck, Target, Users } from "lucide-react";
import { ApiError, crmApi } from "../api/client";
import type { Client, Lead, LeadConvertResponse, Organization } from "../types/api";
import { Modal } from "./ui";

interface ConvertLeadModalProps {
  lead: Lead | null;
  organizations: Organization[];
  clients: Client[];
  onClose: () => void;
  onConverted: (result: LeadConvertResponse) => void;
}

export const ConvertLeadModal: React.FC<ConvertLeadModalProps> = ({
  lead,
  organizations,
  clients,
  onClose,
  onConverted,
}) => {
  const [openOrg, setOpenOrg] = useState(true);
  const [openClient, setOpenClient] = useState(true);
  const [openOpp, setOpenOpp] = useState(true);

  const [orgMode, setOrgMode] = useState<"create" | "existing" | "none">("create");
  const [existingOrgId, setExistingOrgId] = useState("");
  const [orgName, setOrgName] = useState("");
  const [orgCif, setOrgCif] = useState("");
  const [orgRazonSocial, setOrgRazonSocial] = useState("");
  const [orgDireccion, setOrgDireccion] = useState("");
  const [orgSector, setOrgSector] = useState("");

  const [clientMode, setClientMode] = useState<"create" | "existing" | "none">("create");
  const [existingClientId, setExistingClientId] = useState("");
  const [clientName, setClientName] = useState("");
  const [clientEmail, setClientEmail] = useState("");
  const [clientPhone, setClientPhone] = useState("");
  const [clientJobTitle, setClientJobTitle] = useState("");
  const [rgpdConsent, setRgpdConsent] = useState(false);

  const [createOpp, setCreateOpp] = useState(true);
  const [oppTitle, setOppTitle] = useState("");
  const [oppAmount, setOppAmount] = useState("5000");
  const [oppStage, setOppStage] = useState("qualification");
  const [oppProb, setOppProb] = useState("30");
  const [oppCloseDate, setOppCloseDate] = useState("");

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!lead) return;
    setError(null);
    setOpenOrg(true);
    setOpenClient(true);
    setOpenOpp(true);

    if (lead.organization_id) {
      setOrgMode("existing");
      setExistingOrgId(String(lead.organization_id));
      setOrgName("");
    } else if (lead.company_name && lead.company_name.trim()) {
      setOrgMode("create");
      setExistingOrgId("");
      setOrgName(lead.company_name.trim());
    } else {
      setOrgMode("none");
      setExistingOrgId("");
      setOrgName("");
    }
    setOrgCif("");
    setOrgRazonSocial("");
    setOrgDireccion("");
    setOrgSector("");

    setClientMode("create");
    setExistingClientId("");
    setClientName(lead.full_name || "");
    setClientEmail(lead.email || "");
    setClientPhone(lead.phone || "");
    setClientJobTitle("");
    setRgpdConsent(false);

    setCreateOpp(true);
    setOppTitle(`Oportunidad · ${lead.company_name || lead.full_name}`);
    setOppAmount("5000");
    setOppStage("qualification");
    setOppProb("30");
    setOppCloseDate("");
  }, [lead]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!lead) return;
    setSubmitting(true);
    setError(null);
    try {
      const result = await crmApi.convertLead(lead.id, {
        organization:
          orgMode === "existing" && existingOrgId
            ? { existing_id: Number(existingOrgId) }
            : orgMode === "create"
            ? {
                create: true,
                name: orgName.trim() || lead.company_name || `Empresa de ${lead.full_name}`,
                cif: orgCif.trim() || undefined,
                razon_social: orgRazonSocial.trim() || undefined,
                direccion_fiscal: orgDireccion.trim() || undefined,
                sector: orgSector.trim() || undefined,
              }
            : { create: false },
        client:
          clientMode === "existing" && existingClientId
            ? { existing_id: Number(existingClientId) }
            : clientMode === "create"
            ? {
                create: true,
                full_name: clientName.trim() || lead.full_name,
                email: clientEmail.trim() || undefined,
                phone: clientPhone.trim() || undefined,
                job_title: clientJobTitle.trim() || undefined,
                rgpd_consent: rgpdConsent,
              }
            : { create: false },
        opportunity: createOpp
          ? {
              create: true,
              title: oppTitle.trim() || `Oportunidad · ${lead.full_name}`,
              amount_eur: Number(oppAmount || 0),
              stage: oppStage,
              probability: Number(oppProb || 0),
              expected_close_date: oppCloseDate ? `${oppCloseDate}T12:00:00` : null,
            }
          : { create: false },
      });
      window.dispatchEvent(new CustomEvent("fidus:crm-updated"));
      onConverted(result);
    } catch (err) {
      setError(err instanceof ApiError ? err.detail : "No se pudo convertir el lead.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      open={lead !== null}
      onClose={onClose}
      title={`Convertir Lead: ${lead?.full_name || ""}`}
      subtitle="Crea o vincula Organización (CIF), Contacto (RGPD) y Oportunidad en EUR de forma atómica."
      maxWidthClass="max-w-2xl"
    >
      <form onSubmit={(e) => void handleSubmit(e)} className="space-y-4">
        {error && (
          <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-800">
            {error}
          </div>
        )}

        {/* Acordeón 1: Organización */}
        <div className="rounded-xl border border-[#e7e7e9] overflow-hidden">
          <button
            type="button"
            onClick={() => setOpenOrg((v) => !v)}
            className="flex w-full items-center justify-between bg-[#f7f7f8] px-4 py-2.5 text-left text-xs font-semibold text-[#121212]"
          >
            <span className="inline-flex items-center gap-2">
              <Building2 className="h-4 w-4 text-[#0d5fea]" />
              1. Organización (España / CIF)
            </span>
            {openOrg ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
          </button>

          {openOrg && (
            <div className="p-4 space-y-3 bg-white">
              <div className="flex flex-wrap gap-2 text-xs">
                {(
                  [
                    { id: "create", label: "Crear nueva" },
                    { id: "existing", label: "Vincular existente" },
                    { id: "none", label: "Sin organización" },
                  ] as const
                ).map((opt) => (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => setOrgMode(opt.id)}
                    className={`rounded-md px-2.5 py-1 font-medium transition ${
                      orgMode === opt.id
                        ? "bg-[#121212] text-white"
                        : "border border-[#e7e7e9] bg-[#f7f7f8] text-neutral-700"
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>

              {orgMode === "existing" && (
                <select
                  value={existingOrgId}
                  onChange={(e) => setExistingOrgId(e.target.value)}
                  required
                  className="w-full rounded-lg border border-[#e7e7e9] bg-white px-3 py-2 text-xs text-[#121212]"
                >
                  <option value="">Selecciona una organización...</option>
                  {organizations.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.name} {o.cif ? `(${o.cif})` : ""}
                    </option>
                  ))}
                </select>
              )}

              {orgMode === "create" && (
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div>
                    <label className="block text-[11px] font-medium text-neutral-600">
                      Nombre comercial *
                    </label>
                    <input
                      type="text"
                      required
                      value={orgName}
                      onChange={(e) => setOrgName(e.target.value)}
                      className="mt-1 w-full rounded-lg border border-[#e7e7e9] px-3 py-1.5 text-xs"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-medium text-neutral-600">CIF / NIF</label>
                    <input
                      type="text"
                      value={orgCif}
                      onChange={(e) => setOrgCif(e.target.value)}
                      placeholder="B12345678"
                      className="mt-1 w-full rounded-lg border border-[#e7e7e9] px-3 py-1.5 text-xs uppercase"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-medium text-neutral-600">
                      Razón social
                    </label>
                    <input
                      type="text"
                      value={orgRazonSocial}
                      onChange={(e) => setOrgRazonSocial(e.target.value)}
                      className="mt-1 w-full rounded-lg border border-[#e7e7e9] px-3 py-1.5 text-xs"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-medium text-neutral-600">Sector</label>
                    <input
                      type="text"
                      value={orgSector}
                      onChange={(e) => setOrgSector(e.target.value)}
                      className="mt-1 w-full rounded-lg border border-[#e7e7e9] px-3 py-1.5 text-xs"
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <label className="block text-[11px] font-medium text-neutral-600">
                      Dirección fiscal
                    </label>
                    <input
                      type="text"
                      value={orgDireccion}
                      onChange={(e) => setOrgDireccion(e.target.value)}
                      className="mt-1 w-full rounded-lg border border-[#e7e7e9] px-3 py-1.5 text-xs"
                    />
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Acordeón 2: Cliente / Contacto */}
        <div className="rounded-xl border border-[#e7e7e9] overflow-hidden">
          <button
            type="button"
            onClick={() => setOpenClient((v) => !v)}
            className="flex w-full items-center justify-between bg-[#f7f7f8] px-4 py-2.5 text-left text-xs font-semibold text-[#121212]"
          >
            <span className="inline-flex items-center gap-2">
              <Users className="h-4 w-4 text-[#0d5fea]" />
              2. Contacto / Cliente (RGPD)
            </span>
            {openClient ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
          </button>

          {openClient && (
            <div className="p-4 space-y-3 bg-white">
              <div className="flex flex-wrap gap-2 text-xs">
                {(
                  [
                    { id: "create", label: "Crear nuevo contacto" },
                    { id: "existing", label: "Vincular existente" },
                    { id: "none", label: "Omitir contacto" },
                  ] as const
                ).map((opt) => (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => setClientMode(opt.id)}
                    className={`rounded-md px-2.5 py-1 font-medium transition ${
                      clientMode === opt.id
                        ? "bg-[#121212] text-white"
                        : "border border-[#e7e7e9] bg-[#f7f7f8] text-neutral-700"
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>

              {clientMode === "existing" && (
                <select
                  value={existingClientId}
                  onChange={(e) => setExistingClientId(e.target.value)}
                  required
                  className="w-full rounded-lg border border-[#e7e7e9] bg-white px-3 py-2 text-xs text-[#121212]"
                >
                  <option value="">Selecciona un contacto...</option>
                  {clients.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.full_name} {c.email ? `(${c.email})` : ""}
                    </option>
                  ))}
                </select>
              )}

              {clientMode === "create" && (
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div>
                    <label className="block text-[11px] font-medium text-neutral-600">
                      Nombre completo *
                    </label>
                    <input
                      type="text"
                      required
                      value={clientName}
                      onChange={(e) => setClientName(e.target.value)}
                      className="mt-1 w-full rounded-lg border border-[#e7e7e9] px-3 py-1.5 text-xs"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-medium text-neutral-600">Cargo</label>
                    <input
                      type="text"
                      value={clientJobTitle}
                      onChange={(e) => setClientJobTitle(e.target.value)}
                      className="mt-1 w-full rounded-lg border border-[#e7e7e9] px-3 py-1.5 text-xs"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-medium text-neutral-600">Email</label>
                    <input
                      type="email"
                      value={clientEmail}
                      onChange={(e) => setClientEmail(e.target.value)}
                      className="mt-1 w-full rounded-lg border border-[#e7e7e9] px-3 py-1.5 text-xs"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-medium text-neutral-600">Teléfono</label>
                    <input
                      type="text"
                      value={clientPhone}
                      onChange={(e) => setClientPhone(e.target.value)}
                      className="mt-1 w-full rounded-lg border border-[#e7e7e9] px-3 py-1.5 text-xs"
                    />
                  </div>
                  <label className="sm:col-span-2 inline-flex items-center gap-2 text-xs font-medium text-neutral-700">
                    <input
                      type="checkbox"
                      checked={rgpdConsent}
                      onChange={(e) => setRgpdConsent(e.target.checked)}
                      className="rounded border-neutral-300 text-[#0d5fea]"
                    />
                    <ShieldCheck className="h-3.5 w-3.5 text-emerald-600" />
                    Consentimiento RGPD / LOPDGDD verificado
                  </label>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Acordeón 3: Oportunidad */}
        <div className="rounded-xl border border-[#e7e7e9] overflow-hidden">
          <button
            type="button"
            onClick={() => setOpenOpp((v) => !v)}
            className="flex w-full items-center justify-between bg-[#f7f7f8] px-4 py-2.5 text-left text-xs font-semibold text-[#121212]"
          >
            <span className="inline-flex items-center gap-2">
              <Target className="h-4 w-4 text-[#0d5fea]" />
              3. Oportunidad (EUR)
            </span>
            {openOpp ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
          </button>

          {openOpp && (
            <div className="p-4 space-y-3 bg-white">
              <label className="inline-flex items-center gap-2 text-xs font-medium text-[#121212]">
                <input
                  type="checkbox"
                  checked={createOpp}
                  onChange={(e) => setCreateOpp(e.target.checked)}
                  className="rounded border-neutral-300 text-[#0d5fea]"
                />
                Crear oportunidad comercial en EUR al convertir
              </label>

              {createOpp && (
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div className="sm:col-span-2">
                    <label className="block text-[11px] font-medium text-neutral-600">
                      Título de la oportunidad *
                    </label>
                    <input
                      type="text"
                      required
                      value={oppTitle}
                      onChange={(e) => setOppTitle(e.target.value)}
                      className="mt-1 w-full rounded-lg border border-[#e7e7e9] px-3 py-1.5 text-xs"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-medium text-neutral-600">
                      Importe (EUR)
                    </label>
                    <input
                      type="number"
                      min={0}
                      step="0.01"
                      value={oppAmount}
                      onChange={(e) => setOppAmount(e.target.value)}
                      className="mt-1 w-full rounded-lg border border-[#e7e7e9] px-3 py-1.5 text-xs"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-medium text-neutral-600">Etapa</label>
                    <select
                      value={oppStage}
                      onChange={(e) => setOppStage(e.target.value)}
                      className="mt-1 w-full rounded-lg border border-[#e7e7e9] bg-white px-3 py-1.5 text-xs"
                    >
                      <option value="qualification">Cualificación</option>
                      <option value="proposal">Propuesta</option>
                      <option value="negotiation">Negociación</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-[11px] font-medium text-neutral-600">
                      Probabilidad (%)
                    </label>
                    <input
                      type="number"
                      min={0}
                      max={100}
                      value={oppProb}
                      onChange={(e) => setOppProb(e.target.value)}
                      className="mt-1 w-full rounded-lg border border-[#e7e7e9] px-3 py-1.5 text-xs"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-medium text-neutral-600">
                      Cierre previsto
                    </label>
                    <input
                      type="date"
                      value={oppCloseDate}
                      onChange={(e) => setOppCloseDate(e.target.value)}
                      className="mt-1 w-full rounded-lg border border-[#e7e7e9] px-3 py-1.5 text-xs"
                    />
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2 border-t border-[#e7e7e9] pt-4">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-[#e7e7e9] px-4 py-2 text-xs font-medium text-neutral-700 hover:bg-[#f7f7f8]"
          >
            Cancelar
          </button>
          <button
            type="submit"
            disabled={submitting}
            className="rounded-lg bg-[#0d5fea] px-4 py-2 text-xs font-semibold text-white hover:bg-[#0b52cc] disabled:opacity-50"
          >
            {submitting ? "Convirtiendo..." : "Confirmar conversión"}
          </button>
        </div>
      </form>
    </Modal>
  );
};
