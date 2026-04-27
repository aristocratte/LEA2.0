/**
 * @module core/commands/teams-command
 * @description Lists or creates teams.
 */

import type { LocalCommand, CommandContext, CommandResult } from '../types/command-types.js';

export const teamsCommand: LocalCommand = {
  type: 'local',
  name: 'teams',
  aliases: ['team'],
  description: 'List or create teams',
  argHints: 'list | create <name>',
  group: 'navigation',

  async call(args: string, context: CommandContext): Promise<CommandResult> {
    try {
      const teamManager = context.teamManager as any;

      if (!teamManager) {
        return {
          type: 'text',
          content: 'Error: Team manager not available.',
        };
      }

      const parts = args.trim().split(/\s+/);
      const subcommand = parts[0]?.toLowerCase();

      // list (default)
      if (!subcommand || subcommand === 'list') {
        const teams: any[] = await teamManager.listTeams();

        if (teams.length === 0) {
          return {
            type: 'text',
            content: 'No teams found.',
          };
        }

        const lines = teams.map((team) => {
          const name = team.name ?? 'Unnamed';
          const id = team.id ?? '?';
          const members = team.members?.length ?? team.memberCount ?? 0;
          return `- ${name} (${id}) — ${members} member(s)`;
        });

        return {
          type: 'text',
          content: lines.join('\n'),
        };
      }

      // create <name>
      if (subcommand === 'create') {
        const name = parts.slice(1).join(' ').trim();
        if (!name) {
          return {
            type: 'text',
            content: 'Error: Team name required. Usage: /teams create <name>',
          };
        }

        const team = await teamManager.createTeam({
          name,
          leadAgentId: 'operator',
        });

        return {
          type: 'text',
          content: `Team "${name}" created (id: ${team.id ?? 'unknown'}).`,
        };
      }

      return {
        type: 'text',
        content: `Unknown subcommand: ${subcommand}. Usage: /teams list | create <name>`,
      };
    } catch (error: any) {
      return {
        type: 'text',
        content: `Error: ${error.message ?? 'Failed to manage teams'}`,
      };
    }
  },
};
