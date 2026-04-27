/**
 * Commands API Client
 *
 * Functions for listing and executing slash commands via the backend.
 */

import { requestJson } from './api';

// ============================================
// TYPES
// ============================================

export interface CommandMeta {
  name: string;
  type: 'prompt' | 'local';
  aliases?: string[];
  description: string;
  argHints?: string;
  group?: string;
}

export interface CommandResult {
  type: 'text' | 'compact' | 'skip';
  content: string;
}

export interface ExecuteScope {
  pentestId?: string;
  teamId?: string;
}

interface CommandsListEnvelope {
  data: CommandMeta[];
}

interface ExecuteEnvelope {
  data: CommandResult;
}

// ============================================
// API
// ============================================

export const commandsApi = {
  async listCommands(): Promise<CommandMeta[]> {
    const result = await requestJson<CommandsListEnvelope>('/api/commands');
    return result.data ?? [];
  },

  async execute(command: string, args?: string, scope?: ExecuteScope): Promise<CommandResult> {
    const result = await requestJson<ExecuteEnvelope>('/api/commands/execute', {
      method: 'POST',
      body: { command, args: args ?? '', scope },
    });
    return result.data;
  },
};
