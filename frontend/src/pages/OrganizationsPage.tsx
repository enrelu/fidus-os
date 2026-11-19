import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Building2, CheckCircle2, Plus, Search, ShieldAlert } from "lucide-react";
import { ApiError, crmApi } from "../api/client";
import { EditOrganizationModal } from "../components/EditOrganizationModal";
import { OrganizationView } from "../components/OrganizationView";
import type { Organization } from "../types/api";
import { formatEur } from "../utils/format";

export const OrganizationsPage: React.FC = () => {
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [editingOrg, setEditingOrg] = useState<Organization | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const list = await crmApi.listOrganizations();
      setOrganizations(list);
    } catch (err) {
      setError(err instanceof ApiError ? err.detail : "Error al cargar las organizaciones.");
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

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return organizations;
    return organizations.filter(
      (org) =>
        org.name.toLowerCase().includes(q) ||
        (org.cif || "").toLowerCase().includes(q) ||
        (org.razon_social || "").toLowerCase().includes(q) ||
        (org.sector || "").toLowerCase().includes(q) ||
        (org.website || "").toLowerCase().includes(q)
    );
  }, [organizations, search]);

  const totalPipeline = useMemo(
    () => organizations.reduce((acc, o) => acc + (o.open_pipeline_eur ?? 0), 0),
    [organizations]
  );

  const handleDelete = async (org: Organization) => {
    if (!window.confirm(`¿Eliminar la organización «${org.name}»? Se desvincularán sus contactos y oportunidades.`)) {
      return;
    }
    setError(null);
    setNotice(null);
    try {
      await crmApi.deleteOrganization(org.id);
      setNotice(`Organización «${org.name}» eliminada.`);
      window.dispatchEvent(new CustomEvent("fidus:crm-updated"));
      await loadData();
    } catch (err) {
      setError(err instanceof ApiError ? err.detail : "No se pudo eliminar la organización.");
    }
  };

  const handleAskCopilot = (org: Organization) => {
    window.dispatchEvent(
      new CustomEvent("fidus:open-copilot", {
        detail: {
          context: {
            view: "organizations",
            entity_type: "organization",
            entity_id: org.id,
            entity_label: org.name,
          },
          organizationId: org.id,
          prompt: `Resume la situación comercial actual de ${org.name}`,
        },
      })
    );
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <Building2 className="h-5 w-5 text-[#0d5fea]" />
            <h1 className="text-xl font-semibold tracking-tight text-[#121212]">Organizaciones</h1>
          </div>
          <p className="mt-1 text-xs text-neutral-500">
            {organizations.length} empresa(s) · Pipeline abierto agregado:{" "}
            <span className="font-semibold text-[#121212]">{formatEur(totalPipeline)}</span>
          </p>
        </div>

        <button
          type="button"
          onClick={() => {
            setEditingOrg(null);
            setModalOpen(true);
          }}
          className="inline-flex items-center gap-1.5 rounded-lg bg-[#0d5fea] px-3.5 py-2 text-xs font-semibold text-white transition hover:bg-[#0b52cc]"
        >
          <Plus className="h-3.5 w-3.5" />
          Nueva organización
        </button>
      </div>

      <div className="flex flex-col gap-3 rounded-xl border border-[#e7e7e9] bg-white p-3.5 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-2 h-3.5 w-3.5 text-neutral-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por nombre, CIF, razón social o sector..."
            className="w-72 rounded-lg border border-[#e7e7e9] bg-[#f7f7f8] py-1.5 pl-8 pr-3 text-xs text-[#121212] focus:border-[#0d5fea] focus:bg-white focus:outline-none"
          />
        </div>
        <span className="text-[11px] text-neutral-500">{filtered.length} resultado(s)</span>
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
        <div className="rounded-xl border border-[#e7e7e9] bg-white p-10 text-center text-xs text-neutral-500">
          Cargando organizaciones...
        </div>
      ) : (
        <OrganizationView
          organizations={filtered}
          onEdit={(org) => {
            setEditingOrg(org);
            setModalOpen(true);
          }}
          onDelete={(org) => void handleDelete(org)}
          onAskCopilot={handleAskCopilot}
        />
      )}

      <EditOrganizationModal
        open={modalOpen}
        organization={editingOrg}
        onClose={() => setModalOpen(false)}
        onSaved={(saved, isEdit) => {
          setNotice(
            isEdit
              ? `Organización «${saved.name}» actualizada.`
              : `Organización «${saved.name}» creada.`
          );
          void loadData();
        }}
      />
    </div>
  );
};
