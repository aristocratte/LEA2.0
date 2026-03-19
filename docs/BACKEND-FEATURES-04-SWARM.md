# Backend Features - Swarm & Agent System

## Current Implementation 🟡

### Implemented Endpoints
```
GET    /api/pentests/:id/swarm/state          - Get current swarm state
GET    /api/pentests/:id/swarm/history        - Get swarm run history
POST   /api/pentests/:id/swarm/start          - Start swarm audit
POST   /api/pentests/:id/swarm/pause          - Pause swarm
POST   /api/pentests/:id/swarm/resume         - Resume swarm
POST   /api/pentests/:id/swarm/force-merge    - Force merge findings
GET    /api/pentests/:id/swarm/traces         - List trace recordings
GET    /api/swarm/traces/:id                  - Get trace details
POST   /api/pentests/:id/swarm/runtime/control - Runtime control
POST   /api/pentests/:id/swarm/tools/approve  - Approve tool execution
POST   /api/pentests/:id/swarm/tools/deny     - Deny tool execution
```

### SSE Streaming
```
GET    /api/pentests/:id/swarm/stream         - Swarm event stream
```

**Event Types:**
- `swarm_connected` - Connection established
- `swarm_started` - Swarm run started
- `agent_spawned` - New agent created
- `agent_updated` - Agent status changed
- `agent_completed` - Agent finished
- `agent_failed` - Agent error
- `tool_call_started` - Tool execution began
- `tool_call_completed` - Tool execution finished
- `finding_created` - New finding discovered
- `approval_requested` - Human approval needed
- `approval_resolved` - Approval decision made
- `swarm_completed` - All agents finished
- `swarm_failed` - Swarm error

## Data Models

### SwarmRun
```typescript
interface SwarmRun {
  id: string;
  pentestId: string;
  target: string;
  task?: string;
  status: 'QUEUED' | 'RUNNING' | 'PAUSED' | 'MERGING' | 'COMPLETED' | 'FAILED' | 'PARTIAL_COMPLETED';
  maxAgents: number;
  maxConcurrentAgents: number;
  forceMerged: boolean;
  sysReptorProjectId?: string;
  agents: SwarmAgent[];
  findings: SwarmFinding[];
  tasks?: SwarmTask[];
  startedAt: string;
  endedAt?: string;
}
```

### SwarmAgent
```typescript
interface SwarmAgent {
  id: string;
  swarmRunId: string;
  name: string;
  role: string;
  status: 'SPAWNED' | 'THINKING' | 'RUNNING_TOOL' | 'IDLE' | 'DONE' | 'FAILED';
  progress: number;  // 0-100
  toolName?: string;
  lastMessage?: string;
  createdAt: string;
  updatedAt: string;
}
```

### SwarmFinding
```typescript
interface SwarmFinding {
  id: string;
  pentestId: string;
  swarmRunId: string;
  agentId: string;
  title: string;
  description: string;
  severity: 'critical' | 'high' | 'medium' | 'low' | 'info';
  cvss?: number;
  proof?: string;
  remediation?: string;
  affected_components?: string[];
  pushed: boolean;  // Pushed to SysReptor
  createdAt: string;
  updatedAt: string;
}
```

## Missing/Needs Improvement 🔴

### 1. Agent Messaging
**Current:** No direct agent-to-user messaging
**Need:**
```
POST   /api/pentests/:id/swarm/agents/:agentId/message - Send message to agent
GET    /api/pentests/:id/swarm/agents/:agentId/messages - Get agent message history
```

### 2. Agent Control
**Need:**
```
POST   /api/pentests/:id/swarm/agents/:agentId/pause    - Pause specific agent
POST   /api/pentests/:id/swarm/agents/:agentId/resume   - Resume specific agent
POST   /api/pentests/:id/swarm/agents/:agentId/cancel   - Cancel agent task
POST   /api/pentests/:id/swarm/agents/:agentId/assign   - Assign new task
```

### 3. Task Management
**Current:** Tasks embedded in SwarmRun
**Need:**
```
GET    /api/pentests/:id/swarm/tasks           - List all tasks
POST   /api/pentests/:id/swarm/tasks           - Create manual task
PUT    /api/pentests/:id/swarm/tasks/:taskId   - Update task
DELETE /api/pentests/:id/swarm/tasks/:taskId   - Delete task
```

### 4. Swarm Configuration
**Need:**
```
GET    /api/pentests/:id/swarm/config          - Get swarm configuration
PUT    /api/pentests/:id/swarm/config          - Update configuration
```
Config includes:
- maxAgents
- maxConcurrentAgents
- thinkingBudget
- autoMergeThreshold
- approvalRequiredFor (tools list)

### 5. Replay System
**Current:** Trace recording exists, no replay endpoint
**Need:**
```
POST   /api/swarm/traces/:id/replay            - Replay trace
GET    /api/swarm/traces/:id/timeline          - Get event timeline
```

### 6. Inter-Agent Communication
**Need:**
```
GET    /api/pentests/:id/swarm/messages        - Get agent-to-agent messages
POST   /api/pentests/:id/swarm/broadcast       - Broadcast to all agents
```

## Frontend Store Mapping

### useSwarmStore expects:
```typescript
interface SwarmStoreState {
  pentestId: string | null;
  run: SwarmRun | null;
  tasks: SwarmTask[];
  agentMessages: AgentMessage[];
  feedMessages: SwarmFeedMessage[];
  lastEventId: number;
  isConnected: boolean;
  connectionError: string | null;

  connect: (pentestId: string) => void;
  disconnect: () => void;
  reset: () => void;
}
```

## SysReptor Integration 🟡

**Current:** Basic integration exists
**Need:**
- Automatic project creation
- Finding sync status tracking
- Bidirectional updates (if finding edited in SysReptor)

```
POST   /api/pentests/:id/swarm/sysreptor/sync     - Sync findings to SysReptor
GET    /api/pentests/:id/swarm/sysreptor/status   - Get sync status
```

## Known Issues ⚠️

1. **Agent Status Lag** - SSE events can arrive out of order
2. **Finding Duplication** - Same finding discovered by multiple agents
3. **Memory Leaks** - Long-running swarms accumulate event history
4. **Replay Accuracy** - Timestamps not preserved exactly in replay

## Performance Considerations

- Swarm SSE streams can generate 100+ events per minute
- Agent status updates every 5 seconds during execution
- Finding discovery triggers immediate SSE push
- Trace recordings can grow large (>10MB for long runs)

## Testing Strategy

### Unit Tests
- Agent state transitions
- Event parsing and handling
- Task allocation logic

### Integration Tests
- Full swarm lifecycle
- SSE stream consistency
- Concurrent agent execution

### E2E Tests
- Replay functionality
- SysReptor integration
- Tool approval flow
