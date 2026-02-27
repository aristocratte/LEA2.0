# ADR-0002 — Modèle de données Swarm & SysReptor

- **Statut**: Accepté
- **Date**: 2026-02-27
- **Décideurs**: LEA core team
- **Contexte lié**: `backend/prisma/schema.prisma`, `doc/lea2/spec.md`

## Contexte
Le schéma Prisma actuel contient déjà des briques solides:
- `Pentest` (session principale)
- `Finding` (vulnérabilités)
- `ToolExecution`, `KaliAuditLog` (traçabilité outils)
- `PentestEvent` (event log)
- `Report`, `ExportJob`

Pour le Swarm MVP, il faut persister:
1. l’exécution d’un run multi-agents,
2. l’état des agents,
3. la liaison avec SysReptor,
4. la traçabilité live et historique.

## Options évaluées
1. Tout stocker dans `Pentest.config` JSON (faible migration, forte dette)
2. Ajouter tables Swarm dédiées + réutiliser tables métier existantes
3. Créer un event-store séparé complet

## Décision
Nous retenons **Option 2**: tables Swarm dédiées **minimales** + réutilisation maximale des modèles existants.

## Modèle retenu

### 1) Nouvelles entités

#### `SwarmRun`
- 1..N par `Pentest`
- champs clés:
  - `id`
  - `pentest_id`
  - `status` (`QUEUED|RUNNING|PAUSED|MERGING|COMPLETED|FAILED|PARTIAL_COMPLETED`)
  - `config` (JSON)
  - `started_at`, `ended_at`, `paused_at`
  - `agents_spawned_count`, `findings_count`
  - `force_merged` (bool)

#### `SwarmAgent`
- N..1 vers `SwarmRun`
- champs clés:
  - `id`
  - `swarm_run_id`
  - `name`, `role`
  - `status` (`SPAWNED|THINKING|RUNNING_TOOL|IDLE|DONE|FAILED`)
  - `progress` (0..100)
  - `last_event_at`
  - `metadata` (JSON)

#### `SysReptorProjectLink`
- 1..N par `Pentest` (ou 1..1 selon usage)
- champs clés:
  - `id`
  - `pentest_id`
  - `swarm_run_id` (nullable)
  - `sysreptor_project_id`
  - `sysreptor_project_type_id`
  - `linked_at`
  - `last_sync_at`

### 2) Réutilisation des entités existantes
- `Finding` reste la **source de vérité** applicative.
  - Les findings swarm sont taggés via `metadata` (`source: "swarm"`, `swarmRunId`, `agentId`).
- `PentestEvent` reste le journal événementiel principal pour l’historique UI (`Swarm History`).
- `KaliAuditLog` journalise les actions outils (actor = `swarm:<agentRole>`).

## Indexation minimale recommandée
- `SwarmRun(pentest_id, created_at)`
- `SwarmRun(status)`
- `SwarmAgent(swarm_run_id, status)`
- `SysReptorProjectLink(pentest_id)`
- Contrainte unicité optionnelle sur (`pentest_id`, `sysreptor_project_id`)

## Conséquences
### Positives
- Historique swarm exploitable sans refonte.
- Compatible avec le modèle de reporting déjà présent.
- Permet la vue live + history sans surcharger `Pentest.config`.

### Négatives / risques
- Migration Prisma additionnelle.
- Gestion de cohérence inter-table lors des fins de run.

### Mitigations
- Transactions Prisma sur étapes critiques (merge final + sync SysReptor).
- Idempotence logique côté push SysReptor (clé par finding/swarmRun).

## Alternatives rejetées
- **Stockage full JSON dans `Pentest.config`**: rapide mais non maintenable et peu requêtable.
- **Event store séparé**: trop complexe pour MVP.

## Plan d’implémentation découlant de cette ADR
1. Créer migration Prisma pour `SwarmRun`, `SwarmAgent`, `SysReptorProjectLink`.
2. Étendre les types backend (`Swarm`, `Agent`, `SysReptorFinding`).
3. Brancher persistance dans `startSwarmAudit` + stream SSE.
