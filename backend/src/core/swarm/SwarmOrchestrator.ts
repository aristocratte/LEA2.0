/**
 * SwarmOrchestrator — Core-layer generic agent runtime coordinator.
 *
 * ## Architecture Note (C3 — Double Swarm)
 *
 * LEA has two orchestrators with distinct, complementary roles:
 *
 * - **This class (SwarmOrchestrator)**: Core-layer generic agent runtime.
 *   Owns `AgentSpawner`, `TaskManager`, `ToolExecutor` (with HookBus integration),
 *   permission system, memory extraction, cost tracking, health monitoring.
 *   Entry point: `/api/agents/*`. Decorated as singleton on Fastify in `index.ts`.
 *
 * - **PentestOrchestrator (`services/PentestOrchestrator.ts`)**: Service-layer
 *   domain-specific orchestrator for pentest workflows. Owns `PentestSwarm`
 *   (ReAct LLM supervisor), MCP tool gateway, preflight checks, trace recording,
 *   SysReptor reporting. Entry point: `/api/pentests/:id/swarm/*`.
 *
 * They are **intentionally separate**: this class handles generic agent lifecycle
 * (spawn/message/kill, permissions, hooks, memory), while PentestOrchestrator
 * handles the pentest domain (MCP tools, findings, traces, phase management).
 * Shared services (HookBus, ProviderManager) are injected into PentestOrchestrator
 * so both systems benefit from core infrastructure.
 *
 * Key features:
 * - spawnAgent(): Creates new agent and starts runTeammate loop
 * - sendMessage(): Injects messages into pendingUserMessages queue
 * - listAgents(): Returns current agents with status
 * - killAgent(): Aborts specific agent
 * - shutdown(): Gracefully terminates all agents
 *
 * Adapted from Claude Code's spawnMultiAgent.ts for LEA's backend architecture.
 */

import type { ToolRegistry } from '../runtime/ToolRegistry.js';
import type { ToolExecutor } from '../runtime/ToolExecutor.js';
import type { CommandRegistry } from '../runtime/CommandRegistry.js';
import type { NotificationQueue } from './NotificationQueue.js';
import type { SwarmEventEmitter } from '../../agents/swarm/SwarmEventEmitter.js';
import type { ModelCallParams, StreamEvent } from '../types/session-types.js';
import { AgentSpawner } from './AgentSpawner.js';
import { TaskManager } from './TaskManager.js';
import { runTeammate, type AgentRunnerConfig } from './AgentRunner.js';
import { buildConfig } from '../runtime/AgentRunnerAdapter.js';
import { ToolExecutor as RuntimeToolExecutor } from '../runtime/ToolExecutor.js';
import { AgentHealthMonitor, type HealthStatus } from './AgentHealthMonitor.js';
import type {
  SpawnOptions,
  SpawnResult,
  TeammateIdentity,
  TeammateTaskState,
} from './types.js';
import type { PersistentTaskManager } from './PersistentTaskManager.js';
import type { RuntimeTaskManager } from '../runtime/RuntimeTaskManager.js';
import type { PermissionRequestStore } from '../permissions/PermissionRequestStore.js';
import type { PermissionContext, PermissionUpdate } from '../permissions/types.js';
import type { AgentPermissionContextStore } from '../permissions/AgentPermissionContextStore.js';
import type { PermissionSyncManager, PermissionUpdate as SyncPermissionUpdate } from './PermissionSync.js';
import type { PlanModeManager } from '../runtime/PlanModeManager.js';

// ============================================================================
// TYPE ALIASES
// ============================================================================

/**
 * The runtime's callModel function signature.
 */
export type RuntimeCallModel = (params: ModelCallParams) => AsyncGenerator<StreamEvent>;

// ============================================================================
// TYPES
// ============================================================================

/**
 * Dependencies required by SwarmOrchestrator.
 */
