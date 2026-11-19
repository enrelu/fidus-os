import React, { useMemo, useState } from "react";
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
import { ArrowRightCircle, Pencil, Sparkles } from "lucide-react";
import type { Lead } from "../types/api";
import { ScorePill } from "./ui";

interface LeadKanbanBoardProps {
  leads: Lead[];
  qualifyingId: number | null;
  onMoveStatus: (lead: Lead, targetStatus: string) => void;
  onQualify: (lead: Lead) => void;
  onConvert: (lead: Lead) => void;
  onEdit: (lead: Lead) => void;
  onAskCopilot: (lead: Lead) => void;
}

const COLUMNS: { id: string; label: string; dotClass: string }[] = [
  { id: "new", label: "Novedades", dotClass: "bg-sky-500" },
  { id: "contacted", label: "Contactados", dotClass: "bg-indigo-500" },
  { id: "replied", label: "Respondidos", dotClass: "bg-violet-500" },
  { id: "Converted", label: "Convertidos", dotClass: "bg-emerald-500" },
  { id: "unqualified", label: "No cualificados", dotClass: "bg-neutral-400" },
];

function mapLeadToColumn(status: string): string {
  const s = (status || "new").trim().toLowerCase();
  if (s === "contacted") return "contacted";
  if (s === "replied" || s === "qualified") return "replied";
  if (s === "converted") return "Converted";
  if (s === "unqualified" || s === "disqualified" || s === "lost") return "unqualified";
  return "new";
}

const KanbanCardContent: React.FC<{
  lead: Lead;
  qualifyingId: number | null;
  onQualify: (lead: Lead) => void;
  onConvert: (lead: Lead) => void;
  onEdit: (lead: Lead) => void;
  onAskCopilot: (lead: Lead) => void;
}> = ({ lead, qualifyingId, onQualify, onConvert, onEdit, onAskCopilot }) => {
  const isConverted = mapLeadToColumn(lead.status) === "Converted";
  const isQualifying = qualifyingId === lead.id;

  return (
    <div className="space-y-2">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="truncate text-xs font-semibold text-[#121212]">{lead.full_name}</div>
          <div className="truncate text-[11px] text-neutral-500">
            {lead.company_name || lead.email || "Sin empresa"}
          </div>
        </div>
        <ScorePill score={lead.score} />
      </div>

      {lead.source && (
        <div className="text-[10px] text-neutral-400">Origen: {lead.source}</div>
      )}

      <div className="flex flex-wrap items-center gap-1 pt-1 border-t border-[#e7e7e9]">
        <button
          type="button"
          disabled={isQualifying}
          onClick={() => onQualify(lead)}
          className="inline-flex items-center gap-1 rounded border border-[#0d5fea]/25 bg-[#0d5fea]/5 px-1.5 py-0.5 text-[10px] font-medium text-[#0d5fea] hover:bg-[#0d5fea]/10 disabled:opacity-50"
        >
          <Sparkles className={`h-2.5 w-2.5 ${isQualifying ? "animate-spin" : ""}`} />
          IA
        </button>
        {!isConverted && (
          <button
            type="button"
            onClick={() => onConvert(lead)}
            className="inline-flex items-center gap-1 rounded border border-emerald-200 bg-emerald-50 px-1.5 py-0.5 text-[10px] font-medium text-emerald-700 hover:bg-emerald-100"
          >
            <ArrowRightCircle className="h-2.5 w-2.5" />
            Convertir
          </button>
        )}
        <button
          type="button"
          onClick={() => onAskCopilot(lead)}
          className="rounded border border-[#e7e7e9] px-1.5 py-0.5 text-[10px] font-medium text-neutral-600 hover:text-[#0d5fea]"
        >
          Copiloto
        </button>
        <button
          type="button"
          onClick={() => onEdit(lead)}
          className="ml-auto rounded p-1 text-neutral-400 hover:bg-[#f7f7f8] hover:text-[#121212]"
          title="Editar lead"
        >
          <Pencil className="h-3 w-3" />
        </button>
      </div>
    </div>
  );
};

