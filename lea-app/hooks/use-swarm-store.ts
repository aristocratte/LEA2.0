import { create } from 'zustand';
import type { SwarmEventEnvelope, SwarmEventPayload, Finding } from '@/types';

type MainThreadMetadata = Record<string, unknown> & {
    agentList?: Array<{ id: string; name: string; role: string; status: string }>;
    approvalId?: string;
    name?: string;
    role?: string;
    riskClass?: string;
};

// The three explicit UI projections from our event log
export interface MainThreadItem {
    id: string;
    type: 'assistant_message' | 'thinking_summary' | 'agent_spawn' | 'approval_request';
    agentRole?: string;
    agentName?: string;
    content: string;
    timestamp: number;
    isStreaming?: boolean;
    metadata?: MainThreadMetadata;
}

export interface ActivityFeedItem {
    id: string;
    type: 'todo' | 'tool_execution' | 'agent_lifecycle';
    agentRole?: string;
    status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
    content: string;
    timestamp: number;
    toolName?: string;
    durationMs?: number;
}

export interface ReviewPaneData {
    id: string;
    title: string;
    summary?: string;
    params?: Record<string, unknown>;
    outputPreview?: string;
    evidence?: string;
    rawJson?: object | string | number | boolean | null;
    timestamp: number;
}

function payloadObject(payload: SwarmEventPayload): Record<string, unknown> {
    return typeof payload === 'object' && payload !== null
        ? payload as unknown as Record<string, unknown>
        : {};
}

function payloadText(payload: SwarmEventPayload): string {
    const text = payloadObject(payload).text;
    return typeof text === 'string' ? text : '';
}

function payloadString(payload: Record<string, unknown>, key: string, fallback = ''): string {
    const value = payload[key];
    return typeof value === 'string' ? value : fallback;
}

function toActivityStatus(value: string): ActivityFeedItem['status'] {
    if (value === 'running' || value === 'completed' || value === 'failed' || value === 'cancelled') {
        return value;
    }
    return 'pending';
}

function objectField(value: unknown): Record<string, unknown> | null {
    return typeof value === 'object' && value !== null ? value as Record<string, unknown> : null;
}

function toFinding(value: unknown): Finding | null {
    const candidate = objectField(value);
    return typeof candidate?.id === 'string' ? candidate as unknown as Finding : null;
}

interface SwarmStoreState {
    // The raw append-only transport log
    eventLog: SwarmEventEnvelope<SwarmEventPayload>[];

    // The normalized findings dictionary
    findings: Record<string, Finding>;

    // Aggregated view of active agents
    activeAgents: Record<string, { role: string; name: string; status: string }>;

    // Derived projections for the UI
    mainThreadItems: MainThreadItem[];
    activityFeed: ActivityFeedItem[];
    reviewPaneData: Record<string, ReviewPaneData>;
    selectedReviewItemId: string | null;

    // Actions
    addEvent: (event: SwarmEventEnvelope<SwarmEventPayload>) => void;
    setSelectedReviewItem: (id: string | null) => void;
    clear: () => void;
}

