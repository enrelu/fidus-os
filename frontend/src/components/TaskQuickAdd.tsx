import React, { useEffect, useState } from "react";
import { Plus } from "lucide-react";
import { ApiError, crmApi } from "../api/client";
import type { Opportunity, Organization } from "../types/api";

interface TaskQuickAddProps {
  defaultDueDate?: string;
  organizations: Organization[];
  opportunities: Opportunity[];
  onCreated: (title: string) => void;
  onError: (msg: string) => void;
}

export const TaskQuickAdd: React.FC<TaskQuickAddProps> = ({
  defaultDueDate = "",
  organizations,
  opportunities,
  onCreated,
  onError,
}) => {
  const [title, setTitle] = useState("");
  const [priority, setPriority] = useState("medium");
  const [dueDate, setDueDate] = useState(defaultDueDate);
  const [linkKey, setLinkKey] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setDueDate(defaultDueDate);
  }, [defaultDueDate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    setSaving(true);
    try {
      let organization_id: number | null = null;
      let opportunity_id: number | null = null;
      if (linkKey.startsWith("org:")) {
        organization_id = Number(linkKey.slice(4));
      } else if (linkKey.startsWith("opp:")) {
        const oppId = Number(linkKey.slice(4));
        opportunity_id = oppId;
        const foundOpp = opportunities.find((o) => o.id === oppId);
        if (foundOpp?.organization_id) organization_id = foundOpp.organization_id;
      }

      const created = await crmApi.createTask({
        title: title.trim(),
        priority,
        status: "pending",
        due_date: dueDate ? `${dueDate}T18:00:00` : null,
        organization_id,
        opportunity_id,
      });
      setTitle("");
      setLinkKey("");
      window.dispatchEvent(new CustomEvent("fidus:crm-updated"));
      onCreated(created.title);
    } catch (err) {
      onError(err instanceof ApiError ? err.detail : "No se pudo añadir la tarea.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <form
      onSubmit={(e) => void handleSubmit(e)}
      className="flex flex-wrap items-center gap-2 rounded-xl border border-[#e7e7e9] bg-white p-3"
    >
      <input
        type="text"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="Añadir tarea rápida (ej. Llamar a dirección financiera)..."
        className="flex-1 min-w-[220px] rounded-lg border border-[#e7e7e9] bg-[#f7f7f8] px-3 py-1.5 text-xs text-[#121212] focus:border-[#0d5fea] focus:bg-white focus:outline-none"
      />
      <select
        value={priority}
        onChange={(e) => setPriority(e.target.value)}
        className="rounded-lg border border-[#e7e7e9] bg-white px-2.5 py-1.5 text-xs text-[#121212] focus:border-[#0d5fea] focus:outline-none"
      >
        <option value="urgent">Urgente</option>
        <option value="high">Alta</option>
        <option value="medium">Media</option>
        <option value="low">Baja</option>
      </select>
      <input
        type="date"
        value={dueDate}
        onChange={(e) => setDueDate(e.target.value)}
        className="rounded-lg border border-[#e7e7e9] bg-white px-2.5 py-1.5 text-xs text-[#121212] focus:border-[#0d5fea] focus:outline-none"
      />
      <select
        value={linkKey}
        onChange={(e) => setLinkKey(e.target.value)}
        className="max-w-[200px] rounded-lg border border-[#e7e7e9] bg-white px-2.5 py-1.5 text-xs text-[#121212] focus:border-[#0d5fea] focus:outline-none"
      >
        <option value="">Sin vincular</option>
        {opportunities.length > 0 && (
          <optgroup label="Oportunidades">
            {opportunities.map((op) => (
              <option key={`opp-${op.id}`} value={`opp:${op.id}`}>
                {op.title}
              </option>
            ))}
          </optgroup>
        )}
        {organizations.length > 0 && (
          <optgroup label="Organizaciones">
            {organizations.map((org) => (
              <option key={`org-${org.id}`} value={`org:${org.id}`}>
                {org.name}
              </option>
            ))}
          </optgroup>
        )}
      </select>
      <button
        type="submit"
        disabled={saving || !title.trim()}
        className="inline-flex items-center gap-1 rounded-lg bg-[#0d5fea] px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-[#0b52cc] disabled:opacity-50"
      >
        <Plus className="h-3.5 w-3.5" />
        Añadir
      </button>
    </form>
  );
};
