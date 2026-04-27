/**
 * @module permissions/AgentPermissionContextStore
 * @description In-memory store for per-agent permission contexts.
 *
 * Each running agent gets a context derived from the shared default context.
 * Updates are applied to the stored context so subsequent tool executions can
 * read the latest rules, modes, and allowed working directories.
 */

import type { PermissionContext, PermissionMode, PermissionUpdate } from './types.js';
import { createDefaultContext } from './PermissionContext.js';
import { applyPermissionUpdates } from './PermissionEngine.js';

export interface AgentContextInfo {
  agentId: string;
  mode: PermissionMode;
  allowRuleCount: number;
  denyRuleCount: number;
  askRuleCount: number;
}

export interface AgentContextDetails extends AgentContextInfo {
  allowRules: PermissionContext['alwaysAllowRules'];
  denyRules: PermissionContext['alwaysDenyRules'];
  askRules: PermissionContext['alwaysAskRules'];
  additionalWorkingDirectories: string[];
  shouldAvoidPermissionPrompts: boolean;
}

export class AgentPermissionContextStore {
  private readonly contexts = new Map<string, PermissionContext>();
  private readonly defaultContext: PermissionContext;

  constructor(defaultContext?: PermissionContext) {
    this.defaultContext = defaultContext ?? createDefaultContext();
  }

  createContext(
    agentId: string,
    overrides?: {
      mode?: PermissionMode;
      allowRules?: Partial<Record<string, readonly string[]>>;
      denyRules?: Partial<Record<string, readonly string[]>>;
      askRules?: Partial<Record<string, readonly string[]>>;
      headless?: boolean;
    },
  ): PermissionContext {
    const base = this.defaultContext;
    const context: PermissionContext = {
      mode: overrides?.mode ?? base.mode,
      alwaysAllowRules: { ...base.alwaysAllowRules, ...overrides?.allowRules },
      alwaysDenyRules: { ...base.alwaysDenyRules, ...overrides?.denyRules },
      alwaysAskRules: { ...base.alwaysAskRules, ...overrides?.askRules },
      additionalWorkingDirectories: new Map(base.additionalWorkingDirectories),
      shouldAvoidPermissionPrompts: overrides?.headless ?? base.shouldAvoidPermissionPrompts,
    };

    this.contexts.set(agentId, context);
    return context;
  }

  getContext(agentId: string): PermissionContext {
    return this.contexts.get(agentId) ?? this.defaultContext;
  }

  peekContext(agentId: string): PermissionContext | undefined {
    return this.contexts.get(agentId);
  }

  updateContext(agentId: string, updates: readonly PermissionUpdate[]): PermissionContext {
    const current = this.contexts.get(agentId);
    if (!current) {
      throw new Error(`No context for agent ${agentId}`);
    }

    const updated = applyPermissionUpdates(current, updates);
    this.contexts.set(agentId, updated);
    return updated;
  }

  hasContext(agentId: string): boolean {
    return this.contexts.has(agentId);
  }

  removeContext(agentId: string): boolean {
    return this.contexts.delete(agentId);
  }

  listContexts(): AgentContextInfo[] {
    const result: AgentContextInfo[] = [];
    for (const [agentId, ctx] of this.contexts) {
      result.push(this.toContextInfo(agentId, ctx));
    }
    return result;
  }

  inspectContext(agentId: string): AgentContextDetails | undefined {
    const context = this.contexts.get(agentId);
    if (!context) return undefined;

    const info = this.toContextInfo(agentId, context);
    return {
      ...info,
      allowRules: context.alwaysAllowRules,
      denyRules: context.alwaysDenyRules,
      askRules: context.alwaysAskRules,
      additionalWorkingDirectories: Array.from(context.additionalWorkingDirectories.keys()),
      shouldAvoidPermissionPrompts: Boolean(context.shouldAvoidPermissionPrompts),
    };
  }

  getDefaultContext(): PermissionContext {
    return this.defaultContext;
  }

  private toContextInfo(agentId: string, context: PermissionContext): AgentContextInfo {
    return {
      agentId,
      mode: context.mode,
      allowRuleCount: Object.values(context.alwaysAllowRules).flat().length,
      denyRuleCount: Object.values(context.alwaysDenyRules).flat().length,
      askRuleCount: Object.values(context.alwaysAskRules).flat().length,
    };
  }
}
