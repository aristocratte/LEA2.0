/**
 * PermissionBridge — Worker→Leader permission forwarding
 *
 * When a worker agent needs permission to use a tool, it sends a permission
 * request to the leader via the mailbox system. The leader processes the
 * request and sends a response back through the worker's mailbox.
 *
 * For in-process teammates with access to the leader's UI, this uses a direct
 * queue-based approach. For process-separated teammates, it falls back to
 * the mailbox-based polling system.
 *
 * Adapted from Claude Code's leaderPermissionBridge.ts and permissionSync.ts.
 */

import { randomUUID } from 'node:crypto';
import {
  writeToMailbox,
  readMailbox,
  markMessageAsReadByIndex,
} from './Mailbox.js';
import type { PermissionRequest, PermissionResponse } from './types.js';
import {
  PERMISSION_RESPONSE_TIMEOUT_MS,
  MAILBOX_POLL_INTERVAL_MS,
  SWARM_EVENTS,
} from './constants.js';

// ============================================
// WORKER SIDE
// # ============================================

/**
 * Create a permission request object.
 */
export function createPermissionRequest(params: {
  toolName: string;
  toolUseId: string;
  input: Record<string, unknown>;
  description: string;
  workerId: string;
  workerName: string;
  workerColor?: string;
  swarmRunId: string;
  pentestId: string;
}): PermissionRequest {
  return {
    id: randomUUID(),
    toolUseId: params.toolUseId,
    toolName: params.toolName,
    input: params.input,
    description: params.description,
    workerId: params.workerId,
    workerName: params.workerName,
    workerColor: params.workerColor,
    swarmRunId: params.swarmRunId,
    pentestId: params.pentestId,
  };
}

/**
 * Send a permission request to the leader via mailbox and wait for response.
 *
 * This is used by worker agents that cannot directly access the leader's UI
 * (e.g., process-separated or headless teammates).
 *
 * @param request - The permission request to send
 * @param workerName - The worker's agent name (for reading responses)
 * @returns The permission decision: 'allow', 'deny', or 'abort'
 */
export async function sendPermissionRequestAndWait(
  request: PermissionRequest,
  workerName: string,
  abortSignal?: AbortSignal,
): Promise<{
  decision: 'allow' | 'deny' | 'abort';
  updatedInput?: Record<string, unknown>;
  permissionUpdates?: Array<{
    type: string;
    rules: Array<{ toolName: string; ruleContent: string }>;
    behavior: string;
  }>;
  feedback?: string;
}> {
  // Send request to leader's mailbox
  await writeToMailbox('team-lead', {
    from: workerName,
    text: JSON.stringify(request),
    timestamp: new Date().toISOString(),
    color: request.workerColor,
  }, { swarmRunId: request.swarmRunId });

  // Poll for response with timeout
  const startTime = Date.now();
  const pollInterval = setInterval(async () => {
    if (abortSignal?.aborted) {
      clearInterval(pollInterval);
      return;
    }

    try {
      const messages = await readMailbox(workerName, {
        swarmRunId: request.swarmRunId,
        unreadOnly: true,
      });

      for (let i = 0; i < messages.length; i++) {
        const msg = messages[i];
        if (!msg) continue;

        try {
          const parsed = JSON.parse(msg.text) as PermissionResponse;
          if (parsed.request_id === request.id) {
            clearInterval(pollInterval);
            await markMessageAsReadByIndex(workerName, request.swarmRunId, i);

            if (parsed.subtype === 'success') {
              return {
                decision: 'allow' as const,
                updatedInput: parsed.response?.updated_input,
                permissionUpdates: parsed.response?.permission_updates,
              };
            } else {
              return {
                decision: 'deny' as const,
                feedback: parsed.error,
              };
            }
          }
        } catch {
          // Not a permission response, skip
        }
      }
    } catch {
      // Continue polling
    }

    // Check timeout
    if (Date.now() - startTime > PERMISSION_RESPONSE_TIMEOUT_MS) {
      clearInterval(pollInterval);
    }
  }, MAILBOX_POLL_INTERVAL_MS);

  // Wait for the response via a promise wrapper
  return new Promise(resolve => {
    let resolved = false;

    const checkResponse = async () => {
      if (resolved || abortSignal?.aborted) return;

      try {
        const messages = await readMailbox(workerName, {
          swarmRunId: request.swarmRunId,
          unreadOnly: true,
        });

        for (let i = 0; i < messages.length; i++) {
          const msg = messages[i];
          if (!msg) continue;

          try {
            const parsed = JSON.parse(msg.text) as PermissionResponse;
            if (parsed.request_id === request.id) {
              resolved = true;
              clearInterval(pollInterval);
              await markMessageAsReadByIndex(workerName, request.swarmRunId, i);

              if (parsed.subtype === 'success') {
                resolve({
                  decision: 'allow',
                  updatedInput: parsed.response?.updated_input,
                  permissionUpdates: parsed.response?.permission_updates,
                });
              } else {
                resolve({
                  decision: 'deny',
                  feedback: parsed.error,
                });
              }
              return;
            }
          } catch {
            // Not a permission response
          }
        }
      } catch {
        // Continue polling
      }

      // Check timeout
      if (Date.now() - startTime > PERMISSION_RESPONSE_TIMEOUT_MS) {
        resolved = true;
        clearInterval(pollInterval);
        resolve({ decision: 'deny', feedback: 'Permission request timed out' });
      }
    };

    const pollInterval = setInterval(checkResponse, MAILBOX_POLL_INTERVAL_MS);
    pollInterval.unref(); // Don't block process exit

    // Handle abort
    if (abortSignal) {
      const onAbort = () => {
        if (resolved) return;
        resolved = true;
        clearInterval(pollInterval);
        resolve({ decision: 'abort' });
      };
      abortSignal.addEventListener('abort', onAbort, { once: true });
    }
  });
}

