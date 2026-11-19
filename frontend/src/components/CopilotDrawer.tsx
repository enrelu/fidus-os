import React, { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import {
  Bot,
  CheckCircle2,
  Cpu,
  Play,
  Send,
  ShieldAlert,
  Sparkles,
  Tag,
  Trash2,
  Wrench,
  X,
  XCircle,
} from "lucide-react";
import { aiApi, ApiError, crmApi } from "../api/client";
import type {
  AgentAction,
  CopilotContext,
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

export interface CopilotOpenDetail {
  context?: CopilotContext | null;
  organizationId?: number | null;
  prompt?: string;
}

interface CopilotDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  context?: CopilotContext | null;
  onClearContext?: () => void;
  initialOrganizationId?: number | null;
  initialPrompt?: string | null;
  onConsumeInitialPrompt?: () => void;
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

export const CopilotDrawer: React.FC<CopilotDrawerProps> = ({
  isOpen,
  onClose,
  context,
  onClearContext,
  initialOrganizationId,
  initialPrompt,
  onConsumeInitialPrompt,
}) => {
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
    if (initialOrganizationId) {
      setSelectedOrgId(String(initialOrganizationId));
    }
  }, [initialOrganizationId]);

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

  const sendMessage = useCallback(
    async (rawText: string) => {
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
          context: context || null,
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
    },
    [context, selectedOrgId, sending, turns]
  );

  useEffect(() => {
    if (isOpen && initialPrompt) {
      setInput(initialPrompt);
      onConsumeInitialPrompt?.();
    }
  }, [initialPrompt, isOpen, onConsumeInitialPrompt]);

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
  const contextualQuickPrompts = context?.entity_label
    ? [
        `Prepara un seguimiento para ${context.entity_label}`,
        `Resume el contexto y próximos pasos de ${context.entity_label}`,
        ...QUICK_PROMPTS.slice(0, 1),
      ]
    : QUICK_PROMPTS;

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div
        className="fixed inset-0 bg-black/25 backdrop-blur-[1px] transition-opacity"
        onClick={onClose}
      />

      <aside className="relative z-10 flex h-full w-full max-w-xl flex-col border-l border-[#e7e7e9] bg-white shadow-2xl">
        {/* Cabecera estilo Notion */}
        <div className="flex items-center justify-between border-b border-[#e7e7e9] bg-white px-5 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#0d5fea]/10 text-[#0d5fea]">
              <Sparkles className="h-4 w-4" />
            </div>
            <div>
              <h2 className="text-sm font-semibold tracking-tight text-[#121212]">
                Copiloto IA · FidusOS
              </h2>
              <p className="text-[11px] text-neutral-500">
                Consulta en vivo tu CRM y propone acciones HITL
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1">
            {turns.length > 0 && (
              <button
                type="button"
                onClick={() => {
                  setTurns([]);
                  setError(null);
                }}
                title="Limpiar conversación"
                className="rounded-lg p-1.5 text-neutral-400 transition hover:bg-[#f7f7f8] hover:text-[#121212]"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              title="Cerrar Copiloto"
              className="rounded-lg p-1.5 text-neutral-400 transition hover:bg-[#f7f7f8] hover:text-[#121212]"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* Estado BYOK + chip de contexto + selector de organización */}
        <div className="border-b border-[#e7e7e9] bg-[#f7f7f8] px-4 py-2.5 space-y-2">
          {status && (
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
              {status.has_default_byok ? (
                <div className="inline-flex items-center gap-1.5 text-[#121212]">
                  <Cpu className="h-3.5 w-3.5 text-[#0d5fea]" />
                  <span className="font-medium text-neutral-600">BYOK activo:</span>
                  <span className="rounded-md border border-[#e7e7e9] bg-white px-2 py-0.5 font-mono text-[11px] font-medium text-[#121212]">
                    {status.default_provider} / {status.default_model}
                  </span>
                </div>
              ) : (
                <div className="flex w-full items-center justify-between gap-2 rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-1.5 text-amber-900">
                  <span>Configura un proveedor BYOK para usar el Copiloto.</span>
                  <Link
                    to="/settings?tab=byok"
                    onClick={onClose}
                    className="shrink-0 rounded-md bg-[#121212] px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-neutral-800"
                  >
                    Configurar IA
                  </Link>
                </div>
              )}
            </div>
          )}

          {context && (context.entity_label || context.view) && (
            <div className="flex items-center justify-between gap-2 rounded-lg border border-[#0d5fea]/25 bg-[#0d5fea]/5 px-2.5 py-1.5 text-[11px] text-[#0d5fea]">
              <div className="flex items-center gap-1.5 min-w-0">
                <Tag className="h-3.5 w-3.5 shrink-0" />
                <span className="truncate font-medium">
                  Contexto:{" "}
                  {context.entity_label
                    ? `${context.entity_type || "registro"} · ${context.entity_label}`
                    : `Vista ${context.view}`}
                </span>
              </div>
              {onClearContext && (
                <button
                  type="button"
                  onClick={onClearContext}
                  className="shrink-0 rounded p-0.5 hover:bg-[#0d5fea]/10"
                  title="Quitar contexto"
                >
                  <X className="h-3 w-3" />
                </button>
              )}
            </div>
          )}

          <select
            value={selectedOrgId}
            onChange={(e) => setSelectedOrgId(e.target.value)}
            className="w-full rounded-lg border border-[#e7e7e9] bg-white px-2.5 py-1.5 text-xs text-[#121212] focus:border-[#0d5fea] focus:outline-none"
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
        <div className="border-b border-[#e7e7e9] bg-white px-4 py-2.5 flex flex-wrap gap-1.5">
          {contextualQuickPrompts.map((prompt) => (
            <button
              key={prompt}
              type="button"
              disabled={sending || noByok}
              onClick={() => void sendMessage(prompt)}
              className="rounded-full border border-[#e7e7e9] bg-[#f7f7f8] px-2.5 py-1 text-[11px] font-medium text-[#121212] transition hover:border-[#0d5fea]/40 hover:bg-[#0d5fea]/5 hover:text-[#0d5fea] disabled:opacity-50"
            >
              {prompt}
            </button>
          ))}
        </div>

        {/* Historial */}
        <div ref={scrollRef} className="flex-1 overflow-y-auto bg-[#f7f7f8] px-4 py-4 space-y-4">
          {turns.length === 0 && (
            <div className="rounded-xl border border-dashed border-[#e7e7e9] bg-white p-6 text-center space-y-2">
              <Bot className="mx-auto h-7 w-7 text-[#0d5fea]" />
              <div className="text-sm font-semibold text-[#121212]">
                Pregúntame cualquier cosa de tu CRM
              </div>
              <p className="text-xs text-neutral-500 leading-relaxed">
                Consulto prioridades, oportunidades en EUR y fichas 360 con CIF. Si pides crear leads, tareas o actualizar deals, lo preparo en HITL para aprobar en 1 clic.
              </p>
            </div>
          )}

          {turns.map((turn) => (
            <div
              key={turn.id}
              className={`flex flex-col ${turn.role === "user" ? "items-end" : "items-start"}`}
            >
              <div
                className={`max-w-[92%] rounded-xl px-4 py-3 text-sm ${
                  turn.role === "user"
                    ? "bg-[#121212] text-white"
                    : "border border-[#e7e7e9] bg-white text-[#121212]"
                }`}
              >
                <div className="whitespace-pre-line leading-relaxed">{turn.content}</div>

                {turn.role === "assistant" && (turn.toolsUsed?.length || turn.modelUsed) && (
                  <div className="mt-2.5 flex flex-wrap items-center gap-1.5 border-t border-[#e7e7e9] pt-2">
                    {turn.toolsUsed?.map((tool) => (
                      <span
                        key={tool}
                        className="inline-flex items-center gap-1 rounded-md bg-[#f7f7f8] border border-[#e7e7e9] px-2 py-0.5 font-mono text-[10px] font-medium text-neutral-700"
                      >
                        <Wrench className="h-2.5 w-2.5 text-[#0d5fea]" />
                        {tool}
                      </span>
                    ))}
                    {turn.modelUsed && (
                      <span className="ml-auto font-mono text-[10px] text-neutral-400">
                        {turn.modelUsed}
                      </span>
                    )}
                  </div>
                )}

                {turn.actions && turn.actions.length > 0 && (
                  <div className="mt-3 space-y-2 border-t border-[#e7e7e9] pt-3">
                    <div className="text-[11px] font-semibold uppercase tracking-wide text-[#0d5fea]">
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
                          className="rounded-lg border border-[#e7e7e9] bg-[#f7f7f8] p-3 text-xs space-y-2"
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-semibold text-[#121212]">
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

                          <div className="rounded-md border border-[#e7e7e9] bg-white p-2 space-y-1 text-[11px] text-neutral-700">
                            {Object.entries(act.payload || {}).map(([k, v]) => (
                              <div key={k} className="flex gap-1.5">
                                <span className="font-medium text-neutral-500">{k}:</span>
                                <span className="font-medium text-[#121212] break-all">
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
                                className="inline-flex items-center gap-1 rounded-md bg-[#0d5fea] px-3 py-1.5 text-[11px] font-semibold text-white transition hover:bg-[#0b52cc] disabled:opacity-50"
                              >
                                <Play className="h-3 w-3" />
                                {isBusy ? "Ejecutando..." : "Aprobar y ejecutar"}
                              </button>
                              <button
                                type="button"
                                disabled={isBusy}
                                onClick={() => void handleActionDecision(act.id, "reject")}
                                className="inline-flex items-center gap-1 rounded-md border border-[#e7e7e9] bg-white px-2.5 py-1.5 text-[11px] font-semibold text-neutral-700 transition hover:bg-rose-50 hover:text-rose-700 disabled:opacity-50"
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
              <div className="rounded-xl border border-[#e7e7e9] bg-white px-4 py-3 text-xs text-neutral-500">
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
          className="border-t border-[#e7e7e9] bg-white p-3.5"
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
              placeholder="Ej: ¿Qué tareas son más urgentes? o Crea un lead para Paco Martínez..."
              className="flex-1 resize-none rounded-xl border border-[#e7e7e9] bg-[#f7f7f8] px-3 py-2 text-sm text-[#121212] placeholder-neutral-400 focus:border-[#0d5fea] focus:bg-white focus:outline-none disabled:opacity-60"
            />
            <button
              type="submit"
              disabled={sending || noByok || !input.trim()}
              className="inline-flex h-10 items-center justify-center gap-1.5 rounded-xl bg-[#0d5fea] px-4 text-xs font-semibold text-white transition hover:bg-[#0b52cc] disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Send className="h-3.5 w-3.5" />
              Enviar
            </button>
          </div>
          <div className="mt-1.5 text-[10px] text-neutral-400">
            Enter para enviar · Shift+Enter para salto de línea · Todas las escrituras pasan por HITL.
          </div>
        </form>
      </aside>
    </div>
  );
};
