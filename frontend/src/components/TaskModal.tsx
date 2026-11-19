import React, { useEffect, useState } from "react";
import { ApiError, crmApi } from "../api/client";
import type { Client, Opportunity, Organization, Task, TaskPayload } from "../types/api";
import { Modal } from "./ui";

interface TaskModalProps {
  open: boolean;
  task: Task | null;
  organizations: Organization[];
  clients: Client[];
  opportunities: Opportunity[];
  onClose: () => void;
  onSaved: (task: Task, isEdit: boolean) => void;
}

function toDateInputValue(iso: string | null | undefined): string {
  if (!iso) return "";
  return iso.slice(0, 10);
}

export const TaskModal: React.FC<TaskModalProps> = ({
  open,
  task,
  organizations,
  clients,
  opportunities,
  onClose,
  onSaved,
}) => {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [status, setStatus] = useState("pending");
  const [priority, setPriority] = useState("medium");
  const [dueDate, setDueDate] = useState("");
  const [organizationId, setOrganizationId] = useState("");
  const [clientId, setClientId] = useState("");
  const [opportunityId, setOpportunityId] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setError(null);
    if (task) {
      setTitle(task.title);
      setDescription(task.description || "");
      setStatus(task.status || "pending");
      setPriority(task.priority || "medium");
      setDueDate(toDateInputValue(task.due_date));
      setOrganizationId(task.organization_id ? String(task.organization_id) : "");
      setClientId(task.client_id ? String(task.client_id) : "");
      setOpportunityId(task.opportunity_id ? String(task.opportunity_id) : "");
    } else {
      setTitle("");
      setDescription("");
      setStatus("pending");
      setPriority("medium");
      setDueDate("");
      setOrganizationId("");
      setClientId("");
      setOpportunityId("");
    }
  }, [open, task]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    setSaving(true);
    setError(null);
    try {
      const payload: TaskPayload = {
        title: title.trim(),
        description: description.trim() || undefined,
        status,
        priority,
        due_date: dueDate ? `${dueDate}T18:00:00` : null,
        organization_id: organizationId ? Number(organizationId) : null,
        client_id: clientId ? Number(clientId) : null,
        opportunity_id: opportunityId ? Number(opportunityId) : null,
      };
      const saved = task
        ? await crmApi.updateTask(task.id, payload)
        : await crmApi.createTask(payload);
      window.dispatchEvent(new CustomEvent("fidus:crm-updated"));
      onSaved(saved, Boolean(task));
      onClose();
    } catch (err) {
      setError(err instanceof ApiError ? err.detail : "No se pudo guardar la tarea.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={task ? "Editar tarea" : "Nueva tarea"}
      subtitle="Seguimiento operativo vinculado a organización, contacto u oportunidad"
    >
      <form onSubmit={(e) => void handleSubmit(e)} className="space-y-4">
        {error && (
          <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">
            {error}
          </div>
        )}

        <div>
          <label className="block text-xs font-medium text-neutral-700">Título *</label>
          <input
            type="text"
            required
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Ej. Enviar propuesta revisada"
            className="mt-1 w-full rounded-lg border border-[#e7e7e9] px-3 py-2 text-sm text-[#121212] focus:border-[#0d5fea] focus:outline-none"
          />
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div>
            <label className="block text-xs font-medium text-neutral-700">Estado</label>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              className="mt-1 w-full rounded-lg border border-[#e7e7e9] bg-white px-3 py-2 text-sm text-[#121212] focus:border-[#0d5fea] focus:outline-none"
            >
              <option value="pending">Pendiente</option>
              <option value="in_progress">En curso</option>
              <option value="completed">Completada</option>
              <option value="cancelled">Cancelada</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-neutral-700">Prioridad</label>
            <select
              value={priority}
              onChange={(e) => setPriority(e.target.value)}
              className="mt-1 w-full rounded-lg border border-[#e7e7e9] bg-white px-3 py-2 text-sm text-[#121212] focus:border-[#0d5fea] focus:outline-none"
            >
              <option value="urgent">Urgente</option>
              <option value="high">Alta</option>
              <option value="medium">Media</option>
              <option value="low">Baja</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-neutral-700">Vencimiento</label>
            <input
              type="date"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
              className="mt-1 w-full rounded-lg border border-[#e7e7e9] px-3 py-2 text-sm text-[#121212] focus:border-[#0d5fea] focus:outline-none"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div>
            <label className="block text-xs font-medium text-neutral-700">Organización</label>
            <select
              value={organizationId}
              onChange={(e) => setOrganizationId(e.target.value)}
              className="mt-1 w-full rounded-lg border border-[#e7e7e9] bg-white px-2.5 py-2 text-xs text-[#121212] focus:border-[#0d5fea] focus:outline-none"
            >
              <option value="">Sin vincular</option>
              {organizations.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-neutral-700">Cliente</label>
            <select
              value={clientId}
              onChange={(e) => setClientId(e.target.value)}
              className="mt-1 w-full rounded-lg border border-[#e7e7e9] bg-white px-2.5 py-2 text-xs text-[#121212] focus:border-[#0d5fea] focus:outline-none"
            >
              <option value="">Sin vincular</option>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.full_name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-neutral-700">Oportunidad</label>
            <select
              value={opportunityId}
              onChange={(e) => setOpportunityId(e.target.value)}
              className="mt-1 w-full rounded-lg border border-[#e7e7e9] bg-white px-2.5 py-2 text-xs text-[#121212] focus:border-[#0d5fea] focus:outline-none"
            >
              <option value="">Sin vincular</option>
              {opportunities.map((op) => (
                <option key={op.id} value={op.id}>
                  {op.title}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div>
          <label className="block text-xs font-medium text-neutral-700">Descripción</label>
          <textarea
            rows={3}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
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
            {saving ? "Guardando..." : task ? "Guardar cambios" : "Crear tarea"}
          </button>
        </div>
      </form>
    </Modal>
  );
};
