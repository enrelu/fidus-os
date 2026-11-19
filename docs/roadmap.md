# Roadmap de FidusOS v2

Hoja de ruta evolutiva de **FidusOS v2** hacia un CRM **Agent-First / AI-Ready** completo para pymes y empresas medianas en España.

---

## Hito 1 — Bootstrap limpio + Cimientos Multi-Tenant, BYOK y Agentes *(Completado)*
- Inicialización del repositorio público limpio bajo licencia **AGPLv3**.
- Núcleo FastAPI + SQLModel + Alembic (`SQLite` en desarrollo / `PostgreSQL` en producción).
- Autenticación JWT y dependencia estricta `require_tenant_user` con aislamiento multi-tenant.
- Modelos CRM orientados al mercado español (`Organization` con `cif`, `razon_social`, `direccion_fiscal`; `Client` con consentimiento RGPD; `Lead`; `Opportunity` en `EUR`; `Task`; `ActivityLog` con `actor_type=human|agent`).
- Cimientos de IA y gobierno de agentes:
  - `AIProviderConfig` con cifrado simétrico Fernet y enmascaramiento estricto.
  - `AgentApiKey` con prefijo y hash SHA-256.
  - `AgentAction` con flujo de aprobación *Human-in-the-Loop*.
- `ai/gateway.py` multi-proveedor BYOK (OpenAI, Anthropic, Gemini, OpenRouter, Mistral, Ollama / OpenAI-compatible) + endpoints CRUD y test de conexión.
- Suite de tests `pytest` cubriendo aislamiento multi-tenant, cifrado/enmascarado BYOK y ciclo de `AgentAction`.

## Hito 2 — MCP Server nativo (`/mcp`) y Ejecución Controlada *(Completado)*
- Servidor **MCP (Model Context Protocol)** nativo montado en `/mcp` (Streamable HTTP) y entrypoint `stdio` opcional con autenticación obligatoria mediante `AgentApiKey` y *scopes* (`crm:read`, `crm:write`, `actions:propose`).
- Herramientas MCP del CRM en español: `buscar_crm`, `cuenta_360`, `listar_pendientes`, `crear_o_actualizar_lead`, `registrar_interaccion` y `proponer_accion`.
- Motor ejecutor blindado de `AgentAction` aprobadas (`create_task`, `create_lead`, `update_opportunity`) con rechazo `422` para acciones no soportadas y registro en `ActivityLog`.
- Documentación de conexión para Claude, ChatGPT, Cursor y OpenClaw.

## Hito 3 — Frontend React + TypeScript (Supervisión HITL, Auditoría y Ajustes) *(Completado)*
- Interfaz SPA en `frontend/` con **React 18 + TypeScript + Vite + Tailwind CSS v4**.
- Flujo completo de autenticación JWT (`/login`, `/registro`) con soporte de campos fiscales españoles opcionales y manejo de `PRELAUNCH_MODE`.
- Bandeja principal de **Supervisión Human-in-the-Loop (`AgentAction`)** con filtros por estado, contador en tiempo real, previsualización clara del payload y aprobación+ejecución atómica en 1 clic (`POST /api/v1/ai/agent-actions/{id}/approve-and-execute`).
- Vista de **Auditoría de Actividad (`ActivityLog`)** con filtros por actor (`human` / `agent`) y tipo de entidad.
- Panel de **Configuración IA (BYOK + MCP)**: alta, edición, prueba de conexión y borrado de proveedores BYOK, más creación/revocación de `AgentApiKey` con copia única de la clave y snippet JSON listo para Claude, Cursor y OpenClaw.
- **CRM Operativo** con 5 sub-vistas (Organizaciones con CIF/razón social, Contactos con consentimiento RGPD, Leads, Oportunidades en EUR y Tareas).

## Hito 4 — Self-Hosted (`docker-compose`) + Publicación Open-Core *(Completado)*
- Orquestación completa en [`docker-compose.yml`](../docker-compose.yml) con **5 servicios**: `postgres` (PostgreSQL 16), `redis` (Redis 7), `api` (FastAPI + `/mcp` con migraciones automáticas), `worker` (`python -m worker` con heartbeat y cola `fidus:jobs`) y `web` (React + Nginx proxy para `/api` y `/mcp`).
- Dockerfiles de producción (`backend/Dockerfile` con usuario no-root `fidus` y `frontend/Dockerfile` multi-stage Node 22 → Nginx 1.27).
- Validación estricta de claves (`ENCRYPTION_KEY` y `JWT_SECRET_KEY`) en `ENVIRONMENT=production` para impedir arranques inseguros.
- Guía completa de despliegue en [`docs/self-hosting.md`](self-hosting.md), [`SECURITY.md`](../SECURITY.md), [`CONTRIBUTING.md`](../CONTRIBUTING.md) y licencia **AGPLv3** ([`LICENSE`](../LICENSE)).

## Hito 5 — Motor Proactivo de Agentes (Watchers + Radar con BYOK) y Cumplimiento RGPD Ampliado *(Siguiente)*
- Evolución del worker en Redis (`fidus:jobs`) usando el `AIProviderConfig` por defecto de cada tenant:
  - *Watchers* por evento y *Radar Comercial* programado para detectar oportunidades estancadas o señales de riesgo.
  - Ingesta de notas libres y resúmenes automáticos de cuentas/oportunidades.
  - Borradores de seguimiento comercial propuestos como `AgentAction` (siempre bajo supervisión HITL).
  - Briefings diarios/semanales para responsables comerciales.
- Herramientas de exportación y borrado RGPD/LOPDGDD por cliente y tenant, junto con políticas de retención de `ActivityLog`.
