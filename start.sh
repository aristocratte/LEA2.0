#!/usr/bin/env bash

set -Eeuo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_DIR="$ROOT_DIR/backend"
FRONTEND_DIR="$ROOT_DIR/lea-app"

BACKEND_PID=""
FRONTEND_PID=""
CLEANED_UP=0

DOCKER_SERVICES=(
  postgres
  postgres-dev-port
  lea-kali-mcp
)

log() {
  printf '[start.sh] %s\n' "$*"
}

have_cmd() {
  command -v "$1" >/dev/null 2>&1
}

compose() {
  if have_cmd docker && docker compose version >/dev/null 2>&1; then
    docker compose "$@"
  elif have_cmd docker-compose; then
    docker-compose "$@"
  else
    log "Docker Compose introuvable. Installe Docker Desktop ou docker-compose."
    exit 1
  fi
}

load_env_file() {
  if [[ -f "$ROOT_DIR/.env" ]]; then
    log "Chargement des variables depuis .env"
    local line key value
    while IFS= read -r line || [[ -n "$line" ]]; do
      line="${line%$'\r'}"
      [[ -z "${line//[[:space:]]/}" || "$line" =~ ^[[:space:]]*# ]] && continue
      if [[ "$line" != *"="* ]]; then
        log "Ligne .env ignorée (format KEY=VALUE attendu)"
        continue
      fi

      key="${line%%=*}"
      value="${line#*=}"
      key="${key#"${key%%[![:space:]]*}"}"
      key="${key%"${key##*[![:space:]]}"}"

      if [[ ! "$key" =~ ^[A-Za-z_][A-Za-z0-9_]*$ ]]; then
        log "Variable .env ignorée (nom invalide): $key"
        continue
      fi

      if [[ "$value" =~ ^\"(.*)\"$ ]]; then
        value="${BASH_REMATCH[1]}"
      elif [[ "$value" =~ ^\'(.*)\'$ ]]; then
        value="${BASH_REMATCH[1]}"
      fi

      export "$key=$value"
    done < "$ROOT_DIR/.env"
  else
    log "Aucun .env trouvé, utilisation de l'environnement courant"
  fi
}

adapt_local_database_url() {
  local current_url="${DATABASE_URL:-}"
  if [[ -z "$current_url" ]]; then
    return
  fi

  current_url="${current_url/@postgres:5432/@localhost:5433}"
  current_url="${current_url/@lea-postgres:5432/@localhost:5433}"
  if [[ "$current_url" == *"@localhost:5432/"* || "$current_url" == *"@127.0.0.1:5432/"* ]]; then
    log "DATABASE_URL pointe vers 5432; utilisation du proxy PostgreSQL dev sur 5433"
    current_url="${current_url/@localhost:5432/@localhost:5433}"
    current_url="${current_url/@127.0.0.1:5432/@127.0.0.1:5433}"
  fi
  export DATABASE_URL="$current_url"
}

adapt_local_mcp_url() {
  local current_url="${MCP_KALI_ENDPOINT:-}"
  if [[ -z "$current_url" ]]; then
    return
  fi

  current_url="${current_url/lea-kali-mcp/localhost}"
  export MCP_KALI_ENDPOINT="$current_url"
}

wait_for_port() {
  local host="$1"
  local port="$2"
  local label="$3"
  local retries="${4:-60}"
  local i

  for ((i = 1; i <= retries; i++)); do
    if nc -z "$host" "$port" >/dev/null 2>&1; then
      log "$label prêt sur $host:$port"
      return 0
    fi
    sleep 1
  done

  log "Timeout en attendant $label sur $host:$port"
  return 1
}

wait_for_http() {
  local url="$1"
  local label="$2"
  local retries="${3:-60}"
  local i

  if ! have_cmd curl; then
    log "curl introuvable; health check HTTP $label ignoré"
    return 0
  fi

  for ((i = 1; i <= retries; i++)); do
    if curl -k -fsS --max-time 2 "$url" >/dev/null; then
      log "$label prêt ($url)"
      return 0
    fi
    sleep 1
  done

  log "Timeout en attendant $label ($url)"
  return 1
}

stop_conflicting_compose_services() {
  log "Arrêt préventif des services Docker backend/frontend s'ils tournent"
  compose stop backend frontend >/dev/null 2>&1 || true
}

start_docker_dependencies() {
  log "Démarrage des dépendances Docker"
  compose --profile dev up -d "${DOCKER_SERVICES[@]}"

  wait_for_port "127.0.0.1" "5433" "PostgreSQL dev proxy"
  wait_for_port "127.0.0.1" "3002" "Kali MCP"
}

prepare_backend() {
  log "Préparation du backend (Prisma generate + migrate deploy)"
  (
    cd "$BACKEND_DIR"
    npx prisma generate >/dev/null
    npx prisma migrate deploy
  )
}

start_backend() {
  log "Démarrage du backend local sur http://localhost:3001"
  (
    cd "$BACKEND_DIR"
    export DATABASE_URL
    export MCP_KALI_ENDPOINT
    npm run dev
  ) &
  BACKEND_PID=$!
}

start_frontend() {
  log "Démarrage du frontend local sur http://localhost:3000"
  (
    cd "$FRONTEND_DIR"
    export NEXT_PUBLIC_API_BASE="http://localhost:3001"
    export NEXT_PUBLIC_WS_BASE="http://localhost:3001"
    npm run dev
  ) &
  FRONTEND_PID=$!
}

stop_pid_if_running() {
  local pid="$1"
  local label="$2"

  if [[ -n "$pid" ]] && kill -0 "$pid" >/dev/null 2>&1; then
    log "Arrêt de $label (pid $pid)"
    kill "$pid" >/dev/null 2>&1 || true
    wait "$pid" 2>/dev/null || true
  fi
}

stop_docker_dependencies() {
  log "Arrêt des dépendances Docker"
  compose stop "${DOCKER_SERVICES[@]}" >/dev/null 2>&1 || true
}

cleanup() {
  local exit_code="${1:-0}"

  if [[ "$CLEANED_UP" -eq 1 ]]; then
    return
  fi
  CLEANED_UP=1

  stop_pid_if_running "$BACKEND_PID" "backend"
  stop_pid_if_running "$FRONTEND_PID" "frontend"
  stop_docker_dependencies

  if [[ "$exit_code" -ne 0 ]]; then
    log "Sortie avec erreur ($exit_code)"
  else
    log "Arrêt propre terminé"
  fi
}

on_signal() {
  log "Signal reçu, arrêt en cours..."
  cleanup 130
  exit 130
}

wait_for_first_child_exit() {
  while true; do
    if [[ -n "$BACKEND_PID" ]] && ! kill -0 "$BACKEND_PID" >/dev/null 2>&1; then
      wait "$BACKEND_PID" 2>/dev/null
      return $?
    fi

    if [[ -n "$FRONTEND_PID" ]] && ! kill -0 "$FRONTEND_PID" >/dev/null 2>&1; then
      wait "$FRONTEND_PID" 2>/dev/null
      return $?
    fi

    sleep 1
  done
}

trap 'on_signal' INT TERM

main() {
  load_env_file
  adapt_local_database_url
  adapt_local_mcp_url

  stop_conflicting_compose_services
  start_docker_dependencies
  prepare_backend
  start_backend
  start_frontend
  local backend_health_url="http://localhost:${PORT:-3001}/health"
  if [[ "${SSL_ENABLED:-false}" = "true" ]]; then
    backend_health_url="https://localhost:${SSL_PORT:-3443}/health"
  fi
  if ! wait_for_http "$backend_health_url" "Backend"; then
    cleanup 1
    exit 1
  fi
  if ! wait_for_http "http://localhost:3000" "Frontend"; then
    cleanup 1
    exit 1
  fi

  log "Projet lancé."
  log "Frontend: http://localhost:3000"
  log "Backend : http://localhost:3001"
  log "Appuie sur Ctrl+C pour tout arrêter."

  set +e
  wait_for_first_child_exit
  local child_exit=$?
  set -e

  log "Un des processus s'est arrêté, nettoyage..."
  cleanup "$child_exit"
  exit "$child_exit"
}

main "$@"
