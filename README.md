# FidusOS v2 — CRM AI-Ready / Agent-First (Open-Core)

**FidusOS v2** es un CRM **AI-Ready / Agent-First** y **Self-Hosted** diseñado para pymes y empresas medianas en España, siguiendo un modelo *open-core* bajo licencia **AGPLv3**.

En lugar de acoplar funciones de IA opacas en un SaaS cerrado, FidusOS v2 sitúa la soberanía del dato, la trazabilidad de los agentes y el control humano (*Human-in-the-Loop*) en el centro de la arquitectura.

---

## Principios clave

- **Agent-First & Human-in-the-Loop**: Los agentes de IA proponen acciones (`AgentAction`) que quedan registradas y requieren aprobación humana antes de ejecutarse sobre datos sensibles del CRM, con auditoría completa en `ActivityLog` (`actor_type`: `human` / `agent`, `model_used`).
- **Arquitectura de IA Dual (MCP + BYOK)**:
  - **MCP Server nativo (`/mcp`)**: Expone herramientas CRM sobre **Streamable HTTP** autenticado por `AgentApiKey` para conectar tus propios clientes o suscripciones (Claude, ChatGPT, Cursor, OpenClaw).
  - **BYOK / BYO-Model interno**: Cada tenant configura sus propias API keys o modelos locales (**OpenAI, Anthropic, Google Gemini, OpenRouter, Mistral, Ollama / vLLM** compatible con OpenAI) para tareas en segundo plano (resúmenes, borradores, detección de señales y briefings).
- **Multi-tenant estricto**: Aislamiento por `tenant_id` en base de datos, autenticación JWT y validación estricta de referencias entre entidades.
- **Adaptado al mercado español**:
  - Campos fiscales nativos en organizaciones (`cif`, `razon_social`, `direccion_fiscal`).
  - Importes y oportunidades en `EUR`.
  - Trazabilidad orientada a cumplimiento **RGPD / LOPDGDD** (consentimiento en clientes y registro de actividad de humanos y agentes).
- **Seguridad desde el diseño**: Cifrado simétrico **Fernet** (`ENCRYPTION_KEY`) en reposo para las credenciales BYOK y enmascaramiento estricto en todas las respuestas de la API.

---

## Stack tecnológico

- **Backend**: Python 3.12 · FastAPI · SQLModel · SQLAlchemy · Alembic · Worker Redis (`fidus:jobs`)
- **MCP**: SDK oficial `mcp` (Streamable HTTP en `/mcp` + entrypoint `stdio` opcional)
- **Base de datos y colas**: PostgreSQL 16 (producción / Docker) · SQLite (desarrollo local) · Redis 7
- **Seguridad**: `cryptography` (Fernet), `PyJWT`, `bcrypt`
- **IA / Gateway**: `httpx` asíncrono multi-proveedor (OpenAI, Anthropic, Gemini, OpenRouter, Mistral, Ollama / OpenAI-compatible)
- **Testing**: `pytest` + `httpx` / `TestClient`
- **Frontend**: React 18 + TypeScript + Vite + Tailwind CSS v4 (supervisión *Human-in-the-Loop*, auditoría de actividad, ajustes BYOK/MCP y CRM operativo)
- **Self-Hosting**: Docker + Docker Compose v2 + Nginx (proxy inverso para SPA, `/api/` y `/mcp`)

---

## Estructura del repositorio

```text
fidus-os/
├── LICENSE                  # Licencia AGPLv3
├── SECURITY.md              # Política de seguridad y reporte responsable
├── CONTRIBUTING.md          # Guía de contribución open-core
├── README.md
├── .env.example             # Plantilla de variables para Docker Compose (sin secretos)
├── docker-compose.yml       # Stack completo: postgres, redis, api, worker y web
├── docs/
│   ├── arquitectura.md      # Arquitectura técnica, seguridad y flujo Agent-First
│   ├── roadmap.md           # Hoja de ruta por hitos
│   └── self-hosting.md      # Guía de despliegue VPS, HTTPS, backups y hardening
├── backend/
│   ├── .env.example         # Plantilla local de desarrollo backend
│   ├── Dockerfile           # Imagen no-root Python 3.12 (API + Worker)
│   ├── entrypoint.sh        # Validación de claves en producción + alembic upgrade head
│   ├── alembic.ini          # Configuración de migraciones Alembic
│   ├── main.py              # Entrada principal FastAPI + montaje /mcp
│   ├── worker.py            # Worker base Redis (heartbeat + cola fidus:jobs)
│   ├── requirements.txt     # Dependencias Python 3.12
│   ├── core/                # Base de datos, migraciones, cifrado, auth y modelos
│   ├── ai/                  # Gateway BYOK multi-proveedor, rutas BYOK y acciones de agentes
│   ├── crm/                 # Endpoints base multi-tenant del CRM
│   ├── mcp_server/          # Servidor MCP nativo (/mcp Streamable HTTP + stdio)
│   ├── migrations/          # Historial de migraciones Alembic
│   ├── scripts/             # Utilidades manuales (p. ej. seed_demo.py bajo demanda)
│   └── tests/               # Suite de tests pytest
└── frontend/
    ├── Dockerfile           # Multi-stage Node 22 -> Nginx 1.27
    ├── nginx.conf           # Proxy inverso /api, /mcp, /health + SPA fallback
    ├── package.json         # Dependencias React + TypeScript + Vite + Tailwind v4
    ├── vite.config.ts       # Proxy /api y /mcp hacia http://127.0.0.1:8000
    └── src/                 # Vistas HITL, Auditoría, Configuración IA (BYOK+MCP) y CRM
```

