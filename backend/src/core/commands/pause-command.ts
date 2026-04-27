/**
 * @module core/commands/pause-command
 * @description Pauses the current swarm execution (sentinel for frontend).
 */

import type { LocalCommand, CommandContext, CommandResult } from '../types/command-types.js';

export const pauseCommand: LocalCommand = {
  type: 'local',
  name: 'pause',
  description: 'Pause the current swarm execution',
  group: 'actions',

  async call(args: string, context: CommandContext): Promise<CommandResult> {
    return {
      type: 'text',
      content: '__PAUSE__',
    };
  },
};
