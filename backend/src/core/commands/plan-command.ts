/**
 * @module core/commands/plan-command
 * @description Lists, enters, or exits plan mode for agents.
 */

import type { LocalCommand, CommandContext, CommandResult } from '../types/command-types.js';

export const planCommand: LocalCommand = {
  type: 'local',
  name: 'plan',
  description: 'List, enter, or exit plan mode for agents',
  argHints: 'list | enter <agentId> | exit <agentId>',
  group: 'actions',

  async call(args: string, context: CommandContext): Promise<CommandResult> {
    try {
      const planModeManager = context.planModeManager as any;

      if (!planModeManager) {
        return {
          type: 'text',
          content: 'Error: Plan mode manager not available.',
        };
      }

      const parts = args.trim().split(/\s+/);
      const subcommand = parts[0]?.toLowerCase();

      // list
      if (!subcommand || subcommand === 'list') {
        let agents: any[];
        if (typeof planModeManager.listPlanModeAgents === 'function') {
          agents = await planModeManager.listPlanModeAgents();
        } else if (typeof planModeManager.getAll === 'function') {
          agents = await planModeManager.getAll();
        } else {
          return {
            type: 'text',
            content: 'Error: Plan mode manager has no list method.',
          };
        }

        if (!agents || agents.length === 0) {
          return {
            type: 'text',
            content: 'No agents in plan mode.',
          };
        }

        const lines = agents.map((entry: any) => {
          const agentId = entry.agentId ?? entry.id ?? '?';
          const status = entry.status ?? 'active';
          return `- ${agentId} (${status})`;
        });

        return {
          type: 'text',
          content: `Agents in plan mode:\n${lines.join('\n')}`,
        };
      }

      // enter <agentId>
      if (subcommand === 'enter') {
        const agentId = parts.slice(1).join(' ').trim();
        if (!agentId) {
          return {
            type: 'text',
            content: 'Error: Agent ID required. Usage: /plan enter <agentId>',
          };
        }

        await planModeManager.enterPlanMode(agentId);
        return {
          type: 'text',
          content: `Agent ${agentId} entered plan mode.`,
        };
      }

      // exit <agentId>
      if (subcommand === 'exit') {
        const agentId = parts.slice(1).join(' ').trim();
        if (!agentId) {
          return {
            type: 'text',
            content: 'Error: Agent ID required. Usage: /plan exit <agentId>',
          };
        }

        await planModeManager.exitPlanMode(agentId);
        return {
          type: 'text',
          content: `Agent ${agentId} exited plan mode.`,
        };
      }

      return {
        type: 'text',
        content: `Unknown subcommand: ${subcommand}. Usage: /plan list | enter <agentId> | exit <agentId>`,
      };
    } catch (error: any) {
      return {
        type: 'text',
        content: `Error: ${error.message ?? 'Failed to manage plan mode'}`,
      };
    }
  },
};
