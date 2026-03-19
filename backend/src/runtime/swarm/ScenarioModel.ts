import type { SwarmEventEnvelope, SwarmEventPayload } from '../../types/events.js';

export type SwarmRuntimeMode = 'live' | 'scenario' | 'replay';

export interface SwarmRuntimeConfig {
  mode?: SwarmRuntimeMode;
  scenarioId?: string;
  traceId?: string;
  speed?: number;
  startAtSequence?: number;
  autoStart?: boolean;
  capture?: boolean;
  failureProfileId?: string;
}

export interface ScenarioMetadata {
  title: string;
  description?: string;
  tags: string[];
  expectedOutcomes: string[];
  reducedMotionPass?: boolean;
}

export interface ScenarioTemplateContext {
  pentestId: string;
  runId: string;
  target: string;
  task: string;
  scenarioId: string;
}

export type ScenarioEnvelope = Omit<SwarmEventEnvelope<SwarmEventPayload>, 'id' | 'sequence' | 'timestamp'> & {
  timestampOffsetMs?: number;
};

export interface ScenarioDelayStep {
  kind: 'delay';
  ms: number;
}

export interface ScenarioEmitStep {
  kind: 'emit';
  event: ScenarioEnvelope;
}

export interface ScenarioParallelBranch {
  id: string;
  label: string;
  steps: ScenarioStep[];
}

export interface ScenarioParallelStep {
  kind: 'parallel';
  branches: ScenarioParallelBranch[];
}

export interface ScenarioApprovalStep {
  kind: 'approval';
  approvalId: string;
  request: ScenarioEnvelope;
  timeoutMs?: number;
  onApprove: ScenarioStep[];
  onDeny: ScenarioStep[];
  onTimeout?: ScenarioStep[];
}

export interface ScenarioFailureStep {
  kind: 'failure';
  code: 'tool_error' | 'timeout' | 'partial_failure';
  message: string;
  event?: ScenarioEnvelope;
}

export interface ScenarioArtifactStep {
  kind: 'artifact';
  artifactId: string;
  reviewId: string;
  event: ScenarioEnvelope;
}

export type ScenarioStep =
  | ScenarioDelayStep
  | ScenarioEmitStep
  | ScenarioParallelStep
  | ScenarioApprovalStep
  | ScenarioFailureStep
  | ScenarioArtifactStep;

export interface ScenarioDefinition {
  id: string;
  metadata: ScenarioMetadata;
  prompt: string;
  steps: ScenarioStep[];
}

export type ScenarioFactory = (context: ScenarioTemplateContext) => ScenarioDefinition;
