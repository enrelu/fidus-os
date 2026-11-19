import React, { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { AlertTriangle, Bot, Building2 } from "lucide-react";
import { ApiError } from "../api/client";
import { useAuth } from "../context/AuthContext";

export const RegisterPage: React.FC = () => {
  const { register } = useAuth();
  const navigate = useNavigate();

  const [tenantName, setTenantName] = useState("");
  const [cif, setCif] = useState("");
  const [razonSocial, setRazonSocial] = useState("");
  const [direccionFiscal, setDireccionFiscal] = useState("");
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const [error, setError] = useState<string | null>(null);
  const [prelaunchBlocked, setPrelaunchBlocked] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setPrelaunchBlocked(false);
    setSubmitting(true);
    try {
      await register({
        tenant_name: tenantName.trim(),
        cif: cif.trim() || undefined,
        razon_social: razonSocial.trim() || undefined,
        direccion_fiscal: direccionFiscal.trim() || undefined,
        full_name: fullName.trim(),
        email: email.trim(),
        password,
      });
      navigate("/", { replace: true });
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.status === 403) {
          setPrelaunchBlocked(true);
        }
        setError(err.detail);
      } else {
        setError("No se pudo completar el registro.");
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-950 px-4 py-10">
      <div className="w-full max-w-lg space-y-6">
        <div className="text-center">
          <div className="mx-auto mb-3 inline-flex h-12 w-12 items-center justify-center rounded-xl bg-indigo-600 text-white shadow-lg shadow-indigo-600/30">
            <Bot className="h-6 w-6" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-white">Alta de Empresa en FidusOS v2</h1>
          <p className="mt-1 text-sm text-slate-400">
            Crea un tenant aislado con configuración BYOK y servidor MCP propio.
          </p>
        </div>

        <div className="rounded-2xl border border-slate-800 bg-slate-900 p-6 shadow-xl">
          {prelaunchBlocked && (
            <div className="mb-4 flex items-start gap-2.5 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3.5 py-3 text-sm text-amber-200">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-400" />
              <div>
                <p className="font-semibold">Registro público en modo prelanzamiento</p>
                <p className="mt-0.5 text-xs text-amber-200/80">
                  Esta instancia tiene <code className="font-mono">PRELAUNCH_MODE=true</code>. Contacta con el administrador para obtener acceso o desactívalo en tu despliegue self-hosted.
                </p>
              </div>
            </div>
          )}

          {error && !prelaunchBlocked && (
            <div className="mb-4 rounded-lg border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-sm text-rose-200">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-4 space-y-3">
              <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-slate-400">
                <Building2 className="h-3.5 w-3.5 text-indigo-400" />
                Datos de la empresa (Tenant)
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="sm:col-span-2">
                  <label className="block text-xs font-medium text-slate-300">
                    Nombre comercial *
                  </label>
                  <input
                    type="text"
                    required
                    minLength={2}
                    value={tenantName}
                    onChange={(e) => setTenantName(e.target.value)}
                    placeholder="Iberia Soluciones"
                    className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white placeholder-slate-500 focus:border-indigo-500 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-300">
                    CIF / NIF (opcional)
                  </label>
                  <input
                    type="text"
                    value={cif}
                    onChange={(e) => setCif(e.target.value)}
                    placeholder="B12345678"
                    className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm uppercase text-white placeholder-slate-500 focus:border-indigo-500 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-300">
                    Razón social (opcional)
                  </label>
                  <input
                    type="text"
                    value={razonSocial}
                    onChange={(e) => setRazonSocial(e.target.value)}
                    placeholder="Iberia Soluciones S.L."
                    className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white placeholder-slate-500 focus:border-indigo-500 focus:outline-none"
                  />
                </div>

                <div className="sm:col-span-2">
                  <label className="block text-xs font-medium text-slate-300">
                    Dirección fiscal (opcional)
                  </label>
                  <input
                    type="text"
                    value={direccionFiscal}
                    onChange={(e) => setDireccionFiscal(e.target.value)}
                    placeholder="Calle Mayor 10, 28013 Madrid"
                    className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white placeholder-slate-500 focus:border-indigo-500 focus:outline-none"
                  />
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <label className="block text-xs font-medium text-slate-300">
                  Nombre completo del administrador *
                </label>
                <input
                  type="text"
                  required
                  minLength={2}
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="Ana García"
                  className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white placeholder-slate-500 focus:border-indigo-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300">
                  Correo electrónico *
                </label>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="ana@tuempresa.es"
                  className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white placeholder-slate-500 focus:border-indigo-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300">
                  Contraseña (mín. 8 caracteres) *
                </label>
                <input
                  type="password"
                  required
                  minLength={8}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white placeholder-slate-500 focus:border-indigo-500 focus:outline-none"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={submitting}
              className="w-full rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-indigo-500 disabled:opacity-50"
            >
              {submitting ? "Creando espacio de trabajo..." : "Crear cuenta y acceder"}
            </button>
          </form>

          <div className="mt-5 border-t border-slate-800 pt-4 text-center text-xs text-slate-400">
            ¿Ya tienes cuenta?{" "}
            <Link to="/login" className="font-medium text-indigo-400 hover:text-indigo-300">
              Iniciar sesión
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
};
