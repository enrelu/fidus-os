import React, { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { Pencil, Sparkles } from "lucide-react";
import type { Opportunity } from "../types/api";
import { formatEur } from "../utils/format";

interface OpportunityKanbanProps {
  opportunities: Opportunity[];
  onMoveStage: (opp: Opportunity, targetStage: string) => void;
  onEdit: (opp: Opportunity) => void;
  onAskCopilot: (opp: Opportunity) => void;
}

const COLUMNS: { id: string; label: string; dotClass: string }[] = [
  { id: "qualification", label: "Cualificación", dotClass: "bg-sky-500" },
  { id: "proposal", label: "Propuesta", dotClass: "bg-indigo-500" },
  { id: "negotiation", label: "Negociación", dotClass: "bg-amber-500" },
  { id: "closed_won", label: "Ganada", dotClass: "bg-emerald-500" },
  { id: "closed_lost", label: "Perdida", dotClass: "bg-neutral-400" },
];

function normalizeStage(stage: string): string {
  const s = (stage || "qualification").trim().toLowerCase();
  if (COLUMNS.some((c) => c.id === s)) return s;
  return "qualification";
}

const OppCardContent: React.FC<{
  opp: Opportunity;
  onEdit: (opp: Opportunity) => void;
  onAskCopilot: (opp: Opportunity) => void;
}> = ({ opp, onEdit, onAskCopilot }) => (
  <div className="space-y-2">
    <div className="flex items-start justify-between gap-2">
      <div className="min-w-0">
        <Link
          to={`/opportunity/${opp.id}`}
          onClick={(e) => e.stopPropagation()}
          className="block truncate text-xs font-semibold text-[#121212] hover:text-[#0d5fea] hover:underline"
        >
          {opp.title}
        </Link>
        <div className="truncate text-[11px] text-neutral-500">
          {opp.organization_name || "Sin cuenta"}
          {opp.client_name ? ` · ${opp.client_name}` : ""}
        </div>
      </div>
    </div>

    <div className="flex items-center justify-between text-[11px]">
      <span className="font-mono font-semibold text-[#121212]">{formatEur(opp.amount_eur)}</span>
      <span className="rounded border border-[#e7e7e9] bg-[#f7f7f8] px-1.5 py-0.5 text-[10px] font-medium text-neutral-600">
        {opp.probability}%
      </span>
    </div>

    <div className="flex items-center gap-1 border-t border-[#e7e7e9] pt-1.5">
      <button
        type="button"
        onClick={() => onAskCopilot(opp)}
        className="inline-flex items-center gap-1 rounded border border-[#e7e7e9] px-1.5 py-0.5 text-[10px] font-medium text-neutral-600 hover:border-[#0d5fea]/40 hover:text-[#0d5fea]"
      >
        <Sparkles className="h-2.5 w-2.5" />
        Copiloto
      </button>
      <button
        type="button"
        onClick={() => onEdit(opp)}
        title="Editar oportunidad"
        className="ml-auto rounded p-1 text-neutral-400 hover:bg-[#f7f7f8] hover:text-[#121212]"
      >
        <Pencil className="h-3 w-3" />
      </button>
    </div>
  </div>
);

const DraggableOppCard: React.FC<{
  opp: Opportunity;
  onEdit: (opp: Opportunity) => void;
  onAskCopilot: (opp: Opportunity) => void;
}> = ({ opp, onEdit, onAskCopilot }) => {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: `opp-${opp.id}`,
    data: { opp },
  });

  const style = transform
    ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)` }
    : undefined;

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...listeners}
      {...attributes}
      className={`cursor-grab active:cursor-grabbing rounded-lg border border-[#e7e7e9] bg-white p-3 shadow-2xs transition hover:border-neutral-300 ${
        isDragging ? "opacity-40" : ""
      }`}
    >
      <OppCardContent opp={opp} onEdit={onEdit} onAskCopilot={onAskCopilot} />
    </div>
  );
};

const DroppableStageColumn: React.FC<{
  colId: string;
  label: string;
  dotClass: string;
  items: Opportunity[];
  onEdit: (opp: Opportunity) => void;
  onAskCopilot: (opp: Opportunity) => void;
}> = ({ colId, label, dotClass, items, onEdit, onAskCopilot }) => {
  const { isOver, setNodeRef } = useDroppable({ id: colId });
  const totalEur = items.reduce((acc, o) => acc + o.amount_eur, 0);

  return (
    <div
      ref={setNodeRef}
      className={`flex flex-col rounded-xl border p-3 min-h-[340px] transition ${
        isOver ? "border-[#0d5fea] bg-[#0d5fea]/5" : "border-[#e7e7e9] bg-[#f7f7f8]/80"
      }`}
    >
      <div className="mb-3 space-y-1 px-1">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className={`h-2 w-2 rounded-full ${dotClass}`} />
            <span className="text-xs font-semibold text-[#121212]">{label}</span>
          </div>
          <span className="rounded-full border border-[#e7e7e9] bg-white px-2 py-0.5 text-[10px] font-semibold text-neutral-600">
            {items.length}
          </span>
        </div>
        <div className="font-mono text-[11px] font-semibold text-neutral-500">
          {formatEur(totalEur)}
        </div>
      </div>

      <div className="flex-1 space-y-2">
        {items.length === 0 ? (
          <div className="rounded-lg border border-dashed border-[#e7e7e9] py-8 text-center text-[11px] text-neutral-400">
            Arrastra aquí
          </div>
        ) : (
          items.map((op) => (
            <DraggableOppCard key={op.id} opp={op} onEdit={onEdit} onAskCopilot={onAskCopilot} />
          ))
        )}
      </div>
    </div>
  );
};

export const OpportunityKanban: React.FC<OpportunityKanbanProps> = ({
  opportunities,
  onMoveStage,
  onEdit,
  onAskCopilot,
}) => {
  const [activeOpp, setActiveOpp] = useState<Opportunity | null>(null);
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 6 },
    })
  );

  const grouped = useMemo(() => {
    const map: Record<string, Opportunity[]> = {
      qualification: [],
      proposal: [],
      negotiation: [],
      closed_won: [],
      closed_lost: [],
    };
    for (const op of opportunities) {
      map[normalizeStage(op.stage)].push(op);
    }
    return map;
  }, [opportunities]);

  const handleDragStart = (event: DragStartEvent) => {
    const op = event.active.data.current?.opp as Opportunity | undefined;
    setActiveOpp(op || null);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    setActiveOpp(null);
    const { active, over } = event;
    if (!over) return;
    const op = active.data.current?.opp as Opportunity | undefined;
    if (!op) return;
    const targetStage = String(over.id);
    if (targetStage === normalizeStage(op.stage)) return;
    onMoveStage(op, targetStage);
  };

  return (
    <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-3 xl:grid-cols-5">
        {COLUMNS.map((col) => (
          <DroppableStageColumn
            key={col.id}
            colId={col.id}
            label={col.label}
            dotClass={col.dotClass}
            items={grouped[col.id] || []}
            onEdit={onEdit}
            onAskCopilot={onAskCopilot}
          />
        ))}
      </div>

      <DragOverlay>
        {activeOpp ? (
          <div className="w-60 rounded-lg border border-[#0d5fea] bg-white p-3 shadow-xl">
            <OppCardContent opp={activeOpp} onEdit={onEdit} onAskCopilot={onAskCopilot} />
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
};
