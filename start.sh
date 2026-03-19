#!/bin/bash
# LEA AI Platform — Script de démarrage
# Mode DEV par défaut : Docker pour postgres + kali-mcp, npm run dev local pour backend + frontend
# Usage: ./start.sh [--prod] [--rebuild] [--help]

set -uo pipefail

# Toujours exécuter depuis le répertoire du script
cd "$(dirname "$0")"

# ── Couleurs ──────────────────────────────────────────────────────────────────
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'
CYAN='\033[0;36m'; BLUE='\033[0;34m'; MAGENTA='\033[0;35m'; BOLD='\033[1m'; DIM='\033[2m'; NC='\033[0m'

ok()    { printf "${GREEN}✓${NC} %s\n" "$*"; }
err()   { printf "${RED}✗${NC} %s\n" "$*" >&2; }
info()  { printf "${CYAN}→${NC} %s\n" "$*"; }
step()  { printf "${DIM}⏳ %s...${NC}\n" "$*"; }   # "wait" est un builtin bash réservé
warn()  { printf "${YELLOW}⚠${NC} %s\n" "$*"; }
rebuild_msg() { printf "${MAGENTA}↻${NC} %s\n" "$*"; }

# ── Pids des process locaux ───────────────────────────────────────────────────
BACKEND_PID=""
FRONTEND_PID=""

# ── Arguments ─────────────────────────────────────────────────────────────────
MODE="dev"      # dev | prod
REBUILD=false
for arg in "$@"; do
  case $arg in
    --prod|-p)     MODE="prod" ;;
    --rebuild|-r)  REBUILD=true ;;
    --help|-h)
      echo "Usage: ./start.sh [--prod] [--rebuild]"
      echo ""
      echo "  (défaut)    Mode DEV — infra Docker, backend+frontend en npm run dev"
      echo "  --prod      Mode PROD — tout en Docker (rebuild image si --rebuild)"
      echo "  --rebuild   Force rebuild des images Docker (mode prod uniquement)"
      exit 0 ;;
  esac
done

# ── Cleanup ───────────────────────────────────────────────────────────────────
cleanup() {
  printf "\n${DIM}Arrêt des services...${NC}\n"
  # Tuer les process locaux si mode dev
  [ -n "$BACKEND_PID" ]  && kill "$BACKEND_PID"  2>/dev/null || true
  [ -n "$FRONTEND_PID" ] && kill "$FRONTEND_PID" 2>/dev/null || true
  # Arrêt Docker
  if [ "$MODE" = "prod" ]; then
    docker compose down 2>/dev/null || true
  else
    docker compose stop postgres lea-kali-mcp 2>/dev/null || true
  fi
  printf "${GREEN}✓${NC} Services arrêtés. Au revoir !\n"
  exit 0
}
trap cleanup SIGINT SIGTERM EXIT

# ── Banner ────────────────────────────────────────────────────────────────────
printf "\n${BOLD}${BLUE}╔══════════════════════════════════════════╗${NC}\n"
printf "${BOLD}${BLUE}║   🛡️  LEA AI Platform                     ║${NC}\n"
if [ "$MODE" = "dev" ]; then
  printf "${BOLD}${BLUE}║   %-40s ║${NC}\n" "mode DEV — hot-reload actif"
else
  printf "${BOLD}${BLUE}║   %-40s ║${NC}\n" "mode PROD — images Docker"
fi
printf "${BOLD}${BLUE}╚══════════════════════════════════════════╝${NC}\n\n"

# ── 1. Docker ─────────────────────────────────────────────────────────────────
step "Vérification Docker"
if ! docker info &>/dev/null; then
  err "Docker Desktop n'est pas lancé"
  exit 1
fi
ok "Docker actif"

# ── 2. Fichier .env ───────────────────────────────────────────────────────────
if [ ! -f ".env" ]; then
  step "Création .env depuis .env.example"
  if [ -f ".env.example" ]; then
    cp .env.example .env
    KEY=$(openssl rand -hex 32 2>/dev/null || echo "0000000000000000000000000000000000000000000000000000000000000000")
    sed -i.bak "s/CHANGE_THIS_TO_64_HEX_CHARACTERS/$KEY/g" .env && rm -f .env.bak
    ok ".env créé avec clé générée"
  else
    err ".env.example introuvable — créer .env manuellement et relancer"
    exit 1
  fi
fi

# ── 3. Charger .env pour les process locaux ───────────────────────────────────
set -a
# shellcheck disable=SC1091
[ -f ".env" ] && source .env
set +a

# ── Helper : health check avec retry ─────────────────────────────────────────
wait_for() {
  local name="$1" cmd="$2" max="${3:-60}"
  local i=0
  step "$name"
  while [ "$i" -lt "$max" ]; do
    if eval "$cmd" &>/dev/null; then
      ok "$name prêt"
      return 0
    fi
    sleep 1; i=$((i + 1))
  done
  err "$name timeout après ${max}s"
  return 1
}

