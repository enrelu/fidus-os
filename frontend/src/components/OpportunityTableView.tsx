import React, { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowDown, ArrowUp, ArrowUpDown, Pencil, Sparkles, Trash2 } from "lucide-react";
import type { Opportunity } from "../types/api";
import { formatEur } from "../utils/format";
import { ChipSelect, type ChipSelectOption } from "./ui";

type SortField = "title" | "organization_name" | "client_name" | "stage" | "amount_eur" | "expected_close_date";

interface OpportunityTableViewProps {
  opportunities: Opportunity[];
  onStageChange: (opp: Opportunity, nextStage: string) => void;
  onEdit: (opp: Opportunity) => void;
  onDelete: (opp: Opportunity) => void;
  onAskCopilot: (opp: Opportunity) => void;
}

export const OPPORTUNITY_STAGE_CHIPS: ChipSelectOption[] = [
  { value: "qualification", label: "Cualificación", pillClass: "border-sky-200 bg-sky-50 text-sky-700" },
  { value: "proposal", label: "Propuesta", pillClass: "border-indigo-200 bg-indigo-50 text-indigo-700" },
  { value: "negotiation", label: "Negociación", pillClass: "border-amber-200 bg-amber-50 text-amber-800" },
  { value: "closed_won", label: "Ganada", pillClass: "border-emerald-200 bg-emerald-50 text-emerald-700" },
  { value: "closed_lost", label: "Perdida", pillClass: "border-neutral-200 bg-neutral-100 text-neutral-600" },
];

function formatShortDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const dt = new Date(iso);
  if (Number.isNaN(dt.getTime())) return iso.slice(0, 10);
  return new Intl.DateTimeFormat("es-ES", { dateStyle: "short" }).format(dt);
}

