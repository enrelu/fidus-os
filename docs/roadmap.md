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

## Hito 3 — Workers en segundo plano con BYOK (Redis + Colas) *(Siguiente)*
- Integración con `REDIS_URL` para colas asíncronas por tenant usando el `AIProviderConfig` por defecto.
- Casos de uso iniciales:
  - Resúmenes automáticos de actividad de cuentas y oportunidades.
  - Detección de señales de riesgo o estancamiento en el pipeline.
  - Borradores de seguimiento comercial propuestos como `AgentAction`.
  - Briefings diarios/semanales para responsables comerciales.

## Hito 4 — Frontend React + TypeScript (Supervisión HITL y Ajustes)
- Interfaz ligera y enfocada en:
  - Bandeja de **aprobaciones Human-in-the-Loop** (`AgentAction`) con diff claro de la acción propuesta.
  - Auditoría de actividad (`ActivityLog`) diferenciando acciones humanas y de agentes.
  - Panel de configuración **BYOK** (alta, prueba de conexión y proveedor por defecto) y gestión de **MCP / `AgentApiKey`**.
  - Vistas operativas del CRM (Organizaciones, Contactos, Leads, Oportunidades en EUR, Tareas).

## Hito 5 — Self-Hosting, Despliegue y Cumplimiento RGPD/LOPDGDD
- `Dockerfile` y `docker-compose.yml` listos para despliegue *self-hosted* (FastAPI + PostgreSQL + Redis + Frontend).
- Herramientas de exportación y borrado RGPD/LOPDGDD por cliente y tenant.
- Políticas de retención de `ActivityLog` y auditoría ampliada.
