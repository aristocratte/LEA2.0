import { randomUUID } from 'node:crypto';
import type { SwarmEventPayload } from '../../types/events.js';
import type { Agent, StartSwarmParams, Swarm } from '../../types/swarm.js';
import { applyEnvelopeToRun } from './SwarmRuntimeState.js';
import { ScenarioClock } from './ScenarioClock.js';
import type { ScenarioDefinition, ScenarioFactory, ScenarioStep } from './ScenarioModel.js';
import type { SwarmRuntime, SwarmRuntimeControlCommand, SwarmRuntimeStartParams } from './SwarmRuntime.js';
import type { SwarmTraceRecorder } from './SwarmTraceRecorder.js';
import type { SwarmEmitter } from '../../agents/PentestSwarm.js';

interface ApprovalWaiter {
  resolve: (decision: 'approved' | 'denied') => void;
}

interface ScenarioSession {
  scenario: ScenarioDefinition;
  run: Swarm;
  clock: ScenarioClock;
  pendingApprovals: Map<string, ApprovalWaiter>;
  executionPromise?: Promise<void>;
  traceId?: string;
}

const ACTIVE_STATUSES = new Set(['QUEUED', 'RUNNING', 'PAUSED', 'MERGING']);

function cloneRun<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

export class ScenarioSwarmRuntime implements SwarmRuntime {
  readonly mode = 'scenario' as const;
  private readonly sessions = new Map<string, ScenarioSession>();
  private readonly history = new Map<string, Swarm[]>();

  constructor(
    private readonly emitter: SwarmEmitter,
    private readonly scenarios: Record<string, ScenarioFactory>,
    private readonly recorder?: SwarmTraceRecorder,
  ) {}

  async start(params: SwarmRuntimeStartParams): Promise<Swarm> {
    const current = this.sessions.get(params.pentestId);
    if (current && ACTIVE_STATUSES.has(current.run.status)) {
      return cloneRun(current.run);
    }

    const scenarioId = params.runtime?.scenarioId || 'multi-agent-approval';
    const factory = this.scenarios[scenarioId];
    if (!factory) {
      throw new Error(`Unknown scenario ${scenarioId}`);
    }

    const runId = randomUUID();
    const run: Swarm = {
      id: runId,
      pentestId: params.pentestId,
      target: params.target,
      task: params.task,
      status: 'QUEUED',
      maxAgents: params.maxAgents ?? 8,
      maxConcurrentAgents: params.maxConcurrentAgents ?? 3,
      forceMerged: false,
      agents: [],
      findings: [],
      tasks: [],
      startedAt: new Date().toISOString(),
    };

    const scenario = factory({
      pentestId: params.pentestId,
      runId,
      target: params.target,
      task: params.task || '',
      scenarioId,
    });

    const session: ScenarioSession = {
      scenario,
      run,
      clock: new ScenarioClock(params.runtime?.speed || 1),
      pendingApprovals: new Map(),
    };

    if (params.runtime?.capture !== false) {
      const trace = await this.recorder?.startCapture({
        pentestId: params.pentestId,
        mode: this.mode,
        scenarioId,
        metadata: {
          title: scenario.metadata.title,
          tags: scenario.metadata.tags,
        },
      });
      session.traceId = trace?.traceId;
    }

    this.sessions.set(params.pentestId, session);
    session.executionPromise = this.executeScenario(session);
    return cloneRun(run);
  }

  async pause(pentestId: string): Promise<Swarm> {
    const session = this.requireSession(pentestId);
    session.clock.pause();
    await this.emit(session, {
      runId: session.run.id,
      source: 'system',
      audience: 'internal',
      surfaceHint: 'none',
      eventType: 'swarm.paused',
      payload: { type: 'swarm.paused' },
    });
    return cloneRun(session.run);
  }

  async resume(pentestId: string): Promise<Swarm> {
    const session = this.requireSession(pentestId);
    session.clock.resume();
    await this.emit(session, {
      runId: session.run.id,
      source: 'system',
      audience: 'internal',
      surfaceHint: 'none',
      eventType: 'swarm.resumed',
      payload: { type: 'swarm.resumed' },
    });
    return cloneRun(session.run);
  }

  async forceMerge(pentestId: string): Promise<Swarm> {
    const session = this.requireSession(pentestId);
    session.run.forceMerged = true;
    if (session.run.status !== 'COMPLETED' && session.run.status !== 'FAILED') {
      await this.emit(session, {
        runId: session.run.id,
        source: 'system',
        audience: 'user',
        surfaceHint: 'none',
        eventType: 'swarm.completed',
        payload: { type: 'swarm.completed', status: 'PARTIAL_COMPLETED' },
      });
    }
    return cloneRun(session.run);
  }

