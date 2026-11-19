import React, { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Building2,
  CheckSquare,
  Loader2,
  Search,
  Target,
  UserPlus,
  Users,
  X,
} from "lucide-react";
import { crmApi } from "../api/client";
import type { GlobalSearchGroup, GlobalSearchGroupType, GlobalSearchItem } from "../types/api";

const GROUP_ICONS: Record<GlobalSearchGroupType, React.FC<{ className?: string }>> = {
  organization: Building2,
  client: Users,
  lead: UserPlus,
  opportunity: Target,
  task: CheckSquare,
};

export const HeaderSearch: React.FC = () => {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [groups, setGroups] = useState<GlobalSearchGroup[]>([]);
  const [loading, setLoading] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const flatItems = useMemo(() => {
    const list: { groupType: GlobalSearchGroupType; item: GlobalSearchItem }[] = [];
    for (const g of groups) {
      for (const it of g.items) {
        list.push({ groupType: g.type, item: it });
      }
    }
    return list;
  }, [groups]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((prev) => !prev);
        return;
      }
      if (e.key === "/" && !open) {
        const target = e.target as HTMLElement | null;
        const tag = target?.tagName?.toLowerCase();
        const isEditable =
          tag === "input" ||
          tag === "textarea" ||
          tag === "select" ||
          target?.isContentEditable;
        if (!isEditable) {
          e.preventDefault();
          setOpen(true);
        }
      }
      if (e.key === "Escape" && open) {
        e.preventDefault();
        setOpen(false);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open]);

  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 20);
    } else {
      setQuery("");
      setGroups([]);
      setActiveIndex(0);
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const trimmed = query.trim();
    if (!trimmed) {
      setGroups([]);
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);
    const timer = window.setTimeout(() => {
      crmApi
        .search(trimmed, 6)
        .then((res) => {
          if (!cancelled) {
            setGroups(res.groups);
            setActiveIndex(0);
          }
        })
        .catch(() => {
          if (!cancelled) setGroups([]);
        })
        .finally(() => {
          if (!cancelled) setLoading(false);
        });
    }, 200);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [open, query]);

  const handleSelect = (href: string) => {
    setOpen(false);
    navigate(href);
  };

  const handleInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (flatItems.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((prev) => (prev + 1) % flatItems.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((prev) => (prev - 1 + flatItems.length) % flatItems.length);
    } else if (e.key === "Enter") {
      e.preventDefault();
      const target = flatItems[activeIndex];
      if (target) handleSelect(target.item.href);
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-2 rounded-lg border border-[#e7e7e9] bg-[#f7f7f8] px-2.5 py-1.5 text-xs text-neutral-600 transition hover:border-neutral-300 hover:bg-white hover:text-[#121212]"
        title="Buscar en todo el CRM (Ctrl+K o /)"
      >
        <Search className="h-3.5 w-3.5 text-neutral-400" />
        <span className="hidden md:inline">Buscar en CRM...</span>
        <kbd className="hidden lg:inline-flex items-center rounded border border-[#e7e7e9] bg-white px-1.5 py-0.5 font-mono text-[10px] text-neutral-400">
          Ctrl K
        </kbd>
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-start justify-center pt-[12vh] px-4">
          <div className="fixed inset-0 bg-black/30 backdrop-blur-[1px]" onClick={() => setOpen(false)} />
          <div className="relative z-10 w-full max-w-xl overflow-hidden rounded-xl border border-[#e7e7e9] bg-white shadow-2xl">
            <div className="flex items-center gap-2.5 border-b border-[#e7e7e9] px-4 py-3">
              {loading ? (
                <Loader2 className="h-4 w-4 shrink-0 animate-spin text-[#0d5fea]" />
              ) : (
                <Search className="h-4 w-4 shrink-0 text-neutral-400" />
              )}
              <input
                ref={inputRef}
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={handleInputKeyDown}
                placeholder="Buscar por empresa, CIF, cliente, lead, oportunidad o tarea..."
                className="w-full bg-transparent text-sm text-[#121212] placeholder:text-neutral-400 focus:outline-none"
              />
              {query && (
                <button
                  type="button"
                  onClick={() => setQuery("")}
                  className="rounded p-1 text-neutral-400 hover:bg-[#f7f7f8] hover:text-[#121212]"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>

            <div className="max-h-[55vh] overflow-y-auto p-2">
              {!query.trim() ? (
                <div className="px-3 py-6 text-center text-xs text-neutral-500">
                  Escribe para buscar en organizaciones (nombre, CIF, razón social), clientes, leads, oportunidades y tareas.
                </div>
              ) : !loading && flatItems.length === 0 ? (
                <div className="px-3 py-6 text-center text-xs text-neutral-500">
                  Sin resultados para «{query.trim()}».
                </div>
              ) : (
                <div className="space-y-3 py-1">
                  {groups.map((group) => {
                    const Icon = GROUP_ICONS[group.type] || Search;
                    return (
                      <div key={group.type}>
                        <div className="px-2.5 pb-1 text-[10px] font-semibold uppercase tracking-wider text-neutral-400">
                          {group.label}
                        </div>
                        <div className="space-y-0.5">
                          {group.items.map((item) => {
                            const idx = flatItems.findIndex(
                              (f) => f.groupType === group.type && f.item.id === item.id
                            );
                            const isActive = idx === activeIndex;
                            return (
                              <button
                                key={`${group.type}-${item.id}`}
                                type="button"
                                onMouseEnter={() => setActiveIndex(idx)}
                                onClick={() => handleSelect(item.href)}
                                className={`flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left transition ${
                                  isActive ? "bg-[#0d5fea]/8 text-[#121212]" : "hover:bg-[#f7f7f8]"
                                }`}
                              >
                                <Icon
                                  className={`h-4 w-4 shrink-0 ${
                                    isActive ? "text-[#0d5fea]" : "text-neutral-400"
                                  }`}
                                />
                                <div className="min-w-0 flex-1">
                                  <div className="truncate text-xs font-semibold text-[#121212]">
                                    {item.title}
                                  </div>
                                  <div className="truncate text-[11px] text-neutral-500">
                                    {item.subtitle}
                                  </div>
                                </div>
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="flex items-center justify-between border-t border-[#e7e7e9] bg-[#f7f7f8] px-3 py-2 text-[10px] text-neutral-500">
              <span>↑↓ navegar · Enter abrir</span>
              <span>ESC cerrar</span>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
