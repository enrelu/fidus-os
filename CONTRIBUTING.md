# Contribuir a FidusOS v2

¡Gracias por tu interés en contribuir a **FidusOS v2**! Este proyecto es *open-core* bajo licencia **GNU Affero General Public License v3.0 (AGPLv3)** (consulta [LICENSE](LICENSE)).

---

## Principios del proyecto

1. **Idioma**: Interfaz de usuario, mensajes de error orientados al usuario y documentación en **español**.
2. **Seguridad y aislamiento**: Cualquier nuevo endpoint o herramienta MCP debe respetar estrictamente el `tenant_id` resuelto en servidor, validar referencias cruzadas entre entidades y registrar trazabilidad en `ActivityLog`.
3. **Sin secretos en el código**: Nunca incluyas archivos `.env`, claves reales, bases de datos `*.db` ni datos de clientes en commits o Pull Requests.
4. **Control humano (HITL)**: Las acciones autónomas de agentes que creen o modifiquen datos críticos deben pasar por `AgentAction` (`pending_approval`).

---

## Entorno de desarrollo local

### Backend (Python 3.12)

```bash
uv venv venv --python 3.12
# Windows PowerShell: .\venv\Scripts\Activate.ps1
# Linux / macOS:      source venv/bin/activate
uv pip install -r backend/requirements.txt

cd backend
pytest -v
```

### Frontend (React 18 + TypeScript + Vite)

```bash
cd frontend
npm install
npm run build
npm run dev
```

---

## Flujo de Pull Requests

1. Haz *fork* del repositorio y crea una rama descriptiva desde `main` (`feat/...`, `fix/...`, `docs/...`).
2. Asegúrate de añadir o actualizar tests en `backend/tests/` cuando modifiques lógica de negocio, seguridad, BYOK, MCP o worker.
3. Verifica que pasan todas las comprobaciones antes de abrir el PR:
   - `pytest -v` en `backend/`
   - `npm run build` en `frontend/`
   - `docker compose config` si tocas archivos de despliegue o contenedores
4. Al contribuir código aceptas que tu aportación se publique bajo licencia **AGPLv3**.
