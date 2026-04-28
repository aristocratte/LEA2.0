import type { StartSwarmParams, Swarm } from '../../types/swarm.js';
import type { SwarmRuntimeConfig, SwarmRuntimeMode } from './ScenarioModel.js';

export interface SwarmRuntimeStartParams extends StartSwarmParams {
  runtime?: SwarmRuntimeConfig;
}

export interface SwarmRuntimeControlCommand {
  action: 'pause' | 'resume' | 'step' | 'jump_to_sequence' | 'jump_to_correlation';
  sequence?: number;
  correlationId?: string;
}

export interface SwarmRuntime {
  readonly mode: SwarmRuntimeMode;
  start(params: SwarmRuntimeStartParams): Promise<Swarm>;
  pause(pentestId: string): Promise<Swarm>;
  resume(pentestId: string): Promise<Swarm>;
  stop(pentestId: string): Promise<Swarm>;
  forceMerge(pentestId: string): Promise<Swarm>;
  approveSensitiveTool(pentestId: string, approvalId: string): Promise<void>;
  denySensitiveTool(pentestId: string, approvalId: string, reason?: string): Promise<void>;
  getCurrentRun(pentestId: string): Promise<Swarm | null>;
  getHistory(pentestId: string): Promise<Swarm[]>;
  control?(pentestId: string, command: SwarmRuntimeControlCommand): Promise<Swarm | null>;
}
