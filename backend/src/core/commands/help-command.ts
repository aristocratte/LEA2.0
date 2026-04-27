/**
 * @module core/commands/help-command
 * @description Lists all available slash commands.
 */

import type { LocalCommand, CommandContext, CommandResult } from '../types/command-types.js';

export const helpCommand: LocalCommand = {
  type: 'local',
  name: 'help',
  aliases: ['h', '?'],
  description: 'List all available commands',
  group: 'info',

  async call(args: string, context: CommandContext): Promise<CommandResult> {
    try {
      const registry = context.commandRegistry as any;

      if (!registry || typeof registry.getAll !== 'function') {
        return {
          type: 'text',
          content: 'Command registry not available.',
        };
      }

      const commands: any[] = registry.getAll();

      if (commands.length === 0) {
        return {
          type: 'text',
          content: 'No commands registered.',
        };
      }

      // Sort by group then name
      const sorted = [...commands].sort((a, b) => {
        const groupA = a.group ?? '';
        const groupB = b.group ?? '';
        if (groupA !== groupB) return groupA.localeCompare(groupB);
        return a.name.localeCompare(b.name);
      });

      const lines: string[] = ['Available commands:', ''];

      let currentGroup = '';
      for (const cmd of sorted) {
        const group = cmd.group ?? 'other';
        if (group !== currentGroup) {
          if (currentGroup !== '') lines.push('');
          lines.push(`[${group.toUpperCase()}]`);
          currentGroup = group;
        }

        const argHint = cmd.argHints ? ` ${cmd.argHints}` : '';
        const aliases = cmd.aliases?.length ? ` (aliases: ${cmd.aliases.join(', ')})` : '';
        lines.push(`  /${cmd.name}${argHint} — ${cmd.description}${aliases}`);
      }

      return {
        type: 'text',
        content: lines.join('\n'),
      };
    } catch (error: any) {
      return {
        type: 'text',
        content: `Error: ${error.message ?? 'Failed to list commands'}`,
      };
    }
  },
};