  async approveSensitiveTool(pentestId: string, approvalId: string): Promise<void> {
    const session = this.requireSession(pentestId);
    session.pendingApprovals.get(approvalId)?.resolve('approved');
  }

  async denySensitiveTool(pentestId: string, approvalId: string, _reason?: string): Promise<void> {
    const session = this.requireSession(pentestId);
    session.pendingApprovals.get(approvalId)?.resolve('denied');
  }

  async getCurrentRun(pentestId: string): Promise<Swarm | null> {
    return cloneRun(this.sessions.get(pentestId)?.run || null);
  }

  async getHistory(pentestId: string): Promise<Swarm[]> {
    return cloneRun(this.history.get(pentestId) || []);
  }

  async control(pentestId: string, command: SwarmRuntimeControlCommand): Promise<Swarm | null> {
    if (command.action === 'pause') return this.pause(pentestId);
    if (command.action === 'resume') return this.resume(pentestId);
    return this.getCurrentRun(pentestId);
  }

  private async executeScenario(session: ScenarioSession): Promise<void> {
    try {
      await this.executeSteps(session, session.scenario.steps);
      if (session.run.status !== 'COMPLETED' && session.run.status !== 'FAILED') {
        await this.emit(session, {
          runId: session.run.id,
          source: 'nia',
          audience: 'user',
          surfaceHint: 'none',
          eventType: 'swarm.completed',
          payload: { type: 'swarm.completed', status: 'COMPLETED' },
        });
      }
    } catch (error: any) {
      await this.emit(session, {
        runId: session.run.id,
        source: 'system',
        audience: 'user',
        surfaceHint: 'none',
        eventType: 'swarm.failed',
        payload: {
          type: 'swarm.failed',
          status: 'FAILED',
          error: error?.message || 'Scenario runtime failed',
        },
      });
    } finally {
      this.pushHistory(session.run);
    }
  }

  private async executeSteps(session: ScenarioSession, steps: ScenarioStep[]): Promise<void> {
    for (const step of steps) {
      if (session.run.forceMerged) return;

      if (step.kind === 'delay') {
        await session.clock.sleep(step.ms);
        continue;
      }

      if (step.kind === 'emit') {
        await this.emit(session, step.event);
        continue;
      }

      if (step.kind === 'artifact') {
        await this.emit(session, step.event);
        continue;
      }

      if (step.kind === 'parallel') {
        await Promise.all(step.branches.map((branch) => this.executeSteps(session, branch.steps)));
        continue;
      }

      if (step.kind === 'failure') {
        if (step.event) {
          await this.emit(session, step.event);
        }
        continue;
      }

      if (step.kind === 'approval') {
        await this.emit(session, step.request);
        const decision = await this.waitForApproval(session, step.approvalId, step.timeoutMs);
        if (decision === 'approved') {
          await this.executeSteps(session, step.onApprove);
        } else if (decision === 'denied') {
          await this.executeSteps(session, step.onDeny);
        } else if (step.onTimeout) {
          await this.executeSteps(session, step.onTimeout);
        }
      }
    }
  }

  private async emit(
    session: ScenarioSession,
    event: Omit<SwarmEventPayloadEnvelope, 'runId'> & { runId: string },
  ): Promise<void> {
    const emitted = this.emitter.broadcast(session.run.pentestId, event);
    applyEnvelopeToRun(session.run, emitted);
  }

  private waitForApproval(
    session: ScenarioSession,
    approvalId: string,
    timeoutMs?: number,
  ): Promise<'approved' | 'denied' | 'timeout'> {
    return new Promise<'approved' | 'denied' | 'timeout'>((resolve) => {
      session.pendingApprovals.set(approvalId, {
        resolve: (decision) => {
          session.pendingApprovals.delete(approvalId);
          resolve(decision);
        },
      });

      if (timeoutMs && timeoutMs > 0) {
        void session.clock.sleep(timeoutMs).then(() => {
          if (!session.pendingApprovals.has(approvalId)) return;
          session.pendingApprovals.delete(approvalId);
          resolve('timeout');
        });
      }
    });
  }

  private pushHistory(run: Swarm): void {
    const history = this.history.get(run.pentestId) || [];
    this.history.set(run.pentestId, [cloneRun(run), ...history].slice(0, 20));
  }

  private requireSession(pentestId: string): ScenarioSession {
    const session = this.sessions.get(pentestId);
    if (!session) {
      throw new Error('No active scenario runtime for this pentest');
    }
    return session;
  }
}

type SwarmEventPayloadEnvelope = {
  runId: string;
  threadId?: string;
  correlationId?: string;
  parentEventId?: string;
  source: string;
  audience: 'user' | 'internal' | 'debug';
  surfaceHint: 'main' | 'activity' | 'review' | 'none';
  eventType: SwarmEventPayload['type'];
  payload: SwarmEventPayload;
};
