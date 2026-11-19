import React, { useEffect, useState } from "react";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { aiApi } from "./api/client";
import { Layout } from "./components/Layout";
import { AuthProvider, useAuth } from "./context/AuthContext";
import { AIConfigPage } from "./pages/AIConfigPage";
import { AuditPage } from "./pages/AuditPage";
import { CrmPage } from "./pages/CrmPage";
import { LoginPage } from "./pages/LoginPage";
import { RegisterPage } from "./pages/RegisterPage";
import { SupervisionPage } from "./pages/SupervisionPage";

const ProtectedRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 text-slate-600">
        <div className="flex items-center gap-2 text-sm font-medium">
          <Loader2 className="h-5 w-5 animate-spin text-indigo-600" />
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
      <div className="min-h-screen flex items-center justify-center bg-slate-50 text-slate-600">
        <div className="flex items-center gap-2 text-sm font-medium">
          <Loader2 className="h-5 w-5 animate-spin text-indigo-600" />
          Comprobando sesión...
        </div>
      </div>
    );
  }

  if (user) {
    return <Navigate to="/" replace />;
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
          // El badge se sincroniza igualmente al abrir Supervisión HITL
        });
    };

    refreshPending();
    window.addEventListener("fidus:crm-updated", refreshPending);

    return () => {
      active = false;
      window.removeEventListener("fidus:crm-updated", refreshPending);
    };
  }, [user]);

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

      <Route
        path="/"
        element={
          <ProtectedRoute>
            <Layout pendingCount={pendingCount}>
              <SupervisionPage onPendingCountChange={setPendingCount} />
            </Layout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/auditoria"
        element={
          <ProtectedRoute>
            <Layout pendingCount={pendingCount}>
              <AuditPage />
            </Layout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/configuracion-ia"
        element={
          <ProtectedRoute>
            <Layout pendingCount={pendingCount}>
              <AIConfigPage />
            </Layout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/crm"
        element={
          <ProtectedRoute>
            <Layout pendingCount={pendingCount}>
              <CrmPage />
            </Layout>
          </ProtectedRoute>
        }
      />
      <Route path="*" element={<Navigate to="/" replace />} />
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
