import { create } from 'zustand';
import type { SwarmEventEnvelope, SwarmEventPayload, Finding } from '@/types';

// The three explicit UI projections from our event log
export interface MainThreadItem {
    id: string;
    type: 'assistant_message' | 'thinking_summary' | 'agent_spawn' | 'approval_request';
    agentRole?: string;
    agentName?: string;
    content: string;
    timestamp: number;
    isStreaming?: boolean;
    metadata?: any;
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
    params?: any;
    outputPreview?: string;
    evidence?: string;
    rawJson?: any;
    timestamp: number;
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
                            content: mainThreadItems[msgIndex].content + (event.payload as any).text,
                            isStreaming: event.eventType !== 'assistant.message.done'
                        };
                    } else {
                        mainThreadItems.push({
                            id: `msg-${event.parentEventId || event.correlationId || event.runId}`,
                            type: 'assistant_message',
                            content: (event.payload as any).text || '',
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
                            content: mainThreadItems[msgIndex].content + (event.payload as any).text,
                            isStreaming: event.eventType !== 'thinking.summary.done'
                        };
                    } else {
                        mainThreadItems.push({
                            id,
                            type: 'thinking_summary',
                            content: (event.payload as any).text || '',
                            timestamp: event.timestamp,
                            isStreaming: event.eventType !== 'thinking.summary.done',
                            agentRole: 'coordinator'
                        });
                    }
                } else if (event.eventType === 'approval.requested') {
                    mainThreadItems.push({
                        id: String(event.correlationId || event.id),
                        type: 'approval_request',
                        content: `Approval required for tool: ${(event.payload as any).tool}`,
                        timestamp: event.timestamp,
                        metadata: {
                            ...(event.payload as any),
                            approvalId: event.correlationId || event.id,
                        }
                    });
                }
                break;

            case 'activity':
                if (event.eventType.startsWith('agent.')) {
                    const payload = event.payload as any;
                    if (payload.agentId) {
                        activeAgents[payload.agentId] = {
                            role: payload.role,
                            name: payload.name,
                            status: event.eventType.split('.')[1]
                        };
                        activityFeed.push({
                            id: event.id,
                            type: 'agent_lifecycle',
                            agentRole: payload.role,
                            status: event.eventType.split('.')[1] as any,
                            content: `Agent ${payload.name} (${payload.role}) ${event.eventType.split('.')[1]}`,
                            timestamp: event.timestamp
                        });
                    }
                } else if (event.eventType.startsWith('todo.')) {
                    const p = event.payload as any;
                    if (p.todo) {
                        const existingIdx = activityFeed.findIndex(a => a.id === `todo-${p.todo.id}`);
                        if (existingIdx >= 0) {
                            activityFeed[existingIdx] = {
                                ...activityFeed[existingIdx],
                                status: p.todo.status.toLowerCase(),
                                content: p.todo.label
                            };
                        } else {
                            activityFeed.push({
                                id: `todo-${p.todo.id}`,
                                type: 'todo',
                                status: p.todo.status.toLowerCase() as any,
                                content: p.todo.label,
                                timestamp: event.timestamp,
                                agentRole: p.todo.owner
                            });
                        }
                    }
                } else if (event.eventType === 'tool.call.started' || event.eventType === 'tool.call.completed') {
                    const p = event.payload as any;
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
                            content: `Tool Execution: ${p.toolName}`,
                            toolName: p.toolName,
                            timestamp: event.timestamp,
                        });
                    }
                } else if (event.eventType === 'finding' || event.eventType === 'finding.created' || event.eventType === 'finding.updated') {
                    // We just store raw findings in the store for other components
                    const p = event.payload as any;
                    if (p.data) findings[p.data.id] = p.data;
                    if (p.findingId) findings[p.findingId] = p as any;
                }
                break;

            case 'review':
                // Store raw inputs and outputs in the review pane
                const reviewId = event.correlationId || event.id;
                const payload = event.payload as any;
                reviewPaneData[reviewId] = {
                    id: reviewId,
                    title: payload.title || `Review: ${event.eventType}`,
                    timestamp: event.timestamp,
                    rawJson: event.payload
                };
                if (event.eventType === 'artifact.created' || event.eventType === 'artifact.updated' || event.eventType.startsWith('terminal.stream.')) {
                    activityFeed.push({
                        id: reviewId,
                        type: event.eventType.startsWith('terminal.stream.') ? 'tool_execution' : 'agent_lifecycle',
                        status: event.eventType === 'terminal.stream.done' || event.eventType === 'artifact.updated' ? 'completed' : 'running',
                        content: payload.title || payload.artifactId || event.eventType,
                        timestamp: event.timestamp,
                        toolName: payload.toolName,
                    });
                }
                break;
        }

        return { eventLog, mainThreadItems, activityFeed, reviewPaneData, activeAgents, findings };
    })
}));