export const OpportunityTableView: React.FC<OpportunityTableViewProps> = ({
  opportunities,
  onStageChange,
  onEdit,
  onDelete,
  onAskCopilot,
}) => {
  const [sortField, setSortField] = useState<SortField>("amount_eur");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  const toggleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDir((prev) => (prev === "asc" ? "desc" : "asc"));
    } else {
      setSortField(field);
      setSortDir(field === "amount_eur" ? "desc" : "asc");
    }
  };

  const sorted = useMemo(() => {
    const copy = [...opportunities];
    copy.sort((a, b) => {
      let cmp = 0;
      if (sortField === "amount_eur") {
        cmp = a.amount_eur - b.amount_eur;
      } else if (sortField === "expected_close_date") {
        cmp = String(a.expected_close_date || "9999").localeCompare(String(b.expected_close_date || "9999"));
      } else {
        cmp = String(a[sortField] || "").localeCompare(String(b[sortField] || ""), "es");
      }
      return sortDir === "asc" ? cmp : -cmp;
    });
    return copy;
  }, [opportunities, sortField, sortDir]);

  const totals = useMemo(() => {
    const sum = sorted.reduce((acc, op) => acc + op.amount_eur, 0);
    const weighted = sorted.reduce((acc, op) => acc + op.amount_eur * (op.probability / 100), 0);
    return { sum, weighted };
  }, [sorted]);

  const SortIcon: React.FC<{ field: SortField }> = ({ field }) => {
    if (sortField !== field) return <ArrowUpDown className="h-3 w-3 text-neutral-400" />;
    return sortDir === "asc" ? (
      <ArrowUp className="h-3 w-3 text-[#0d5fea]" />
    ) : (
      <ArrowDown className="h-3 w-3 text-[#0d5fea]" />
    );
  };

  return (
    <div className="overflow-x-auto rounded-xl border border-[#e7e7e9] bg-white">
      <table className="w-full text-left text-xs">
        <thead className="border-b border-[#e7e7e9] bg-[#f7f7f8] text-neutral-600">
          <tr>
            <th className="px-4 py-3 font-semibold">
              <button
                type="button"
                onClick={() => toggleSort("title")}
                className="inline-flex items-center gap-1 hover:text-[#121212]"
              >
                Oportunidad <SortIcon field="title" />
              </button>
            </th>
            <th className="px-4 py-3 font-semibold">
              <button
                type="button"
                onClick={() => toggleSort("organization_name")}
                className="inline-flex items-center gap-1 hover:text-[#121212]"
              >
                Cuenta <SortIcon field="organization_name" />
              </button>
            </th>
            <th className="px-4 py-3 font-semibold">
              <button
                type="button"
                onClick={() => toggleSort("client_name")}
                className="inline-flex items-center gap-1 hover:text-[#121212]"
              >
                Contacto <SortIcon field="client_name" />
              </button>
            </th>
            <th className="px-4 py-3 font-semibold">
              <button
                type="button"
                onClick={() => toggleSort("stage")}
                className="inline-flex items-center gap-1 hover:text-[#121212]"
              >
                Etapa <SortIcon field="stage" />
              </button>
            </th>
            <th className="px-4 py-3 font-semibold">
              <button
                type="button"
                onClick={() => toggleSort("amount_eur")}
                className="inline-flex items-center gap-1 hover:text-[#121212]"
              >
                Valor <SortIcon field="amount_eur" />
              </button>
            </th>
            <th className="px-4 py-3 font-semibold">
              <button
                type="button"
                onClick={() => toggleSort("expected_close_date")}
                className="inline-flex items-center gap-1 hover:text-[#121212]"
              >
                Cierre <SortIcon field="expected_close_date" />
              </button>
            </th>
            <th className="px-4 py-3 text-right font-semibold">Acciones</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-[#e7e7e9]">
          {sorted.length === 0 ? (
            <tr>
              <td colSpan={7} className="px-4 py-10 text-center text-neutral-500">
                No hay oportunidades que coincidan con el filtro actual.
              </td>
            </tr>
          ) : (
            sorted.map((op) => (
              <tr key={op.id} className="transition hover:bg-[#f7f7f8]/70">
                <td className="px-4 py-3">
                  <Link
                    to={`/opportunity/${op.id}`}
                    className="font-semibold text-[#121212] hover:text-[#0d5fea] hover:underline"
                  >
                    {op.title}
                  </Link>
                  <div className="mt-0.5 text-[10px] text-neutral-400">Probabilidad {op.probability}%</div>
                </td>
                <td className="px-4 py-3 text-neutral-700">
                  {op.organization_id ? (
                    <Link
                      to={`/organization/${op.organization_id}`}
                      className="hover:text-[#0d5fea] hover:underline"
                    >
                      {op.organization_name || `Org #${op.organization_id}`}
                    </Link>
                  ) : (
                    "—"
                  )}
                </td>
                <td className="px-4 py-3 text-neutral-700">
                  {op.client_id ? (
                    <Link
                      to={`/client/${op.client_id}`}
                      className="hover:text-[#0d5fea] hover:underline"
                    >
                      {op.client_name || `Cliente #${op.client_id}`}
                    </Link>
                  ) : (
                    "—"
                  )}
                </td>
                <td className="px-4 py-3">
                  <ChipSelect
                    ariaLabel={`Etapa de ${op.title}`}
                    value={op.stage || "qualification"}
                    options={OPPORTUNITY_STAGE_CHIPS}
                    onChange={(next) => onStageChange(op, next)}
                  />
                </td>
                <td className="px-4 py-3 font-mono font-semibold text-[#121212]">
                  {formatEur(op.amount_eur)}
                </td>
                <td className="px-4 py-3 text-[11px] text-neutral-500">
                  {formatShortDate(op.expected_close_date)}
                </td>
                <td className="px-4 py-3 text-right">
                  <div className="inline-flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => onAskCopilot(op)}
                      title="Preguntar al Copiloto IA"
                      className="inline-flex items-center gap-1 rounded-md border border-[#e7e7e9] px-2 py-1 text-[11px] font-medium text-neutral-600 hover:border-[#0d5fea]/40 hover:text-[#0d5fea]"
                    >
                      <Sparkles className="h-3 w-3" />
                      IA
                    </button>
                    <button
                      type="button"
                      onClick={() => onEdit(op)}
                      title="Editar"
                      className="rounded-md border border-[#e7e7e9] p-1 text-neutral-600 hover:bg-[#f7f7f8]"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => onDelete(op)}
                      title="Eliminar"
                      className="rounded-md border border-rose-200 p-1 text-rose-600 hover:bg-rose-50"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </td>
              </tr>
            ))
          )}
        </tbody>
        {sorted.length > 0 && (
          <tfoot className="border-t border-[#e7e7e9] bg-[#f7f7f8] text-xs font-semibold text-[#121212]">
            <tr>
              <td colSpan={4} className="px-4 py-2.5 text-neutral-600">
                Total ({sorted.length} oportunidades) · Ponderado: {formatEur(totals.weighted)}
              </td>
              <td colSpan={3} className="px-4 py-2.5 font-mono text-[#0d5fea]">
                {formatEur(totals.sum)}
              </td>
            </tr>
          </tfoot>
        )}
      </table>
    </div>
  );
};
