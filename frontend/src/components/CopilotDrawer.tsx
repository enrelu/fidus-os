import React, { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import {
  Bot,
  CheckCircle2,
  Cpu,
  Play,
  Send,
  ShieldAlert,
  Sparkles,
  Trash2,
  Wrench,
  X,
  XCircle,
} from "lucide-react";
import { aiApi, ApiError, crmApi } from "../api/client";
import type {
  AgentAction,
  CopilotMessage,
  Organization,
  ProactiveStatus,
} from "../types/api";

interface ChatTurn {
  id: string;
  role: "user" | "assistant";
  content: string;
  toolsUsed?: string[];
  modelUsed?: string;
  actions?: AgentAction[];
}

interface CopilotDrawerProps {
  isOpen: boolean;
  onClose: () => void;
}

const QUICK_PROMPTS = [
  "¿Qué tareas son las más urgentes?",
  "Resumen de oportunidades en EUR",
  "¿Qué acciones tengo pendientes de aprobar?",
];

const ACTION_LABELS: Record<string, string> = {
  create_task: "Crear tarea",
  create_lead: "Crear lead",
  update_opportunity: "Actualizar oportunidad",
};

export const CopilotDrawer: React.FC<CopilotDrawerProps> = ({ isOpen, onClose }) => {
  const [status, setStatus] = useState<ProactiveStatus | null>(null);
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [selectedOrgId, setSelectedOrgId] = useState<string>("");
  const [turns, setTurns] = useState<ChatTurn[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [busyActionId, setBusyActionId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const scrollRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    aiApi
      .getProactiveStatus()
      .then(setStatus)
      .catch(() => null);
    crmApi
      .listOrganizations()
      .then(setOrganizations)
      .catch(() => []);
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [isOpen, onClose]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [turns, sending]);

  const sendMessage = async (rawText: string) => {
    const trimmed = rawText.trim();
    if (!trimmed || sending) return;

    setError(null);
    const userTurn: ChatTurn = {
      id: `user-${Date.now()}`,
      role: "user",
      content: trimmed,
    };

    const nextTurns = [...turns, userTurn];
    setTurns(nextTurns);
    setInput("");
    setSending(true);

    try {
      const apiMessages: CopilotMessage[] = nextTurns.map((t) => ({
        role: t.role,
        content: t.content,
      }));
      const res = await aiApi.copilotChat({
        messages: apiMessages,
        organization_id: selectedOrgId ? Number(selectedOrgId) : null,
      });

      const assistantTurn: ChatTurn = {
        id: `assistant-${Date.now()}`,
        role: "assistant",
        content: res.answer,
        toolsUsed: res.tools_used,
        modelUsed: res.model_used,
        actions: res.created_actions,
      };
      setTurns((prev) => [...prev, assistantTurn]);

      if (res.created_actions.length > 0 || res.tools_used.includes("registrar_interaccion")) {
        window.dispatchEvent(new CustomEvent("fidus:crm-updated"));
      }
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.detail
          : "No se pudo obtener respuesta del Copiloto CRM BYOK."
      );
    } finally {
      setSending(false);
    }
  };

  const handleActionDecision = async (
    actionId: number,
    decision: "approve_execute" | "reject"
  ) => {
    setBusyActionId(actionId);
    setError(null);
    try {
      const updated =
        decision === "approve_execute"
          ? await aiApi.approveAndExecuteAgentAction(actionId)
          : await aiApi.rejectAgentAction(actionId);

      setTurns((prev) =>
        prev.map((turn) => ({
          ...turn,
          actions: turn.actions?.map((act) => (act.id === actionId ? updated : act)),
        }))
      );
      window.dispatchEvent(new CustomEvent("fidus:crm-updated"));
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.detail
          : "No se pudo procesar la acción desde el Copiloto."
      );
    } finally {
      setBusyActionId(null);
    }
  };

  if (!isOpen) return null;

  const noByok = status !== null && !status.has_default_byok;

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div
        className="fixed inset-0 bg-slate-950/40 backdrop-blur-[1px] transition-opacity"
        onClick={onClose}
      />

      <aside className="relative z-10 flex h-full w-full max-w-xl flex-col bg-white shadow-2xl border-l border-slate-200">
        {/* Cabecera */}
        <div className="flex items-center justify-between border-b border-slate-200 bg-slate-950 px-5 py-4 text-white">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-indigo-600 shadow-xs">
              <Sparkles className="h-4 w-4 text-white" />
            </div>
            <div>
              <h2 className="text-sm font-bold tracking-tight">Copiloto CRM BYOK</h2>
              <p className="text-[11px] text-slate-300">
                Consulta en vivo tu CRM y propone acciones HITL
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            {turns.length > 0 && (
              <button
                type="button"
                onClick={() => {
                  setTurns([]);
                  setError(null);
                }}
                title="Limpiar conversación"
                className="rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-800 hover:text-white"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              title="Cerrar Copiloto"
              className="rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-800 hover:text-white"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* Estado BYOK + contexto organización */}
        <div className="border-b border-slate-200 bg-slate-50 px-4 py-2.5 space-y-2">
          {status && (
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
              {status.has_default_byok ? (
                <div className="inline-flex items-center gap-1.5 text-indigo-900">
                  <Cpu className="h-3.5 w-3.5 text-indigo-600" />
                  <span className="font-medium">BYOK activo:</span>
                  <span className="rounded bg-indigo-100 px-1.5 py-0.5 font-mono text-[11px] font-semibold text-indigo-800">
                    {status.default_provider} / {status.default_model}
                  </span>
                </div>
              ) : (
                <div className="flex w-full items-center justify-between gap-2 rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-1.5 text-amber-900">
                  <span>Configura un proveedor BYOK para usar el Copiloto.</span>
                  <Link
                    to="/configuracion-ia"
                    onClick={onClose}
                    className="shrink-0 rounded bg-amber-900 px-2 py-1 text-[11px] font-semibold text-white hover:bg-amber-800"
                  >
                    Configurar IA
                  </Link>
                </div>
              )}
            </div>
          )}

          <select
            value={selectedOrgId}
            onChange={(e) => setSelectedOrgId(e.target.value)}
            className="w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-700 focus:border-indigo-500 focus:outline-none"
          >
            <option value="">Todas las cuentas del tenant (contexto global)</option>
            {organizations.map((org) => (
              <option key={org.id} value={org.id}>
                Cuenta enfocada: {org.name} {org.cif ? `(${org.cif})` : ""}
              </option>
            ))}
          </select>
        </div>

        {/* Preguntas rápidas */}
        <div className="border-b border-slate-100 px-4 py-2.5 flex flex-wrap gap-1.5 bg-white">
          {QUICK_PROMPTS.map((prompt) => (
            <button
              key={prompt}
              type="button"
              disabled={sending || noByok}
              onClick={() => void sendMessage(prompt)}
              className="rounded-full border border-indigo-200 bg-indigo-50/70 px-2.5 py-1 text-[11px] font-medium text-indigo-800 transition hover:bg-indigo-100 disabled:opacity-50"
            >
              {prompt}
            </button>
          ))}
        </div>

        {/* Historial de mensajes */}
        <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-4 space-y-4 bg-slate-50/60">
          {turns.length === 0 && (
            <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-6 text-center space-y-2">
              <Bot className="mx-auto h-8 w-8 text-indigo-500" />
              <div className="text-sm font-semibold text-slate-900">
                Pregúntame cualquier cosa de tu CRM
              </div>
              <p className="text-xs text-slate-500 leading-relaxed">
                Puedo consultar tareas urgentes, oportunidades en EUR, fichas 360 con CIF y también proponer nuevos leads, tareas o actualizaciones para que las apruebes aquí mismo en 1 clic.
              </p>
            </div>
          )}

          {turns.map((turn) => (
            <div
              key={turn.id}
              className={`flex flex-col ${
                turn.role === "user" ? "items-end" : "items-start"
              }`}
            >
              <div
                className={`max-w-[92%] rounded-2xl px-4 py-3 text-sm shadow-xs ${
                  turn.role === "user"
                    ? "bg-slate-900 text-white"
                    : "border border-slate-200 bg-white text-slate-800"
                }`}
              >
                <div className="whitespace-pre-line leading-relaxed">{turn.content}</div>

                {turn.role === "assistant" && (turn.toolsUsed?.length || turn.modelUsed) && (
                  <div className="mt-2.5 flex flex-wrap items-center gap-1.5 border-t border-slate-100 pt-2">
                    {turn.toolsUsed?.map((tool) => (
                      <span
                        key={tool}
                        className="inline-flex items-center gap-1 rounded-md bg-slate-100 px-2 py-0.5 font-mono text-[10px] font-medium text-slate-700"
                      >
                        <Wrench className="h-2.5 w-2.5 text-indigo-500" />
                        {tool}
                      </span>
                    ))}
                    {turn.modelUsed && (
                      <span className="ml-auto font-mono text-[10px] text-slate-400">
                        {turn.modelUsed}
                      </span>
                    )}
                  </div>
                )}

                {turn.actions && turn.actions.length > 0 && (
                  <div className="mt-3 space-y-2 border-t border-slate-100 pt-3">
                    <div className="text-[11px] font-semibold uppercase tracking-wide text-indigo-700">
                      Acciones propuestas (HITL)
                    </div>
                    {turn.actions.map((act) => {
                      const isPending = act.status === "pending_approval";
                      const isExecuted = act.status === "executed";
                      const isRejected = act.status === "rejected";
                      const isBusy = busyActionId === act.id;

                      return (
                        <div
                          key={act.id}
                          className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs space-y-2"
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-semibold text-slate-900">
                              #{act.id} · {ACTION_LABELS[act.action_type] || act.action_type}
                            </span>
                            <span
                              className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                                isExecuted
                                  ? "bg-emerald-100 text-emerald-800"
                                  : isRejected
                                  ? "bg-rose-100 text-rose-800"
                                  : "bg-amber-100 text-amber-800"
                              }`}
                            >
                              {isExecuted
                                ? "Ejecutada en CRM"
                                : isRejected
                                ? "Rechazada"
                                : "Pendiente"}
                            </span>
                          </div>

                          <div className="rounded-lg bg-white p-2 border border-slate-200/70 space-y-1 text-[11px] text-slate-700">
                            {Object.entries(act.payload || {}).map(([k, v]) => (
                              <div key={k} className="flex gap-1.5">
                                <span className="font-medium text-slate-500">{k}:</span>
                                <span className="font-medium text-slate-900 break-all">
                                  {typeof v === "object" && v !== null
                                    ? JSON.stringify(v)
                                    : String(v ?? "—")}
                                </span>
                              </div>
                            ))}
                          </div>

                          {isPending && (
                            <div className="flex flex-wrap items-center gap-2 pt-1">
                              <button
                                type="button"
                                disabled={isBusy}
                                onClick={() => void handleActionDecision(act.id, "approve_execute")}
                                className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-3 py-1.5 text-[11px] font-semibold text-white transition hover:bg-emerald-500 disabled:opacity-50"
                              >
                                <Play className="h-3 w-3" />
                                {isBusy ? "Ejecutando..." : "Aprobar y ejecutar"}
                              </button>
                              <button
                                type="button"
                                disabled={isBusy}
                                onClick={() => void handleActionDecision(act.id, "reject")}
                                className="inline-flex items-center gap-1 rounded-lg border border-rose-200 bg-rose-50 px-2.5 py-1.5 text-[11px] font-semibold text-rose-700 transition hover:bg-rose-100 disabled:opacity-50"
                              >
                                <XCircle className="h-3 w-3" />
                                Rechazar
                              </button>
                            </div>
                          )}

                          {isExecuted && (
                            <div className="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-700">
                              <CheckCircle2 className="h-3.5 w-3.5" />
                              Aplicada correctamente en el CRM.
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          ))}

          {sending && (
            <div className="flex items-start">
              <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-xs text-slate-500 shadow-xs">
                Consultando herramientas CRM y redactando respuesta...
              </div>
            </div>
          )}

          {error && (
            <div className="flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 px-3.5 py-2.5 text-xs text-rose-800">
              <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}
        </div>

        {/* Input */}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void sendMessage(input);
          }}
          className="border-t border-slate-200 bg-white p-3.5"
        >
          <div className="flex items-end gap-2">
            <textarea
              rows={2}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  void sendMessage(input);
                }
              }}
              disabled={sending || noByok}
              placeholder="Ej: ¿Qué tareas son más urgentes? o Crea un lead para Paco Martínez de AENOR..."
              className="flex-1 resize-none rounded-xl border border-slate-300 px-3 py-2 text-sm text-slate-900 placeholder-slate-400 focus:border-indigo-500 focus:outline-none disabled:bg-slate-50"
            />
            <button
              type="submit"
              disabled={sending || noByok || !input.trim()}
              className="inline-flex h-10 items-center justify-center gap-1.5 rounded-xl bg-indigo-600 px-4 text-xs font-semibold text-white shadow-xs transition hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Send className="h-3.5 w-3.5" />
              Enviar
            </button>
          </div>
          <div className="mt-1.5 text-[10px] text-slate-400">
            Enter para enviar · Shift+Enter para salto de línea · Todas las escrituras pasan por HITL.
          </div>
        </form>
      </aside>
    </div>
  );
};