export interface SwarmOrchestratorDeps {
  /** Runtime's callModel function (from LLMExecutor or createCallModel) */
  callModel: RuntimeCallModel;
  /** ToolRegistry for tool availability checks */
  toolRegistry: ToolRegistry;
  /** CommandRegistry for command availability */
  commandRegistry: CommandRegistry;
  /** Optional: TaskManager (will be created if not provided) */
  taskManager?: TaskManager;
  /** SwarmEventEmitter for broadcasting events */
  eventEmitter: SwarmEventEmitter;
  /** NotificationQueue for queuing notifications */
  notificationQueue: NotificationQueue;
  /** Default model to use if not overridden in spawn options */
  defaultModel?: string;
  /** Optional compactor for conversation management */
  compactor?: import('../runtime/ConversationCompactor.js').ConversationCompactor;
  /** Optional transcript logger for persistence */
  transcriptLogger?: import('../runtime/TranscriptLogger.js').TranscriptLogger;
  /** Model context window for compaction threshold calculation */
  modelContextWindow?: number;
  /** Optional session memory store for persistent message/summary storage */
  memoryStore?: import('../memory/SessionMemoryStore.js').SessionMemoryStore;
  /** Optional: MemoryExtractor for stable fact extraction at checkpoints */
  memoryExtractor?: import('../memory/MemoryExtractor.js').MemoryExtractor;
  /**
   * Optional PersistentTaskManager for cleaning up task ownership
   * when agents are killed or shut down.
   * When provided, unassignAgentTasks() is called automatically.
   */
  persistentTaskManager?: PersistentTaskManager;
  runtimeTaskManager?: RuntimeTaskManager;
  /** Optional PermissionRequestStore for interactive permission resolution */
  permissionRequestStore?: PermissionRequestStore;
  /** Base permission context for runtime tool execution */
  permissionContext?: PermissionContext;
  /** Optional per-agent permission context store */
  agentContextStore?: AgentPermissionContextStore;
  /** Optional permission sync manager for swarm-wide rule propagation */
  permissionSync?: PermissionSyncManager;
  /** Optional PlanModeManager for per-agent plan mode tracking */
  planModeManager?: PlanModeManager;
  /** Optional WorktreeManager for dynamic cwd resolution during tool execution */
  worktreeManager?: import('../worktree/index.js').WorktreeManager;
  /** Optional HookBus for runtime hook emission */
  hookBus?: import('../hooks/HookBus.js').HookBus;
}

/**
 * Status summary for a running agent.
 */
export interface AgentStatus {
  /** Full agent ID: "agentName@swarmRunId" */
  agentId: string;
  /** Display name */
  name: string;
  /** Current status */
  status: string;
  /** Agent role */
  role: string;
  /** Swarm run ID */
  swarmRunId: string;
  /** Pentest ID */
  pentestId: string;
  /** Health status from health monitor */
  health?: HealthStatus;
}

/**
 * Tracked agent state in SwarmOrchestrator.
 */
interface TrackedAgent {
  /** Full AgentRunnerConfig passed to runTeammate */
  config: AgentRunnerConfig;
  /** AbortController for cancelling this teammate */
  abortController: AbortController;
  /** Promise from the runTeammate call (for error handling) */
  promise: Promise<void>;
  /** Teammate identity */
  identity: TeammateIdentity;
  /** Task ID for tracking */
  taskId: string;
}

// ============================================================================
// SWARM ORCHESTRATOR
// ============================================================================

/**
 * High-level coordinator for agent lifecycle in LEA's swarm.
 *
 * Manages spawning, messaging, listing, and killing of in-process teammates.
 * Integrates AgentSpawner, TaskManager, and AgentRunner to provide a unified API.
 *
 * @example
 * ```typescript
 * const orchestrator = new SwarmOrchestrator({
 *   callModel: myCallModelFn,
 *   toolRegistry: myToolRegistry,
 *   commandRegistry: myCommandRegistry,
 *   eventEmitter: myEventEmitter,
 *   defaultModel: 'claude-sonnet-4-6',
 * });
 *
 * const result = await orchestrator.spawnAgent({
 *   name: 'Recon Alpha',
 *   role: 'Recon',
 *   prompt: 'Scan the target for open ports',
 *   swarmRunId: 'run-123',
 *   pentestId: 'pt-456',
 * });
 *
 * orchestrator.sendMessage(result.agentId, 'Continue scanning');
 * const agents = orchestrator.listAgents();
 * await orchestrator.shutdown();
 * ```
 */
