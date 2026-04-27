/**
 * Health monitoring integration tests for SwarmOrchestrator
 *
 * Tests that health monitoring is properly wired into the orchestrator:
 * - Spawn records activity in health monitor
 * - Kill marks agent as dead and removes from monitor
 * - getAgentHealth returns correct status
 * - listAgents includes health status
 * - Shutdown clears health monitor
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { SwarmOrchestrator, type SwarmOrchestratorDeps } from '../SwarmOrchestrator.js';
import { ToolRegistry } from '../../runtime/ToolRegistry.js';
import { CommandRegistry } from '../../runtime/CommandRegistry.js';
import { NotificationQueue } from '../NotificationQueue.js';
import type { SwarmEventEmitter } from '../../../agents/swarm/SwarmEventEmitter.js';

// ============================================================================
// MOCKS
// ============================================================================

function createMockCallModel() {
  return vi.fn(async function* () {
    yield { type: 'text_delta' as const, text: 'Hello from agent' };
    yield { type: 'model_stop' as const, reason: 'end_turn' as const };
  });
}

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

function createMockToolRegistry() {
  return new ToolRegistry();
}

function createMockCommandRegistry() {
  return new CommandRegistry();
}

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

describe('SwarmOrchestrator - Health Monitoring', () => {
  let orchestrator: SwarmOrchestrator;
  let mockDeps: SwarmOrchestratorDeps;

  beforeEach(() => {
    mockDeps = createMockDeps();
    orchestrator = new SwarmOrchestrator(mockDeps);
  });

  afterEach(async () => {
    await orchestrator.shutdown();
  });

  describe('spawnAgent records activity', () => {
    it('records initial activity in health monitor', async () => {
      const result = await orchestrator.spawnAgent({
        name: 'TestAgent',
        role: 'TestRole',
        prompt: 'Test prompt',
        swarmRunId: 'test-swarm',
        pentestId: 'test-pentest',
      });

      expect(result.success).toBe(true);

      const health = orchestrator.getAgentHealth(result.agentId);
      expect(health).toBe('healthy');
    });

    it('stores agent name in health monitor', async () => {
      const result = await orchestrator.spawnAgent({
        name: 'TestAgent',
        role: 'TestRole',
        prompt: 'Test prompt',
        swarmRunId: 'test-swarm',
        pentestId: 'test-pentest',
      });

      const healthMonitor = orchestrator.getHealthMonitor();
      const agentHealth = healthMonitor.getAgentHealth(result.agentId);

      expect(agentHealth?.agentName).toBe('TestAgent');
    });

    it('increments tracked count in health monitor', async () => {
      const monitor = orchestrator.getHealthMonitor();
      expect(monitor.trackedCount).toBe(0);

      await orchestrator.spawnAgent({
        name: 'Agent1',
        role: 'Role1',
        prompt: 'Prompt1',
        swarmRunId: 'swarm-1',
        pentestId: 'pt-1',
      });

      expect(monitor.trackedCount).toBe(1);

      await orchestrator.spawnAgent({
        name: 'Agent2',
        role: 'Role2',
        prompt: 'Prompt2',
        swarmRunId: 'swarm-1',
        pentestId: 'pt-1',
      });

      expect(monitor.trackedCount).toBe(2);
    });
  });

  describe('killAgent marks dead and removes', () => {
    it('marks agent as dead before removal', async () => {
      const result = await orchestrator.spawnAgent({
        name: 'TestAgent',
        role: 'TestRole',
        prompt: 'Test prompt',
        swarmRunId: 'test-swarm',
        pentestId: 'test-pentest',
      });

      expect(orchestrator.getAgentHealth(result.agentId)).toBe('healthy');

      await orchestrator.killAgent(result.agentId);

      // After kill, agent should be removed from monitor
      expect(orchestrator.getAgentHealth(result.agentId)).toBe('dead');
    });

    it('removes agent from health monitor', async () => {
      const result = await orchestrator.spawnAgent({
        name: 'TestAgent',
        role: 'TestRole',
        prompt: 'Test prompt',
        swarmRunId: 'test-swarm',
        pentestId: 'test-pentest',
      });

      const monitor = orchestrator.getHealthMonitor();
      expect(monitor.trackedCount).toBe(1);

      await orchestrator.killAgent(result.agentId);

      expect(monitor.trackedCount).toBe(0);
    });

    it('does not affect health monitor when killing unknown agent', async () => {
      await orchestrator.spawnAgent({
        name: 'TestAgent',
        role: 'TestRole',
        prompt: 'Test prompt',
        swarmRunId: 'test-swarm',
        pentestId: 'test-pentest',
      });

      const monitor = orchestrator.getHealthMonitor();
      expect(monitor.trackedCount).toBe(1);

      await orchestrator.killAgent('unknown@agent');

      expect(monitor.trackedCount).toBe(1);
    });
  });

  describe('getAgentHealth', () => {
    it('returns "dead" for unknown agent', () => {
      const health = orchestrator.getAgentHealth('unknown@agent');
      expect(health).toBe('dead');
    });

    it('returns "healthy" for spawned agent', async () => {
      const result = await orchestrator.spawnAgent({
        name: 'TestAgent',
        role: 'TestRole',
        prompt: 'Test prompt',
        swarmRunId: 'test-swarm',
        pentestId: 'test-pentest',
      });

      expect(orchestrator.getAgentHealth(result.agentId)).toBe('healthy');
    });
  });

  describe('listAgents includes health status', () => {
    it('includes health field in agent status', async () => {
      const result = await orchestrator.spawnAgent({
        name: 'TestAgent',
        role: 'TestRole',
        prompt: 'Test prompt',
        swarmRunId: 'test-swarm',
        pentestId: 'test-pentest',
      });

      const agents = orchestrator.listAgents();
      expect(agents).toHaveLength(1);
      expect(agents[0].health).toBe('healthy');
    });

    it('returns undefined health for empty list', () => {
      const agents = orchestrator.listAgents();
      expect(agents).toEqual([]);
    });
  });

  describe('shutdown clears health monitor', () => {
    it('clears all tracked agents from health monitor', async () => {
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

      const monitor = orchestrator.getHealthMonitor();
      expect(monitor.trackedCount).toBe(2);

      await orchestrator.shutdown();

      expect(monitor.trackedCount).toBe(0);
    });
  });

  describe('getHealthMonitor', () => {
    it('returns the health monitor instance', () => {
      const monitor = orchestrator.getHealthMonitor();
      expect(monitor).toBeDefined();
      expect(monitor.trackedCount).toBe(0);
    });

    it('provides access to getAllHealth', async () => {
      await orchestrator.spawnAgent({
        name: 'Agent1',
        role: 'Role1',
        prompt: 'Prompt1',
        swarmRunId: 'swarm-1',
        pentestId: 'pt-1',
      });

      const monitor = orchestrator.getHealthMonitor();
      const allHealth = monitor.getAllHealth();

      expect(allHealth.size).toBe(1);
      expect(allHealth.get('Agent1@swarm-1')).toBe('healthy');
    });
  });
});
