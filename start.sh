#!/bin/bash
# LEA AI Platform — Script de démarrage
# Usage: ./start.sh [--rebuild] [--help]

set -uo pipefail

# ── Couleurs ──────────────────────────────────────────────────────────────────
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'
CYAN='\033[0;36m'; BOLD='\033[1m'; DIM='\033[2m'; NC='\033[0m'

ok()   { echo -e "${GREEN}  ✓${NC} $*"; }
err()  { echo -e "${RED}  ✗${NC} $*" >&2; }
info() { echo -e "${CYAN}  →${NC} $*"; }
step() { echo -e "\n${BOLD}── $* ──${NC}\n"; }

# ── Config ────────────────────────────────────────────────────────────────────
export COMPOSE_PROJECT_NAME="lea"

compose() { docker compose "$@"; }

# ── Arguments ─────────────────────────────────────────────────────────────────
REBUILD=false
for arg in "$@"; do
  case $arg in
    --rebuild|-r) REBUILD=true ;;
    --help|-h)
      echo "Usage: ./start.sh [--rebuild]"
      echo "  --rebuild   Force la reconstruction des images Docker"
      exit 0 ;;
  esac
done

# ── Ctrl+C ────────────────────────────────────────────────────────────────────
cleanup() {
  echo ""
  info "Arrêt des conteneurs..."
  compose down 2>/dev/null || true
  ok "Au revoir !"
  exit 0
}
trap cleanup SIGINT SIGTERM

# ── Banner ────────────────────────────────────────────────────────────────────
echo ""
echo -e "${BOLD}╔══════════════════════════════════════════╗${NC}"
echo -e "${BOLD}║   LEA AI Platform                        ║${NC}"
echo -e "${BOLD}╚══════════════════════════════════════════╝${NC}"
echo ""

# ── 1. Docker ─────────────────────────────────────────────────────────────────
step "Docker"

if ! docker info &>/dev/null; then
  err "Docker Desktop n'est pas lancé. Démarrez-le d'abord."
  exit 1
fi
ok "Docker actif"

# ── 2. Fichier .env ───────────────────────────────────────────────────────────
if [ ! -f ".env" ]; then
  step "Configuration"
  if [ -f ".env.example" ]; then
    cp .env.example .env
    KEY=$(openssl rand -hex 32 2>/dev/null || echo "0000000000000000000000000000000000000000000000000000000000000000")
    sed -i.bak "s/CHANGE_THIS_TO_64_HEX_CHARACTERS/$KEY/g" .env && rm -f .env.bak
    ok ".env créé"
  else
    err ".env introuvable."
    exit 1
  fi
fi

# ── 3. Démarrage ──────────────────────────────────────────────────────────────
step "Démarrage"

if [ "$REBUILD" = true ]; then
  info "Reconstruction forcée des images..."
  compose build --no-cache
  ok "Images reconstruites"
fi

# Arrêt propre de l'ancien état Compose (évite les containers fantômes)
info "Nettoyage..."
# Force-remove any stale containers tracked by this project (handles ghost container IDs)
docker ps -aq --filter "label=com.docker.compose.project=lea" | xargs docker rm -f 2>/dev/null || true
compose down --remove-orphans 2>/dev/null || true

# Detect Docker daemon state corruption: containers visible in ps -a but not operable
GHOST_IDS=$(docker ps -aq 2>/dev/null)
if [ -n "$GHOST_IDS" ]; then
  CORRUPT=false
  for cid in $GHOST_IDS; do
    if ! docker inspect "$cid" &>/dev/null; then
      CORRUPT=true
      break
    fi
  done
  if [ "$CORRUPT" = true ]; then
    echo ""
    err "État du démon Docker corrompu (containers fantômes non supprimables)."
    echo -e "  ${YELLOW}→ Veuillez redémarrer Docker Desktop, puis relancer ./start.sh${NC}"
    echo ""
    exit 1
  fi
fi

info "Lancement des services..."
compose up -d --build 2>&1 | grep -v "^WARN"

# Vérifier que les containers tournent réellement
sleep 3
FAILED=""
for svc in postgres lea-kali-mcp backend frontend pgadmin; do
  container=$(compose ps -q "$svc" 2>/dev/null)
  if [ -z "$container" ]; then
    FAILED="$FAILED $svc"
    continue
  fi
  state=$(docker inspect --format='{{.State.Status}}' "$container" 2>/dev/null || echo "missing")
  if [ "$state" != "running" ]; then
    FAILED="$FAILED $svc"
  fi
done

if [ -n "$FAILED" ]; then
  err "Services non démarrés :$FAILED"
  compose ps
  exit 1
fi
ok "Services démarrés"

# ── 4. Health checks ──────────────────────────────────────────────────────────
step "Health checks"

wait_for() {
  local name="$1" svc="$2" cmd="$3" max="${4:-60}"
  local i=0
  while [ $i -lt $max ]; do
    if eval "$cmd" &>/dev/null; then
      printf "\r%60s\r" ""
      ok "$name prêt"
      return 0
    fi
    # Le container a crashé ?
    container=$(compose ps -q "$svc" 2>/dev/null)
    if [ -n "$container" ]; then
      state=$(docker inspect --format='{{.State.Status}}' "$container" 2>/dev/null || echo "absent")
      if [ "$state" = "exited" ] || [ "$state" = "dead" ]; then
        printf "\r%60s\r" ""
        err "$name a crashé !"
        compose logs --tail=20 "$svc" 2>&1 | sed "s/^/  /"
        return 1
      fi
    fi
    printf "\r  ${DIM}Attente de $name... ${i}/${max}s${NC}"
    sleep 1; i=$((i + 1))
  done
  printf "\r%60s\r" ""
  err "$name n'a pas répondu après ${max}s"
  compose logs --tail=20 "$svc" 2>&1 | sed "s/^/  /"
  return 1
}

wait_for "PostgreSQL" "postgres" \
  "compose exec -T postgres pg_isready -U lea_admin" 30 || exit 1

wait_for "Kali MCP" "lea-kali-mcp" \
  "curl -sf --max-time 2 http://localhost:3002/health" 90 || exit 1

wait_for "Backend" "backend" \
  "curl -sf --max-time 2 http://localhost:3001/health" 60 || exit 1

wait_for "Frontend" "frontend" \
  "curl -sf --max-time 2 http://localhost:3000" 60 || exit 1

# ── 5. Résumé ─────────────────────────────────────────────────────────────────
echo ""
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "  ${GREEN}✓ LEA est opérationnelle !${NC}"
echo ""
echo -e "  Frontend  →  ${BOLD}http://localhost:3000${NC}"
echo -e "  Backend   →  ${BOLD}http://localhost:3001${NC}"
echo -e "  Kali MCP  →  ${BOLD}http://localhost:3002${NC}"
echo -e "  PgAdmin   →  ${BOLD}http://localhost:5050${NC}"
echo ""
echo -e "  ${DIM}Ctrl+C pour arrêter${NC}"
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""

# ── 6. Logs ───────────────────────────────────────────────────────────────────
compose logs -f --tail=30
