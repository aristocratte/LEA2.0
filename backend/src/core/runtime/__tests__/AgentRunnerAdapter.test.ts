/**
 * @module core/runtime/AgentRunnerAdapter.test
 * @description Tests for AgentRunnerAdapter
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  buildLLMExecutor,
  buildToolExecutor,
  buildConfig,
} from '../AgentRunnerAdapter.js';
import type { Tool } from '../../types/tool-types.js';
import type { StreamEvent } from '../../types/session-types.js';
import type { AgentContext } from '../../swarm/types.js';
import { ToolRegistry } from '../ToolRegistry.js';
import type { ToolExecutor } from '../ToolExecutor.js';
import type { CommandRegistry } from '../CommandRegistry.js';
import type { TaskManager } from '../../swarm/TaskManager.js';
import type { NotificationQueue } from '../../swarm/NotificationQueue.js';
import type { SwarmEventEmitter } from '../../../agents/swarm/SwarmEventEmitter.js';

// ============================================================================
// TEST DOUBLES
// ============================================================================

/**
 * Create an empty ToolRegistry for tests that don't care about tools.
 */
function createEmptyToolRegistry(): ToolRegistry {
  return new ToolRegistry();
}

/**
 * Create a mock Tool for testing.
 */
function createMockTool(name: string, result: string): Tool {
  return {
    name,
    description: `Mock tool ${name}`,
    inputSchema: {
      safeParse: (input: unknown) => ({
        success: true,
        data: input,
      }),
    } as any,
    maxResultSizeChars: 10000,
    call: vi.fn().mockResolvedValue({ data: result }),
    checkPermissions: vi.fn().mockResolvedValue({ behavior: 'allow' }),
    isEnabled: () => true,
    isReadOnly: () => false,
    isConcurrencySafe: () => false,
    isDestructive: () => false,
    userFacingName: () => name,
    getActivityDescription: () => null,
  };
}

/**
 * Create a mock ToolRegistry.
 */
function createMockToolRegistry(tools: Map<string, Tool>): ToolRegistry {
  return {
    get: (name: string) => tools.get(name),
    has: (name: string) => tools.has(name),
    register: vi.fn(),
    registerTool: vi.fn(),
    unregister: vi.fn(),
    getAll: () => tools,
    getEnabled: () => Array.from(tools.values()),
    resolveAlias: (name: string) => (tools.has(name) ? name : undefined),
    clear: vi.fn(),
    size: tools.size,
  } as unknown as ToolRegistry;
}

/**
 * Create a mock ToolExecutor.
 */
function createMockToolExecutor(): ToolExecutor {
  return {
    execute: vi.fn().mockResolvedValue({
      event: {
        type: 'tool_result',
        id: 'test-id',
        toolName: 'test_tool',
        result: 'Tool executed successfully',
      },
      recoverable: true,
    }),
  } as unknown as ToolExecutor;
}

/**
 * Create a mock CommandRegistry.
 */
function createMockCommandRegistry(): CommandRegistry {
  return {
    get: vi.fn(),
    has: vi.fn(),
    register: vi.fn(),
    unregister: vi.fn(),
    getAll: vi.fn(),
    getEnabled: vi.fn(),
    resolveAlias: vi.fn(),
    clear: vi.fn(),
    size: 0,
  } as unknown as CommandRegistry;
}

/**
 * Create a mock TaskManager.
 */
function createMockTaskManager(): TaskManager {
  return {
    createTask: vi.fn().mockReturnValue('task-123'),
    getTask: vi.fn(),
    updateTask: vi.fn(),
    completeTask: vi.fn(),
    failTask: vi.fn(),
    getAllTasks: vi.fn(),
    getTasksByAgent: vi.fn(),
  } as unknown as TaskManager;
}

/**
 * Create a mock NotificationQueue.
 */
function createMockNotificationQueue(): NotificationQueue {
  return {
    enqueue: vi.fn(),
    dequeue: vi.fn(),
    peek: vi.fn(),
    clear: vi.fn(),
    isEmpty: vi.fn().mockReturnValue(true),
  } as unknown as NotificationQueue;
}

/**
 * Create a mock SwarmEventEmitter.
 */
function createMockEventEmitter(): SwarmEventEmitter {
  const listeners = new Map<string, Set<Function>>();
  return {
    emit: vi.fn(),
    on: vi.fn((event, callback) => {
      if (!listeners.has(event)) {
        listeners.set(event, new Set());
      }
      listeners.get(event)!.add(callback);
    }),
    off: vi.fn((event, callback) => {
      const eventListeners = listeners.get(event);
      if (eventListeners) {
        eventListeners.delete(callback);
      }
    }),
    removeAllListeners: vi.fn((event) => {
      if (event) {
        listeners.delete(event);
      } else {
        listeners.clear();
      }
    }),
    listenerCount: vi.fn((event) => listeners.get(event)?.size ?? 0),
  } as unknown as SwarmEventEmitter;
}

