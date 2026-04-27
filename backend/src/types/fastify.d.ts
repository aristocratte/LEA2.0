/**
 * Fastify type augmentation for Prisma
 */

import 'fastify';
import { PrismaClient } from '@prisma/client';
import { z } from 'zod';
import type { AgentPermissionContextStore } from '../core/permissions/AgentPermissionContextStore.js';
import type { PermissionRequestStore } from '../core/permissions/PermissionRequestStore.js';
import type { PermissionSyncManager } from '../core/swarm/PermissionSync.js';
import type { PlanModeManager } from '../core/runtime/PlanModeManager.js';
import type { CommandRegistry } from '../core/runtime/CommandRegistry.js';
import type { WorktreeManager } from '../core/worktree/index.js';
import type { CostTracker } from '../core/analytics/CostTracker.js';
import type { SessionStats } from '../core/analytics/SessionStats.js';
import type { ToolExecutor } from '../core/runtime/ToolExecutor.js';
import type { SkillManager } from '../core/skills/index.js';
import type { PluginManager } from '../core/plugins/index.js';
import type { LspAnalysisService } from '../core/lsp/index.js';
import type { HookBus } from '../core/hooks/index.js';
import type { McpToolBridge } from '../core/mcp/McpToolBridge.js';

declare module 'fastify' {
  interface FastifyInstance {
    prisma: PrismaClient;
    agentContextStore?: AgentPermissionContextStore;
    permissionRequestStore?: PermissionRequestStore;
    permissionSync?: PermissionSyncManager;
    planModeManager?: PlanModeManager;
    commandRegistry?: CommandRegistry;
    worktreeManager?: WorktreeManager;
    costTracker?: CostTracker;
    sessionStats?: SessionStats;
    apiToolExecutor?: ToolExecutor;
    skillManager?: SkillManager;
    pluginManager?: PluginManager;
    lspAnalysisService?: LspAnalysisService;
    hookBus?: HookBus;
    mcpToolBridge?: McpToolBridge;
  }
}

// ============================================
// Fastify Request/Response Types
// ============================================

export interface FastifyRequestWithParams {
  params: {
    id: string;
  };
}

export interface FastifyRequestWithPentestQuery {
  query: {
    status?: PentestStatus;
    limit?: string;
    offset?: string;
  };
}

export interface FastifyRequestWithFindingsQuery {
  params: {
    id: string;
  };
  query: {
    severity?: Severity;
    status?: FindingStatus;
    limit?: string;
    offset?: string;
  };
}

export interface FastishRequestWithMessagesQuery {
  params: {
    id: string;
  };
  query: {
    limit?: string;
    before?: string;
    includeArchived?: string;
  };
}

export interface FastifyRequestWithReportsQuery {
  query: {
    page?: string;
    limit?: string;
    status?: ReportStatus;
    severity?: Severity;
    search?: string;
    sortBy?: string;
    order?: 'asc' | 'desc';
  };
}

export interface FastifyRequestWithProviderUsageQuery {
  params: {
    id: string;
  };
  query: {
    days?: string;
  };
}

// Import types from index
import type {
  PentestStatus,
  Severity,
  FindingStatus,
} from './index.js';

export type { ReportStatus } from './index.js';