export const useSwarmStore = create<SwarmStoreState>((set, get) => ({
    eventLog: [],
    findings: {},
    activeAgents: {},
    mainThreadItems: [],
    activityFeed: [],
    reviewPaneData: {},
    selectedReviewItemId: null,

    setSelectedReviewItem: (id) => set({ selectedReviewItemId: id }),
    clear: () => set({
        eventLog: [],
        findings: {},
        activeAgents: {},
        mainThreadItems: [],
        activityFeed: [],
        reviewPaneData: {},
        selectedReviewItemId: null,
    }),

    addEvent: (event) => set((state) => {
        const isDuplicate = state.eventLog.some((current) => {
            if (current.id && current.id === event.id) return true;
            return typeof current.sequence === 'number'
                && typeof event.sequence === 'number'
                && current.runId === event.runId
                && current.sequence === event.sequence;
        });

        if (isDuplicate) {
            return state;
        }

        // 1. Append to raw log
        const eventLog = [...state.eventLog, event];

        // 2. Clone the projections to mutate them
        const mainThreadItems = [...state.mainThreadItems];
        const activityFeed = [...state.activityFeed];
        const reviewPaneData = { ...state.reviewPaneData };
        const findings = { ...state.findings };
        const activeAgents = { ...state.activeAgents };

        // 3. Route and project based on Surface Hint
        switch (event.surfaceHint) {
            case 'main':
                if (event.eventType === 'assistant.message.start' || event.eventType === 'assistant.message.delta' || event.eventType === 'assistant.message.done') {
                    // Find or create message
                    const msgIndex = mainThreadItems.findIndex(m => m.id === `msg-${event.parentEventId || event.correlationId || event.runId}`);
                    if (msgIndex >= 0) {
                        mainThreadItems[msgIndex] = {
                            ...mainThreadItems[msgIndex],
                            content: mainThreadItems[msgIndex].content + payloadText(event.payload),
                            isStreaming: event.eventType !== 'assistant.message.done'
                        };
                    } else {
                        mainThreadItems.push({
                            id: `msg-${event.parentEventId || event.correlationId || event.runId}`,
                            type: 'assistant_message',
                            content: payloadText(event.payload),
                            timestamp: event.timestamp,
                            isStreaming: event.eventType !== 'assistant.message.done',
                            agentRole: 'coordinator'
                        });
                    }
                } else if (event.eventType === 'thinking.summary.start' || event.eventType === 'thinking.summary.delta' || event.eventType === 'thinking.summary.done') {
                    const id = `thinking-${event.parentEventId || event.correlationId || event.runId}`;
                    const msgIndex = mainThreadItems.findIndex(m => m.id === id);
                    if (msgIndex >= 0) {
                        mainThreadItems[msgIndex] = {
                            ...mainThreadItems[msgIndex],
                            content: mainThreadItems[msgIndex].content + payloadText(event.payload),
                            isStreaming: event.eventType !== 'thinking.summary.done'
                        };
                    } else {
                        mainThreadItems.push({
                            id,
                            type: 'thinking_summary',
                            content: payloadText(event.payload),
                            timestamp: event.timestamp,
                            isStreaming: event.eventType !== 'thinking.summary.done',
                            agentRole: 'coordinator'
                        });
                    }
                } else if (event.eventType === 'approval.requested') {
                    const payload = payloadObject(event.payload);
                    mainThreadItems.push({
                        id: String(event.correlationId || event.id),
                        type: 'approval_request',
                        content: `Approval required for tool: ${payloadString(payload, 'tool', 'unknown')}`,
                        timestamp: event.timestamp,
                        metadata: {
                            ...payload,
                            approvalId: event.correlationId || event.id,
                        }
                    });
                }
                break;

            case 'activity':
                if (event.eventType.startsWith('agent.')) {
                    const payload = payloadObject(event.payload);
                    const agentId = payloadString(payload, 'agentId');
                    if (agentId) {
                        const role = payloadString(payload, 'role', 'agent');
                        const name = payloadString(payload, 'name', 'Agent');
                        const status = event.eventType.split('.')[1] || 'pending';
                        activeAgents[agentId] = {
                            role,
                            name,
                            status
                        };
                        activityFeed.push({
                            id: event.id,
                            type: 'agent_lifecycle',
                            agentRole: role,
                            status: toActivityStatus(status),
                            content: `Agent ${name} (${role}) ${status}`,
                            timestamp: event.timestamp
                        });
                    }
                } else if (event.eventType.startsWith('todo.')) {
                    const p = payloadObject(event.payload);
                    const todo = objectField(p.todo);
                    if (todo) {
                        const todoId = payloadString(todo, 'id');
                        const todoStatus = payloadString(todo, 'status', 'pending').toLowerCase();
                        const todoLabel = payloadString(todo, 'label');
                        const todoOwner = payloadString(todo, 'owner');
                        const existingIdx = activityFeed.findIndex(a => a.id === `todo-${todoId}`);
                        if (existingIdx >= 0) {
                            activityFeed[existingIdx] = {
                                ...activityFeed[existingIdx],
                                status: toActivityStatus(todoStatus),
                                content: todoLabel
                            };
                        } else {
                            activityFeed.push({
                                id: `todo-${todoId}`,
                                type: 'todo',
                                status: toActivityStatus(todoStatus),
                                content: todoLabel,
                                timestamp: event.timestamp,
                                agentRole: todoOwner
                            });
                        }
                    }
                } else if (event.eventType === 'tool.call.started' || event.eventType === 'tool.call.completed') {
                    const p = payloadObject(event.payload);
                    const id = `tool-${event.correlationId}`;
                    const existingIdx = activityFeed.findIndex(a => a.id === id);
                    if (existingIdx >= 0) {
                        activityFeed[existingIdx] = {
                            ...activityFeed[existingIdx],
                            status: event.eventType === 'tool.call.completed' ? 'completed' : 'running'
                        };
                    } else {
                        activityFeed.push({
                            id,
                            type: 'tool_execution',
                            status: event.eventType === 'tool.call.completed' ? 'completed' : 'running',
                            content: `Tool Execution: ${payloadString(p, 'toolName', 'tool')}`,
                            toolName: payloadString(p, 'toolName', 'tool'),
                            timestamp: event.timestamp,
                        });
                    }
                } else if (event.eventType === 'finding' || event.eventType === 'finding.created' || event.eventType === 'finding.updated') {
                    // We just store raw findings in the store for other components
                    const p = payloadObject(event.payload);
                    const dataFinding = toFinding(p.data);
                    if (dataFinding) findings[dataFinding.id] = dataFinding;
                    const findingId = payloadString(p, 'findingId');
                    if (findingId) findings[findingId] = { ...p, id: findingId } as unknown as Finding;
                }
                break;

            case 'review':
                // Store raw inputs and outputs in the review pane
                const reviewId = event.correlationId || event.id;
                const payload = payloadObject(event.payload);
                reviewPaneData[reviewId] = {
                    id: reviewId,
                    title: payloadString(payload, 'title', `Review: ${event.eventType}`),
                    timestamp: event.timestamp,
                    rawJson: event.payload
                };
                if (event.eventType === 'artifact.created' || event.eventType === 'artifact.updated' || event.eventType.startsWith('terminal.stream.')) {
                    activityFeed.push({
                        id: reviewId,
                        type: event.eventType.startsWith('terminal.stream.') ? 'tool_execution' : 'agent_lifecycle',
                        status: event.eventType === 'terminal.stream.done' || event.eventType === 'artifact.updated' ? 'completed' : 'running',
                        content: payloadString(payload, 'title', payloadString(payload, 'artifactId', event.eventType)),
                        timestamp: event.timestamp,
                        toolName: payloadString(payload, 'toolName'),
                    });
                }
                break;
        }

        return { eventLog, mainThreadItems, activityFeed, reviewPaneData, activeAgents, findings };
    })
}));
