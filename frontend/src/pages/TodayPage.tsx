import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  AlertCircle,
  ArrowRight,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Clock,
  Plus,
  RefreshCw,
  ShieldAlert,
  Sparkles,
  Sun,
  Target,
  UserCheck,
  UserPlus,
} from "lucide-react";
import { aiApi, ApiError, crmApi } from "../api/client";
import type { TodayPrioritiesResponse, TodayPriorityItem } from "../types/api";
import { formatEur } from "../utils/format";
import { Modal, PriorityBadge, ScorePill } from "../components/ui";

type KindFilter = "all" | "task" | "lead_followup" | "opportunity_stalled" | "client_followup";

export const TodayPage: React.FC = () => {
  const [data, setData] = useState<TodayPrioritiesResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [kindFilter, setKindFilter] = useState<KindFilter>("all");
  const [attentionOpen, setAttentionOpen] = useState(true);
  const [busyKey, setBusyKey] = useState<string | null>(null);

  // Modal rápido de crear tarea de seguimiento
  const [taskModalItem, setTaskModalItem] = useState<TodayPriorityItem | null>(null);
  const [taskTitle, setTaskTitle] = useState("");
  const [taskPriority, setTaskPriority] = useState<"low" | "medium" | "high" | "urgent">("high");
  const [savingTask, setSavingTask] = useState(false);

  const loadToday = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await crmApi.getTodayPriorities(7);
      setData(res);
    } catch (err) {
      setError(err instanceof ApiError ? err.detail : "No se pudieron cargar las prioridades de hoy.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadToday();
  }, [loadToday]);

  useEffect(() => {
    const onUpdated = () => void loadToday();
    window.addEventListener("fidus:crm-updated", onUpdated);
    return () => window.removeEventListener("fidus:crm-updated", onUpdated);
  }, [loadToday]);

  const filteredItems = useMemo(() => {
    if (!data) return [];
    if (kindFilter === "all") return data.items;
    return data.items.filter((it) => it.kind === kindFilter);
  }, [data, kindFilter]);

  const handleCompleteTask = async (item: TodayPriorityItem) => {
    setBusyKey(item.id);
    setError(null);
    setFeedback(null);
    try {
      await crmApi.updateTask(item.entity_id, { status: "completed" });
      setFeedback(`Tarea «${item.title}» completada.`);
      window.dispatchEvent(new CustomEvent("fidus:crm-updated"));
      await loadToday();
    } catch (err) {
      setError(err instanceof ApiError ? err.detail : "No se pudo completar la tarea.");
    } finally {
      setBusyKey(null);
    }
  };

  const handleQualifyLead = async (leadId: number, label: string, key: string) => {
    setBusyKey(key);
    setError(null);
    setFeedback(null);
    try {
      const res = await aiApi.qualifyLead(leadId);
      setFeedback(
        `Lead «${label}» cualificado (${res.score ?? "—"}/100).${
          res.created_action ? " Propuesta HITL creada en Bandeja." : ""
        }`
      );
      window.dispatchEvent(new CustomEvent("fidus:crm-updated"));
      await loadToday();
    } catch (err) {
      setError(err instanceof ApiError ? err.detail : "No se pudo cualificar el lead con IA.");
    } finally {
      setBusyKey(null);
    }
  };

  const openFollowupModal = (item: TodayPriorityItem) => {
    setTaskModalItem(item);
    setTaskTitle(`Seguimiento: ${item.title}`);
    setTaskPriority(item.priority === "low" ? "medium" : item.priority);
  };

  const handleCreateFollowupTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!taskModalItem || !taskTitle.trim()) return;
    setSavingTask(true);
    setError(null);
    try {
      await crmApi.createTask({
        title: taskTitle.trim(),
        organization_id: taskModalItem.organization_id,
        opportunity_id: taskModalItem.opportunity_id,
        client_id: taskModalItem.entity_type === "client" ? taskModalItem.entity_id : null,
        priority: taskPriority,
        status: "pending",
      });
      setTaskModalItem(null);
      setFeedback(`Tarea de seguimiento creada para «${taskModalItem.title}».`);
      window.dispatchEvent(new CustomEvent("fidus:crm-updated"));
      await loadToday();
    } catch (err) {
      setError(err instanceof ApiError ? err.detail : "No se pudo crear la tarea de seguimiento.");
    } finally {
      setSavingTask(false);
    }
  };

  const askCopilot = (item: TodayPriorityItem) => {
    window.dispatchEvent(
      new CustomEvent("fidus:open-copilot", {
        detail: {
          context: {
            view: "today",
            entity_type: item.entity_type,
            entity_id: item.entity_id,
            entity_label: item.title,
          },
          organizationId: item.organization_id,
          prompt: `Prepara el siguiente paso comercial para ${item.title}`,
        },
      })
    );
  };

  const entityRoute = (item: TodayPriorityItem) => {
    if (item.entity_type === "lead") return `/lead/${item.entity_id}`;
    if (item.entity_type === "opportunity") return `/opportunity/${item.entity_id}`;
    if (item.entity_type === "client") return `/client/${item.entity_id}`;
    return "/tasks";
  };

  const kindLabel: Record<TodayPriorityItem["kind"], string> = {
    task: "Tarea",
    lead_followup: "Lead",
    opportunity_stalled: "Oportunidad",
    client_followup: "Cliente",
  };

  return (
    <div className="space-y-6">
      {/* Cabecera */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <Sun className="h-5 w-5 text-[#0d5fea]" />
            <h1 className="text-xl font-semibold tracking-tight text-[#121212]">
              Agenda de Hoy
            </h1>
          </div>
          <p className="mt-1 text-xs text-neutral-500">
            Cola accionable priorizada por impacto comercial, vencimientos y señales sin actividad.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() =>
              window.dispatchEvent(
                new CustomEvent("fidus:open-copilot", {
                  detail: {
                    context: { view: "today" },
                    prompt: "¿Qué es lo más urgente que debo atender hoy en mi CRM?",
                  },
                })
              )
            }
            className="inline-flex items-center gap-1.5 rounded-lg border border-[#e7e7e9] bg-white px-3 py-1.5 text-xs font-medium text-[#121212] transition hover:bg-[#f7f7f8]"
          >
            <Sparkles className="h-3.5 w-3.5 text-[#0d5fea]" />
            Resumir mi día con IA
          </button>

          <button
            type="button"
            onClick={() => void loadToday()}
            className="inline-flex items-center gap-1.5 rounded-lg border border-[#e7e7e9] bg-white px-3 py-1.5 text-xs font-medium text-neutral-700 transition hover:bg-[#f7f7f8]"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
            Actualizar
          </button>
        </div>
      </div>

      {/* KPI Strip */}
      {data && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          <div className="rounded-xl border border-[#e7e7e9] bg-white p-3.5">
            <div className="text-[11px] font-medium text-neutral-500">Tareas vencidas</div>
            <div
              className={`mt-1 text-xl font-semibold ${
                data.summary.overdue_tasks_count > 0 ? "text-rose-600" : "text-[#121212]"
              }`}
            >
              {data.summary.overdue_tasks_count}
            </div>
            <div className="mt-0.5 text-[11px] text-neutral-400">
              {data.summary.open_tasks_count} abiertas en total
            </div>
          </div>

          <div className="rounded-xl border border-[#e7e7e9] bg-white p-3.5">
            <div className="text-[11px] font-medium text-neutral-500">Leads sin actividad</div>
            <div className="mt-1 text-xl font-semibold text-[#121212]">
              {data.summary.stale_leads_count}
            </div>
            <div className="mt-0.5 text-[11px] text-neutral-400">Más de 7 días parados</div>
          </div>

          <div className="rounded-xl border border-[#e7e7e9] bg-white p-3.5">
            <div className="text-[11px] font-medium text-neutral-500">Deals en riesgo</div>
            <div className="mt-1 text-xl font-semibold text-[#121212]">
              {data.summary.stalled_opportunities_count}
            </div>
            <div className="mt-0.5 text-[11px] text-neutral-400">Parados o sin tarea</div>
          </div>

          <div className="rounded-xl border border-[#e7e7e9] bg-white p-3.5">
            <div className="text-[11px] font-medium text-neutral-500">Clientes seguimiento</div>
            <div className="mt-1 text-xl font-semibold text-[#121212]">
              {data.summary.clients_pending_count}
            </div>
            <div className="mt-0.5 text-[11px] text-neutral-400">+14 días sin contacto</div>
          </div>

          <Link
            to="/settings?tab=hitl"
            className="rounded-xl border border-[#e7e7e9] bg-white p-3.5 transition hover:border-[#0d5fea]/40"
          >
            <div className="text-[11px] font-medium text-neutral-500">Bandeja HITL</div>
            <div className="mt-1 flex items-center justify-between">
              <span className="text-xl font-semibold text-[#0d5fea]">
                {data.summary.pending_hitl_count}
              </span>
              <ArrowRight className="h-4 w-4 text-[#0d5fea]" />
            </div>
            <div className="mt-0.5 text-[11px] text-neutral-400">Propuestas por revisar</div>
          </Link>
        </div>
      )}

      {error && (
        <div className="flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-xs text-rose-800">
          <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {feedback && (
        <div className="flex items-start gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-xs text-emerald-800">
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{feedback}</span>
        </div>
      )}

      {/* Contenido principal: Cola de prioridades + Panel Atención */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Cola de prioridades (2 cols) */}
        <div className="lg:col-span-2 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap gap-1.5">
              {(
                [
                  { id: "all", label: "Todas" },
                  { id: "task", label: "Tareas" },
                  { id: "lead_followup", label: "Leads" },
                  { id: "opportunity_stalled", label: "Oportunidades" },
                  { id: "client_followup", label: "Clientes" },
                ] as { id: KindFilter; label: string }[]
              ).map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setKindFilter(tab.id)}
                  className={`rounded-lg px-3 py-1.5 text-xs font-medium transition ${
                    kindFilter === tab.id
                      ? "bg-[#121212] text-white"
                      : "border border-[#e7e7e9] bg-white text-neutral-600 hover:bg-[#f7f7f8]"
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
            {data && (
              <span className="text-[11px] text-neutral-400">
                {filteredItems.length} elemento(s)
              </span>
            )}
          </div>

          {loading ? (
            <div className="rounded-xl border border-[#e7e7e9] bg-white p-10 text-center text-xs text-neutral-500">
              Calculando prioridades comerciales...
            </div>
          ) : filteredItems.length === 0 ? (
            <div className="rounded-xl border border-dashed border-[#e7e7e9] bg-white p-10 text-center space-y-2">
              <CheckCircle2 className="mx-auto h-7 w-7 text-emerald-600" />
              <div className="text-sm font-semibold text-[#121212]">Todo al día</div>
              <p className="text-xs text-neutral-500">
                No hay elementos pendientes en esta categoría. Puedes crear leads u oportunidades para empezar.
              </p>
            </div>
          ) : (
            <div className="space-y-2.5">
              {filteredItems.map((item) => {
                const isBusy = busyKey === item.id;
                return (
                  <div
                    key={item.id}
                    className="rounded-xl border border-[#e7e7e9] bg-white p-4 transition hover:border-neutral-300"
                  >
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                      <div className="min-w-0 space-y-1.5">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="rounded-md border border-[#e7e7e9] bg-[#f7f7f8] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-neutral-600">
                            {kindLabel[item.kind]}
                          </span>
                          <PriorityBadge priority={item.priority} />
                          {item.is_overdue && (
                            <span className="inline-flex items-center gap-1 rounded-md border border-rose-200 bg-rose-50 px-2 py-0.5 text-[10px] font-semibold text-rose-700">
                              <Clock className="h-2.5 w-2.5" />
                              Atención urgente
                            </span>
                          )}
                          {item.score !== null && <ScorePill score={item.score} />}
                          {item.amount_eur !== null && (
                            <span className="rounded-md border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-700">
                              {formatEur(item.amount_eur)}
                            </span>
                          )}
                        </div>

                        {item.entity_type === "task" ? (
                          <div className="text-sm font-semibold text-[#121212]">{item.title}</div>
                        ) : (
                          <Link
                            to={entityRoute(item)}
                            className="block text-sm font-semibold text-[#121212] hover:text-[#0d5fea] hover:underline"
                          >
                            {item.title}
                          </Link>
                        )}
                        <div className="text-xs text-neutral-500">{item.reason}</div>
                      </div>

                      <div className="flex flex-wrap items-center gap-1.5 shrink-0">
                        {item.kind === "task" && (
                          <button
                            type="button"
                            disabled={isBusy}
                            onClick={() => void handleCompleteTask(item)}
                            className="inline-flex items-center gap-1 rounded-lg bg-[#121212] px-2.5 py-1.5 text-[11px] font-semibold text-white transition hover:bg-neutral-800 disabled:opacity-50"
                          >
                            <CheckCircle2 className="h-3.5 w-3.5" />
                            {isBusy ? "..." : "Completar"}
                          </button>
                        )}

                        {item.entity_type === "lead" && (
                          <button
                            type="button"
                            disabled={isBusy}
                            onClick={() => void handleQualifyLead(item.entity_id, item.title, item.id)}
                            className="inline-flex items-center gap-1 rounded-lg border border-[#0d5fea]/30 bg-[#0d5fea]/5 px-2.5 py-1.5 text-[11px] font-semibold text-[#0d5fea] transition hover:bg-[#0d5fea]/10 disabled:opacity-50"
                          >
                            <Sparkles className="h-3.5 w-3.5" />
                            {isBusy ? "Analizando..." : "Cualificar IA"}
                          </button>
                        )}

                        {item.kind !== "task" && (
                          <button
                            type="button"
                            onClick={() => openFollowupModal(item)}
                            className="inline-flex items-center gap-1 rounded-lg border border-[#e7e7e9] bg-white px-2.5 py-1.5 text-[11px] font-medium text-[#121212] transition hover:bg-[#f7f7f8]"
                          >
                            <Plus className="h-3.5 w-3.5" />
                            Tarea
                          </button>
                        )}

                        <button
                          type="button"
                          onClick={() => askCopilot(item)}
                          title="Preguntar al Copiloto IA sobre este registro"
                          className="inline-flex items-center gap-1 rounded-lg border border-[#e7e7e9] bg-white px-2.5 py-1.5 text-[11px] font-medium text-neutral-700 transition hover:border-[#0d5fea]/40 hover:text-[#0d5fea]"
                        >
                          <Sparkles className="h-3 w-3" />
                          IA
                        </button>

                        <Link
                          to={entityRoute(item)}
                          className="inline-flex items-center gap-1 rounded-lg border border-[#e7e7e9] bg-[#f7f7f8] px-2.5 py-1.5 text-[11px] font-medium text-neutral-700 transition hover:bg-neutral-200/70"
                        >
                          Abrir
                          <ArrowRight className="h-3 w-3" />
                        </Link>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Panel lateral colapsable: Atención */}
        <div className="space-y-3">
          <div className="rounded-xl border border-[#e7e7e9] bg-white overflow-hidden">
            <button
              type="button"
              onClick={() => setAttentionOpen((prev) => !prev)}
              className="flex w-full items-center justify-between border-b border-[#e7e7e9] bg-[#f7f7f8] px-4 py-3 text-left"
            >
              <div className="flex items-center gap-2">
                <AlertCircle className="h-4 w-4 text-amber-600" />
                <span className="text-xs font-semibold text-[#121212]">Panel de Atención</span>
              </div>
              {attentionOpen ? (
                <ChevronDown className="h-4 w-4 text-neutral-500" />
              ) : (
                <ChevronRight className="h-4 w-4 text-neutral-500" />
              )}
            </button>

            {attentionOpen && (
              <div className="p-4 space-y-5">
                {/* Leads estancados */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-[11px] font-semibold uppercase tracking-wider text-neutral-500">
                    <span className="inline-flex items-center gap-1">
                      <UserPlus className="h-3.5 w-3.5" />
                      Leads sin actividad
                    </span>
                    <Link to="/leads" className="text-[#0d5fea] hover:underline normal-case">
                      Ver leads
                    </Link>
                  </div>

                  {!data || data.attention.stale_leads.length === 0 ? (
                    <div className="rounded-lg border border-dashed border-[#e7e7e9] px-3 py-2.5 text-xs text-neutral-400">
                      Sin leads estancados (+7 días).
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {data.attention.stale_leads.slice(0, 6).map((sl) => (
                        <Link
                          key={sl.id}
                          to={`/lead/${sl.id}`}
                          className="block rounded-lg border border-[#e7e7e9] bg-[#f7f7f8]/60 p-2.5 space-y-1.5 transition hover:border-[#0d5fea]/40"
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="truncate text-xs font-semibold text-[#121212]">
                              {sl.full_name}
                            </span>
                            <ScorePill score={sl.score} />
                          </div>
                          <div className="flex items-center justify-between text-[11px] text-neutral-500">
                            <span className="truncate">{sl.company_name || "Sin empresa"}</span>
                            <span className="shrink-0 font-medium text-amber-700">
                              {sl.days_without_activity}d sin actividad
                            </span>
                          </div>
                        </Link>
                      ))}
                    </div>
                  )}
                </div>

                {/* Oportunidades paradas */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-[11px] font-semibold uppercase tracking-wider text-neutral-500">
                    <span className="inline-flex items-center gap-1">
                      <Target className="h-3.5 w-3.5" />
                      Oportunidades paradas
                    </span>
                    <Link to="/opportunities" className="text-[#0d5fea] hover:underline normal-case">
                      Ver pipeline
                    </Link>
                  </div>

                  {!data || data.attention.stale_opportunities.length === 0 ? (
                    <div className="rounded-lg border border-dashed border-[#e7e7e9] px-3 py-2.5 text-xs text-neutral-400">
                      Pipeline activo con tareas abiertas.
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {data.attention.stale_opportunities.slice(0, 6).map((op) => (
                        <Link
                          key={op.id}
                          to={`/opportunity/${op.id}`}
                          className="block rounded-lg border border-[#e7e7e9] bg-[#f7f7f8]/60 p-2.5 space-y-1 transition hover:border-[#0d5fea]/40"
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="truncate text-xs font-semibold text-[#121212]">
                              {op.title}
                            </span>
                            <span className="shrink-0 text-[11px] font-semibold text-emerald-700">
                              {formatEur(op.amount_eur)}
                            </span>
                          </div>
                          <div className="flex items-center justify-between text-[11px] text-neutral-500">
                            <span className="truncate">
                              {op.organization_name || "Sin organización"}
                            </span>
                            <span className="shrink-0 text-amber-700">
                              {!op.has_open_task ? "Sin tarea" : `${op.days_without_activity}d`}
                            </span>
                          </div>
                        </Link>
                      ))}
                    </div>
                  )}
                </div>

                {/* Acceso rápido a clientes */}
                <div className="rounded-lg border border-[#e7e7e9] bg-[#f7f7f8] p-3 flex items-center justify-between">
                  <div className="flex items-center gap-2 text-xs text-neutral-600">
                    <UserCheck className="h-4 w-4 text-[#0d5fea]" />
                    <span>Revisar consentimientos RGPD</span>
                  </div>
                  <Link
                    to="/clients"
                    className="text-xs font-semibold text-[#0d5fea] hover:underline"
                  >
                    Clientes
                  </Link>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Modal rápido de seguimiento */}
      <Modal
        open={taskModalItem !== null}
        onClose={() => setTaskModalItem(null)}
        title="Crear tarea de seguimiento"
        subtitle={taskModalItem ? `Relacionada con: ${taskModalItem.title}` : undefined}
        maxWidthClass="max-w-md"
      >
        <form onSubmit={(e) => void handleCreateFollowupTask(e)} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-neutral-700">Título de la tarea *</label>
            <input
              type="text"
              required
              value={taskTitle}
              onChange={(e) => setTaskTitle(e.target.value)}
              className="mt-1 w-full rounded-lg border border-[#e7e7e9] px-3 py-2 text-sm text-[#121212] focus:border-[#0d5fea] focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-neutral-700">Prioridad</label>
            <select
              value={taskPriority}
              onChange={(e) =>
                setTaskPriority(e.target.value as "low" | "medium" | "high" | "urgent")
              }
              className="mt-1 w-full rounded-lg border border-[#e7e7e9] bg-white px-3 py-2 text-sm text-[#121212] focus:border-[#0d5fea] focus:outline-none"
            >
              <option value="urgent">Urgente</option>
              <option value="high">Alta</option>
              <option value="medium">Media</option>
              <option value="low">Baja</option>
            </select>
          </div>

          <div className="flex justify-end gap-2 border-t border-[#e7e7e9] pt-3">
            <button
              type="button"
              onClick={() => setTaskModalItem(null)}
              className="rounded-lg border border-[#e7e7e9] px-3.5 py-2 text-xs font-medium text-neutral-700 hover:bg-[#f7f7f8]"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={savingTask}
              className="rounded-lg bg-[#0d5fea] px-4 py-2 text-xs font-semibold text-white hover:bg-[#0b52cc] disabled:opacity-50"
            >
              {savingTask ? "Guardando..." : "Crear tarea"}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
};
