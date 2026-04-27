/**
 * @module core/runtime/AgentRunnerAdapter
 * @description Adapter that bridges AgentRunner with the new runtime components.
 *
 * The AgentRunnerAdapter provides factory functions that create the callback
 * types expected by AgentRunner using the runtime components (LLMExecutor,
 * ToolExecutor, ToolRegistry).
 *
 * This bridges two systems:
 * 1. AgentRunner (core/swarm/AgentRunner.ts) - expects LLMExecutor/ToolExecutor callbacks
 * 2. Runtime (core/runtime/) - provides LLMExecutor class, ToolExecutor class, ToolRegistry
 */

import type {
  LLMExecutor as AgentRunnerLLMExecutor,
  ToolExecutor as AgentRunnerToolExecutor,
  AgentRunnerConfig,
} from '../swarm/AgentRunner.js';
import type {
  AgentContext,
  SpawnOptions,
  TeammateIdentity,
} from '../swarm/types.js';
import type {
  StreamEvent,
  ModelCallParams,
} from '../types/session-types.js';
import type { Tool } from '../types/tool-types.js';
import type { ChatMessage } from '../../services/ai/AIClient.js';
import type { ToolRegistry } from './ToolRegistry.js';
import type { ToolExecutor } from './ToolExecutor.js';
import type { CommandRegistry } from './CommandRegistry.js';
import type { TaskManager } from '../swarm/TaskManager.js';
import type { NotificationQueue } from '../swarm/NotificationQueue.js';
import type { SwarmEventEmitter } from '../../agents/swarm/SwarmEventEmitter.js';
import type { PermissionContext } from '../permissions/types.js';

// ============================================================================
// TYPE ALIASES FOR CLARITY
// ============================================================================

/**
 * The runtime's callModel function signature.
 * This is what LLMExecutor.callModel() or createCallModel() returns.
 */
type RuntimeCallModel = (params: ModelCallParams) => AsyncGenerator<StreamEvent>;

// ============================================================================
// LLM EXECUTOR ADAPTER
// ============================================================================

/**
 * Parameters for building an AgentRunner LLMExecutor callback.
 */
export interface BuildLLMExecutorParams {
  /** The runtime's callModel function (from LLMExecutor or createCallModel) */
  callModel: RuntimeCallModel;
  /** Default model to use if not overridden */
  defaultModel: string;
  /** ToolRegistry for resolving available tools */
  toolRegistry: ToolRegistry;
  /** Optional system prompt override */
  systemPrompt?: string;
  /** Optional max tokens override */
  maxTokens?: number;
  /** Optional temperature override */
  temperature?: number;
  /** Session ID for cost/usage tracking attribution */
  sessionId?: string;
}

/**
 * Build an AgentRunner.LLMExecutor callback from the runtime's callModel function.
 *
 * This adapter:
 * 1. Converts AgentRunner's simple {prompt, contextMessages, tools} format into ModelCallParams
 * 2. Uses the runtime's callModel to stream events
 * 3. Maps StreamEvents back to AgentRunner's simple {type, content, toolName?, toolInput?} format
 * 4. Accumulates text_delta events into content chunks
 * 5. Yields tool_use events with toolName and toolInput
 *
 * @param params - Configuration for the LLM executor adapter
 * @returns An AgentRunner.LLMExecutor callback
 */
