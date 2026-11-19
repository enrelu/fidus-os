import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Activity, ArrowRight, RefreshCw, ShieldAlert } from "lucide-react";
import { ApiError, crmApi } from "../api/client";
import { ActorBadge } from "../components/ui";
import type { ActivityLog, ActorType } from "../types/api";
import { formatDateTimeEs } from "../utils/format";

function dayKeyFromIso(iso: string): string {
  return iso.slice(0, 10);
}

function formatDayHeading(dayKey: string): string {
  const now = new Date();
  const todayKey = now.toISOString().slice(0, 10);
  const yesterday = new Date(now.getTime() - 86400000).toISOString().slice(0, 10);
  if (dayKey === todayKey) return "Hoy";
  if (dayKey === yesterday) return "Ayer";
  const dt = new Date(`${dayKey}T12:00:00`);
  if (Number.isNaN(dt.getTime())) return dayKey;
  return new Intl.DateTimeFormat("es-ES", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(dt);
}

function entityHref(act: ActivityLog): string | null {
  if (!act.entity_id) return null;
  if (act.entity_type === "organization") return `/organization/${act.entity_id}`;
  if (act.entity_type === "client") return `/client/${act.entity_id}`;
  if (act.entity_type === "lead") return `/lead/${act.entity_id}`;
  if (act.entity_type === "opportunity") return `/opportunity/${act.entity_id}`;
  if (act.entity_type === "task") return "/tasks";
  return null;
}

export const FeedPage: React.FC = () => {
  const [activities, setActivities] = useState<ActivityLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actorFilter, setActorFilter] = useState<"all" | ActorType>("all");
  const [entityFilter, setEntityFilter] = useState<string>("all");

  const loadFeed = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await crmApi.listActivities({
        actor_type: actorFilter === "all" ? undefined : actorFilter,
        entity_type: entityFilter === "all" ? undefined : entityFilter,
        limit: 150,
      });
      setActivities(data);
    } catch (err) {
      setError(err instanceof ApiError ? err.detail : "No se pudo cargar el feed de actividad.");
    } finally {
      setLoading(false);
    }
  }, [actorFilter, entityFilter]);

  useEffect(() => {
    void loadFeed();
  }, [loadFeed]);

  useEffect(() => {
    const onUpdated = () => void loadFeed();
    window.addEventListener("fidus:crm-updated", onUpdated);
    return () => window.removeEventListener("fidus:crm-updated", onUpdated);
  }, [loadFeed]);

  const groupedByDay = useMemo(() => {
    const map: Record<string, ActivityLog[]> = {};
    for (const act of activities) {
      const ts = act.timestamp || act.created_at;
      const key = dayKeyFromIso(ts);
      if (!map[key]) map[key] = [];
      map[key].push(act);
    }
    return Object.entries(map).sort((a, b) => b[0].localeCompare(a[0]));
  }, [activities]);

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <Activity className="h-5 w-5 text-[#0d5fea]" />
            <h1 className="text-xl font-semibold tracking-tight text-[#121212]">
              Feed de Actividad
            </h1>
          </div>
          <p className="mt-1 text-xs text-neutral-500">
            Cronología unificada de interacciones comerciales, cambios de estado y acciones de agentes IA.
          </p>
        </div>

        <button
          type="button"
          onClick={() => void loadFeed()}
          className="inline-flex items-center gap-1.5 rounded-lg border border-[#e7e7e9] bg-white px-3 py-1.5 text-xs font-medium text-neutral-700 transition hover:bg-[#f7f7f8]"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
          Actualizar
        </button>
      </div>

      {/* Filtros */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[#e7e7e9] bg-white p-3.5">
        <div className="flex flex-wrap items-center gap-1.5">
          {(
            [
              { id: "all", label: "Todos" },
              { id: "human", label: "Humanos" },
              { id: "agent", label: "Agentes IA" },
            ] as { id: "all" | ActorType; label: string }[]
          ).map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActorFilter(tab.id)}
              className={`rounded-lg px-3 py-1.5 text-xs font-medium transition ${
                actorFilter === tab.id
                  ? "bg-[#121212] text-white"
                  : "border border-[#e7e7e9] bg-white text-neutral-600 hover:bg-[#f7f7f8]"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2">
          <select
            value={entityFilter}
            onChange={(e) => setEntityFilter(e.target.value)}
            className="rounded-lg border border-[#e7e7e9] bg-white px-2.5 py-1.5 text-xs text-[#121212] focus:border-[#0d5fea] focus:outline-none"
          >
            <option value="all">Todas las entidades</option>
            <option value="organization">Organizaciones</option>
            <option value="client">Clientes</option>
            <option value="lead">Leads</option>
            <option value="opportunity">Oportunidades</option>
            <option value="task">Tareas</option>
          </select>
          <span className="text-[11px] text-neutral-400">{activities.length} evento(s)</span>
        </div>
      </div>

      {error && (
        <div className="flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-xs text-rose-800">
          <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {loading ? (
        <div className="rounded-xl border border-[#e7e7e9] bg-white p-10 text-center text-xs text-neutral-500">
          Cargando actividad...
        </div>
      ) : groupedByDay.length === 0 ? (
        <div className="rounded-xl border border-dashed border-[#e7e7e9] bg-white p-10 text-center text-xs text-neutral-500">
          Sin eventos registrados con este filtro.
        </div>
      ) : (
        <div className="space-y-6">
          {groupedByDay.map(([dayKey, items]) => (
            <section key={dayKey} className="space-y-2.5">
              <div className="flex items-center justify-between px-1">
                <h2 className="text-xs font-semibold capitalize text-neutral-600">
                  {formatDayHeading(dayKey)}
                </h2>
                <span className="text-[11px] text-neutral-400">{items.length} evento(s)</span>
              </div>

              <div className="space-y-2">
                {items.map((act) => {
                  const href = entityHref(act);
                  return (
                    <div
                      key={act.id}
                      className="flex flex-col gap-2 rounded-xl border border-[#e7e7e9] bg-white p-4 transition hover:border-neutral-300 sm:flex-row sm:items-center sm:justify-between"
                    >
                      <div className="min-w-0 space-y-1.5">
                        <div className="flex flex-wrap items-center gap-2">
                          <ActorBadge
                            actorType={act.actor_type}
                            actorName={act.actor_name}
                            modelUsed={act.model_used}
                          />
                          <span className="rounded border border-[#e7e7e9] bg-[#f7f7f8] px-1.5 py-0.5 text-[10px] font-medium uppercase text-neutral-500">
                            {act.entity_type}
                          </span>
                          <span className="text-[11px] text-neutral-400">
                            {formatDateTimeEs(act.timestamp || act.created_at)}
                          </span>
                        </div>
                        <div className="text-xs font-medium text-[#121212]">
                          {act.description || act.action}
                        </div>
                      </div>

                      {href && act.action !== "delete" && (
                        <Link
                          to={href}
                          className="inline-flex shrink-0 items-center gap-1 self-start rounded-lg border border-[#e7e7e9] bg-[#f7f7f8] px-2.5 py-1.5 text-[11px] font-medium text-neutral-700 transition hover:bg-neutral-200/70 sm:self-center"
                        >
                          {act.entity_label ? "Abrir ficha" : "Ver"}
                          <ArrowRight className="h-3 w-3" />
                        </Link>
                      )}
                    </div>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
};
