# SWARM-CHECKLIST

## Architecture & Runtime
- [x] Swarm in-process dans le backend Fastify (`PentestSwarm`).
- [x] Limites runtime appliquees (`maxAgents` 8..30, `maxConcurrentAgents` 1..20).
- [x] Controle d'execution expose: start, pause, resume, force-merge.
- [x] Historique runtime maintenu en memoire + emission d'evenements.

## API & Streaming
- [x] Endpoints Swarm exposes dans `backend/src/routes/swarm.ts`.
- [x] Flux SSE dedie (`/swarm/stream`) avec replay Last-Event-ID.
- [x] Heartbeat SSE actif pour maintenir les connexions.
- [x] Endpoint PDF Swarm (`/swarm/report.pdf`) disponible.

## Donnees & Persistance
- [x] Findings Swarm persistes dans `Finding` (metadata `dynamic_swarm`).
- [x] Traces d'execution persistees dans `ToolExecution`.
- [x] Evenements de run persistes dans `PentestEvent`.
- [ ] Tables dediees `SwarmRun` / `SwarmAgent` / `SysReptorProjectLink` (backlog ADR-0002).

## Providers, MCP, SysReptor
- [x] Selection/fallback provider centralisee via `ProviderManager`.
- [x] Execution outils Swarm centralisee via orchestrateur + Kali MCP fallback.
- [x] Push SysReptor gere avec tolerance aux echecs partiels.

## Securite
- [x] Secrets providers conserves cote backend.
- [x] Garde-fous scope au niveau Kali MCP.
- [ ] Auth middleware sur routes Swarm critiques (backlog ADR-0003).
- [ ] Workflow d'approbation des tools sensibles (backlog ADR-0003).

## Qualite & Tests
- [x] Tests unitaires/routes Swarm existants (Vitest + Supertest).
- [x] Test E2E API backend + Playwright ajoute (start -> pause -> resume -> findings -> PDF).
- [x] Tests backend executes.
- [x] Tests lea-app executes.
