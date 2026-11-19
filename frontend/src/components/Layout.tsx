import React, { useEffect, useMemo, useState } from "react";
import { NavLink, useLocation } from "react-router-dom";
import {
  BarChart3,
  Building2,
  CheckSquare,
  ChevronLeft,
  ChevronRight,
  LogOut,
  Menu,
  Settings,
  Sparkles,
  Sun,
  Target,
  UserPlus,
  Users,
  X,
} from "lucide-react";
import { useAuth } from "../context/AuthContext";
import type { CopilotContext } from "../types/api";
import { CopilotDrawer, type CopilotOpenDetail } from "./CopilotDrawer";
import { HeaderInbox } from "./HeaderInbox";

interface LayoutProps {
  pendingCount: number;
  children: React.ReactNode;
}

const ROUTE_META: {
  path: string;
  title: string;
  subtitle: string;
  viewKey: string;
}[] = [
  {
    path: "/today",
    title: "Hoy",
    subtitle: "Prioridades comerciales ordenadas por impacto",
    viewKey: "today",
  },
  {
    path: "/",
    title: "Hoy",
    subtitle: "Prioridades comerciales ordenadas por impacto",
    viewKey: "today",
  },
  {
    path: "/dashboard",
    title: "Panel de Control",
    subtitle: "KPIs, embudo de leads, pipeline en EUR y previsión",
    viewKey: "dashboard",
  },
  {
    path: "/leads",
    title: "Leads",
    subtitle: "Prospección, cualificación BYOK y conversión a CRM",
    viewKey: "leads",
  },
  {
    path: "/opportunities",
    title: "Oportunidades",
    subtitle: "Pipeline comercial en EUR y probabilidad de cierre",
    viewKey: "opportunities",
  },
  {
    path: "/clients",
    title: "Clientes",
    subtitle: "Contactos activos y trazabilidad RGPD / LOPDGDD",
    viewKey: "clients",
  },
  {
    path: "/organizations",
    title: "Organizaciones",
    subtitle: "Empresas españolas, CIF, razón social y dirección fiscal",
    viewKey: "organizations",
  },
  {
    path: "/tasks",
    title: "Tareas",
    subtitle: "Seguimientos, vencimientos y prioridades operativas",
    viewKey: "tasks",
  },
  {
    path: "/settings",
    title: "Ajustes",
    subtitle: "IA (BYOK), Radar Comercial, MCP, Supervisión HITL y Auditoría",
    viewKey: "settings",
  },
];

