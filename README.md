# LEA Platform

LEA is in RC stabilization for a pentest MVP. The client-facing product is intentionally focused:

1. Configure an AI provider and model.
2. Create a pentest with target, scope, model and effort.
3. Run preflight checks before execution.
4. Start and stop a live scan.
5. Review live events, tool activity, errors and evidence-backed findings.
6. Edit, validate or reject findings.
7. Export reports as JSON, HTML or PDF.
8. Resume recent sessions without losing context.

Advanced runtime capabilities exist in the codebase, but they are not MVP client features yet.

## Current MVP Surface

- Provider setup with masked API keys and health checks.
- Target, scope, config, review and preflight flow.
- Durable live scan timeline backed by `PentestEvent`.
- Stop control for active runs.
- Run projection panel for status, phase, tool activity, findings and errors.
- Findings review with draft, validated and rejected states.
- Report exports: JSON, HTML and PDF.
- Reports navigation in the main sidebar.

## Experimental Or Internal

These surfaces are hidden by default or intended for admin/dev usage only:

- Runtime extensions console.
- Hooks, plugins, skills and LSP.
- Raw MCP browser and ToolRegistry explorer.
- Manual Tool Invoke UI.
- Swarm traces and advanced runtime control.
- Worktrees, plan mode and checkpoints.
- Remote sessions, IDE bridge, voice and marketplace.

Use the frontend flags below only for local/admin exploration:

```env
NEXT_PUBLIC_LEA_EXPERIMENTAL_UI=false
NEXT_PUBLIC_LEA_EXPERIMENTAL_RUNTIME_UI=false
NEXT_PUBLIC_LEA_ADVANCED_SCAN_CONTROLS=false
```

## Quick Start

Prerequisites:

- Docker Desktop.
- Node.js matching the project lockfiles.
- Git.

Start the local stack:

```bash
docker compose --profile dev up -d postgres postgres-dev-port lea-kali-mcp
```

Install and run the backend:

```bash
cd backend
npm install
npm run build
npm run dev
```

Install and run the frontend:

```bash
cd lea-app
npm install
npm run dev
```

Open the app:

```bash
open http://localhost:3000
```

## Environment

The shared `.env.example` documents local defaults and production-sensitive switches.

Important variables:

```env
DATABASE_URL=postgresql://lea_admin:CHANGE_THIS_PASSWORD_IN_PRODUCTION@postgres:5432/lea_platform
LEA_REQUIRE_API_KEY=false
LEA_API_KEY=
NEXT_PUBLIC_LEA_DEV_API_KEY=
ALLOWED_ORIGINS=http://localhost:3000,http://localhost:3001
MCP_KALI_ENDPOINT=http://lea-kali-mcp:3002/mcp
LEA_ENABLE_TOOL_INVOKE_API=false
```

For production or SaaS-like deployments, global auth, strict CORS, scope enforcement and admin-only runtime APIs must remain enabled and verified.

## Project Structure

```txt
LEA/
├── backend/                  # Fastify API, Prisma, runtime services
│   ├── src/routes/           # REST and SSE routes
│   ├── src/services/         # Pentest, providers, reports, export, runtime
│   └── prisma/schema.prisma  # PentestEvent, Message, ToolExecution, Finding
├── lea-app/                  # Next.js App Router frontend
│   ├── app/                  # Routes
│   ├── components/           # UI components
│   ├── hooks/                # Client data hooks
│   ├── store/                # UI cache stores
│   └── lib/                  # API clients and helpers
├── docs/                     # Additional documentation
├── docker-compose.yml
├── ROADMAP-ACTIVE.md
├── IMPLEMENTATION-LOGIQUE-CLAUDE.md
└── IMPLEMENTATION-UI-CLAUDE.md
```

## Architecture Rules For The RC

- `PentestEvent` is the durable temporal source of truth.
- `Message` is a conversation projection, not the only source of truth.
- `ToolExecution` and `KaliAuditLog` hold tool and audit evidence.
- `Finding` is the reviewable client value object.
- `PentestRunProjection` is the UI state contract.
- `SSEManager` is a transport/cache, not the product truth.
- Frontend stores are UI caches only.

## Key API Surfaces

Pentests:

```http
GET  /api/pentests
POST /api/pentests
POST /api/pentests/:id/preflight
POST /api/pentests/:id/preflight/retry
POST /api/pentests/:id/start
POST /api/pentests/:id/stop
GET  /api/pentests/:id/events?sinceSeq=123
GET  /api/pentests/:id/projection
GET  /api/pentests/:id/stream
```

Reports:

```http
GET /api/reports
GET /api/reports/:id
PUT /api/reports/:id/findings/:findingId
GET /api/reports/:id/export/json
GET /api/reports/:id/export/html
GET /api/reports/:id/export/pdf
```

Providers:

```http
GET  /api/providers
POST /api/providers
PUT  /api/providers/:id
POST /api/providers/:id/test
```

Tool Invoke:

```http
POST /api/tools/:name/invoke
```

Tool Invoke is internal/admin/dev only, disabled by default with `LEA_ENABLE_TOOL_INVOKE_API=false`, and must not be exposed as a client MVP feature.

## Verification

Recommended RC checks:

```bash
cd backend && npm run build
cd backend && npx vitest run
cd lea-app && npm run lint -- --quiet
cd lea-app && npm run typecheck
cd lea-app && npx vitest run
```

Browser smoke to run before a release candidate:

1. Configure provider.
2. Create target and scope.
3. Select model and effort.
4. Run preflight.
5. Start scan.
6. Observe live events.
7. Reload during scan and confirm replay.
8. Stop scan.
9. Review and validate findings.
10. Export JSON, HTML and PDF.
11. Resume the completed session from recent scans or reports.

## Roadmap

The active execution plan lives in:

- `ROADMAP-ACTIVE.md`
- `IMPLEMENTATION-LOGIQUE-CLAUDE.md`
- `IMPLEMENTATION-UI-CLAUDE.md`

Those documents distinguish MVP, RC stabilization, experimental runtime features and post-MVP backlog.
