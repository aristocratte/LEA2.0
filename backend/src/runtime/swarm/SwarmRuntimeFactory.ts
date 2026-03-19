import type { SwarmRuntimeMode } from './ScenarioModel.js';
import type { SwarmRuntime } from './SwarmRuntime.js';

export class SwarmRuntimeFactory {
  private readonly modeByPentestId = new Map<string, SwarmRuntimeMode>();

  constructor(private readonly runtimes: Record<SwarmRuntimeMode, SwarmRuntime>) {}

  assign(pentestId: string, mode: SwarmRuntimeMode): SwarmRuntime {
    this.modeByPentestId.set(pentestId, mode);
    return this.runtimes[mode];
  }

  resolveForPentest(pentestId: string): SwarmRuntime {
    const mode = this.modeByPentestId.get(pentestId) || 'live';
    return this.runtimes[mode];
  }

  resolveForMode(mode: SwarmRuntimeMode): SwarmRuntime {
    return this.runtimes[mode];
  }

  getMode(pentestId: string): SwarmRuntimeMode {
    return this.modeByPentestId.get(pentestId) || 'live';
  }
}
