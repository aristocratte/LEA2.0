/**
 * AgentRunner — Agent execution loop
 *
 * Implements the core agent execution loop: LLM call → tool use → result → loop.
 * Each iteration runs within the agent's AsyncLocalStorage context for identity
 * isolation. Supports idle detection, shutdown requests, and continuous prompt
 * processing (teammates stay alive and receive multiple prompts).
 *
 * Adapted from Claude Code's inProcessRunner.ts for LEA's swarm architecture.
 */

import { runWithAgentContext, getAgentContext } from './AgentContext.js';
import type {
  AgentContext,
  TeammateIdentity,
  TeammateTaskState,
  AgentProgress,
  ToolActivity,
} from './types.js';
import { TaskManager } from './TaskManager.js';
import { StallDetector } from './StallDetector.js';
import { NotificationQueue } from './NotificationQueue.js';
import {
  MAILBOX_POLL_INTERVAL_MS,
  MAX_RECENT_ACTIVITIES,
  TEAMMATE_MESSAGES_UI_CAP,
  SWARM_EVENTS,
} from './constants.js';
import {
  readMailbox,
  writeToMailbox,
  markMessageAsReadByIndex,
} from './Mailbox.js';
import type {
  MailboxMessage,
  PermissionResponse,
  IdleNotification,
  ShutdownRequest,
} from './types.js';
import type { SwarmEventEmitter } from '../../agents/swarm/SwarmEventEmitter.js';
import { ConversationCompactor } from '../runtime/ConversationCompactor.js';
import { TranscriptLogger } from '../runtime/TranscriptLogger.js';
import type { HookBus } from '../hooks/HookBus.js';
import type { ChatMessage } from '../../services/ai/AIClient.js';
import type { SessionMemoryStore } from '../memory/SessionMemoryStore.js';

/**
 * Result from parsing a mailbox message.
 */
type WaitResult =
  | { type: 'shutdown_request'; request: ShutdownRequest; originalMessage: string }
  | { type: 'new_message'; message: string; from: string; color?: string; summary?: string }
  | { type: 'aborted' };

/**
 * Callback type for the LLM execution step.
 * The caller provides this to integrate with their actual LLM provider.
 */
export type LLMExecutor = (params: {
  prompt: string;
  contextMessages: Array<{ role: string; content: string }>;
  tools: string[];
  agentContext: AgentContext;
  signal: AbortSignal;
}) => AsyncGenerator<{ type: 'text' | 'tool_use'; content: string; toolName?: string; toolInput?: Record<string, unknown> }>;

/**
 * Callback type for tool execution.
 */
export type ToolExecutor = (params: {
  toolName: string;
  input: Record<string, unknown>;
  agentContext: AgentContext;
  signal: AbortSignal;
}) => Promise<{ output: string; error?: string }>;

/**
 * Configuration for the AgentRunner.
 */
export interface AgentRunnerConfig {
  /** Identity of the teammate agent */
  identity: TeammateIdentity;
  /** Task ID in the TaskManager */
  taskId: string;
  /** Initial prompt */
  prompt: string;
  /** Agent context for AsyncLocalStorage */
  agentContext: AgentContext;
  /** Parent abort controller (linked to swarm lifecycle) */
  parentAbortController: AbortController;
  /** LLM executor callback */
  llmExecutor: LLMExecutor;
  /** Tool executor callback */
  toolExecutor: ToolExecutor;
  /** Event emitter for broadcasting events */
  eventEmitter: SwarmEventEmitter;
  /** TaskManager reference */
  taskManager: TaskManager;
  /** Notification queue reference */
  notificationQueue: NotificationQueue;
  /** Model override */
  model?: string;
  /** Allowed tools */
  allowedTools?: string[];
  /** Optional compactor for conversation management */
  compactor?: ConversationCompactor;
  /** Optional transcript logger for persistence */
  transcriptLogger?: TranscriptLogger;
  /** Model context window for compaction threshold calculation */
  modelContextWindow?: number;
  /** Optional session memory store for persistent message/summary storage */
  memoryStore?: SessionMemoryStore;
  /** Optional memory extractor for stable fact extraction at checkpoints */
  memoryExtractor?: import('../memory/MemoryExtractor.js').MemoryExtractor;
  /** Optional callback called on each turn/activity (for health monitoring) */
  onActivity?: () => void;
  /** Optional HookBus for agent lifecycle event emission */
  hookBus?: HookBus;
}

