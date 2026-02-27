# ADR-0001 — Runtime stack & orchestration Swarm LEA2.0

- **Statut**: Accepté
- **Date**: 2026-02-27
- **Décideurs**: LEA core team
- **Contexte lié**: `doc/lea2/spec.md`, `doc/lea2/non-functional.md`

## Contexte
LEA existe déjà en architecture monolithique pragmatique:
- Frontend React 19 + shadcn + Tailwind + SSE
- Backend Fastify TypeScript
- Prisma + PostgreSQL
- Intégration MCP Kali (tools réels)
- Orchestration pentest existante (`PentestOrchestrator`)

Le besoin LEA2.0 est d’ajouter un **swarm dynamique (8–30 agents)** avec streaming live, contrôle d’exécution (pause/merge), et intégration SysReptor, **sans casser l’existant**.

## Options évaluées
1. **Nouveau microservice Swarm** (service séparé)
2. **Swarm in-process dans le backend Fastify existant**
3. **Migration complète d’orchestration vers un nouveau framework custom**

## Décision
Nous retenons **Option 2** : Swarm in-process dans le backend existant.

### Choix techniques
1. Créer `backend/src/agents/PentestSwarm.ts` pour l’orchestration multi-agents.
2. Utiliser **LangGraph.js** pour le graphe d’agents (supervisor + workers dynamiques), car:
   - proche de l’orchestrateur actuel,
   - bonne composabilité d’états,
   - bon fit avec ProviderManager + outils MCP.
3. Conserver le transport temps réel en **SSE** (pas de nouveau protocole), via endpoint dédié:
   - `GET /api/pentests/:id/swarm/stream`
4. Garder `ProviderManager` comme point unique de sélection/fallback des LLM (extension Kimi/LiteLLM possible).
5. Créer un service HTTP dédié `SysReptorService` dans le backend (pas de SDK Python imposé).
6. Ne pas introduire de nouveau service Docker pour le MVP.

## Conséquences
### Positives
- Time-to-market rapide, faible dette d’intégration.
- Réutilisation forte de l’existant (SSE, Prisma, MCP, providers).
- Moins de complexité opérationnelle (pas de microservice supplémentaire).

### Négatives / risques
- Charge supplémentaire dans le backend monolithique.
- Risque de contention si trop d’agents simultanés.
- Gestion de l’état swarm à rendre robuste (reprises/retries).

### Mitigations
- Hard limit `maxConcurrentAgents = 20`.
- Logs corrélés par `swarmRunId`.
- Séparer clairement orchestration / transport / persistance.

## Alternatives rejetées
- **Microservice dédié**: surcoût ops et coordination inter-services trop élevé pour MVP.
- **WebSocket**: SSE est déjà en place et suffisant pour le flux attendu.
- **KaibanJS**: valide, mais LangGraph est mieux aligné avec le flow actuel et les besoins de contrôle d’état.

## Plan d’implémentation découlant de cette ADR
1. Ajouter `PentestSwarm` + endpoint start/stream.
2. Brancher `PentestOrchestrator.startSwarmAudit(...)`.
3. Ajouter `SysReptorService` et mapping findings.
4. Ajouter contrôles runtime (pause/merge) + limites de concurrence.
