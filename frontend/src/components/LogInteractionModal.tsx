import React, { useEffect, useState } from "react";
import { ApiError, crmApi } from "../api/client";
import type { Entity360Type, InteractionChannel } from "../types/api";
import { Modal } from "./ui";

interface LogInteractionModalProps {
  open: boolean;
  entityType: Entity360Type;
  entityId: number;
  entityLabel: string;
  onClose: () => void;
  onSaved: () => void;
}

const CHANNEL_OPTIONS: { value: InteractionChannel; label: string }[] = [
  { value: "llamada", label: "Llamada telefónica" },
  { value: "reunion", label: "Reunión / Videollamada" },
  { value: "email", label: "Email" },
  { value: "whatsapp", label: "WhatsApp" },
  { value: "nota", label: "Nota interna" },
];

export const LogInteractionModal: React.FC<LogInteractionModalProps> = ({
  open,
  entityType,
  entityId,
  entityLabel,
  onClose,
  onSaved,
}) => {
  const [channel, setChannel] = useState<InteractionChannel>("llamada");
  const [summary, setSummary] = useState("");
  const [outcome, setOutcome] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setChannel("llamada");
    setSummary("");
    setOutcome("");
    setError(null);
  }, [open]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!summary.trim()) return;
    setSaving(true);
    setError(null);
    try {
      await crmApi.createInteraction({
        entity_type: entityType,
        entity_id: entityId,
        channel,
        summary: summary.trim(),
        outcome: outcome.trim() || undefined,
      });
      window.dispatchEvent(new CustomEvent("fidus:crm-updated"));
      onSaved();
      onClose();
    } catch (err) {
      setError(err instanceof ApiError ? err.detail : "No se pudo registrar la interacción.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Registrar interacción"
      subtitle={`En ${entityLabel}`}
      maxWidthClass="max-w-md"
    >
      <form onSubmit={(e) => void handleSubmit(e)} className="space-y-4">
        {error && (
          <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">
            {error}
          </div>
        )}

        <div>
          <label className="block text-xs font-medium text-neutral-700">Canal</label>
          <select
            value={channel}
            onChange={(e) => setChannel(e.target.value as InteractionChannel)}
            className="mt-1 w-full rounded-lg border border-[#e7e7e9] bg-white px-3 py-2 text-sm text-[#121212] focus:border-[#0d5fea] focus:outline-none"
          >
            {CHANNEL_OPTIONS.map((ch) => (
              <option key={ch.value} value={ch.value}>
                {ch.label}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-xs font-medium text-neutral-700">Resumen *</label>
          <textarea
            rows={3}
            required
            value={summary}
            onChange={(e) => setSummary(e.target.value)}
            placeholder="¿Qué se habló o acordó?"
            className="mt-1 w-full rounded-lg border border-[#e7e7e9] px-3 py-2 text-sm text-[#121212] focus:border-[#0d5fea] focus:outline-none"
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-neutral-700">Resultado / Próximo paso</label>
          <input
            type="text"
            value={outcome}
            onChange={(e) => setOutcome(e.target.value)}
            placeholder="Ej. Enviar propuesta económica antes del viernes"
            className="mt-1 w-full rounded-lg border border-[#e7e7e9] px-3 py-2 text-sm text-[#121212] focus:border-[#0d5fea] focus:outline-none"
          />
        </div>

        <div className="flex justify-end gap-2 border-t border-[#e7e7e9] pt-3">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-[#e7e7e9] px-3.5 py-2 text-xs font-medium text-neutral-700 hover:bg-[#f7f7f8]"
          >
            Cancelar
          </button>
          <button
            type="submit"
            disabled={saving}
            className="rounded-lg bg-[#0d5fea] px-4 py-2 text-xs font-semibold text-white hover:bg-[#0b52cc] disabled:opacity-50"
          >
            {saving ? "Guardando..." : "Registrar"}
          </button>
        </div>
      </form>
    </Modal>
  );
};
