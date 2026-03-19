import { randomUUID } from 'node:crypto';
import type { Swarm } from '../../types/swarm.js';
import { applyEnvelopeToRun } from './SwarmRuntimeState.js';
import { ScenarioClock } from './ScenarioClock.js';
import { SwarmReplayEngine } from './SwarmReplayEngine.js';
import type { SwarmRuntime, SwarmRuntimeControlCommand, SwarmRuntimeStartParams } from './SwarmRuntime.js';
import type { SwarmTraceRecorder } from './SwarmTraceRecorder.js';
import type { SwarmTraceStore } from './SwarmTraceStore.js';
import type { SwarmEmitter } from '../../agents/PentestSwarm.js';

interface ReplaySession {
  run: Swarm;
  engine: SwarmReplayEngine;
  traceId: string;
}

function cloneRun<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

export class ReplaySwarmRuntime implements SwarmRuntime {
  readonly mode = 'replay' as const;
  private readonly sessions = new Map<string, ReplaySession>();
  private readonly history = new Map<string, Swarm[]>();

  constructor(
    private readonly emitter: SwarmEmitter,
    private readonly traceStore: SwarmTraceStore,
    private readonly recorder?: SwarmTraceRecorder,
  ) {}

  async start(params: SwarmRuntimeStartParams): Promise<Swarm> {
    const traceId = params.runtime?.traceId;
    if (!traceId) {
      throw new Error('Replay mode requires a traceId');
    }

    const trace = await this.traceStore.loadTraceEnvelopes(traceId);
    if (trace.length === 0) {
      throw new Error(`Trace ${traceId} is empty or missing`);
    }

    const started = trace.find((event) => event.eventType === 'swarm.started');
    const run: Swarm = {
      id: randomUUID(),
      pentestId: params.pentestId,
      target: started && 'target' in started.payload ? String(started.payload.target) : params.target,
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

    if (params.runtime?.capture) {
      await this.recorder?.startCapture({
        pentestId: params.pentestId,
        mode: this.mode,
        sourceTraceId: traceId,
        metadata: { replayTraceId: traceId },
      });
    }

    const engine = new SwarmReplayEngine(
      params.pentestId,
      trace.slice(Math.max(0, (params.runtime?.startAtSequence || 1) - 1)),
      this.emitter,
      new ScenarioClock(params.runtime?.speed || 1),
      (event) => {
        applyEnvelopeToRun(run, event);
        if (event.eventType === 'swarm.completed' || event.eventType === 'swarm.failed') {
          this.pushHistory(run);
        }
      },
    );

    this.sessions.set(params.pentestId, { run, engine, traceId });
    await engine.start(params.runtime?.autoStart !== false);
    return cloneRun(run);
  }

  async pause(pentestId: string): Promise<Swarm> {
    const session = this.requireSession(pentestId);
    session.engine.pause();
    return cloneRun(session.run);
  }

  async resume(pentestId: string): Promise<Swarm> {
    const session = this.requireSession(pentestId);
    void session.engine.resume();
    return cloneRun(session.run);
  }

  async forceMerge(pentestId: string): Promise<Swarm> {
    const session = this.requireSession(pentestId);
    await session.engine.jumpToSequence(Number.MAX_SAFE_INTEGER);
    return cloneRun(session.run);
  }

  async approveSensitiveTool(_pentestId: string, _approvalId: string): Promise<void> {}

  async denySensitiveTool(_pentestId: string, _approvalId: string, _reason?: string): Promise<void> {}

  async getCurrentRun(pentestId: string): Promise<Swarm | null> {
    return cloneRun(this.sessions.get(pentestId)?.run || null);
  }

  async getHistory(pentestId: string): Promise<Swarm[]> {
    return cloneRun(this.history.get(pentestId) || []);
  }

  async control(pentestId: string, command: SwarmRuntimeControlCommand): Promise<Swarm | null> {
    const session = this.requireSession(pentestId);
    if (command.action === 'pause') session.engine.pause();
    if (command.action === 'resume') void session.engine.resume();
    if (command.action === 'step') await session.engine.step();
    if (command.action === 'jump_to_sequence' && typeof command.sequence === 'number') {
      await session.engine.jumpToSequence(command.sequence);
    }
    if (command.action === 'jump_to_correlation' && command.correlationId) {
      await session.engine.jumpToCorrelation(command.correlationId);
    }
    return cloneRun(session.run);
  }

  private requireSession(pentestId: string): ReplaySession {
    const session = this.sessions.get(pentestId);
    if (!session) {
      throw new Error('No active replay runtime for this pentest');
    }
    return session;
  }

  private pushHistory(run: Swarm): void {
    const history = this.history.get(run.pentestId) || [];
    this.history.set(run.pentestId, [cloneRun(run), ...history].slice(0, 20));
  }
}
