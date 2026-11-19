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

## Hito 5 — Motor Proactivo de Agentes (BYOK Autónomo + Radar Comercial + Ingesta Libre) *(Completado)*
- **Motor proactivo BYOK (`backend/ai/proactive.py`)**:
  - **Auto-cualificación de Leads** (`qualify_lead_for_tenant`) disparada automáticamente tras `POST /api/v1/crm/leads`: asigna `score`, añade resumen/borrador en `notes`, registra `ActivityLog` y propone tarea de seguimiento en `AgentAction` (`pending_approval`).
  - **Radar Comercial Proactivo** (`run_commercial_radar_for_tenant`): detecta oportunidades estancadas, leads `new` sin atender y tareas vencidas, generando un *briefing* ejecutivo y propuestas HITL sin duplicados.
  - **Ingesta de texto libre** (`ingest_free_text_for_tenant`): transforma notas de reunión, correos o llamadas en propuestas validadas (`create_lead`, `create_task`, `update_opportunity`).
- **Dispatcher híbrido (`backend/ai/dispatcher.py`) + Worker periódico (`backend/worker.py`)**: encola en Redis (`fidus:jobs`) cuando está disponible, con fallback local vía FastAPI `BackgroundTasks` en desarrollo y Radar periódico configurable (`PROACTIVE_RADAR_INTERVAL_SECONDS`).
- **Supervisión HITL proactiva en Frontend**: banner de estado BYOK/Worker, ejecución manual del Radar Comercial con *briefing* colapsable y caja de ingesta de texto libre en la pantalla principal.

## Hito 6 — Cumplimiento RGPD Ampliado y Conectores *(Siguiente)*
- Herramientas de exportación y borrado RGPD/LOPDGDD por cliente y tenant.
- Políticas de retención de `ActivityLog` y auditoría ampliada.
- Conectores de entrada adicionales (webhooks de correo/formularios web) hacia el motor proactivo.