# ── Migrations Prisma ─────────────────────────────────────────────────────────
run_migrations() {
  step "Migrations Prisma"
  if (cd backend && npx prisma migrate deploy 2>&1); then
    ok "Migrations appliquées"
  else
    info "Migrations : base déjà à jour ou pas de migration en attente"
  fi
}

# ══════════════════════════════════════════════════════════════════════════════
# MODE DEV — infra Docker, app en local
# ══════════════════════════════════════════════════════════════════════════════
if [ "$MODE" = "dev" ]; then

  # ── Dépendances node ────────────────────────────────────────────────────────
  if [ ! -d "backend/node_modules" ]; then
    step "Installation dépendances backend"
    (cd backend && npm install --silent) && ok "backend node_modules prêt"
  fi
  if [ ! -d "lea-app/node_modules" ]; then
    step "Installation dépendances frontend"
    (cd lea-app && npm install --silent) && ok "lea-app node_modules prêt"
  fi

  # ── Démarrage infra Docker (postgres + kali-mcp seulement) ─────────────────
  step "Démarrage infra Docker (postgres + kali-mcp)"
  if ! docker compose up -d postgres lea-kali-mcp; then
    err "Échec du démarrage de l'infra Docker"
    exit 1
  fi

  wait_for "PostgreSQL" "docker compose exec -T postgres pg_isready -U ${POSTGRES_USER:-lea_admin}" 30 || exit 1
  run_migrations
  wait_for "Kali MCP" "curl -sf --max-time 2 http://localhost:3002/health" 90 || exit 1

  # ── Backend local ────────────────────────────────────────────────────────────
  step "Démarrage backend (npm run dev)"
  (cd backend && npm run dev > ../logs/backend-dev.log 2>&1) &
  BACKEND_PID=$!
  wait_for "Backend API" "curl -sf --max-time 2 http://localhost:3001/health" 60 || {
    err "Backend n'a pas démarré — voir logs/backend-dev.log"
    exit 1
  }

  # ── Frontend local ───────────────────────────────────────────────────────────
  step "Démarrage frontend (npm run dev)"
  (cd lea-app && npm run dev > ../logs/frontend-dev.log 2>&1) &
  FRONTEND_PID=$!
  wait_for "Frontend" "curl -sf --max-time 2 http://localhost:3000" 90 || {
    err "Frontend n'a pas démarré — voir logs/frontend-dev.log"
    exit 1
  }

# ══════════════════════════════════════════════════════════════════════════════
# MODE PROD — tout en Docker
# ══════════════════════════════════════════════════════════════════════════════
else

  if [ "$REBUILD" = true ]; then
    rebuild_msg "Rebuild des images Docker..."
    if ! docker compose build --no-cache backend frontend; then
      err "Échec du build"
      exit 1
    fi
    ok "Images reconstruites"
  fi

  step "Arrêt des containers existants"
  EXISTING=$(docker ps -aq --filter "label=com.docker.compose.project=lea" 2>/dev/null || true)
  if [ -n "$EXISTING" ]; then
    # shellcheck disable=SC2086
    docker stop $EXISTING 2>/dev/null || true
  fi

  step "Lancement de tous les services"
  if ! docker compose up -d; then
    err "Échec du lancement — vérifier docker-compose.yml"
    exit 1
  fi
  sleep 2

  wait_for "PostgreSQL" "docker compose exec -T postgres pg_isready -U ${POSTGRES_USER:-lea_admin}" 30 || exit 1
  run_migrations
  wait_for "Kali MCP"  "curl -sf --max-time 2 http://localhost:3002/health" 90 || exit 1
  wait_for "Backend"   "curl -sf --max-time 2 http://localhost:3001/health"  60 || exit 1
  wait_for "Frontend"  "curl -sf --max-time 2 http://localhost:3000"          60 || exit 1

fi

# ── Résumé ─────────────────────────────────────────────────────────────────────
printf "\n${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}\n"
printf "  ${GREEN}✓ LEA est opérationnelle !${NC}\n\n"
printf "  ${BOLD}Frontend${NC}   http://localhost:3000\n"
printf "  ${BOLD}Backend${NC}    http://localhost:3001\n"
printf "  ${BOLD}Kali MCP${NC}   http://localhost:3002\n"
printf "  ${BOLD}PgAdmin${NC}    http://localhost:5050\n"
if [ "$MODE" = "dev" ]; then
  printf "\n  ${DIM}Logs : logs/backend-dev.log | logs/frontend-dev.log${NC}\n"
fi
printf "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}\n"

