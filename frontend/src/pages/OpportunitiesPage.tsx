import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  CheckCircle2,
  Kanban,
  Plus,
  Search,
  ShieldAlert,
  Table2,
  Target,
} from "lucide-react";
import { ApiError, crmApi } from "../api/client";
import { OpportunityKanban } from "../components/OpportunityKanban";
import { OpportunityModal } from "../components/OpportunityModal";
import { OpportunityTableView } from "../components/OpportunityTableView";
import type { Client, Opportunity, Organization } from "../types/api";
import { formatEur } from "../utils/format";

type ScopeFilter = "open" | "all" | "closed";
type ViewMode = "table" | "kanban";

const CLOSED_STAGES = new Set(["closed_won", "closed_lost"]);

export const OpportunitiesPage: React.FC = () => {
  const [opportunities, setOpportunities] = useState<Opportunity[]>([]);
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [search, setSearch] = useState("");
  const [scopeFilter, setScopeFilter] = useState<ScopeFilter>("open");
  const [viewMode, setViewMode] = useState<ViewMode>("table");

  const [modalOpen, setModalOpen] = useState(false);
  const [editingOpp, setEditingOpp] = useState<Opportunity | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [opps, orgs, clis] = await Promise.all([
        crmApi.listOpportunities(),
        crmApi.listOrganizations(),
        crmApi.listClients(),
      ]);
      setOpportunities(opps);
      setOrganizations(orgs);
      setClients(clis);
    } catch (err) {
      setError(err instanceof ApiError ? err.detail : "Error al cargar las oportunidades.");
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

  const filteredOpps = useMemo(() => {
    const q = search.trim().toLowerCase();
    return opportunities.filter((op) => {
      const st = (op.stage || "qualification").trim().toLowerCase();
      const isClosed = CLOSED_STAGES.has(st);
      if (viewMode === "table") {
        if (scopeFilter === "open" && isClosed) return false;
        if (scopeFilter === "closed" && !isClosed) return false;
      }
      if (!q) return true;
      return (
        op.title.toLowerCase().includes(q) ||
        (op.organization_name || "").toLowerCase().includes(q) ||
        (op.client_name || "").toLowerCase().includes(q) ||
        (op.stage || "").toLowerCase().includes(q)
      );
    });
  }, [opportunities, scopeFilter, search, viewMode]);

  const summary = useMemo(() => {
    const open = opportunities.filter((o) => !CLOSED_STAGES.has((o.stage || "").toLowerCase()));
    const won = opportunities.filter((o) => (o.stage || "").toLowerCase() === "closed_won");
    return {
      openCount: open.length,
      openEur: open.reduce((acc, o) => acc + o.amount_eur, 0),
      weightedEur: open.reduce((acc, o) => acc + o.amount_eur * (o.probability / 100), 0),
      wonEur: won.reduce((acc, o) => acc + o.amount_eur, 0),
    };
  }, [opportunities]);

  const handleStageChange = async (opp: Opportunity, nextStage: string) => {
    setError(null);
    setNotice(null);
    try {
      await crmApi.updateOpportunity(opp.id, { stage: nextStage });
      setNotice(`Etapa de «${opp.title}» actualizada.`);
      window.dispatchEvent(new CustomEvent("fidus:crm-updated"));
      await loadData();
    } catch (err) {
      setError(err instanceof ApiError ? err.detail : "No se pudo actualizar la etapa.");
    }
  };

  const handleDelete = async (opp: Opportunity) => {
    if (!window.confirm(`¿Eliminar la oportunidad «${opp.title}»?`)) return;
    setError(null);
    setNotice(null);
    try {
      await crmApi.deleteOpportunity(opp.id);
      setNotice(`Oportunidad «${opp.title}» eliminada.`);
      window.dispatchEvent(new CustomEvent("fidus:crm-updated"));
      await loadData();
    } catch (err) {
      setError(err instanceof ApiError ? err.detail : "No se pudo eliminar la oportunidad.");
    }
  };

  const handleAskCopilot = (opp: Opportunity) => {
    window.dispatchEvent(
      new CustomEvent("fidus:open-copilot", {
        detail: {
          context: {
            view: "opportunities",
            entity_type: "opportunity",
            entity_id: opp.id,
            entity_label: opp.title,
          },
          organizationId: opp.organization_id,
          prompt: `Analiza la oportunidad ${opp.title} (${formatEur(opp.amount_eur)}) y propón el siguiente paso.`,
        },
      })
    );
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <Target className="h-5 w-5 text-[#0d5fea]" />
            <h1 className="text-xl font-semibold tracking-tight text-[#121212]">Oportunidades</h1>
          </div>
          <p className="mt-1 text-xs text-neutral-500">
            Pipeline abierto: <span className="font-semibold text-[#121212]">{formatEur(summary.openEur)}</span>{" "}
            ({summary.openCount} activas · ponderado {formatEur(summary.weightedEur)}) · Ganadas:{" "}
            <span className="font-semibold text-emerald-700">{formatEur(summary.wonEur)}</span>
          </p>
        </div>

        <button
          type="button"
          onClick={() => {
            setEditingOpp(null);
            setModalOpen(true);
          }}
          className="inline-flex items-center gap-1.5 rounded-lg bg-[#0d5fea] px-3.5 py-2 text-xs font-semibold text-white transition hover:bg-[#0b52cc]"
        >
          <Plus className="h-3.5 w-3.5" />
          Nueva oportunidad
        </button>
      </div>

      {/* Barra de controles */}
      <div className="flex flex-col gap-3 rounded-xl border border-[#e7e7e9] bg-white p-3.5 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-2 h-3.5 w-3.5 text-neutral-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar oportunidad, cuenta o contacto..."
              className="w-64 rounded-lg border border-[#e7e7e9] bg-[#f7f7f8] py-1.5 pl-8 pr-3 text-xs text-[#121212] focus:border-[#0d5fea] focus:bg-white focus:outline-none"
            />
          </div>

          {viewMode === "table" && (
            <div className="flex items-center gap-1 rounded-lg border border-[#e7e7e9] bg-[#f7f7f8] p-0.5">
              {(
                [
                  { id: "open", label: "Abiertas" },
                  { id: "all", label: "Todas" },
                  { id: "closed", label: "Cerradas" },
                ] as { id: ScopeFilter; label: string }[]
              ).map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setScopeFilter(tab.id)}
                  className={`rounded-md px-2.5 py-1 text-[11px] font-medium transition ${
                    scopeFilter === tab.id
                      ? "bg-white text-[#121212] shadow-2xs"
                      : "text-neutral-600 hover:text-[#121212]"
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="flex items-center gap-1 rounded-lg border border-[#e7e7e9] bg-[#f7f7f8] p-0.5 self-start sm:self-auto">
          <button
            type="button"
            onClick={() => setViewMode("table")}
            className={`inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-[11px] font-medium transition ${
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
            className={`inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-[11px] font-medium transition ${
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
          Cargando pipeline de oportunidades...
        </div>
      ) : viewMode === "table" ? (
        <OpportunityTableView
          opportunities={filteredOpps}
          onStageChange={(op, next) => void handleStageChange(op, next)}
          onEdit={(op) => {
            setEditingOpp(op);
            setModalOpen(true);
          }}
          onDelete={(op) => void handleDelete(op)}
          onAskCopilot={handleAskCopilot}
        />
      ) : (
        <OpportunityKanban
          opportunities={filteredOpps}
          onMoveStage={(op, target) => void handleStageChange(op, target)}
          onEdit={(op) => {
            setEditingOpp(op);
            setModalOpen(true);
          }}
          onAskCopilot={handleAskCopilot}
        />
      )}

      <OpportunityModal
        open={modalOpen}
        opportunity={editingOpp}
        organizations={organizations}
        clients={clients}
        onClose={() => setModalOpen(false)}
        onSaved={(saved, isEdit) => {
          setNotice(
            isEdit
              ? `Oportunidad «${saved.title}» actualizada.`
              : `Oportunidad «${saved.title}» creada.`
          );
          void loadData();
        }}
      />
    </div>
  );
};
