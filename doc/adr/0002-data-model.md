# ADR-0002 — Modele de donnees Swarm & SysReptor

- **Statut**: Accepte (etat transitoire MVP)
- **Date**: 2026-02-27
- **Decideurs**: LEA core team
- **Contexte lie**: `backend/prisma/schema.prisma`, `doc/lea2/spec.md`

## Contexte
L'ADR initiale visait des tables Swarm dediees. Le code actuellement deploye privilegie une approche transitoire:
- runtime Swarm en memoire,
- persistance des traces dans les tables metier deja existantes,
- export report/PDF via modele `Report`.

## Decision appliquee actuellement (MVP)
Utiliser un **modele hybride minimal**:
1. etat d'execution Swarm en memoire (`PentestSwarm`),
2. persistance des traces et resultats dans les tables existantes Prisma.

## Etat reel implemente (schema + code)
1. Tables Prisma effectivement utilisees par le Swarm:
- `Pentest`
- `Finding`
- `ToolExecution`
- `PentestEvent`
- `Report` / `ExportJob`

2. Ecriture des findings Swarm:
- `PentestSwarm` cree des `Finding` avec metadata:
  - `source: "dynamic_swarm"`
  - `swarmRunId`
  - `agentId`
  - `agentRole`

3. Historisation de run:
- Evenements stockes dans `PentestEvent`:
  - `swarm_run_queued`
  - `swarm_supervisor_plan`
  - `swarm_run_paused`
  - `swarm_run_resumed`
  - `swarm_run_force_merge_requested`
  - `swarm_run_merging`
  - `swarm_run_completed`
  - `swarm_run_failed`

4. Tracabilite outils:
- `ToolExecution` est alimente avec `agent_role = "swarm:<role>"`.

5. Export PDF:
- Export via `Report` + `ExportService` (pdf-lib),
- endpoint Swarm PDF (`/api/pentests/:id/swarm/report.pdf`) base sur le `sysReptorProjectId` present dans les `PentestEvent`.

## Planned / non implemente dans cette version
1. Entites dediees absentes du schema actuel:
- `SwarmRun`
- `SwarmAgent`
- `SysReptorProjectLink`

2. Indexation dediee Swarm:
- Pas d'index `SwarmRun(status)` ou `SwarmAgent(swarm_run_id, status)` tant que ces tables n'existent pas.

3. Reprise durable apres restart:
- Non garantie tant que le runtime reste en memoire.

## Consequences
### Positives
- Zero migration supplementaire pour livrer le MVP.
- Reutilisation immediate des flux de reporting existants.
- Debogage facilite via `PentestEvent` et `ToolExecution`.

### Limites
- Pas de source de verite relationnelle dediee pour l'etat vivant des agents.
- Historique de run moins structurable qu'avec des tables `SwarmRun/SwarmAgent`.

## Plan de suite
1. Introduire migration Prisma avec `SwarmRun`, `SwarmAgent`, `SysReptorProjectLink`.
2. Conserver `Finding` comme verite applicative, mais referencer explicitement `swarm_run_id`.
3. Basculer les endpoints state/history sur persistance durable au lieu du runtime memoire seul.