export class SwarmOrchestrator {
  private readonly spawner: AgentSpawner;
  private readonly taskManager: TaskManager;
  private readonly toolExecutor: RuntimeToolExecutor;
  private readonly deps: SwarmOrchestratorDeps;
  private readonly runningAgents: Map<string, TrackedAgent>;
  private readonly healthMonitor: AgentHealthMonitor;
  private readonly persistentTaskManager?: PersistentTaskManager;
  private readonly runtimeTaskManager?: RuntimeTaskManager;
  private readonly agentContextStore?: AgentPermissionContextStore;
  private readonly permissionSync?: PermissionSyncManager;
  private readonly planModeManager?: PlanModeManager;
  private readonly worktreeManager?: import('../worktree/index.js').WorktreeManager;
  private readonly hookBus?: import('../hooks/HookBus.js').HookBus;

  constructor(deps: SwarmOrchestratorDeps) {
    this.deps = deps;
    this.spawner = new AgentSpawner(deps.taskManager ?? new TaskManager());
    this.taskManager = deps.taskManager ?? this.spawner['taskManager'];
    this.toolExecutor = new RuntimeToolExecutor(deps.toolRegistry, deps.permissionRequestStore);
    this.runningAgents = new Map();
    this.healthMonitor = new AgentHealthMonitor();
    this.persistentTaskManager = deps.persistentTaskManager;
    this.runtimeTaskManager = deps.runtimeTaskManager;
    this.agentContextStore = deps.agentContextStore;
    this.permissionSync = deps.permissionSync;
    this.planModeManager = deps.planModeManager;
    this.worktreeManager = deps.worktreeManager;
    this.hookBus = deps.hookBus;

    // Wire WorktreeManager to ToolExecutor for dynamic cwd resolution
    if (this.worktreeManager) {
      this.toolExecutor.setWorktreeManager(this.worktreeManager);
    }

    // Wire HookBus to ToolExecutor for tool lifecycle events
    if (this.hookBus) {
      this.toolExecutor.setHookBus(this.hookBus);
    }

    // Wire RuntimeTaskManager for large output capture
    if (this.runtimeTaskManager) {
      this.toolExecutor.setRuntimeTaskManager(this.runtimeTaskManager);
    }

    if (this.permissionSync && this.agentContextStore) {
      this.permissionSync.onUpdate((agentId, updates) => {
        if (!this.agentContextStore?.hasContext(agentId)) return;

        const contextUpdates = updates
          .map((update) => this.fromSyncPermissionUpdate(update))
          .filter((update): update is PermissionUpdate => update !== null);

        if (contextUpdates.length === 0) return;
        this.agentContextStore.updateContext(agentId, contextUpdates);
      });
    }
  }

