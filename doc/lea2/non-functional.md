# LEA2.0 — Exigences non-fonctionnelles (Swarm MVP)

## 1) Performance

### 1.1 Budgets API (cible p95)
- `POST /api/pentests/:id/swarm/start`: **<= 2s**
- 1er événement SSE après start: **<= 1.5s**
- émission événement SSE backend -> réception frontend: **<= 700ms**
- action `Pause Swarm` / `Force Merge`: ACK API **<= 1s**

### 1.2 UI/UX
- rendu d’un nouvel agent après `agent_spawned`: **<= 300ms** côté client.
- fluidité animation (spawn/typing): **~60fps** sur machine dev standard.

### 1.3 Concurrence
- max agents simultanés: **20** (hard limit).
- au-delà: mise en file interne, pas de crash.

## 2) Fiabilité
- Un `swarmRunId` unique par exécution.
- Résilience SSE: reconnexion client sans perte critique d’état (replay minimal conseillé).
- `Force Merge` doit toujours produire un état terminal (`completed`, `partial_completed` ou `failed`) en < 60s.

## 3) Sécurité
- Tous les tools MCP restent dans la sandbox existante.
- Aucun tool sensible sans confirmation explicite utilisateur.
- Logs d’audit obligatoires pour actions swarm et outils MCP:
  - `timestamp`, `pentestId`, `swarmRunId`, `agentId`, `tool`, `inputHash`, `result`, `actor`.
- Secrets SysReptor/Kimi uniquement via variables d’environnement backend.
- Pas d’exposition de token secret côté frontend.

## 4) Observabilité
- Logs structurés JSON avec `correlationId` et `swarmRunId`.
- Métriques minimales:
  - nombre d’agents actifs
  - latence moyenne des tools
  - findings/min
  - taux d’erreur run
  - durée moyenne run
- Événements critiques tracés: start/pause/merge/completed/failed/push-report.

## 5) Disponibilité / SLO
- SLO disponibilité endpoint swarm (start + stream): **99.5%** en environnement cible MVP.
- Taux de run non terminés (`failed` + timeout) < **5%** sur runs de test internes.

## 6) Intégrité des données
- Un finding ne doit pas être dupliqué dans SysReptor sur retry (idempotence recommandée via clé logique).
- Historique swarm conservé et consultable dans l’onglet `Swarm History`.

## 7) RTO / RPO (MVP pragmatique)
- **RTO** (restauration service swarm): <= **30 min**
- **RPO** (perte acceptable données run): <= **5 min**

## 8) Qualité & tests minimaux requis
- Backend:
  - `spawn >=5 agents` (scope simple)
  - validation format finding SysReptor
  - création projet SysReptor en fin de run
- Frontend E2E:
  - lancement swarm
  - apparition agents live
  - findings live visibles et triables
  - push SysReptor + preview/download PDF
- Sécurité:
  - test “tool MCP sensible sans confirmation” doit échouer (bloqué par policy)

## 9) Critères Go/No-Go MVP
**Go** seulement si:
1. Flow bout-en-bout démontré sans blocant.
2. Budgets p95 API critiques respectés sur jeu de test cible.
3. Limite 20 agents validée sans instabilité.
4. Logs d’audit swarm persistés.
5. Aucune fuite de secret dans UI/logs publics.
