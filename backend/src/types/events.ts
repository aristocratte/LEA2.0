type StructuredSwarmEventPayload =
    // Nia conversational voice
    | { type: 'assistant.preamble'; text: string }
    | { type: 'assistant.message.start' | 'assistant.message.delta' | 'assistant.message.done'; text: string }
    // Nia's short user-facing summary
    | { type: 'thinking.summary.start' | 'thinking.summary.delta' | 'thinking.summary.done'; text: string }

    // Agent lifecycles
    | { type: 'agent.drafted' | 'agent.spawning' | 'agent.running' | 'agent.completed' | 'agent.failed' | 'agent.cancelled'; agentId: string; role: string; name: string }

    // Orchestration & Tasks
    | {
        type: 'todo.created' | 'todo.updated' | 'todo.completed';
        todo: {
            id: string;
            label: string;
            status: string;
            priority: string;
            owner: string;
            dependsOn?: string[];
            kind: string;
            createdAt: number
        }
    }

    // Tech execution (Terminal / MCP / Tools)
    | { type: 'tool.call.started' | 'tool.call.completed'; toolName: string; agentId: string; }
    | { type: 'terminal.stream.started' | 'terminal.stream.delta' | 'terminal.stream.done'; streamId: string; streamType: 'stdout' | 'stderr'; chunk: string }
    | { type: 'mcp.call.started' | 'mcp.call.completed'; target: string }

    // Artifacts & Real Risk-Model Approvals
    | { type: 'artifact.created' | 'artifact.updated'; artifactId: string; title: string; reviewId: string }
    | {
        type: 'approval.requested' | 'approval.resolved';
        tool: string;
        decision?: string;
        scope: string[];
        riskClass: 'read' | 'write' | 'exec' | 'network' | 'active_scan' | 'destructive';
        sandboxProfile?: string;
        requiresEscalation: boolean;
        affectedTargets: string[]
    }

    // Swarm global lifecycle
    | { type: 'swarm.connected'; connectionId: string; pentestId: string }
    | { type: 'swarm.started'; status: string; target: string }
    | { type: 'swarm.paused' }
    | { type: 'swarm.resumed' }
    | { type: 'swarm.completed' | 'swarm.failed'; status: string; error?: string; findingsCount?: number; sysReptorProjectId?: string | null }

    // Legacy / Data findings (mapped to the new unified structure)
    | { type: 'finding.created' | 'finding.updated'; findingId: string; title: string; severity: string };

export const legacySseEventTypes = [
    'agentSpawned',
    'agent_spawned',
    'agent_status',
    'complete',
    'connected',
    'context_compacted',
    'context_compaction_started',
    'error',
    'finding',
    'finding_created',
    'finding_updated',
    'findings_agent_status',
    'context_usage',
    'message',
    'message_delta',
    'message_end',
    'message_start',
    'phase_change',
    'preflight_blocked',
    'preflight_check',
    'preflight_complete',
    'preflight_remediation',
    'preflight_started',
    'scope_review_applied',
    'scope_review_required',
    'scope_review_updated',
    'session_cancelled',
    'session_complete',
    'status_change',
    'swarm_completed',
    'swarm_connected',
    'swarm_failed',
    'swarm_merged',
    'swarm_paused',
    'swarm_resumed',
    'swarm_started',
    'task_created',
    'task_updated',
    'thinking_delta',
    'thinking_end',
    'thinking_start',
    'tool_approval_required',
    'tool_end',
    'tool_start',
    'todos_updated',
] as const;

export type LegacySseEventType = typeof legacySseEventTypes[number];

export type LegacySseEventPayload<T extends LegacySseEventType = LegacySseEventType> = {
    type: T;
} & Record<string, unknown>;

export type SwarmEventPayload = StructuredSwarmEventPayload | LegacySseEventPayload;

export interface SwarmEventEnvelope<T extends SwarmEventPayload> {
    id: string;
    sequence: number;
    timestamp: number;
    runId: string;
    threadId?: string;
    correlationId?: string;
    parentEventId?: string;
    source: string;
    audience: 'user' | 'internal' | 'debug';
    surfaceHint: 'main' | 'activity' | 'review' | 'none';
    eventType: T['type'];
    payload: T;
}

export type SwarmEventType = SwarmEventPayload['type'];

export type SwarmEvent = {
    [K in SwarmEventType]: SwarmEventEnvelope<Extract<SwarmEventPayload, { type: K }>>;
}[SwarmEventType];
