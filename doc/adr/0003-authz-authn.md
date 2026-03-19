# ADR-0003 — AuthN/AuthZ pour Swarm & outils sensibles

- **Statut**: Accepte (MVP en mode trusted, hardening planifie)
- **Date**: 2026-02-27
- **Decideurs**: LEA core team
- **Contexte lie**: `doc/lea2/non-functional.md`, `backend/src/services/mcp/*`, `backend/src/routes/swarm.ts`

## Contexte
Les actions Swarm sont sensibles (execution outils, pause/resume/merge, push SysReptor, export PDF).  
L'ADR initiale decrivait un MVP protege par token + garde-fous operationnels.

## Etat reel implemente (code au 2026-02-27)
1. Secrets cote backend:
- Les cles providers restent cote serveur (`ProviderManager`, chiffrement via `CryptoService`).
- Aucune cle sensible exposee par les routes swarm.

2. Controle scope outillage:
- `KaliMCPClient` applique des verifications de scope (allow/deny/pending) avant execution outil.
- Les commandes hors scope peuvent etre bloquees avec raison explicite.

3. Traçabilite technique:
- Les executions outils swarm sont journalisees dans `ToolExecution`.
- Le contexte acteur (`swarm:<role>`) est propage vers les executions MCP.

## Ecarts par rapport au plan initial (non implemente)
1. Middleware AuthN API non applique:
- Les routes critiques (`/swarm/start`, `/swarm/pause`, `/swarm/resume`, `/swarm/force-merge`) ne sont pas protegees par `Authorization: Bearer`.
- `LEA_API_TOKEN` n'est pas enforce sur ces routes dans la version actuelle.

2. AuthZ role-based non applique:
- Pas de roles `operator/reviewer/system_agent` verifies server-side.

3. Workflow d'approbation outil sensible absent:
- Pas d'evenement `tool_approval_required`,
- pas d'endpoint d'approbation/refus avant execution.

4. Audit securite decisionnel incomplet:
- Pas de journalisation standardisee `decision=APPROVED|DENIED|AUTO_BLOCKED` pour les outils sensibles.

## Decision operationnelle
Maintenir temporairement un mode MVP en environnement controle, puis appliquer le hardening par phases.

## Plan de hardening (prochaines etapes)
1. Ajouter un middleware AuthN pour toutes les routes swarm d'ecriture.
2. Introduire une couche AuthZ minimale (roles logiques) sur actions critiques.
3. Ajouter le flux `tool_approval_required` + endpoints d'approbation.
4. Etendre `KaliAuditLog` avec trace complete des decisions de securite.

## Risques residuels
- En l'etat, exposition trop large si deploie hors environnement maitrise.
- Absence d'approbation explicite pour certaines actions potentiellement impactantes.
