# Claude-Code Architecture Patterns

Research from `/Users/aris/Documents/claude-code/src/` — used to validate our LLMExecutor, ToolExecutor, and SessionLoop designs.

---

## 1. LLM Call Pattern — Streaming Model Responses

**Entry point**: `src/query.ts` — `query()` / `queryLoop()` async generators.

### Core Structure

```
query(params) -> AsyncGenerator<Message|StreamEvent, Terminal>
  └─ queryLoop(params) -> while(true) { ... }
       ├─ prepare messages (compact, microcompact, snip, context-collapse)
       ├─ callModel() via deps.queryModelWithStreaming()   // <-- THE MODEL CALL
       │    └─ for await (message of deps.callModel({...}))  // SSE stream
       ├─ collect tool_use blocks from assistant messages
       └─ execute tools -> feed results back -> loop continues
```

### Key Details

1. **`deps.callModel`** is `queryModelWithStreaming` from `src/services/api/claude.ts`
2. **Streaming**: It's an `AsyncGenerator<StreamEvent | AssistantMessage>` — the caller iterates with `for await`
3. **Fallback**: Wrapped in a `while(attemptWithFallback)` loop. On `FallbackTriggeredError`, it switches to a fallback model, clears state, and retries the same request
4. **Error withholding**: Some errors (prompt-too-long, max-output-tokens, media-size) are *withheld* from the stream until recovery is attempted. This prevents SDK consumers from prematurely terminating the session
5. **Post-sampling hooks**: After model response completes, `executePostSamplingHooks()` fires async (non-blocking)

### Dependency Injection for Testing

`src/query/deps.ts` defines `QueryDeps`:
```typescript
type QueryDeps = {
  callModel: typeof queryModelWithStreaming  // model call
  microcompact: typeof microcompactMessages  // context optimization
  autocompact: typeof autoCompactIfNeeded   // context optimization
  uuid: () => string
}
```
The production factory is `productionDeps()`. Tests inject fakes via `params.deps`.

---

## 2. Tool Execution Pattern — Discovery, Validation, Execution

### Tool Registry

**File**: `src/Tool.ts`

- `Tools` = `readonly Tool[]` (a flat array of tool objects)
- `findToolByName(tools, name)` — linear scan with alias matching (`toolMatchesName`)
- `buildTool(def)` — factory that fills in defaults for optional methods:
  - `isEnabled` -> `true`
  - `isConcurrencySafe` -> `false` (conservative default)
  - `isReadOnly` -> `false`
  - `isDestructive` -> `false`
  - `checkPermissions` -> `{ behavior: 'allow', updatedInput }`
  - `userFacingName` -> `name`

### Tool Interface (`Tool` type)

```typescript
type Tool<Input, Output, P> = {
  name: string
  aliases?: string[]
  call(args, context, canUseTool, parentMessage, onProgress?): Promise<ToolResult<Output>>
  description(input, options): Promise<string>
  inputSchema: z.ZodType          // Zod schema for validation
  inputJSONSchema?: ToolInputJSONSchema  // MCP tools use raw JSON Schema
  isConcurrencySafe(input?): boolean
  isReadOnly(input?): boolean
  isDestructive(input?): boolean
  isEnabled(): boolean
  checkPermissions(input, ctx?): Promise<PermissionResult>
  maxResultSizeChars?: number
  interruptBehavior?: 'cancel' | 'block'
  // ... more optional fields
}
```

### Input Validation Flow

**File**: `src/services/tools/toolExecution.ts` — `runToolUse()` generator

1. **Find tool** by name in `toolUseContext.options.tools`
2. **Check abort signal** — if aborted, yield synthetic cancel tool_result
3. **Parse input**: `tool.inputSchema.safeParse(toolUse.input)` — Zod validation
4. **Permission check**: `checkPermissions(input, ctx)` -> allow/deny/ask
5. **Pre-tool hooks**: `runPreToolUseHooks()`
6. **Execute**: `tool.call(args, context, canUseTool, parentMessage, onProgress)`
7. **Post-tool hooks**: `runPostToolUseHooks()`
8. **Yield results**: As `MessageUpdateLazy` containing `UserMessage` with `tool_result` blocks

On **validation error**: Returns `<tool_use_error>` with formatted Zod error message back to the model.

On **unknown tool**: Returns error `No such tool available: {name}`.

### Concurrency Model

**File**: `src/services/tools/toolOrchestration.ts`

Tools are **partitioned into batches**:
1. Consecutive read-only (`isConcurrencySafe=true`) tools run **concurrently** (up to `CLAUDE_CODE_MAX_TOOL_USE_CONCURRENCY`, default 10)
2. Non-read-only tools run **serially** (one at a time)
3. Mixed sequences: batches alternate — read-only batch concurrent, then individual non-read-only

