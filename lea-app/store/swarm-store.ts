'use client';

import { create } from 'zustand';
import { getSwarmStreamUrl } from '@/lib/api';
import { runtimeClient, type RuntimeClientConnection } from '@/lib/runtime/runtime-client';
import { toast } from '@/hooks/use-toast';
import type { SwarmRun, SwarmTask, AgentMessage, SwarmFeedMessage, SwarmAgent, SwarmFinding } from '@/types';

// ─── Types ─────────────────────────────────────────────────────────────────────

interface PendingApproval {
  approvalId: string;
  toolName: string;
  toolInput: Record<string, unknown>;
  agentId: string;
  timestamp: string;
}

interface SwarmStoreState {
  pentestId: string | null;
  run: SwarmRun | null;
  tasks: SwarmTask[];
  agentMessages: AgentMessage[];
  feedMessages: SwarmFeedMessage[];
  lastEventId: string | null;
  isConnected: boolean;
  connectionError: string | null;
  pendingApproval: PendingApproval | null;

  connect: (pentestId: string) => void;
  disconnect: () => void;
  reset: () => void;
  updateFinding: (updated: SwarmFinding) => void;
  setPendingApproval: (approval: PendingApproval | null) => void;
  clearPendingApproval: () => void;
}

// ─── Module-level SSE state (outside React) ────────────────────────────────────

let _eventSource: RuntimeClientConnection | null = null;
let _connectedPentestId: string | null = null;
let _flushTimer: ReturnType<typeof setTimeout> | null = null;
let _pendingFeedMessages: SwarmFeedMessage[] = [];
let _activeLegacyMessageId: string | null = null;
let _activeLegacyMessageContent = '';
let _legacyMessageFlushTimer: ReturnType<typeof setTimeout> | null = null;
let _pendingLegacyMessage: SwarmFeedMessage | null = null;

const LEGACY_MESSAGE_FLUSH_MS = 300;

function scheduleFlush() {
  if (_flushTimer !== null) return;
  _flushTimer = setTimeout(() => {
    _flushTimer = null;
    if (_pendingFeedMessages.length === 0) return;
    const batch = _pendingFeedMessages.splice(0);
    useSwarmStore.setState((s) => ({
      feedMessages: [...s.feedMessages, ...batch].slice(-150),
    }));
  }, 150);
}

function appendFeedMessage(message: SwarmFeedMessage) {
  useSwarmStore.setState((s) => ({
    feedMessages: [...s.feedMessages, message].slice(-150),
  }));
}

function upsertFeedMessage(message: SwarmFeedMessage) {
  useSwarmStore.setState((s) => {
    const index = s.feedMessages.findIndex((current) => current.id === message.id);
    if (index === -1) {
      return { feedMessages: [...s.feedMessages, message].slice(-150) };
    }

    const existing = s.feedMessages[index];
    if (
      existing.content === message.content &&
      existing.timestamp === message.timestamp &&
      existing.toolName === message.toolName &&
      existing.level === message.level
    ) {
      return s;
    }

    const feedMessages = [...s.feedMessages];
    feedMessages[index] = {
      ...existing,
      ...message,
      content: message.content,
      timestamp: message.timestamp,
    };
    return { feedMessages };
  });
}

function flushLegacyMessage() {
  if (_legacyMessageFlushTimer) {
    clearTimeout(_legacyMessageFlushTimer);
    _legacyMessageFlushTimer = null;
  }

  const message = _pendingLegacyMessage;
  _pendingLegacyMessage = null;
  if (message) {
    upsertFeedMessage(message);
  }
}

function scheduleLegacyMessageFlush() {
  if (_legacyMessageFlushTimer) return;
  _legacyMessageFlushTimer = setTimeout(() => {
    _legacyMessageFlushTimer = null;
    flushLegacyMessage();
  }, LEGACY_MESSAGE_FLUSH_MS);
}

