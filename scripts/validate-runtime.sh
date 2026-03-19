#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ARTIFACT_ROOT="${CI_ARTIFACT_ROOT:-$ROOT_DIR/output/ci-runtime/${CI_RUN_ID:-$(date '+%Y%m%d-%H%M%S')}}"

BACKEND_DATABASE_URL="${DATABASE_URL:-postgresql://lea_admin:CHANGE_THIS_PASSWORD_IN_PRODUCTION@127.0.0.1:5433/lea_platform}"
BACKEND_DATABASE_DIRECT_URL="${DATABASE_DIRECT_URL:-$BACKEND_DATABASE_URL}"
export SWARM_TRACE_ROOT="${SWARM_TRACE_ROOT:-$ARTIFACT_ROOT/swarm-runs}"
export PLAYWRIGHT_ARTIFACT_DIR="${PLAYWRIGHT_ARTIFACT_DIR:-$ARTIFACT_ROOT/playwright}"

mkdir -p "$ARTIFACT_ROOT" "$SWARM_TRACE_ROOT" "$PLAYWRIGHT_ARTIFACT_DIR"

echo "[runtime] artifacts: $ARTIFACT_ROOT"

BACKEND_PID=""
FRONTEND_PID=""

cleanup() {
  if [[ -n "$BACKEND_PID" ]]; then kill "$BACKEND_PID" >/dev/null 2>&1 || true; fi
  if [[ -n "$FRONTEND_PID" ]]; then kill "$FRONTEND_PID" >/dev/null 2>&1 || true; fi
}

wait_for_url() {
  local url="$1"
  local attempts="${2:-60}"
  local delay="${3:-1}"
  for ((i=1; i<=attempts; i++)); do
    if curl -fsS "$url" >/dev/null 2>&1; then
      return 0
    fi
    sleep "$delay"
  done
  return 1
}

trap cleanup EXIT

(
  cd "$ROOT_DIR/backend"
  if ! env DATABASE_URL="$BACKEND_DATABASE_URL" DATABASE_DIRECT_URL="$BACKEND_DATABASE_DIRECT_URL" npx prisma migrate deploy; then
    echo "[runtime] warning: prisma migrate deploy is unavailable in this local shell; continuing against the already-migrated schema"
  fi
  npm run build
  npm run test:runtime
)

(
  cd "$ROOT_DIR/lea-app"
  npm run typecheck
  npm run test:runtime
)

cd "$ROOT_DIR/backend"
PORT=3301 HOST=127.0.0.1 DATABASE_URL="$BACKEND_DATABASE_URL" DATABASE_DIRECT_URL="$BACKEND_DATABASE_DIRECT_URL" ALLOWED_ORIGINS="http://127.0.0.1:3300,http://localhost:3300" MCP_KALI_ENDPOINT="http://127.0.0.1:3002/mcp" ENCRYPTION_MASTER_KEY="bd092b77f9b63291ad71892c1e22fc5ca41dbdbc42bea6874fdda9f213bd773f" DEFAULT_PROVIDER="anthropic" DEFAULT_MODEL="claude-sonnet-4-5-20250929" node --import tsx src/index.ts >"$ARTIFACT_ROOT/backend-e2e.log" 2>&1 &
BACKEND_PID=$!

cd "$ROOT_DIR/lea-app"
PORT=3300 API_URL="http://127.0.0.1:3301" NEXT_PUBLIC_API_BASE="http://127.0.0.1:3301" npm run dev >"$ARTIFACT_ROOT/frontend-e2e.log" 2>&1 &
FRONTEND_PID=$!

wait_for_url "http://127.0.0.1:3301/api/health"
wait_for_url "http://127.0.0.1:3300/pentest"

(
  cd "$ROOT_DIR/backend"
  npm run test:e2e:runtime
)

echo "[runtime] validation complete"
echo "[runtime] trace artifacts: $SWARM_TRACE_ROOT"
echo "[runtime] playwright artifacts: $PLAYWRIGHT_ARTIFACT_DIR"