/**
 * Progress tracker for computing activity deltas.
 */
interface ProgressTracker {
  toolUseCount: number;
  latestInputTokens: number;
  cumulativeOutputTokens: number;
  recentActivities: ToolActivity[];
}

function createProgressTracker(): ProgressTracker {
  return {
    toolUseCount: 0,
    latestInputTokens: 0,
    cumulativeOutputTokens: 0,
    recentActivities: [],
  };
}

function getProgressUpdate(tracker: ProgressTracker): AgentProgress {
  return {
    toolUseCount: tracker.toolUseCount,
    tokenCount: tracker.latestInputTokens + tracker.cumulativeOutputTokens,
    lastActivity: tracker.recentActivities.length > 0
      ? tracker.recentActivities[tracker.recentActivities.length - 1]
      : undefined,
    recentActivities: [...tracker.recentActivities],
  };
}

/**
 * Run an in-process teammate with a continuous prompt loop.
 *
 * Executes the LLM within the teammate's AsyncLocalStorage context,
 * tracks progress, handles idle detection, and waits for new prompts
 * or shutdown requests between turns.
 *
 * This is the main entry point for teammate execution.
 */
export async function runTeammate(config: AgentRunnerConfig): Promise<void> {
  const {
    identity,
    taskId,
    prompt,
    agentContext,
    parentAbortController,
    llmExecutor,
    toolExecutor,
    eventEmitter,
    taskManager,
    notificationQueue,
  } = config;

  const { pentestId, swarmRunId } = identity;

  // Accumulated messages across all turns
  const allMessages: Array<{ role: string; content: string }> = [];
  let currentPrompt = prompt;
  let shouldExit = false;
  let turnCounter = 0; // Track actual turn number for transcript logging

  try {
    while (!parentAbortController.signal.aborted && !shouldExit) {
      // Increment turn counter and signal activity for health monitoring
      turnCounter++;
      config.onActivity?.();

      // Per-turn abort controller (Escape stops current work, not the whole teammate)
      const currentWorkAbort = new AbortController();

      // Link lifecycle abort to work abort
      const onLifecycleAbort = () => {
        currentWorkAbort.abort();
      };
      parentAbortController.signal.addEventListener('abort', onLifecycleAbort, { once: true });

      // Update task state to running
      taskManager.updateTask(taskId, {
        status: 'running',
        isIdle: false,
      });
      // Set TeammateTaskState-specific fields directly
      const currentTask = taskManager.getTask(taskId);
      if (currentTask) {
        const teammate = currentTask as unknown as TeammateTaskState;
        teammate.agentStatus = 'THINKING';
        teammate.currentWorkAbortController = currentWorkAbort;
      }

      eventEmitter.emit(pentestId, {
        runId: swarmRunId,
        correlationId: `turn-${taskId}-${Date.now()}`,
        source: `agent:${identity.role}`,
        audience: 'internal',
        surfaceHint: 'activity',
        eventType: 'agent.running',
        payload: {
          type: 'agent.running',
          agentId: identity.agentId,
          role: identity.role,
          name: identity.agentName,
        },
      });

      const tracker = createProgressTracker();
      const iterationMessages: Array<{ role: string; content: string }> = [];

      // Execute the agent loop within context
      await runWithAgentContext(agentContext, async () => {
        // Check if compaction is needed before LLM call
        let contextMessages = allMessages.length > 0 ? [...allMessages] : undefined;
        if (contextMessages && config.compactor && config.modelContextWindow) {
          const compactor = config.compactor;
          const threshold = compactor.getCompactionThreshold(config.modelContextWindow);

          // Convert to ChatMessage format for compactor
          const chatMessages: ChatMessage[] = contextMessages.map(m => ({
            role: m.role === 'user' ? 'user' : 'assistant',
            content: m.content,
          }));

          const estimatedTokens = compactor.estimateTokens(chatMessages);
          if (estimatedTokens > threshold) {
            const result = await compactor.compact({
              messages: chatMessages,
              maxTokens: threshold,
              keepRecentCount: 6,
            });

            if (result.wasCompacted) {
              // The compactor produces [summaryMessage, ...recentMessages].
              // The summary replaces the prefix (allMessages before the split).
              const compactedCount = allMessages.length - 6; // keepRecentCount=6
              const summaryContent = (() => {
                const firstMsg = result.messages[0];
                if (!firstMsg) return '';
                return typeof firstMsg.content === 'string'
                  ? firstMsg.content
                  : JSON.stringify(firstMsg.content);
              })();

              // Persist compaction summary to memory store
              if (config.memoryStore && compactedCount > 0) {
                try {
                  // Get current messages to determine sequence range AND for extraction
                  const storedMsgs = await config.memoryStore.listMessages(swarmRunId, { activeOnly: true });
                  if (storedMsgs.length > 0) {
                    const fromSeq = storedMsgs[0]!.sequence;
                    const toSeq = storedMsgs[Math.min(compactedCount - 1, storedMsgs.length - 1)]!.sequence;

                    // Capture messages about to be compacted (with absolute sequences) for extraction
                    const compactedMessagesForExtraction = storedMsgs
                      .slice(0, compactedCount)
                      .map(m => ({
                        role: m.role,
                        content: m.content,
                        sequence: m.sequence,
                      }));

                    await config.memoryStore.storeSummary(swarmRunId, identity.agentId, {
                      summaryContent,
                      fromSequence: fromSeq,
                      toSequence: toSeq,
                      messageCount: compactedCount,
                      usedLLM: result.usedLLM ?? false,
                      tokensBefore: result.estimatedTokensBefore,
                      tokensAfter: result.estimatedTokensAfter,
                      pentestId,
                    });

                    // Post-compaction memory extraction (best-effort)
                    if (config.memoryExtractor && pentestId && compactedMessagesForExtraction.length > 0) {
                      try {
                        await config.memoryExtractor.extractFromMessages({
                          messages: compactedMessagesForExtraction,
                          swarmRunId,
                          agentId: identity.agentId,
                          pentestId,
                          projectKey: pentestId,
                          trigger: 'POST_COMPACTION',
                        });
                      } catch (err: any) {
                        console.error(`[MemoryExtractor] Failed at post_compaction for ${identity.agentId}:`, err.message ?? err);
                      }
                    }
                  }
                } catch (error) {
                  console.error(`[SessionMemory] Failed to persist compaction summary for ${identity.agentId}:`, error);
                }
              }

              // Update contextMessages with compacted version
              contextMessages = result.messages.map(m => ({
                role: m.role,
                content: typeof m.content === 'string' ? m.content : JSON.stringify(m.content),
              }));

              // Log compaction event (reusing agent.running event type)
              eventEmitter.emit(pentestId, {
                runId: swarmRunId,
                correlationId: `compact-${taskId}-${Date.now()}`,
                source: `agent:${identity.role}`,
                audience: 'internal',
                surfaceHint: 'activity',
                eventType: 'agent.running',
                payload: {
                  type: 'agent.running',
                  agentId: identity.agentId,
                  role: identity.role,
                  name: identity.agentName,
                  // Add compaction metadata to payload
                  compaction: {
                    tokensBefore: result.estimatedTokensBefore,
                    tokensAfter: result.estimatedTokensAfter,
                    usedLLM: result.usedLLM ?? false,
                  },
                },
              });
            }
          }
        }

        // Run the LLM
        for await (const chunk of llmExecutor({
          prompt: currentPrompt,
          contextMessages: contextMessages ?? [],
          tools: config.allowedTools ?? ['*'],
          agentContext,
          signal: currentWorkAbort.signal,
        })) {
          if (parentAbortController.signal.aborted) break;
          if (currentWorkAbort.signal.aborted) break;

          iterationMessages.push({ role: 'assistant', content: chunk.content });

          if (chunk.type === 'tool_use' && chunk.toolName && chunk.toolInput) {
            tracker.toolUseCount++;
            tracker.recentActivities.push({
              toolName: chunk.toolName,
              input: chunk.toolInput,
            });
            while (tracker.recentActivities.length > MAX_RECENT_ACTIVITIES) {
              tracker.recentActivities.shift();
            }

            // Update task status
            const progressUpdate = getProgressUpdate(tracker);
            {
              const t = taskManager.getTask(taskId);
              if (t) {
                const tm = t as unknown as TeammateTaskState;
                tm.agentStatus = 'RUNNING_TOOL';
                tm.progress = progressUpdate;
              }
            }

            // Signal activity before tool execution
            config.onActivity?.();

            // Execute the tool
            const result = await toolExecutor({
              toolName: chunk.toolName,
              input: chunk.toolInput,
              agentContext,
              signal: currentWorkAbort.signal,
            });

            // Signal activity after tool execution
            config.onActivity?.();

            if (result.error) {
              iterationMessages.push({
                role: 'user',
                content: `Tool error: ${result.error}`,
              });
            } else {
              iterationMessages.push({
                role: 'user',
                content: `Tool result: ${result.output}`,
              });
            }

            // Update progress after tool execution
            {
              const t = taskManager.getTask(taskId);
              if (t) {
                (t as unknown as TeammateTaskState).progress = getProgressUpdate(tracker);
              }
            }
          }
        }
      });

      // Clean up abort listener
      parentAbortController.signal.removeEventListener('abort', onLifecycleAbort);

      // Check if lifecycle was aborted
      if (parentAbortController.signal.aborted) break;

      // Add iteration messages to accumulated history
      allMessages.push({ role: 'user', content: currentPrompt });
      allMessages.push(...iterationMessages);

      // Log transcript if logger is configured
      if (config.transcriptLogger) {
        try {
          const turnMessages: ChatMessage[] = [
            { role: 'user', content: currentPrompt },
            ...iterationMessages.map(m => ({
              role: (m.role === 'user' ? 'user' : 'assistant') as 'user' | 'assistant',
              content: m.content,
            })),
          ];
          // Use the actual turn counter instead of deriving from message count
          await config.transcriptLogger.appendTurn(
            swarmRunId,
            identity.agentId,
            turnMessages,
            turnCounter,
          );
        } catch (error) {
          // Transcript logging is non-blocking — log error but continue
          console.error(`[TranscriptLogger] Failed to log transcript for ${identity.agentId}:`, error);
        }
      }

      // Persist messages to session memory store if configured
      if (config.memoryStore) {
        try {
          await config.memoryStore.addMessages(
            swarmRunId,
            identity.agentId,
            [
              { role: 'user', content: currentPrompt, pentestId },
              ...iterationMessages.map(m => ({
                role: m.role,
                content: m.content,
                pentestId,
              })),
            ],
          );
        } catch (error) {
          // Memory persistence is non-blocking — log error but continue
          console.error(`[SessionMemory] Failed to persist messages for ${identity.agentId}:`, error);
        }
      }

      // Transition to idle
      const task = taskManager.getTask(taskId);
      const wasAlreadyIdle = task ? (() => {
        const tm = task as unknown as TeammateTaskState;
        return tm.type === 'teammate' && tm.isIdle;
      })() : false;

      taskManager.updateTask(taskId, {
        status: 'idle',
      });
      // Set TeammateTaskState-specific fields directly
      {
        const t = taskManager.getTask(taskId);
        if (t) {
          const tm = t as unknown as TeammateTaskState;
          tm.isIdle = true;
          tm.agentStatus = 'IDLE';
          tm.currentWorkAbortController = undefined;
        }
      }

      // Fire idle callbacks
      if (task) {
        const teammateTask = task as unknown as TeammateTaskState;
        teammateTask.onIdleCallbacks?.forEach(cb => cb());
      }

      // Emit agent-idle hook
      if (config.hookBus && !wasAlreadyIdle) {
        await config.hookBus.emit('agent-idle', {
          agentId: identity.agentId,
          swarmRunId,
          pentestId,
          timestamp: new Date().toISOString(),
        });
      }

      // Send idle notification to leader (only on transition)
      if (!wasAlreadyIdle) {
        const notification: IdleNotification = {
          type: 'idle_notification',
          agentName: identity.agentName,
          idleReason: currentWorkAbort.signal.aborted ? 'interrupted' : 'available',
          summary: iterationMessages.length > 0
            ? iterationMessages[iterationMessages.length - 1]?.content?.substring(0, 100)
            : undefined,
          timestamp: new Date().toISOString(),
        };

        await writeToMailbox('team-lead', {
          from: identity.agentName,
          text: JSON.stringify(notification),
          timestamp: new Date().toISOString(),
          color: identity.color,
        }, { swarmRunId });
      }

      // Wait for next prompt or shutdown
      const waitResult = await waitForNextPromptOrShutdown(
        identity,
        parentAbortController,
        taskId,
        taskManager,
      );

      switch (waitResult.type) {
        case 'shutdown_request':
          currentPrompt = JSON.stringify(waitResult.request);
          break;
        case 'new_message':
          currentPrompt = waitResult.message;
          break;
        case 'aborted':
          shouldExit = true;
          break;
      }
    }

    // Mark as completed when exiting the loop
    await completeTeammate(taskId, identity.agentId, taskManager, eventEmitter, pentestId, swarmRunId, identity.agentName, identity.role, config.memoryExtractor, config.hookBus, turnCounter);
  } catch (error) {
    failTeammate(taskId, identity.agentId, taskManager, eventEmitter, notificationQueue, pentestId, swarmRunId, identity.agentName, identity.role, error);
  }
}

