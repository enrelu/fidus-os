"""Entrypoint stdio opcional para clientes MCP locales usando FIDUS_AGENT_API_KEY."""

from __future__ import annotations

import os
import sys

from mcp_server.context import (
    MCPAuthError,
    authenticate_agent_token,
    reset_current_mcp_agent,
    set_current_mcp_agent,
)
from mcp_server.tools import mcp


def main() -> None:
    raw_key = os.getenv("FIDUS_AGENT_API_KEY")
    try:
        agent_ctx = authenticate_agent_token(raw_key)
    except MCPAuthError as exc:
        print(f"[FidusOS MCP stdio] Error de autenticación: {exc.detail}", file=sys.stderr)
        raise SystemExit(1) from exc

    ctx_token = set_current_mcp_agent(agent_ctx)
    try:
        mcp.run(transport="stdio")
    finally:
        reset_current_mcp_agent(ctx_token)


if __name__ == "__main__":
    main()