  /**
   * Spawn a new agent and start its execution loop.
   *
   * @param options - Spawn options for the new agent
   * @returns SpawnResult with agentId, taskId, and abortController
   */
  async spawnAgent(options: SpawnOptions): Promise<SpawnResult> {
    // Step 1: Spawn via AgentSpawner
    const spawnResult = await this.spawner.spawn(options);
    if (!spawnResult.success) return spawnResult;

    // Step 2: Get identity from spawner
    const identity = this.spawner.getIdentity(spawnResult.agentId);
    if (!identity) {
      return {
        success: false,
        agentId: spawnResult.agentId,
        taskId: spawnResult.taskId,
        abortController: spawnResult.abortController,
        error: `Failed to get identity for agent ${spawnResult.agentId}`,
      };
    }

    // Step 3: Create per-agent permission context before building the runtime config
    const agentPermissionContext =
      this.agentContextStore?.createContext(identity.agentId, {
        mode: this.deps.permissionContext?.mode,
      }) ?? this.deps.permissionContext;

    // Step 4: Build AgentRunnerConfig via AgentRunnerAdapter
    const config = buildConfig({
      spawnOptions: options,
      identity,
      taskId: spawnResult.taskId,
      callModel: this.deps.callModel,
      toolExecutor: this.toolExecutor,
      toolRegistry: this.deps.toolRegistry,
      commandRegistry: this.deps.commandRegistry,
      eventEmitter: this.deps.eventEmitter,
      taskManager: this.taskManager,
      notificationQueue: this.deps.notificationQueue,
      parentAbortController: spawnResult.abortController,
      defaultModel: this.deps.defaultModel,
      compactor: this.deps.compactor,
      transcriptLogger: this.deps.transcriptLogger,
      modelContextWindow: this.deps.modelContextWindow,
      memoryStore: this.deps.memoryStore,
      onActivity: () => this.healthMonitor.recordActivity(spawnResult.agentId, identity.agentName),
      permissionContext: agentPermissionContext,
      getPermissionContext: this.agentContextStore
        ? (agentId: string) => this.agentContextStore?.getContext(agentId)
        : undefined,
      cwd: options.cwd,
      hookBus: this.hookBus,
    });

    // Step 5: Start runTeammate in background
    const promise = runTeammate(config).catch(err => {
      // Log but don't throw — agent errors are handled internally by failTeammate
      console.error(`[SwarmOrchestrator] Agent ${spawnResult.agentId} error:`, err);
    });

    // Step 6: Track running agent
    this.runningAgents.set(spawnResult.agentId, {
      config,
      abortController: spawnResult.abortController,
      promise,
      identity,
      taskId: spawnResult.taskId,
    });

    // Record initial activity for health monitoring
    this.healthMonitor.recordActivity(spawnResult.agentId, identity.agentName);

    // Initialize plan mode for the agent
    if (this.planModeManager) {
      this.planModeManager.initializeAgent(
        identity.agentId,
        Boolean(options.planModeRequired),
      );
    }

    // Register agent with permission sync manager
    if (this.permissionSync && options.swarmRunId) {
      this.permissionSync.start(options.swarmRunId);
      await this.permissionSync.registerAgent(identity.agentId, identity.agentName, options.swarmRunId);
    }

    // TODO: Start permission bridge if needed
    // - If agent is leader: start LeaderPermissionBridge with swarmRunId
    // - If agent is worker: create WorkerPermissionBridge for permission requests

    return spawnResult;
  }

  /**
   * Send a message to an agent via its pendingUserMessages queue.
   *
   * This is the fast in-memory path for delivering messages to running agents.
   * The agent's waitForNextPromptOrShutdown loop will pick up the message
   * on its next poll iteration.
   *
   * @param agentId - The agent ID to send the message to
   * @param message - The message text to send
   * @throws Error if agent not found
   */
  sendMessage(agentId: string, message: string): void {
    const trackedAgent = this.runningAgents.get(agentId);
    if (!trackedAgent) {
      throw new Error(`Agent ${agentId} not found`);
    }

    const taskHandle = this.taskManager.getTask(trackedAgent.taskId);
    if (!taskHandle || taskHandle.type !== 'teammate') {
      throw new Error(`Task for agent ${agentId} not found or not a teammate`);
    }

    const state = taskHandle as unknown as TeammateTaskState;
    state.pendingUserMessages.push(message);
  }

