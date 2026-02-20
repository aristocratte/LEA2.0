#!/bin/bash
# LEA AI Platform — Arrêt des services
# IMPORTANT : utiliser UNIQUEMENT `docker compose down` pour éviter
# la création de containers fantômes dans Docker Desktop.

set -e

RED='\033[0;31m'; GREEN='\033[0;32m'; CYAN='\033[0;36m'
BOLD='\033[1m'; NC='\033[0m'

ok()   { echo -e "${GREEN}  ✓${NC} $*"; }
info() { echo -e "${CYAN}  →${NC} $*"; }

# Même nom de projet que start.sh
export COMPOSE_PROJECT_NAME="lea"

echo ""
echo -e "${BOLD}╔══════════════════════════════════════════╗${NC}"
echo -e "${BOLD}║   LEA AI Platform - Arrêt                ║${NC}"
echo -e "${BOLD}╚══════════════════════════════════════════╝${NC}"
echo ""

# Arrêt via Docker Compose (la seule bonne méthode)
if docker info &>/dev/null 2>&1; then
  info "Arrêt des services Docker..."
  docker compose down --remove-orphans 2>/dev/null || true

  # Supprimer les containers résiduels/fantômes du projet
  RESIDUAL=$(docker ps -aq --filter "label=com.docker.compose.project=lea" 2>/dev/null)
  if [ -n "$RESIDUAL" ]; then
    info "Nettoyage des containers résiduels..."
    echo "$RESIDUAL" | xargs docker rm -f 2>/dev/null || true
  fi

  # Supprimer le réseau s'il persiste
  docker network rm lea-network 2>/dev/null || true

  ok "Services arrêtés"
else
  ok "Docker n'est pas actif, rien à arrêter"
fi

# Nettoyer les processus locaux éventuels
for pidfile in logs/backend.pid logs/frontend.pid; do
  if [ -f "$pidfile" ]; then
    PID=$(cat "$pidfile")
    if kill -0 "$PID" 2>/dev/null; then
      info "Arrêt du processus local (PID: $PID)..."
      kill "$PID" 2>/dev/null || true
    fi
    rm -f "$pidfile"
  fi
done

echo ""
ok "Tous les services sont arrêtés"
echo ""
