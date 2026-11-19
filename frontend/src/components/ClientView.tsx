import React, { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowDown, ArrowUp, ArrowUpDown, Pencil, Sparkles, Trash2 } from "lucide-react";
import type { Client, ClientPotential } from "../types/api";
import { formatEur } from "../utils/format";
import { ChipSelect, type ChipSelectOption, ScorePill } from "./ui";

type SortField = "score" | "full_name" | "organization_name" | "open_pipeline_eur" | "potential";

interface ClientViewProps {
  clients: Client[];
  onPotentialChange: (client: Client, nextPotential: ClientPotential) => void;
  onEdit: (client: Client) => void;
  onDelete: (client: Client) => void;
  onAskCopilot: (client: Client) => void;
}

export const POTENTIAL_CHIPS: ChipSelectOption[] = [
  { value: "high", label: "Alto", pillClass: "border-emerald-200 bg-emerald-50 text-emerald-700" },
  { value: "medium", label: "Medio", pillClass: "border-amber-200 bg-amber-50 text-amber-800" },
  { value: "low", label: "Bajo", pillClass: "border-neutral-200 bg-neutral-100 text-neutral-600" },
];

export const ClientView: React.FC<ClientViewProps> = ({
  clients,
  onPotentialChange,
  onEdit,
  onDelete,
  onAskCopilot,
}) => {
  const [sortField, setSortField] = useState<SortField>("score");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  const toggleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDir((prev) => (prev === "asc" ? "desc" : "asc"));
    } else {
      setSortField(field);
      setSortDir(field === "score" || field === "open_pipeline_eur" ? "desc" : "asc");
    }
  };

  const sorted = useMemo(() => {
    const copy = [...clients];
    const potRank: Record<string, number> = { high: 3, medium: 2, low: 1 };
    copy.sort((a, b) => {
      let cmp = 0;
      if (sortField === "score") {
        cmp = (a.score ?? 0) - (b.score ?? 0);
      } else if (sortField === "open_pipeline_eur") {
        cmp = (a.open_pipeline_eur ?? 0) - (b.open_pipeline_eur ?? 0);
      } else if (sortField === "potential") {
        cmp = (potRank[a.potential || "medium"] || 0) - (potRank[b.potential || "medium"] || 0);
      } else {
        cmp = String(a[sortField] || "").localeCompare(String(b[sortField] || ""), "es");
      }
      return sortDir === "asc" ? cmp : -cmp;
    });
    return copy;
  }, [clients, sortField, sortDir]);

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
                onClick={() => toggleSort("score")}
                className="inline-flex items-center gap-1 hover:text-[#121212]"
              >
                Score <SortIcon field="score" />
              </button>
            </th>
            <th className="px-4 py-3 font-semibold">
              <button
                type="button"
                onClick={() => toggleSort("full_name")}
                className="inline-flex items-center gap-1 hover:text-[#121212]"
              >
                Contacto <SortIcon field="full_name" />
              </button>
            </th>
            <th className="px-4 py-3 font-semibold">
              <button
                type="button"
                onClick={() => toggleSort("organization_name")}
                className="inline-flex items-center gap-1 hover:text-[#121212]"
              >
                Organización <SortIcon field="organization_name" />
              </button>
            </th>
            <th className="px-4 py-3 font-semibold">Email / Teléfono</th>
            <th className="px-4 py-3 font-semibold">
              <button
                type="button"
                onClick={() => toggleSort("open_pipeline_eur")}
                className="inline-flex items-center gap-1 hover:text-[#121212]"
              >
                Pipeline <SortIcon field="open_pipeline_eur" />
              </button>
            </th>
            <th className="px-4 py-3 font-semibold">
              <button
                type="button"
                onClick={() => toggleSort("potential")}
                className="inline-flex items-center gap-1 hover:text-[#121212]"
              >
                Potencial <SortIcon field="potential" />
              </button>
            </th>
            <th className="px-4 py-3 font-semibold">RGPD</th>
            <th className="px-4 py-3 text-right font-semibold">Acciones</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-[#e7e7e9]">
          {sorted.length === 0 ? (
            <tr>
              <td colSpan={8} className="px-4 py-10 text-center text-neutral-500">
                No hay clientes que coincidan con el filtro actual.
              </td>
            </tr>
          ) : (
            sorted.map((cli) => (
              <tr key={cli.id} className="transition hover:bg-[#f7f7f8]/70">
                <td className="px-4 py-3">
                  <ScorePill score={cli.score} />
                </td>
                <td className="px-4 py-3">
                  <Link
                    to={`/client/${cli.id}`}
                    className="font-semibold text-[#121212] hover:text-[#0d5fea] hover:underline"
                  >
                    {cli.full_name}
                  </Link>
                  {cli.job_title && (
                    <div className="mt-0.5 text-[11px] text-neutral-400">{cli.job_title}</div>
                  )}
                </td>
                <td className="px-4 py-3 text-neutral-700">
                  {cli.organization_id ? (
                    <Link
                      to={`/organization/${cli.organization_id}`}
                      className="hover:text-[#0d5fea] hover:underline"
                    >
                      {cli.organization_name || `Org #${cli.organization_id}`}
                    </Link>
                  ) : (
                    "—"
                  )}
                </td>
                <td className="px-4 py-3 text-neutral-600">
                  <div>{cli.email || "—"}</div>
                  {cli.phone && <div className="text-[11px] text-neutral-400">{cli.phone}</div>}
                </td>
                <td className="px-4 py-3">
                  <span className="font-mono font-semibold text-[#121212]">
                    {formatEur(cli.open_pipeline_eur ?? 0)}
                  </span>
                  <div className="text-[10px] text-neutral-400">
                    {cli.open_opportunities_count ?? 0} abierta(s)
                  </div>
                </td>
                <td className="px-4 py-3">
                  <ChipSelect
                    ariaLabel={`Potencial de ${cli.full_name}`}
                    value={cli.potential || "medium"}
                    options={POTENTIAL_CHIPS}
                    onChange={(next) => onPotentialChange(cli, next as ClientPotential)}
                  />
                </td>
                <td className="px-4 py-3">
                  {cli.rgpd_consent ? (
                    <span className="inline-flex items-center rounded-md border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-700">
                      Consentido
                    </span>
                  ) : (
                    <span className="inline-flex items-center rounded-md border border-amber-200 bg-amber-50 px-2 py-0.5 text-[10px] font-semibold text-amber-800">
                      Pendiente
                    </span>
                  )}
                </td>
                <td className="px-4 py-3 text-right">
                  <div className="inline-flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => onAskCopilot(cli)}
                      title="Preguntar al Copiloto IA"
                      className="inline-flex items-center gap-1 rounded-md border border-[#e7e7e9] px-2 py-1 text-[11px] font-medium text-neutral-600 hover:border-[#0d5fea]/40 hover:text-[#0d5fea]"
                    >
                      <Sparkles className="h-3 w-3" />
                      IA
                    </button>
                    <button
                      type="button"
                      onClick={() => onEdit(cli)}
                      title="Editar"
                      className="rounded-md border border-[#e7e7e9] p-1 text-neutral-600 hover:bg-[#f7f7f8]"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => onDelete(cli)}
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
      </table>
    </div>
  );
};
