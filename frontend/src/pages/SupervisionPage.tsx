import React, { useCallback, useEffect, useState } from "react";
import {
  Bot,
  Check,
  CheckCircle2,
  Clock,
  Play,
  RefreshCw,
  ShieldAlert,
  XCircle,
} from "lucide-react";
import { aiApi, ApiError } from "../api/client";
import type { AgentAction, AgentActionStatus } from "../types/api";
import { formatDateTimeEs } from "../utils/format";

type FilterTab = AgentActionStatus | "all";

const STATUS_TABS: { key: FilterTab; label: string }[] = [
  { key: "pending_approval", label: "Pendientes" },
  { key: "approved", label: "Aprobadas" },
  { key: "executed", label: "Ejecutadas" },
  { key: "rejected", label: "Rechazadas" },
  { key: "all", label: "Todas" },
];

const STATUS_BADGE: Record<AgentActionStatus, { label: string; classes: string }> = {
  pending_approval: {
    label: "Pendiente de aprobación",
    classes: "border-amber-200 bg-amber-50 text-amber-800",
  },
  approved: {
    label: "Aprobada",
    classes: "border-sky-200 bg-sky-50 text-sky-800",
  },
  executed: {
    label: "Ejecutada",
    classes: "border-emerald-200 bg-emerald-50 text-emerald-800",
  },
  rejected: {
    label: "Rechazada",
    classes: "border-rose-200 bg-rose-50 text-rose-800",
  },
};

const ACTION_LABELS: Record<string, string> = {
  create_task: "Crear tarea",
  create_lead: "Crear lead",
  update_opportunity: "Actualizar oportunidad",
};

interface SupervisionPageProps {
  onPendingCountChange: (count: number) => void;
}

