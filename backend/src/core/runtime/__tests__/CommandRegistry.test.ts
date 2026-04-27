/**
 * Tests for CommandRegistry
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { CommandRegistry, buildCommandContext, createCommandExecutionError } from '../CommandRegistry.js';
import type { PromptCommand, LocalCommand, CommandContext } from '../../types/command-types.js';
import type { Tool, ToolUseContext } from '../../types/tool-types.js';

describe('CommandRegistry', () => {
  let registry: CommandRegistry;
  let mockContext: CommandContext;

  beforeEach(() => {
    registry = new CommandRegistry();
    mockContext = {
      sessionId: 'test-session',
      args: '',
      toolUseContext: {
        sessionId: 'test-session',
        permissions: {} as any,
        abortController: new AbortController(),
        provider: null,
      },
      tools: new Map<string, Tool>(),
    };
  });

  describe('registration', () => {
    it('should register a prompt command', () => {
      const command: PromptCommand = {
        type: 'prompt',
        name: 'refactor',
        description: 'Refactor code',
        getPrompt: async (args) => `Refactor this: ${args}`,
      };

      const result = registry.register(command, 'builtin');

      expect(result).toBe(true);
      expect(registry.has('refactor')).toBe(true);
      expect(registry.size).toBe(1);
    });

    it('should register a local command', () => {
      const command: LocalCommand = {
        type: 'local',
        name: 'status',
        description: 'Show status',
        call: async (args, context) => ({
          type: 'text',
          content: 'Status: OK',
        }),
      };

      const result = registry.register(command, 'builtin');

      expect(result).toBe(true);
      expect(registry.has('status')).toBe(true);
    });

    it('should handle priority-based conflict resolution', () => {
      // Register low priority command first
      const lowPriorityCmd: PromptCommand = {
        type: 'prompt',
        name: 'test',
        description: 'Low priority',
        getPrompt: async () => 'low',
      };
      registry.register(lowPriorityCmd, 'skill', 100);

      // High priority should win
      const highPriorityCmd: PromptCommand = {
        type: 'prompt',
        name: 'test',
        description: 'High priority',
        getPrompt: async () => 'high',
      };
      const result = registry.register(highPriorityCmd, 'builtin', 1000);

      expect(result).toBe(true);
      const command = registry.get('test');
      expect(command?.description).toBe('High priority');
    });

    it('should reject lower priority command when higher exists', () => {
      // Register high priority first
      const highPriorityCmd: PromptCommand = {
        type: 'prompt',
        name: 'test',
        description: 'High priority',
        getPrompt: async () => 'high',
      };
      registry.register(highPriorityCmd, 'builtin', 1000);

      // Low priority should be rejected
      const lowPriorityCmd: PromptCommand = {
        type: 'prompt',
        name: 'test',
        description: 'Low priority',
        getPrompt: async () => 'low',
      };
      const result = registry.register(lowPriorityCmd, 'skill', 100);

      expect(result).toBe(false);
      const command = registry.get('test');
      expect(command?.description).toBe('High priority');
    });

    it('should register command aliases', () => {
      const command: PromptCommand = {
        type: 'prompt',
        name: 'help',
        aliases: ['h', '?'],
        description: 'Show help',
        getPrompt: async () => 'Help text',
      };

      registry.register(command, 'builtin');

      expect(registry.has('help')).toBe(true);
      expect(registry.has('h')).toBe(true);
      expect(registry.has('?')).toBe(true);
    });
  });

  describe('unregistration', () => {
    beforeEach(() => {
      registry.register({
        type: 'prompt',
        name: 'to_remove',
        aliases: ['alias_rm'],
        description: 'Will be removed',
        getPrompt: async () => 'text',
      }, 'builtin');
    });

    it('should unregister command by name', () => {
      expect(registry.has('to_remove')).toBe(true);

      const result = registry.unregister('to_remove');

      expect(result).toBe(true);
      expect(registry.has('to_remove')).toBe(false);
      expect(registry.has('alias_rm')).toBe(false);
    });

    it('should unregister command by alias', () => {
      const result = registry.unregister('alias_rm');

      expect(result).toBe(true);
      expect(registry.has('to_remove')).toBe(false);
    });

    it('should return false for unknown command', () => {
      const result = registry.unregister('unknown');
      expect(result).toBe(false);
    });
  });

  describe('execution', () => {
    it('should execute prompt command', async () => {
      const command: PromptCommand = {
        type: 'prompt',
        name: 'expand',
        description: 'Expand to prompt',
        getPrompt: async (args) => `Expanded: ${args}`,
      };

      registry.register(command, 'builtin');

      const result = await registry.execute('expand', 'test args', mockContext);

      expect(result.type).toBe('text');
      expect(result.content).toBe('Expanded: test args');
    });

    it('should execute local command', async () => {
      const command: LocalCommand = {
        type: 'local',
        name: 'local_cmd',
        description: 'Local command',
        call: async (args, context) => ({
          type: 'compact',
          content: `Executed with: ${args}`,
        }),
      };

      registry.register(command, 'builtin');

      const result = await registry.execute('local_cmd', 'input', mockContext);

      expect(result.type).toBe('compact');
      expect(result.content).toBe('Executed with: input');
    });

    it('should return error for unknown command', async () => {
      const result = await registry.execute('unknown', 'args', mockContext);

      expect(result.type).toBe('text');
      expect(result.content).toContain('Unknown command');
    });

    it('should return skip result for disabled command', async () => {
      const command: LocalCommand = {
        type: 'local',
        name: 'disabled',
        description: 'Disabled command',
        isEnabled: () => false,
        call: async () => ({ type: 'text', content: 'Should not run' }),
      };

      registry.register(command, 'builtin');

      const result = await registry.execute('disabled', 'args', mockContext);

      expect(result.type).toBe('skip');
      expect(result.content).toContain('disabled');
    });
  });

  describe('filtering', () => {
    beforeEach(() => {
      registry.register({
        type: 'prompt',
        name: 'builtin_cmd',
        description: 'Builtin',
        getPrompt: async () => 'text',
      }, 'builtin');

      registry.register({
        type: 'prompt',
        name: 'skill_cmd',
        description: 'Skill',
        getPrompt: async () => 'text',
      }, 'skill');

      registry.register({
        type: 'prompt',
        name: 'plugin_cmd',
        description: 'Plugin',
        getPrompt: async () => 'text',
      }, 'plugin');
    });

    it('should get all commands', () => {
      const all = registry.getAll();
      expect(all).toHaveLength(3);
    });

    it('should get commands by source', () => {
      const builtin = registry.getBySource('builtin');
      expect(builtin).toHaveLength(1);
      expect(builtin[0].name).toBe('builtin_cmd');

      const skills = registry.getBySource('skill');
      expect(skills).toHaveLength(1);
      expect(skills[0].name).toBe('skill_cmd');
    });

    it('should get active sources', () => {
      const sources = registry.getSources();
      expect(sources.has('builtin')).toBe(true);
      expect(sources.has('skill')).toBe(true);
      expect(sources.has('plugin')).toBe(true);
      expect(sources.has('managed')).toBe(false);
    });
  });

  describe('activation', () => {
    it('should activate and deactivate commands', () => {
      registry.register({
        type: 'prompt',
        name: 'toggleable',
        description: 'Can be toggled',
        getPrompt: async () => 'text',
      }, 'builtin');

      expect(registry.has('toggleable')).toBe(true);

      registry.setActive('toggleable', false);
      expect(registry.has('toggleable')).toBe(false);

      registry.setActive('toggleable', true);
      expect(registry.has('toggleable')).toBe(true);
    });

    it('should return false when activating unknown command', () => {
      const result = registry.setActive('unknown', true);
      expect(result).toBe(false);
    });
  });

  describe('suggestions', () => {
    beforeEach(() => {
      registry.register({
        type: 'prompt',
        name: 'help',
        aliases: ['h'],
        description: 'Help',
        getPrompt: async () => 'text',
      }, 'builtin');

      registry.register({
        type: 'prompt',
        name: 'history',
        description: 'History',
        getPrompt: async () => 'text',
      }, 'builtin');

      registry.register({
        type: 'prompt',
        name: 'status',
        description: 'Status',
        getPrompt: async () => 'text',
      }, 'builtin');
    });

    it('should suggest commands by prefix', () => {
      const suggestions = registry.suggest('h');
      expect(suggestions).toContain('help');
      expect(suggestions).toContain('history');
      expect(suggestions).toContain('h'); // alias
      expect(suggestions).not.toContain('status');
    });

    it('should return empty array for no matches', () => {
      const suggestions = registry.suggest('xyz');
      expect(suggestions).toEqual([]);
    });

    it('should be case insensitive', () => {
      const suggestions = registry.suggest('H');
      expect(suggestions.length).toBeGreaterThan(0);
    });
  });

  describe('clear', () => {
    it('should clear all commands', () => {
      registry.register({
        type: 'prompt',
        name: 'cmd1',
        description: 'First',
        getPrompt: async () => 'text',
      }, 'builtin');

      expect(registry.size).toBe(1);

      registry.clear();

      expect(registry.size).toBe(0);
      expect(registry.has('cmd1')).toBe(false);
    });
  });
});

describe('buildCommandContext', () => {
  it('should build a complete CommandContext', () => {
    const toolUseContext: ToolUseContext = {
      sessionId: 'session-1',
      permissions: {} as any,
      abortController: new AbortController(),
      provider: null,
    };

    const tools = new Map<string, Tool>();

    const context = buildCommandContext(
      'session-1',
      'test args',
      toolUseContext,
      tools,
      { extra: 'value' },
    );

    expect(context.sessionId).toBe('session-1');
    expect(context.args).toBe('test args');
    expect(context.toolUseContext).toBe(toolUseContext);
    expect(context.tools).toBe(tools);
    expect((context as Record<string, unknown>).extra).toBe('value');
  });
});

describe('createCommandExecutionError', () => {
  it('should create a properly structured CommandExecutionError', () => {
    const cause = new Error('Command failed');
    const error = createCommandExecutionError('test_cmd', 'arg1 arg2', cause, true);

    expect(error.name).toBe('CommandExecutionError');
    expect(error.commandName).toBe('test_cmd');
    expect(error.args).toBe('arg1 arg2');
    expect(error.cause).toBe(cause);
    expect(error.recoverable).toBe(true);
    expect(error.message).toContain('test_cmd');
    expect(error.message).toContain('Command failed');
  });
});
