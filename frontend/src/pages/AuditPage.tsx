import React, { useCallback, useEffect, useState } from "react";
import { Bot, RefreshCw, User } from "lucide-react";
import { ApiError, crmApi } from "../api/client";
import type { ActivityLog, ActorType } from "../types/api";
import { formatDateTimeEs, tryParseJson } from "../utils/format";

const ENTITY_OPTIONS = [
  { value: "", label: "Todas las entidades" },
  { value: "agent_action", label: "Acciones de agente" },
  { value: "organization", label: "Organizaciones" },
  { value: "client", label: "Contactos / Clientes" },
  { value: "lead", label: "Leads" },
  { value: "opportunity", label: "Oportunidades" },
  { value: "task", label: "Tareas" },
];

export const AuditPage: React.FC = () => {
  const [actorFilter, setActorFilter] = useState<ActorType | "">("");
  const [entityFilter, setEntityFilter] = useState<string>("");
  const [logs, setLogs] = useState<ActivityLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadActivities = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await crmApi.listActivities({
        actor_type: actorFilter || undefined,
        entity_type: entityFilter || undefined,
      });
      setLogs(data);
    } catch (err) {
      setError(err instanceof ApiError ? err.detail : "Error al cargar la auditoría.");
    } finally {
      setLoading(false);
    }
  }, [actorFilter, entityFilter]);

  useEffect(() => {
    void loadActivities();
  }, [loadActivities]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">
            Auditoría de Actividad
          </h1>
          <p className="mt-1 text-sm text-slate-600">
            Trazabilidad completa RGPD/LOPDGDD de acciones realizadas por humanos y agentes IA.
          </p>
        </div>

        <button
          type="button"
          onClick={() => void loadActivities()}
          className="inline-flex items-center gap-2 self-start rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-sm font-medium text-slate-700 shadow-xs transition hover:bg-slate-50"
        >
          <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          Actualizar
        </button>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white p-3.5">
        <div className="flex flex-wrap gap-2">
          {[
            { value: "" as const, label: "Todos" },
            { value: "agent" as const, label: "Agentes IA" },
            { value: "human" as const, label: "Humanos" },
          ].map((opt) => (
            <button
              key={opt.value || "all"}
              type="button"
              onClick={() => setActorFilter(opt.value)}
              className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                actorFilter === opt.value
                  ? "bg-slate-900 text-white"
                  : "bg-slate-100 text-slate-700 hover:bg-slate-200"
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>

        <select
          value={entityFilter}
          onChange={(e) => setEntityFilter(e.target.value)}
          className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 focus:border-indigo-500 focus:outline-none"
        >
          {ENTITY_OPTIONS.map((opt) => (
            <option key={opt.value || "all"} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </div>

      {error && (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
          {error}
        </div>
      )}

      {loading ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-10 text-center text-sm text-slate-500">
          Cargando registro de actividad...
        </div>
      ) : logs.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center text-sm text-slate-500">
          No hay eventos registrados con los filtros seleccionados.
        </div>
      ) : (
        <div className="space-y-3">
          {logs.map((log) => {
            const isAgent = log.actor_type === "agent";
            const parsedDetails = tryParseJson(log.details_json);

            return (
              <div
                key={log.id}
                className="rounded-xl border border-slate-200 bg-white p-4 shadow-xs"
              >
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex flex-wrap items-center gap-2">
                    <span
                      className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                        isAgent
                          ? "bg-indigo-50 text-indigo-700 border border-indigo-200"
                          : "bg-emerald-50 text-emerald-700 border border-emerald-200"
                      }`}
                    >
                      {isAgent ? <Bot className="h-3.5 w-3.5" /> : <User className="h-3.5 w-3.5" />}
                      {isAgent ? "Agente IA" : "Humano"}
                    </span>
                    <span className="text-sm font-semibold text-slate-900">{log.actor_name}</span>
                    {log.model_used && (
                      <span className="rounded bg-slate-100 px-2 py-0.5 font-mono text-[11px] text-slate-600">
                        {log.model_used}
                      </span>
                    )}
                    <span className="rounded-md bg-slate-900/5 px-2 py-0.5 font-mono text-xs text-slate-700">
                      {log.action}
                    </span>
                    <span className="text-xs text-slate-500">
                      {log.entity_type}
                      {log.entity_id !== null ? ` #${log.entity_id}` : ""}
                    </span>
                  </div>

                  <span className="text-xs text-slate-500">{formatDateTimeEs(log.created_at)}</span>
                </div>

                {parsedDetails && Object.keys(parsedDetails).length > 0 && (
                  <pre className="mt-2.5 overflow-x-auto rounded-lg bg-slate-50 p-2.5 text-xs text-slate-700 border border-slate-200/70">
                    {JSON.stringify(parsedDetails, null, 2)}
                  </pre>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
