/**
 * @module core/commands/agents-command
 * @description Lists, spawns, or kills swarm agents.
 */

import type { LocalCommand, CommandContext, CommandResult } from '../types/command-types.js';

export const agentsCommand: LocalCommand = {
  type: 'local',
  name: 'agents',
  aliases: ['a'],
  description: 'List, spawn, or kill swarm agents',
  argHints: 'list | spawn <name> | kill <id>',
  group: 'navigation',

  async call(args: string, context: CommandContext): Promise<CommandResult> {
    try {
      const swarmOrchestrator = context.swarmOrchestrator as any;

      if (!swarmOrchestrator) {
        return {
          type: 'text',
          content: 'Error: Swarm orchestrator not available.',
        };
      }

      const parts = args.trim().split(/\s+/);
      const subcommand = parts[0]?.toLowerCase();

      // list (default)
      if (!subcommand || subcommand === 'list') {
        const agents: any[] = await swarmOrchestrator.listAgents();

        if (agents.length === 0) {
          return {
            type: 'text',
            content: 'No agents running.',
          };
        }

        const lines = agents.map((agent) => {
          const id = agent.id ?? '?';
          const name = agent.name ?? agent.role ?? 'Unknown';
          const status = agent.status ?? 'unknown';
          const task = agent.currentTask ?? agent.task ?? '';
          return `- [${status}] ${name} (${id})${task ? ` — ${task}` : ''}`;
        });

        return {
          type: 'text',
          content: lines.join('\n'),
        };
      }

      // spawn <name>
      if (subcommand === 'spawn') {
        return {
          type: 'text',
          content: 'Use the UI to spawn agents. Agent spawning requires additional configuration parameters.',
        };
      }

      // kill <id>
      if (subcommand === 'kill') {
        const agentId = parts.slice(1).join(' ');
        if (!agentId) {
          return {
            type: 'text',
            content: 'Error: Agent ID required. Usage: /agents kill <id>',
          };
        }

        await swarmOrchestrator.killAgent(agentId);
        return {
          type: 'text',
          content: `Agent ${agentId} terminated.`,
        };
      }

      return {
        type: 'text',
        content: `Unknown subcommand: ${subcommand}. Usage: /agents list | spawn <name> | kill <id>`,
      };
    } catch (error: any) {
      return {
        type: 'text',
        content: `Error: ${error.message ?? 'Failed to manage agents'}`,
      };
    }
  },
};