### Streaming Tool Executor

**File**: `src/services/tools/StreamingToolExecutor.ts`

An alternative to the batch orchestrator. Tools execute **as they stream in** from the model:
- `addTool(block, assistantMessage)` — queues tool for execution
- `processQueue()` — starts execution when concurrency conditions allow
- `getCompletedResults()` — yields results as they complete (ordered)
- `getRemainingResults()` — drains any still queued/in-progress
- On **streaming fallback**: `discard()` cancels all pending tools, creating synthetic errors

---

## 3. Loop Continuation Logic — When to Keep Going

The loop is `while(true)` in `queryLoop()`. It continues via `state = { ...next }` assignments at **continue sites**.

### The Decision Flow

```
Model response received
  │
  ├─ Has tool_use blocks? → needsFollowUp = true → execute tools → continue
  │
  ├─ No tool_use blocks? → needsFollowUp = false
  │   ├─ Prompt-too-long withheld? → try collapse drain / reactive compact → continue
  │   ├─ Max-output-tokens withheld? → retry with escalated tokens (3 max) → continue
  │   ├─ API error message? → return { reason: 'completed' }
  │   ├─ Stop hooks prevent continuation? → return { reason: 'stop_hook_prevented' }
  │   ├─ Stop hooks have blocking errors? → inject errors → continue
  │   └─ None of the above → return { reason: 'completed' }
  │
  ├─ Aborted during streaming? → yield missing tool_results → return { reason: 'aborted_streaming' }
  ├─ Aborted during tool execution? → yield interruption → return { reason: 'aborted_tools' }
  └─ maxTurns exceeded? → yield max_turns_reached → return { reason: 'max_turns' }
```

### Continue Reasons (tracked via `state.transition`)

| Reason | Description |
|--------|-------------|
| `next_turn` | Normal: tool results ready, feed back to model |
| `collapse_drain_retry` | Context collapse drained staged collapses |
| `reactive_compact_retry` | Reactive compact summarized context to fit |
| `max_output_tokens_recovery` | Injected resume message after output truncation |
| `max_output_tokens_escalate` | Retry at 64k tokens after 8k cap hit |
| `stop_hook_blocking` | Stop hook injected blocking errors for model to address |
| `token_budget_continuation` | Budget tracker nudge: continue with remaining budget |

### Terminal Reasons (return values)

| Reason | When |
|--------|------|
| `completed` | Normal end: no tool_use, no recovery needed |
| `aborted_streaming` | User interrupt during model streaming |
| `aborted_tools` | User interrupt during tool execution |
| `max_turns` | Turn limit exceeded |
| `model_error` | Unrecoverable API error |
| `image_error` | Image size/resize error |
| `prompt_too_long` | Recovery from prompt-too-long failed |
| `stop_hook_prevented` | Post-sampling hook blocked continuation |
| `blocking_limit` | Token count exceeded hard blocking limit |
| `hook_stopped` | Mid-tool hook indicated stop |

### Turn Counter & Budget

- `turnCount` increments each time tool results are fed back
- `maxTurns` (optional) caps iterations
- `taskBudget` (optional) tracks cumulative API token spend across compaction boundaries

---

## 4. Agent Lifecycle — Spawning, Running, Communication

### Agent Types

Claude-code has several agent execution modes:

| Type | File | Description |
|------|------|-------------|
| `LocalAgentTask` | `src/tasks/LocalAgentTask/` | Background agent (async, separate process state) |
| `InProcessTeammateTask` | `src/tasks/InProcessTeammateTask/` | In-process teammate (AsyncLocalStorage isolation) |
| `RemoteAgentTask` | `src/tasks/RemoteAgentTask/` | Remote CCR agent |
| `LocalShellTask` | `src/tasks/LocalShellTask/` | Bash subprocess |
| `ForkSubagent` | `src/tools/AgentTool/forkSubagent.ts` | Forked context-sharing subagent |

### AgentTool — The Tool That Spawns Agents

**File**: `src/tools/AgentTool/AgentTool.tsx`

The AgentTool is itself a regular Tool that:
1. Accepts `description`, `prompt`, `subagent_type`, `model`, `name`, `team_name`, `mode`, `isolation`, `cwd` as input
2. Routes to sync execution (`runAgent`) or async (background task registration)
3. For teammates: delegates to `spawnTeammate()` (tmux/iTerm2) or `spawnInProcessTeammate()`

### runAgent() — Core Agent Execution

**File**: `src/tools/AgentTool/runAgent.ts`

