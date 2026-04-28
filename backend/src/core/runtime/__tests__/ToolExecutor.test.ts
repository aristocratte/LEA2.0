/**
 * @module core/runtime/ToolExecutor/tests
 * @description Comprehensive tests for ToolExecutor
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { z } from 'zod';
import { ToolExecutor, truncateResult } from '../ToolExecutor.js';
import { ToolRegistry, buildTool } from '../ToolRegistry.js';
import type { ToolExecutionError } from '../../types/tool-types.js';
import { createToolExecutionError } from '../ToolRegistry.js';
import { createDefaultContext } from '../../permissions/PermissionContext.js';

describe('ToolExecutor', () => {
  let registry: ToolRegistry;
  let executor: ToolExecutor;
  let mockAbortController: AbortController;

  beforeEach(() => {
    registry = new ToolRegistry();
    executor = new ToolExecutor(registry);
    mockAbortController = new AbortController();
  });

  describe('execute', () => {
    const sessionId = 'test-session-123';

    it('should execute a registered tool and return success result', async () => {
      // Arrange: Register a simple echo tool
      registry.registerTool(
        buildTool({
          name: 'echo',
          description: 'Echo input back',
          inputSchema: z.object({
            message: z.string(),
          }),
          call: async ({ message }) => ({ data: `Echo: ${message}` }),
          maxResultSizeChars: 1000,
        }),
      );

      // Act
      const result = await executor.execute({
        toolUseId: 'call_001',
        toolName: 'echo',
        input: { message: 'hello' },
        sessionId,
        abortController: mockAbortController,
      });

      // Assert
      expect(result.event.type).toBe('tool_result');
      expect(result.event.id).toBe('call_001');
      expect(result.event.toolName).toBe('echo');
      expect(result.event.result).toBe('Echo: hello');
      expect(result.event.isError).toBeUndefined();
      expect(result.recoverable).toBe(true);
    });

    it('should block MCP tools when runtime scope is missing', async () => {
      const call = vi.fn(async () => ({ data: 'should not execute' }));
      registry.registerTool(
        buildTool({
          name: 'mcp:nmap_scan',
          description: 'Nmap scan',
          source: 'mcp',
          inputSchema: z.object({ target: z.string() }),
          call,
          maxResultSizeChars: 1000,
        }),
      );

      const result = await executor.execute({
        toolUseId: 'call_scope_001',
        toolName: 'mcp:nmap_scan',
        input: { target: 'app.example.com' },
        sessionId,
        abortController: mockAbortController,
      });

      expect(result.event.isError).toBe(true);
      expect(result.errorCode).toBe('scope_denied');
      expect(result.event.result).toContain('runtime scope');
      expect(call).not.toHaveBeenCalled();
    });

    it('should block MCP target outside runtime scope before tool call', async () => {
      const call = vi.fn(async () => ({ data: 'should not execute' }));
      registry.registerTool(
        buildTool({
          name: 'mcp:nmap_scan',
          description: 'Nmap scan',
          source: 'mcp',
          inputSchema: z.object({ target: z.string() }),
          call,
          maxResultSizeChars: 1000,
        }),
      );

      const result = await executor.execute({
        toolUseId: 'call_scope_002',
        toolName: 'mcp:nmap_scan',
        input: { target: 'outside.example.com' },
        sessionId,
        abortController: mockAbortController,
        runtimeContext: {
          target: 'app.example.com',
          inScope: ['app.example.com'],
          outOfScope: [],
          scopeMode: 'extended',
        },
      });

      expect(result.event.isError).toBe(true);
      expect(result.errorCode).toBe('scope_denied');
      expect(result.event.result).toContain('outside runtime scope');
      expect(call).not.toHaveBeenCalled();
    });

    it('should return error for unknown tool (non-recoverable)', async () => {
      // Act
      const result = await executor.execute({
        toolUseId: 'call_002',
        toolName: 'nonexistent_tool',
        input: {},
        sessionId,
        abortController: mockAbortController,
      });

      // Assert
      expect(result.event.type).toBe('tool_result');
      expect(result.event.toolName).toBe('nonexistent_tool');
      expect(result.event.result).toContain('not found in registry');
      expect(result.event.isError).toBe(true);
      expect(result.recoverable).toBe(false);
      expect(result.suggestions).toContain('Register tool "nonexistent_tool" in the ToolRegistry');
    });

    it('should validate input against schema and reject invalid input (recoverable)', async () => {
      // Arrange
      registry.registerTool(
        buildTool({
          name: 'validated_tool',
          description: 'Tool with strict validation',
          inputSchema: z.object({
            count: z.number().int().positive(),
            name: z.string().min(3),
          }),
          call: async () => ({ data: 'success' }),
          maxResultSizeChars: 1000,
        }),
      );

      // Act: Invalid input (negative count, short name)
      const result = await executor.execute({
        toolUseId: 'call_003',
        toolName: 'validated_tool',
        input: { count: -5, name: 'ab' },
        sessionId,
        abortController: mockAbortController,
      });

      // Assert
      expect(result.event.type).toBe('tool_result');
      expect(result.event.isError).toBe(true);
      expect(result.event.result).toContain('Input validation failed');
      expect(result.recoverable).toBe(true);
      expect(result.suggestions).toContain('Fix the input parameters to match the tool schema');
    });

    it('should truncate oversized results', async () => {
      // Arrange
      const longString = 'x'.repeat(5000);
      registry.registerTool(
        buildTool({
          name: 'long_result_tool',
          description: 'Returns long result',
          inputSchema: z.object({}),
          call: async () => ({ data: longString }),
          maxResultSizeChars: 100,
        }),
      );

      // Act
      const result = await executor.execute({
        toolUseId: 'call_004',
        toolName: 'long_result_tool',
        input: {},
        sessionId,
        abortController: mockAbortController,
      });

      // Assert
      expect(typeof result.event.result).toBe('string');
      const resultStr = result.event.result as string;
      expect(resultStr.length).toBeLessThan(120); // 100 + truncation suffix
      expect(resultStr).toContain('...[truncated]');
      expect(result.recoverable).toBe(true);
    });

    it('should handle tool execution errors', async () => {
      // Arrange
      registry.registerTool(
        buildTool({
          name: 'failing_tool',
          description: 'Always fails',
          inputSchema: z.object({}),
          call: async () => {
            throw new Error('Intentional failure');
          },
          maxResultSizeChars: 1000,
        }),
      );

      // Act
      const result = await executor.execute({
        toolUseId: 'call_005',
        toolName: 'failing_tool',
        input: {},
        sessionId,
        abortController: mockAbortController,
      });

      // Assert
      expect(result.event.type).toBe('tool_result');
      expect(result.event.isError).toBe(true);
      expect(result.event.result).toContain('Tool execution error');
      expect(result.event.result).toContain('Intentional failure');
      expect(result.recoverable).toBe(false); // Unknown errors are not recoverable
      expect(result.suggestions).toContain('Check tool implementation and dependencies');
    });

    it('should detect ToolExecutionError and extract recoverable flag', async () => {
      // Arrange
      registry.registerTool(
        buildTool({
          name: 'smart_failing_tool',
          description: 'Throws structured error',
          inputSchema: z.object({}),
          call: async () => {
            throw createToolExecutionError(
              'smart_failing_tool',
              {},
              new Error('Known failure'),
              true, // recoverable
              ['Try again with different params'],
            );
          },
          maxResultSizeChars: 1000,
        }),
      );

      // Act
      const result = await executor.execute({
        toolUseId: 'call_006',
        toolName: 'smart_failing_tool',
        input: {},
        sessionId,
        abortController: mockAbortController,
      });

      // Assert
      expect(result.event.isError).toBe(true);
      expect(result.recoverable).toBe(true);
      expect(result.suggestions).toEqual(['Try again with different params']);
    });

    it('should build proper ToolUseContext with sessionId and abortController', async () => {
      // Arrange
      let capturedContext: any;
      registry.registerTool(
        buildTool({
          name: 'context_inspector',
          description: 'Captures context',
          inputSchema: z.object({}),
          call: async (_args, context) => {
            capturedContext = context;
            return { data: 'ok' };
          },
          maxResultSizeChars: 1000,
        }),
      );

      const customAbortController = new AbortController();

      // Act
      await executor.execute({
        toolUseId: 'call_007',
        toolName: 'context_inspector',
        input: {},
        sessionId: 'custom-session-456',
        abortController: customAbortController,
      });

      // Assert
      expect(capturedContext.sessionId).toBe('custom-session-456');
      expect(capturedContext.abortController).toBe(customAbortController);
      expect(capturedContext.permissions).toBeDefined();
      expect(capturedContext.provider).toBeNull();
    });

    it('should propagate abort signal', async () => {
      // Arrange
      let shouldAbort = false;
      registry.registerTool(
        buildTool({
          name: 'long_running',
          description: 'Long running tool',
          inputSchema: z.object({}),
          call: async (_args, context): Promise<{ data: string }> => {
            return new Promise((resolve, reject) => {
              const timeout = setTimeout(() => resolve({ data: 'completed' }), 100);
              context.abortController.signal.addEventListener('abort', () => {
                clearTimeout(timeout);
                reject(new Error('Aborted'));
              });
              if (shouldAbort) {
                context.abortController.abort();
              }
            });
          },
          maxResultSizeChars: 1000,
        }),
      );

      shouldAbort = true;

      // Act
      const result = await executor.execute({
        toolUseId: 'call_008',
        toolName: 'long_running',
        input: {},
        sessionId,
        abortController: mockAbortController,
      });

      // Assert
      expect(result.event.isError).toBe(true);
      expect(result.event.result).toContain('Aborted');
    });

    it('should handle tool that returns complex data', async () => {
      // Arrange
      registry.registerTool(
        buildTool({
          name: 'complex_tool',
          description: 'Returns complex object',
          inputSchema: z.object({}),
          call: async () => ({
            data: {
              nested: {
                array: [1, 2, 3],
                string: 'test',
                null: null,
                boolean: true,
              },
            },
          }),
          maxResultSizeChars: 1000,
        }),
      );

      // Act
      const result = await executor.execute({
        toolUseId: 'call_009',
        toolName: 'complex_tool',
        input: {},
        sessionId,
        abortController: mockAbortController,
      });

      // Assert
      expect(result.event.result).toContain('nested');
      expect(result.event.result).toContain('[1,2,3]');
      expect(result.event.result).toContain('test');
      expect(result.recoverable).toBe(true);
    });

    it('should return error for disabled tool (non-recoverable)', async () => {
      // Arrange: Register a tool that is disabled
      registry.registerTool(
        buildTool({
          name: 'disabled_tool',
          description: 'A disabled tool',
          inputSchema: z.object({}),
          call: async () => ({ data: 'should not execute' }),
          isEnabled: () => false, // Disabled
          maxResultSizeChars: 1000,
        }),
      );

      // Act
      const result = await executor.execute({
        toolUseId: 'call_010',
        toolName: 'disabled_tool',
        input: {},
        sessionId,
        abortController: mockAbortController,
      });

      // Assert
      expect(result.event.type).toBe('tool_result');
      expect(result.event.isError).toBe(true);
      expect(result.event.result).toContain('currently disabled');
      expect(result.recoverable).toBe(false);
      expect(result.suggestions).toContain('Enable tool "disabled_tool" or use an alternative');
    });

    it('should deny execution when checkPermissions returns deny (recoverable)', async () => {
      // Arrange: Register a tool that denies permissions
      registry.registerTool(
        buildTool({
          name: 'permission_denied_tool',
          description: 'Tool that denies permission',
          inputSchema: z.object({}),
          call: async () => ({ data: 'should not execute' }),
          checkPermissions: async () => ({
            behavior: 'deny',
            message: 'Access denied by policy',
          }),
          maxResultSizeChars: 1000,
        }),
      );

      // Act
      const result = await executor.execute({
        toolUseId: 'call_011',
        toolName: 'permission_denied_tool',
        input: {},
        sessionId,
        abortController: mockAbortController,
      });

      // Assert
      expect(result.event.type).toBe('tool_result');
      expect(result.event.isError).toBe(true);
      expect(result.event.result).toContain('Access denied by policy');
      expect(result.recoverable).toBe(true);
      expect(result.suggestions).toContain('Check tool permissions and try again');
    });

    it('should treat ask as deny in non-interactive context (recoverable)', async () => {
      // Arrange: Register a tool that asks for permission
      registry.registerTool(
        buildTool({
          name: 'ask_permission_tool',
          description: 'Tool that asks for permission',
          inputSchema: z.object({}),
          call: async () => ({ data: 'should not execute' }),
          checkPermissions: async () => ({
            behavior: 'ask',
            // No message provided - should use default
          }),
          maxResultSizeChars: 1000,
        }),
      );

      // Act
      const result = await executor.execute({
        toolUseId: 'call_012',
        toolName: 'ask_permission_tool',
        input: {},
        sessionId,
        abortController: mockAbortController,
      });

      // Assert
      expect(result.event.type).toBe('tool_result');
      expect(result.event.isError).toBe(true);
      expect(result.event.result).toContain('requires user approval');
      expect(result.recoverable).toBe(true);
      expect(result.suggestions).toContain('Run in interactive mode to approve this tool use');
    });

    it('should use updatedInput when checkPermissions returns allow with modified input', async () => {
      // Arrange: Register a tool that modifies input via permissions
      let receivedInput: any;
      registry.registerTool(
        buildTool({
          name: 'modify_input_tool',
          description: 'Tool that modifies input',
          inputSchema: z.object({ value: z.string() }),
          call: async (args) => {
            receivedInput = args;
            return { data: `processed: ${args.value}` };
          },
          checkPermissions: async (input) => ({
            behavior: 'allow',
            updatedInput: { value: `${input.value}_modified` },
          }),
          maxResultSizeChars: 1000,
        }),
      );

      // Act
      const result = await executor.execute({
        toolUseId: 'call_013',
        toolName: 'modify_input_tool',
        input: { value: 'test' },
        sessionId,
        abortController: mockAbortController,
      });

      // Assert
      expect(result.event.isError).toBeUndefined();
      expect(result.event.result).toContain('processed: test_modified');
      expect(receivedInput.value).toBe('test_modified');
    });

    it('should proceed with original input when checkPermissions returns passthrough', async () => {
      // Arrange: Register a tool that delegates the final decision to PermissionEngine
      let receivedInput: any;
      registry.registerTool(
        buildTool({
          name: 'passthrough_tool',
          description: 'Tool that passthrough permissions',
          inputSchema: z.object({ value: z.string() }),
          call: async (args) => {
            receivedInput = args;
            return { data: `processed: ${args.value}` };
          },
          checkPermissions: async () => ({ behavior: 'passthrough' as any }),
          maxResultSizeChars: 1000,
        }),
      );

      // Act
      const result = await executor.execute({
        toolUseId: 'call_014',
        toolName: 'passthrough_tool',
        input: { value: 'original' },
        sessionId,
        abortController: mockAbortController,
        permissions: createDefaultContext({ mode: 'bypassPermissions' }),
      });

      // Assert
      expect(result.event.isError).toBeUndefined();
      expect(result.event.result).toContain('processed: original');
      expect(receivedInput.value).toBe('original');
    });
  });

  describe('truncateResult', () => {
    it('should truncate long strings', () => {
      const longString = 'a'.repeat(1000);
      const result = truncateResult(longString, 100);

      expect(result.length).toBeLessThanOrEqual(115); // 100 + '\n...[truncated]'
      expect(result).toContain('...[truncated]');
    });

    it('should pass through short strings unchanged', () => {
      const shortString = 'hello world';
      const result = truncateResult(shortString, 1000);

      expect(result).toBe(shortString);
    });

    it('should handle objects by JSON stringifying', () => {
      const obj = { key: 'value', nested: { data: [1, 2, 3] } };
      const result = truncateResult(obj, 1000);

      expect(result).toContain('key');
      expect(result).toContain('value');
    });

    it('should handle exact size limit', () => {
      const exactString = 'x'.repeat(100);
      const result = truncateResult(exactString, 100);

      expect(result).toBe(exactString); // No truncation needed
    });

    it('should handle very small limits', () => {
      const longString = 'abcdefghijklmnopqrstuvwxyz';
      const result = truncateResult(longString, 5);

      // Should have just the suffix without leading newline
      expect(result).toBe('...[truncated]');
    });

    it('should preserve string type for string input', () => {
      const str = 'test string';
      const result = truncateResult(str, 100);

      expect(typeof result).toBe('string');
      expect(result).toBe(str);
    });
  });
});
