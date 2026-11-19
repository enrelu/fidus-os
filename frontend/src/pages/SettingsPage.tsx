import React, { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import {
  Activity,
  Cpu,
  KeyRound,
  Radar,
  RefreshCw,
  Send,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { aiApi, ApiError, crmApi } from "../api/client";
import type { Organization, ProactiveRadarResponse, ProactiveStatus } from "../types/api";
import { AIConfigPage } from "./AIConfigPage";
import { AuditPage } from "./AuditPage";
import { SupervisionPage } from "./SupervisionPage";

type SettingsTab = "byok" | "radar" | "mcp" | "hitl" | "audit";

const VALID_TABS: SettingsTab[] = ["byok", "radar", "mcp", "hitl", "audit"];

interface SettingsPageProps {
  onPendingCountChange: (count: number) => void;
}

const RadarSettingsPanel: React.FC = () => {
  const [status, setStatus] = useState<ProactiveStatus | null>(null);
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [staleDays, setStaleDays] = useState(7);
  const [runningRadar, setRunningRadar] = useState(false);
  const [radarResult, setRadarResult] = useState<ProactiveRadarResponse | null>(null);
  const [ingestText, setIngestText] = useState("");
  const [ingestOrgId, setIngestOrgId] = useState("");
  const [ingesting, setIngesting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadRadarInfo = useCallback(async () => {
    try {
      const [st, orgs] = await Promise.all([
        aiApi.getProactiveStatus(),
        crmApi.listOrganizations(),
      ]);
      setStatus(st);
      setOrganizations(orgs);
    } catch (err) {
      setError(err instanceof ApiError ? err.detail : "No se pudo consultar el estado del Radar.");
    }
  }, []);

  useEffect(() => {
    void loadRadarInfo();
  }, [loadRadarInfo]);

  const handleRunRadar = async () => {
    setRunningRadar(true);
    setError(null);
    setMessage(null);
    try {
      const res = await aiApi.runProactiveRadar(staleDays);
      setRadarResult(res);
      setMessage(
        `Radar completado: ${res.findings_count} señal(es) detectada(s) y ${res.created_actions.length} acción(es) propuestas en HITL.`
      );
      window.dispatchEvent(new CustomEvent("fidus:crm-updated"));
      await loadRadarInfo();
    } catch (err) {
      setError(err instanceof ApiError ? err.detail : "Error al ejecutar el Radar Comercial.");
    } finally {
      setRunningRadar(false);
    }
  };

  const handleIngest = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!ingestText.trim()) return;
    setIngesting(true);
    setError(null);
    setMessage(null);
    try {
      const res = await aiApi.ingestProactiveText({
        text: ingestText.trim(),
        organization_id: ingestOrgId ? Number(ingestOrgId) : null,
      });
      setIngestText("");
      setMessage(
        `Ingesta completada (${res.created_actions.length} acción(es) en HITL): ${res.summary}`
      );
      window.dispatchEvent(new CustomEvent("fidus:crm-updated"));
      await loadRadarInfo();
    } catch (err) {
      setError(err instanceof ApiError ? err.detail : "Error al procesar la ingesta libre.");
    } finally {
      setIngesting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-[#e7e7e9] bg-white p-5 space-y-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-[#0d5fea]/10 text-[#0d5fea]">
              <Radar className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-[#121212]">
                Radar Comercial Proactivo (BYOK)
              </h2>
              <p className="text-xs text-neutral-500">
                Escanea oportunidades estancadas, leads sin seguimiento y tareas vencidas para proponer acciones HITL.
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => void loadRadarInfo()}
            className="inline-flex items-center gap-1.5 self-start rounded-lg border border-[#e7e7e9] bg-white px-3 py-1.5 text-xs font-medium text-neutral-700 hover:bg-[#f7f7f8]"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            Refrescar estado
          </button>
        </div>

        {status && (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3 text-xs">
            <div className="rounded-lg border border-[#e7e7e9] bg-[#f7f7f8] p-3">
              <div className="text-neutral-500">Proveedor BYOK activo</div>
              <div className="mt-1 font-semibold text-[#121212]">
                {status.has_default_byok
                  ? `${status.default_provider} / ${status.default_model}`
                  : "No configurado"}
              </div>
            </div>
            <div className="rounded-lg border border-[#e7e7e9] bg-[#f7f7f8] p-3">
              <div className="text-neutral-500">Worker en segundo plano</div>
              <div className="mt-1 font-semibold text-[#121212]">
                {status.worker_online ? "Worker Redis online" : "Modo ejecución local"}
              </div>
            </div>
            <div className="rounded-lg border border-[#e7e7e9] bg-[#f7f7f8] p-3">
              <div className="text-neutral-500">Propuestas HITL pendientes</div>
              <div className="mt-1 font-semibold text-[#0d5fea]">
                {status.pending_actions_count}
              </div>
            </div>
          </div>
        )}

        <div className="flex flex-wrap items-center gap-3 border-t border-[#e7e7e9] pt-4">
          <label className="inline-flex items-center gap-2 text-xs text-neutral-700">
            Umbral de inactividad (días):
            <input
              type="number"
              min={1}
              max={90}
              value={staleDays}
              onChange={(e) => setStaleDays(Number(e.target.value || 7))}
              className="w-16 rounded-lg border border-[#e7e7e9] px-2 py-1 text-xs"
            />
          </label>

          <button
            type="button"
            disabled={runningRadar || (status !== null && !status.has_default_byok)}
            onClick={() => void handleRunRadar()}
            className="inline-flex items-center gap-1.5 rounded-lg bg-[#0d5fea] px-4 py-2 text-xs font-semibold text-white transition hover:bg-[#0b52cc] disabled:opacity-50"
          >
            <Radar className={`h-3.5 w-3.5 ${runningRadar ? "animate-spin" : ""}`} />
            {runningRadar ? "Analizando pipeline..." : "Ejecutar Radar ahora"}
          </button>
        </div>

        {error && (
          <div className="flex items-start gap-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-800">
            <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {message && (
          <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-800">
            {message}
          </div>
        )}

        {radarResult && (
          <div className="rounded-lg border border-[#e7e7e9] bg-[#f7f7f8] p-3.5 text-xs text-[#121212] whitespace-pre-line">
            <div className="mb-1 font-semibold">Último briefing del Radar:</div>
            {radarResult.briefing}
          </div>
        )}
      </div>

      {/* Ingesta libre */}
      <form
        onSubmit={(e) => void handleIngest(e)}
        className="rounded-xl border border-[#e7e7e9] bg-white p-5 space-y-3"
      >
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-[#0d5fea]" />
          <h3 className="text-sm font-semibold text-[#121212]">
            Ingesta de texto libre (Notas / Email / Llamada)
          </h3>
        </div>
        <textarea
          rows={3}
          value={ingestText}
          onChange={(e) => setIngestText(e.target.value)}
          placeholder="Pega aquí notas comerciales para extraer acciones estructuradas hacia HITL..."
          className="w-full rounded-lg border border-[#e7e7e9] px-3 py-2 text-sm focus:border-[#0d5fea] focus:outline-none"
        />
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <select
            value={ingestOrgId}
            onChange={(e) => setIngestOrgId(e.target.value)}
            className="rounded-lg border border-[#e7e7e9] bg-white px-3 py-1.5 text-xs text-[#121212]"
          >
            <option value="">Organización opcional...</option>
            {organizations.map((o) => (
              <option key={o.id} value={o.id}>
                {o.name}
              </option>
            ))}
          </select>
          <button
            type="submit"
            disabled={ingesting || !ingestText.trim() || (status !== null && !status.has_default_byok)}
            className="inline-flex items-center gap-1.5 rounded-lg bg-[#121212] px-4 py-2 text-xs font-semibold text-white hover:bg-neutral-800 disabled:opacity-50"
          >
            <Send className="h-3.5 w-3.5" />
            {ingesting ? "Procesando..." : "Analizar y proponer HITL"}
          </button>
        </div>
      </form>
    </div>
  );
};

export const SettingsPage: React.FC<SettingsPageProps> = ({ onPendingCountChange }) => {
  const [searchParams, setSearchParams] = useSearchParams();
  const rawTab = searchParams.get("tab") as SettingsTab | null;
  const activeTab: SettingsTab = rawTab && VALID_TABS.includes(rawTab) ? rawTab : "byok";

  const setTab = (tab: SettingsTab) => {
    setSearchParams({ tab });
  };

  const tabs: { id: SettingsTab; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
    { id: "byok", label: "IA (BYOK)", icon: Cpu },
    { id: "radar", label: "Radar Comercial", icon: Radar },
    { id: "mcp", label: "MCP y Claves de Agente", icon: KeyRound },
    { id: "hitl", label: "Supervisión HITL", icon: ShieldCheck },
    { id: "audit", label: "Auditoría", icon: Activity },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap gap-1.5 rounded-xl border border-[#e7e7e9] bg-white p-1.5">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setTab(tab.id)}
              className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition ${
                isActive
                  ? "bg-[#121212] text-white"
                  : "text-neutral-600 hover:bg-[#f7f7f8] hover:text-[#121212]"
              }`}
            >
              <Icon className="h-3.5 w-3.5" />
              {tab.label}
            </button>
          );
        })}
      </div>

      {activeTab === "byok" && <AIConfigPage section="byok" />}
      {activeTab === "radar" && <RadarSettingsPanel />}
      {activeTab === "mcp" && <AIConfigPage section="mcp" />}
      {activeTab === "hitl" && <SupervisionPage onPendingCountChange={onPendingCountChange} />}
      {activeTab === "audit" && <AuditPage />}
    </div>
  );
};
