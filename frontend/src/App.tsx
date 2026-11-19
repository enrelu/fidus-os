import React, { useEffect, useState } from "react";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { aiApi } from "./api/client";
import { Layout } from "./components/Layout";
import { AuthProvider, useAuth } from "./context/AuthContext";
import { ClientsPage } from "./pages/ClientsPage";
import { DashboardPage } from "./pages/DashboardPage";
import { EntityDetailPage } from "./pages/EntityDetailPage";
import { FeedPage } from "./pages/FeedPage";
import { LeadsPage } from "./pages/LeadsPage";
import { LoginPage } from "./pages/LoginPage";
import { OpportunitiesPage } from "./pages/OpportunitiesPage";
import { OrganizationsPage } from "./pages/OrganizationsPage";
import { RegisterPage } from "./pages/RegisterPage";
import { SettingsPage } from "./pages/SettingsPage";
import { TasksPage } from "./pages/TasksPage";
import { TodayPage } from "./pages/TodayPage";

const ProtectedRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#f7f7f8] text-neutral-600">
        <div className="flex items-center gap-2 text-sm font-medium">
          <Loader2 className="h-5 w-5 animate-spin text-[#0d5fea]" />
          Cargando sesión de FidusOS v2...
        </div>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  return <>{children}</>;
};

const PublicOnlyRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#f7f7f8] text-neutral-600">
        <div className="flex items-center gap-2 text-sm font-medium">
          <Loader2 className="h-5 w-5 animate-spin text-[#0d5fea]" />
          Comprobando sesión...
        </div>
      </div>
    );
  }

  if (user) {
    return <Navigate to="/today" replace />;
  }

  return <>{children}</>;
};

const AppRoutes: React.FC = () => {
  const { user } = useAuth();
  const [pendingCount, setPendingCount] = useState(0);

  useEffect(() => {
    if (!user) {
      setPendingCount(0);
      return;
    }

    let active = true;
    const refreshPending = () => {
      aiApi
        .listAgentActions("pending_approval")
        .then((items) => {
          if (active) setPendingCount(items.length);
        })
        .catch(() => {
          // El badge se sincroniza igualmente al abrir Ajustes -> Supervisión HITL
        });
    };

    refreshPending();
    window.addEventListener("fidus:crm-updated", refreshPending);

    return () => {
      active = false;
      window.removeEventListener("fidus:crm-updated", refreshPending);
    };
  }, [user]);

  const withShell = (element: React.ReactNode) => (
    <ProtectedRoute>
      <Layout pendingCount={pendingCount}>{element}</Layout>
    </ProtectedRoute>
  );

  return (
    <Routes>
      <Route
        path="/login"
        element={
          <PublicOnlyRoute>
            <LoginPage />
          </PublicOnlyRoute>
        }
      />
      <Route
        path="/registro"
        element={
          <PublicOnlyRoute>
            <RegisterPage />
          </PublicOnlyRoute>
        }
      />

      <Route path="/" element={withShell(<TodayPage />)} />
      <Route path="/today" element={withShell(<TodayPage />)} />
      <Route path="/dashboard" element={withShell(<DashboardPage />)} />
      <Route path="/leads" element={withShell(<LeadsPage />)} />
      <Route path="/opportunities" element={withShell(<OpportunitiesPage />)} />
      <Route path="/clients" element={withShell(<ClientsPage />)} />
      <Route path="/organizations" element={withShell(<OrganizationsPage />)} />
      <Route path="/tasks" element={withShell(<TasksPage />)} />
      <Route path="/feed" element={withShell(<FeedPage />)} />

      <Route path="/lead/:id" element={withShell(<EntityDetailPage entityType="lead" />)} />
      <Route path="/client/:id" element={withShell(<EntityDetailPage entityType="client" />)} />
      <Route
        path="/organization/:id"
        element={withShell(<EntityDetailPage entityType="organization" />)}
      />
      <Route
        path="/opportunity/:id"
        element={withShell(<EntityDetailPage entityType="opportunity" />)}
      />

      <Route
        path="/settings"
        element={withShell(<SettingsPage onPendingCountChange={setPendingCount} />)}
      />

      <Route path="/crm" element={<Navigate to="/organizations" replace />} />
      <Route path="/auditoria" element={<Navigate to="/settings?tab=audit" replace />} />
      <Route path="/configuracion-ia" element={<Navigate to="/settings?tab=byok" replace />} />
      <Route path="*" element={<Navigate to="/today" replace />} />
    </Routes>
  );
};

export const App: React.FC = () => {
  return (
    <AuthProvider>
      <BrowserRouter>
        <AppRoutes />
      </BrowserRouter>
    </AuthProvider>
  );
};

export default App;
