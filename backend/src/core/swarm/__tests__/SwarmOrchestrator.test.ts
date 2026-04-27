/**
 * Tests for SwarmOrchestrator
 *
 * Tests the high-level coordinator for agent lifecycle:
 * - Spawn creates agent and tracks it
 * - SendMessage injects into pendingUserMessages
 * - ListAgents returns current agents
 * - KillAgent triggers abort
 * - Shutdown kills all agents
 * - Agent not found throws error
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { SwarmOrchestrator, type SwarmOrchestratorDeps } from '../SwarmOrchestrator.js';
import { ToolRegistry } from '../../runtime/ToolRegistry.js';
import { CommandRegistry } from '../../runtime/CommandRegistry.js';
import { NotificationQueue } from '../NotificationQueue.js';
import { buildTool } from '../../runtime/ToolRegistry.js';
import { z } from 'zod';
import type { SwarmEventEmitter } from '../../../agents/swarm/SwarmEventEmitter.js';

// ============================================================================
// MOCKS
// ============================================================================

/**
 * Create a mock callModel function that yields text events.
 */
function createMockCallModel() {
  return vi.fn(async function* () {
    yield { type: 'text_delta' as const, text: 'Hello from agent' };
    yield { type: 'model_stop' as const, reason: 'end_turn' as const };
  });
}

/**
 * Create a minimal mock SwarmEventEmitter.
 */
function createMockEventEmitter(): SwarmEventEmitter {
  return {
    emit: vi.fn(),
    on: vi.fn(),
    off: vi.fn(),
    prisma: null as unknown,
    emitter: null as unknown,
    state: null as unknown,
    approveSensitiveTool: vi.fn(),
    denySensitiveTool: vi.fn(),
    registerShutdownHandler: vi.fn(),
    unregisterShutdownHandler: vi.fn(),
  } as unknown as SwarmEventEmitter;
}

/**
 * Create a minimal mock ToolRegistry with no tools.
 */
function createMockToolRegistry() {
  const registry = new ToolRegistry();
  // No tools registered for basic tests
  return registry;
}

/**
 * Create a minimal mock CommandRegistry with no commands.
 */
function createMockCommandRegistry() {
  return new CommandRegistry();
}

/**
 * Create minimal SwarmOrchestratorDeps for testing.
 */
function createMockDeps(overrides?: Partial<SwarmOrchestratorDeps>): SwarmOrchestratorDeps {
  return {
    callModel: createMockCallModel(),
    toolRegistry: createMockToolRegistry(),
    commandRegistry: createMockCommandRegistry(),
    eventEmitter: createMockEventEmitter(),
    notificationQueue: new NotificationQueue(),
    defaultModel: 'test-model',
    ...overrides,
  };
}

// ============================================================================
// TESTS
// ============================================================================

