# Guía de Despliegue Self-Hosted — FidusOS v2

Esta guía describe cómo desplegar **FidusOS v2** de principio a fin mediante **Docker Compose** en tu propio servidor (VPS Linux) o entorno local.

---

## 1. Arquitectura de servicios

El archivo [`docker-compose.yml`](../docker-compose.yml) orquesta **5 servicios** aislados en red interna:

| Servicio | Imagen / Build | Función |
| --- | --- | --- |
| `postgres` | `postgres:16-alpine` | Base de datos principal con volumen persistente `fidus_postgres_data`. |
| `redis` | `redis:7-alpine` | Cola `fidus:jobs` y heartbeat del worker con persistencia `fidus_redis_data`. |
| `api` | `./backend` | Backend FastAPI + servidor MCP (`/mcp`). Ejecuta `alembic upgrade head` al arrancar. |
| `worker` | `./backend` (`python -m worker`) | Worker base conectado a PostgreSQL y Redis (preparado para jobs proactivos). |
| `web` | `./frontend` (`nginx:1.27-alpine`) | SPA React + proxy inverso para `/api/`, `/mcp` y `/health`. |

---

## 2. Requisitos mínimos

- **Docker Engine** 24+ y **Docker Compose v2** (`docker compose version`).
- **VPS recomendado**: 1–2 vCPU, 1–2 GB de RAM y 10 GB de disco SSD (p. ej. Debian 12 / Ubuntu 24.04 LTS).
- **Puertos**:
  - Local: `3000` (web + proxy `/api` y `/mcp`) y opcionalmente `8000` (API directa).
  - Producción con dominio: `80` y `443` abiertos hacia tu proxy TLS (Caddy o Nginx).

---

## 3. Arranque rápido desde cero

### Paso 1 — Clonar el repositorio y crear `.env`

```bash
git clone https://github.com/enrelu/fidus-os.git
cd fidus-os
cp .env.example .env
```

### Paso 2 — Generar claves seguras

Genera `ENCRYPTION_KEY` (clave Fernet para cifrado BYOK) y `JWT_SECRET_KEY`:

```bash
python3 -c "from cryptography.fernet import Fernet; print('ENCRYPTION_KEY=' + Fernet.generate_key().decode())"
python3 -c "import secrets; print('JWT_SECRET_KEY=' + secrets.token_urlsafe(48))"
```

*(Si no tienes `cryptography` instalado en el host, puedes generarla usando una imagen temporal de Python o `openssl rand -base64 32 | tr '+/' '-_'` para Fernet).*

Edita `.env` y sustituye:
- `POSTGRES_PASSWORD`: contraseña segura para PostgreSQL.
- `ENCRYPTION_KEY`: clave Fernet generada.
- `JWT_SECRET_KEY`: secreto JWT generado.
- `CORS_ORIGINS`: añade tu dominio público (p. ej. `https://crm.tuempresa.es`).

> **Seguridad al arrancar**: Con `ENVIRONMENT=production`, ni `api` ni `worker` arrancarán si falta `.env` o si `ENCRYPTION_KEY` / `JWT_SECRET_KEY` conservan valores *placeholder* (`CAMBIAR_...`).

### Paso 3 — Construir y levantar los 5 servicios

```bash
docker compose up -d --build
```

Comprueba el estado de salud:

```bash
docker compose ps
docker compose logs -f api worker
```

Cuando `api` y `web` estén `healthy`, abre `http://localhost:3000` (o la IP/puerto configurado en `FIDUS_WEB_PORT`).

### Paso 4 — (Opcional) Cargar datos demo en español

Solo para entornos de evaluación (nunca automático en producción):

```bash
docker compose exec api python -m scripts.seed_demo --force
```

---

## 4. Exponer HTTPS en producción (Caddy o Nginx)

Para conectar clientes MCP externos (**Claude, ChatGPT, Cursor, OpenClaw**) de forma segura es imprescindible exponer `https://tu-dominio.es/mcp` con TLS válido.

### Opción A — Caddy (TLS automático con Let's Encrypt)

Si Caddy corre en el host delante del contenedor `web` (puerto `127.0.0.1:3000`):

```caddyfile
crm.tuempresa.es {
    reverse_proxy 127.0.0.1:3000 {
        flush_interval -1
    }
}
```

> `flush_interval -1` evita el buffering en respuestas de **Streamable HTTP / SSE** de `/mcp`.

### Opción B — Nginx en el host

```nginx
server {
    listen 443 ssl http2;
    server_name crm.tuempresa.es;

    # ssl_certificate y ssl_certificate_key gestionados por Certbot

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_buffering off;
        proxy_cache off;
        proxy_read_timeout 300s;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

Recuerda actualizar `CORS_ORIGINS=https://crm.tuempresa.es` en `.env` y reiniciar `api`:

```bash
docker compose up -d api
```

---

## 5. Copias de seguridad y restauración

### Backup de PostgreSQL (`pg_dump`)

```bash
mkdir -p backups
docker compose exec -T postgres pg_dump -U fidus -d fidus_os -Fc > backups/fidus_os_$(date +%F_%H%M).dump
```

> **Importante**: Guarda también en un gestor de secretos seguro tu `ENCRYPTION_KEY` de `.env`. Sin ella no se podrán descifrar las claves BYOK guardadas en `ai_provider_config`.

### Restauración

```bash
docker compose stop api worker
cat backups/fidus_os_FECHA.dump | docker compose exec -T postgres pg_restore -U fidus -d fidus_os --clean --if-exists
docker compose start api worker
```

---

## 6. Actualización de versión

```bash
git pull origin main
docker compose up -d --build
```

El servicio `api` ejecutará automáticamente `alembic upgrade head` antes de abrir tráfico HTTP.

---

## 7. Checklist de hardening antes de abrir a producción

- [ ] `.env` tiene permisos restrictivos (`chmod 600 .env`) y **no** está versionado en Git.
- [ ] `ENCRYPTION_KEY`, `JWT_SECRET_KEY` y `POSTGRES_PASSWORD` son únicos y aleatorios.
- [ ] `PRELAUNCH_MODE=true` si deseas cerrar el registro público tras crear tu tenant inicial.
- [ ] `FIDUS_API_PORT` limitado a `127.0.0.1:8000` o bloqueado en firewall (UFW) para que todo el tráfico externo pase por HTTPS + proxy inverso.
- [ ] Copias de seguridad automáticas de `pg_dump` configuradas fuera del servidor.
- [ ] Acceso SSH protegido con clave pública y firewall activo (`22`, `80`, `443`).
