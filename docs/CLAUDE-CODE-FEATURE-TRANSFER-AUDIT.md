# Claude Code Feature Transfer Audit for LEA

## Goal

Compare the local `claude-code` snapshot with LEA and identify the largest transferable product features to re-implement cleanly inside LEA.

This document is a feature and architecture audit, not a copy plan. The recommended path is clean-room reimplementation of transferable behaviors, using LEA's existing runtime as the base.

## High-Level Conclusion

LEA already has a surprisingly strong backend foundation for an agent platform:

- multi-agent spawning and lifecycle
- permission engine and path/tool guards
- SSE/live runtime and replay traces
- provider abstraction
- context compaction and recall
- approval workflows

What LEA lacks compared with `claude-code` is mostly the surrounding product layer:

- generic developer tools workspace
- richer command surface
- session management ergonomics
- persistent memory UX
- hooks/plugins/skills ecosystem
- remote session UX
- polished operator affordances like tips, prompt suggestions, status line, managed settings

## What LEA Already Has

### Runtime and Agents

LEA already includes strong equivalents for several internal Claude Code foundations:

- In-process teammate spawning in [backend/src/core/swarm/AgentSpawner.ts](/Users/aris/Documents/LEA/backend/src/core/swarm/AgentSpawner.ts)
- Agent execution and lifecycle in [backend/src/core/swarm/AgentRunner.ts](/Users/aris/Documents/LEA/backend/src/core/swarm/AgentRunner.ts)
- Mailbox-based inter-agent messaging in [backend/src/core/swarm/Mailbox.ts](/Users/aris/Documents/LEA/backend/src/core/swarm/Mailbox.ts)
- Permission forwarding in [backend/src/core/swarm/PermissionBridge.ts](/Users/aris/Documents/LEA/backend/src/core/swarm/PermissionBridge.ts)
- Permission synchronization in [backend/src/core/swarm/PermissionSync.ts](/Users/aris/Documents/LEA/backend/src/core/swarm/PermissionSync.ts)

### Permissions and Safety

- Shared permission model in [backend/src/core/permissions/types.ts](/Users/aris/Documents/LEA/backend/src/core/permissions/types.ts)
- Rule engine in [backend/src/core/permissions/PermissionEngine.ts](/Users/aris/Documents/LEA/backend/src/core/permissions/PermissionEngine.ts)
- Path validation in [backend/src/core/permissions/PathValidator.ts](/Users/aris/Documents/LEA/backend/src/core/permissions/PathValidator.ts)
- Shell safety helpers in [backend/src/core/bash](/Users/aris/Documents/LEA/backend/src/core/bash)

### Session Memory

- Context compaction in [backend/src/services/context/ContextCompactionService.ts](/Users/aris/Documents/LEA/backend/src/services/context/ContextCompactionService.ts)
- Context recall in [backend/src/services/context/ContextRecallService.ts](/Users/aris/Documents/LEA/backend/src/services/context/ContextRecallService.ts)

### UI and Live Runtime

- Live swarm workspace in [lea-app/components/pentest/SwarmWorkspace.tsx](/Users/aris/Documents/LEA/lea-app/components/pentest/SwarmWorkspace.tsx)
- Full-screen live view in [lea-app/components/pentest/AgentSwarmLiveView.tsx](/Users/aris/Documents/LEA/lea-app/components/pentest/AgentSwarmLiveView.tsx)
- SSE runtime client in [lea-app/lib/runtime/runtime-client.ts](/Users/aris/Documents/LEA/lea-app/lib/runtime/runtime-client.ts)
- Swarm routes and controls in [backend/src/routes/swarm.ts](/Users/aris/Documents/LEA/backend/src/routes/swarm.ts)

### Conversation History and Recovery

- Persisted pentest history reconstruction in [lea-app/hooks/use-pentest-history.ts](/Users/aris/Documents/LEA/lea-app/hooks/use-pentest-history.ts)
- Draft recovery UI in [lea-app/components/onboarding/DraftRecoveryModal.tsx](/Users/aris/Documents/LEA/lea-app/components/onboarding/DraftRecoveryModal.tsx)

## What the `claude-code` Snapshot Adds

### 1. Generic Developer Workspace Tools

This is the biggest gap.

The snapshot exposes a much more general tool-first developer workspace around file editing, shell, search, web fetch, agent spawning, task management, MCP usage, worktrees, and synthetic outputs. The key surfaces are organized around:

- query and orchestration in [src/QueryEngine.ts](/Users/aris/Documents/claude-code/src/QueryEngine.ts)
- tool orchestration in [src/services/tools/toolOrchestration.ts](/Users/aris/Documents/claude-code/src/services/tools/toolOrchestration.ts)
- tool execution in [src/services/tools/toolExecution.ts](/Users/aris/Documents/claude-code/src/services/tools/toolExecution.ts)
- streaming tool execution in [src/services/tools/StreamingToolExecutor.ts](/Users/aris/Documents/claude-code/src/services/tools/StreamingToolExecutor.ts)
- tool hooks in [src/services/tools/toolHooks.ts](/Users/aris/Documents/claude-code/src/services/tools/toolHooks.ts)

LEA currently has strong pentest and Kali-oriented tooling, but not yet a generic workspace tool layer suitable for "developer copilot" mode.

Recommended transfer:

- add first-class `Read`, `Write`, `Edit`, `Grep`, `Glob`, `Bash`, `Git`, `WebFetch`, `Task`, and `ToolSearch` style capabilities
- reuse LEA's permission engine instead of inventing a new one
- expose extra working directories via the already-present `addDirectories` permission update primitive

Difficulty: medium to high

Impact: very high

### 2. Real Command Surface Instead of Static Slash Suggestions

Claude Code exposes a much richer command surface:

- CLI handlers in [src/cli/handlers/agents.ts](/Users/aris/Documents/claude-code/src/cli/handlers/agents.ts), [src/cli/handlers/mcp.tsx](/Users/aris/Documents/claude-code/src/cli/handlers/mcp.tsx), [src/cli/handlers/plugins.ts](/Users/aris/Documents/claude-code/src/cli/handlers/plugins.ts), [src/cli/handlers/auth.ts](/Users/aris/Documents/claude-code/src/cli/handlers/auth.ts), [src/cli/handlers/autoMode.ts](/Users/aris/Documents/claude-code/src/cli/handlers/autoMode.ts)

LEA today has only lightweight slash insertion and quick actions:

- [lea-app/components/chat/slash-command-menu.tsx](/Users/aris/Documents/LEA/lea-app/components/chat/slash-command-menu.tsx)
- [lea-app/hooks/use-slash-commands.ts](/Users/aris/Documents/LEA/lea-app/hooks/use-slash-commands.ts)

Recommended transfer:

- replace static menu templates with real command handlers
- first commands to add: `/agents`, `/permissions`, `/mcp`, `/compact`, `/resume`, `/history`, `/trace`, `/cost`, `/model`, `/clear`
- route commands to backend actions and UI panes rather than text insertion only

Difficulty: medium

Impact: very high

### 3. Session Memory Productization

Claude Code has a much more mature memory stack:

- memory directory behavior in [src/memdir/memdir.ts](/Users/aris/Documents/claude-code/src/memdir/memdir.ts)
- memory search and relevance in [src/memdir/findRelevantMemories.ts](/Users/aris/Documents/claude-code/src/memdir/findRelevantMemories.ts)
- session memory services in [src/services/SessionMemory/sessionMemory.ts](/Users/aris/Documents/claude-code/src/services/SessionMemory/sessionMemory.ts)
- automatic memory extraction in [src/services/extractMemories/extractMemories.ts](/Users/aris/Documents/claude-code/src/services/extractMemories/extractMemories.ts)
- away summaries in [src/services/awaySummary.ts](/Users/aris/Documents/claude-code/src/services/awaySummary.ts)

LEA already has compaction and recall, but it is still pentest-session centric rather than operator-memory centric.

Recommended transfer:

- add a `.lea/memory/` or `MEMORY.md` style entrypoint
- persist operator, project, and workflow memories separately from pentest snapshots
- add auto-extraction of stable facts at session boundaries
- add "away summary" or "what changed while you were gone" summaries

Difficulty: medium

Impact: high

### 4. Auto-Compact and Context Headroom UX

Claude Code has explicit context threshold management and warning states:

- [src/services/compact/autoCompact.ts](/Users/aris/Documents/claude-code/src/services/compact/autoCompact.ts)
- [src/services/compact/compactWarningHook.ts](/Users/aris/Documents/claude-code/src/services/compact/compactWarningHook.ts)
- [src/services/compact/compactWarningState.ts](/Users/aris/Documents/claude-code/src/services/compact/compactWarningState.ts)