---

## Despliegue rápido con Docker Compose (Self-Hosted)

La forma recomendada de desplegar **FidusOS v2** completo (PostgreSQL 16 + Redis 7 + API/MCP + Worker + Frontend Nginx) desde cero:

```bash
cp .env.example .env
# Genera ENCRYPTION_KEY y JWT_SECRET_KEY y sustituye los placeholders en .env:
python3 -c "from cryptography.fernet import Fernet; print('ENCRYPTION_KEY=' + Fernet.generate_key().decode())"
python3 -c "import secrets; print('JWT_SECRET_KEY=' + secrets.token_urlsafe(48))"

docker compose up -d --build
```

- **Frontend web**: `http://localhost:3000`
- **API / Swagger**: `http://localhost:8000/docs`
- **Servidor MCP (vía Nginx)**: `http://localhost:3000/mcp`

Consulta la guía completa de producción, HTTPS para `/mcp`, backups y *hardening* en [docs/self-hosting.md](docs/self-hosting.md).

---

## Arranque rápido (desarrollo local)

### 1. Crear entorno virtual con `uv` (Python 3.12)

```bash
uv venv venv --python 3.12
```

Activar el entorno virtual:

- **Windows (PowerShell)**:
  ```powershell
  .\venv\Scripts\Activate.ps1
  ```
- **Linux / macOS**:
  ```bash
  source venv/bin/activate
  ```

### 2. Instalar dependencias

```bash
uv pip install -r backend/requirements.txt
```

### 3. Configurar variables de entorno

Copia `backend/.env.example` a `backend/.env` y genera claves seguras:

```bash
cp backend/.env.example backend/.env
```

Puedes generar `ENCRYPTION_KEY` (clave Fernet válida) y `JWT_SECRET_KEY` con Python:

```bash
python -c "from cryptography.fernet import Fernet; print('ENCRYPTION_KEY=' + Fernet.generate_key().decode())"
python -c "import secrets; print('JWT_SECRET_KEY=' + secrets.token_urlsafe(48))"
```

### 4. Aplicar migraciones y arrancar el servidor

```bash
cd backend
alembic upgrade head
uvicorn main:app --reload
```

La API estará disponible en `http://127.0.0.1:8000`, la documentación interactiva OpenAPI en `http://127.0.0.1:8000/docs` y el servidor MCP nativo en `http://127.0.0.1:8000/mcp`.

### 5. Conectar un cliente MCP (Claude, ChatGPT, Cursor, OpenClaw)

1. Crea una `AgentApiKey` mediante `POST /api/v1/ai/agent-keys` (por ejemplo con scopes `crm:read,crm:write,actions:propose`).
2. Configura tu cliente MCP remoto (**Streamable HTTP**) apuntando a `/mcp` con la cabecera `Authorization: Bearer fos_ag_...` (o `X-Agent-Api-Key: fos_ag_...`):

```json
{
  "mcpServers": {
    "fidus-os": {
      "url": "http://127.0.0.1:8000/mcp",
      "headers": {
        "Authorization": "Bearer fos_ag_TU_CLAVE_DE_AGENTE"
      }
    }
  }
}
```

Para clientes locales que requieran transporte **stdio**:

```bash
cd backend
FIDUS_AGENT_API_KEY=fos_ag_TU_CLAVE_DE_AGENTE python -m mcp_server.stdio
```

Herramientas MCP disponibles: `buscar_crm`, `cuenta_360`, `listar_pendientes`, `crear_o_actualizar_lead`, `registrar_interaccion` y `proponer_accion`.

### 6. Ejecutar los tests del backend

```bash
cd backend
pytest
```

### 7. Arrancar el Frontend (React + TypeScript)

Con el backend levantado en `http://127.0.0.1:8000`:

```bash
cd frontend
npm install
npm run dev
```

La interfaz web estará disponible en `http://127.0.0.1:5173` (con proxy automático de `/api` y `/mcp` hacia `http://127.0.0.1:8000`; opcionalmente puedes definir `VITE_API_BASE_URL` si apuntas a otro origen). Para generar el bundle de producción con verificación de tipos:

```bash
npm run build
```

---

## Documentación

- [Arquitectura de FidusOS v2](docs/arquitectura.md)
- [Guía Self-Hosted (Docker Compose + HTTPS)](docs/self-hosting.md)
- [Roadmap de desarrollo](docs/roadmap.md)
- [Política de seguridad](SECURITY.md)
- [Guía de contribución](CONTRIBUTING.md)

---

## Licencia

Este proyecto se distribuye bajo licencia **GNU Affero General Public License v3.0 (AGPLv3)**. Consulta el archivo [LICENSE](LICENSE) para más detalles.