const DraggableLeadCard: React.FC<{
  lead: Lead;
  qualifyingId: number | null;
  onQualify: (lead: Lead) => void;
  onConvert: (lead: Lead) => void;
  onEdit: (lead: Lead) => void;
  onAskCopilot: (lead: Lead) => void;
}> = (props) => {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: `lead-${props.lead.id}`,
    data: { lead: props.lead },
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
      <KanbanCardContent {...props} />
    </div>
  );
};

const DroppableColumn: React.FC<{
  colId: string;
  label: string;
  dotClass: string;
  leads: Lead[];
  qualifyingId: number | null;
  onQualify: (lead: Lead) => void;
  onConvert: (lead: Lead) => void;
  onEdit: (lead: Lead) => void;
  onAskCopilot: (lead: Lead) => void;
}> = ({ colId, label, dotClass, leads, ...cardActions }) => {
  const { isOver, setNodeRef } = useDroppable({ id: colId });

  return (
    <div
      ref={setNodeRef}
      className={`flex flex-col rounded-xl border p-3 min-h-[340px] transition ${
        isOver
          ? "border-[#0d5fea] bg-[#0d5fea]/5"
          : "border-[#e7e7e9] bg-[#f7f7f8]/80"
      }`}
    >
      <div className="mb-3 flex items-center justify-between px-1">
        <div className="flex items-center gap-2">
          <span className={`h-2 w-2 rounded-full ${dotClass}`} />
          <span className="text-xs font-semibold text-[#121212]">{label}</span>
        </div>
        <span className="rounded-full border border-[#e7e7e9] bg-white px-2 py-0.5 text-[10px] font-semibold text-neutral-600">
          {leads.length}
        </span>
      </div>

      <div className="flex-1 space-y-2">
        {leads.length === 0 ? (
          <div className="rounded-lg border border-dashed border-[#e7e7e9] py-8 text-center text-[11px] text-neutral-400">
            Arrastra un lead aquí
          </div>
        ) : (
          leads.map((lead) => <DraggableLeadCard key={lead.id} lead={lead} {...cardActions} />)
        )}
      </div>
    </div>
  );
};

export const LeadKanbanBoard: React.FC<LeadKanbanBoardProps> = ({
  leads,
  qualifyingId,
  onMoveStatus,
  onQualify,
  onConvert,
  onEdit,
  onAskCopilot,
}) => {
  const [activeLead, setActiveLead] = useState<Lead | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 6 },
    })
  );

  const grouped = useMemo(() => {
    const map: Record<string, Lead[]> = {
      new: [],
      contacted: [],
      replied: [],
      Converted: [],
      unqualified: [],
    };
    for (const lead of leads) {
      const col = mapLeadToColumn(lead.status);
      map[col].push(lead);
    }
    return map;
  }, [leads]);

  const handleDragStart = (event: DragStartEvent) => {
    const lead = event.active.data.current?.lead as Lead | undefined;
    setActiveLead(lead || null);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    setActiveLead(null);
    const { active, over } = event;
    if (!over) return;
    const lead = active.data.current?.lead as Lead | undefined;
    if (!lead) return;
    const targetCol = String(over.id);
    const currentCol = mapLeadToColumn(lead.status);
    if (targetCol === currentCol) return;
    if (targetCol === "Converted") {
      onConvert(lead);
      return;
    }
    if (currentCol === "Converted") return;
    onMoveStatus(lead, targetCol);
  };

  return (
    <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-3 xl:grid-cols-5">
        {COLUMNS.map((col) => (
          <DroppableColumn
            key={col.id}
            colId={col.id}
            label={col.label}
            dotClass={col.dotClass}
            leads={grouped[col.id] || []}
            qualifyingId={qualifyingId}
            onQualify={onQualify}
            onConvert={onConvert}
            onEdit={onEdit}
            onAskCopilot={onAskCopilot}
          />
        ))}
      </div>

      <DragOverlay>
        {activeLead ? (
          <div className="w-60 rounded-lg border border-[#0d5fea] bg-white p-3 shadow-xl">
            <KanbanCardContent
              lead={activeLead}
              qualifyingId={qualifyingId}
              onQualify={onQualify}
              onConvert={onConvert}
              onEdit={onEdit}
              onAskCopilot={onAskCopilot}
            />
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
};