export const Layout: React.FC<LayoutProps> = ({ pendingCount, children }) => {
  const { user, logout } = useAuth();
  const location = useLocation();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [copilotOpen, setCopilotOpen] = useState(false);
  const [copilotContext, setCopilotContext] = useState<CopilotContext | null>(null);
  const [copilotOrgId, setCopilotOrgId] = useState<number | null>(null);
  const [copilotPrompt, setCopilotPrompt] = useState<string | null>(null);

  const activeMeta = useMemo(() => {
    const found = ROUTE_META.find((r) =>
      r.path === "/" ? location.pathname === "/" : location.pathname.startsWith(r.path)
    );
    return (
      found || {
        path: location.pathname,
        title: "FidusOS v2",
        subtitle: "CRM Agent-First · España",
        viewKey: "crm",
      }
    );
  }, [location.pathname]);

  useEffect(() => {
    setMobileOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    const handleOpenCopilot = (ev: Event) => {
      const custom = ev as CustomEvent<CopilotOpenDetail | undefined>;
      const detail = custom.detail;
      if (detail?.context) {
        setCopilotContext(detail.context);
      } else {
        setCopilotContext({ view: activeMeta.viewKey });
      }
      if (detail?.organizationId !== undefined) {
        setCopilotOrgId(detail.organizationId ?? null);
      }
      if (detail?.prompt) {
        setCopilotPrompt(detail.prompt);
      }
      setCopilotOpen(true);
    };
    window.addEventListener("fidus:open-copilot", handleOpenCopilot);
    return () => window.removeEventListener("fidus:open-copilot", handleOpenCopilot);
  }, [activeMeta.viewKey]);

  const openCopilotForView = () => {
    setCopilotContext((prev) => prev || { view: activeMeta.viewKey });
    setCopilotOpen(true);
  };

  const navItems = [
    { to: "/today", label: "Hoy", icon: Sun },
    { to: "/dashboard", label: "Panel", icon: BarChart3 },
    { to: "/leads", label: "Leads", icon: UserPlus },
    { to: "/opportunities", label: "Oportunidades", icon: Target },
    { to: "/clients", label: "Clientes", icon: Users },
    { to: "/organizations", label: "Organizaciones", icon: Building2 },
    { to: "/tasks", label: "Tareas", icon: CheckSquare },
  ];

  return (
    <div className="min-h-screen flex bg-[#f7f7f8] text-[#121212]">
      {/* Mobile backdrop */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/25 lg:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* Sidebar estilo Notion */}
      <aside
        className={`fixed inset-y-0 left-0 z-40 flex flex-col justify-between border-r border-[#e7e7e9] bg-white transition-all duration-200 lg:static ${
          collapsed ? "w-[70px]" : "w-60"
        } ${mobileOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"}`}
      >
        <div>
          <div className="flex h-14 items-center justify-between border-b border-[#e7e7e9] px-3.5">
            {!collapsed && (
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-[#121212] text-xs font-bold text-white">
                  F
                </div>
                <div className="min-w-0">
                  <div className="truncate text-sm font-semibold tracking-tight text-[#121212]">
                    FidusOS
                  </div>
                  <div className="truncate text-[10px] text-neutral-500">CRM · España</div>
                </div>
              </div>
            )}

            {collapsed && (
              <div className="mx-auto flex h-7 w-7 items-center justify-center rounded-lg bg-[#121212] text-xs font-bold text-white">
                F
              </div>
            )}

            <button
              type="button"
              onClick={() => setCollapsed((c) => !c)}
              title={collapsed ? "Expandir menú" : "Colapsar menú"}
              className="hidden lg:inline-flex rounded-md p-1 text-neutral-400 transition hover:bg-[#f7f7f8] hover:text-[#121212]"
            >
              {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
            </button>

            <button
              type="button"
              onClick={() => setMobileOpen(false)}
              className="lg:hidden rounded-md p-1 text-neutral-400 hover:bg-[#f7f7f8]"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <nav className="p-2.5 space-y-0.5">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isTodayDefault = item.to === "/today" && location.pathname === "/";
              return (
                <NavLink
                  key={item.to}
                  to={item.to}
                  title={collapsed ? item.label : undefined}
                  className={({ isActive }) => {
                    const active = isActive || isTodayDefault;
                    return `flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13px] font-medium transition ${
                      active
                        ? "bg-[#f7f7f8] text-[#121212] font-semibold"
                        : "text-neutral-600 hover:bg-[#f7f7f8] hover:text-[#121212]"
                    } ${collapsed ? "justify-center" : ""}`;
                  }}
                >
                  {({ isActive }) => {
                    const active = isActive || isTodayDefault;
                    return (
                      <>
                        <Icon
                          className={`h-4 w-4 shrink-0 ${
                            active ? "text-[#0d5fea]" : "text-neutral-500"
                          }`}
                        />
                        {!collapsed && <span className="truncate">{item.label}</span>}
                      </>
                    );
                  }}
                </NavLink>
              );
            })}
          </nav>
        </div>

        {/* Footer: Ajustes + Usuario */}
        <div className="border-t border-[#e7e7e9] p-2.5 space-y-2">
          <NavLink
            to="/settings"
            title={collapsed ? "Ajustes" : undefined}
            className={({ isActive }) =>
              `flex items-center justify-between rounded-lg px-2.5 py-2 text-[13px] font-medium transition ${
                isActive
                  ? "bg-[#f7f7f8] text-[#121212] font-semibold"
                  : "text-neutral-600 hover:bg-[#f7f7f8] hover:text-[#121212]"
              } ${collapsed ? "justify-center" : ""}`
            }
          >
            <span className="flex items-center gap-2.5">
              <Settings className="h-4 w-4 shrink-0 text-neutral-500" />
              {!collapsed && <span>Ajustes</span>}
            </span>
            {!collapsed && pendingCount > 0 && (
              <span className="inline-flex min-w-[18px] items-center justify-center rounded-full bg-[#0d5fea] px-1.5 py-0.5 text-[10px] font-semibold text-white">
                {pendingCount}
              </span>
            )}
          </NavLink>

          {user && !collapsed && (
            <div className="rounded-lg border border-[#e7e7e9] bg-[#f7f7f8] px-2.5 py-2 text-[11px]">
              <div className="truncate font-semibold text-[#121212]">{user.full_name}</div>
              <div className="truncate text-neutral-500">{user.email}</div>
            </div>
          )}

          <button
            type="button"
            onClick={logout}
            title={collapsed ? "Cerrar sesión" : undefined}
            className={`w-full flex items-center gap-2 rounded-lg px-2.5 py-2 text-xs font-medium text-neutral-600 transition hover:bg-[#f7f7f8] hover:text-[#121212] ${
              collapsed ? "justify-center" : ""
            }`}
          >
            <LogOut className="h-3.5 w-3.5 shrink-0" />
            {!collapsed && <span>Cerrar sesión</span>}
          </button>
        </div>
      </aside>

      {/* Main shell */}
      <div className="flex-1 min-w-0 flex flex-col">
        <header className="sticky top-0 z-30 flex h-14 items-center justify-between gap-3 border-b border-[#e7e7e9] bg-white/95 px-4 backdrop-blur-xs sm:px-6">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={() => setMobileOpen(true)}
              className="lg:hidden rounded-lg border border-[#e7e7e9] p-1.5 text-neutral-600 hover:bg-[#f7f7f8]"
            >
              <Menu className="h-4 w-4" />
            </button>
            <div className="min-w-0">
              <div className="truncate text-sm font-semibold text-[#121212]">{activeMeta.title}</div>
              <div className="hidden sm:block truncate text-[11px] text-neutral-500">
                {activeMeta.subtitle}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <HeaderInbox pendingCount={pendingCount} />

            <button
              type="button"
              onClick={openCopilotForView}
              className="inline-flex items-center gap-1.5 rounded-lg bg-[#0d5fea] px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-[#0b52cc]"
            >
              <Sparkles className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Copiloto IA</span>
            </button>
          </div>
        </header>

        <main className="flex-1 min-w-0">
          <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6">{children}</div>
        </main>
      </div>

      {/* Botón flotante estilo Notion AI */}
      {!copilotOpen && (
        <button
          type="button"
          onClick={openCopilotForView}
          title="Abrir Copiloto IA"
          className="fixed bottom-5 right-5 z-30 flex h-11 w-11 items-center justify-center rounded-full border border-[#e7e7e9] bg-white text-[#0d5fea] shadow-lg transition hover:scale-105 hover:border-[#0d5fea]/40 hover:bg-[#f7f7f8]"
        >
          <Sparkles className="h-5 w-5" />
        </button>
      )}

      <CopilotDrawer
        isOpen={copilotOpen}
        onClose={() => setCopilotOpen(false)}
        context={copilotContext}
        onClearContext={() => setCopilotContext(null)}
        initialOrganizationId={copilotOrgId}
        initialPrompt={copilotPrompt}
        onConsumeInitialPrompt={() => setCopilotPrompt(null)}
      />
    </div>
  );
};
