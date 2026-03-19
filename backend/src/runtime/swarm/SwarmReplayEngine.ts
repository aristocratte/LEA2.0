import type { SwarmEventEnvelope, SwarmEventPayload } from '../../types/events.js';
import type { SwarmEmitter } from '../../agents/PentestSwarm.js';
import { ScenarioClock } from './ScenarioClock.js';

type ReplayEnvelope = Omit<SwarmEventEnvelope<SwarmEventPayload>, 'id' | 'sequence' | 'timestamp'>;

export class SwarmReplayEngine {
  private index = 0;
  private playing = false;

  constructor(
    private readonly pentestId: string,
    private readonly trace: SwarmEventEnvelope<SwarmEventPayload>[],
    private readonly emitter: SwarmEmitter,
    private readonly clock: ScenarioClock,
    private readonly onEmit?: (event: SwarmEventEnvelope<SwarmEventPayload>) => void,
  ) {}

  async start(autoStart = true): Promise<void> {
    if (!autoStart) return;
    await this.resume();
  }

  pause(): void {
    this.playing = false;
    this.clock.pause();
  }

  async resume(): Promise<void> {
    if (this.playing) return;
    this.playing = true;
    this.clock.resume();

    while (this.playing && this.index < this.trace.length) {
      const current = this.trace[this.index];
      const previous = this.trace[this.index - 1];
      const delay = previous ? Math.max(0, current.timestamp - previous.timestamp) : 0;
      if (delay > 0) {
        await this.clock.sleep(delay);
      }
      this.emitCurrent();
      this.index += 1;
    }

    this.playing = false;
  }

  async step(): Promise<void> {
    this.pause();
    if (this.index >= this.trace.length) return;
    this.emitCurrent();
    this.index += 1;
  }

  async jumpToSequence(sequence: number): Promise<void> {
    this.pause();
    while (this.index < this.trace.length && this.trace[this.index].sequence <= sequence) {
      this.emitCurrent();
      this.index += 1;
    }
  }

  async jumpToCorrelation(correlationId: string): Promise<void> {
    const target = this.trace.find((event) => event.correlationId === correlationId);
    if (!target) {
      throw new Error(`Unknown correlation ${correlationId}`);
    }
    await this.jumpToSequence(target.sequence);
  }

  private emitCurrent(): void {
    const current = this.trace[this.index];
    const envelope: ReplayEnvelope = {
      runId: current.runId,
      threadId: current.threadId,
      correlationId: current.correlationId,
      parentEventId: current.parentEventId,
      source: current.source,
      audience: current.audience,
      surfaceHint: current.surfaceHint,
      eventType: current.eventType,
      payload: current.payload,
    };

    const emitted = this.emitter.broadcast(this.pentestId, envelope);
    this.onEmit?.(emitted);
  }
}
