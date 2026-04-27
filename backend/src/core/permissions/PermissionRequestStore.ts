/**
 * @module permissions/PermissionRequestStore
 * @description In-memory store for pending permission requests.
 *
 * When the PermissionEngine returns 'ask', the ToolExecutor creates a
 * PermissionRequestItem in this store and blocks via waitForResolution().
 * The REST API resolves requests via approve/deny, which unblocks the
 * waiting tool executor.
 */

import { randomUUID } from 'node:crypto';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface PermissionUpdateEntry {
  type: string;
  rules: Array<{ toolName: string; ruleContent?: string }>;
  behavior: string;
  destination: string;
}

export interface PermissionRequestItem {
  requestId: string;
  agentId: string;
  agentName: string;
  toolName: string;
  toolUseId: string;
  input: Record<string, unknown>;
  description: string;
  reason: string;
  timestamp: number;
  status: 'pending' | 'approved' | 'denied' | 'expired';
  result?: {
    decision: 'allow' | 'deny';
    updatedInput?: Record<string, unknown>;
    feedback?: string;
  };
  /** Permission updates produced by "always allow" approval. */
  permissionUpdates?: PermissionUpdateEntry[];
}

interface PendingPromise {
  resolve: (result: { decision: 'allow' | 'deny'; updatedInput?: Record<string, unknown>; feedback?: string }) => void;
  reject: (reason: string) => void;
  timer: ReturnType<typeof setTimeout>;
}

// ---------------------------------------------------------------------------
// PermissionRequestStore
// ---------------------------------------------------------------------------

export class PermissionRequestStore {
  private readonly requests = new Map<string, PermissionRequestItem>();
  private readonly promises = new Map<string, PendingPromise>();
  private readonly maxAge: number;
  private cleanupTimer?: ReturnType<typeof setInterval>;

  constructor(options?: { maxAge?: number }) {
    this.maxAge = options?.maxAge ?? 5 * 60 * 1000; // 5 minutes default
  }

  create(params: {
    agentId: string;
    agentName: string;
    toolName: string;
    toolUseId: string;
    input: Record<string, unknown>;
    description: string;
    reason: string;
  }): PermissionRequestItem {
    const requestId = randomUUID();
    const item: PermissionRequestItem = {
      requestId,
      ...params,
      timestamp: Date.now(),
      status: 'pending',
    };
    this.requests.set(requestId, item);
    return item;
  }

  get(requestId: string): PermissionRequestItem | undefined {
    return this.requests.get(requestId);
  }

  listPending(): PermissionRequestItem[] {
    return Array.from(this.requests.values()).filter(r => r.status === 'pending');
  }

  listByAgent(agentId: string): PermissionRequestItem[] {
    return Array.from(this.requests.values()).filter(r => r.agentId === agentId);
  }

  approve(requestId: string, options?: {
    updatedInput?: Record<string, unknown>;
    /** If true, create a rule to always allow this tool. */
    alwaysAllow?: boolean;
  }): PermissionRequestItem | undefined {
    const item = this.requests.get(requestId);
    if (!item || item.status !== 'pending') return undefined;

    const updatedInput = options?.updatedInput;

    item.status = 'approved';
    item.result = { decision: 'allow', updatedInput };

    // When alwaysAllow is true, create a PermissionUpdate that callers can
    // retrieve and propagate to agents / permission sync.
    if (options?.alwaysAllow) {
      item.permissionUpdates = [{
        type: 'addRules',
        rules: [{ toolName: item.toolName }],
        behavior: 'allow',
        destination: 'session',
      }];
    }

    this.requests.set(requestId, item);

    const pending = this.promises.get(requestId);
    if (pending) {
      clearTimeout(pending.timer);
      this.promises.delete(requestId);
      pending.resolve({ decision: 'allow', updatedInput });
    }
    return item;
  }

  deny(requestId: string, feedback?: string): PermissionRequestItem | undefined {
    const item = this.requests.get(requestId);
    if (!item || item.status !== 'pending') return undefined;

    item.status = 'denied';
    item.result = { decision: 'deny', feedback };
    this.requests.set(requestId, item);

    const pending = this.promises.get(requestId);
    if (pending) {
      clearTimeout(pending.timer);
      this.promises.delete(requestId);
      pending.resolve({ decision: 'deny', feedback });
    }
    return item;
  }

  /**
   * Get the permission updates from a resolved request.
   * Used to propagate "always allow" rules to agents.
   */
  getPermissionUpdates(requestId: string): PermissionUpdateEntry[] | undefined {
    const item = this.requests.get(requestId);
    if (!item) return undefined;
    return item.permissionUpdates;
  }

  waitForResolution(requestId: string, timeout?: number): Promise<{ decision: 'allow' | 'deny'; updatedInput?: Record<string, unknown>; feedback?: string }> {
    const item = this.requests.get(requestId);
    if (!item) return Promise.reject(new Error(`Permission request ${requestId} not found`));
    if (item.status !== 'pending') return Promise.resolve(item.result!);

    return new Promise((resolve, _reject) => {
      const timer = setTimeout(() => {
        this.promises.delete(requestId);
        // Expire the request
        if (item.status === 'pending') {
          item.status = 'expired';
          item.result = { decision: 'deny', feedback: 'Permission request timed out' };
        }
        resolve({ decision: 'deny', feedback: 'Permission request timed out' });
      }, timeout ?? this.maxAge);

      this.promises.set(requestId, { resolve, reject: _reject, timer });
    });
  }

  start(): void {
    this.cleanupTimer = setInterval(() => this.cleanupExpired(), 60_000);
    this.cleanupTimer.unref();
  }

  stop(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = undefined;
    }
    // Deny all pending requests on shutdown
    for (const [requestId, item] of this.requests) {
      if (item.status === 'pending') {
        this.deny(requestId, 'Server shutting down');
      }
    }
  }

  private cleanupExpired(): void {
    const now = Date.now();
    for (const [requestId, item] of this.requests) {
      if (item.status === 'pending' && now - item.timestamp > this.maxAge) {
        this.deny(requestId, 'Permission request expired');
      }
      // Remove old resolved items (> 1 hour)
      if (item.status !== 'pending' && now - item.timestamp > 60 * 60 * 1000) {
        this.requests.delete(requestId);
        this.promises.delete(requestId);
      }
    }
  }
}
