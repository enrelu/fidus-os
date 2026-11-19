# Arquitectura de FidusOS v2

FidusOS v2 nace como un CRM **Agent-First / AI-Ready** diseñado para pymes y empresas medianas en España bajo modelo **open-core** (licencia AGPLv3). La arquitectura separa claramente el núcleo transaccional multi-tenant, la capa de abstracción de IA (BYOK + MCP) y los mecanismos de gobierno y trazabilidad sobre las acciones de los agentes.

---

## 1. Principios de diseño

1. **Aislamiento multi-tenant estricto**:
   - Todas las entidades de negocio y configuración (`User`, `Organization`, `Client`, `Lead`, `Opportunity`, `Task`, `ActivityLog`, `AIProviderConfig`, `AgentApiKey`, `AgentAction`) contienen `tenant_id` indexado.
   - La dependencia `require_tenant_user` valida el JWT, comprueba que el usuario y su `Tenant` están activos y propaga el `tenant_id` a toda la capa de servicio.
   - Todas las consultas y relaciones entre claves foráneas verifican pertenencia al mismo `tenant_id` para evitar fugas entre tenants (IDOR).

2. **Arquitectura de IA Dual (MCP + BYOK)**:
   - **MCP Server nativo (`/mcp`)**: Expone herramientas y recursos del CRM hacia clientes externos elegidos por el usuario (Claude, ChatGPT, Cursor, OpenClaw), usando llaves `AgentApiKey` con *scopes* granulares.
   - **Gateway BYOK / BYO-Model interno (`ai/gateway.py`)**: Permite que cada tenant configure sus propias credenciales o endpoints locales para automatizaciones internas en segundo plano (resúmenes, borradores, detección de señales, briefings) sin depender de un proveedor único.

3. **Human-in-the-Loop (HITL) por defecto**:
   - Los agentes no mutan datos críticos de forma opaca. Proponen cambios mediante `AgentAction` en estado `pending_approval`.
   - Un usuario humano del tenant revisa la propuesta (`approved` o `rejected`) dejando constancia en `reviewed_by_user_id` y en `ActivityLog`.

4. **Trazabilidad y cumplimiento (España / RGPD-LOPDGDD)**:
   - `ActivityLog` diferencia explícitamente `actor_type` (`human` frente a `agent`), `actor_name` y `model_used`.
   - `Organization` incorpora datos fiscales españoles (`cif`, `razon_social`, `direccion_fiscal`).
   - `Opportunity` opera de forma nativa en `EUR`.
   - `Client` registra consentimiento RGPD (`rgpd_consent`, `rgpd_consent_date`).

---

## 2. Diagrama lógico

```text
+-------------------------------------------------------------------+
|                   Clientes Externos & UI                          |
|  - Clientes MCP (Claude, ChatGPT, Cursor, OpenClaw)               |
|  - UI React/TS (Supervisión HITL, Ajustes BYOK/MCP, CRM)          |
+----------------------------+--------------------------------------+
                             |
                             v
+-------------------------------------------------------------------+
|                    API FastAPI (backend/main.py)                  |
|  +--------------------+  +------------------+  +---------------+  |
|  | core/auth.py       |  | crm/             |  | ai/           |  |
|  | JWT & Tenant Guard |  | Entidades CRM    |  | BYOK Gateway  |  |
|  +--------------------+  +------------------+  | AgentActions  |  |
|  +------------------------------------------+  | AgentApiKeys  |  |
|  | mcp_server/ (/mcp Streamable HTTP)       |  +-------+-------+  |
|  | Auth AgentApiKey + Scopes + 6 Tools CRM  |          |          |
|  +------------------------------------------+          |          |
+--------------------------------------------------------+----------+
                                                         |
             +-------------------------------------------+
             |                                           |
             v                                           v
+-------------------------+                +------------------------+
|  core/crypto.py         |                | Proveedores LLM BYOK   |
|  Cifrado Fernet (AES)   |                | - OpenAI / OpenRouter  |
|  para api_key_encrypted |                | - Anthropic / Mistral  |
+------------+------------+                | - Google Gemini        |
             |                             | - Ollama / vLLM local  |
             v                             +------------------------+
+-------------------------+
| SQLModel + Alembic      |
| SQLite (dev) /          |
| PostgreSQL (prod)       |
+-------------------------+
```

---

## 3. Seguridad de credenciales BYOK y claves de agentes

