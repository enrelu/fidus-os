import React, { useEffect } from "react";
import { X } from "lucide-react";

export const ScorePill: React.FC<{ score: number | null | undefined }> = ({ score }) => {
  if (score === null || score === undefined) {
    return (
      <span className="inline-flex items-center rounded-md border border-[#e7e7e9] bg-[#f7f7f8] px-2 py-0.5 text-[11px] font-medium text-neutral-500">
        —
      </span>
    );
  }
  const color =
    score >= 75
      ? "border-emerald-200 bg-emerald-50 text-emerald-700"
      : score >= 45
      ? "border-amber-200 bg-amber-50 text-amber-800"
      : "border-[#e7e7e9] bg-[#f7f7f8] text-neutral-600";
  return (
    <span
      className={`inline-flex items-center rounded-md border px-2 py-0.5 font-mono text-[11px] font-semibold ${color}`}
    >
      {score}
    </span>
  );
};

const LEAD_STATUS_META: Record<string, { label: string; classes: string }> = {
  new: { label: "Nuevo", classes: "border-sky-200 bg-sky-50 text-sky-700" },
  contacted: { label: "Contactado", classes: "border-indigo-200 bg-indigo-50 text-indigo-700" },
  replied: { label: "Respondido", classes: "border-violet-200 bg-violet-50 text-violet-700" },
  qualified: { label: "Respondido", classes: "border-violet-200 bg-violet-50 text-violet-700" },
  converted: { label: "Convertido", classes: "border-emerald-200 bg-emerald-50 text-emerald-700" },
  unqualified: { label: "No cualificado", classes: "border-neutral-200 bg-neutral-100 text-neutral-600" },
  disqualified: { label: "No cualificado", classes: "border-neutral-200 bg-neutral-100 text-neutral-600" },
  lost: { label: "No cualificado", classes: "border-neutral-200 bg-neutral-100 text-neutral-600" },
};

export const LeadStatusBadge: React.FC<{ status: string }> = ({ status }) => {
  const key = (status || "new").trim().toLowerCase();
  const meta = LEAD_STATUS_META[key] || {
    label: status,
    classes: "border-[#e7e7e9] bg-[#f7f7f8] text-neutral-700",
  };
  return (
    <span className={`inline-flex items-center rounded-md border px-2 py-0.5 text-[11px] font-medium ${meta.classes}`}>
      {meta.label}
    </span>
  );
};

const PRIORITY_META: Record<string, { label: string; classes: string }> = {
  urgent: { label: "Urgente", classes: "border-rose-200 bg-rose-50 text-rose-700" },
  high: { label: "Alta", classes: "border-amber-200 bg-amber-50 text-amber-800" },
  medium: { label: "Media", classes: "border-sky-200 bg-sky-50 text-sky-700" },
  low: { label: "Baja", classes: "border-[#e7e7e9] bg-[#f7f7f8] text-neutral-600" },
};

export const PriorityBadge: React.FC<{ priority: string }> = ({ priority }) => {
  const key = (priority || "medium").trim().toLowerCase();
  const meta = PRIORITY_META[key] || PRIORITY_META.medium;
  return (
    <span className={`inline-flex items-center rounded-md border px-2 py-0.5 text-[11px] font-medium ${meta.classes}`}>
      {meta.label}
    </span>
  );
};

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  maxWidthClass?: string;
  children: React.ReactNode;
}

export const Modal: React.FC<ModalProps> = ({
  open,
  onClose,
  title,
  subtitle,
  maxWidthClass = "max-w-xl",
  children,
}) => {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="fixed inset-0 bg-black/30 backdrop-blur-[1px]" onClick={onClose} />
      <div
        className={`relative z-10 w-full ${maxWidthClass} max-h-[90vh] overflow-y-auto rounded-xl border border-[#e7e7e9] bg-white shadow-xl`}
      >
        <div className="sticky top-0 z-10 flex items-start justify-between gap-3 border-b border-[#e7e7e9] bg-white px-5 py-4">
          <div>
            <h2 className="text-base font-semibold text-[#121212]">{title}</h2>
            {subtitle && <p className="mt-0.5 text-xs text-neutral-500">{subtitle}</p>}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1 text-neutral-400 transition hover:bg-[#f7f7f8] hover:text-[#121212]"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
};

export interface ChipSelectOption {
  value: string;
  label: string;
  pillClass?: string;
}

interface ChipSelectProps {
  value: string;
  options: ChipSelectOption[];
  disabled?: boolean;
  onChange: (value: string) => void;
  ariaLabel?: string;
}

export const ChipSelect: React.FC<ChipSelectProps> = ({
  value,
  options,
  disabled = false,
  onChange,
  ariaLabel,
}) => {
  const current = options.find((opt) => opt.value === value) || options[0];
  return (
    <select
      aria-label={ariaLabel}
      value={value}
      disabled={disabled}
      onChange={(e) => onChange(e.target.value)}
      className={`rounded-md border px-2 py-1 text-[11px] font-medium transition focus:border-[#0d5fea] focus:outline-none disabled:cursor-not-allowed disabled:opacity-70 ${
        current?.pillClass || "border-[#e7e7e9] bg-white text-[#121212]"
      }`}
    >
      {options.map((opt) => (
        <option key={opt.value} value={opt.value} className="bg-white text-[#121212]">
          {opt.label}
        </option>
      ))}
    </select>
  );
};

export const ActorBadge: React.FC<{
  actorType: "human" | "agent" | string;
  actorName: string;
  modelUsed?: string | null;
}> = ({ actorType, actorName, modelUsed }) => {
  const isAgent = actorType === "agent";
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[10px] font-semibold ${
        isAgent
          ? "border-violet-200 bg-violet-50 text-violet-700"
          : "border-[#e7e7e9] bg-[#f7f7f8] text-neutral-700"
      }`}
    >
      <span>{isAgent ? "IA" : "Humano"}</span>
      <span className="font-normal">· {actorName}</span>
      {isAgent && modelUsed && (
        <span className="rounded bg-violet-100 px-1 py-0.2 font-mono text-[9px] text-violet-800">
          {modelUsed}
        </span>
      )}
    </span>
  );
};

