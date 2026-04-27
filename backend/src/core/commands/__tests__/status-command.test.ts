/**
 * Status Command Tests
 *
 * Tests for the /status slash command which reports on
 * active agents, tasks, and system health.
 */

import { describe, expect, it, vi } from 'vitest';
import { CommandRegistry } from '../../runtime/CommandRegistry.js';
import type { CommandContext } from '../../types/command-types.js';

// We'll import the status command registration once implemented.
// For now, test against the expected interface contract.

/**
 * Helper: create a context with optional service mocks.
 */
function makeContext(overrides: Record<string, any> = {}): CommandContext {
  return {
    sessionId: 'test-session',
    args: '',
    toolUseContext: {} as any,
    tools: new Map() as any,
    ...overrides,
  } as CommandContext;
}

describe('status command', () => {
  it('returns text result with agent count', async () => {
    const registry = new CommandRegistry();

    // Register a status command with the expected contract
    registry.register(
      {
        type: 'local',
        name: 'status',
        description: 'Show system status',
        call: async (_args: string, context: any) => {
          const orchestrator = context.swarmOrchestrator;
          const agents = orchestrator?.listAgents?.() ?? [];
          return {
            type: 'text',
            content: `Active agents: ${agents.length}`,
          };
        },
      } as any,
      'builtin',
    );

    const mockOrchestrator = {
      listAgents: vi.fn().mockReturnValue([
        { agentId: 'agent-1', name: 'Recon', status: 'running' },
        { agentId: 'agent-2', name: 'Scanner', status: 'idle' },
      ]),
    };

    const context = makeContext({ swarmOrchestrator: mockOrchestrator });
    const result = await registry.execute('status', '', context);

    expect(result.type).toBe('text');
    expect(result.content).toContain('Active agents: 2');
    expect(mockOrchestrator.listAgents).toHaveBeenCalledOnce();
  });

  it('returns text result with task count', async () => {
    const registry = new CommandRegistry();

    registry.register(
      {
        type: 'local',
        name: 'status',
        description: 'Show system status',
        call: async (_args: string, context: any) => {
          const taskManager = context.runtimeTaskManager;
          const tasks = taskManager?.listTasks?.() ?? [];
          return {
            type: 'text',
            content: `Tasks: ${tasks.length}`,
          };
        },
      } as any,
      'builtin',
    );

    const mockTaskManager = {
      listTasks: vi.fn().mockReturnValue([
        { taskId: 't1', status: 'running' },
        { taskId: 't2', status: 'completed' },
        { taskId: 't3', status: 'pending' },
      ]),
    };

    const context = makeContext({ runtimeTaskManager: mockTaskManager });
    const result = await registry.execute('status', '', context);

    expect(result.type).toBe('text');
    expect(result.content).toContain('Tasks: 3');
  });

  it('handles missing services gracefully', async () => {
    const registry = new CommandRegistry();

    registry.register(
      {
        type: 'local',
        name: 'status',
        description: 'Show system status',
        call: async (_args: string, context: any) => {
          const orchestrator = context.swarmOrchestrator;
          const taskManager = context.runtimeTaskManager;
          const agents = orchestrator?.listAgents?.() ?? [];
          const tasks = taskManager?.listTasks?.() ?? [];
          return {
            type: 'text',
            content: `Agents: ${agents.length} | Tasks: ${tasks.length}`,
          };
        },
      } as any,
      'builtin',
    );

    // No services provided — context has undefined orchestrator and taskManager
    const context = makeContext();
    const result = await registry.execute('status', '', context);

    expect(result.type).toBe('text');
    expect(result.content).toContain('Agents: 0');
    expect(result.content).toContain('Tasks: 0');
  });
});
