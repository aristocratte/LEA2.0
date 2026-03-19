# Swarm SSE And History Fixes Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Restore live swarm UI updates, SSE replay after reconnect, and historical swarm findings in the `/api/pentests/:id/swarm/history` response.

**Architecture:** Update the frontend swarm stream consumers to honor the typed SSE envelope contract and persist raw string event IDs. On the backend, make SSE replay accept both new and legacy event IDs, then rebuild swarm history by merging DB-backed runs with richer in-memory snapshots and persisted swarm findings.

**Tech Stack:** Fastify, Prisma, Vitest, Zustand, Next.js

---

### Task 1: Frontend Typed Swarm Events

**Files:**
- Modify: `lea-app/store/swarm-store.ts`

**Step 1: Update the swarm store event cursor and replay URL**

Change `lastEventId` from number-based state to a raw string cursor and pass it unchanged to `getSwarmStreamUrl`.

**Step 2: Switch reducers to typed envelope names**

Handle `swarm.started`, `swarm.paused`, `swarm.resumed`, `finding.created`, `finding.updated`, and `approval.requested`, while preserving the existing reducer behavior for agent/task/message updates.

**Step 3: Rebuild pending approval IDs from the envelope**

Populate `pendingApproval.approvalId` from `event.correlationId` first and fall back to `event.id`.

### Task 2: Frontend SSE Replay Cursor

**Files:**
- Modify: `lea-app/hooks/use-pentest-stream.ts`
- Modify: `lea-app/lib/api.ts`

**Step 1: Stop coercing SSE IDs to numbers**

Persist `MessageEvent.lastEventId` as a string and send it back unchanged via the stream URL helpers.

**Step 2: Keep reconnect behavior intact**

Reset the cursor on pentest changes, but do not convert new-format IDs like `evt-12-...` to numbers.

### Task 3: Backend SSE Compatibility

**Files:**
- Modify: `backend/src/services/SSEManager.ts`
- Modify: `backend/src/agents/PentestSwarm.ts`
- Modify: `backend/src/agents/swarm/SwarmEventEmitter.ts`
- Modify: `backend/src/agents/swarm/ToolFindingPipeline.ts`

**Step 1: Accept both new and legacy replay IDs**

Parse `evt-<sequence>-...` IDs and plain numeric IDs in `SSEManager.register()`.

**Step 2: Keep a migration path for legacy listeners**

Emit matching legacy aliases where the review scope requires them, without changing the typed contract.

### Task 4: Backend Swarm History Integrity

**Files:**
- Modify: `backend/src/agents/PentestSwarm.ts`
- Modify: `backend/src/routes/__tests__/swarm.test.ts` or another route-level swarm test file

**Step 1: Merge DB runs with memory snapshots**

Do not return early when DB rows exist. Build the response by combining DB-backed runs, the active in-memory run, and any richer in-memory history snapshots.

**Step 2: Restore findings for history entries**

Load persisted swarm findings for each run when available, or preserve the in-memory findings/tasks snapshot until equivalent persistence exists.

**Step 3: Add verification coverage**

Add a route-level test that exercises `/api/pentests/:id/swarm/history` after a swarm run completes with findings and assert the findings are present in the response.

### Task 5: Verification

**Files:**
- Test: `backend/src/routes/__tests__/swarm.test.ts`
- Test: existing frontend/backend targeted tests as needed

**Step 1: Run targeted tests**

Run the swarm route/backend tests that cover history and SSE replay handling.

**Step 2: Review changed behavior**

Confirm the frontend and backend now agree on typed event names and string-based replay IDs.
