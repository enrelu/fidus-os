import React, { useEffect, useState } from "react";
import { NavLink } from "react-router-dom";
import {
  Activity,
  Bot,
  Briefcase,
  LogOut,
  MessageSquareText,
  ShieldCheck,
  Sliders,
  Sparkles,
} from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { CopilotDrawer } from "./CopilotDrawer";

interface LayoutProps {
  pendingCount: number;
  children: React.ReactNode;
}

export const Layout: React.FC<LayoutProps> = ({ pendingCount, children }) => {
  const { user, logout } = useAuth();
  const [copilotOpen, setCopilotOpen] = useState(false);

  useEffect(() => {
    const handleOpenCopilot = () => setCopilotOpen(true);
    window.addEventListener("fidus:open-copilot", handleOpenCopilot);
    return () => window.removeEventListener("fidus:open-copilot", handleOpenCopilot);
  }, []);

  const navItems = [
    {
      to: "/",
      label: "Supervisión HITL",
      icon: ShieldCheck,
      badge: pendingCount > 0 ? pendingCount : null,
    },
    {
      to: "/auditoria",
      label: "Auditoría de Actividad",
      icon: Activity,
      badge: null,
    },
    {
      to: "/configuracion-ia",
      label: "Configuración IA (BYOK + MCP)",
      icon: Sliders,
      badge: null,
    },
    {
      to: "/crm",
      label: "CRM Operativo",
      icon: Briefcase,
      badge: null,
    },
  ];

  return (
    <div className="min-h-screen flex flex-col md:flex-row bg-slate-50 text-slate-900">
      <aside className="w-full md:w-72 shrink-0 bg-slate-950 text-slate-100 flex flex-col justify-between border-b md:border-b-0 md:border-r border-slate-800">
        <div>
          <div className="px-5 py-5 border-b border-slate-800/80 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="h-9 w-9 rounded-lg bg-indigo-600 flex items-center justify-center text-white shadow-sm shadow-indigo-500/30">
                <Bot className="h-5 w-5" />
              </div>
              <div>
                <div className="text-sm font-bold tracking-tight text-white">FidusOS v2</div>
                <div className="text-[11px] text-slate-400">CRM Agent-First · España</div>
              </div>
            </div>
            <span className="rounded-full border border-indigo-500/30 bg-indigo-500/10 px-2 py-0.5 text-[10px] font-semibold text-indigo-300">
              HITL
            </span>
          </div>

          <nav className="p-3 space-y-1">
            {navItems.map((item) => {
              const Icon = item.icon;
              return (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={item.to === "/"}
                  className={({ isActive }) =>
                    `flex items-center justify-between rounded-lg px-3 py-2.5 text-sm font-medium transition ${
                      isActive
                        ? "bg-indigo-600 text-white shadow-sm"
                        : "text-slate-300 hover:bg-slate-900 hover:text-white"
                    }`
                  }
                >
                  <span className="flex items-center gap-2.5">
                    <Icon className="h-4 w-4 shrink-0" />
                    <span>{item.label}</span>
                  </span>
                  {item.badge !== null && (
                    <span className="ml-2 inline-flex min-w-5 items-center justify-center rounded-full bg-amber-400 px-1.5 py-0.5 text-[11px] font-bold text-slate-950">
                      {item.badge}
                    </span>
                  )}
                </NavLink>
              );
            })}

            <div className="pt-3">
              <button
                type="button"
                onClick={() => setCopilotOpen(true)}
                className="w-full flex items-center justify-between rounded-lg border border-indigo-500/40 bg-indigo-600/20 px-3 py-2.5 text-sm font-semibold text-indigo-100 transition hover:bg-indigo-600/35"
              >
                <span className="flex items-center gap-2.5">
                  <Sparkles className="h-4 w-4 text-indigo-300" />
                  <span>Copiloto CRM</span>
                </span>
                <span className="rounded bg-indigo-500/30 px-1.5 py-0.5 text-[10px] font-bold uppercase text-indigo-200">
                  BYOK
                </span>
              </button>
            </div>
          </nav>
        </div>

        <div className="border-t border-slate-800/80 p-4 space-y-3">
          {user && (
            <div className="rounded-lg bg-slate-900/90 px-3 py-2.5 text-xs">
              <div className="font-semibold text-white truncate">{user.full_name}</div>
              <div className="text-slate-400 truncate">{user.email}</div>
              <div className="mt-1 flex items-center justify-between text-[11px] text-slate-500">
                <span>Tenant #{user.tenant_id}</span>
                <span className="uppercase">{user.role}</span>
              </div>
            </div>
          )}

          <button
            type="button"
            onClick={logout}
            className="w-full flex items-center justify-center gap-2 rounded-lg border border-slate-800 bg-slate-900 px-3 py-2 text-xs font-medium text-slate-300 transition hover:border-slate-700 hover:bg-slate-800 hover:text-white"
          >
            <LogOut className="h-3.5 w-3.5" />
            Cerrar sesión
          </button>
        </div>
      </aside>

      <div className="flex-1 min-w-0 flex flex-col">
        <header className="sticky top-0 z-30 flex items-center justify-between border-b border-slate-200 bg-white/90 px-4 py-2.5 backdrop-blur-xs sm:px-8">
          <div className="text-xs font-medium text-slate-500">
            Espacio operativo multi-tenant · Control Human-in-the-Loop
          </div>
          <button
            type="button"
            onClick={() => setCopilotOpen(true)}
            className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white shadow-xs transition hover:bg-indigo-500"
          >
            <MessageSquareText className="h-3.5 w-3.5" />
            Copiloto CRM
          </button>
        </header>

        <main className="flex-1 min-w-0">
          <div className="mx-auto max-w-6xl px-4 py-6 sm:px-8">{children}</div>
        </main>
      </div>

      <CopilotDrawer isOpen={copilotOpen} onClose={() => setCopilotOpen(false)} />
    </div>
  );
};
