/**
 * SendMessageTool — Tool for agents to send messages to other agents
 *
 * Provides a structured messaging interface for agents to communicate
 * with each other via the MessageBus. Uses AsyncLocalStorage to get
 * the current agent's context (agentName, swarmRunId).
 *
 * This tool is registered in the ToolRegistry and can be invoked by
 * agents during execution.
 */

import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import type { Tool, ToolDef, ToolResult } from '../../types/tool-types.js';
import { buildTool } from '../ToolRegistry.js';
import { getAgentContext } from '../../swarm/AgentContext.js';
import type { MessageBus } from '../../swarm/MessageBus.js';
import type {
  StructuredMessage,
  TaskAssignmentPayload,
  TextMessagePayload,
  ShutdownRequestPayload,
  ShutdownResponsePayload,
  IdleNotificationPayload,
} from '../../swarm/MessageBus.js';

// ============================================================================
// INPUT SCHEMA
// ============================================================================

/**
 * Zod schema for SendMessageTool input.
 */
export const SendMessageInputSchema = z.object({
  /** Recipient agent name or "team-lead" */
  to: z.string().min(1),
  /** Optional explicit recipient list for broadcast mode */
  recipients: z.array(z.string().min(1)).optional(),
  /** Whether to broadcast to recipients instead of sending directly */
  broadcast: z.boolean().default(false),
  /** Message content (for text type) or structured message (JSON) */
  message: z.union([
    z.string(),
    z.record(z.unknown()),
  ]),
  /** Message type: 'text' for simple messages, 'task_assignment' for task delegation */
  type: z.enum([
    'text',
    'task_assignment',
    'shutdown_request',
    'shutdown_response',
    'idle_notification',
  ]).default('text'),
  /** Task ID (required for task_assignment type) */
  taskId: z.string().optional(),
  /** Task subject (required for task_assignment type) */
  subject: z.string().optional(),
  /** Task description (optional for task_assignment type) */
  description: z.string().optional(),
  /** Task priority (optional for task_assignment type) */
  priority: z.number().int().min(0).max(1000).optional(),
  /** Request ID for shutdown messages */
  requestId: z.string().optional(),
  /** Approval flag for shutdown_response */
  approve: z.boolean().optional(),
  /** Reason for shutdown / response */
  reason: z.string().optional(),
  /** Idle reason for idle_notification */
  idleReason: z.enum(['available', 'interrupted', 'failed']).optional(),
  /** Last task id for idle_notification */
  lastTaskId: z.string().optional(),
}) as z.ZodType<{
  to: string;
  recipients?: string[];
  broadcast: boolean;
  message: string | Record<string, unknown>;
  type: 'text' | 'task_assignment' | 'shutdown_request' | 'shutdown_response' | 'idle_notification';
  taskId?: string;
  subject?: string;
  description?: string;
  priority?: number;
  requestId?: string;
  approve?: boolean;
  reason?: string;
  idleReason?: 'available' | 'interrupted' | 'failed';
  lastTaskId?: string;
}>;

export type SendMessageInput = z.infer<typeof SendMessageInputSchema>;

// ============================================================================
// OUTPUT SCHEMA
// ============================================================================

/**
 * Schema for SendMessageTool output.
 */
export const SendMessageOutputSchema = z.object({
  success: z.boolean(),
  messageId: z.string().optional(),
  error: z.string().optional(),
});

export type SendMessageOutput = z.infer<typeof SendMessageOutputSchema>;

// ============================================================================
// TOOL IMPLEMENTATION
// ============================================================================

/**
 * Create a SendMessageTool instance.
 *
 * The tool requires a MessageBus instance to be passed, which will be
 * used to send messages between agents.
 *
 * @param messageBus - The MessageBus instance for routing messages
 * @returns A Tool implementation for sending messages
 */