export function buildLLMExecutor(params: BuildLLMExecutorParams): AgentRunnerLLMExecutor {
  const { callModel, defaultModel, toolRegistry, systemPrompt, maxTokens, temperature, sessionId } = params;

  return async function* (params: {
    prompt: string;
    contextMessages: Array<{ role: string; content: string }>;
    tools: string[];
    agentContext: AgentContext;
    signal: AbortSignal;
  }): AsyncGenerator<{ type: 'text' | 'tool_use'; content: string; toolName?: string; toolInput?: Record<string, unknown> }> {
    const { prompt, contextMessages, tools: allowedTools, agentContext, signal } = params;

    // Build messages array: contextMessages first, then current prompt
    // Cast to ChatMessage since we trust AgentRunner to provide valid roles
    const messages: ChatMessage[] = [
      ...(contextMessages ?? []).map(
        (msg): ChatMessage => ({
          role: msg.role as 'user' | 'assistant',
          content: msg.content,
        })
      ),
      { role: 'user', content: prompt },
    ];

    // Resolve tool names to actual Tool objects
    const tools: Tool[] = [];
    if (allowedTools.length > 0) {
      for (const toolName of allowedTools) {
        const tool = toolRegistry.get(toolName);
        if (tool) {
          tools.push(tool);
        }
      }
    } else {
      // No tools specified — use all enabled tools
      tools.push(...toolRegistry.getEnabled());
    }

    const modelParams: ModelCallParams = {
      model: defaultModel,
      messages,
      tools,
      systemPrompt: systemPrompt ?? '',
      maxTokens,
      temperature,
      signal,
      sessionId,
    };

    try {
      for await (const event of callModel(modelParams)) {
        // Check for abort
        if (signal.aborted) {
          break;
        }

        switch (event.type) {
          case 'text_delta': {
            yield {
              type: 'text',
              content: event.text,
            };
            break;
          }

          case 'tool_use': {
            yield {
              type: 'tool_use',
              content: '', // Tool use has no text content
              toolName: event.toolName,
              toolInput: event.input as Record<string, unknown>,
            };
            break;
          }

          case 'error': {
            // Convert error to text output for AgentRunner
            yield {
              type: 'text',
              content: `[Error: ${event.error.message}]`,
            };
            break;
          }

          case 'thinking':
          case 'tool_result':
          case 'tool_progress':
          case 'turn_start':
          case 'turn_end':
            // These events are handled internally by the runtime
            // No direct mapping to AgentRunner's simple format
            break;
        }
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      yield {
        type: 'text',
        content: `[LLM execution error: ${errorMessage}]`,
      };
    }
  };
}

// ============================================================================
// TOOL EXECUTOR ADAPTER
// ============================================================================

/**
 * Parameters for building an AgentRunner ToolExecutor callback.
 */
export interface BuildToolExecutorParams {
  /** The runtime's ToolExecutor instance */
  toolExecutor: ToolExecutor;
  /** The ToolRegistry for tool availability checks */
  toolRegistry: ToolRegistry;
  /** Session ID for context building */
  sessionId: string;
  /** Base permission context for this agent/session */
  permissionContext?: PermissionContext;
  /** Resolve the latest permission context for a given agent ID. */
  getPermissionContext?: (agentId: string) => PermissionContext | undefined;
}

/**
 * Build an AgentRunner.ToolExecutor callback from the runtime's ToolExecutor.
 *
 * This adapter:
 * 1. Uses the ToolExecutor class to execute tools
 * 2. Maps results to {output: string, error?: string} format
 * 3. Handles errors gracefully
 *
 * @param params - Configuration for the tool executor adapter
 * @returns An AgentRunner.ToolExecutor callback
 */
export function buildToolExecutor(params: BuildToolExecutorParams): AgentRunnerToolExecutor {
  const { toolExecutor, toolRegistry, sessionId, permissionContext, getPermissionContext } = params;

  return async function (params: {
    toolName: string;
    input: Record<string, unknown>;
    agentContext: AgentContext;
    signal: AbortSignal;
  }): Promise<{ output: string; error?: string }> {
    const { toolName, input, agentContext, signal } = params;

    // Check if tool exists
    const tool = toolRegistry.get(toolName);
    if (!tool) {
      return {
        output: '',
        error: `Tool "${toolName}" not found in registry`,
      };
    }

    // Create abort controller for this execution
    const abortController = new AbortController();

    // Link external signal to our abort controller
    const onAbort = () => abortController.abort();
    signal.addEventListener('abort', onAbort, { once: true });

    try {
      // Generate a tool use ID for this execution
      const toolUseId = `tool-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;

      // Execute using the runtime's ToolExecutor
      const result = await toolExecutor.execute({
        toolUseId,
        toolName,
        input,
        sessionId,
        abortController,
        agentId: agentContext.agentId,
        agentName: agentContext.agentName,
        permissions: getPermissionContext?.(agentContext.agentId) ?? permissionContext,
        cwd: agentContext.cwd,
        runtimeContext: {
          pentestId: agentContext.pentestId,
          swarmRunId: agentContext.swarmRunId,
          role: agentContext.role,
        },
      });

      // Map the result to AgentRunner's format
      if (result.event.isError) {
        return {
          output: '',
          error: String(result.event.result),
        };
      }

      return {
        output: String(result.event.result),
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return {
        output: '',
        error: `Tool execution failed: ${errorMessage}`,
      };
    } finally {
      signal.removeEventListener('abort', onAbort);
    }
  };
}

// ============================================================================
// CONFIG BUILDER
// ============================================================================

/**
 * Parameters for building a complete AgentRunnerConfig.
 */
export interface BuildConfigParams {
  /** Spawn options from the swarm */
  spawnOptions: SpawnOptions;
  /** Identity of the teammate */
  identity: TeammateIdentity;
  /** Task ID for tracking */
  taskId: string;
  /** Runtime's callModel function */
  callModel: RuntimeCallModel;
  /** Runtime's ToolExecutor instance */
  toolExecutor: ToolExecutor;
  /** ToolRegistry for tool availability */
  toolRegistry: ToolRegistry;
  /** CommandRegistry for command availability */
  commandRegistry: CommandRegistry;
  /** Swarm event emitter */
  eventEmitter: SwarmEventEmitter;
  /** Task manager reference */
  taskManager: TaskManager;
  /** Notification queue reference */
  notificationQueue: NotificationQueue;
  /** Parent abort controller */
  parentAbortController: AbortController;
  /** Optional default model override */
  defaultModel?: string;
  /** Optional system prompt override */
  systemPrompt?: string;
  /** Optional compactor for conversation management */
  compactor?: import('./ConversationCompactor.js').ConversationCompactor;
  /** Optional transcript logger for persistence */
  transcriptLogger?: import('./TranscriptLogger.js').TranscriptLogger;
  /** Model context window for compaction threshold calculation */
  modelContextWindow?: number;
  /** Optional activity callback for health monitoring */
  onActivity?: () => void;
  /** Optional memory extractor for stable fact extraction at checkpoints */
  memoryExtractor?: import('../memory/MemoryExtractor.js').MemoryExtractor;
  /** Base permission context for this agent/session */
  permissionContext?: PermissionContext;
  /** Resolve the latest permission context for a given agent ID. */
  getPermissionContext?: (agentId: string) => PermissionContext | undefined;
  /** Working directory for this agent's tool executions */
  cwd?: string;
  /** Optional session memory store for persistent message/summary storage */
  memoryStore?: import('../memory/SessionMemoryStore.js').SessionMemoryStore;
  /** Optional HookBus for agent lifecycle events */
  hookBus?: import('../hooks/HookBus.js').HookBus;
}

/**
 * Build a complete AgentRunnerConfig from runtime components.
 *
 * This factory function:
 * 1. Creates the LLM executor callback using buildLLMExecutor
 * 2. Creates the tool executor callback using buildToolExecutor
 * 3. Resolves allowedTools from SpawnOptions, filtering the ToolRegistry
 * 4. Assembles the complete AgentRunnerConfig
 *
 * @param params - All required parameters for building the config
 * @returns A complete AgentRunnerConfig ready for use with AgentRunner
 */
export function buildConfig(params: BuildConfigParams): AgentRunnerConfig {
  const {
    spawnOptions,
    identity,
    taskId,
    callModel,
    toolExecutor: runtimeToolExecutor,
    toolRegistry,
    commandRegistry,
    eventEmitter,
    taskManager,
    notificationQueue,
    parentAbortController,
    defaultModel = 'claude-sonnet-4-6',
    systemPrompt,
  } = params;

  // Resolve session ID for tool execution
  const sessionId = `${identity.swarmRunId}-${identity.agentId}`;

  // Build the LLM executor callback
  const llmExecutor = buildLLMExecutor({
    callModel,
    defaultModel: spawnOptions.model ?? defaultModel,
    toolRegistry,
    systemPrompt: systemPrompt ?? spawnOptions.systemPrompt,
    maxTokens: undefined, // Use runtime defaults
    temperature: undefined, // Use runtime defaults
    sessionId,
  });

  // Build the tool executor callback
  const toolExecutor = buildToolExecutor({
    toolExecutor: runtimeToolExecutor,
    toolRegistry,
    sessionId,
    permissionContext: params.permissionContext,
    getPermissionContext: params.getPermissionContext,
  });

  // Resolve allowed tools
  let allowedTools: string[] | undefined;
  if (spawnOptions.allowedTools && spawnOptions.allowedTools.length > 0) {
    // Filter to only tools that exist in the registry
    allowedTools = spawnOptions.allowedTools.filter((toolName) =>
      toolRegistry.has(toolName)
    );
  } else {
    // No restriction - use all enabled tools from registry
    allowedTools = undefined;
  }

  // Build the agent context
  const agentContext: AgentContext = {
    agentId: identity.agentId,
    agentName: identity.agentName,
    swarmRunId: identity.swarmRunId,
    pentestId: identity.pentestId,
    role: identity.role,
    color: identity.color,
    planModeRequired: identity.planModeRequired,
    isTeamLead: false, // Teammates are never the team lead
    agentType: 'teammate',
    abortController: parentAbortController,
    permissionOverrides: undefined,
    cwd: params.cwd ?? spawnOptions.cwd,
  };

  return {
    identity,
    taskId,
    prompt: spawnOptions.prompt,
    agentContext,
    parentAbortController,
    llmExecutor,
    toolExecutor,
    eventEmitter,
    taskManager,
    notificationQueue,
    model: spawnOptions.model ?? defaultModel,
    allowedTools,
    compactor: params.compactor,
    transcriptLogger: params.transcriptLogger,
    modelContextWindow: params.modelContextWindow,
    memoryStore: params.memoryStore,
    memoryExtractor: params.memoryExtractor,
    onActivity: params.onActivity,
    hookBus: params.hookBus,
  };
}

// ============================================================================
// EXPORTS
// ============================================================================

export default {
  buildLLMExecutor,
  buildToolExecutor,
  buildConfig,
};
