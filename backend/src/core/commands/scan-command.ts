/**
 * @module core/commands/scan-command
 * @description Prompt command that generates a security scan prompt.
 */

import type { PromptCommand } from '../types/command-types.js';

export const scanCommand: PromptCommand = {
  type: 'prompt',
  name: 'scan',
  description: 'Initiate a security scan on a target',
  argHints: '<target>',
  group: 'actions',

  async getPrompt(args: string): Promise<string> {
    const target = args.trim();
    if (!target) {
      return 'Please specify a target to scan. Usage: /scan <target>';
    }
    return `Perform a comprehensive security scan on: ${target}. Enumerate open ports, identify running services, check for common vulnerabilities.`;
  },
};
