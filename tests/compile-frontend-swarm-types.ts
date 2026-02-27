import type {
  StartSwarmAuditRequest,
  StartSwarmResponse,
  SwarmAgent,
  SwarmFinding,
  SwarmRun,
  SwarmStreamMessage,
} from '../lea-app/types/index';

const request: StartSwarmAuditRequest = {
  task: 'Execute dynamic pentest swarm',
  scope: ['example.com'],
  maxAgents: 10,
  maxConcurrentAgents: 5,
  autoPushToSysReptor: true,
};

const response: StartSwarmResponse = {
  swarmRunId: 'run-1',
  status: 'QUEUED',
  maxAgents: 10,
  maxConcurrentAgents: 5,
};

const agent: SwarmAgent = {
  id: 'a-1',
  swarmRunId: response.swarmRunId,
  name: 'Web Scanner',
  role: 'WebScanner',
  status: 'RUNNING_TOOL',
  progress: 60,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

const finding: SwarmFinding = {
  id: 'f-1',
  pentestId: 'pt-1',
  swarmRunId: response.swarmRunId,
  agentId: agent.id,
  title: 'Missing HSTS',
  description: 'HSTS header is absent',
  severity: 'medium',
  pushed: false,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

const run: SwarmRun = {
  id: response.swarmRunId,
  pentestId: 'pt-1',
  target: 'example.com',
  status: 'RUNNING',
  maxAgents: 10,
  maxConcurrentAgents: 5,
  forceMerged: false,
  agents: [agent],
  findings: [finding],
  startedAt: new Date().toISOString(),
};

const streamMessage: SwarmStreamMessage = {
  type: 'agent_status',
  data: {
    swarmRunId: run.id,
    agent,
    timestamp: Date.now(),
  },
};

export { request, response, agent, finding, run, streamMessage };