export function createSendMessageTool(messageBus: MessageBus): Tool<SendMessageInput, SendMessageOutput> {
  // Input schema with validation
  const inputSchema = SendMessageInputSchema;

  // Output schema
  const outputSchema = SendMessageOutputSchema;

  // Tool implementation
  const toolDef: ToolDef<SendMessageInput, SendMessageOutput> = {
    name: 'send_message',
    description: 'Send a message to another agent or team-lead. Supports text messages and task assignments.',
    inputSchema,
    outputSchema,
    maxResultSizeChars: 1000,

    async call(args: SendMessageInput, context): Promise<ToolResult<SendMessageOutput>> {
      try {
        // Get agent context from AsyncLocalStorage
        const agentContext = getAgentContext();

        if (!agentContext) {
          return {
            data: {
              success: false,
              error: 'Agent context not found. This tool must be called from within an agent execution scope.',
            },
          };
        }

        const { agentName, swarmRunId } = agentContext;

        if (!swarmRunId) {
          return {
            data: {
              success: false,
              error: 'Swarm run ID not found in agent context.',
            },
          };
        }

        let messageId: string;
        const recipients = args.broadcast
          ? (args.recipients && args.recipients.length > 0 ? args.recipients : [args.to])
          : [];

        if (args.broadcast) {
          let payload: unknown;
          switch (args.type) {
            case 'task_assignment':
              if (!args.taskId || !args.subject) {
                return {
                  data: {
                    success: false,
                    error: 'Task assignment requires taskId and subject fields.',
                  },
                };
              }
              payload = {
                taskId: args.taskId,
                subject: args.subject,
                description: args.description,
                priority: args.priority,
              } as TaskAssignmentPayload;
              break;
            case 'shutdown_request':
              if (!args.requestId) {
                return {
                  data: {
                    success: false,
                    error: 'Shutdown request requires requestId.',
                  },
                };
              }
              payload = {
                requestId: args.requestId,
                reason: args.reason,
              } as ShutdownRequestPayload;
              break;
            default:
              payload = {
                text: typeof args.message === 'string'
                  ? args.message
                  : JSON.stringify(args.message),
              } as TextMessagePayload;
              break;
          }

          const messageIds = await messageBus.broadcast(
            swarmRunId,
            agentName,
            recipients,
            {
              type: args.type,
              from: agentName,
              to: '*',
              payload,
            },
          );

          return {
            data: {
              success: true,
              messageId: messageIds[0],
            },
          };
        }

        if (args.type === 'task_assignment') {
          // Validate required fields for task assignment
          if (!args.taskId || !args.subject) {
            return {
              data: {
                success: false,
                error: 'Task assignment requires taskId and subject fields.',
              },
            };
          }

          // Create task assignment payload
          const payload: TaskAssignmentPayload = {
            taskId: args.taskId,
            subject: args.subject,
            description: args.description,
            priority: args.priority,
          };

          messageId = await messageBus.sendTaskAssignment(
            swarmRunId,
            agentName,
            args.to,
            payload,
          );
        } else if (args.type === 'shutdown_request') {
          if (!args.requestId) {
            return {
              data: {
                success: false,
                error: 'Shutdown request requires requestId.',
              },
            };
          }

          messageId = await messageBus.sendShutdownRequest(
            swarmRunId,
            agentName,
            args.to,
            {
              requestId: args.requestId,
              reason: args.reason,
            } as ShutdownRequestPayload,
          );
        } else if (args.type === 'shutdown_response') {
          if (!args.requestId || typeof args.approve !== 'boolean') {
            return {
              data: {
                success: false,
                error: 'Shutdown response requires requestId and approve.',
              },
            };
          }

          messageId = await messageBus.sendShutdownResponse(
            swarmRunId,
            agentName,
            args.to,
            {
              requestId: args.requestId,
              approve: args.approve,
              reason: args.reason,
            } as ShutdownResponsePayload,
          );
        } else if (args.type === 'idle_notification') {
          messageId = await messageBus.sendIdleNotification(
            swarmRunId,
            agentName,
            args.to,
            {
              idleReason: args.idleReason ?? 'available',
              lastTaskId: args.lastTaskId,
              message: typeof args.message === 'string'
                ? args.message
                : JSON.stringify(args.message),
            } as IdleNotificationPayload,
          );
        } else {
          // Plain text message
          const text = typeof args.message === 'string'
            ? args.message
            : JSON.stringify(args.message);

          messageId = await messageBus.sendText(
            swarmRunId,
            agentName,
            args.to,
            text,
          );
        }

        return {
          data: {
            success: true,
            messageId,
          },
        };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        return {
          data: {
            success: false,
            error: errorMessage,
          },
        };
      }
    },

    async checkPermissions() {
      // Messages between agents are generally allowed
      return { behavior: 'allow' };
    },

    isEnabled() {
      return true;
    },

    isReadOnly() {
      // Sending messages is a side effect (writes to mailbox)
      return false;
    },

    isConcurrencySafe() {
      // Multiple agents can send messages concurrently
      return true;
    },

    isDestructive() {
      return false;
    },

    userFacingName(input) {
      return `Send message to ${input.to}`;
    },

    getActivityDescription(input) {
      return `Sending ${input.type} message to ${input.to}`;
    },
  };

  return buildTool<SendMessageInput, SendMessageOutput>(toolDef);
}

// ============================================================================
// EXPORTS
// ============================================================================

export default createSendMessageTool;