// ============================================
// LEADER SIDE
// # ============================================

/**
 * Process incoming permission requests from workers.
 *
 * The leader reads its mailbox for permission requests and routes them to
 * the appropriate handler (UI queue, auto-approve, or auto-deny).
 */
export interface PermissionHandler {
  /**
   * Handle a permission request from a worker agent.
   * Returns 'allow', 'deny', or 'ask' (if needs user input).
   */
  handlePermissionRequest(
    request: PermissionRequest,
  ): Promise<{
    decision: 'allow' | 'deny';
    updatedInput?: Record<string, unknown>;
    permissionUpdates?: Array<{
      type: string;
      rules: Array<{ toolName: string; ruleContent: string }>;
      behavior: string;
    }>;
    feedback?: string;
  }>;
}

/**
 * Leader-side permission queue item.
 * Used when the leader needs to show a permission prompt in the UI.
 */
export interface LeaderPermissionQueueItem {
  /** Unique request ID */
  requestId: string;
  /** Tool use ID */
  toolUseId: string;
  /** Tool name */
  toolName: string;
  /** Tool input */
  input: Record<string, unknown>;
  /** Human-readable description */
  description: string;
  /** Worker info */
  worker: {
    id: string;
    name: string;
    color?: string;
  };
  /** Timestamp when the request was received */
  timestamp: number;
  /** Resolve the permission decision */
  resolve: (result: {
    decision: 'allow' | 'deny';
    updatedInput?: Record<string, unknown>;
    permissionUpdates?: Array<{
      type: string;
      rules: Array<{ toolName: string; ruleContent: string }>;
      behavior: string;
    }>;
    feedback?: string;
  }) => void;
  /** Reject with a reason */
  reject: (reason?: string) => void;
}

/**
 * Manages the leader's side of the permission bridge.
 * Polls the leader's mailbox for permission requests and routes them.
 */
export class LeaderPermissionBridge {
  private readonly pendingRequests: Map<string, {
    resolve: (result: PermissionResponse) => void;
    reject: (reason: string) => void;
    timeout: ReturnType<typeof setTimeout>;
  }> = new Map();
  private readonly queue: LeaderPermissionQueueItem[] = [];
  private pollTimer?: ReturnType<typeof setInterval>;
  private handler?: PermissionHandler;
  private swarmRunId?: string;
  private isPolling = false;

  /**
   * Start polling the leader's mailbox for permission requests.
   */
  startPolling(swarmRunId: string, handler?: PermissionHandler): void {
    this.swarmRunId = swarmRunId;
    this.handler = handler;

    if (this.isPolling) return;
    this.isPolling = true;

    this.pollTimer = setInterval(() => {
      void this.pollForRequests();
    }, MAILBOX_POLL_INTERVAL_MS);
    this.pollTimer.unref();
  }

