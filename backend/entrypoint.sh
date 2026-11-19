#!/bin/sh
set -eu

# Validar claves obligatorias en entorno de producción antes de migrar o arrancar
python -c "from core.config import get_settings; get_settings().validate_runtime_security()"

# Ejecutar migraciones Alembic automáticamente cuando arranca el servicio API
if [ "${1:-}" = "uvicorn" ]; then
    echo "[FidusOS] Aplicando migraciones Alembic..."
    alembic upgrade head
fi

exec "$@"