LEA has strong compaction internals but lacks the operator-facing UX for:

- warning before saturation
- explicit context budget status
- manual and automatic compact triggers surfaced in UI

Recommended transfer:

- show token budget and compact state in the LEA UI
- add `/compact`
- add proactive warnings before runtime degradation

Difficulty: low to medium

Impact: high

### 5. Prompt Suggestions and Speculative Follow-Ups

Claude Code includes:

- prompt suggestion logic in [src/services/PromptSuggestion/promptSuggestion.ts](/Users/aris/Documents/claude-code/src/services/PromptSuggestion/promptSuggestion.ts)
- speculation path in [src/services/PromptSuggestion/speculation.ts](/Users/aris/Documents/claude-code/src/services/PromptSuggestion/speculation.ts)

LEA currently has command suggestions and action buttons but not intelligent next-prompt guidance.

Recommended transfer:

- suggest next operator prompts from current run state
- show context-aware follow-ups like "resume paused approval queue", "generate executive report", "compare new findings to previous scan", "compact context now"

Difficulty: low to medium

Impact: medium to high

### 6. Plugins, Skills, and Marketplace Ecosystem

Claude Code snapshot shows real ecosystem scaffolding:

- skill loading in [src/skills/loadSkillsDir.ts](/Users/aris/Documents/claude-code/src/skills/loadSkillsDir.ts)
- bundled skills in [src/skills/bundledSkills.ts](/Users/aris/Documents/claude-code/src/skills/bundledSkills.ts)
- skill builders in [src/skills/mcpSkillBuilders.ts](/Users/aris/Documents/claude-code/src/skills/mcpSkillBuilders.ts)
- plugin installation manager in [src/services/plugins/PluginInstallationManager.ts](/Users/aris/Documents/claude-code/src/services/plugins/PluginInstallationManager.ts)

LEA currently has strong internal features but almost no general extensibility surface.

Recommended transfer:

- add `.lea/skills/` and `.lea/plugins/`
- support installable analysis packs and workflow packs
- let plugins contribute commands, tool bundles, UI panels, and task templates
- keep Kali/MCP integrations as one plugin family rather than the whole product surface

Difficulty: high

Impact: very high

### 7. Hooks and Event Automation

Claude Code exposes tool lifecycle hooks around orchestration:

- [src/services/tools/toolHooks.ts](/Users/aris/Documents/claude-code/src/services/tools/toolHooks.ts)

LEA already has many event emitters, approvals, and runtime signals. This makes hooks a very natural next step.

Recommended transfer:

- add hooks like `PreToolUse`, `PostToolUse`, `ApprovalRequested`, `ApprovalResolved`, `SubagentSpawned`, `SessionCompleted`
- support local scripts or internal actions on these events
- use this for notifications, audit trails, auto-tagging, or custom policy enforcement

Difficulty: medium

Impact: high

### 8. Remote Sessions, Hybrid Transport, and Direct Connect

Claude Code has a more developed remote transport story:

- remote session manager in [src/remote/RemoteSessionManager.ts](/Users/aris/Documents/claude-code/src/remote/RemoteSessionManager.ts)
- websocket wrapper in [src/remote/SessionsWebSocket.ts](/Users/aris/Documents/claude-code/src/remote/SessionsWebSocket.ts)
- remote permission bridge in [src/remote/remotePermissionBridge.ts](/Users/aris/Documents/claude-code/src/remote/remotePermissionBridge.ts)
- transports in [src/cli/transports/HybridTransport.ts](/Users/aris/Documents/claude-code/src/cli/transports/HybridTransport.ts), [src/cli/transports/SSETransport.ts](/Users/aris/Documents/claude-code/src/cli/transports/SSETransport.ts), [src/cli/transports/WebSocketTransport.ts](/Users/aris/Documents/claude-code/src/cli/transports/WebSocketTransport.ts)
- direct connect session creation in [src/server/createDirectConnectSession.ts](/Users/aris/Documents/claude-code/src/server/createDirectConnectSession.ts)

LEA currently relies mostly on SSE for live UI updates and has replay runtime support, but not a general remote-session model.

Recommended transfer:

- add websocket-backed interactive sessions
- support viewer-only sessions for stakeholders
- support mobile or secondary-console attachment to a live run

Difficulty: medium to high

Impact: high

### 9. Session Resume, History, and Tool Summaries

Claude Code snapshot includes several polish features around continuity:

- history in [src/history.ts](/Users/aris/Documents/claude-code/src/history.ts)
- away summary in [src/services/awaySummary.ts](/Users/aris/Documents/claude-code/src/services/awaySummary.ts)
- tool use summary generation in [src/services/toolUseSummary/toolUseSummaryGenerator.ts](/Users/aris/Documents/claude-code/src/services/toolUseSummary/toolUseSummaryGenerator.ts)

LEA already reconstructs historical streams, but continuity can be upgraded.

Recommended transfer:

- named sessions with reopen and resume
- "what changed since last open" cards
- summarized tool activity instead of raw event flood only

Difficulty: medium

Impact: high

### 10. Product Polish: Tips, Status Line, Notifications, Managed Settings

Useful operator polish from the snapshot:

- tips scheduler in [src/services/tips/tipScheduler.ts](/Users/aris/Documents/claude-code/src/services/tips/tipScheduler.ts)
- tip registry in [src/services/tips/tipRegistry.ts](/Users/aris/Documents/claude-code/src/services/tips/tipRegistry.ts)
- analytics/feature flags in [src/services/analytics](/Users/aris/Documents/claude-code/src/services/analytics)
- remote managed settings in [src/services/remoteManagedSettings](/Users/aris/Documents/claude-code/src/services/remoteManagedSettings)

LEA has a notification center already:

- [lea-app/components/chat/notification-center.tsx](/Users/aris/Documents/LEA/lea-app/components/chat/notification-center.tsx)

Recommended transfer:

- add contextual usage tips based on operator behavior
- add a status line or sticky header for cost, model, permissions mode, connection state, active agent count
- add feature flags and remote managed settings for enterprise deployments

Difficulty: low to medium

Impact: medium to high

### 11. Voice and Magic Docs

These are optional but interesting:

- voice capture in [src/services/voice.ts](/Users/aris/Documents/claude-code/src/services/voice.ts)
- STT stream hooks in [src/services/voiceStreamSTT.ts](/Users/aris/Documents/claude-code/src/services/voiceStreamSTT.ts)
- generated docs workflow in [src/services/MagicDocs/magicDocs.ts](/Users/aris/Documents/claude-code/src/services/MagicDocs/magicDocs.ts)

For LEA:

- voice is nice-to-have for operators
- magic-docs style report drafting is very relevant for pentest output generation

Difficulty: medium

Impact: medium

## Priority Backlog

### P0

1. Add generic workspace tools on top of LEA permissions.
2. Replace static slash commands with real backend-connected command handlers.
3. Add operator-visible token/cost/status bar and `/compact`.
4. Add persistent project memory entrypoint beyond pentest snapshots.

### P1

1. Add hooks for tool lifecycle and subagent lifecycle.
2. Add installable skills/plugins.
3. Add named sessions, away summary, tool-use summaries, and better resume.
4. Add websocket or hybrid transport for interactive remote sessions.

### P2

1. Add remote managed settings and feature flags.
2. Add tip system and prompt suggestion system.
3. Add voice input and magic-docs style report assistant.

## Fastest High-Value Wins

1. Turn `/scan`, `/pause`, `/resume`, `/report`, `/agents` into real command handlers instead of template insertion.
2. Add a status strip showing model, cost, token pressure, permission mode, and active agents.
3. Surface manual and automatic compaction state in the UI.
4. Add a project-level memory file plus automatic memory extraction at session end.
5. Add hooks around tool execution and approvals.

## Recommended Strategy

Do not try to make LEA "be Claude Code".

Instead:

1. Keep LEA's strong pentest orchestration core.
2. Add a second product mode: a more general workspace/orchestrator layer.
3. Re-implement transferable features cleanly on LEA's existing primitives.
4. Treat the local `claude-code` snapshot as architecture inspiration and feature inventory, not as copy-paste source.

## Suggested First Build Slice

If implementing in order, the best first slice is:

1. Real slash command engine
2. Status line with cost and compact state
3. Project memory entrypoint and memory extraction
4. Hooks for tool lifecycle

That sequence delivers visible product gains quickly while staying aligned with LEA's current architecture.
