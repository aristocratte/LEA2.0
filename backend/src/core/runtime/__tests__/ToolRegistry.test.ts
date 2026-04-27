/**
 * Tests for ToolRegistry
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { z } from 'zod';
import { ToolRegistry, buildTool, createToolExecutionError } from '../ToolRegistry.js';
import type { ToolDef } from '../../types/tool-types.js';
import type { ToolUseContext } from '../../types/tool-types.js';

describe('ToolRegistry', () => {
  let registry: ToolRegistry;

  beforeEach(() => {
    registry = new ToolRegistry();
  });

  describe('registration', () => {
    it('should register a tool definition', () => {
      const toolDef: ToolDef<{ path: string }, string> = {
        name: 'read_file',
        description: 'Read a file',
        inputSchema: z.object({ path: z.string() }) as any,
        call: async (args) => ({ data: `Content of ${args.path}` }),
        maxResultSizeChars: 10000,
      };

      registry.register(toolDef);

      expect(registry.has('read_file')).toBe(true);
      expect(registry.size).toBe(1);
    });

    it('should register a complete Tool implementation', () => {
      const tool = buildTool({
        name: 'write_file',
        description: 'Write a file',
        inputSchema: z.object({ path: z.string(), content: z.string() }),
        call: async (args) => ({ data: `Wrote ${args.path}` }),
        maxResultSizeChars: 10000,
      });

      registry.registerTool(tool);

      expect(registry.has('write_file')).toBe(true);
    });

    it('should throw when registering duplicate tool name', () => {
      const toolDef: ToolDef = {
        name: 'duplicate',
        description: 'Test tool',
        inputSchema: z.object({}),
        call: async () => ({ data: 'result' }),
        maxResultSizeChars: 1000,
      };

      registry.register(toolDef);

      expect(() => registry.register(toolDef)).toThrow(
        'Tool "duplicate" is already registered',
      );
    });

    it('should register tool aliases', () => {
      const toolDef: ToolDef = {
        name: 'list_files',
        aliases: ['ls', 'dir'],
        description: 'List files',
        inputSchema: z.object({}),
        call: async () => ({ data: 'files' }),
        maxResultSizeChars: 1000,
      };

      registry.register(toolDef);

      expect(registry.has('list_files')).toBe(true);
      expect(registry.has('ls')).toBe(true);
      expect(registry.has('dir')).toBe(true);
    });

    it('should throw when alias conflicts with existing tool', () => {
      registry.register({
        name: 'existing_tool',
        description: 'First tool',
        inputSchema: z.object({}),
        call: async () => ({ data: 'result' }),
        maxResultSizeChars: 1000,
      });

      const conflictingTool: ToolDef = {
        name: 'new_tool',
        aliases: ['existing_tool'],
        description: 'New tool with conflicting alias',
        inputSchema: z.object({}),
        call: async () => ({ data: 'result' }),
        maxResultSizeChars: 1000,
      };

      expect(() => registry.register(conflictingTool)).toThrow();
    });

    it('should not leave canonical tool registered when an alias conflicts', () => {
      registry.register({
        name: 'existing_tool',
        description: 'First tool',
        inputSchema: z.object({}),
        call: async () => ({ data: 'result' }),
        maxResultSizeChars: 1000,
      });

      expect(() => registry.register({
        name: 'new_tool',
        aliases: ['existing_tool'],
        description: 'New tool with conflicting alias',
        inputSchema: z.object({}),
        call: async () => ({ data: 'result' }),
        maxResultSizeChars: 1000,
      })).toThrow('Alias "existing_tool" conflicts with existing tool name');

      expect(registry.has('new_tool')).toBe(false);
      expect(registry.size).toBe(1);
    });

    it('should not leave canonical tool registered when a complete tool alias conflicts', () => {
      registry.register({
        name: 'existing_tool',
        description: 'First tool',
        inputSchema: z.object({}),
        call: async () => ({ data: 'result' }),
        maxResultSizeChars: 1000,
      });

      const conflictingTool = buildTool({
        name: 'complete_tool',
        aliases: ['existing_tool'],
        description: 'Complete tool with conflicting alias',
        inputSchema: z.object({}),
        call: async () => ({ data: 'result' }),
        maxResultSizeChars: 1000,
      });

      expect(() => registry.registerTool(conflictingTool)).toThrow(
        'Alias "existing_tool" conflicts with existing tool name',
      );
      expect(registry.has('complete_tool')).toBe(false);
      expect(registry.size).toBe(1);
    });
  });

  describe('lookup', () => {
    beforeEach(() => {
      registry.register({
        name: 'main_tool',
        aliases: ['alias1', 'alias2'],
        description: 'Test tool',
        inputSchema: z.object({}),
        call: async () => ({ data: 'result' }),
        maxResultSizeChars: 1000,
      });
    });

    it('should get tool by name', () => {
      const tool = registry.get('main_tool');
      expect(tool).toBeDefined();
      expect(tool?.name).toBe('main_tool');
    });

    it('should get tool by alias', () => {
      const tool = registry.get('alias1');
      expect(tool).toBeDefined();
      expect(tool?.name).toBe('main_tool');
    });

    it('should return undefined for unknown tool', () => {
      const tool = registry.get('unknown');
      expect(tool).toBeUndefined();
    });

    it('should resolve alias to canonical name', () => {
      expect(registry.resolveAlias('main_tool')).toBe('main_tool');
      expect(registry.resolveAlias('alias1')).toBe('main_tool');
      expect(registry.resolveAlias('unknown')).toBeUndefined();
    });
  });

  describe('unregistration', () => {
    beforeEach(() => {
      registry.register({
        name: 'tool_to_remove',
        aliases: ['alias_remove'],
        description: 'Test tool',
        inputSchema: z.object({}),
        call: async () => ({ data: 'result' }),
        maxResultSizeChars: 1000,
      });
    });

    it('should unregister tool by name', () => {
      expect(registry.has('tool_to_remove')).toBe(true);

      const result = registry.unregister('tool_to_remove');

      expect(result).toBe(true);
      expect(registry.has('tool_to_remove')).toBe(false);
    });

    it('should unregister tool by alias', () => {
      expect(registry.has('alias_remove')).toBe(true);

      const result = registry.unregister('alias_remove');

      expect(result).toBe(true);
      expect(registry.has('tool_to_remove')).toBe(false);
      expect(registry.has('alias_remove')).toBe(false);
    });

    it('should return false when unregistering unknown tool', () => {
      const result = registry.unregister('unknown');
      expect(result).toBe(false);
    });
  });

  describe('getEnabled', () => {
    it('should return only enabled tools', () => {
      registry.register({
        name: 'enabled_tool',
        description: 'Enabled',
        inputSchema: z.object({}),
        call: async () => ({ data: 'result' }),
        maxResultSizeChars: 1000,
      });

      registry.register({
        name: 'disabled_tool',
        description: 'Disabled',
        inputSchema: z.object({}),
        call: async () => ({ data: 'result' }),
        isEnabled: () => false,
        maxResultSizeChars: 1000,
      });

      const enabledTools = registry.getEnabled();

      expect(enabledTools).toHaveLength(1);
      expect(enabledTools[0].name).toBe('enabled_tool');
    });
  });

  describe('getAll', () => {
    it('should return all tools as readonly map', () => {
      registry.register({
        name: 'tool1',
        description: 'First',
        inputSchema: z.object({}),
        call: async () => ({ data: 'result' }),
        maxResultSizeChars: 1000,
      });

      registry.register({
        name: 'tool2',
        description: 'Second',
        inputSchema: z.object({}),
        call: async () => ({ data: 'result' }),
        maxResultSizeChars: 1000,
      });

      const allTools = registry.getAll();

      expect(allTools.size).toBe(2);
      expect(allTools.get('tool1')).toBeDefined();
      expect(allTools.get('tool2')).toBeDefined();
    });
  });

  describe('clear', () => {
    it('should clear all registered tools', () => {
      registry.register({
        name: 'tool1',
        description: 'First',
        inputSchema: z.object({}),
        call: async () => ({ data: 'result' }),
        maxResultSizeChars: 1000,
      });

      expect(registry.size).toBe(1);

      registry.clear();

      expect(registry.size).toBe(0);
      expect(registry.has('tool1')).toBe(false);
    });
  });
});

describe('buildTool', () => {
  it('should create a complete Tool from ToolDef', async () => {
    const toolDef: ToolDef<{ path: string }, string> = {
      name: 'read_file',
      description: 'Read a file',
      inputSchema: z.object({ path: z.string() }) as any,
      call: async (args, context) => {
        return { data: `Content of ${args.path}` };
      },
      maxResultSizeChars: 10000,
    };

    const tool = buildTool(toolDef);

    expect(tool.name).toBe('read_file');
    expect(tool.description).toBe('Read a file');
    expect(tool.isEnabled()).toBe(true);
    expect(tool.isReadOnly({ path: '/test' })).toBe(false); // default
    expect(tool.isConcurrencySafe({ path: '/test' })).toBe(false); // fail-closed default
    expect(tool.isDestructive?.({ path: '/test' })).toBe(false); // default
    expect(tool.userFacingName({ path: '/test' })).toBe('read_file');
  });

  it('should use custom implementations when provided', async () => {
    const toolDef: ToolDef = {
      name: 'custom_tool',
      description: 'Custom tool',
      inputSchema: z.object({}),
      call: async () => ({ data: 'result' }),
      isEnabled: () => false,
      isReadOnly: () => true,
      isConcurrencySafe: () => false,
      isDestructive: () => true,
      userFacingName: () => 'Custom Name',
      getActivityDescription: () => 'Doing custom work',
      maxResultSizeChars: 5000,
    };

    const tool = buildTool(toolDef);

    expect(tool.isEnabled()).toBe(false);
    expect(tool.isReadOnly({})).toBe(true);
    expect(tool.isConcurrencySafe({})).toBe(false);
    expect(tool.isDestructive?.({})).toBe(true);
    expect(tool.userFacingName({})).toBe('Custom Name');
    expect(tool.getActivityDescription?.({})).toBe('Doing custom work');
  });

  it('should execute tool call', async () => {
    const mockCall = vi.fn().mockResolvedValue({ data: 'executed' });

    const toolDef: ToolDef = {
      name: 'executable_tool',
      description: 'Can be executed',
      inputSchema: z.object({ input: z.string() }),
      call: mockCall,
      maxResultSizeChars: 1000,
    };

    const tool = buildTool(toolDef);
    const context: ToolUseContext = {
      sessionId: 'test-session',
      permissions: {} as any,
      abortController: new AbortController(),
      provider: null,
    };

    const result = await tool.call({ input: 'test' }, context);

    expect(mockCall).toHaveBeenCalledWith({ input: 'test' }, context);
    expect(result.data).toBe('executed');
  });
});

describe('createToolExecutionError', () => {
  it('should create a properly structured ToolExecutionError', () => {
    const cause = new Error('Original error');
    const error = createToolExecutionError(
      'test_tool',
      { path: '/test' },
      cause,
      true,
      ['Try again', 'Check permissions'],
    );

    expect(error.name).toBe('ToolExecutionError');
    expect(error.toolName).toBe('test_tool');
    expect(error.input).toEqual({ path: '/test' });
    expect(error.cause).toBe(cause);
    expect(error.recoverable).toBe(true);
    expect(error.suggestions).toEqual(['Try again', 'Check permissions']);
    expect(error.message).toContain('test_tool');
    expect(error.message).toContain('Original error');
  });
});
