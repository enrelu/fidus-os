import React, { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  AlertTriangle,
  Award,
  BarChart3,
  Building2,
  RefreshCw,
  ShieldAlert,
  TrendingUp,
  UserPlus,
  Users,
} from "lucide-react";
import { ApiError, crmApi } from "../api/client";
import type { DashboardAnalyticsResponse } from "../types/api";
import { formatDateTimeEs, formatEur } from "../utils/format";

export const DashboardPage: React.FC = () => {
  const [data, setData] = useState<DashboardAnalyticsResponse | null>(null);
  const [selectedYear, setSelectedYear] = useState<number>(new Date().getFullYear());
  const [selectedQuarter, setSelectedQuarter] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadAnalytics = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await crmApi.getDashboardAnalytics({
        year: selectedYear,
        quarter: selectedQuarter,
      });
      setData(res);
    } catch (err) {
      setError(err instanceof ApiError ? err.detail : "Error al cargar la analítica del panel.");
    } finally {
      setLoading(false);
    }
  }, [selectedYear, selectedQuarter]);

  useEffect(() => {
    void loadAnalytics();
  }, [loadAnalytics]);

  useEffect(() => {
    const onUpdated = () => void loadAnalytics();
    window.addEventListener("fidus:crm-updated", onUpdated);
    return () => window.removeEventListener("fidus:crm-updated", onUpdated);
  }, [loadAnalytics]);

  const maxFunnelCount = Math.max(1, ...(data?.lead_funnel.map((f) => f.count) || [1]));
  const maxStageValue = Math.max(1, ...(data?.opp_pipeline.map((s) => s.value) || [1]));
  const maxForecastValue = Math.max(
    1,
    ...(data?.forecast.map((f) => Math.max(f.pipeline_eur, f.won_eur)) || [1])
  );
  const maxMonthlyActivities = Math.max(
    1,
    ...(data?.monthly_activity.map((m) => Math.max(m.activities, m.leads)) || [1])
  );

  return (
    <div className="space-y-6">
      {/* Filtros año y trimestre */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <BarChart3 className="h-5 w-5 text-[#0d5fea]" />
            <h1 className="text-xl font-semibold tracking-tight text-[#121212]">
              Panel Analítico CRM
            </h1>
          </div>
          <p className="mt-1 text-xs text-neutral-500">
            Rendimiento comercial en EUR, embudo de conversión, previsión trimestral y concentración de cartera.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <select
            value={selectedYear}
            onChange={(e) => setSelectedYear(Number(e.target.value))}
            className="rounded-lg border border-[#e7e7e9] bg-white px-3 py-1.5 text-xs font-medium text-[#121212] focus:border-[#0d5fea] focus:outline-none"
          >
            {(data?.filters.available_years || [new Date().getFullYear()]).map((yr) => (
              <option key={yr} value={yr}>
                Año {yr}
              </option>
            ))}
          </select>

          <div className="inline-flex rounded-lg border border-[#e7e7e9] bg-white p-0.5">
            {[
              { value: null, label: "Todo el año" },
              { value: 1, label: "T1" },
              { value: 2, label: "T2" },
              { value: 3, label: "T3" },
              { value: 4, label: "T4" },
            ].map((q) => (
              <button
                key={q.label}
                type="button"
                onClick={() => setSelectedQuarter(q.value)}
                className={`rounded-md px-2.5 py-1 text-xs font-medium transition ${
                  selectedQuarter === q.value
                    ? "bg-[#121212] text-white"
                    : "text-neutral-600 hover:text-[#121212]"
                }`}
              >
                {q.label}
              </button>
            ))}
          </div>

          <button
            type="button"
            onClick={() => void loadAnalytics()}
            className="inline-flex items-center gap-1.5 rounded-lg border border-[#e7e7e9] bg-white px-3 py-1.5 text-xs font-medium text-neutral-700 hover:bg-[#f7f7f8]"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
            Actualizar
          </button>
        </div>
      </div>

      {error && (
        <div className="flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-xs text-rose-800">
          <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {loading && !data ? (
        <div className="rounded-xl border border-[#e7e7e9] bg-white p-12 text-center text-xs text-neutral-500">
          Calculando métricas del panel...
        </div>
      ) : (
        data && (
          <>
            {/* KPIs */}
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <div className="rounded-xl border border-[#e7e7e9] bg-white p-4">
                <div className="flex items-center justify-between text-xs text-neutral-500">
                  <span>Pipeline abierto</span>
                  <TrendingUp className="h-4 w-4 text-[#0d5fea]" />
                </div>
                <div className="mt-2 text-2xl font-semibold tracking-tight text-[#121212]">
                  {formatEur(data.kpis.pipeline_value)}
                </div>
                <div className="mt-1 text-[11px] text-neutral-500">
                  Ponderado: <span className="font-medium text-[#121212]">{formatEur(data.kpis.weighted_pipeline)}</span>
                </div>
              </div>

              <div className="rounded-xl border border-[#e7e7e9] bg-white p-4">
                <div className="flex items-center justify-between text-xs text-neutral-500">
                  <span>Cerrado ganado</span>
                  <Award className="h-4 w-4 text-emerald-600" />
                </div>
                <div className="mt-2 text-2xl font-semibold tracking-tight text-emerald-700">
                  {formatEur(data.kpis.won_value)}
                </div>
                <div className="mt-1 text-[11px] text-neutral-500">
                  Win rate: <span className="font-medium text-[#121212]">{data.kpis.win_rate}%</span>
                </div>
              </div>

              <div className="rounded-xl border border-[#e7e7e9] bg-white p-4">
                <div className="flex items-center justify-between text-xs text-neutral-500">
                  <span>Leads del periodo</span>
                  <UserPlus className="h-4 w-4 text-[#0d5fea]" />
                </div>
                <div className="mt-2 text-2xl font-semibold tracking-tight text-[#121212]">
                  {data.kpis.total_leads}
                </div>
                <div className="mt-1 text-[11px] text-neutral-500">
                  Conversión: <span className="font-medium text-[#121212]">{data.kpis.conversion_rate}%</span>
                </div>
              </div>

              <div className="rounded-xl border border-[#e7e7e9] bg-white p-4">
                <div className="flex items-center justify-between text-xs text-neutral-500">
                  <span>Clientes nuevos</span>
                  <Users className="h-4 w-4 text-neutral-500" />
                </div>
                <div className="mt-2 text-2xl font-semibold tracking-tight text-[#121212]">
                  {data.kpis.total_clients}
                </div>
                <div className="mt-1 text-[11px] text-neutral-500">
                  Top 1 cartera:{" "}
                  <span className="font-medium text-[#121212]">
                    {data.concentration.top1_share_pct}%
                  </span>
                </div>
              </div>
            </div>

            {/* Embudo de Leads + Pipeline por Etapa */}
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              <div className="rounded-xl border border-[#e7e7e9] bg-white p-5 space-y-4">
                <div className="flex items-center justify-between">
                  <h2 className="text-sm font-semibold text-[#121212]">Embudo de Leads</h2>
                  <Link to="/leads" className="text-xs font-medium text-[#0d5fea] hover:underline">
                    Ir a Leads
                  </Link>
                </div>
                <div className="space-y-3">
                  {data.lead_funnel.map((stage) => {
                    const pct = Math.round((stage.count / maxFunnelCount) * 100);
                    return (
                      <div key={stage.status} className="space-y-1">
                        <div className="flex items-center justify-between text-xs">
                          <span className="font-medium text-neutral-700">{stage.label}</span>
                          <span className="font-mono font-semibold text-[#121212]">
                            {stage.count}
                          </span>
                        </div>
                        <div className="h-2 w-full rounded-full bg-[#f7f7f8] overflow-hidden">
                          <div
                            className="h-full rounded-full bg-[#0d5fea] transition-all"
                            style={{ width: `${stage.count > 0 ? Math.max(6, pct) : 0}%` }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="rounded-xl border border-[#e7e7e9] bg-white p-5 space-y-4">
                <div className="flex items-center justify-between">
                  <h2 className="text-sm font-semibold text-[#121212]">Pipeline por Etapa (EUR)</h2>
                  <Link
                    to="/opportunities"
                    className="text-xs font-medium text-[#0d5fea] hover:underline"
                  >
                    Ir a Oportunidades
                  </Link>
                </div>
                <div className="space-y-3">
                  {data.opp_pipeline.map((st) => {
                    const pct = Math.round((st.value / maxStageValue) * 100);
                    const barColor =
                      st.stage === "closed_won"
                        ? "bg-emerald-600"
                        : st.stage === "closed_lost"
                        ? "bg-neutral-400"
                        : "bg-[#121212]";
                    return (
                      <div key={st.stage} className="space-y-1">
                        <div className="flex items-center justify-between text-xs">
                          <span className="font-medium text-neutral-700">
                            {st.label}{" "}
                            <span className="text-neutral-400">({st.count})</span>
                          </span>
                          <span className="font-semibold text-[#121212]">
                            {formatEur(st.value)}
                          </span>
                        </div>
                        <div className="h-2 w-full rounded-full bg-[#f7f7f8] overflow-hidden">
                          <div
                            className={`h-full rounded-full transition-all ${barColor}`}
                            style={{ width: `${st.value > 0 ? Math.max(5, pct) : 0}%` }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Previsión Trimestral + Actividad Mensual */}
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              <div className="rounded-xl border border-[#e7e7e9] bg-white p-5 space-y-4">
                <div className="flex items-center justify-between">
                  <h2 className="text-sm font-semibold text-[#121212]">
                    Previsión Trimestral ({data.filters.year})
                  </h2>
                  <span className="text-[11px] text-neutral-400">Pipeline vs Ganado</span>
                </div>

                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  {data.forecast.map((q) => {
                    const pipeH = Math.round((q.pipeline_eur / maxForecastValue) * 100);
                    const wonH = Math.round((q.won_eur / maxForecastValue) * 100);
                    return (
                      <div
                        key={q.quarter}
                        className="rounded-lg border border-[#e7e7e9] bg-[#f7f7f8]/70 p-3 flex flex-col justify-between"
                      >
                        <div className="flex items-center justify-between text-xs font-semibold text-[#121212]">
                          <span>{q.quarter}</span>
                          <span className="text-[10px] font-normal text-neutral-500">
                            {q.count} ops
                          </span>
                        </div>

                        <div className="my-3 flex h-20 items-end justify-center gap-2">
                          <div className="w-5 rounded-t bg-[#0d5fea]/25 h-full flex items-end">
                            <div
                              className="w-full rounded-t bg-[#0d5fea]"
                              style={{ height: `${q.pipeline_eur > 0 ? Math.max(8, pipeH) : 0}%` }}
                              title={`Pipeline: ${formatEur(q.pipeline_eur)}`}
                            />
                          </div>
                          <div className="w-5 rounded-t bg-emerald-100 h-full flex items-end">
                            <div
                              className="w-full rounded-t bg-emerald-600"
                              style={{ height: `${q.won_eur > 0 ? Math.max(8, wonH) : 0}%` }}
                              title={`Ganado: ${formatEur(q.won_eur)}`}
                            />
                          </div>
                        </div>

                        <div className="space-y-0.5 text-[10px]">
                          <div className="flex justify-between text-neutral-600">
                            <span>Pipe:</span>
                            <span className="font-semibold text-[#121212]">
                              {formatEur(q.pipeline_eur)}
                            </span>
                          </div>
                          <div className="flex justify-between text-neutral-600">
                            <span>Ganado:</span>
                            <span className="font-semibold text-emerald-700">
                              {formatEur(q.won_eur)}
                            </span>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="rounded-xl border border-[#e7e7e9] bg-white p-5 space-y-4">
                <div className="flex items-center justify-between">
                  <h2 className="text-sm font-semibold text-[#121212]">
                    Actividad Mensual ({data.filters.year})
                  </h2>
                  <span className="text-[11px] text-neutral-400">Eventos y nuevos leads</span>
                </div>

                <div className="flex h-40 items-end gap-1.5 pt-4">
                  {data.monthly_activity.map((m) => {
                    const actH = Math.round((m.activities / maxMonthlyActivities) * 100);
                    const leadH = Math.round((m.leads / maxMonthlyActivities) * 100);
                    return (
                      <div key={m.month} className="flex-1 flex flex-col items-center gap-1.5">
                        <div className="w-full h-28 flex items-end justify-center gap-0.5">
                          <div
                            className="w-2.5 rounded-t bg-[#121212]/80"
                            style={{ height: `${m.activities > 0 ? Math.max(6, actH) : 2}%` }}
                            title={`${m.label}: ${m.activities} actividad(es)`}
                          />
                          <div
                            className="w-2.5 rounded-t bg-[#0d5fea]"
                            style={{ height: `${m.leads > 0 ? Math.max(6, leadH) : 0}%` }}
                            title={`${m.label}: ${m.leads} lead(s)`}
                          />
                        </div>
                        <span className="text-[10px] font-medium text-neutral-500">{m.label}</span>
                      </div>
                    );
                  })}
                </div>
                <div className="flex items-center gap-4 text-[11px] text-neutral-500">
                  <span className="inline-flex items-center gap-1.5">
                    <span className="h-2.5 w-2.5 rounded-xs bg-[#121212]/80" /> Actividades CRM
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    <span className="h-2.5 w-2.5 rounded-xs bg-[#0d5fea]" /> Nuevos leads
                  </span>
                </div>
              </div>
            </div>

            {/* Top clientes + Cierres ganados + Riesgo de concentración */}
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
              <div className="rounded-xl border border-[#e7e7e9] bg-white p-5 space-y-3">
                <div className="flex items-center justify-between">
                  <h2 className="text-sm font-semibold text-[#121212]">Top Organizaciones</h2>
                  <Building2 className="h-4 w-4 text-neutral-400" />
                </div>
                {data.top_clients.length === 0 ? (
                  <p className="text-xs text-neutral-400">
                    Asocia oportunidades a organizaciones para ver el ranking.
                  </p>
                ) : (
                  <div className="space-y-2">
                    {data.top_clients.map((org) => (
                      <div
                        key={org.organization_id}
                        className="flex items-center justify-between rounded-lg border border-[#e7e7e9] bg-[#f7f7f8]/60 px-3 py-2 text-xs"
                      >
                        <div className="min-w-0">
                          <div className="truncate font-semibold text-[#121212]">{org.name}</div>
                          <div className="text-[10px] text-neutral-500">
                            {org.cif || "Sin CIF"} · {org.opportunities_count} op(s)
                          </div>
                        </div>
                        <div className="text-right shrink-0 font-semibold text-[#121212]">
                          {formatEur(org.total_eur)}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="rounded-xl border border-[#e7e7e9] bg-white p-5 space-y-3">
                <div className="flex items-center justify-between">
                  <h2 className="text-sm font-semibold text-[#121212]">Cierres Ganados Recientes</h2>
                  <Award className="h-4 w-4 text-emerald-600" />
                </div>
                {data.recent_wins.length === 0 ? (
                  <p className="text-xs text-neutral-400">
                    Todavía no hay oportunidades ganadas en el periodo.
                  </p>
                ) : (
                  <div className="space-y-2">
                    {data.recent_wins.map((win) => (
                      <div
                        key={win.id}
                        className="flex items-center justify-between rounded-lg border border-[#e7e7e9] bg-[#f7f7f8]/60 px-3 py-2 text-xs"
                      >
                        <div className="min-w-0">
                          <div className="truncate font-semibold text-[#121212]">{win.title}</div>
                          <div className="text-[10px] text-neutral-500">
                            {win.organization_name || "Sin organización"} ·{" "}
                            {formatDateTimeEs(win.updated_at)}
                          </div>
                        </div>
                        <div className="shrink-0 font-semibold text-emerald-700">
                          {formatEur(win.amount_eur)}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="rounded-xl border border-[#e7e7e9] bg-white p-5 space-y-4">
                <div className="flex items-center justify-between">
                  <h2 className="text-sm font-semibold text-[#121212]">Concentración de Cartera</h2>
                  {data.concentration.top1_share_pct >= 50 && (
                    <AlertTriangle className="h-4 w-4 text-amber-600" />
                  )}
                </div>

                <div className="space-y-3 text-xs">
                  <div className="rounded-lg border border-[#e7e7e9] bg-[#f7f7f8] p-3">
                    <div className="text-neutral-500">Principal cuenta en pipeline</div>
                    <div className="mt-1 flex items-baseline justify-between">
                      <span className="font-semibold text-[#121212] truncate">
                        {data.concentration.top1_name || "—"}
                      </span>
                      <span className="text-base font-bold text-[#0d5fea]">
                        {data.concentration.top1_share_pct}%
                      </span>
                    </div>
                  </div>

                  <div className="rounded-lg border border-[#e7e7e9] bg-[#f7f7f8] p-3">
                    <div className="text-neutral-500">Peso Top 3 cuentas abiertas</div>
                    <div className="mt-1 text-base font-bold text-[#121212]">
                      {data.concentration.top3_share_pct}%
                    </div>
                  </div>

                  {data.concentration.top1_share_pct >= 50 && (
                    <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] text-amber-900">
                      Alta concentración comercial en una sola cuenta. Conviene diversificar el pipeline con nuevos leads.
                    </div>
                  )}
                </div>
              </div>
            </div>
          </>
        )
      )}
    </div>
  );
};