/**
 * Start a teammate in the background (fire-and-forget).
 */
export function startTeammate(config: AgentRunnerConfig): void {
  const agentId = config.identity.agentId;
  void runTeammate(config).catch(error => {
    failTeammate(
      config.taskId,
      config.identity.agentId,
      config.taskManager,
      config.eventEmitter,
      config.notificationQueue,
      config.identity.pentestId,
      config.identity.swarmRunId,
      config.identity.agentName,
      config.identity.role,
      error,
    );
  });
}

// ============================================
// INTERNAL HELPERS
// # ============================================

async function waitForNextPromptOrShutdown(
  identity: TeammateIdentity,
  abortController: AbortController,
  taskId: string,
  taskManager: TaskManager,
): Promise<WaitResult> {
  let pollCount = 0;

  while (!abortController.signal.aborted) {
    // Fast path: check in-memory pending messages first
    const task = taskManager.getTask(taskId);
    if (task?.type === 'teammate') {
      const teammateTask = task as unknown as TeammateTaskState;
      if (teammateTask.pendingUserMessages.length > 0) {
        const prompt = teammateTask.pendingUserMessages.shift()!;
        return {
          type: 'new_message',
          message: prompt,
          from: 'user',
        };
      }
    }

    if (pollCount > 0) {
      await new Promise(resolve => setTimeout(resolve, MAILBOX_POLL_INTERVAL_MS));
    }
    pollCount++;

    if (abortController.signal.aborted) {
      return { type: 'aborted' };
    }

    try {
      const allMessages = await readMailbox(identity.agentName, { swarmRunId: identity.swarmRunId });

      // Check for shutdown requests first (highest priority)
      for (let i = 0; i < allMessages.length; i++) {
        const msg = allMessages[i];
        if (!msg.read) {
          const parsed = tryParseShutdownRequest(msg.text);
          if (parsed) {
            await markMessageAsReadByIndex(identity.agentName, identity.swarmRunId, i);
            return {
              type: 'shutdown_request',
              request: parsed,
              originalMessage: msg.text,
            };
          }
        }
      }

      // Check for team-lead messages (priority over peer messages)
      let selectedIndex = -1;
      for (let i = 0; i < allMessages.length; i++) {
        const msg = allMessages[i];
        if (!msg.read && msg.from === 'team-lead') {
          selectedIndex = i;
          break;
        }
      }

      // Fall back to first unread message
      if (selectedIndex === -1) {
        selectedIndex = allMessages.findIndex(m => !m.read);
      }

      if (selectedIndex !== -1) {
        const msg = allMessages[selectedIndex];
        if (msg) {
          await markMessageAsReadByIndex(identity.agentName, identity.swarmRunId, selectedIndex);
          return {
            type: 'new_message',
            message: msg.text,
            from: msg.from,
            color: msg.color,
            summary: msg.summary,
          };
        }
      }
    } catch {
      // Continue polling even if one read fails
    }
  }

  return { type: 'aborted' };
}

