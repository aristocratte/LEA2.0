/**
 * @module core/commands/status-command
 * @description Shows current swarm status summary.
 */

import type { LocalCommand, CommandContext, CommandResult } from '../types/command-types.js';
import { formatCost, formatTokens } from '../analytics/pricing-table.js';

export const statusCommand: LocalCommand = {
  type: 'local',
  name: 'status',
  aliases: ['st'],
  description: 'Show current swarm and task status',
  group: 'info',

  async call(args: string, context: CommandContext): Promise<CommandResult> {
    try {
      const swarmOrchestrator = context.swarmOrchestrator as any;
      const runtimeTaskManager = context.runtimeTaskManager as any;
      const permissionRequestStore = context.permissionRequestStore as any;

      const parts: string[] = [];

      // Agent counts
      let activeAgents = 0;
      let idleAgents = 0;
      let totalAgents = 0;

      if (swarmOrchestrator && typeof swarmOrchestrator.listAgents === 'function') {
        const agents: any[] = await swarmOrchestrator.listAgents();
        totalAgents = agents.length;
        for (const agent of agents) {
          if (agent.status === 'active' || agent.status === 'running') {
            activeAgents++;
          } else {
            idleAgents++;
          }
        }
      }

      parts.push(`Agents: ${activeAgents} active, ${idleAgents} idle (${totalAgents} total)`);

      // Runtime task count
      let runtimeTaskCount = 0;
      if (runtimeTaskManager && typeof runtimeTaskManager.listTasks === 'function') {
        const tasks: any[] = await runtimeTaskManager.listTasks();
        runtimeTaskCount = tasks.length;
      }

      parts.push(`Runtime tasks: ${runtimeTaskCount}`);

      // Pending permissions count
      let pendingPerms = 0;
      if (permissionRequestStore && typeof permissionRequestStore.listPending === 'function') {
        const pending: any[] = await permissionRequestStore.listPending();
        pendingPerms = pending.length;
      }

      parts.push(`Pending permissions: ${pendingPerms}`);

      // Cost/stats from CostTracker
      const costTracker = context.costTracker as any;
      if (costTracker && typeof costTracker.getGlobalStats === 'function') {
        const global = costTracker.getGlobalStats();
        if (global.totalCalls > 0) {
          parts.push(`LLM: ${global.totalCalls} calls, ${formatTokens(global.totalInputTokens + global.totalOutputTokens)} tokens, ${formatCost(global.totalCostUsd)}`);
        }
      }

      return {
        type: 'text',
        content: parts.join(' | '),
      };
    } catch (error: any) {
      return {
        type: 'text',
        content: `Error: ${error.message ?? 'Failed to get status'}`,
      };
    }
  },
};
