import type { StartSwarmParams, Swarm } from '../../types/swarm.js';
import { PentestSwarm } from '../../agents/PentestSwarm.js';
import type { SwarmTraceRecorder } from './SwarmTraceRecorder.js';
import type { SwarmRuntime, SwarmRuntimeStartParams } from './SwarmRuntime.js';

export class LiveSwarmRuntime implements SwarmRuntime {
  readonly mode = 'live' as const;

  constructor(
    private readonly swarm: PentestSwarm,
    private readonly recorder?: SwarmTraceRecorder,
  ) {}

  async start(params: SwarmRuntimeStartParams): Promise<Swarm> {
    if (params.runtime?.capture) {
      await this.recorder?.startCapture({
        pentestId: params.pentestId,
        mode: this.mode,
        metadata: {
          task: params.task,
          target: params.target,
        },
      });
    }

    return this.swarm.start(params as StartSwarmParams);
  }

  pause(pentestId: string): Promise<Swarm> {
    return this.swarm.pause(pentestId);
  }

  resume(pentestId: string): Promise<Swarm> {
    return this.swarm.resume(pentestId);
  }

  stop(pentestId: string): Promise<Swarm> {
    return this.swarm.stop(pentestId);
  }

  forceMerge(pentestId: string): Promise<Swarm> {
    return this.swarm.forceMerge(pentestId);
  }

  approveSensitiveTool(pentestId: string, approvalId: string): Promise<void> {
    return this.swarm.approveSensitiveTool(pentestId, approvalId);
  }

  denySensitiveTool(pentestId: string, approvalId: string, reason?: string): Promise<void> {
    return this.swarm.denySensitiveTool(pentestId, approvalId, reason);
  }

  async getCurrentRun(pentestId: string): Promise<Swarm | null> {
    return this.swarm.getCurrentRun(pentestId);
  }

  async getHistory(pentestId: string): Promise<Swarm[]> {
    return this.swarm.getHistory(pentestId);
  }
}
