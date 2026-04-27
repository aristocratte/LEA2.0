/**
 * @module core/worktree/__tests__/worktree-flow
 * @description Tests for worktree activation, ToolExecutor cwd resolution, and enter/exit flow
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { ToolExecutor } from '../../runtime/ToolExecutor.js';
import { ToolRegistry, buildTool } from '../../runtime/ToolRegistry.js';
import { WorktreeManager } from '../WorktreeManager.js';
import type { WorktreeSession } from '../types.js';

describe('Worktree Flow', () => {
  let worktreeManager: WorktreeManager;
  let registry: ToolRegistry;
  let executor: ToolExecutor;

  beforeEach(() => {
    // Create a WorktreeManager with a mock repo root
    worktreeManager = new WorktreeManager('/mock/repo/root');
    registry = new ToolRegistry();
    executor = new ToolExecutor(registry);
    // Inject WorktreeManager for dynamic cwd resolution
    executor.setWorktreeManager(worktreeManager);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('enter_worktree activates cwd', () => {
    it('should activate a worktree and return the correct path', () => {
      // Arrange
      const agentId = 'agent-1';
      const testSlug = 'test-slug';

      // Create a mock session
      const mockSession: WorktreeSession = {
        slug: testSlug,
        worktreePath: '/mock/repo/root/.lea/worktrees/test-slug',
        branch: 'wt/test-slug',
        agentId,
        originalCwd: '/mock/repo/root',
        createdAt: new Date(),
      };

      // Manually add the session to the WorktreeManager
      (worktreeManager as any).sessions.set(testSlug, mockSession);

      // Act
      worktreeManager.activate(agentId, testSlug);

      // Assert
      expect(worktreeManager.getActiveSlug(agentId)).toBe(testSlug);
      expect(worktreeManager.getActiveWorktreePath(agentId)).toBe(mockSession.worktreePath);
    });

    it('should return undefined for non-existent agent', () => {
      // Act
      const slug = worktreeManager.getActiveSlug('non-existent-agent');
      const path = worktreeManager.getActiveWorktreePath('non-existent-agent');

      // Assert
      expect(slug).toBeUndefined();
      expect(path).toBeUndefined();
    });
  });

  describe('exit_worktree deactivates', () => {
    it('should deactivate a worktree and return undefined path', () => {
      // Arrange
      const agentId = 'agent-2';
      const testSlug = 'test-slug-2';

      const mockSession: WorktreeSession = {
        slug: testSlug,
        worktreePath: '/mock/repo/root/.lea/worktrees/test-slug-2',
        branch: 'wt/test-slug-2',
        agentId,
        originalCwd: '/mock/repo/root',
        createdAt: new Date(),
      };

      (worktreeManager as any).sessions.set(testSlug, mockSession);
      worktreeManager.activate(agentId, testSlug);

      // Verify activated
      expect(worktreeManager.getActiveWorktreePath(agentId)).toBe(mockSession.worktreePath);

      // Act
      const originalCwd = worktreeManager.deactivate(agentId);

      // Assert
      expect(originalCwd).toBe('/mock/repo/root');
      expect(worktreeManager.getActiveSlug(agentId)).toBeUndefined();
      expect(worktreeManager.getActiveWorktreePath(agentId)).toBeUndefined();
    });

    it('should return undefined when deactivating non-active agent', () => {
      // Act
      const result = worktreeManager.deactivate('non-active-agent');

      // Assert
      expect(result).toBeUndefined();
    });
  });

  describe('ToolExecutor dynamic resolution', () => {
    it('should resolve worktree path for active agent', async () => {
      // Arrange
      const agentId = 'agent-3';
      const testSlug = 'test-slug-3';
      const worktreePath = '/mock/repo/root/.lea/worktrees/test-slug-3';

      const mockSession: WorktreeSession = {
        slug: testSlug,
        worktreePath,
        branch: 'wt/test-slug-3',
        agentId,
        originalCwd: '/mock/repo/root',
        createdAt: new Date(),
      };

      (worktreeManager as any).sessions.set(testSlug, mockSession);
      worktreeManager.activate(agentId, testSlug);

      let capturedCwd: string | undefined;

      // Register a tool that captures its cwd
      registry.registerTool(
        buildTool({
          name: 'cwd_inspector',
          description: 'Captures cwd from context',
          inputSchema: z.object({}),
          call: async (_args, context) => {
            capturedCwd = context.cwd;
            return { data: `cwd is ${context.cwd}` };
          },
          maxResultSizeChars: 1000,
        }),
      );

      // Act
      await executor.execute({
        toolUseId: 'call_001',
        toolName: 'cwd_inspector',
        input: {},
        sessionId: 'session-1',
        agentId,
        abortController: new AbortController(),
      });

      // Assert
      expect(capturedCwd).toBe(worktreePath);
    });

    it('should fall back to default cwd when no active worktree', async () => {
      // Arrange
      const defaultCwd = '/default/cwd';
      let capturedCwd: string | undefined;

      registry.registerTool(
        buildTool({
          name: 'cwd_inspector2',
          description: 'Captures cwd from context',
          inputSchema: z.object({}),
          call: async (_args, context) => {
            capturedCwd = context.cwd;
            return { data: `cwd is ${context.cwd}` };
          },
          maxResultSizeChars: 1000,
        }),
      );

      // Act - no active worktree for this agent
      await executor.execute({
        toolUseId: 'call_002',
        toolName: 'cwd_inspector2',
        input: {},
        sessionId: 'session-2',
        agentId: 'agent-without-worktree',
        cwd: defaultCwd,
        abortController: new AbortController(),
      });

      // Assert
      expect(capturedCwd).toBe(defaultCwd);
    });
  });

  describe('Full enter→tool→exit flow', () => {
    it('should complete full lifecycle: enter → execute tool → exit', async () => {
      // Arrange
      const agentId = 'agent-4';
      const testSlug = 'test-slug-4';
      const worktreePath = '/mock/repo/root/.lea/worktrees/test-slug-4';
      const originalCwd = '/mock/repo/root';

      const mockSession: WorktreeSession = {
        slug: testSlug,
        worktreePath,
        branch: 'wt/test-slug-4',
        agentId,
        originalCwd,
        createdAt: new Date(),
      };

      (worktreeManager as any).sessions.set(testSlug, mockSession);

      let capturedCwd: string | undefined;

      registry.registerTool(
        buildTool({
          name: 'workspace_tool',
          description: 'Tool that runs in worktree',
          inputSchema: z.object({}),
          call: async (_args, context) => {
            capturedCwd = context.cwd;
            return { data: `executed in ${context.cwd}` };
          },
          maxResultSizeChars: 1000,
        }),
      );

      // Step 1: Enter worktree
      worktreeManager.activate(agentId, testSlug);
      expect(worktreeManager.getActiveWorktreePath(agentId)).toBe(worktreePath);

      // Step 2: Execute tool - should use worktree cwd
      const result1 = await executor.execute({
        toolUseId: 'call_003',
        toolName: 'workspace_tool',
        input: {},
        sessionId: 'session-3',
        agentId,
        abortController: new AbortController(),
      });
      expect(result1.event.isError).toBeUndefined();
      expect(capturedCwd).toBe(worktreePath);

      // Step 3: Exit worktree
      const deactivatedCwd = worktreeManager.deactivate(agentId);
      expect(deactivatedCwd).toBe(originalCwd);
      expect(worktreeManager.getActiveWorktreePath(agentId)).toBeUndefined();

      // Step 4: Execute tool again - should fall back to originalCwd
      const result2 = await executor.execute({
        toolUseId: 'call_004',
        toolName: 'workspace_tool',
        input: {},
        sessionId: 'session-3',
        agentId,
        cwd: originalCwd,
        abortController: new AbortController(),
      });
      expect(result2.event.isError).toBeUndefined();
      expect(capturedCwd).toBe(originalCwd);
    });

    it('should handle multiple agents with different worktrees', async () => {
      // Arrange
      const agent1 = 'agent-a';
      const agent2 = 'agent-b';
      const slug1 = 'worktree-a';
      const slug2 = 'worktree-b';
      const path1 = '/mock/repo/root/.lea/worktrees/worktree-a';
      const path2 = '/mock/repo/root/.lea/worktrees/worktree-b';

      const session1: WorktreeSession = {
        slug: slug1,
        worktreePath: path1,
        branch: 'wt/worktree-a',
        agentId: agent1,
        originalCwd: '/mock/repo/root',
        createdAt: new Date(),
      };

      const session2: WorktreeSession = {
        slug: slug2,
        worktreePath: path2,
        branch: 'wt/worktree-b',
        agentId: agent2,
        originalCwd: '/mock/repo/root',
        createdAt: new Date(),
      };

      (worktreeManager as any).sessions.set(slug1, session1);
      (worktreeManager as any).sessions.set(slug2, session2);

      let capturedCwd: string | undefined;

      registry.registerTool(
        buildTool({
          name: 'multi_agent_tool',
          description: 'Tool for multiple agents',
          inputSchema: z.object({}),
          call: async (_args, context) => {
            capturedCwd = context.cwd;
            return { data: `agent cwd: ${context.cwd}` };
          },
          maxResultSizeChars: 1000,
        }),
      );

      // Activate both agents
      worktreeManager.activate(agent1, slug1);
      worktreeManager.activate(agent2, slug2);

      // Agent 1 executes tool
      await executor.execute({
        toolUseId: 'call_005',
        toolName: 'multi_agent_tool',
        input: {},
        sessionId: 'session-4',
        agentId: agent1,
        abortController: new AbortController(),
      });
      expect(capturedCwd).toBe(path1);

      // Agent 2 executes tool
      await executor.execute({
        toolUseId: 'call_006',
        toolName: 'multi_agent_tool',
        input: {},
        sessionId: 'session-4',
        agentId: agent2,
        abortController: new AbortController(),
      });
      expect(capturedCwd).toBe(path2);

      // Deactivate agent 1
      worktreeManager.deactivate(agent1);
      expect(worktreeManager.getActiveWorktreePath(agent1)).toBeUndefined();
      expect(worktreeManager.getActiveWorktreePath(agent2)).toBe(path2); // Agent 2 still active
    });
  });

  describe('WorktreeManager edge cases', () => {
    it('should handle activate with non-existent slug', () => {
      // Act & Assert
      expect(() => {
        worktreeManager.activate('agent-x', 'non-existent-slug');
      }).toThrow('Worktree "non-existent-slug" not found.');
    });

    it('should handle multiple activations for same agent', () => {
      // Arrange
      const agentId = 'agent-y';
      const slug1 = 'first-slug';
      const slug2 = 'second-slug';

      const session1: WorktreeSession = {
        slug: slug1,
        worktreePath: '/path/1',
        branch: 'wt/1',
        agentId,
        originalCwd: '/mock/repo/root',
        createdAt: new Date(),
      };

      const session2: WorktreeSession = {
        slug: slug2,
        worktreePath: '/path/2',
        branch: 'wt/2',
        agentId,
        originalCwd: '/mock/repo/root',
        createdAt: new Date(),
      };

      (worktreeManager as any).sessions.set(slug1, session1);
      (worktreeManager as any).sessions.set(slug2, session2);

      // Activate first worktree
      worktreeManager.activate(agentId, slug1);
      expect(worktreeManager.getActiveWorktreePath(agentId)).toBe('/path/1');

      // Activate second worktree (should override)
      worktreeManager.activate(agentId, slug2);
      expect(worktreeManager.getActiveWorktreePath(agentId)).toBe('/path/2');
    });
  });

  describe('agentId vs agentName distinction', () => {
    it('should resolve ToolExecutor cwd by agentId, not agentName', async () => {
      // Simulate a real agent where agentId ≠ agentName
      const agentId = 'agent-123@run-1';
      const agentName = 'Recon Alpha';
      const testSlug = 'recon-alpha-wt';
      const worktreePath = '/mock/repo/root/.lea/worktrees/recon-alpha-wt';

      const mockSession: WorktreeSession = {
        slug: testSlug,
        worktreePath,
        branch: 'wt/recon-alpha-wt',
        agentId,
        originalCwd: '/mock/repo/root',
        createdAt: new Date(),
      };

      (worktreeManager as any).sessions.set(testSlug, mockSession);

      // Activate using agentId (correct key)
      worktreeManager.activate(agentId, testSlug);

      // Verify activation is stored under agentId
      expect(worktreeManager.getActiveSlug(agentId)).toBe(testSlug);
      expect(worktreeManager.getActiveWorktreePath(agentId)).toBe(worktreePath);

      // Verify agentName does NOT resolve — this is the critical assertion
      expect(worktreeManager.getActiveSlug(agentName)).toBeUndefined();
      expect(worktreeManager.getActiveWorktreePath(agentName)).toBeUndefined();

      // ToolExecutor uses agentId to resolve cwd
      let capturedCwd: string | undefined;

      registry.registerTool(
        buildTool({
          name: 'agent_id_resolver_test',
          description: 'Captures cwd to prove agentId-based resolution',
          inputSchema: z.object({}),
          call: async (_args, context) => {
            capturedCwd = context.cwd;
            return { data: `cwd is ${context.cwd}` };
          },
          maxResultSizeChars: 1000,
        }),
      );

      // Execute with agentId → should get worktree path
      await executor.execute({
        toolUseId: 'call_agentid_001',
        toolName: 'agent_id_resolver_test',
        input: {},
        sessionId: 'session-agentid',
        agentId, // ToolExecutor resolves using THIS
        abortController: new AbortController(),
      });

      expect(capturedCwd).toBe(worktreePath);

      // Execute with agentName instead of agentId → should fall back to process.cwd()
      // because no worktree is activated under the key 'Recon Alpha'
      const fallbackCwd = '/fallback/cwd';
      await executor.execute({
        toolUseId: 'call_agentid_002',
        toolName: 'agent_id_resolver_test',
        input: {},
        sessionId: 'session-agentid',
        agentId: agentName, // Wrong key — no worktree activated under this
        cwd: fallbackCwd,
        abortController: new AbortController(),
      });

      expect(capturedCwd).toBe(fallbackCwd);
    });
  });

  describe('session-level worktree', () => {
    it('should activate and deactivate session-level worktree', () => {
      const testSlug = 'session-wt';
      const mockSession: WorktreeSession = {
        slug: testSlug,
        worktreePath: '/mock/repo/root/.lea/worktrees/session-wt',
        branch: 'wt/session-wt',
        agentId: undefined,
        originalCwd: '/mock/repo/root',
        createdAt: new Date(),
      };

      (worktreeManager as any).sessions.set(testSlug, mockSession);

      // Activate at session level
      worktreeManager.activateSession(testSlug);
      expect(worktreeManager.getActiveSessionSlug()).toBe(testSlug);
      expect(worktreeManager.getActiveSessionPath()).toBe(mockSession.worktreePath);

      // Deactivate
      const originalCwd = worktreeManager.deactivateSession();
      expect(originalCwd).toBe('/mock/repo/root');
      expect(worktreeManager.getActiveSessionSlug()).toBeUndefined();
      expect(worktreeManager.getActiveSessionPath()).toBeUndefined();
    });

    it('should resolve ToolExecutor cwd from session-level when no agent worktree', async () => {
      const sessionSlug = 'session-wt';
      const sessionPath = '/mock/repo/root/.lea/worktrees/session-wt';
      const mockSession: WorktreeSession = {
        slug: sessionSlug,
        worktreePath: sessionPath,
        branch: 'wt/session-wt',
        agentId: undefined,
        originalCwd: '/mock/repo/root',
        createdAt: new Date(),
      };

      (worktreeManager as any).sessions.set(sessionSlug, mockSession);
      worktreeManager.activateSession(sessionSlug);

      let capturedCwd: string | undefined;

      registry.registerTool(
        buildTool({
          name: 'session_cwd_test',
          description: 'Captures cwd to prove session-level resolution',
          inputSchema: z.object({}),
          call: async (_args, context) => {
            capturedCwd = context.cwd;
            return { data: `cwd is ${context.cwd}` };
          },
          maxResultSizeChars: 1000,
        }),
      );

      // Execute with an agentId that has NO agent-level worktree
      // → should fall back to session-level worktree
      await executor.execute({
        toolUseId: 'call_session_001',
        toolName: 'session_cwd_test',
        input: {},
        sessionId: 'session-test',
        agentId: 'agent-without-worktree',
        abortController: new AbortController(),
      });

      expect(capturedCwd).toBe(sessionPath);
    });

    it('should prefer agent-level over session-level worktree', async () => {
      const agentSlug = 'agent-wt';
      const sessionSlug = 'session-wt';
      const agentPath = '/mock/repo/root/.lea/worktrees/agent-wt';
      const sessionPath = '/mock/repo/root/.lea/worktrees/session-wt';

      (worktreeManager as any).sessions.set(agentSlug, {
        slug: agentSlug, worktreePath: agentPath, branch: 'wt/agent-wt',
        agentId: 'agent-1', originalCwd: '/mock/repo/root', createdAt: new Date(),
      });
      (worktreeManager as any).sessions.set(sessionSlug, {
        slug: sessionSlug, worktreePath: sessionPath, branch: 'wt/session-wt',
        agentId: undefined, originalCwd: '/mock/repo/root', createdAt: new Date(),
      });

      // Activate both
      worktreeManager.activate('agent-1', agentSlug);
      worktreeManager.activateSession(sessionSlug);

      let capturedCwd: string | undefined;

      registry.registerTool(
        buildTool({
          name: 'priority_test',
          description: 'Captures cwd to prove agent > session priority',
          inputSchema: z.object({}),
          call: async (_args, context) => {
            capturedCwd = context.cwd;
            return { data: `cwd is ${context.cwd}` };
          },
          maxResultSizeChars: 1000,
        }),
      );

      // Agent-1 should get its own worktree, not the session one
      await executor.execute({
        toolUseId: 'call_priority_001',
        toolName: 'priority_test',
        input: {},
        sessionId: 'session-priority',
        agentId: 'agent-1',
        abortController: new AbortController(),
      });

      expect(capturedCwd).toBe(agentPath);
    });
  });
});
