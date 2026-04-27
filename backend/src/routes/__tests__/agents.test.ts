/**
 * Agent Routes Tests
 */

import Fastify from 'fastify';
import request from 'supertest';
import { afterEach, describe, expect, it, vi } from 'vitest';

// Create mock objects that will be used throughout
const mockTaskManager = {
  getTask: vi.fn(),
};

const mockTranscriptLogger = {
  getLastN: vi.fn(),
};

const {
  spawnAgentMock,
  sendMessageMock,
  listAgentsMock,
  getAgentMock,
  killAgentMock,
  shutdownMock,
  getTaskManagerMock,
  getTranscriptLoggerMock,
  SwarmOrchestratorMock,
  swarmOrchestratorConstructorMock,
} = vi.hoisted(() => {
  const spawnAgentMock = vi.fn();
  const sendMessageMock = vi.fn();
  const listAgentsMock = vi.fn();
  const getAgentMock = vi.fn();
  const killAgentMock = vi.fn();
  const shutdownMock = vi.fn();
  const getTaskManagerMock = vi.fn();
  const getTranscriptLoggerMock = vi.fn();
  const swarmOrchestratorConstructorMock = vi.fn();

  class SwarmOrchestratorMock {
    spawnAgent = spawnAgentMock;
    sendMessage = sendMessageMock;
    listAgents = listAgentsMock;
    getAgent = getAgentMock;
    killAgent = killAgentMock;
    shutdown = shutdownMock;
    getTaskManager = getTaskManagerMock;
    getTranscriptLogger = getTranscriptLoggerMock;

    constructor() {
      swarmOrchestratorConstructorMock();
    }
  }

  return {
    spawnAgentMock,
    sendMessageMock,
    listAgentsMock,
    getAgentMock,
    killAgentMock,
    shutdownMock,
    getTaskManagerMock,
    getTranscriptLoggerMock,
    SwarmOrchestratorMock,
    swarmOrchestratorConstructorMock,
  };
});

vi.mock('../core/swarm/SwarmOrchestrator.js', () => ({
  SwarmOrchestrator: SwarmOrchestratorMock,
}));

// Setup mock return values
getTaskManagerMock.mockReturnValue(mockTaskManager);
getTranscriptLoggerMock.mockReturnValue(mockTranscriptLogger);

import { agentRoutes } from '../agents.js';

async function buildApp() {
  const fastify = Fastify({ logger: false });
  const orchestrator = new SwarmOrchestratorMock();

  (fastify as any).swarmOrchestrator = orchestrator;
  await fastify.register(agentRoutes);
  await fastify.ready();

  return { fastify, orchestrator };
}

afterEach(() => {
  vi.clearAllMocks();
  vi.restoreAllMocks();
});

