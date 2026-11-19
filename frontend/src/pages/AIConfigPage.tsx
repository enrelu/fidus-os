import React, { useCallback, useEffect, useState } from "react";
import {
  Check,
  CheckCircle2,
  Copy,
  Cpu,
  KeyRound,
  Pencil,
  Plus,
  ShieldAlert,
  Sparkles,
  Trash2,
  Wifi,
  XCircle,
} from "lucide-react";
import { aiApi, ApiError } from "../api/client";
import type {
  AgentApiKey,
  AgentApiKeyCreated,
  AIProviderConfig,
  AIProviderType,
  ConnectionTestResponse,
} from "../types/api";
import { formatDateTimeEs } from "../utils/format";

const PROVIDER_OPTIONS: { value: AIProviderType; label: string; needsKey: boolean; defaultUrl?: string }[] = [
  { value: "openai", label: "OpenAI", needsKey: true },
  { value: "anthropic", label: "Anthropic (Claude)", needsKey: true },
  { value: "gemini", label: "Google Gemini", needsKey: true },
  { value: "openrouter", label: "OpenRouter", needsKey: true },
  { value: "mistral", label: "Mistral AI", needsKey: true },
  { value: "ollama", label: "Ollama (Local)", needsKey: false, defaultUrl: "http://localhost:11434/v1" },
  { value: "openai_compatible", label: "OpenAI-Compatible (vLLM / LM Studio)", needsKey: false },
];

const SCOPE_OPTIONS = [
  { value: "crm:read", label: "crm:read (Consultar CRM)" },
  { value: "crm:write", label: "crm:write (Leads e interacciones)" },
  { value: "actions:propose", label: "actions:propose (Proponer acciones HITL)" },
];

