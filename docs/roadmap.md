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

## Hito 4 — Workers en segundo plano con BYOK (Redis + Colas) *(Siguiente)*
- Integración con `REDIS_URL` para colas asíncronas por tenant usando el `AIProviderConfig` por defecto.
- Casos de uso iniciales:
  - Resúmenes automáticos de actividad de cuentas y oportunidades.
  - Detección de señales de riesgo o estancamiento en el pipeline.
  - Borradores de seguimiento comercial propuestos como `AgentAction`.
  - Briefings diarios/semanales para responsables comerciales.

## Hito 5 — Self-Hosting, Despliegue y Cumplimiento RGPD/LOPDGDD
- `Dockerfile` y `docker-compose.yml` listos para despliegue *self-hosted* (FastAPI + PostgreSQL + Redis + Frontend).
- Herramientas de exportación y borrado RGPD/LOPDGDD por cliente y tenant.
- Políticas de retención de `ActivityLog` y auditoría ampliada.