export const SupervisionPage: React.FC<SupervisionPageProps> = ({ onPendingCountChange }) => {
  const [activeTab, setActiveTab] = useState<FilterTab>("pending_approval");
  const [actions, setActions] = useState<AgentAction[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [notesById, setNotesById] = useState<Record<number, string>>({});
  const [busyId, setBusyId] = useState<number | null>(null);

  const loadActions = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [filtered, pending] = await Promise.all([
        aiApi.listAgentActions(activeTab === "all" ? undefined : activeTab),
        aiApi.listAgentActions("pending_approval"),
      ]);
      setActions(filtered);
      onPendingCountChange(pending.length);
    } catch (err) {
      setError(err instanceof ApiError ? err.detail : "Error al cargar acciones de agentes.");
    } finally {
      setLoading(false);
    }
  }, [activeTab, onPendingCountChange]);

  useEffect(() => {
    void loadActions();
  }, [loadActions]);

  const handleAction = async (
    actionId: number,
    mode: "approve_execute" | "approve" | "execute" | "reject"
  ) => {
    setBusyId(actionId);
    setError(null);
    setFeedback(null);
    const note = notesById[actionId]?.trim() || undefined;
    try {
      if (mode === "approve_execute") {
        await aiApi.approveAndExecuteAgentAction(actionId, note ? { review_note: note } : undefined);
        setFeedback(`Acción #${actionId} aprobada y ejecutada en el CRM.`);
      } else if (mode === "approve") {
        await aiApi.approveAgentAction(actionId, note ? { review_note: note } : undefined);
        setFeedback(`Acción #${actionId} aprobada (lista para ejecutar).`);
      } else if (mode === "execute") {
        await aiApi.executeAgentAction(actionId);
        setFeedback(`Acción #${actionId} ejecutada en el CRM.`);
      } else {
        await aiApi.rejectAgentAction(actionId, note ? { review_note: note } : undefined);
        setFeedback(`Acción #${actionId} rechazada.`);
      }
      await loadActions();
    } catch (err) {
      setError(err instanceof ApiError ? err.detail : "No se pudo procesar la acción.");
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">
            Supervisión Human-in-the-Loop
          </h1>
          <p className="mt-1 text-sm text-slate-600">
            Revisa, aprueba o rechaza las acciones propuestas por los agentes MCP y workers antes de modificar datos del CRM.
          </p>
        </div>

        <button
          type="button"
          onClick={() => void loadActions()}
          className="inline-flex items-center gap-2 self-start rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-sm font-medium text-slate-700 shadow-xs transition hover:bg-slate-50"
        >
          <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          Actualizar
        </button>
      </div>

      <div className="flex flex-wrap gap-2 border-b border-slate-200 pb-3">
        {STATUS_TABS.map((tab) => (
          <button
            key={tab.key}
            type="button"
            onClick={() => setActiveTab(tab.key)}
            className={`rounded-lg px-3.5 py-1.5 text-sm font-medium transition ${
              activeTab === tab.key
                ? "bg-slate-900 text-white"
                : "bg-white text-slate-600 border border-slate-200 hover:bg-slate-100"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {error && (
        <div className="flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
          <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {feedback && (
        <div className="flex items-start gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{feedback}</span>
        </div>
      )}

      {loading ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-10 text-center text-sm text-slate-500">
          Cargando bandeja de supervisión...
        </div>
      ) : actions.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center">
          <Clock className="mx-auto h-8 w-8 text-slate-400" />
          <h3 className="mt-3 text-sm font-semibold text-slate-900">
            No hay acciones en esta vista
          </h3>
          <p className="mt-1 text-xs text-slate-500">
            Cuando un agente conectado vía MCP proponga cambios con <code className="font-mono">proponer_accion</code>, aparecerán aquí para tu aprobación.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {actions.map((action) => {
            const badge = STATUS_BADGE[action.status];
            const isBusy = busyId === action.id;
            const entries = Object.entries(action.payload || {});

            return (
              <div
                key={action.id}
                className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs space-y-4"
              >
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="inline-flex items-center gap-1.5 rounded-md bg-indigo-50 px-2.5 py-1 text-xs font-semibold text-indigo-700">
                        <Bot className="h-3.5 w-3.5" />
                        {action.agent_name}
                      </span>
                      {action.model_used && (
                        <span className="rounded-md bg-slate-100 px-2 py-0.5 font-mono text-xs text-slate-600">
                          {action.model_used}
                        </span>
                      )}
                      <span className={`rounded-full border px-2.5 py-0.5 text-xs font-medium ${badge.classes}`}>
                        {badge.label}
                      </span>
                    </div>

                    <div className="text-base font-semibold text-slate-900">
                      #{action.id} · {ACTION_LABELS[action.action_type] || action.action_type}
                    </div>
                    <div className="text-xs text-slate-500">
                      Entidad objetivo:{" "}
                      <span className="font-medium text-slate-700">
                        {action.target_entity_type}
                        {action.target_entity_id !== null ? ` #${action.target_entity_id}` : ""}
                      </span>{" "}
                      · Propuesta el {formatDateTimeEs(action.created_at)}
                    </div>
                  </div>
                </div>

                <div className="rounded-xl border border-slate-200 bg-slate-50 p-3.5">
                  <div className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                    Datos propuestos (Payload)
                  </div>
                  {entries.length === 0 ? (
                    <div className="text-xs text-slate-500">Sin parámetros adicionales.</div>
                  ) : (
                    <dl className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                      {entries.map(([key, value]) => (
                        <div key={key} className="rounded-lg bg-white px-3 py-2 border border-slate-200/80">
                          <dt className="text-[11px] font-medium text-slate-500">{key}</dt>
                          <dd className="mt-0.5 text-sm font-medium text-slate-900 break-words">
                            {typeof value === "object" && value !== null
                              ? JSON.stringify(value)
                              : String(value ?? "—")}
                          </dd>
                        </div>
                      ))}
                    </dl>
                  )}
                </div>

                {action.review_note && (
                  <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-700">
                    <span className="font-semibold">Nota de revisión:</span> {action.review_note}
                    {action.reviewed_at && (
                      <span className="ml-2 text-slate-500">
                        ({formatDateTimeEs(action.reviewed_at)})
                      </span>
                    )}
                  </div>
                )}

                {action.status === "pending_approval" && (
                  <div className="flex flex-col gap-3 border-t border-slate-100 pt-3 sm:flex-row sm:items-center sm:justify-between">
                    <input
                      type="text"
                      value={notesById[action.id] || ""}
                      onChange={(e) =>
                        setNotesById((prev) => ({ ...prev, [action.id]: e.target.value }))
                      }
                      placeholder="Nota de revisión opcional (ej. motivo de aprobación o rechazo)..."
                      className="flex-1 rounded-lg border border-slate-300 px-3 py-1.5 text-sm text-slate-900 placeholder-slate-400 focus:border-indigo-500 focus:outline-none"
                    />
                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        disabled={isBusy}
                        onClick={() => void handleAction(action.id, "approve_execute")}
                        className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3.5 py-2 text-xs font-semibold text-white transition hover:bg-emerald-500 disabled:opacity-50"
                      >
                        <Play className="h-3.5 w-3.5" />
                        Aprobar y ejecutar
                      </button>
                      <button
                        type="button"
                        disabled={isBusy}
                        onClick={() => void handleAction(action.id, "approve")}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-xs font-semibold text-sky-700 transition hover:bg-sky-100 disabled:opacity-50"
                      >
                        <Check className="h-3.5 w-3.5" />
                        Solo aprobar
                      </button>
                      <button
                        type="button"
                        disabled={isBusy}
                        onClick={() => void handleAction(action.id, "reject")}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-700 transition hover:bg-rose-100 disabled:opacity-50"
                      >
                        <XCircle className="h-3.5 w-3.5" />
                        Rechazar
                      </button>
                    </div>
                  </div>
                )}

                {action.status === "approved" && (
                  <div className="flex justify-end border-t border-slate-100 pt-3">
                    <button
                      type="button"
                      disabled={isBusy}
                      onClick={() => void handleAction(action.id, "execute")}
                      className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-4 py-2 text-xs font-semibold text-white transition hover:bg-indigo-500 disabled:opacity-50"
                    >
                      <Play className="h-3.5 w-3.5" />
                      Ejecutar ahora
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
