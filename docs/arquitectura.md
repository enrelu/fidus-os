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
|                                                | AgentApiKeys  |  |
|                                                +-------+-------+  |
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
- Incluyen `scopes` para limitar qué acciones puede leer o proponer cada agente conectado.

---

## 4. Ciclo de vida de `AgentAction`

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

---

## 5. Migraciones y base de datos

- **Desarrollo**: SQLite (`sqlite:///./fidus_dev.db`) para iteración rápida sin dependencias externas.
- **Producción**: PostgreSQL mediante `DATABASE_URL` y migraciones versionadas con **Alembic** (`backend/core/db_migrations.py` y `backend/migrations/`).
