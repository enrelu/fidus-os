import React, { useCallback, useEffect, useMemo, useState } from "react";
import { CheckCircle2, Plus, Search, ShieldAlert, Users } from "lucide-react";
import { ApiError, crmApi } from "../api/client";
import { ClientView } from "../components/ClientView";
import { EditClientModal } from "../components/EditClientModal";
import type { Client, ClientPotential, Organization } from "../types/api";

type RgpdFilter = "all" | "consented" | "pending";

export const ClientsPage: React.FC = () => {
  const [clients, setClients] = useState<Client[]>([]);
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [search, setSearch] = useState("");
  const [rgpdFilter, setRgpdFilter] = useState<RgpdFilter>("all");
  const [modalOpen, setModalOpen] = useState(false);
  const [editingClient, setEditingClient] = useState<Client | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [clis, orgs] = await Promise.all([
        crmApi.listClients(),
        crmApi.listOrganizations(),
      ]);
      setClients(clis);
      setOrganizations(orgs);
    } catch (err) {
      setError(err instanceof ApiError ? err.detail : "Error al cargar los clientes.");
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
    return clients.filter((cli) => {
      if (rgpdFilter === "consented" && !cli.rgpd_consent) return false;
      if (rgpdFilter === "pending" && cli.rgpd_consent) return false;
      if (!q) return true;
      return (
        cli.full_name.toLowerCase().includes(q) ||
        (cli.organization_name || "").toLowerCase().includes(q) ||
        (cli.email || "").toLowerCase().includes(q) ||
        (cli.job_title || "").toLowerCase().includes(q)
      );
    });
  }, [clients, rgpdFilter, search]);

  const consentedCount = useMemo(() => clients.filter((c) => c.rgpd_consent).length, [clients]);

  const handlePotentialChange = async (client: Client, nextPotential: ClientPotential) => {
    setError(null);
    setNotice(null);
    try {
      await crmApi.updateClient(client.id, { potential: nextPotential });
      setNotice(`Potencial de «${client.full_name}» actualizado.`);
      window.dispatchEvent(new CustomEvent("fidus:crm-updated"));
      await loadData();
    } catch (err) {
      setError(err instanceof ApiError ? err.detail : "No se pudo actualizar el potencial.");
    }
  };

  const handleDelete = async (client: Client) => {
    if (!window.confirm(`¿Eliminar al cliente «${client.full_name}»?`)) return;
    setError(null);
    setNotice(null);
    try {
      await crmApi.deleteClient(client.id);
      setNotice(`Cliente «${client.full_name}» eliminado.`);
      window.dispatchEvent(new CustomEvent("fidus:crm-updated"));
      await loadData();
    } catch (err) {
      setError(err instanceof ApiError ? err.detail : "No se pudo eliminar el cliente.");
    }
  };

  const handleAskCopilot = (client: Client) => {
    window.dispatchEvent(
      new CustomEvent("fidus:open-copilot", {
        detail: {
          context: {
            view: "clients",
            entity_type: "client",
            entity_id: client.id,
            entity_label: client.full_name,
          },
          organizationId: client.organization_id,
          prompt: `Prepara una propuesta de seguimiento para ${client.full_name}`,
        },
      })
    );
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <Users className="h-5 w-5 text-[#0d5fea]" />
            <h1 className="text-xl font-semibold tracking-tight text-[#121212]">Clientes</h1>
          </div>
          <p className="mt-1 text-xs text-neutral-500">
            {clients.length} contacto(s) · {consentedCount} con consentimiento RGPD activo
          </p>
        </div>

        <button
          type="button"
          onClick={() => {
            setEditingClient(null);
            setModalOpen(true);
          }}
          className="inline-flex items-center gap-1.5 rounded-lg bg-[#0d5fea] px-3.5 py-2 text-xs font-semibold text-white transition hover:bg-[#0b52cc]"
        >
          <Plus className="h-3.5 w-3.5" />
          Nuevo cliente
        </button>
      </div>

      <div className="flex flex-col gap-3 rounded-xl border border-[#e7e7e9] bg-white p-3.5 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-2 h-3.5 w-3.5 text-neutral-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar por nombre, empresa, cargo o email..."
              className="w-72 rounded-lg border border-[#e7e7e9] bg-[#f7f7f8] py-1.5 pl-8 pr-3 text-xs text-[#121212] focus:border-[#0d5fea] focus:bg-white focus:outline-none"
            />
          </div>

          <div className="flex items-center gap-1 rounded-lg border border-[#e7e7e9] bg-[#f7f7f8] p-0.5">
            {(
              [
                { id: "all", label: "Todos" },
                { id: "consented", label: "RGPD OK" },
                { id: "pending", label: "RGPD Pendiente" },
              ] as { id: RgpdFilter; label: string }[]
            ).map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setRgpdFilter(tab.id)}
                className={`rounded-md px-2.5 py-1 text-[11px] font-medium transition ${
                  rgpdFilter === tab.id
                    ? "bg-white text-[#121212] shadow-2xs"
                    : "text-neutral-600 hover:text-[#121212]"
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>
        <span className="text-[11px] text-neutral-500">{filtered.length} contacto(s)</span>
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
          Cargando clientes...
        </div>
      ) : (
        <ClientView
          clients={filtered}
          onPotentialChange={(cli, pot) => void handlePotentialChange(cli, pot)}
          onEdit={(cli) => {
            setEditingClient(cli);
            setModalOpen(true);
          }}
          onDelete={(cli) => void handleDelete(cli)}
          onAskCopilot={handleAskCopilot}
        />
      )}

      <EditClientModal
        open={modalOpen}
        client={editingClient}
        organizations={organizations}
        onClose={() => setModalOpen(false)}
        onSaved={(saved, isEdit) => {
          setNotice(
            isEdit ? `Cliente «${saved.full_name}» actualizado.` : `Cliente «${saved.full_name}» creado.`
          );
          void loadData();
        }}
      />
    </div>
  );
};