  /**
   * Stop polling for permission requests.
   */
  stopPolling(): void {
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = undefined;
    }
    this.isPolling = false;

    // Reject all pending requests
    for (const [requestId, pending] of Array.from(this.pendingRequests)) {
      clearTimeout(pending.timeout);
      pending.reject('Leader shutting down');
      this.pendingRequests.delete(requestId);

      // Send denial response to worker
      void this.sendResponse(requestId, 'rejected', undefined, 'Leader shutting down');
    }
  }

  /**
   * Get the current permission queue (for UI display).
   */
  getQueue(): LeaderPermissionQueueItem[] {
    return [...this.queue];
  }

  /**
   * Remove an item from the queue (after it's been resolved).
   */
  removeFromQueue(requestId: string): void {
    const idx = this.queue.findIndex(item => item.requestId === requestId);
    if (idx !== -1) {
      this.queue.splice(idx, 1);
    }
  }

  /**
   * Poll the leader's mailbox for permission requests.
   */
  private async pollForRequests(): Promise<void> {
    if (!this.swarmRunId) return;

    try {
      const messages = await readMailbox('team-lead', {
        swarmRunId: this.swarmRunId,
        unreadOnly: true,
      });

      for (let i = 0; i < messages.length; i++) {
        const msg = messages[i];
        if (!msg) continue;

        try {
          const parsed = JSON.parse(msg.text) as PermissionRequest;
          if (parsed.id && parsed.toolName && parsed.workerId) {
            await markMessageAsReadByIndex('team-lead', this.swarmRunId, i);

            if (this.handler) {
              // Try auto-handling first
              const result = await this.handler.handlePermissionRequest(parsed);
              await this.sendResponse(
                parsed.id,
                result.decision === 'allow' ? 'success' : 'rejected',
                result.decision === 'allow' ? {
                  updated_input: result.updatedInput,
                  permission_updates: result.permissionUpdates,
                } : undefined,
                result.feedback,
              );
            } else {
              // No handler — add to queue for UI processing
              this.addToQueue(parsed);
            }
          }
        } catch {
          // Not a permission request
        }
      }
    } catch {
      // Continue polling
    }
  }

  /**
   * Add a permission request to the UI queue.
   */
  private addToQueue(request: PermissionRequest): void {
    const queueItem: LeaderPermissionQueueItem = {
      requestId: request.id,
      toolUseId: request.toolUseId,
      toolName: request.toolName,
      input: request.input,
      description: request.description,
      worker: {
        id: request.workerId,
        name: request.workerName,
        color: request.workerColor,
      },
      timestamp: Date.now(),
      resolve: async (result) => {
        await this.sendResponse(
          request.id,
          result.decision === 'allow' ? 'success' : 'rejected',
          result.decision === 'allow' ? {
            updated_input: result.updatedInput,
            permission_updates: result.permissionUpdates,
          } : undefined,
          result.feedback,
        );
        this.removeFromQueue(request.id);
      },
      reject: async (reason) => {
        await this.sendResponse(request.id, 'rejected', undefined, reason);
        this.removeFromQueue(request.id);
      },
    };

    this.queue.push(queueItem);
  }

  /**
   * Send a permission response to a worker agent.
   */
  private async sendResponse(
    requestId: string,
    subtype: 'success' | 'rejected',
    response?: PermissionResponse['response'],
    error?: string,
  ): Promise<void> {
    const pending = this.pendingRequests.get(requestId);
    if (pending) {
      clearTimeout(pending.timeout);
      this.pendingRequests.delete(requestId);
    }

    // For mailbox-based responses, we need the worker's agent name.
    // The requestId doesn't directly contain it, so we rely on the polling
    // mechanism on the worker side. The response is sent to the worker
    // through the pending promise if available.
    if (pending) {
      const responseObj: PermissionResponse = {
        request_id: requestId,
        subtype,
        response,
        error,
      };
      pending.resolve(responseObj);
    }
  }
}

/**
 * Try to parse a mailbox message as a permission response.
 */
export function tryParsePermissionResponse(text: string): PermissionResponse | null {
  try {
    const parsed = JSON.parse(text);
    if (parsed && parsed.request_id && (parsed.subtype === 'success' || parsed.subtype === 'rejected')) {
      return parsed as PermissionResponse;
    }
  } catch {
    // Not JSON or not a permission response
  }
  return null;
}
