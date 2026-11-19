import React, { useCallback, useEffect, useMemo, useState } from "react";
import { CheckCircle2, CheckSquare, Plus, Search, ShieldAlert } from "lucide-react";
import { ApiError, crmApi } from "../api/client";
import { TaskBoard } from "../components/TaskBoard";
import { TaskModal } from "../components/TaskModal";
import { TaskQuickAdd } from "../components/TaskQuickAdd";
import type { Client, Opportunity, Organization, Task } from "../types/api";

type TaskSubView = "today" | "inbox" | "upcoming" | "completed";
type EntityFilter = "all" | "unlinked" | "opportunity" | "client" | "organization";

function localTodayIso(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export const TasksPage: React.FC = () => {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [opportunities, setOpportunities] = useState<Opportunity[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [subView, setSubView] = useState<TaskSubView>("today");
  const [entityFilter, setEntityFilter] = useState<EntityFilter>("all");
  const [search, setSearch] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<Task | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [tks, orgs, clis, opps] = await Promise.all([
        crmApi.listTasks(),
        crmApi.listOrganizations(),
        crmApi.listClients(),
        crmApi.listOpportunities(),
      ]);
      setTasks(tks);
      setOrganizations(orgs);
      setClients(clis);
      setOpportunities(opps);
    } catch (err) {
      setError(err instanceof ApiError ? err.detail : "Error al cargar las tareas.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  useEffect(() => {
    const onUpdated = () => void loadData();
    window.addEventListener("fidus:crm-updated", onUpdated);
    return () => window.removeEventListener("fidus:crm-updated", onUpdated);
  }, [loadData]);

  const organizationsById = useMemo(
    () => Object.fromEntries(organizations.map((o) => [o.id, o])),
    [organizations]
  );
  const clientsById = useMemo(() => Object.fromEntries(clients.map((c) => [c.id, c])), [clients]);
  const opportunitiesById = useMemo(
    () => Object.fromEntries(opportunities.map((op) => [op.id, op])),
    [opportunities]
  );

  const todayKey = localTodayIso();

  const counts = useMemo(() => {
    let inbox = 0;
    let today = 0;
    let upcoming = 0;
    let completed = 0;
    for (const t of tasks) {
      if (t.status === "completed") {
        completed += 1;
        continue;
      }
      if (t.status === "cancelled") continue;
      if (!t.due_date) {
        inbox += 1;
      } else {
        const dKey = t.due_date.slice(0, 10);
        if (dKey <= todayKey) today += 1;
        else upcoming += 1;
      }
    }
    return { inbox, today, upcoming, completed };
  }, [tasks, todayKey]);

  const filteredTasks = useMemo(() => {
    const q = search.trim().toLowerCase();
    return tasks.filter((t) => {
      if (subView === "completed") {
        if (t.status !== "completed") return false;
      } else {
        if (t.status === "completed" || t.status === "cancelled") return false;
        if (subView === "inbox" && t.due_date) return false;
        if (subView === "today" && (!t.due_date || t.due_date.slice(0, 10) > todayKey)) return false;
        if (subView === "upcoming" && (!t.due_date || t.due_date.slice(0, 10) <= todayKey)) return false;
      }

      if (entityFilter === "unlinked" && (t.organization_id || t.client_id || t.opportunity_id)) {
        return false;
      }
      if (entityFilter === "opportunity" && !t.opportunity_id) return false;
      if (entityFilter === "client" && !t.client_id) return false;
      if (entityFilter === "organization" && !t.organization_id) return false;

      if (!q) return true;
      return (
        t.title.toLowerCase().includes(q) ||
        (t.description || "").toLowerCase().includes(q)
      );
    });
  }, [tasks, subView, entityFilter, search, todayKey]);

  const handleToggleComplete = async (task: Task) => {
    const nextStatus = task.status === "completed" ? "pending" : "completed";
    setError(null);
    setNotice(null);
    try {
      await crmApi.updateTask(task.id, { status: nextStatus });
      setNotice(
        nextStatus === "completed"
          ? `Tarea «${task.title}» completada.`
          : `Tarea «${task.title}» reabierta.`
      );
      window.dispatchEvent(new CustomEvent("fidus:crm-updated"));
      await loadData();
    } catch (err) {
      setError(err instanceof ApiError ? err.detail : "No se pudo actualizar la tarea.");
    }
  };

  const handlePriorityChange = async (task: Task, priority: string) => {
    setError(null);
    try {
      await crmApi.updateTask(task.id, { priority });
      window.dispatchEvent(new CustomEvent("fidus:crm-updated"));
      await loadData();
    } catch (err) {
      setError(err instanceof ApiError ? err.detail : "No se pudo actualizar la prioridad.");
    }
  };

  const handleDelete = async (task: Task) => {
    if (!window.confirm(`¿Eliminar la tarea «${task.title}»?`)) return;
    setError(null);
    setNotice(null);
    try {
      await crmApi.deleteTask(task.id);
      setNotice(`Tarea «${task.title}» eliminada.`);
      window.dispatchEvent(new CustomEvent("fidus:crm-updated"));
      await loadData();
    } catch (err) {
      setError(err instanceof ApiError ? err.detail : "No se pudo eliminar la tarea.");
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <CheckSquare className="h-5 w-5 text-[#0d5fea]" />
            <h1 className="text-xl font-semibold tracking-tight text-[#121212]">Tareas</h1>
          </div>
          <p className="mt-1 text-xs text-neutral-500">
            Organización estilo Bandeja / Hoy / Próximas con vínculo directo a cuentas y tratos.
          </p>
        </div>

        <button
          type="button"
          onClick={() => {
            setEditingTask(null);
            setModalOpen(true);
          }}
          className="inline-flex items-center gap-1.5 rounded-lg bg-[#0d5fea] px-3.5 py-2 text-xs font-semibold text-white transition hover:bg-[#0b52cc]"
        >
          <Plus className="h-3.5 w-3.5" />
          Nueva tarea
        </button>
      </div>

      {/* Quick Add */}
      <TaskQuickAdd
        defaultDueDate={subView === "today" ? todayKey : ""}
        organizations={organizations}
        opportunities={opportunities}
        onCreated={(title) => {
          setNotice(`Tarea «${title}» creada.`);
          void loadData();
        }}
        onError={(msg) => setError(msg)}
      />

      {/* Sub-vistas & filtros CRM */}
      <div className="flex flex-col gap-3 rounded-xl border border-[#e7e7e9] bg-white p-3.5 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-wrap items-center gap-1.5">
          {(
            [
              { id: "today", label: "Hoy", count: counts.today },
              { id: "inbox", label: "Bandeja", count: counts.inbox },
              { id: "upcoming", label: "Próximas", count: counts.upcoming },
              { id: "completed", label: "Completadas", count: counts.completed },
            ] as { id: TaskSubView; label: string; count: number }[]
          ).map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setSubView(tab.id)}
              className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition ${
                subView === tab.id
                  ? "bg-[#121212] text-white"
                  : "border border-[#e7e7e9] bg-white text-neutral-600 hover:bg-[#f7f7f8]"
              }`}
            >
              <span>{tab.label}</span>
              <span
                className={`rounded-full px-1.5 py-0.2 text-[10px] font-semibold ${
                  subView === tab.id ? "bg-white/20 text-white" : "bg-[#f7f7f8] text-neutral-500"
                }`}
              >
                {tab.count}
              </span>
            </button>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-2 h-3.5 w-3.5 text-neutral-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Filtrar tareas..."
              className="w-48 rounded-lg border border-[#e7e7e9] bg-[#f7f7f8] py-1.5 pl-8 pr-3 text-xs text-[#121212] focus:border-[#0d5fea] focus:bg-white focus:outline-none"
            />
          </div>

          <select
            value={entityFilter}
            onChange={(e) => setEntityFilter(e.target.value as EntityFilter)}
            className="rounded-lg border border-[#e7e7e9] bg-white px-2.5 py-1.5 text-xs text-[#121212] focus:border-[#0d5fea] focus:outline-none"
          >
            <option value="all">Todas las vinculaciones</option>
            <option value="opportunity">Solo Oportunidades</option>
            <option value="client">Solo Clientes</option>
            <option value="organization">Solo Organizaciones</option>
            <option value="unlinked">Sin vincular</option>
          </select>
        </div>
      </div>

      {error && (
        <div className="flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-xs text-rose-800">
          <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {notice && (
        <div className="flex items-start gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-xs text-emerald-800">
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{notice}</span>
        </div>
      )}

      {loading ? (
        <div className="rounded-xl border border-[#e7e7e9] bg-white p-10 text-center text-xs text-neutral-500">
          Cargando tareas...
        </div>
      ) : (
        <TaskBoard
          tasks={filteredTasks}
          groupedByDay={subView === "upcoming"}
          organizationsById={organizationsById}
          clientsById={clientsById}
          opportunitiesById={opportunitiesById}
          onToggleComplete={(t) => void handleToggleComplete(t)}
          onPriorityChange={(t, p) => void handlePriorityChange(t, p)}
          onEdit={(t) => {
            setEditingTask(t);
            setModalOpen(true);
          }}
          onDelete={(t) => void handleDelete(t)}
        />
      )}

      <TaskModal
        open={modalOpen}
        task={editingTask}
        organizations={organizations}
        clients={clients}
        opportunities={opportunities}
        onClose={() => setModalOpen(false)}
        onSaved={(saved, isEdit) => {
          setNotice(isEdit ? `Tarea «${saved.title}» actualizada.` : `Tarea «${saved.title}» creada.`);
          void loadData();
        }}
      />
    </div>
  );
};
