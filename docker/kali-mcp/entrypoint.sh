#!/bin/sh
set -e

export MCP_HOST="${MCP_HOST:-0.0.0.0}"
export MCP_PORT="${MCP_PORT:-3002}"
export WORKSPACE_ROOT="${WORKSPACE_ROOT:-/workspace}"

mkdir -p "${WORKSPACE_ROOT}/pentests" "${WORKSPACE_ROOT}/shared" "${WORKSPACE_ROOT}/logs"

exec python3 /opt/lea-kali/server.py
