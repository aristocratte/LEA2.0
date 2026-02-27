# LEA2.0 — Spécification exécutable Swarm Pentest (MVP)

## 1) Objectif produit
Ajouter un **Agent Swarm dynamique** à LEA2.0 pour exécuter un audit pentest multi-agents (8–30 agents), afficher les résultats en live dans l'UI, puis pousser automatiquement les findings dans SysReptor avec génération de PDF.

## 2) Périmètre MVP (in)
- Déclenchement du swarm depuis `/pentests/[id]`.
- Flux live via SSE (`/api/pentests/:id/swarm/stream`).
- Vue live agents + timeline d’événements.
- Tableau findings live triable (severity, CVSS) + action **Edit before push**.
- Contrôles run: **Pause Swarm** et **Force Merge**.
- Push automatique findings vers SysReptor.
- Création projet SysReptor + notification UI.
- Preview PDF SysReptor avant téléchargement.
- Tab **Swarm History** dans le détail d’un pentest.

## 3) Hors périmètre MVP (out)
- Mode “Debate” inter-agents.
- Templates custom de swarm.
- Export intégral de log swarm vers SysReptor.
- Nouveau service infra dédié (pas de microservice supplémentaire).

## 4) User stories + critères d’acceptation

### US-01 — Lancer un swarm depuis un pentest
**En tant que** pentester, **je veux** lancer un swarm depuis la page pentest **afin de** démarrer l’analyse multi-agents.

**Critères d’acceptation**
1. Le bouton **Lancer Agent Swarm** est visible à côté de **Start Pentest**.
2. Au clic, l’API `POST /api/pentests/:id/swarm/start` répond 2xx avec `swarmRunId`.
3. La vue `AgentSwarmLiveView` s’ouvre automatiquement.
4. L’état du run passe à `running` côté UI en < 2s (p95).

### US-02 — Observer les agents en temps réel
**En tant que** pentester, **je veux** voir les agents spawnés et leurs actions en live **afin de** comprendre la progression.

**Critères d’acceptation**
1. Au moins 5 agents apparaissent pour un scope simple (1 URL).
2. Chaque agent affiche `name`, `role`, `status`, `% progress`.
3. Animation framer-motion visible au spawn (“pop”).
4. Typing indicator affiché pour les agents en `thinking`.
5. Les événements SSE sont rendus en ordre temporel dans une timeline.

### US-03 — Consulter/éditer les findings live
**En tant que** pentester, **je veux** trier et éditer les findings avant push **afin de** garder le contrôle qualité.

**Critères d’acceptation**
1. `SwarmFindingsTable` affiche `severity`, `cvss`, `title`, `status`, `agent`.
2. Tri asc/desc disponible sur severity et CVSS.
3. Severity colorée: Critique/High (rouge), Medium (jaune), Low/Info (vert).
4. Action **Edit before push** ouvre une édition rapide avant envoi SysReptor.

### US-04 — Contrôler l’exécution swarm
**En tant que** pentester, **je veux** pouvoir suspendre/forcer la fusion **afin de** piloter l’exécution.

**Critères d’acceptation**
1. Bouton **Pause Swarm** disponible pendant `running`.
2. Bouton **Force Merge** disponible pendant `running|paused`.
3. `Force Merge` déclenche la consolidation immédiate des findings en cours.
4. Les transitions d’état sont reflétées en live via SSE.

### US-05 — Intégration SysReptor complète
**En tant que** pentester, **je veux** pousser automatiquement les findings dans SysReptor et générer un PDF **afin de** produire un livrable exploitable.

**Critères d’acceptation**
1. À la fin du run, un projet SysReptor est créé (ou lié) automatiquement.
2. Les findings sont pushés au format attendu (title, description, severity, cvss, proof, remediation, affected_components).
3. Un toast affiche: **"Projet SysReptor créé avec X findings"**.
4. Le PDF est prévisualisable puis téléchargeable depuis l’UI.

### US-06 — Historiser les runs
**En tant que** pentester, **je veux** retrouver les exécutions précédentes **afin de** comparer et auditer.

**Critères d’acceptation**
1. Une tab **Swarm History** est disponible dans le détail pentest.
2. Chaque run affiche: date, durée, nb agents, nb findings, statut final.
3. Un run historique peut être rouvert en lecture seule.

### US-07 — Sécurité des outils MCP
**En tant que** responsable sécurité, **je veux** empêcher toute exécution non confirmée de tool sensible **afin de** limiter les risques.

**Critères d’acceptation**
1. Aucun tool MCP sensible n’est exécuté sans confirmation explicite.
2. Les appels tools sont journalisés avec `who/when/what/result`.
3. Le mode sandbox actuel reste inchangé.

## 5) Contrats API minimum (MVP)
- `POST /api/pentests/:id/swarm/start`
  - request: `{ task?: string, scope?: string[] }`
  - response: `{ swarmRunId: string, status: "running" }`
- `GET /api/pentests/:id/swarm/stream` (SSE)
  - events: `swarm_started`, `agent_spawned`, `agent_status`, `finding_created`, `finding_updated`, `swarm_paused`, `swarm_merged`, `swarm_completed`, `swarm_failed`
- `POST /api/pentests/:id/swarm/pause`
- `POST /api/pentests/:id/swarm/force-merge`

## 6) State machine run
`queued -> running -> paused -> running -> merging -> completed`

États d’erreur:
- `failed` (erreur non récupérable)
- `partial_completed` (run terminé avec findings partiels)

## 7) Définition de Done (MVP)
1. Flow complet: scope -> launch swarm -> live agents -> findings -> push SysReptor -> projet créé -> PDF preview/download.
2. E2E critique vert sur CI locale/projet.
3. Aucun tool MCP sensible sans confirmation explicite.
4. Limite de concurrence agents appliquée (max 20 simultanés).
5. Aucune régression sur Start Pentest existant.
