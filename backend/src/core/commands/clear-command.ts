/**
 * @module core/commands/clear-command
 * @description Clears the terminal/feed (sentinel for frontend).
 */

import type { LocalCommand, CommandContext, CommandResult } from '../types/command-types.js';

export const clearCommand: LocalCommand = {
  type: 'local',
  name: 'clear',
  description: 'Clear the terminal feed',
  group: 'info',

  async call(args: string, context: CommandContext): Promise<CommandResult> {
    return {
      type: 'text',
      content: '__CLEAR__',
    };
  },
};
