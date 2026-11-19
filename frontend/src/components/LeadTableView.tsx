import React, { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowDown, ArrowUp, ArrowUpDown, ArrowRightCircle, Pencil, Sparkles, Trash2 } from "lucide-react";
import type { Lead } from "../types/api";
import { formatDateTimeEs } from "../utils/format";
import { ScorePill } from "./ui";

type SortField = "full_name" | "company_name" | "status" | "score" | "updated_at";

interface LeadTableViewProps {
  leads: Lead[];
  qualifyingId: number | null;
  onStatusChange: (lead: Lead, nextStatus: string) => void;
  onQualify: (lead: Lead) => void;
  onConvert: (lead: Lead) => void;
  onEdit: (lead: Lead) => void;
  onDelete: (lead: Lead) => void;
  onAskCopilot: (lead: Lead) => void;
}

const STATUS_SELECT_OPTIONS = [
  { value: "new", label: "Nuevo" },
  { value: "contacted", label: "Contactado" },
  { value: "replied", label: "Respondido" },
  { value: "Converted", label: "Convertido" },
  { value: "unqualified", label: "No cualificado" },
];

export const LeadTableView: React.FC<LeadTableViewProps> = ({
  leads,
  qualifyingId,
  onStatusChange,
  onQualify,
  onConvert,
  onEdit,
  onDelete,
  onAskCopilot,
}) => {
  const [sortField, setSortField] = useState<SortField>("updated_at");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  const toggleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDir((prev) => (prev === "asc" ? "desc" : "asc"));
    } else {
      setSortField(field);
      setSortDir(field === "score" || field === "updated_at" ? "desc" : "asc");
    }
  };

  const sortedLeads = useMemo(() => {
    const copy = [...leads];
    copy.sort((a, b) => {
      let cmp = 0;
      if (sortField === "score") {
        cmp = (a.score ?? -1) - (b.score ?? -1);
      } else if (sortField === "updated_at") {
        cmp = a.updated_at.localeCompare(b.updated_at);
      } else {
        cmp = String(a[sortField] || "").localeCompare(String(b[sortField] || ""), "es");
      }
      return sortDir === "asc" ? cmp : -cmp;
    });
    return copy;
  }, [leads, sortField, sortDir]);

  const SortIcon: React.FC<{ field: SortField }> = ({ field }) => {
    if (sortField !== field) return <ArrowUpDown className="h-3 w-3 text-neutral-400" />;
    return sortDir === "asc" ? (
      <ArrowUp className="h-3 w-3 text-[#0d5fea]" />
    ) : (
      <ArrowDown className="h-3 w-3 text-[#0d5fea]" />
    );
  };

  const normalizedStatusForSelect = (raw: string) => {
    const lower = (raw || "new").trim().toLowerCase();
    if (lower === "qualified") return "replied";
    if (lower === "converted") return "Converted";
    if (lower === "disqualified" || lower === "lost") return "unqualified";
    return lower;
  };

  return (
    <div className="overflow-x-auto rounded-xl border border-[#e7e7e9] bg-white">
      <table className="w-full text-left text-xs">
        <thead className="border-b border-[#e7e7e9] bg-[#f7f7f8] text-neutral-600">
          <tr>
            <th className="px-4 py-3 font-semibold">
              <button
                type="button"
                onClick={() => toggleSort("full_name")}
                className="inline-flex items-center gap-1 hover:text-[#121212]"
              >
                Nombre <SortIcon field="full_name" />
              </button>
            </th>
            <th className="px-4 py-3 font-semibold">
              <button
                type="button"
                onClick={() => toggleSort("company_name")}
                className="inline-flex items-center gap-1 hover:text-[#121212]"
              >
                Empresa <SortIcon field="company_name" />
              </button>
            </th>
            <th className="px-4 py-3 font-semibold">Contacto</th>
            <th className="px-4 py-3 font-semibold">Origen</th>
            <th className="px-4 py-3 font-semibold">
              <button
                type="button"
                onClick={() => toggleSort("status")}
                className="inline-flex items-center gap-1 hover:text-[#121212]"
              >
                Estado <SortIcon field="status" />
              </button>
            </th>
            <th className="px-4 py-3 font-semibold">
              <button
                type="button"
                onClick={() => toggleSort("score")}
                className="inline-flex items-center gap-1 hover:text-[#121212]"
              >
                Score <SortIcon field="score" />
              </button>
            </th>
            <th className="px-4 py-3 font-semibold">
              <button
                type="button"
                onClick={() => toggleSort("updated_at")}
                className="inline-flex items-center gap-1 hover:text-[#121212]"
              >
                Actualizado <SortIcon field="updated_at" />
              </button>
            </th>
            <th className="px-4 py-3 text-right font-semibold">Acciones</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-[#e7e7e9]">
          {sortedLeads.length === 0 ? (
            <tr>
              <td colSpan={8} className="px-4 py-10 text-center text-neutral-500">
                No hay leads que coincidan con el filtro actual.
              </td>
            </tr>
          ) : (
            sortedLeads.map((lead) => {
              const isConverted = (lead.status || "").trim().toLowerCase() === "converted";
              const isQualifying = qualifyingId === lead.id;

              return (
                <tr key={lead.id} className="hover:bg-[#f7f7f8]/70 transition">
                  <td className="px-4 py-3 font-semibold text-[#121212]">
                    <Link to={`/lead/${lead.id}`} className="hover:text-[#0d5fea] hover:underline">
                      {lead.full_name}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-neutral-700">{lead.company_name || "—"}</td>
                  <td className="px-4 py-3 text-neutral-600">
                    <div>{lead.email || "—"}</div>
                    {lead.phone && <div className="text-[11px] text-neutral-400">{lead.phone}</div>}
                  </td>
                  <td className="px-4 py-3 text-neutral-600">{lead.source || "—"}</td>
                  <td className="px-4 py-3">
                    <select
                      value={normalizedStatusForSelect(lead.status)}
                      disabled={isConverted}
                      onChange={(e) => {
                        const val = e.target.value;
                        if (val === "Converted") onConvert(lead);
                        else onStatusChange(lead, val);
                      }}
                      className="rounded-md border border-[#e7e7e9] bg-white px-2 py-1 text-[11px] font-medium text-[#121212] focus:border-[#0d5fea] focus:outline-none disabled:bg-[#f7f7f8] disabled:text-emerald-700"
                    >
                      {STATUS_SELECT_OPTIONS.map((opt) => (
                        <option key={opt.value} value={opt.value}>
                          {opt.label}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="px-4 py-3">
                    <ScorePill score={lead.score} />
                  </td>
                  <td className="px-4 py-3 text-[11px] text-neutral-500">
                    {formatDateTimeEs(lead.updated_at)}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="inline-flex items-center gap-1">
                      <button
                        type="button"
                        disabled={isQualifying}
                        onClick={() => onQualify(lead)}
                        title="Cualificar con IA (BYOK)"
                        className="inline-flex items-center gap-1 rounded-md border border-[#0d5fea]/30 bg-[#0d5fea]/5 px-2 py-1 text-[11px] font-medium text-[#0d5fea] hover:bg-[#0d5fea]/10 disabled:opacity-50"
                      >
                        <Sparkles className={`h-3 w-3 ${isQualifying ? "animate-spin" : ""}`} />
                        IA
                      </button>

                      {!isConverted && (
                        <button
                          type="button"
                          onClick={() => onConvert(lead)}
                          title="Convertir a Organización + Cliente + Oportunidad"
                          className="inline-flex items-center gap-1 rounded-md border border-emerald-200 bg-emerald-50 px-2 py-1 text-[11px] font-medium text-emerald-700 hover:bg-emerald-100"
                        >
                          <ArrowRightCircle className="h-3 w-3" />
                          Convertir
                        </button>
                      )}

                      <button
                        type="button"
                        onClick={() => onAskCopilot(lead)}
                        title="Preguntar al Copiloto IA sobre este lead"
                        className="rounded-md border border-[#e7e7e9] px-2 py-1 text-[11px] font-medium text-neutral-600 hover:bg-[#f7f7f8] hover:text-[#0d5fea]"
                      >
                        Copiloto
                      </button>

                      <button
                        type="button"
                        onClick={() => onEdit(lead)}
                        title="Editar"
                        className="rounded-md border border-[#e7e7e9] p-1 text-neutral-600 hover:bg-[#f7f7f8]"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </button>

                      <button
                        type="button"
                        onClick={() => onDelete(lead)}
                        title="Eliminar"
                        className="rounded-md border border-rose-200 p-1 text-rose-600 hover:bg-rose-50"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })
          )}
        </tbody>
      </table>
    </div>
  );
};
