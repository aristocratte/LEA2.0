/**
 * @module core/commands/cost-command
 * @description Shows cost tracking information from the CostTracker.
 */

import type { LocalCommand, CommandContext, CommandResult } from '../types/command-types.js';
import { formatCost, formatTokens } from '../analytics/pricing-table.js';

export const costCommand: LocalCommand = {
  type: 'local',
  name: 'cost',
  description: 'Show token usage and estimated cost',
  group: 'info',

  async call(args: string, context: CommandContext): Promise<CommandResult> {
    try {
      const costTracker = context.costTracker as any;

      if (!costTracker || typeof costTracker.getGlobalStats !== 'function') {
        return {
          type: 'text',
          content: 'Cost tracker not available.',
        };
      }

      // Show global stats by default
      const global = costTracker.getGlobalStats();

      if (global.totalCalls === 0) {
        return {
          type: 'text',
          content: 'No LLM calls recorded yet. Cost tracking starts when agents make their first call.',
        };
      }

      const lines: string[] = [
        `Total: ${global.totalCalls} calls | ${formatTokens(global.totalInputTokens + global.totalOutputTokens)} tokens | ${formatCost(global.totalCostUsd)}`,
      ];

      if (global.activeModels.length > 0) {
        lines.push(`Models: ${global.activeModels.join(', ')}`);
      }

      lines.push(`Sessions tracked: ${global.sessionCount}`);

      return {
        type: 'text',
        content: lines.join('\n'),
      };
    } catch (error: any) {
      return {
        type: 'text',
        content: `Error: ${error.message ?? 'Failed to get cost info'}`,
      };
    }
  },
};