export const AIConfigPage: React.FC = () => {
  const [providers, setProviders] = useState<AIProviderConfig[]>([]);
  const [agentKeys, setAgentKeys] = useState<AgentApiKey[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Estado formulario BYOK
  const [editingProvider, setEditingProvider] = useState<AIProviderConfig | null>(null);
  const [showProviderForm, setShowProviderForm] = useState(false);
  const [providerType, setProviderType] = useState<AIProviderType>("openai");
  const [modelName, setModelName] = useState("");
  const [baseUrl, setBaseUrl] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [isDefault, setIsDefault] = useState(true);
  const [isActive, setIsActive] = useState(true);
  const [savingProvider, setSavingProvider] = useState(false);
  const [testResults, setTestResults] = useState<Record<number, ConnectionTestResponse>>({});
  const [testingId, setTestingId] = useState<number | null>(null);

  // Estado formulario AgentApiKey
  const [keyName, setKeyName] = useState("");
  const [selectedScopes, setSelectedScopes] = useState<string[]>([
    "crm:read",
    "crm:write",
    "actions:propose",
  ]);
  const [creatingKey, setCreatingKey] = useState(false);
  const [createdKey, setCreatedKey] = useState<AgentApiKeyCreated | null>(null);
  const [copiedTarget, setCopiedTarget] = useState<"raw" | "json" | null>(null);

  const loadAll = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [provData, keyData] = await Promise.all([
        aiApi.listProviders(),
        aiApi.listAgentKeys(),
      ]);
      setProviders(provData);
      setAgentKeys(keyData);
    } catch (err) {
      setError(err instanceof ApiError ? err.detail : "Error al cargar la configuración de IA.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  const openCreateProvider = () => {
    setEditingProvider(null);
    setProviderType("openai");
    setModelName("gpt-4o-mini");
    setBaseUrl("");
    setApiKey("");
    setIsDefault(providers.length === 0);
    setIsActive(true);
    setShowProviderForm(true);
  };

  const openEditProvider = (cfg: AIProviderConfig) => {
    setEditingProvider(cfg);
    setProviderType(cfg.provider);
    setModelName(cfg.model_name);
    setBaseUrl(cfg.base_url || "");
    setApiKey("");
    setIsDefault(cfg.is_default);
    setIsActive(cfg.is_active);
    setShowProviderForm(true);
  };

  const handleSaveProvider = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingProvider(true);
    setError(null);
    try {
      if (editingProvider) {
        await aiApi.updateProvider(editingProvider.id, {
          model_name: modelName.trim(),
          base_url: baseUrl.trim(),
          api_key: apiKey.trim() || undefined,
          is_default: isDefault,
          is_active: isActive,
        });
      } else {
        await aiApi.createProvider({
          provider: providerType,
          model_name: modelName.trim(),
          base_url: baseUrl.trim() || undefined,
          api_key: apiKey.trim() || undefined,
          is_default: isDefault,
          is_active: isActive,
        });
      }
      setShowProviderForm(false);
      setEditingProvider(null);
      setApiKey("");
      await loadAll();
    } catch (err) {
      setError(err instanceof ApiError ? err.detail : "No se pudo guardar el proveedor BYOK.");
    } finally {
      setSavingProvider(false);
    }
  };

  const handleTestProvider = async (providerId: number) => {
    setTestingId(providerId);
    setError(null);
    try {
      const result = await aiApi.testProvider(providerId);
      setTestResults((prev) => ({ ...prev, [providerId]: result }));
    } catch (err) {
      setError(err instanceof ApiError ? err.detail : "Error al probar la conexión.");
    } finally {
      setTestingId(null);
    }
  };

  const handleDeleteProvider = async (providerId: number) => {
    setError(null);
    try {
      await aiApi.deleteProvider(providerId);
      await loadAll();
    } catch (err) {
      setError(err instanceof ApiError ? err.detail : "No se pudo eliminar el proveedor.");
    }
  };

  const toggleScope = (scope: string) => {
    setSelectedScopes((prev) =>
      prev.includes(scope) ? prev.filter((s) => s !== scope) : [...prev, scope]
    );
  };

  const handleCreateAgentKey = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!keyName.trim() || selectedScopes.length === 0) return;
    setCreatingKey(true);
    setError(null);
    try {
      const res = await aiApi.createAgentKey({
        name: keyName.trim(),
        scopes: selectedScopes.join(","),
      });
      setCreatedKey(res);
      setKeyName("");
      await loadAll();
    } catch (err) {
      setError(err instanceof ApiError ? err.detail : "No se pudo crear la clave MCP.");
    } finally {
      setCreatingKey(false);
    }
  };

  const handleRevokeKey = async (keyId: number) => {
    setError(null);
    try {
      await aiApi.revokeAgentKey(keyId);
      await loadAll();
    } catch (err) {
      setError(err instanceof ApiError ? err.detail : "No se pudo revocar la clave.");
    }
  };

  const copyText = async (text: string, target: "raw" | "json") => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedTarget(target);
      setTimeout(() => setCopiedTarget(null), 2000);
    } catch {
      setError("No se pudo copiar al portapapeles.");
    }
  };

  const mcpSnippetJson = createdKey
    ? JSON.stringify(
        {
          mcpServers: {
            "fidus-os": {
              url: "http://localhost:8000/mcp",
              headers: {
                Authorization: `Bearer ${createdKey.raw_key}`,
              },
            },
          },
        },
        null,
        2
      )
    : "";

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">
          Configuración IA (BYOK + MCP)
        </h1>
        <p className="mt-1 text-sm text-slate-600">
          Gestiona tus proveedores LLM cifrados con Fernet (BYOK) y las claves de acceso para clientes MCP externos.
        </p>
      </div>

      {error && (
        <div className="flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
          <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Sección 1: Proveedores BYOK */}
      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-xs space-y-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2.5">
            <div className="h-9 w-9 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center">
              <Cpu className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-slate-900">Proveedores BYOK / BYO-Model</h2>
              <p className="text-xs text-slate-500">
                Las claves se cifran en reposo y jamás se muestran completas en la API.
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={openCreateProvider}
            className="inline-flex items-center gap-1.5 self-start rounded-lg bg-indigo-600 px-3.5 py-2 text-xs font-semibold text-white transition hover:bg-indigo-500"
          >
            <Plus className="h-4 w-4" />
            Añadir proveedor
          </button>
        </div>

        {showProviderForm && (
          <form
            onSubmit={handleSaveProvider}
            className="rounded-xl border border-indigo-200 bg-indigo-50/40 p-4 space-y-4"
          >
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-slate-900">
                {editingProvider
                  ? `Editar proveedor (${editingProvider.provider})`
                  : "Nuevo proveedor BYOK"}
              </h3>
              <button
                type="button"
                onClick={() => setShowProviderForm(false)}
                className="text-xs text-slate-500 hover:text-slate-700"
              >
                Cancelar
              </button>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label className="block text-xs font-medium text-slate-700">Proveedor</label>
                <select
                  disabled={Boolean(editingProvider)}
                  value={providerType}
                  onChange={(e) => {
                    const next = e.target.value as AIProviderType;
                    setProviderType(next);
                    const opt = PROVIDER_OPTIONS.find((p) => p.value === next);
                    if (opt?.defaultUrl && !baseUrl) setBaseUrl(opt.defaultUrl);
                  }}
                  className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm disabled:bg-slate-100"
                >
                  {PROVIDER_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700">Modelo *</label>
                <input
                  type="text"
                  required
                  value={modelName}
                  onChange={(e) => setModelName(e.target.value)}
                  placeholder="gpt-4o-mini / claude-3-5-sonnet-latest / llama3.2"
                  className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700">
                  API Key {editingProvider ? "(dejar vacío para mantener la actual)" : ""}
                </label>
                <input
                  type="password"
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  placeholder={editingProvider?.api_key_masked || "sk-..."}
                  className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-mono"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700">
                  Base URL (opcional salvo openai_compatible)
                </label>
                <input
                  type="url"
                  value={baseUrl}
                  onChange={(e) => setBaseUrl(e.target.value)}
                  placeholder="http://localhost:11434/v1"
                  className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
                />
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-6">
              <label className="inline-flex items-center gap-2 text-xs font-medium text-slate-700">
                <input
                  type="checkbox"
                  checked={isDefault}
                  onChange={(e) => setIsDefault(e.target.checked)}
                  className="rounded border-slate-300 text-indigo-600"
                />
                Proveedor por defecto del tenant
              </label>

              <label className="inline-flex items-center gap-2 text-xs font-medium text-slate-700">
                <input
                  type="checkbox"
                  checked={isActive}
                  onChange={(e) => setIsActive(e.target.checked)}
                  className="rounded border-slate-300 text-indigo-600"
                />
                Activo
              </label>
            </div>

            <div className="flex justify-end">
              <button
                type="submit"
                disabled={savingProvider}
                className="rounded-lg bg-slate-900 px-4 py-2 text-xs font-semibold text-white hover:bg-slate-800 disabled:opacity-50"
              >
                {savingProvider ? "Guardando..." : "Guardar configuración"}
              </button>
            </div>
          </form>
        )}

        {loading ? (
          <div className="text-sm text-slate-500">Cargando proveedores...</div>
        ) : providers.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500">
            No hay proveedores BYOK configurados todavía.
          </div>
        ) : (
          <div className="space-y-3">
            {providers.map((cfg) => {
              const testRes = testResults[cfg.id];
              return (
                <div
                  key={cfg.id}
                  className="rounded-xl border border-slate-200 p-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-bold text-slate-900 uppercase">{cfg.provider}</span>
                      <span className="rounded bg-slate-100 px-2 py-0.5 font-mono text-xs text-slate-700">
                        {cfg.model_name}
                      </span>
                      {cfg.is_default && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-indigo-50 px-2.5 py-0.5 text-[11px] font-semibold text-indigo-700 border border-indigo-200">
                          <Sparkles className="h-3 w-3" />
                          Por defecto
                        </span>
                      )}
                      {!cfg.is_active && (
                        <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-[11px] font-medium text-slate-600">
                          Inactivo
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-slate-500 flex flex-wrap gap-3">
                      <span>
                        API Key:{" "}
                        <code className="font-mono text-slate-700">
                          {cfg.api_key_masked || "Sin clave (local)"}
                        </code>
                      </span>
                      {cfg.base_url && <span>Endpoint: {cfg.base_url}</span>}
                    </div>
                    {testRes && (
                      <div
                        className={`mt-1 inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-medium ${
                          testRes.ok
                            ? "bg-emerald-50 text-emerald-800 border border-emerald-200"
                            : "bg-rose-50 text-rose-800 border border-rose-200"
                        }`}
                      >
                        {testRes.ok ? (
                          <CheckCircle2 className="h-3.5 w-3.5" />
                        ) : (
                          <XCircle className="h-3.5 w-3.5" />
                        )}
                        <span>
                          {testRes.detail} ({testRes.latency_ms} ms)
                        </span>
                      </div>
                    )}
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      disabled={testingId === cfg.id}
                      onClick={() => void handleTestProvider(cfg.id)}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                    >
                      <Wifi className="h-3.5 w-3.5 text-indigo-600" />
                      {testingId === cfg.id ? "Probando..." : "Probar conexión"}
                    </button>
                    <button
                      type="button"
                      onClick={() => openEditProvider(cfg)}
                      className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                      Editar
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleDeleteProvider(cfg.id)}
                      className="inline-flex items-center gap-1 rounded-lg border border-rose-200 bg-rose-50 px-2.5 py-1.5 text-xs font-medium text-rose-700 hover:bg-rose-100"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Sección 2: Claves MCP / Agentes */}
      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-xs space-y-5">
        <div className="flex items-center gap-2.5">
          <div className="h-9 w-9 rounded-lg bg-amber-50 text-amber-600 flex items-center justify-center">
            <KeyRound className="h-5 w-5" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-slate-900">Claves MCP y Agentes</h2>
            <p className="text-xs text-slate-500">
              Conecta Claude, ChatGPT, Cursor u OpenClaw al endpoint <code className="font-mono">/mcp</code> con permisos granulares.
            </p>
          </div>
        </div>

        <form onSubmit={handleCreateAgentKey} className="rounded-xl border border-slate-200 bg-slate-50 p-4 space-y-3">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className="block text-xs font-medium text-slate-700">
                Nombre del agente o cliente *
              </label>
              <input
                type="text"
                required
                minLength={2}
                value={keyName}
                onChange={(e) => setKeyName(e.target.value)}
                placeholder="Cursor Comercial / Claude Desktop"
                className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700">Scopes permitidos *</label>
              <div className="mt-1.5 flex flex-wrap gap-2">
                {SCOPE_OPTIONS.map((opt) => {
                  const active = selectedScopes.includes(opt.value);
                  return (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => toggleScope(opt.value)}
                      className={`rounded-lg border px-2.5 py-1 text-xs font-medium transition ${
                        active
                          ? "border-indigo-600 bg-indigo-600 text-white"
                          : "border-slate-300 bg-white text-slate-700 hover:bg-slate-100"
                      }`}
                    >
                      {opt.label}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          <div className="flex justify-end">
            <button
              type="submit"
              disabled={creatingKey || selectedScopes.length === 0}
              className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-4 py-2 text-xs font-semibold text-white hover:bg-slate-800 disabled:opacity-50"
            >
              <Plus className="h-3.5 w-3.5" />
              {creatingKey ? "Generando..." : "Generar clave MCP"}
            </button>
          </div>
        </form>

        {createdKey && (
          <div className="rounded-xl border border-emerald-300 bg-emerald-50 p-4 space-y-3">
            <div className="flex items-start justify-between gap-2">
              <div>
                <h3 className="text-sm font-bold text-emerald-950">
                  Clave generada para «{createdKey.name}» (se muestra una única vez)
                </h3>
                <p className="text-xs text-emerald-800">
                  Guárdala ahora en tu gestor de secretos o cliente MCP. No podrás volver a consultarla en claro.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setCreatedKey(null)}
                className="text-xs font-medium text-emerald-800 hover:underline"
              >
                Cerrar
              </button>
            </div>

            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <code className="flex-1 overflow-x-auto rounded-lg border border-emerald-200 bg-white px-3 py-2 font-mono text-xs text-slate-900">
                {createdKey.raw_key}
              </code>
              <button
                type="button"
                onClick={() => void copyText(createdKey.raw_key, "raw")}
                className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-700 px-3 py-2 text-xs font-semibold text-white hover:bg-emerald-600"
              >
                {copiedTarget === "raw" ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                {copiedTarget === "raw" ? "Copiado" : "Copiar token"}
              </button>
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-xs font-semibold text-emerald-900">
                <span>Configuración JSON para Claude / Cursor / OpenClaw (Streamable HTTP)</span>
                <button
                  type="button"
                  onClick={() => void copyText(mcpSnippetJson, "json")}
                  className="inline-flex items-center gap-1 text-emerald-800 hover:underline"
                >
                  {copiedTarget === "json" ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                  {copiedTarget === "json" ? "JSON copiado" : "Copiar JSON"}
                </button>
              </div>
              <pre className="overflow-x-auto rounded-lg border border-emerald-200 bg-slate-950 p-3 text-xs text-emerald-200">
                {mcpSnippetJson}
              </pre>
            </div>
          </div>
        )}

        {agentKeys.length === 0 ? (
          <div className="text-sm text-slate-500">No hay claves de agente creadas.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-slate-200 text-slate-500">
                  <th className="py-2 pr-4 font-semibold">Nombre</th>
                  <th className="py-2 pr-4 font-semibold">Prefijo</th>
                  <th className="py-2 pr-4 font-semibold">Scopes</th>
                  <th className="py-2 pr-4 font-semibold">Último uso</th>
                  <th className="py-2 pr-4 font-semibold">Estado</th>
                  <th className="py-2 text-right font-semibold">Acción</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {agentKeys.map((k) => (
                  <tr key={k.id}>
                    <td className="py-2.5 pr-4 font-medium text-slate-900">{k.name}</td>
                    <td className="py-2.5 pr-4 font-mono text-slate-600">{k.key_prefix}…</td>
                    <td className="py-2.5 pr-4 font-mono text-slate-600">{k.scopes}</td>
                    <td className="py-2.5 pr-4 text-slate-500">{formatDateTimeEs(k.last_used_at)}</td>
                    <td className="py-2.5 pr-4">
                      <span
                        className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                          k.is_active
                            ? "bg-emerald-50 text-emerald-700"
                            : "bg-slate-100 text-slate-500"
                        }`}
                      >
                        {k.is_active ? "Activa" : "Revocada"}
                      </span>
                    </td>
                    <td className="py-2.5 text-right">
                      {k.is_active && (
                        <button
                          type="button"
                          onClick={() => void handleRevokeKey(k.id)}
                          className="rounded-lg border border-rose-200 bg-rose-50 px-2.5 py-1 text-[11px] font-semibold text-rose-700 hover:bg-rose-100"
                        >
                          Revocar
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
};
