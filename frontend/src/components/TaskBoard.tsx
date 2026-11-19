import React from "react";
import { Link } from "react-router-dom";
import { Building2, Calendar, Pencil, Target, Trash2, User } from "lucide-react";
import type { Client, Opportunity, Organization, Task } from "../types/api";
import { ChipSelect, type ChipSelectOption } from "./ui";

interface TaskBoardProps {
  tasks: Task[];
  groupedByDay?: boolean;
  organizationsById: Record<number, Organization>;
  clientsById: Record<number, Client>;
  opportunitiesById: Record<number, Opportunity>;
  onToggleComplete: (task: Task) => void;
  onPriorityChange: (task: Task, priority: string) => void;
  onEdit: (task: Task) => void;
  onDelete: (task: Task) => void;
}

const PRIORITY_CHIPS: ChipSelectOption[] = [
  { value: "urgent", label: "Urgente", pillClass: "border-rose-200 bg-rose-50 text-rose-700" },
  { value: "high", label: "Alta", pillClass: "border-amber-200 bg-amber-50 text-amber-800" },
  { value: "medium", label: "Media", pillClass: "border-sky-200 bg-sky-50 text-sky-700" },
  { value: "low", label: "Baja", pillClass: "border-[#e7e7e9] bg-[#f7f7f8] text-neutral-600" },
];

function isOverdue(dueIso: string | null, status: string): boolean {
  if (!dueIso || status === "completed" || status === "cancelled") return false;
  const due = new Date(dueIso);
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  return due.getTime() < todayStart.getTime();
}

function formatDayLabel(dayKey: string): string {
  const dt = new Date(`${dayKey}T12:00:00`);
  if (Number.isNaN(dt.getTime())) return dayKey;
  return new Intl.DateTimeFormat("es-ES", {
    weekday: "long",
    day: "numeric",
    month: "short",
  }).format(dt);
}

export const TaskBoard: React.FC<TaskBoardProps> = ({
  tasks,
  groupedByDay = false,
  organizationsById,
  clientsById,
  opportunitiesById,
  onToggleComplete,
  onPriorityChange,
  onEdit,
  onDelete,
}) => {
  const renderTaskRow = (task: Task) => {
    const done = task.status === "completed";
    const overdue = isOverdue(task.due_date, task.status);
    const org = task.organization_id ? organizationsById[task.organization_id] : undefined;
    const cli = task.client_id ? clientsById[task.client_id] : undefined;
    const opp = task.opportunity_id ? opportunitiesById[task.opportunity_id] : undefined;

    return (
      <div
        key={task.id}
        className="flex flex-col gap-2 rounded-xl border border-[#e7e7e9] bg-white px-4 py-3 transition hover:border-neutral-300 sm:flex-row sm:items-center sm:justify-between"
      >
        <div className="flex items-start gap-3 min-w-0">
          <input
            type="checkbox"
            checked={done}
            onChange={() => onToggleComplete(task)}
            className="mt-0.5 h-4 w-4 shrink-0 rounded border-neutral-300 text-[#0d5fea] cursor-pointer"
          />
          <div className="min-w-0 space-y-1">
            <div
              className={`text-xs font-semibold ${
                done ? "line-through text-neutral-400" : "text-[#121212]"
              }`}
            >
              {task.title}
            </div>
            {task.description && (
              <div className="line-clamp-1 text-[11px] text-neutral-500">{task.description}</div>
            )}
            <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
              {opp && (
                <Link
                  to={`/opportunity/${opp.id}`}
                  className="inline-flex items-center gap-1 rounded border border-[#e7e7e9] bg-[#f7f7f8] px-1.5 py-0.5 text-neutral-700 hover:border-[#0d5fea]/40 hover:text-[#0d5fea]"
                >
                  <Target className="h-3 w-3 text-[#0d5fea]" />
                  {opp.title}
                </Link>
              )}
              {cli && (
                <Link
                  to={`/client/${cli.id}`}
                  className="inline-flex items-center gap-1 rounded border border-[#e7e7e9] bg-[#f7f7f8] px-1.5 py-0.5 text-neutral-700 hover:border-[#0d5fea]/40 hover:text-[#0d5fea]"
                >
                  <User className="h-3 w-3 text-neutral-500" />
                  {cli.full_name}
                </Link>
              )}
              {org && (
                <Link
                  to={`/organization/${org.id}`}
                  className="inline-flex items-center gap-1 rounded border border-[#e7e7e9] bg-[#f7f7f8] px-1.5 py-0.5 text-neutral-700 hover:border-[#0d5fea]/40 hover:text-[#0d5fea]"
                >
                  <Building2 className="h-3 w-3 text-neutral-500" />
                  {org.name}
                </Link>
              )}
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0 pl-7 sm:pl-0">
          {task.due_date && (
            <span
              className={`inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[11px] font-medium ${
                overdue
                  ? "border-rose-200 bg-rose-50 text-rose-700"
                  : "border-[#e7e7e9] bg-[#f7f7f8] text-neutral-600"
              }`}
            >
              <Calendar className="h-3 w-3" />
              {task.due_date.slice(0, 10)}
              {overdue ? " · Vencida" : ""}
            </span>
          )}

          <ChipSelect
            ariaLabel={`Prioridad de ${task.title}`}
            value={(task.priority || "medium").toLowerCase()}
            options={PRIORITY_CHIPS}
            onChange={(next) => onPriorityChange(task, next)}
          />

          <button
            type="button"
            onClick={() => onEdit(task)}
            title="Editar tarea"
            className="rounded-md border border-[#e7e7e9] p-1 text-neutral-600 hover:bg-[#f7f7f8]"
          >
            <Pencil className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={() => onDelete(task)}
            title="Eliminar tarea"
            className="rounded-md border border-rose-200 p-1 text-rose-600 hover:bg-rose-50"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    );
  };

  if (tasks.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-[#e7e7e9] bg-white p-10 text-center text-xs text-neutral-500">
        No hay tareas en esta vista.
      </div>
    );
  }

  if (!groupedByDay) {
    return <div className="space-y-2">{tasks.map(renderTaskRow)}</div>;
  }

  const groups: Record<string, Task[]> = {};
  for (const t of tasks) {
    const key = t.due_date ? t.due_date.slice(0, 10) : "Sin fecha";
    if (!groups[key]) groups[key] = [];
    groups[key].push(t);
  }
  const sortedKeys = Object.keys(groups).sort();

  return (
    <div className="space-y-5">
      {sortedKeys.map((day) => (
        <div key={day} className="space-y-2">
          <div className="flex items-center justify-between px-1">
            <h3 className="text-xs font-semibold capitalize text-neutral-600">
              {day === "Sin fecha" ? day : formatDayLabel(day)}
            </h3>
            <span className="text-[11px] text-neutral-400">{groups[day].length} tarea(s)</span>
          </div>
          <div className="space-y-2">{groups[day].map(renderTaskRow)}</div>
        </div>
      ))}
    </div>
  );
};