  /**
   * List all currently tracked agents with their status.
   *
   * @returns Array of AgentStatus for each running agent
   */
  listAgents(): AgentStatus[] {
    return Array.from(this.runningAgents.values()).map(tracked => {
      const taskHandle = this.taskManager.getTask(tracked.taskId);
      return {
        agentId: tracked.identity.agentId,
        name: tracked.identity.agentName,
        status: taskHandle?.status ?? 'unknown',
        role: tracked.identity.role,
        swarmRunId: tracked.identity.swarmRunId,
        pentestId: tracked.identity.pentestId,
        health: this.healthMonitor.getHealth(tracked.identity.agentId),
      };
    });
  }

  /**
   * Get a tracked agent by its ID.
   *
   * @param agentId - The agent ID to look up
   * @returns The tracked agent or undefined
   */
  getAgent(agentId: string): TrackedAgent | undefined {
    return this.runningAgents.get(agentId);
  }

  /**
   * Kill an agent by aborting its controller.
   *
   * @param agentId - The agent ID to kill
   * @returns true if the agent was killed successfully
   */
  async killAgent(agentId: string): Promise<boolean> {
    const trackedAgent = this.runningAgents.get(agentId);
    if (!trackedAgent) {
      return false;
    }

    // Stop any runtime shell tasks owned by this agent before terminating it.
    this.taskManager.stopTasksByAgent(agentId);

    // Abort the controller to stop execution
    trackedAgent.abortController.abort();

    // Mark as dead in health monitor
    this.healthMonitor.markDead(agentId);

    // Wait for the promise to settle
    await trackedAgent.promise.catch(() => {
      // Ignore errors - agent cleanup handles them
    });

    // Remove from tracking
    this.runningAgents.delete(agentId);

    // Remove per-agent permission context
    if (this.agentContextStore) {
      this.agentContextStore.removeContext(agentId);
    }

    // Remove agent from permission sync
    if (this.permissionSync) {
      this.permissionSync.removeAgent(agentId);
    }

    // Remove plan mode state
    if (this.planModeManager) {
      this.planModeManager.removeAgent(agentId);
    }

    // Clean up health monitor
    this.healthMonitor.remove(agentId);

    // Unassign persistent tasks owned by this agent
    await this.unassignAgentTasks(trackedAgent);
    this.cleanupRuntimeTasks(trackedAgent);

    return true;
  }

  /**
   * Unassign persistent tasks for a killed agent.
   * Cleans up task ownership across all relevant scopes (pentestId and teamId).
   */
  private async unassignAgentTasks(agent: TrackedAgent): Promise<void> {
    if (!this.persistentTaskManager) return;

    const identity = agent.identity;
    const scopePentestId = identity.pentestId;

    try {
      // Unassign in pentest scope (always available from identity)
      if (scopePentestId) {
        await this.persistentTaskManager.unassignAgentTasks(
          { pentestId: scopePentestId },
          identity.agentId,
        );
      }
    } catch (err) {
      // Log but don't fail the kill operation
      console.warn(
        `[SwarmOrchestrator] Failed to unassign persistent tasks for agent ${identity.agentId}:`,
        err,
      );
    }
  }

  private cleanupRuntimeTasks(agent: TrackedAgent): void {
    if (!this.runtimeTaskManager) return;
    this.runtimeTaskManager.cleanupTasks(agent.identity.agentId);
  }