### Cifrado simétrico para `AIProviderConfig`
- Las API keys de proveedores de IA nunca se almacenan en texto plano en base de datos.
- `core/crypto.py` utiliza **Fernet** (`cryptography.fernet`) derivado de `ENCRYPTION_KEY`.
- Al crear o actualizar un `AIProviderConfig`, la clave se cifra antes de persistirse en `api_key_encrypted`.
- Los endpoints de lectura devuelven únicamente `api_key_masked` (por ejemplo, `sk-p****abcd`) y `has_api_key`, nunca la clave descifrada ni el blob cifrado.
- El descifrado ocurre únicamente en memoria dentro de `ai/gateway.py` en el instante de realizar la petición HTTP saliente al proveedor configurado.

### Claves de agente (`AgentApiKey`)
- Siguen el patrón estándar *prefix + hash*: el secreto completo se muestra una sola vez en el momento de su creación.
- En base de datos se guardan `key_prefix` (para identificación visual) y `key_hash` (SHA-256).
- Incluyen `scopes` para limitar qué acciones puede leer o proponer cada agente conectado (`crm:read`, `crm:write`, `actions:propose`).

---

## 4. Servidor MCP nativo (`/mcp`)

- Implementado sobre el SDK oficial `mcp` (`FastMCP` + `StreamableHTTPSessionManager` en modo *stateless* con respuestas JSON) y montado directamente en `/mcp` dentro de `backend/main.py` (más entrypoint opcional `python -m mcp_server.stdio`).
- **Autenticación obligatoria**: acepta `Authorization: Bearer fos_ag_...` o `X-Agent-Api-Key: fos_ag_...`. El `tenant_id` se resuelve exclusivamente desde la clave en base de datos (`AgentApiKey`), verificando clave activa y tenant activo; ninguna herramienta MCP acepta `tenant_id` como parámetro.
- **Permisos por herramienta**:
  - `crm:read`: `buscar_crm`, `cuenta_360`, `listar_pendientes`.
  - `crm:write`: `crear_o_actualizar_lead`, `registrar_interaccion` (siempre registrando `ActivityLog` con `actor_type="agent"`).
  - `actions:propose`: `proponer_accion` (crea `AgentAction` en `pending_approval`).

```json
{
  "mcpServers": {
    "fidus-os": {
      "url": "https://tu-instancia.ejemplo.es/mcp",
      "headers": {
        "Authorization": "Bearer fos_ag_TU_CLAVE_DE_AGENTE"
      }
    }
  }
}
```

---

## 5. Ciclo de vida de `AgentAction`

```text
[Agente propone acción] --> pending_approval
                                 |
          +----------------------+----------------------+
          |                                             |
          v                                             v
      approved                                      rejected
          |
          v
      executed  (registra ActivityLog con actor_type="agent" + actor humano aprobador)
```

Los ejecutores soportados en `ai/routes.py` (`create_task`, `create_lead`, `update_opportunity`) validan estrictamente pertenencia al `tenant_id`, y cualquier `action_type` sin ejecutor registrado devuelve `422 Unprocessable Entity`.

---

## 6. Motor Proactivo de Agentes (`ai/proactive.py`, `ai/dispatcher.py`, `worker.py`)

FidusOS v2 combina ejecución reactiva vía MCP con un **Motor Proactivo autónomo** respaldado por el proveedor BYOK de cada tenant:

- **Auto-cualificación de Leads**: al crear un `Lead` (`POST /api/v1/crm/leads`), `enqueue_proactive_job` encola `proactive.qualify_lead` en Redis (`fidus:jobs`) —o lo ejecuta vía `BackgroundTasks` en desarrollo local si Redis no está activo— para puntuar el lead, resumirlo y proponer la primera tarea de seguimiento como `AgentAction` (`pending_approval`).
- **Radar Comercial Proactivo**: escanea oportunidades abiertas sin `ActivityLog` reciente, leads `new` sin atender y tareas vencidas, generando un *briefing* ejecutivo y acciones propuestas deduplicadas (ejecutable bajo demanda desde `/api/v1/ai/proactive/radar` o de forma periódica en `worker.py` mediante `PROACTIVE_RADAR_INTERVAL_SECONDS`).
- **Ingesta de Texto Libre**: convierte notas de reuniones, correos o llamadas (`/api/v1/ai/proactive/ingest`) en múltiples `AgentAction` validadas contra las entidades existentes del tenant.
- **Resiliencia y control humano**: todas las respuestas JSON del LLM (incluidos bloques ```` ```json ````) se validan con Pydantic y cualquier cambio propuesto queda en `pending_approval` hasta la aprobación humana en Supervisión HITL.

---

## 7. Migraciones y base de datos

- **Desarrollo**: SQLite (`sqlite:///./fidus_dev.db`) para iteración rápida sin dependencias externas.
- **Producción**: PostgreSQL 16 mediante `DATABASE_URL` y migraciones versionadas con **Alembic** (`backend/core/db_migrations.py` y `backend/migrations/`).
