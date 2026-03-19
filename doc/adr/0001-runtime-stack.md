# ADR-0001 — Runtime stack & orchestration Swarm LEA2.0

- **Statut**: Accepte (MVP implemente, hardening en cours)
- **Date**: 2026-02-27
- **Decideurs**: LEA core team
- **Contexte lie**: `doc/lea2/spec.md`, `doc/lea2/non-functional.md`

## Contexte
LEA2.0 doit ajouter un swarm dynamique (8 a 30 agents) sans casser l'architecture existante:
- backend Fastify TypeScript deja en place,
- streaming temps reel deja base sur SSE,
- persistance principale via Prisma/PostgreSQL,
- outillage Kali/MCP deja integre.

## Decision retenue
Le swarm reste **in-process dans le backend Fastify existant**.

## Etat reel implemente (code au 2026-02-27)
1. Orchestration:
- `backend/src/agents/PentestSwarm.ts` orchestre les runs en memoire (runtime + history), avec limites:
  - `maxAgents`: 8..30,
  - `maxConcurrentAgents`: 1..20.
- Execution concurrente via workers internes (pas de microservice dedie).

2. API Fastify:
- Routes exposees dans `backend/src/routes/swarm.ts`:
  - `POST /api/pentests/:id/swarm/start`
  - `GET /api/pentests/:id/swarm/state`
  - `GET /api/pentests/:id/swarm/history`
  - `POST /api/pentests/:id/swarm/pause`
  - `POST /api/pentests/:id/swarm/resume`
  - `POST /api/pentests/:id/swarm/force-merge`
  - `GET /api/pentests/:id/swarm/report.pdf`
  - `GET /api/pentests/:id/swarm/stream`

3. Streaming:
- SSE conserve comme transport unique via `SSEManager` (register/unregister, replay avec Last-Event-ID, heartbeat, queue TTL).
- Evenements swarm emis: `swarm_started`, `agent_spawned`, `agent_status`, `finding_created`, `complete`, `swarm_completed`.

4. Providers et outils:
- `ProviderManager` reste le point unique de selection/fallback providers.
- `PentestOrchestrator.executeSwarmTool(...)` centralise l'execution outil swarm.
- Fallback MCP via `kaliMcpClient.callTool(...)` avec contexte acteur/scope.

5. SysReptor:
- Push des findings tente en fin de run (`finalizeRun`) via `SysReptorService`.
- En cas d'echecs partiels de push, le run continue (gestion `Promise.allSettled`).

## Planned / non implemente dans cette version
1. **LangGraph.js**:
- Planifie initialement, mais l'implementation actuelle est une orchestration custom interne.

2. **Persistance runtime Swarm dediee**:
- Pas encore de tables `SwarmRun` / `SwarmAgent` / `SysReptorProjectLink` dans Prisma.

3. **Service Swarm separe**:
- Non retenu pour le MVP.

4. **AuthN/AuthZ forte sur routes Swarm**:
- Hardening prevu dans ADR-0003, pas encore applique de bout en bout.

## Consequences
### Positives
- Time-to-market rapide.
- Forte reutilisation des briques existantes (Fastify, SSE, Prisma, ProviderManager, MCP).
- Surface de changement backend contenue.

### Risques
- Etat runtime swarm en memoire (resilience limitee en cas de restart process).
- Charge potentielle sur le backend monolithique si multiplication des runs simultanes.

### Mitigations en place
- Bornes strictes sur le nombre d'agents et la concurrence.
- Journalisation evenementielle dans `PentestEvent`.
- Tolerance aux erreurs partielles sur push SysReptor.

## Plan de suite
1. Introduire la persistance Swarm dediee (ADR-0002).
2. Ajouter auth middleware + approbation outils sensibles (ADR-0003).
3. Evaluer l'introduction de LangGraph uniquement si besoin de graph state plus complexe.
