import React, { useEffect, useState } from "react";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { aiApi } from "./api/client";
import { Layout } from "./components/Layout";
import { AuthProvider, useAuth } from "./context/AuthContext";
import { CrmPage } from "./pages/CrmPage";
import { DashboardPage } from "./pages/DashboardPage";
import { LeadsPage } from "./pages/LeadsPage";
import { LoginPage } from "./pages/LoginPage";
import { RegisterPage } from "./pages/RegisterPage";
import { SettingsPage } from "./pages/SettingsPage";
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
      <Route path="/opportunities" element={withShell(<CrmPage fixedTab="opportunities" />)} />
      <Route path="/clients" element={withShell(<CrmPage fixedTab="clients" />)} />
      <Route path="/organizations" element={withShell(<CrmPage fixedTab="organizations" />)} />
      <Route path="/tasks" element={withShell(<CrmPage fixedTab="tasks" />)} />
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
