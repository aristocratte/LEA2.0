/**
 * @module core/commands/resume-command
 * @description Resumes the current swarm execution (sentinel for frontend).
 */

import type { LocalCommand, CommandContext, CommandResult } from '../types/command-types.js';

export const resumeCommand: LocalCommand = {
  type: 'local',
  name: 'resume',
  description: 'Resume the current swarm execution',
  group: 'actions',

  async call(args: string, context: CommandContext): Promise<CommandResult> {
    return {
      type: 'text',
      content: '__RESUME__',
    };
  },
};