function tryParseShutdownRequest(text: string): ShutdownRequest | null {
  try {
    const parsed = JSON.parse(text);
    if (parsed && parsed.type === 'shutdown_request') {
      return parsed as ShutdownRequest;
    }
  } catch {
    // Not JSON
  }
  return null;
}

async function completeTeammate(
  taskId: string,
  agentId: string,
  taskManager: TaskManager,
  eventEmitter: SwarmEventEmitter,
  pentestId: string,
  swarmRunId: string,
  agentName: string,
  role: string,
  memoryExtractor?: import('../memory/MemoryExtractor.js').MemoryExtractor,
  hookBus?: HookBus,
  turnCount?: number,
): Promise<void> {
  taskManager.updateTask(taskId, {
    status: 'completed',
    endTime: Date.now(),
    notified: true,
    agentStatus: 'DONE',
    isIdle: false,
  });

  // Extract stable memories at agent completion (best-effort, non-blocking)
  if (memoryExtractor && pentestId) {
    try {
      await memoryExtractor.extractFromSession({
        swarmRunId,
        agentId,
        pentestId,
        projectKey: pentestId,
        trigger: 'AGENT_COMPLETE',
      });
    } catch (err: any) {
      console.error(`[MemoryExtractor] Failed at agent_complete for ${agentId}:`, err.message ?? err);
    }
  }

  eventEmitter.emit(pentestId, {
    runId: swarmRunId,
    correlationId: `complete-${taskId}`,
    source: `agent:${role}`,
    audience: 'internal',
    surfaceHint: 'activity',
    eventType: 'agent.completed',
    payload: {
      type: 'agent.completed',
      agentId,
      role,
      name: agentName,
    },
  });

  // Emit agent-completed hook
  if (hookBus) {
    await hookBus.emit('agent-completed', {
      agentId,
      swarmRunId,
      pentestId,
      turnCount: turnCount ?? 0,
      timestamp: new Date().toISOString(),
    });
  }
}

function failTeammate(
  taskId: string,
  agentId: string,
  taskManager: TaskManager,
  eventEmitter: SwarmEventEmitter,
  notificationQueue: NotificationQueue,
  pentestId: string,
  swarmRunId: string,
  agentName: string,
  role: string,
  error: unknown,
): void {
  const errorMessage = error instanceof Error ? error.message : 'Unknown error';

  taskManager.updateTask(taskId, {
    status: 'failed',
    endTime: Date.now(),
    notified: true,
    error: errorMessage,
    agentStatus: 'FAILED',
    isIdle: true,
  });

  eventEmitter.emit(pentestId, {
    runId: swarmRunId,
    correlationId: `failed-${taskId}`,
    source: `agent:${role}`,
    audience: 'internal',
    surfaceHint: 'activity',
    eventType: 'agent.failed',
    payload: {
      type: 'agent.failed',
      agentId,
      role,
      name: agentName,
      error: errorMessage,
    },
  });

  notificationQueue.enqueue(taskId, {
    value: `Agent "${agentName}" failed: ${errorMessage}`,
    mode: 'agent-notification',
    priority: 'later',
    agentId,
  });
}