  /**
   * Gracefully shut down all running agents.
   *
   * Aborts all agents and waits for them to terminate.
   */
  async shutdown(): Promise<void> {
    const agentIds = Array.from(this.runningAgents.keys());
    const trackedAgents = Array.from(this.runningAgents.values());

    // Abort all agents first
    for (const agentId of agentIds) {
      this.taskManager.stopTasksByAgent(agentId);
      const trackedAgent = this.runningAgents.get(agentId);
      trackedAgent?.abortController.abort();
    }

    // Wait for all promises to settle
    await Promise.allSettled(
      agentIds.map(agentId => {
        const trackedAgent = this.runningAgents.get(agentId);
        return trackedAgent?.promise.catch(() => {
          // Ignore errors - agent cleanup handles them
        });
      }),
    );

    // Unassign persistent tasks for all tracked agents before clearing state
    await Promise.allSettled(
      trackedAgents.map((agent) => this.unassignAgentTasks(agent)),
    );

    trackedAgents.forEach((agent) => this.cleanupRuntimeTasks(agent));
    trackedAgents.forEach((agent) => {
      this.agentContextStore?.removeContext(agent.identity.agentId);
      this.permissionSync?.removeAgent(agent.identity.agentId);
      this.planModeManager?.removeAgent(agent.identity.agentId);
    });

    // Fallback memory extraction for agents that didn't complete normally
    if (this.deps.memoryExtractor) {
      for (const [agentId, info] of this.runningAgents) {
        const projectKey = info.identity.pentestId ?? undefined;
        if (!projectKey) continue;

        const alreadyExtracted = await this.deps.memoryExtractor.wasTerminalExtractionDone(
          info.identity.swarmRunId, agentId,
        );
        if (alreadyExtracted) continue;

        try {
          await this.deps.memoryExtractor.extractFromSession({
            swarmRunId: info.identity.swarmRunId,
            agentId,
            pentestId: info.identity.pentestId,
            projectKey,
            trigger: 'SWARM_SHUTDOWN',
          });
        } catch (err: any) {
          console.error(`[MemoryExtractor] Failed at swarm_shutdown for ${agentId}:`, err.message ?? err);
        }
      }
    }

    // Clear tracking
    this.runningAgents.clear();

    // Clear health monitor
    this.healthMonitor.clear();

    // Stop permission sync manager
    if (this.permissionSync) {
      this.permissionSync.stop();
    }

    // Shutdown spawner (kills all teammates via taskManager)
    await this.spawner.shutdown();
  }

  /**
   * Get the AgentSpawner instance.
   *
   * Useful for accessing lower-level spawner methods like getActiveCount().
   */
  getSpawner(): AgentSpawner {
    return this.spawner;
  }

  /**
   * Get the TaskManager instance.
   *
   * Useful for accessing task-level operations.
   */
  getTaskManager(): TaskManager {
    return this.taskManager;
  }

  /**
   * Get the health status of a specific agent.
   *
   * @param agentId - The agent ID to check
   * @returns The health status of the agent
   */
  getAgentHealth(agentId: string): HealthStatus {
    return this.healthMonitor.getHealth(agentId);
  }

  /**
   * Get all agent health statuses.
   *
   * @returns Map of agent ID to health status
   */
  getAllAgentHealth(): Map<string, HealthStatus> {
    return this.healthMonitor.getAllHealth();
  }

  /**
   * Get the AgentHealthMonitor instance.
   *
   * Useful for direct access to health monitoring operations.
   */
  getHealthMonitor(): AgentHealthMonitor {
    return this.healthMonitor;
  }

  /**
   * Get the TranscriptLogger instance.
   *
   * Useful for reading agent transcripts.
   */
  getTranscriptLogger(): import('../runtime/TranscriptLogger.js').TranscriptLogger | undefined {
    return this.deps.transcriptLogger;
  }

  private fromSyncPermissionUpdate(update: SyncPermissionUpdate): PermissionUpdate | null {
    switch (update.type) {
      case 'addRules':
      case 'removeRules':
        return {
          type: update.type,
          rules: (update.rules ?? []).map((rule) => ({
            toolName: rule.toolName,
            ...(rule.ruleContent ? { ruleContent: rule.ruleContent } : {}),
          })),
          behavior: update.behavior,
          destination: update.destination === 'agent' ? 'session' : 'session',
        };
      case 'setMode':
        if (!update.mode) return null;
        return {
          type: 'setMode',
          mode: update.mode === 'bypass' ? 'bypassPermissions' : update.mode,
          destination: update.destination === 'agent' ? 'session' : 'session',
        };
      default:
        return null;
    }
  }
}

// ============================================================================
// EXPORTS
// ============================================================================

export default SwarmOrchestrator;
