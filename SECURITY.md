# Política de Seguridad — FidusOS v2

## Modelo de seguridad desde el diseño

**FidusOS v2** está construido como un CRM **Agent-First / AI-Ready** bajo licencia **AGPLv3**, diseñado para entornos *self-hosted* donde la soberanía del dato y la supervisión humana son prioritarias:

- **Aislamiento multi-tenant estricto**: Todas las entidades están acotadas por `tenant_id` y validadas desde el JWT del usuario o la `AgentApiKey` resuelta en base de datos.
- **Cifrado BYOK en reposo**: Las API keys de proveedores de IA (`AIProviderConfig`) se cifran con **Fernet** (`ENCRYPTION_KEY`) y nunca se devuelven en texto claro por la API ni en logs.
- **Autenticación de agentes MCP**: El endpoint `/mcp` exige `AgentApiKey` activa (`fos_ag_...`, almacenada únicamente como hash SHA-256) y verificación granular de *scopes* (`crm:read`, `crm:write`, `actions:propose`).
- **Control Human-in-the-Loop (HITL)**: Las mutaciones sensibles propuestas por agentes quedan en estado `pending_approval` hasta su aprobación explícita por un usuario del tenant.
- **Validación estricta en producción**: Con `ENVIRONMENT=production`, la API y el worker rechazan arrancar si `ENCRYPTION_KEY` o `JWT_SECRET_KEY` faltan o conservan valores *placeholder*.

---

## Reportar una vulnerabilidad

Si detectas una vulnerabilidad de seguridad, **no abras un issue público** ni publiques detalles del fallo antes de su corrección.

1. Envía un reporte confidencial mediante **GitHub Security Advisories** (*"Report a vulnerability"* en la pestaña **Security** del repositorio `enrelu/fidus-os`) o contactando directamente con los mantenedores del proyecto.
2. Incluye descripción técnica, impacto esperado, pasos mínimos de reproducción y versión o commit afectado.
3. Nos comprometemos a acusar recibo y priorizar cualquier fallo relacionado con fuga multi-tenant, exposición de claves BYOK, omisión de *scopes* MCP o ejecución no autorizada de `AgentAction`.

---

## Recomendaciones para despliegues Self-Hosted

- Genera claves independientes por entorno para `ENCRYPTION_KEY`, `JWT_SECRET_KEY` y `POSTGRES_PASSWORD`.
- No publiques el repositorio ni hagas copias de seguridad sin excluir archivos `.env` y bases de datos locales (`*.db`).
- Expón siempre el frontend y `/mcp` detrás de HTTPS (TLS) mediante proxy inverso (Caddy o Nginx) cuando trabajes fuera de `localhost`.
- Restringe el acceso directo al puerto de la API (`8000`) mediante firewall si utilizas Nginx/Caddy como único punto de entrada.