function buildSystemFeedMessage(
  runId: string,
  content: string,
  timestamp: number,
  level?: 'error',
): SwarmFeedMessage {
  return {
    id: `${runId || 'run'}-${timestamp}-${Math.random().toString(36).slice(2, 7)}`,
    swarmRunId: runId,
    source: 'system',
    content,
    level,
    timestamp,
  };
}

function parseEventData(event: MessageEvent): Record<string, unknown> {
  try {
    return JSON.parse(typeof event.data === 'string' ? event.data : '{}') as Record<string, unknown>;
  } catch {
    return {};
  }
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function normalizeEventCursor(value: unknown): string | null {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }

  if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
    return String(Math.floor(value));
  }

  return null;
}

function normalizeAgentStatus(type: string): SwarmAgent['status'] {
  switch (type) {
    case 'agent.spawning':
      return 'SPAWNED';
    case 'agent.completed':
      return 'DONE';
    case 'agent.failed':
    case 'agent.cancelled':
      return 'FAILED';
    default:
      return 'THINKING';
  }
}

function normalizeFindingSeverity(value: unknown): SwarmFinding['severity'] {
  const normalized = String(value || '').toLowerCase();
  if (normalized === 'critical' || normalized === 'high' || normalized === 'medium' || normalized === 'low') {
    return normalized;
  }
  return 'info';
}

function timestampToIso(value: unknown): string {
  const parsed = Number(value);
  if (Number.isFinite(parsed) && parsed > 0) {
    return new Date(parsed).toISOString();
  }
  return new Date().toISOString();
}

function upsertAgent(run: SwarmRun, next: SwarmAgent): SwarmRun {
  const agentMap = new Map(run.agents.map((agent) => [agent.id, agent]));
  const current = agentMap.get(next.id);
  agentMap.set(next.id, current ? { ...current, ...next } : next);
  return { ...run, agents: Array.from(agentMap.values()) };
}

function upsertFinding(run: SwarmRun, next: SwarmFinding): SwarmRun {
  const findingMap = new Map(run.findings.map((finding) => [finding.id, finding]));
  const current = findingMap.get(next.id);
  findingMap.set(next.id, current ? { ...current, ...next } : next);
  return { ...run, findings: Array.from(findingMap.values()) };
}

function createRunSkeleton(
  pentestId: string,
  params: {
    runId: string;
    target?: string;
    task?: string;
    status?: SwarmRun['status'];
    maxAgents?: number;
    maxConcurrentAgents?: number;
  }
): SwarmRun {
  return {
    id: params.runId,
    pentestId,
    target: params.target || '',
    task: params.task,
    status: params.status || 'RUNNING',
    maxAgents: params.maxAgents ?? 8,
    maxConcurrentAgents: params.maxConcurrentAgents ?? 5,
    forceMerged: false,
    agents: [],
    findings: [],
    tasks: [],
    startedAt: new Date().toISOString(),
  };
}

function updateLastEventId(event: MessageEvent, candidateFromEnvelope?: unknown) {
  const id = normalizeEventCursor(event.lastEventId) ?? normalizeEventCursor(candidateFromEnvelope);
  if (id) {
    useSwarmStore.setState(() => ({
      lastEventId: id,
    }));
  }
}

// ─── Store ─────────────────────────────────────────────────────────────────────