describe('SwarmOrchestrator', () => {
  let orchestrator: SwarmOrchestrator;
  let mockDeps: SwarmOrchestratorDeps;

  beforeEach(() => {
    mockDeps = createMockDeps();
    orchestrator = new SwarmOrchestrator(mockDeps);
  });

  afterEach(async () => {
    // Clean up any running agents
    await orchestrator.shutdown();
  });

  describe('spawnAgent', () => {
    it('creates an agent and tracks it', async () => {
      const result = await orchestrator.spawnAgent({
        name: 'TestAgent',
        role: 'TestRole',
        prompt: 'Test prompt',
        swarmRunId: 'test-swarm',
        pentestId: 'test-pentest',
      });

      expect(result.success).toBe(true);
      expect(result.agentId).toBe('TestAgent@test-swarm');

      const agents = orchestrator.listAgents();
      expect(agents).toHaveLength(1);
      expect(agents[0]).toMatchObject({
        agentId: 'TestAgent@test-swarm',
        name: 'TestAgent',
        role: 'TestRole',
        swarmRunId: 'test-swarm',
        pentestId: 'test-pentest',
      });
    });

    it('returns error when spawning duplicate agent', async () => {
      const spawnOptions = {
        name: 'TestAgent',
        role: 'TestRole',
        prompt: 'Test prompt',
        swarmRunId: 'test-swarm',
        pentestId: 'test-pentest',
      };

      const result1 = await orchestrator.spawnAgent(spawnOptions);
      expect(result1.success).toBe(true);

      const result2 = await orchestrator.spawnAgent(spawnOptions);
      expect(result2.success).toBe(false);
      expect(result2.error).toContain('already exists');
    });

    it('tracks spawned agent in TaskManager', async () => {
      const result = await orchestrator.spawnAgent({
        name: 'TestAgent',
        role: 'TestRole',
        prompt: 'Test prompt',
        swarmRunId: 'test-swarm',
        pentestId: 'test-pentest',
      });

      expect(result.success).toBe(true);

      const taskManager = orchestrator.getTaskManager();
      const task = taskManager.getTask(result.taskId);

      expect(task).toBeDefined();
      expect(task?.type).toBe('teammate');
      expect(task?.agentId).toBe(result.agentId);
    });
  });

  describe('sendMessage', () => {
    it('injects message into pendingUserMessages', async () => {
      const result = await orchestrator.spawnAgent({
        name: 'TestAgent',
        role: 'TestRole',
        prompt: 'Test prompt',
        swarmRunId: 'test-swarm',
        pentestId: 'test-pentest',
      });

      expect(result.success).toBe(true);

      orchestrator.sendMessage(result.agentId, 'Hello agent');

      const taskManager = orchestrator.getTaskManager();
      const task = taskManager.getTask(result.taskId);

      // Cast to access pendingUserMessages
      const teammateTask = task as unknown as { pendingUserMessages?: string[] };
      expect(teammateTask.pendingUserMessages).toEqual(['Hello agent']);
    });

    it('throws when agent not found', () => {
      expect(() => {
        orchestrator.sendMessage('nonexistent@agent', 'Hello');
      }).toThrow('Agent nonexistent@agent not found');
    });
  });

  describe('listAgents', () => {
    it('returns empty array when no agents', () => {
      const agents = orchestrator.listAgents();
      expect(agents).toEqual([]);
    });

    it('returns all tracked agents', async () => {
      await orchestrator.spawnAgent({
        name: 'Agent1',
        role: 'Role1',
        prompt: 'Prompt1',
        swarmRunId: 'swarm-1',
        pentestId: 'pt-1',
      });

      await orchestrator.spawnAgent({
        name: 'Agent2',
        role: 'Role2',
        prompt: 'Prompt2',
        swarmRunId: 'swarm-1',
        pentestId: 'pt-1',
      });

      const agents = orchestrator.listAgents();
      expect(agents).toHaveLength(2);

      const agentIds = agents.map(a => a.agentId).sort();
      expect(agentIds).toEqual(['Agent1@swarm-1', 'Agent2@swarm-1']);
    });

    it('includes status from TaskManager', async () => {
      const result = await orchestrator.spawnAgent({
        name: 'TestAgent',
        role: 'TestRole',
        prompt: 'Test prompt',
        swarmRunId: 'test-swarm',
        pentestId: 'test-pentest',
      });

      const agents = orchestrator.listAgents();
      expect(agents[0].status).toBe('running');
    });
  });

  describe('getAgent', () => {
    it('returns tracked agent by ID', async () => {
      const result = await orchestrator.spawnAgent({
        name: 'TestAgent',
        role: 'TestRole',
        prompt: 'Test prompt',
        swarmRunId: 'test-swarm',
        pentestId: 'test-pentest',
      });

      const tracked = orchestrator.getAgent(result.agentId);
      expect(tracked).toBeDefined();
      expect(tracked?.identity.agentId).toBe(result.agentId);
      expect(tracked?.taskId).toBe(result.taskId);
    });

    it('returns undefined for unknown agent', () => {
      const tracked = orchestrator.getAgent('unknown@agent');
      expect(tracked).toBeUndefined();
    });
  });

  describe('killAgent', () => {
    it('aborts the agent and removes from tracking', async () => {
      const result = await orchestrator.spawnAgent({
        name: 'TestAgent',
        role: 'TestRole',
        prompt: 'Test prompt',
        swarmRunId: 'test-swarm',
        pentestId: 'test-pentest',
      });

      expect(orchestrator.listAgents()).toHaveLength(1);

      const killed = await orchestrator.killAgent(result.agentId);
      expect(killed).toBe(true);

      expect(orchestrator.listAgents()).toHaveLength(0);
    });

    it('returns false for unknown agent', async () => {
      const killed = await orchestrator.killAgent('unknown@agent');
      expect(killed).toBe(false);
    });

    it('aborts the abort controller', async () => {
      const result = await orchestrator.spawnAgent({
        name: 'TestAgent',
        role: 'TestRole',
        prompt: 'Test prompt',
        swarmRunId: 'test-swarm',
        pentestId: 'test-pentest',
      });

      const tracked = orchestrator.getAgent(result.agentId);
      expect(tracked?.abortController.signal.aborted).toBe(false);

      await orchestrator.killAgent(result.agentId);

      expect(tracked?.abortController.signal.aborted).toBe(true);
    });
  });

  describe('shutdown', () => {
    it('kills all tracked agents', async () => {
      await orchestrator.spawnAgent({
        name: 'Agent1',
        role: 'Role1',
        prompt: 'Prompt1',
        swarmRunId: 'swarm-1',
        pentestId: 'pt-1',
      });

      await orchestrator.spawnAgent({
        name: 'Agent2',
        role: 'Role2',
        prompt: 'Prompt2',
        swarmRunId: 'swarm-1',
        pentestId: 'pt-1',
      });

      expect(orchestrator.listAgents()).toHaveLength(2);

      await orchestrator.shutdown();

      expect(orchestrator.listAgents()).toHaveLength(0);
    });

    it('aborts all abort controllers', async () => {
      const result1 = await orchestrator.spawnAgent({
        name: 'Agent1',
        role: 'Role1',
        prompt: 'Prompt1',
        swarmRunId: 'swarm-1',
        pentestId: 'pt-1',
      });

      const result2 = await orchestrator.spawnAgent({
        name: 'Agent2',
        role: 'Role2',
        prompt: 'Prompt2',
        swarmRunId: 'swarm-1',
        pentestId: 'pt-1',
      });

      // Get references before shutdown clears the map
      const tracked1 = orchestrator.getAgent(result1.agentId);
      const tracked2 = orchestrator.getAgent(result2.agentId);

      await orchestrator.shutdown();

      expect(tracked1?.abortController.signal.aborted).toBe(true);
      expect(tracked2?.abortController.signal.aborted).toBe(true);
    });

    it('shuts down the spawner', async () => {
      const spawnerShutdownSpy = vi.spyOn(
        orchestrator.getSpawner(),
        'shutdown',
      );

      await orchestrator.shutdown();

      expect(spawnerShutdownSpy).toHaveBeenCalled();
    });
  });

  describe('getSpawner and getTaskManager', () => {
    it('returns the spawner instance', () => {
      const spawner = orchestrator.getSpawner();
      expect(spawner).toBeDefined();
      expect(spawner.getActiveCount()).toBe(0);
    });

    it('returns the task manager instance', () => {
      const taskManager = orchestrator.getTaskManager();
      expect(taskManager).toBeDefined();
      expect(taskManager.size).toBe(0);
    });
  });

  describe('integration with ToolExecutor', () => {
    it('uses tool executor from deps', async () => {
      // Create a registry with a test tool
      const toolRegistry = new ToolRegistry();
      toolRegistry.register(
        buildTool({
          name: 'test_tool',
          description: 'A test tool',
          inputSchema: z.object({
            message: z.string(),
          }),
          call: async ({ message }) => {
            return { data: `Echo: ${message}` };
          },
          maxResultSizeChars: 1000,
        }),
      );

      const deps = createMockDeps({
        toolRegistry,
      });

      const testOrchestrator = new SwarmOrchestrator(deps);

      const result = await testOrchestrator.spawnAgent({
        name: 'TestAgent',
        role: 'TestRole',
        prompt: 'Use test_tool',
        swarmRunId: 'test-swarm',
        pentestId: 'test-pentest',
        allowedTools: ['test_tool'],
      });

      expect(result.success).toBe(true);

      await testOrchestrator.shutdown();
    });
  });
});