# ── Menu interactif ────────────────────────────────────────────────────────────
show_menu() {
  printf "\n${BOLD}Que souhaitez-vous faire ?${NC}\n"
  if [ "$MODE" = "dev" ]; then
    printf "  ${MAGENTA}[r]${NC} Redémarrer backend local\n"
    printf "  ${MAGENTA}[f]${NC} Redémarrer frontend local\n"
    printf "  ${MAGENTA}[m]${NC} Appliquer les migrations Prisma\n"
    printf "  ${MAGENTA}[lb]${NC} Logs backend\n"
    printf "  ${MAGENTA}[lf]${NC} Logs frontend\n"
    printf "  ${MAGENTA}[ld]${NC} Logs Docker (infra)\n"
  else
    printf "  ${MAGENTA}[1]${NC} Rebuild frontend\n"
    printf "  ${MAGENTA}[2]${NC} Rebuild backend\n"
    printf "  ${MAGENTA}[3]${NC} Rebuild les deux\n"
    printf "  ${MAGENTA}[m]${NC} Appliquer les migrations Prisma\n"
    printf "  ${MAGENTA}[l]${NC} Voir les logs\n"
  fi
  printf "  ${MAGENTA}[s]${NC} Status containers\n"
  printf "  ${MAGENTA}[q]${NC} Quitter\n"
  printf "\nChoix : "
}

restart_backend_local() {
  [ -n "$BACKEND_PID" ] && kill "$BACKEND_PID" 2>/dev/null || true
  step "Redémarrage backend"
  (cd backend && npm run dev > ../logs/backend-dev.log 2>&1) &
  BACKEND_PID=$!
  wait_for "Backend API" "curl -sf --max-time 2 http://localhost:3001/health" 60
}

restart_frontend_local() {
  [ -n "$FRONTEND_PID" ] && kill "$FRONTEND_PID" 2>/dev/null || true
  step "Redémarrage frontend"
  (cd lea-app && npm run dev > ../logs/frontend-dev.log 2>&1) &
  FRONTEND_PID=$!
  wait_for "Frontend" "curl -sf --max-time 2 http://localhost:3000" 90
}

rebuild_frontend_docker() {
  rebuild_msg "Rebuild frontend Docker..."
  docker compose build --no-cache frontend && \
  docker compose up -d --no-deps --force-recreate frontend && \
  ok "Frontend rebuildé"
}

rebuild_backend_docker() {
  rebuild_msg "Rebuild backend Docker..."
  docker compose build --no-cache backend && \
  docker compose up -d --no-deps --force-recreate backend && \
  ok "Backend rebuildé"
}

while true; do
  show_menu
  read -r choice

  case "$choice" in
    # Mode dev
    r|R) [ "$MODE" = "dev" ] && restart_backend_local  || err "Option disponible en mode dev seulement" ;;
    f|F) [ "$MODE" = "dev" ] && restart_frontend_local || err "Option disponible en mode dev seulement" ;;
    lb)
      printf "\n${CYAN}→ Logs backend (Ctrl+C pour revenir)${NC}\n"
      tail -f logs/backend-dev.log 2>/dev/null || err "Fichier introuvable"
      ;;
    lf)
      printf "\n${CYAN}→ Logs frontend (Ctrl+C pour revenir)${NC}\n"
      tail -f logs/frontend-dev.log 2>/dev/null || err "Fichier introuvable"
      ;;
    ld)
      printf "\n${CYAN}→ Logs Docker infra (Ctrl+C pour revenir)${NC}\n"
      docker compose logs -f --tail=50 postgres lea-kali-mcp 2>&1
      ;;
    # Mode prod
    1) [ "$MODE" = "prod" ] && rebuild_frontend_docker || err "Option disponible en mode prod seulement" ;;
    2) [ "$MODE" = "prod" ] && rebuild_backend_docker  || err "Option disponible en mode prod seulement" ;;
    3) [ "$MODE" = "prod" ] && { rebuild_frontend_docker && rebuild_backend_docker; } || err "Option disponible en mode prod seulement" ;;
    l|L) [ "$MODE" = "prod" ] && docker compose logs -f --tail=50 2>&1 || err "Option disponible en mode prod seulement" ;;
    # Commun
    m|M) run_migrations ;;
    s|S)
      printf "\n${CYAN}Containers Docker :${NC}\n"
      docker compose ps
      if [ "$MODE" = "dev" ]; then
        printf "\n${CYAN}Process locaux :${NC}\n"
        [ -n "$BACKEND_PID" ]  && printf "  Backend  PID=${BACKEND_PID}\n"  || printf "  Backend  ${RED}arrêté${NC}\n"
        [ -n "$FRONTEND_PID" ] && printf "  Frontend PID=${FRONTEND_PID}\n" || printf "  Frontend ${RED}arrêté${NC}\n"
      fi
      ;;
    q|Q|quit|exit)
      trap - EXIT   # évite double-cleanup sur exit normal
      cleanup
      ;;
    *) err "Choix invalide" ;;
  esac
done