export const useSwarmStore = create<SwarmStoreState>((set, get) => ({
  pentestId: null,
  run: null,
  tasks: [],
  agentMessages: [],
  feedMessages: [],
  lastEventId: null,
  isConnected: false,
  connectionError: null,
  pendingApproval: null,

  connect: (pentestId: string) => {
    // Don't reconnect to same pentest
    if (_connectedPentestId === pentestId && _eventSource) return;

    // Close existing connection
    if (_eventSource) {
      _eventSource.close();
      _eventSource = null;
    }

    const previousPentestId = _connectedPentestId;
    _connectedPentestId = pentestId;
    _activeLegacyMessageId = null;
    set({
      pentestId,
      isConnected: false,
      connectionError: null,
      lastEventId: previousPentestId === pentestId ? get().lastEventId : null,
    });

    // Pre-fetch current run state so UI can transition immediately
    import('@/lib/api').then(({ pentestsApi }) => {
      pentestsApi.getSwarmState(pentestId).then((res) => {
        if (res?.data) {
          set((s) => ({ run: s.run ? { ...s.run, ...res.data } : res.data }));
        }
      }).catch(() => { /* ignore */ });
    });

    const { lastEventId } = get();
    const url = getSwarmStreamUrl(pentestId, lastEventId);
    const handleSseEvent = (type: string, event: MessageEvent) => {
      const envelope = parseEventData(event);
      const payload = asRecord(envelope.payload);
      const eventType = String(envelope.eventType || type);
      const runId = String(envelope.runId ?? payload.swarmRunId ?? '');
      const eventTimestamp = Number(envelope.timestamp ?? payload.timestamp) || Date.now();
      updateLastEventId(event, envelope.id);

      if (eventType === 'swarm_connected') {
        set({ isConnected: true });
        return;
      }

      if (eventType === 'status_change') {
        const status = String(payload.status || '').toUpperCase();
        if (!status) return;

        const mappedStatus: SwarmRun['status'] =
          status === 'ERROR'
            ? 'FAILED'
            : status === 'CANCELLED'
              ? 'FAILED'
              : status === 'COMPLETED'
                ? 'COMPLETED'
                : status === 'PAUSED'
                  ? 'PAUSED'
                  : 'RUNNING';

        set((s) => {
          const run = s.run ?? createRunSkeleton(pentestId, {
            runId: runId || pentestId,
            target: String(payload.target ?? ''),
            status: mappedStatus,
          });
          return {
            run: {
              ...run,
              status: mappedStatus,
              endedAt: mappedStatus === 'FAILED' || mappedStatus === 'COMPLETED'
                ? new Date(eventTimestamp).toISOString()
                : run.endedAt,
            },
          };
        });
        return;
      }

      if (eventType === 'message_start') {
        flushLegacyMessage();
        _activeLegacyMessageId = String(envelope.id || `legacy-message-${eventTimestamp}`);
        _activeLegacyMessageContent = '';
        _pendingLegacyMessage = null;
        upsertFeedMessage({
          id: _activeLegacyMessageId,
          swarmRunId: runId || pentestId,
          source: 'system',
          content: '',
          timestamp: eventTimestamp,
        });
        return;
      }

      if (eventType === 'message_delta') {
        const chunk = String(payload.text ?? payload.chunk ?? '');
        if (!chunk) return;

        const messageId = _activeLegacyMessageId || String(envelope.id || `legacy-message-${eventTimestamp}`);
        _activeLegacyMessageId = messageId;
        _activeLegacyMessageContent += chunk;
        _pendingLegacyMessage = {
          id: messageId,
          swarmRunId: runId || pentestId,
          source: 'system',
          content: _activeLegacyMessageContent,
          timestamp: eventTimestamp,
        };
        scheduleLegacyMessageFlush();
        return;
      }

      if (eventType === 'message_end') {
        flushLegacyMessage();
        _activeLegacyMessageId = null;
        _activeLegacyMessageContent = '';
        return;
      }

      if (eventType === 'tool_start') {
        const name = String(payload.name ?? payload.toolName ?? 'tool');
        appendFeedMessage(buildSystemFeedMessage(
          runId || pentestId,
          `Running \`${name}\`…`,
          eventTimestamp,
        ));
        return;
      }

      if (eventType === 'tool_end') {
        const name = String(payload.name ?? payload.toolName ?? 'tool');
        const success = payload.success !== false;
        const output = String(payload.output ?? '').trim();
        appendFeedMessage(buildSystemFeedMessage(
          runId || pentestId,
          success
            ? `\`${name}\` completed${output ? `:\n\n${output.slice(0, 1200)}` : '.'}`
            : `[!] \`${name}\` failed${output ? `:\n\n${output.slice(0, 1200)}` : '.'}`,
          eventTimestamp,
          success ? undefined : 'error',
        ));
        return;
      }

      if (eventType === 'error') {
        const message = String(payload.message || 'Pentest runtime failed');
        const code = payload.code ? ` (${String(payload.code)})` : '';
        const details = Array.isArray(payload.errors)
          ? `\n\n${payload.errors.map((entry) => `- ${String(entry)}`).join('\n')}`
          : '';

        set((s) => {
          const run = s.run ?? createRunSkeleton(pentestId, {
            runId: runId || pentestId,
            target: String(payload.target ?? ''),
            status: 'FAILED',
          });
          return {
            connectionError: `${message}${code}`,
            run: {
              ...run,
              status: 'FAILED',
              endedAt: new Date(eventTimestamp).toISOString(),
            },
          };
        });
        appendFeedMessage(buildSystemFeedMessage(
          runId || pentestId,
          `[!] Runtime failed${code}: ${message}${details}`,
          eventTimestamp,
          'error',
        ));
        toast.error(`Pentest failed: ${message}`);
        return;
      }

      if (eventType === 'swarm.started' || eventType === 'swarm_started') {
        set((s) => ({
          run: s.run
            ? {
                ...s.run,
                id: runId || s.run.id,
                target: String(payload.target ?? s.run.target ?? ''),
                task: (payload.task as string | undefined) ?? s.run.task,
                status: (payload.status as SwarmRun['status']) || 'RUNNING',
                maxAgents: Number(payload.maxAgents ?? s.run.maxAgents ?? 8),
                maxConcurrentAgents: Number(payload.maxConcurrentAgents ?? s.run.maxConcurrentAgents ?? 5),
              }
            : createRunSkeleton(pentestId, {
                runId,
                target: String(payload.target ?? ''),
                task: payload.task as string | undefined,
                status: (payload.status as SwarmRun['status']) || 'RUNNING',
                maxAgents: Number(payload.maxAgents ?? 8),
                maxConcurrentAgents: Number(payload.maxConcurrentAgents ?? 5),
              }),
        }));
        return;
      }

      if (eventType === 'agent_spawned') {
        const agent = payload.agent as SwarmAgent | undefined;
        if (!agent) return;
        set((s) => {
          const run = s.run ?? createRunSkeleton(pentestId, {
            runId: runId || agent.swarmRunId,
            target: String(payload.target ?? ''),
            status: 'RUNNING',
          });
          return { run: upsertAgent(run, agent) };
        });
        return;
      }

      if (eventType === 'agent_status') {
        const agent = payload.agent as SwarmAgent | undefined;
        if (!agent) return;
        set((s) => {
          const run = s.run ?? createRunSkeleton(pentestId, {
            runId: runId || agent.swarmRunId,
            target: String(payload.target ?? ''),
            status: 'RUNNING',
          });
          return { run: upsertAgent(run, agent) };
        });
        return;
      }

      if (
        eventType === 'agent.drafted' ||
        eventType === 'agent.spawning' ||
        eventType === 'agent.running' ||
        eventType === 'agent.completed' ||
        eventType === 'agent.failed' ||
        eventType === 'agent.cancelled'
      ) {
        set((s) => {
          const run = s.run ?? createRunSkeleton(pentestId, {
            runId,
            target: '',
            status: 'RUNNING',
          });
          const existing = run.agents.find((agent) => agent.id === payload.agentId);
          const status = normalizeAgentStatus(eventType);
          const nextAgent: SwarmAgent = {
            id: String(payload.agentId ?? existing?.id ?? ''),
            swarmRunId: runId || run.id,
            name: String(payload.name ?? existing?.name ?? payload.role ?? 'Agent'),
            role: String(payload.role ?? existing?.role ?? 'specialist'),
            status,
            progress: status === 'DONE' || status === 'FAILED' ? 100 : existing?.progress ?? 50,
            toolName: existing?.toolName,
            lastMessage: existing?.lastMessage,
            createdAt: existing?.createdAt ?? timestampToIso(eventTimestamp),
            updatedAt: timestampToIso(eventTimestamp),
          };
          return nextAgent.id ? { run: upsertAgent(run, nextAgent) } : s;
        });
        return;
      }

      if (eventType === 'finding_created' || eventType === 'finding_updated') {
        const finding = payload.finding as SwarmFinding | undefined;
        if (!finding) return;
        set((s) => {
          const run = s.run ?? createRunSkeleton(pentestId, {
            runId: runId || finding.swarmRunId,
            target: '',
            status: 'RUNNING',
          });
          return { run: upsertFinding(run, finding) };
        });
        return;
      }

      if (eventType === 'finding.created' || eventType === 'finding.updated') {
        set((s) => {
          const run = s.run ?? createRunSkeleton(pentestId, {
            runId,
            target: '',
            status: 'RUNNING',
          });
          const existing = run.findings.find((finding) => finding.id === payload.findingId);
          const nextFinding: SwarmFinding = {
            id: String(payload.findingId ?? existing?.id ?? ''),
            pentestId: run.pentestId,
            swarmRunId: runId || run.id,
            agentId: existing?.agentId || String(payload.agentId ?? ''),
            title: String(payload.title ?? existing?.title ?? 'Finding'),
            description: existing?.description || String(payload.title ?? 'Finding'),
            severity: normalizeFindingSeverity(payload.severity ?? existing?.severity),
            cvss: existing?.cvss,
            proof: existing?.proof,
            remediation: existing?.remediation,
            affected_components: existing?.affected_components,
            pushed: existing?.pushed ?? false,
            createdAt: existing?.createdAt ?? timestampToIso(eventTimestamp),
            updatedAt: timestampToIso(eventTimestamp),
          };
          return nextFinding.id ? { run: upsertFinding(run, nextFinding) } : s;
        });
        return;
      }

      if (eventType === 'task_created') {
        const task = payload.task as SwarmTask | undefined;
        if (!task) return;
        set((s) => ({
          tasks: [...s.tasks.filter((t) => t.id !== task.id), task].slice(-200),
        }));
        return;
      }

      if (eventType === 'task_updated') {
        const task = payload.task as SwarmTask | undefined;
        if (!task) return;
        set((s) => ({
          tasks: s.tasks.map((t) => t.id === task.id ? { ...t, ...task } : t),
        }));
        return;
      }

      if (eventType === 'agent_message') {
        const message = payload.message as AgentMessage | undefined;
        if (!message) return;
        set((s) => ({
          agentMessages: [...s.agentMessages, message].slice(-200),
        }));
        return;
      }

      if (eventType === 'swarm.paused' || eventType === 'swarm_paused') {
        set((s) => s.run ? { run: { ...s.run, status: 'PAUSED' } } : s);
        return;
      }
      if (eventType === 'swarm.resumed' || eventType === 'swarm_resumed') {
        set((s) => s.run ? { run: { ...s.run, status: 'RUNNING' } } : s);
        return;
      }
      if (eventType === 'swarm_merged') {
        set((s) => s.run ? { run: { ...s.run, status: 'MERGING' } } : s);
        return;
      }
      if (eventType === 'swarm.completed' || eventType === 'swarm_completed') {
        set((s) => s.run ? {
          run: {
            ...s.run,
            status: (payload.status as SwarmRun['status']) || 'COMPLETED',
            sysReptorProjectId: payload.sysReptorProjectId as string | undefined || s.run.sysReptorProjectId,
            endedAt: new Date().toISOString(),
          }
        } : s);
        return;
      }
      if (eventType === 'swarm.failed' || eventType === 'swarm_failed') {
        set((s) => s.run ? { run: { ...s.run, status: 'FAILED', endedAt: new Date().toISOString() } } : s);
        toast.error('Swarm run failed — check agent logs for details.');
        return;
      }
      if (eventType === 'approval.requested' || eventType === 'tool_approval_required') {
        const approvalId = String(
          envelope.correlationId
            ?? envelope.id
            ?? payload.approvalId
            ?? payload.requestId
            ?? '',
        );
        const approval = {
          approvalId,
          toolName: String(payload.toolName ?? payload.tool ?? ''),
          toolInput: (payload.toolInput as Record<string, unknown>) ?? {},
          agentId: String(payload.agentId ?? ''),
          timestamp: new Date(eventTimestamp).toISOString(),
        };
        if (approval.approvalId) {
          set({ pendingApproval: approval });
        }
        return;
      }
    };

    const eventTypes = [
      'message',
      'swarm_connected',
      'swarm.started', 'swarm.paused', 'swarm.resumed', 'swarm.completed', 'swarm.failed',
      'swarm_started', 'swarm_paused', 'swarm_resumed', 'swarm_merged', 'swarm_completed', 'swarm_failed',
      'status_change', 'phase_change', 'message_start', 'message_delta', 'message_end', 'tool_start', 'tool_end', 'error',
      'agent.drafted', 'agent.spawning', 'agent.running', 'agent.completed', 'agent.failed', 'agent.cancelled',
      'agent_spawned', 'agent_status',
      'finding.created', 'finding.updated', 'finding_created', 'finding_updated',
      'task_created', 'task_updated', 'agent_message',
      'approval.requested', 'tool_approval_required',
    ];
    _eventSource = runtimeClient.connect({
      url,
      eventTypes,
      onError: () => {
        set({ isConnected: false, connectionError: 'SSE connection lost' });
        toast.error('SSE connection lost — attempting to reconnect…');
      },
      onEvent: (type, event) => {
        if (type === 'message') {
          const envelope = parseEventData(event);
          const payload = asRecord(envelope.payload);
          updateLastEventId(event, envelope.id);
          if (!payload.content && !payload.source) return;
          const msg: SwarmFeedMessage = {
            id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
            swarmRunId: String(envelope.runId ?? payload.swarmRunId ?? ''),
            source: String(payload.source ?? 'system'),
            agentId: payload.agentId as string | undefined,
            content: String(payload.content ?? ''),
            toolName: payload.toolName as string | undefined,
            findingId: payload.findingId as string | undefined,
            severity: payload.severity as string | undefined,
            level: payload.level as 'error' | undefined,
            timestamp: Number(envelope.timestamp ?? payload.timestamp) || Date.now(),
          };
          _pendingFeedMessages.push(msg);
          scheduleFlush();
          return;
        }
        handleSseEvent(type, event);
      },
    });
  },

  updateFinding: (updated: SwarmFinding) => {
    set((s) => {
      if (!s.run) return s;
      const findings = s.run.findings.map((f) =>
        f.id === updated.id ? { ...f, ...updated } : f
      );
      return { run: { ...s.run, findings } };
    });
  },

  setPendingApproval: (approval) => {
    set({ pendingApproval: approval });
  },

  clearPendingApproval: () => {
    set({ pendingApproval: null });
  },

  disconnect: () => {
    if (_eventSource) {
      _eventSource.close();
      _eventSource = null;
    }
    _connectedPentestId = null;
    _activeLegacyMessageId = null;
    _activeLegacyMessageContent = '';
    _pendingLegacyMessage = null;
    if (_legacyMessageFlushTimer) {
      clearTimeout(_legacyMessageFlushTimer);
      _legacyMessageFlushTimer = null;
    }
    set({ isConnected: false });
  },

  reset: () => {
    if (_eventSource) {
      _eventSource.close();
      _eventSource = null;
    }
    _connectedPentestId = null;
    _activeLegacyMessageId = null;
    _activeLegacyMessageContent = '';
    _pendingLegacyMessage = null;
    _pendingFeedMessages = [];
    if (_flushTimer) {
      clearTimeout(_flushTimer);
      _flushTimer = null;
    }
    if (_legacyMessageFlushTimer) {
      clearTimeout(_legacyMessageFlushTimer);
      _legacyMessageFlushTimer = null;
    }
    set({
      pentestId: null, run: null, tasks: [], agentMessages: [],
      feedMessages: [], lastEventId: null, isConnected: false, connectionError: null,
      pendingApproval: null,
    });
  },
}));
