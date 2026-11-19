import React, { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Activity, Bell, Bot, CheckCircle2, Play, ShieldCheck, User, XCircle } from "lucide-react";
import { aiApi, ApiError, crmApi } from "../api/client";
import type { ActivityLog, AgentAction } from "../types/api";
import { formatDateTimeEs } from "../utils/format";

interface HeaderInboxProps {
  pendingCount: number;
}

const ACTION_LABELS: Record<string, string> = {
  create_task: "Crear tarea",
  create_lead: "Crear lead",
  update_opportunity: "Actualizar oportunidad",
};

export const HeaderInbox: React.FC<HeaderInboxProps> = ({ pendingCount }) => {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [pendingActions, setPendingActions] = useState<AgentAction[]>([]);
  const [recentLogs, setRecentLogs] = useState<ActivityLog[]>([]);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const rootRef = useRef<HTMLDivElement | null>(null);

  const loadInbox = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [actions, logs] = await Promise.all([
        aiApi.listAgentActions("pending_approval"),
        crmApi.listActivities(),
      ]);
      setPendingActions(actions.slice(0, 8));
      setRecentLogs(logs.slice(0, 5));
    } catch (err) {
      setError(err instanceof ApiError ? err.detail : "No se pudo cargar la bandeja.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    void loadInbox();
  }, [open, loadInbox]);

  useEffect(() => {
    const onUpdated = () => {
      if (open) void loadInbox();
    };
    window.addEventListener("fidus:crm-updated", onUpdated);
    return () => window.removeEventListener("fidus:crm-updated", onUpdated);
  }, [open, loadInbox]);

  useEffect(() => {
    if (!open) return;
    const onDocClick = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDocClick);
    window.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const handleDecision = async (actionId: number, mode: "approve_execute" | "reject") => {
    setBusyId(actionId);
    setError(null);
    try {
      if (mode === "approve_execute") {
        await aiApi.approveAndExecuteAgentAction(actionId);
      } else {
        await aiApi.rejectAgentAction(actionId);
      }
      window.dispatchEvent(new CustomEvent("fidus:crm-updated"));
      await loadInbox();
    } catch (err) {
      setError(err instanceof ApiError ? err.detail : "No se pudo procesar la propuesta.");
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        title="Bandeja de propuestas HITL y actividad reciente"
        className="relative inline-flex items-center gap-1.5 rounded-lg border border-[#e7e7e9] bg-white px-2.5 py-1.5 text-xs font-medium text-[#121212] transition hover:bg-[#f7f7f8]"
      >
        <Bell className="h-3.5 w-3.5 text-neutral-600" />
        <span className="hidden sm:inline">Bandeja</span>
        {pendingCount > 0 && (
          <span className="inline-flex min-w-[18px] items-center justify-center rounded-full bg-[#0d5fea] px-1.5 py-0.5 text-[10px] font-semibold text-white">
            {pendingCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-[380px] max-w-[92vw] rounded-xl border border-[#e7e7e9] bg-white shadow-xl z-40 overflow-hidden">
          <div className="flex items-center justify-between border-b border-[#e7e7e9] bg-[#f7f7f8] px-4 py-2.5">
            <div className="flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 text-[#0d5fea]" />
              <span className="text-xs font-semibold text-[#121212]">
                Bandeja HITL y Actividad
              </span>
            </div>
            <span className="rounded-full border border-[#e7e7e9] bg-white px-2 py-0.5 text-[10px] font-semibold text-neutral-600">
              {pendingCount} pendiente(s)
            </span>
          </div>

          <div className="max-h-[420px] overflow-y-auto divide-y divide-[#e7e7e9]">
            {error && (
              <div className="bg-rose-50 px-4 py-2 text-xs text-rose-700">{error}</div>
            )}

            {/* Propuestas pendientes */}
            <div className="p-3 space-y-2">
              <div className="flex items-center justify-between px-1">
                <span className="text-[11px] font-semibold uppercase tracking-wider text-neutral-500">
                  Propuestas pendientes (HITL)
                </span>
                <Link
                  to="/settings?tab=hitl"
                  onClick={() => setOpen(false)}
                  className="text-[11px] font-medium text-[#0d5fea] hover:underline"
                >
                  Ver todas
                </Link>
              </div>

              {loading && pendingActions.length === 0 ? (
                <div className="py-4 text-center text-xs text-neutral-500">Cargando propuestas...</div>
              ) : pendingActions.length === 0 ? (
                <div className="rounded-lg border border-dashed border-[#e7e7e9] bg-[#f7f7f8]/70 px-3 py-3 text-center text-xs text-neutral-500">
                  <CheckCircle2 className="mx-auto mb-1 h-4 w-4 text-emerald-600" />
                  Sin acciones pendientes de aprobación.
                </div>
              ) : (
                pendingActions.map((act) => {
                  const isBusy = busyId === act.id;
                  const title =
                    (act.payload?.title as string) ||
                    (act.payload?.full_name as string) ||
                    `${act.target_entity_type}${act.target_entity_id ? ` #${act.target_entity_id}` : ""}`;
                  return (
                    <div
                      key={act.id}
                      className="rounded-lg border border-[#e7e7e9] bg-[#f7f7f8]/60 p-2.5 space-y-2"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5 text-[11px] text-neutral-500">
                            <Bot className="h-3 w-3 text-[#0d5fea]" />
                            <span className="truncate font-medium text-neutral-700">{act.agent_name}</span>
                            <span>·</span>
                            <span>{ACTION_LABELS[act.action_type] || act.action_type}</span>
                          </div>
                          <div className="mt-0.5 text-xs font-semibold text-[#121212] truncate">
                            {title}
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          disabled={isBusy}
                          onClick={() => void handleDecision(act.id, "approve_execute")}
                          className="inline-flex items-center gap-1 rounded-md bg-[#0d5fea] px-2.5 py-1 text-[11px] font-semibold text-white transition hover:bg-[#0b52cc] disabled:opacity-50"
                        >
                          <Play className="h-3 w-3" />
                          {isBusy ? "Aplicando..." : "Aprobar y ejecutar"}
                        </button>
                        <button
                          type="button"
                          disabled={isBusy}
                          onClick={() => void handleDecision(act.id, "reject")}
                          className="inline-flex items-center gap-1 rounded-md border border-[#e7e7e9] bg-white px-2 py-1 text-[11px] font-medium text-neutral-700 transition hover:bg-rose-50 hover:text-rose-700 disabled:opacity-50"
                        >
                          <XCircle className="h-3 w-3" />
                          Rechazar
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            {/* Actividad reciente */}
            <div className="p-3 space-y-2">
              <div className="flex items-center justify-between px-1">
                <span className="text-[11px] font-semibold uppercase tracking-wider text-neutral-500">
                  Actividad reciente
                </span>
                <Link
                  to="/settings?tab=audit"
                  onClick={() => setOpen(false)}
                  className="text-[11px] font-medium text-[#0d5fea] hover:underline"
                >
                  Auditoría
                </Link>
              </div>

              {recentLogs.length === 0 ? (
                <div className="py-2 text-center text-xs text-neutral-400">
                  Sin actividad reciente registrada.
                </div>
              ) : (
                <div className="space-y-1.5">
                  {recentLogs.map((log) => (
                    <div
                      key={log.id}
                      className="flex items-center justify-between gap-2 rounded-lg px-2 py-1.5 text-[11px] hover:bg-[#f7f7f8]"
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        {log.actor_type === "agent" ? (
                          <Bot className="h-3.5 w-3.5 shrink-0 text-[#0d5fea]" />
                        ) : (
                          <User className="h-3.5 w-3.5 shrink-0 text-emerald-600" />
                        )}
                        <div className="truncate">
                          <span className="font-medium text-[#121212]">{log.actor_name}</span>{" "}
                          <span className="text-neutral-500">
                            · {log.action} ({log.entity_type}
                            {log.entity_id ? ` #${log.entity_id}` : ""})
                          </span>
                        </div>
                      </div>
                      <span className="shrink-0 text-[10px] text-neutral-400">
                        {formatDateTimeEs(log.created_at)}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="flex items-center justify-between border-t border-[#e7e7e9] bg-[#f7f7f8] px-4 py-2 text-[11px]">
            <Link
              to="/settings?tab=hitl"
              onClick={() => setOpen(false)}
              className="inline-flex items-center gap-1 font-medium text-neutral-700 hover:text-[#121212]"
            >
              <ShieldCheck className="h-3.5 w-3.5 text-[#0d5fea]" />
              Ir a Supervisión HITL
            </Link>
            <Link
              to="/settings?tab=audit"
              onClick={() => setOpen(false)}
              className="inline-flex items-center gap-1 font-medium text-neutral-700 hover:text-[#121212]"
            >
              <Activity className="h-3.5 w-3.5 text-neutral-500" />
              Registro completo
            </Link>
          </div>
        </div>
      )}
    </div>
  );
};