describe('agentRoutes', () => {
  it('POST /api/agents/spawn creates a new agent and returns 201', async () => {
    spawnAgentMock.mockResolvedValue({
      success: true,
      agentId: 'agent-1@swarm-1',
      taskId: 'task-1',
      abortController: new AbortController(),
    });

    const { fastify } = await buildApp();

    try {
      const response = await request(fastify.server)
        .post('/api/agents/spawn')
        .send({
          name: 'Recon Alpha',
          role: 'Recon',
          prompt: 'Scan the target',
          swarmRunId: 'swarm-1',
          pentestId: 'pentest-1',
        });

      expect(response.status).toBe(201);
      expect(response.body).toEqual({
        data: {
          agentId: 'agent-1@swarm-1',
          taskId: 'task-1',
        },
      });

      expect(spawnAgentMock).toHaveBeenCalledWith({
        name: 'Recon Alpha',
        role: 'Recon',
        prompt: 'Scan the target',
        swarmRunId: 'swarm-1',
        pentestId: 'pentest-1',
        model: undefined,
        systemPrompt: undefined,
        allowedTools: undefined,
      });
    } finally {
      await fastify.close();
    }
  });

  it('POST /api/agents/spawn returns 400 for invalid payload', async () => {
    const { fastify } = await buildApp();

    try {
      const response = await request(fastify.server)
        .post('/api/agents/spawn')
        .send({ name: '' }); // empty name

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('Invalid spawn payload');
      expect(spawnAgentMock).not.toHaveBeenCalled();
    } finally {
      await fastify.close();
    }
  });

  it('POST /api/agents/spawn returns 400 when spawn fails', async () => {
    spawnAgentMock.mockResolvedValue({
      success: false,
      agentId: '',
      taskId: '',
      abortController: new AbortController(),
      error: 'Invalid swarm run',
    });

    const { fastify } = await buildApp();

    try {
      const response = await request(fastify.server)
        .post('/api/agents/spawn')
        .send({
          name: 'Test Agent',
          prompt: 'Test',
          swarmRunId: 'invalid',
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('Invalid swarm run');
    } finally {
      await fastify.close();
    }
  });

  it('POST /api/agents/:agentId/message sends message to agent and returns 202', async () => {
    sendMessageMock.mockImplementation(() => {
      // Do nothing - successful send
    });

    const { fastify } = await buildApp();

    try {
      const response = await request(fastify.server)
        .post('/api/agents/agent-1@swarm-1/message')
        .send({ text: 'Continue scanning' });

      expect(response.status).toBe(202);
      expect(response.body).toEqual({ data: { message: 'Message delivered' } });
      expect(sendMessageMock).toHaveBeenCalledWith('agent-1@swarm-1', 'Continue scanning');
    } finally {
      await fastify.close();
    }
  });

  it('POST /api/agents/:agentId/message returns 404 for unknown agent', async () => {
    sendMessageMock.mockImplementation(() => {
      throw new Error('Agent unknown-agent not found');
    });

    const { fastify } = await buildApp();

    try {
      const response = await request(fastify.server)
        .post('/api/agents/unknown-agent/message')
        .send({ text: 'Hello' });

      expect(response.status).toBe(404);
      expect(response.body.error).toBe('Agent unknown-agent not found');
    } finally {
      await fastify.close();
    }
  });

  it('POST /api/agents/:agentId/message returns 400 for invalid payload', async () => {
    const { fastify } = await buildApp();

    try {
      const response = await request(fastify.server)
        .post('/api/agents/agent-1/message')
        .send({ text: '' }); // empty text

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('Invalid message payload');
      expect(sendMessageMock).not.toHaveBeenCalled();
    } finally {
      await fastify.close();
    }
  });

  it('GET /api/agents returns list of all agents', async () => {
    listAgentsMock.mockReturnValue([
      {
        agentId: 'agent-1@swarm-1',
        name: 'Recon Alpha',
        status: 'running',
        role: 'Recon',
        swarmRunId: 'swarm-1',
        pentestId: 'pentest-1',
      },
      {
        agentId: 'agent-2@swarm-1',
        name: 'Web Scanner',
        status: 'idle',
        role: 'WebScanner',
        swarmRunId: 'swarm-1',
        pentestId: 'pentest-1',
      },
    ]);

    const { fastify } = await buildApp();

    try {
      const response = await request(fastify.server).get('/api/agents');

      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        data: [
          {
            agentId: 'agent-1@swarm-1',
            name: 'Recon Alpha',
            status: 'running',
            role: 'Recon',
            swarmRunId: 'swarm-1',
            pentestId: 'pentest-1',
          },
          {
            agentId: 'agent-2@swarm-1',
            name: 'Web Scanner',
            status: 'idle',
            role: 'WebScanner',
            swarmRunId: 'swarm-1',
            pentestId: 'pentest-1',
          },
        ],
      });
    } finally {
      await fastify.close();
    }
  });

  it('GET /api/agents/:agentId returns single agent status (enriched)', async () => {
    getAgentMock.mockReturnValue({
      config: {},
      abortController: new AbortController(),
      promise: Promise.resolve(),
      identity: {
        agentId: 'agent-1@swarm-1',
        agentName: 'Recon Alpha',
        swarmRunId: 'swarm-1',
        pentestId: 'pentest-1',
        role: 'Recon',
      },
      taskId: 'task-1',
    });

    listAgentsMock.mockReturnValue([
      {
        agentId: 'agent-1@swarm-1',
        name: 'Recon Alpha',
        status: 'running',
        role: 'Recon',
        swarmRunId: 'swarm-1',
        pentestId: 'pentest-1',
      },
    ]);

    mockTaskManager.getTask.mockReturnValue({
      taskId: 'task-1',
      description: 'Scan the target',
      status: 'running',
      startTime: Date.now(),
    });

    mockTranscriptLogger.getLastN.mockResolvedValue([
      {
        timestamp: '2026-03-31T12:00:00.000Z',
        role: 'user',
        content: 'Start scanning',
        turn: 1,
      },
    ]);

    const { fastify } = await buildApp();

    try {
      const response = await request(fastify.server).get('/api/agents/agent-1@swarm-1');

      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({
        data: {
          agentId: 'agent-1@swarm-1',
          name: 'Recon Alpha',
          status: 'running',
          role: 'Recon',
          swarmRunId: 'swarm-1',
          pentestId: 'pentest-1',
          task: {
            taskId: 'task-1',
            description: 'Scan the target',
            status: 'running',
          },
          recentTranscript: [
            {
              timestamp: '2026-03-31T12:00:00.000Z',
              role: 'user',
              content: 'Start scanning',
              turn: 1,
            },
          ],
        },
      });
    } finally {
      await fastify.close();
    }
  });

  it('GET /api/agents/:agentId returns 404 for unknown agent', async () => {
    getAgentMock.mockReturnValue(undefined);

    const { fastify } = await buildApp();

    try {
      const response = await request(fastify.server).get('/api/agents/unknown-agent');

      expect(response.status).toBe(404);
      expect(response.body.error).toBe('Agent not found');
    } finally {
      await fastify.close();
    }
  });

  it('DELETE /api/agents/:agentId kills agent and returns 202', async () => {
    killAgentMock.mockResolvedValue(true);

    const { fastify } = await buildApp();

    try {
      const response = await request(fastify.server).delete('/api/agents/agent-1@swarm-1');

      expect(response.status).toBe(202);
      expect(response.body).toEqual({ data: { message: 'Agent killed' } });
      expect(killAgentMock).toHaveBeenCalledWith('agent-1@swarm-1');
    } finally {
      await fastify.close();
    }
  });

  it('DELETE /api/agents/:agentId returns 404 for unknown agent', async () => {
    killAgentMock.mockResolvedValue(false);

    const { fastify } = await buildApp();

    try {
      const response = await request(fastify.server).delete('/api/agents/unknown-agent');

      expect(response.status).toBe(404);
      expect(response.body.error).toBe('Agent not found');
    } finally {
      await fastify.close();
    }
  });

  it('POST /api/agents/shutdown shuts down all agents and returns 202', async () => {
    shutdownMock.mockResolvedValue(undefined);

    const { fastify } = await buildApp();

    try {
      const response = await request(fastify.server).post('/api/agents/shutdown');

      expect(response.status).toBe(202);
      expect(response.body).toEqual({ data: { message: 'All agents shut down' } });
      expect(shutdownMock).toHaveBeenCalled();
    } finally {
      await fastify.close();
    }
  });

  // ============================================
  // TRANSCRIPT ENDPOINT TESTS
  // ============================================

  it('GET /api/agents/:agentId/transcript returns transcript entries', async () => {
    getAgentMock.mockReturnValue({
      identity: {
        agentId: 'agent-1@swarm-1',
        swarmRunId: 'swarm-1',
      },
      taskId: 'task-1',
    });

    mockTranscriptLogger.getLastN.mockResolvedValue([
      {
        timestamp: '2026-03-31T12:00:00.000Z',
        role: 'user',
        content: 'Hello',
        turn: 1,
      },
      {
        timestamp: '2026-03-31T12:00:01.000Z',
        role: 'assistant',
        content: 'Hi there',
        turn: 1,
      },
    ]);

    const { fastify } = await buildApp();

    try {
      const response = await request(fastify.server).get('/api/agents/agent-1@swarm-1/transcript');

      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        data: {
          agentId: 'agent-1@swarm-1',
          swarmRunId: 'swarm-1',
          limit: 50,
          count: 2,
          transcript: [
            {
              timestamp: '2026-03-31T12:00:00.000Z',
              role: 'user',
              content: 'Hello',
              turn: 1,
            },
            {
              timestamp: '2026-03-31T12:00:01.000Z',
              role: 'assistant',
              content: 'Hi there',
              turn: 1,
            },
          ],
        },
      });
      expect(mockTranscriptLogger.getLastN).toHaveBeenCalledWith('swarm-1', 'agent-1@swarm-1', 50);
    } finally {
      await fastify.close();
    }
  });

  it('GET /api/agents/:agentId/transcript respects limit parameter', async () => {
    getAgentMock.mockReturnValue({
      identity: {
        agentId: 'agent-1@swarm-1',
        swarmRunId: 'swarm-1',
      },
      taskId: 'task-1',
    });

    mockTranscriptLogger.getLastN.mockResolvedValue([]);

    const { fastify } = await buildApp();

    try {
      const response = await request(fastify.server).get('/api/agents/agent-1@swarm-1/transcript?limit=10');

      expect(response.status).toBe(200);
      expect(mockTranscriptLogger.getLastN).toHaveBeenCalledWith('swarm-1', 'agent-1@swarm-1', 10);
    } finally {
      await fastify.close();
    }
  });

  it('GET /api/agents/:agentId/transcript returns 404 for unknown agent', async () => {
    getAgentMock.mockReturnValue(undefined);

    const { fastify } = await buildApp();

    try {
      const response = await request(fastify.server).get('/api/agents/unknown-agent/transcript');

      expect(response.status).toBe(404);
      expect(response.body.error).toBe('Agent not found');
    } finally {
      await fastify.close();
    }
  });

  it('GET /api/agents/:agentId/transcript returns 503 when transcript logger unavailable', async () => {
    getAgentMock.mockReturnValue({
      identity: {
        agentId: 'agent-1@swarm-1',
        swarmRunId: 'swarm-1',
      },
      taskId: 'task-1',
    });

    getTranscriptLoggerMock.mockReturnValue(undefined);

    const { fastify } = await buildApp();

    try {
      const response = await request(fastify.server).get('/api/agents/agent-1@swarm-1/transcript');

      expect(response.status).toBe(503);
      expect(response.body.error).toBe('Transcript logging not available');
    } finally {
      await fastify.close();
    }
  });
});