```typescript
async function* runAgent({
  agentDefinition, promptMessages, toolUseContext, canUseTool,
  isAsync, model, maxTurns, availableTools, allowedTools, ...
}): AsyncGenerator<Message, void>
```

Key steps:
1. **Create subagent context** via `createSubagentContext()` — clones parent's `ToolUseContext`, sets unique `agentId`
2. **Resolve model** — `getAgentModel()` from agent definition, override, or parent
3. **Connect agent MCP servers** — `initializeAgentMcpServers()` for agent-specific MCP
4. **Build system prompt** — `getPrompt()` from agent definition
5. **Resolve tools** — `resolveAgentTools()` filters tool pool by agent permissions
6. **Call query()** — the same `query()` loop runs for the subagent, with its own message history
7. **Record transcript** — all messages are written to sidechain files for resume

### In-Process Teammates

**File**: `src/utils/swarm/spawnInProcess.ts` + `src/utils/swarm/inProcessRunner.ts`

In-process teammates:
1. Run in the **same Node.js process** (no fork/tmux)
2. Use **AsyncLocalStorage** for identity isolation (`agentName@teamName`)
3. Communicate via **message queues** (`pendingUserMessages`, mailbox system)
4. Can be **idle** (waiting for work) or **active** (processing a turn)
5. Have a `shutdownRequested` flag for graceful shutdown
6. Task state is tracked in `AppState` with status `pending|running|completed|failed|killed`

### Task State Tracking

**File**: `src/Task.ts`

```typescript
type TaskStateBase = {
  id: string           // generated via generateTaskId(type)
  type: TaskType       // 'local_bash' | 'local_agent' | 'remote_agent' | 'in_process_teammate' | ...
  status: TaskStatus   // 'pending' | 'running' | 'completed' | 'failed' | 'killed'
  description: string
  startTime: number
  endTime?: number
  outputFile: string   // disk path for output persistence
}
```

Tasks are registered in `AppState` via `registerTask()` and managed via `setAppState()` immutably.

---

## 5. Key Differences from Our Design

### Patterns We Should Match

1. **AsyncGenerator everywhere** — both the query loop AND tool execution use `async function*` generators. Our `LLMExecutor` and `ToolExecutor` should do the same for streaming.

2. **Dependency injection via `deps` parameter** — `query()` accepts an optional `deps` override for testability. We should do the same.

3. **Tool input validation via Zod** — every tool has a Zod schema, and `safeParse` is called before execution. Errors go back to the model as `<tool_use_error>`.

4. **Concurrency-safe batching** — read-only tools can run in parallel; write tools are serialized. Our tool registry should expose `isConcurrencySafe`.

5. **State object pattern** — mutable cross-iteration state is collected into a single `State` object that gets reassigned as a whole at continue sites. This avoids 9+ separate variable mutations.

6. **Explicit continue/terminal reasons** — every loop exit is tagged with a `{ reason: string }`. This is crucial for observability and testing.

### Patterns We Don't Need (or Should Adapt)

1. **Context compaction** — claude-code has extensive compaction (autocompact, microcompact, reactive compact, context collapse, snip). For our pentest use case, simpler truncation may suffice.

2. **Permission system** — claude-code has a complex permission mode system (default/plan/bypass/auto). Our runtime is server-side with no interactive permission prompts.

3. **Streaming fallback** — switching models mid-stream on errors. We should handle model errors but don't need the full fallback machinery.

4. **MCP tool integration** — our tools are all first-party. No need for the `mcp__` prefix routing or MCP client lifecycle.

5. **Process-based teammates** — tmux/iTerm2 split-pane teammates are irrelevant for our backend runtime. We only need in-process agent spawning.

6. **Post-sampling / stop hooks** — These are for interactive CLI features. Our equivalent would be simpler "should this agent continue?" logic.

### What We're Missing

1. **`buildTool()` factory** — We should adopt the pattern of filling in default implementations for optional tool methods. Our `ToolRegistry` registrations should use a similar builder.

2. **`ToolResult` with `contextModifier`** — Tools can return a function that modifies the `ToolUseContext` for subsequent tools. This is how tools like `EnterWorktreeTool` change the working directory for later tools in the same batch.

3. **AbortController hierarchy** — claude-code uses child AbortControllers (per-tool, per-agent) linked to a parent. When the parent aborts, all children abort. When a sibling tool errors, it aborts siblings via `siblingAbortController`.

4. **Progress streaming** — Tools emit `ToolProgress` events during execution (not just at completion). Our tools should support this for long-running operations like Nmap scans.

5. **Error containment in concurrent execution** — When one parallel tool errors, siblings get synthetic errors (`Cancelled: parallel tool call X errored`). The batch stops; the model sees what happened and can decide what to do.
