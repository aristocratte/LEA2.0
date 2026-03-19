import { createMultiAgentApprovalScenario } from './multiAgentApproval.js';
import { createNiaOnlyReplyScenario } from './niaOnlyReply.js';
import { createParallelFailureScenario } from './parallelFailure.js';
import type { ScenarioFactory } from '../swarm/ScenarioModel.js';

export const scenarioRegistry: Record<string, ScenarioFactory> = {
  'nia-only-reply': createNiaOnlyReplyScenario,
  'multi-agent-approval': createMultiAgentApprovalScenario,
  'parallel-failure': createParallelFailureScenario,
};
