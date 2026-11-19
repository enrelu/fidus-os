import React, { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  ExternalLink,
  Pencil,
  Sparkles,
  Trash2,
} from "lucide-react";
import type { Organization } from "../types/api";
import { formatEur } from "../utils/format";

type SortField = "name" | "cif" | "open_pipeline_eur" | "contacts_count" | "open_tasks_count";

interface OrganizationViewProps {
  organizations: Organization[];
  onEdit: (org: Organization) => void;
  onDelete: (org: Organization) => void;
  onAskCopilot: (org: Organization) => void;
}

function normalizeUrl(raw: string): string {
  if (/^https?:\/\//i.test(raw)) return raw;
  return `https://${raw}`;
}

export const OrganizationView: React.FC<OrganizationViewProps> = ({
  organizations,
  onEdit,
  onDelete,
  onAskCopilot,
}) => {
  const [sortField, setSortField] = useState<SortField>("open_pipeline_eur");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [openPopoverOrgId, setOpenPopoverOrgId] = useState<number | null>(null);

  const toggleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDir((prev) => (prev === "asc" ? "desc" : "asc"));
    } else {
      setSortField(field);
      setSortDir(field === "name" || field === "cif" ? "asc" : "desc");
    }
  };

  const sorted = useMemo(() => {
    const copy = [...organizations];
    copy.sort((a, b) => {
      let cmp = 0;
      if (sortField === "open_pipeline_eur") {
        cmp = (a.open_pipeline_eur ?? 0) - (b.open_pipeline_eur ?? 0);
      } else if (sortField === "contacts_count") {
        cmp = (a.contacts_count ?? 0) - (b.contacts_count ?? 0);
      } else if (sortField === "open_tasks_count") {
        cmp = (a.open_tasks_count ?? 0) - (b.open_tasks_count ?? 0);
      } else {
        cmp = String(a[sortField] || "").localeCompare(String(b[sortField] || ""), "es");
      }
      return sortDir === "asc" ? cmp : -cmp;
    });
    return copy;
  }, [organizations, sortField, sortDir]);

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
                onClick={() => toggleSort("name")}
                className="inline-flex items-center gap-1 hover:text-[#121212]"
              >
                Organización <SortIcon field="name" />
              </button>
            </th>
            <th className="px-4 py-3 font-semibold">
              <button
                type="button"
                onClick={() => toggleSort("cif")}
                className="inline-flex items-center gap-1 hover:text-[#121212]"
              >
                CIF / Razón Social <SortIcon field="cif" />
              </button>
            </th>
            <th className="px-4 py-3 font-semibold">Web / Contacto</th>
            <th className="px-4 py-3 font-semibold">
              <button
                type="button"
                onClick={() => toggleSort("contacts_count")}
                className="inline-flex items-center gap-1 hover:text-[#121212]"
              >
                Contactos <SortIcon field="contacts_count" />
              </button>
            </th>
            <th className="px-4 py-3 font-semibold">
              <button
                type="button"
                onClick={() => toggleSort("open_pipeline_eur")}
                className="inline-flex items-center gap-1 hover:text-[#121212]"
              >
                Pipeline abierto <SortIcon field="open_pipeline_eur" />
              </button>
            </th>
            <th className="px-4 py-3 font-semibold">
              <button
                type="button"
                onClick={() => toggleSort("open_tasks_count")}
                className="inline-flex items-center gap-1 hover:text-[#121212]"
              >
                Tareas <SortIcon field="open_tasks_count" />
              </button>
            </th>
            <th className="px-4 py-3 text-right font-semibold">Acciones</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-[#e7e7e9]">
          {sorted.length === 0 ? (
            <tr>
              <td colSpan={7} className="px-4 py-10 text-center text-neutral-500">
                No hay organizaciones registradas con este filtro.
              </td>
            </tr>
          ) : (
            sorted.map((org) => {
              const preview = org.contacts_preview || [];
              const totalContacts = org.contacts_count ?? preview.length;
              const extraCount = Math.max(0, totalContacts - 2);
              const popoverOpen = openPopoverOrgId === org.id;

              return (
                <tr key={org.id} className="transition hover:bg-[#f7f7f8]/70">
                  <td className="px-4 py-3">
                    <Link
                      to={`/organization/${org.id}`}
                      className="font-semibold text-[#121212] hover:text-[#0d5fea] hover:underline"
                    >
                      {org.name}
                    </Link>
                    {org.direccion_fiscal && (
                      <div className="mt-0.5 max-w-xs truncate text-[11px] text-neutral-400">
                        {org.direccion_fiscal}
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap items-center gap-1.5">
                      {org.cif && (
                        <span className="rounded border border-[#e7e7e9] bg-[#f7f7f8] px-1.5 py-0.5 font-mono text-[10px] font-semibold text-neutral-700">
                          {org.cif}
                        </span>
                      )}
                      {org.sector && (
                        <span className="rounded border border-sky-200 bg-sky-50 px-1.5 py-0.5 text-[10px] font-medium text-sky-700">
                          {org.sector}
                        </span>
                      )}
                    </div>
                    <div className="mt-0.5 text-[11px] text-neutral-600">
                      {org.razon_social || (!org.cif ? "—" : "")}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-neutral-600">
                    {org.website && (
                      <a
                        href={normalizeUrl(org.website)}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 text-[#0d5fea] hover:underline"
                      >
                        {org.website.replace(/^https?:\/\//i, "")}
                        <ExternalLink className="h-3 w-3" />
                      </a>
                    )}
                    <div className="text-[11px] text-neutral-500">
                      {org.email || org.phone || (!org.website ? "—" : "")}
                    </div>
                  </td>
                  <td className="px-4 py-3 relative">
                    {totalContacts === 0 ? (
                      <span className="text-neutral-400">Sin contactos</span>
                    ) : (
                      <div className="flex flex-wrap items-center gap-1">
                        {preview.slice(0, 2).map((c) => (
                          <Link
                            key={c.id}
                            to={`/client/${c.id}`}
                            className="rounded-md border border-[#e7e7e9] bg-[#f7f7f8] px-2 py-0.5 text-[11px] font-medium text-[#121212] hover:border-[#0d5fea]/40 hover:text-[#0d5fea]"
                          >
                            {c.full_name}
                          </Link>
                        ))}
                        {extraCount > 0 && (
                          <button
                            type="button"
                            onClick={() =>
                              setOpenPopoverOrgId((prev) => (prev === org.id ? null : org.id))
                            }
                            className="rounded-md border border-[#0d5fea]/30 bg-[#0d5fea]/5 px-1.5 py-0.5 text-[10px] font-semibold text-[#0d5fea] hover:bg-[#0d5fea]/10"
                          >
                            +{extraCount}
                          </button>
                        )}
                      </div>
                    )}
                    {popoverOpen && preview.length > 0 && (
                      <div className="absolute left-4 top-11 z-20 w-56 rounded-lg border border-[#e7e7e9] bg-white p-2 shadow-lg">
                        <div className="mb-1 flex items-center justify-between px-1 text-[10px] font-semibold uppercase text-neutral-400">
                          <span>Contactos ({totalContacts})</span>
                          <button
                            type="button"
                            onClick={() => setOpenPopoverOrgId(null)}
                            className="text-neutral-500 hover:text-[#121212]"
                          >
                            Cerrar
                          </button>
                        </div>
                        <div className="space-y-1">
                          {preview.map((c) => (
                            <Link
                              key={c.id}
                              to={`/client/${c.id}`}
                              onClick={() => setOpenPopoverOrgId(null)}
                              className="block rounded-md px-2 py-1 text-[11px] hover:bg-[#f7f7f8]"
                            >
                              <div className="font-medium text-[#121212]">{c.full_name}</div>
                              {c.job_title && (
                                <div className="text-[10px] text-neutral-400">{c.job_title}</div>
                              )}
                            </Link>
                          ))}
                        </div>
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <span className="font-mono font-semibold text-[#121212]">
                      {formatEur(org.open_pipeline_eur ?? 0)}
                    </span>
                    <div className="text-[10px] text-neutral-400">
                      {org.open_opportunities_count ?? 0} abierta(s)
                    </div>
                  </td>
                  <td className="px-4 py-3 text-neutral-600">
                    {org.open_tasks_count ?? 0} abierta(s)
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="inline-flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => onAskCopilot(org)}
                        title="Preguntar al Copiloto IA"
                        className="inline-flex items-center gap-1 rounded-md border border-[#e7e7e9] px-2 py-1 text-[11px] font-medium text-neutral-600 hover:border-[#0d5fea]/40 hover:text-[#0d5fea]"
                      >
                        <Sparkles className="h-3 w-3" />
                        IA
                      </button>
                      <button
                        type="button"
                        onClick={() => onEdit(org)}
                        title="Editar"
                        className="rounded-md border border-[#e7e7e9] p-1 text-neutral-600 hover:bg-[#f7f7f8]"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => onDelete(org)}
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
