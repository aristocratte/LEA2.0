import type {
  StartSwarmAuditRequest,
  StartSwarmParams,
  Swarm,
  SwarmStreamMessage,
  SysReptorFindingPayload,
} from '../backend/src/types/swarm';

const request: StartSwarmAuditRequest = {
  task: 'Execute dynamic pentest swarm',
  scope: ['api.example.com'],
  maxAgents: 8,
  maxConcurrentAgents: 4,
  autoPushToSysReptor: true,
};

const params: StartSwarmParams = {
  ...request,
  pentestId: 'pt-1',
  target: 'example.com',
};

const run: Swarm = {
  id: 'run-1',
  pentestId: params.pentestId,
  target: params.target,
  task: params.task,
  status: 'RUNNING',
  maxAgents: 8,
  maxConcurrentAgents: 4,
  forceMerged: false,
  agents: [],
  findings: [],
  startedAt: new Date().toISOString(),
};

const findingPayload: SysReptorFindingPayload = {
  title: 'Open admin endpoint',
  description: 'Endpoint exposed without auth',
  severity: 'high',
  affected_components: ['example.com/admin'],
  references: [{ key: 'leaFindingId', value: 'f-1' }],
};

const streamMessage: SwarmStreamMessage = {
  type: 'swarm_completed',
  data: {
    swarmRunId: run.id,
    status: 'COMPLETED',
    findingsCount: 0,
    agentsCount: 0,
    timestamp: Date.now(),
  },
};

export { request, params, run, findingPayload, streamMessage };