/**
 * Create a mock agent context.
 */
function createMockAgentContext(): AgentContext {
  return {
    agentId: 'agent-123',
    agentName: 'TestAgent',
    swarmRunId: 'swarm-456',
    pentestId: 'pentest-789',
    role: 'RECON',
    color: '#00ff00',
    planModeRequired: false,
    isTeamLead: false,
    agentType: 'teammate',
    abortController: new AbortController(),
    permissionOverrides: undefined,
  };
}

/**
 * Create an async generator from an array of events.
 */
function asyncGeneratorFrom<T>(items: T[]): AsyncGenerator<T> {
  const itemsCopy = [...items];
  return {
    [Symbol.asyncIterator]: async function* () {
      for (const item of itemsCopy) {
        yield item;
      }
    },
  } as AsyncGenerator<T>;
}

// ============================================================================
// TEST SUITES
// ============================================================================

describe('AgentRunnerAdapter', () => {
  describe('buildLLMExecutor', () => {
    it('should yield text chunks from model', async () => {
      const mockCallModel = vi.fn().mockReturnValue(
        asyncGeneratorFrom<StreamEvent>([
          { type: 'text_delta', text: 'Hello' },
          { type: 'text_delta', text: ' world' },
          { type: 'text_delta', text: '!' },
        ])
      );

      const llmExecutor = buildLLMExecutor({
        callModel: mockCallModel,
        defaultModel: 'claude-sonnet-4-6',
        toolRegistry: createEmptyToolRegistry(),
      });

      const agentContext = createMockAgentContext();
      const signal = new AbortController().signal;

      const chunks: Array<{ type: string; content: string }> = [];
      for await (const chunk of llmExecutor({
        prompt: 'Say hello',
        contextMessages: [],
        tools: [],
        agentContext,
        signal,
      })) {
        chunks.push(chunk);
      }

      expect(chunks).toHaveLength(3);
      expect(chunks[0]).toEqual({ type: 'text', content: 'Hello' });
      expect(chunks[1]).toEqual({ type: 'text', content: ' world' });
      expect(chunks[2]).toEqual({ type: 'text', content: '!' });
    });

    it('should yield tool_use chunks', async () => {
      const mockCallModel = vi.fn().mockReturnValue(
        asyncGeneratorFrom<StreamEvent>([
          {
            type: 'tool_use',
            id: 'call-123',
            toolName: 'web_search',
            input: { query: 'test' },
          },
        ])
      );

      const registry = createEmptyToolRegistry();
      registry.registerTool(createMockTool('web_search', 'Results'));

      const llmExecutor = buildLLMExecutor({
        callModel: mockCallModel,
        defaultModel: 'claude-sonnet-4-6',
        toolRegistry: registry,
      });

      const agentContext = createMockAgentContext();
      const signal = new AbortController().signal;

      const chunks: unknown[] = [];
      for await (const chunk of llmExecutor({
        prompt: 'Search the web',
        contextMessages: [],
        tools: ['web_search'],
        agentContext,
        signal,
      })) {
        chunks.push(chunk);
      }

      expect(chunks).toHaveLength(1);
      expect(chunks[0]).toEqual({
        type: 'tool_use',
        content: '',
        toolName: 'web_search',
        toolInput: { query: 'test' },
      });
    });

    it('should convert contextMessages to ChatMessage format', async () => {
      const mockCallModel = vi.fn().mockReturnValue(
        asyncGeneratorFrom<StreamEvent>([
          { type: 'text_delta', text: 'Response' },
        ])
      );

      const llmExecutor = buildLLMExecutor({
        callModel: mockCallModel,
        defaultModel: 'claude-sonnet-4-6',
        toolRegistry: createEmptyToolRegistry(),
      });

      const agentContext = createMockAgentContext();
      const signal = new AbortController().signal;

      const contextMessages = [
        { role: 'user', content: 'Previous message' },
        { role: 'assistant', content: 'Previous response' },
      ];

      for await (const _chunk of llmExecutor({
        prompt: 'New message',
        contextMessages,
        tools: [],
        agentContext,
        signal,
      })) {
        // Consume the generator
      }

      expect(mockCallModel).toHaveBeenCalledWith(
        expect.objectContaining({
          messages: expect.arrayContaining([
            { role: 'user', content: 'Previous message' },
            { role: 'assistant', content: 'Previous response' },
            { role: 'user', content: 'New message' },
          ]),
        })
      );
    });

    it('should handle model errors gracefully', async () => {
      const mockCallModel = vi.fn().mockReturnValue(
        asyncGeneratorFrom<StreamEvent>([
          {
            type: 'error',
            error: new Error('Model API failed'),
            recoverable: true,
            suggestions: ['Retry the request'],
          },
        ])
      );

      const llmExecutor = buildLLMExecutor({
        callModel: mockCallModel,
        defaultModel: 'claude-sonnet-4-6',
        toolRegistry: createEmptyToolRegistry(),
      });

      const agentContext = createMockAgentContext();
      const signal = new AbortController().signal;

      const chunks: unknown[] = [];
      for await (const chunk of llmExecutor({
        prompt: 'Test',
        contextMessages: [],
        tools: [],
        agentContext,
        signal,
      })) {
        chunks.push(chunk);
      }

      expect(chunks).toHaveLength(1);
      expect(chunks[0]).toEqual({
        type: 'text',
        content: '[Error: Model API failed]',
      });
    });

    it('should handle thrown errors', async () => {
      const mockCallModel = vi.fn().mockImplementation(() => {
        throw new Error('Network error');
      });

      const llmExecutor = buildLLMExecutor({
        callModel: mockCallModel,
        defaultModel: 'claude-sonnet-4-6',
        toolRegistry: createEmptyToolRegistry(),
      });

      const agentContext = createMockAgentContext();
      const signal = new AbortController().signal;

      const chunks: unknown[] = [];
      for await (const chunk of llmExecutor({
        prompt: 'Test',
        contextMessages: [],
        tools: [],
        agentContext,
        signal,
      })) {
        chunks.push(chunk);
      }

      expect(chunks).toHaveLength(1);
      expect(chunks[0]).toEqual({
        type: 'text',
        content: '[LLM execution error: Network error]',
      });
    });
  });

  describe('buildToolExecutor', () => {
    it('should execute registered tools', async () => {
      const mockTool = createMockTool('test_tool', 'Success!');
      const tools = new Map([['test_tool', mockTool]]);
      const toolRegistry = createMockToolRegistry(tools);

      const mockToolExecutor = createMockToolExecutor();
      vi.mocked(mockToolExecutor.execute).mockResolvedValue({
        event: {
          type: 'tool_result',
          id: 'call-123',
          toolName: 'test_tool',
          result: 'Success!',
        },
        recoverable: true,
      });

      const toolExecutor = buildToolExecutor({
        toolExecutor: mockToolExecutor,
        toolRegistry,
        sessionId: 'test-session',
      });

      const agentContext = createMockAgentContext();
      const signal = new AbortController().signal;

      const result = await toolExecutor({
        toolName: 'test_tool',
        input: { arg: 'value' },
        agentContext,
        signal,
      });

      expect(result).toEqual({
        output: 'Success!',
        error: undefined,
      });

      expect(mockToolExecutor.execute).toHaveBeenCalledWith(
        expect.objectContaining({
          toolUseId: expect.stringMatching(/^tool-\d+-[a-z0-9]+$/),
          toolName: 'test_tool',
          input: { arg: 'value' },
          sessionId: 'test-session',
          abortController: expect.any(AbortController),
        }),
      );
    });

    it('should return error for unknown tools', async () => {
      const tools = new Map();
      const toolRegistry = createMockToolRegistry(tools);

      const mockToolExecutor = createMockToolExecutor();
      const toolExecutor = buildToolExecutor({
        toolExecutor: mockToolExecutor,
        toolRegistry,
        sessionId: 'test-session',
      });

      const agentContext = createMockAgentContext();
      const signal = new AbortController().signal;

      const result = await toolExecutor({
        toolName: 'unknown_tool',
        input: {},
        agentContext,
        signal,
      });

      expect(result).toEqual({
        output: '',
        error: 'Tool "unknown_tool" not found in registry',
      });

      expect(mockToolExecutor.execute).not.toHaveBeenCalled();
    });

    it('should return error for tool execution errors', async () => {
      const mockTool = createMockTool('failing_tool', 'Oops');
      const tools = new Map([['failing_tool', mockTool]]);
      const toolRegistry = createMockToolRegistry(tools);

      const mockToolExecutor = createMockToolExecutor();
      vi.mocked(mockToolExecutor.execute).mockResolvedValue({
        event: {
          type: 'tool_result',
          id: 'call-123',
          toolName: 'failing_tool',
          result: 'Execution failed',
          isError: true,
        },
        recoverable: true,
      });

      const toolExecutor = buildToolExecutor({
        toolExecutor: mockToolExecutor,
        toolRegistry,
        sessionId: 'test-session',
      });

      const agentContext = createMockAgentContext();
      const signal = new AbortController().signal;

      const result = await toolExecutor({
        toolName: 'failing_tool',
        input: {},
        agentContext,
        signal,
      });

      expect(result).toEqual({
        output: '',
        error: 'Execution failed',
      });
    });

    it('should handle unexpected errors during execution', async () => {
      const mockTool = createMockTool('error_tool', 'Error');
      const tools = new Map([['error_tool', mockTool]]);
      const toolRegistry = createMockToolRegistry(tools);

      const mockToolExecutor = createMockToolExecutor();
      vi.mocked(mockToolExecutor.execute).mockRejectedValue(
        new Error('Unexpected failure')
      );

      const toolExecutor = buildToolExecutor({
        toolExecutor: mockToolExecutor,
        toolRegistry,
        sessionId: 'test-session',
      });

      const agentContext = createMockAgentContext();
      const signal = new AbortController().signal;

      const result = await toolExecutor({
        toolName: 'error_tool',
        input: {},
        agentContext,
        signal,
      });

      expect(result).toEqual({
        output: '',
        error: 'Tool execution failed: Unexpected failure',
      });
    });
  });

  describe('buildConfig', () => {
    const mockSpawnOptions = {
      name: 'TestAgent',
      role: 'RECON',
      prompt: 'Test prompt',
      swarmRunId: 'swarm-456',
      pentestId: 'pentest-789',
      color: '#00ff00',
      planModeRequired: false,
      model: 'claude-sonnet-4-6',
      allowedTools: ['web_search', 'port_scan'],
    };

    const mockIdentity = {
      agentId: 'agent-123',
      agentName: 'TestAgent',
      swarmRunId: 'swarm-456',
      pentestId: 'pentest-789',
      role: 'RECON',
      color: '#00ff00',
      planModeRequired: false,
      parentSessionId: 'session-abc',
    };

    beforeEach(() => {
      vi.clearAllMocks();
    });

    it('should create valid AgentRunnerConfig', () => {
      const tools = new Map([
        ['web_search', createMockTool('web_search', 'Results')],
        ['port_scan', createMockTool('port_scan', 'Ports')],
      ]);
      const toolRegistry = createMockToolRegistry(tools);
      const toolExecutor = createMockToolExecutor();
      const commandRegistry = createMockCommandRegistry();
      const eventEmitter = createMockEventEmitter();
      const taskManager = createMockTaskManager();
      const notificationQueue = createMockNotificationQueue();
      const parentAbortController = new AbortController();

      const mockCallModel = vi.fn().mockReturnValue(asyncGeneratorFrom([]));

      const config = buildConfig({
        spawnOptions: mockSpawnOptions,
        identity: mockIdentity,
        taskId: 'task-123',
        callModel: mockCallModel,
        toolExecutor,
        toolRegistry,
        commandRegistry,
        eventEmitter,
        taskManager,
        notificationQueue,
        parentAbortController,
      });

      expect(config).toEqual({
        identity: mockIdentity,
        taskId: 'task-123',
        prompt: 'Test prompt',
        agentContext: expect.objectContaining({
          agentId: 'agent-123',
          agentName: 'TestAgent',
          swarmRunId: 'swarm-456',
          pentestId: 'pentest-789',
          role: 'RECON',
          color: '#00ff00',
          planModeRequired: false,
          isTeamLead: false,
          agentType: 'teammate',
          abortController: parentAbortController,
        }),
        parentAbortController,
        llmExecutor: expect.any(Function),
        toolExecutor: expect.any(Function),
        eventEmitter,
        taskManager,
        notificationQueue,
        model: 'claude-sonnet-4-6',
        allowedTools: ['web_search', 'port_scan'],
      });
    });

    it('should filter tools by allowedTools', () => {
      const tools = new Map([
        ['web_search', createMockTool('web_search', 'Results')],
        ['port_scan', createMockTool('port_scan', 'Ports')],
        ['nmap_scan', createMockTool('nmap_scan', 'Nmap')],
      ]);
      const toolRegistry = createMockToolRegistry(tools);
      const toolExecutor = createMockToolExecutor();
      const commandRegistry = createMockCommandRegistry();
      const eventEmitter = createMockEventEmitter();
      const taskManager = createMockTaskManager();
      const notificationQueue = createMockNotificationQueue();
      const parentAbortController = new AbortController();

      const mockCallModel = vi.fn().mockReturnValue(asyncGeneratorFrom([]));

      const spawnOptionsWithSubset = {
        ...mockSpawnOptions,
        allowedTools: ['web_search', 'nonexistent_tool'],
      };

      const config = buildConfig({
        spawnOptions: spawnOptionsWithSubset,
        identity: mockIdentity,
        taskId: 'task-123',
        callModel: mockCallModel,
        toolExecutor,
        toolRegistry,
        commandRegistry,
        eventEmitter,
        taskManager,
        notificationQueue,
        parentAbortController,
      });

      // Should filter out 'nonexistent_tool' which doesn't exist in registry
      expect(config.allowedTools).toEqual(['web_search']);
    });

    it('should use all tools when allowedTools not specified', () => {
      const tools = new Map([
        ['web_search', createMockTool('web_search', 'Results')],
        ['port_scan', createMockTool('port_scan', 'Ports')],
      ]);
      const toolRegistry = createMockToolRegistry(tools);
      const toolExecutor = createMockToolExecutor();
      const commandRegistry = createMockCommandRegistry();
      const eventEmitter = createMockEventEmitter();
      const taskManager = createMockTaskManager();
      const notificationQueue = createMockNotificationQueue();
      const parentAbortController = new AbortController();

      const mockCallModel = vi.fn().mockReturnValue(asyncGeneratorFrom([]));

      const spawnOptionsWithoutTools = {
        ...mockSpawnOptions,
        allowedTools: undefined,
      };

      const config = buildConfig({
        spawnOptions: spawnOptionsWithoutTools,
        identity: mockIdentity,
        taskId: 'task-123',
        callModel: mockCallModel,
        toolExecutor,
        toolRegistry,
        commandRegistry,
        eventEmitter,
        taskManager,
        notificationQueue,
        parentAbortController,
      });

      // Should be undefined, meaning all tools are available
      expect(config.allowedTools).toBeUndefined();
    });

    it('should use default model when spawnOptions.model not specified', () => {
      const tools = new Map();
      const toolRegistry = createMockToolRegistry(tools);
      const toolExecutor = createMockToolExecutor();
      const commandRegistry = createMockCommandRegistry();
      const eventEmitter = createMockEventEmitter();
      const taskManager = createMockTaskManager();
      const notificationQueue = createMockNotificationQueue();
      const parentAbortController = new AbortController();

      const mockCallModel = vi.fn().mockReturnValue(asyncGeneratorFrom([]));

      const spawnOptionsWithoutModel = {
        ...mockSpawnOptions,
        model: undefined,
      };

      const config = buildConfig({
        spawnOptions: spawnOptionsWithoutModel,
        identity: mockIdentity,
        taskId: 'task-123',
        callModel: mockCallModel,
        toolExecutor,
        toolRegistry,
        commandRegistry,
        eventEmitter,
        taskManager,
        notificationQueue,
        parentAbortController,
        defaultModel: 'claude-opus-4-6',
      });

      expect(config.model).toBe('claude-opus-4-6');
    });

    it('should use spawnOptions.systemPrompt when provided', async () => {
      const tools = new Map();
      const toolRegistry = createMockToolRegistry(tools);
      const toolExecutor = createMockToolExecutor();
      const commandRegistry = createMockCommandRegistry();
      const eventEmitter = createMockEventEmitter();
      const taskManager = createMockTaskManager();
      const notificationQueue = createMockNotificationQueue();
      const parentAbortController = new AbortController();

      const mockCallModel = vi.fn().mockReturnValue(asyncGeneratorFrom([]));

      const spawnOptionsWithPrompt = {
        ...mockSpawnOptions,
        systemPrompt: 'Custom system prompt',
      };

      const config = buildConfig({
        spawnOptions: spawnOptionsWithPrompt,
        identity: mockIdentity,
        taskId: 'task-123',
        callModel: mockCallModel,
        toolExecutor,
        toolRegistry,
        commandRegistry,
        eventEmitter,
        taskManager,
        notificationQueue,
        parentAbortController,
      });

      // Verify the llmExecutor uses the system prompt
      const agentContext = createMockAgentContext();
      const signal = new AbortController().signal;

      // Call the llmExecutor to verify it uses the system prompt
      // Must consume the async generator
      const llmExecutor = config.llmExecutor({
        prompt: 'Test',
        contextMessages: [],
        tools: [],
        agentContext,
        signal,
      });

      // Consume the generator
      for await (const _chunk of llmExecutor) {
        // Empty
      }

      expect(mockCallModel).toHaveBeenCalledWith(
        expect.objectContaining({
          systemPrompt: 'Custom system prompt',
        })
      );
    });
  });
});
