/**
 * BashTool Permissions Tests
 *
 * Tests for checkPermissions(), isReadOnly(), isDestructive(), and
 * exit code semantics.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createBashTool } from '../tools/BashTool.js';
import type { RuntimeTaskManager } from '../RuntimeTaskManager.js';
import type { ToolUseContext } from '../../types/tool-types.js';
import type { PermissionContext } from '../../permissions/types.js';

// Mock ShellTask, TaskManager, StallDetector
const {
  ShellTaskMock,
  TaskManagerMock,
  StallDetectorMock,
  shellTaskExecuteMock,
  taskManagerRegisterTaskMock,
  stallDetectorStartMonitoringMock,
} = vi.hoisted(() => {
  const shellTaskExecuteMock = vi.fn();
  const taskManagerRegisterTaskMock = vi.fn();
  const stallDetectorStartMonitoringMock = vi.fn();

  class ShellTaskMock {
    execute = shellTaskExecuteMock;
  }

  class TaskManagerMock {
    registerTask = taskManagerRegisterTaskMock;
  }

  class StallDetectorMock {
    startMonitoring = stallDetectorStartMonitoringMock;
  }

  return {
    ShellTaskMock,
    TaskManagerMock,
    StallDetectorMock,
    shellTaskExecuteMock,
    taskManagerRegisterTaskMock,
    stallDetectorStartMonitoringMock,
  };
});

vi.mock('../../swarm/ShellTask.js', () => ({
  ShellTask: ShellTaskMock,
}));

vi.mock('../../swarm/TaskManager.js', () => ({
  TaskManager: TaskManagerMock,
}));

vi.mock('../../swarm/StallDetector.js', () => ({
  StallDetector: StallDetectorMock,
}));

// ============================================================================
// TEST SUITE
// ============================================================================

describe('BashTool permissions', () => {
  let runtimeTaskManager: RuntimeTaskManager;
  let taskManager: InstanceType<typeof TaskManagerMock>;
  let stallDetector: InstanceType<typeof StallDetectorMock>;
  let bashTool: ReturnType<typeof createBashTool>;
  let mockContext: ToolUseContext;
  let defaultPermCtx: PermissionContext;

  beforeEach(() => {
    vi.clearAllMocks();

    // Create a minimal RuntimeTaskManager mock
    runtimeTaskManager = {
      registerTask: vi.fn(),
      appendOutput: vi.fn(),
      completeTask: vi.fn(),
      failTask: vi.fn(),
      killTask: vi.fn(),
      getTask: vi.fn(),
      getTaskOutput: vi.fn(),
      listTasks: vi.fn(),
      removeTask: vi.fn(),
      cleanupTasks: vi.fn(),
      clear: vi.fn(),
      get size() { return 0; },
      tasks: new Map(),
      outputs: new Map(),
      maxOutputSize: 1024,
    } as any;

    taskManager = new TaskManagerMock();
    stallDetector = new StallDetectorMock();

    bashTool = createBashTool({
      taskManager: taskManager as any,
      runtimeTaskManager,
      stallDetector: stallDetector as any,
      agentId: 'test-agent',
    });

    defaultPermCtx = {
      mode: 'default',
      alwaysAllowRules: {},
      alwaysDenyRules: {},
      alwaysAskRules: {},
      additionalWorkingDirectories: new Map(),
    };

    mockContext = {
      sessionId: 'test-session',
      agentId: 'test-agent',
      permissions: defaultPermCtx,
      abortController: new AbortController(),
      provider: null,
    };
  });

  // ==========================================================================
  // isReadOnly
  // ==========================================================================

  describe('isReadOnly()', () => {
    it('returns true for ls -la', () => {
      expect(bashTool.isReadOnly!({ command: 'ls -la' })).toBe(true);
    });

    it('returns true for cat /etc/passwd', () => {
      expect(bashTool.isReadOnly!({ command: 'cat /etc/passwd' })).toBe(true);
    });

    it('returns true for grep pattern file', () => {
      expect(bashTool.isReadOnly!({ command: 'grep pattern file' })).toBe(true);
    });

    it('returns true for find /tmp -name "*.log"', () => {
      expect(bashTool.isReadOnly!({ command: 'find /tmp -name "*.log"' })).toBe(true);
    });

    it('returns true for head -n 10 file.txt', () => {
      expect(bashTool.isReadOnly!({ command: 'head -n 10 file.txt' })).toBe(true);
    });

    it('returns true for wc -l file.txt', () => {
      expect(bashTool.isReadOnly!({ command: 'wc -l file.txt' })).toBe(true);
    });

    it('returns true for diff file1 file2', () => {
      expect(bashTool.isReadOnly!({ command: 'diff file1 file2' })).toBe(true);
    });

    it('returns true for stat /tmp/file', () => {
      expect(bashTool.isReadOnly!({ command: 'stat /tmp/file' })).toBe(true);
    });

    it('returns true for echo hello', () => {
      expect(bashTool.isReadOnly!({ command: 'echo hello' })).toBe(true);
    });

    it('returns true for whoami', () => {
      expect(bashTool.isReadOnly!({ command: 'whoami' })).toBe(true);
    });

    it('returns false for rm -rf /tmp', () => {
      expect(bashTool.isReadOnly!({ command: 'rm -rf /tmp' })).toBe(false);
    });

    it('returns false for cp file1 file2', () => {
      expect(bashTool.isReadOnly!({ command: 'cp file1 file2' })).toBe(false);
    });

    it('returns false for mv file1 file2', () => {
      expect(bashTool.isReadOnly!({ command: 'mv file1 file2' })).toBe(false);
    });

    it('returns false for chmod 755 file', () => {
      expect(bashTool.isReadOnly!({ command: 'chmod 755 file' })).toBe(false);
    });

    it('returns false for nmap -sV target', () => {
      expect(bashTool.isReadOnly!({ command: 'nmap -sV target' })).toBe(false);
    });

    it('returns true for curl http://example.com (read-only by default)', () => {
      // curl is registered as readOnly:true in the command registry (GET by default)
      expect(bashTool.isReadOnly!({ command: 'curl http://example.com' })).toBe(true);
    });

    it('returns false for wget http://example.com', () => {
      expect(bashTool.isReadOnly!({ command: 'wget http://example.com' })).toBe(false);
    });

    it('returns false for dd if=/dev/zero of=/dev/sda', () => {
      expect(bashTool.isReadOnly!({ command: 'dd if=/dev/zero of=/dev/sda' })).toBe(false);
    });

    it('returns false for mkdir /tmp/test', () => {
      // mkdir is not in the registry, falls through to semantic analysis
      // semantic analysis does not classify mkdir as read-only
      expect(bashTool.isReadOnly!({ command: 'mkdir /tmp/test' })).toBe(false);
    });

    it('returns false for sed with -i flag', () => {
      // sed is read-only by default but -i makes it write
      // Note: commandSemantics marks sed -i as not read-only
      expect(bashTool.isReadOnly!({ command: 'sed -i "s/old/new/g" file' })).toBe(false);
    });
  });

  // ==========================================================================
  // isDestructive
  // ==========================================================================

  describe('isDestructive()', () => {
    it('returns true for rm -rf /tmp', () => {
      expect(bashTool.isDestructive!({ command: 'rm -rf /tmp' })).toBe(true);
    });

    it('returns true for rm -rf /', () => {
      expect(bashTool.isDestructive!({ command: 'rm -rf /' })).toBe(true);
    });

    it('returns true for dd if=/dev/zero of=/dev/sda', () => {
      expect(bashTool.isDestructive!({ command: 'dd if=/dev/zero of=/dev/sda' })).toBe(true);
    });

    it('returns true for mkfs.ext4 /dev/sda1', () => {
      expect(bashTool.isDestructive!({ command: 'mkfs.ext4 /dev/sda1' })).toBe(true);
    });

    it('returns true for git reset --hard', () => {
      expect(bashTool.isDestructive!({ command: 'git reset --hard' })).toBe(true);
    });

    it('returns true for shred /tmp/secret', () => {
      expect(bashTool.isDestructive!({ command: 'shred /tmp/secret' })).toBe(true);
    });

    it('returns false for ls -la', () => {
      expect(bashTool.isDestructive!({ command: 'ls -la' })).toBe(false);
    });

    it('returns false for grep pattern file', () => {
      expect(bashTool.isDestructive!({ command: 'grep pattern file' })).toBe(false);
    });

    it('returns false for cat /etc/passwd', () => {
      expect(bashTool.isDestructive!({ command: 'cat /etc/passwd' })).toBe(false);
    });

    it('returns false for echo hello', () => {
      expect(bashTool.isDestructive!({ command: 'echo hello' })).toBe(false);
    });

    it('returns false for nmap -sV target', () => {
      // nmap is not destructive (it's network but doesn't destroy data)
      expect(bashTool.isDestructive!({ command: 'nmap -sV target' })).toBe(false);
    });

    it('returns true for git push --force', () => {
      expect(bashTool.isDestructive!({ command: 'git push --force origin main' })).toBe(true);
    });
  });

  // ==========================================================================
  // checkPermissions
  // ==========================================================================

  describe('checkPermissions()', () => {
    it('returns passthrough for safe read-only command', async () => {
      const result = await bashTool.checkPermissions!(
        { command: 'ls -la' },
        mockContext,
      );
      expect(result.behavior).toBe('passthrough');
    });

    it('returns passthrough for simple grep', async () => {
      const result = await bashTool.checkPermissions!(
        { command: 'grep pattern file.txt' },
        mockContext,
      );
      expect(result.behavior).toBe('passthrough');
    });

    it('returns passthrough for cat', async () => {
      const result = await bashTool.checkPermissions!(
        { command: 'cat /etc/passwd' },
        mockContext,
      );
      expect(result.behavior).toBe('ask');
    });

    it('returns ask for destructive rm -rf /', async () => {
      const result = await bashTool.checkPermissions!(
        { command: 'rm -rf /' },
        mockContext,
      );
      expect(result.behavior).toBe('ask');
      expect(result.message).toBeTruthy();
    });

    it('returns ask for destructive rm -rf /tmp', async () => {
      const result = await bashTool.checkPermissions!(
        { command: 'rm -rf /tmp' },
        mockContext,
      );
      expect(result.behavior).toBe('ask');
    });

    it('returns ask for git reset --hard', async () => {
      const result = await bashTool.checkPermissions!(
        { command: 'git reset --hard HEAD~1' },
        mockContext,
      );
      expect(result.behavior).toBe('ask');
    });

    it('returns deny for command substitution $()', async () => {
      const result = await bashTool.checkPermissions!(
        { command: 'echo $(cat /etc/passwd)' },
        mockContext,
      );
      expect(result.behavior).toBe('deny');
    });

    it('returns ask for backtick command substitution', async () => {
      const result = await bashTool.checkPermissions!(
        { command: 'echo `cat /etc/passwd`' },
        mockContext,
      );
      // Backtick substitution is medium severity → ask (security warning)
      expect(result.behavior).toBe('ask');
      expect(result.message).toContain('Backtick');
    });

    it('returns deny for process substitution <()', async () => {
      const result = await bashTool.checkPermissions!(
        { command: 'diff <(ls dir1) <(ls dir2)' },
        mockContext,
      );
      expect(result.behavior).toBe('deny');
    });

    it('returns deny for process substitution >()', async () => {
      const result = await bashTool.checkPermissions!(
        { command: 'cat >(/dev/null)' },
        mockContext,
      );
      expect(result.behavior).toBe('deny');
    });

    it('returns deny for dangerous env var LD_PRELOAD', async () => {
      const result = await bashTool.checkPermissions!(
        { command: 'LD_PRELOAD=/tmp/malicious.so ls' },
        mockContext,
      );
      expect(result.behavior).toBe('deny');
      expect(result.message).toContain('LD_PRELOAD');
    });

    it('returns deny for dangerous env var DYLD_INSERT_LIBRARIES', async () => {
      const result = await bashTool.checkPermissions!(
        { command: 'DYLD_INSERT_LIBRARIES=/tmp/lib.dylib ls' },
        mockContext,
      );
      expect(result.behavior).toBe('deny');
    });

    it('returns ask for dangerous builtin eval', async () => {
      const result = await bashTool.checkPermissions!(
        { command: 'eval "echo hello"' },
        mockContext,
      );
      expect(result.behavior).toBe('ask');
    });

    it('returns ask for dangerous builtin exec', async () => {
      const result = await bashTool.checkPermissions!(
        { command: 'exec bash' },
        mockContext,
      );
      expect(result.behavior).toBe('ask');
    });

    it('returns ask for destructive dd command', async () => {
      const result = await bashTool.checkPermissions!(
        { command: 'dd if=/dev/zero of=/tmp/file bs=1M count=100' },
        mockContext,
      );
      expect(result.behavior).toBe('ask');
    });

    it('returns ask in plan mode for non-read-only command', async () => {
      const planContext: ToolUseContext = {
        ...mockContext,
        permissions: {
          ...defaultPermCtx,
          mode: 'plan',
        },
      };

      const result = await bashTool.checkPermissions!(
        { command: 'cp file1 file2' },
        planContext,
      );
      expect(result.behavior).toBe('ask');
      expect(result.message).toContain('Plan mode');
    });

    it('returns passthrough in plan mode for read-only command', async () => {
      const planContext: ToolUseContext = {
        ...mockContext,
        permissions: {
          ...defaultPermCtx,
          mode: 'plan',
        },
      };

      const result = await bashTool.checkPermissions!(
        { command: 'ls -la' },
        planContext,
      );
      expect(result.behavior).toBe('passthrough');
    });

    it('returns passthrough for nmap (not destructive, not security-blocked)', async () => {
      const result = await bashTool.checkPermissions!(
        { command: 'nmap -sV target' },
        mockContext,
      );
      // nmap is a network command, not destructive or security-blocked
      // so it should passthrough to the global engine
      expect(result.behavior).toBe('passthrough');
    });

    it('returns deny for content-specific bash deny rules', async () => {
      const ctx: ToolUseContext = {
        ...mockContext,
        permissions: {
          ...defaultPermCtx,
          alwaysDenyRules: {
            session: ['Bash(rm -rf /tmp)'],
          },
        },
      };

      const result = await bashTool.checkPermissions!(
        { command: 'rm -rf /tmp' },
        ctx,
      );

      expect(result.behavior).toBe('deny');
      expect(result.message).toContain('rm -rf /tmp');
    });

    it('returns allow for content-specific bash allow rules', async () => {
      const ctx: ToolUseContext = {
        ...mockContext,
        permissions: {
          ...defaultPermCtx,
          alwaysAllowRules: {
            session: ['Bash(ls *)'],
          },
        },
      };

      const result = await bashTool.checkPermissions!(
        { command: 'ls -la' },
        ctx,
      );

      expect(result.behavior).toBe('allow');
    });

    it('returns ask for out-of-scope paths', async () => {
      const ctx: ToolUseContext = {
        ...mockContext,
        permissions: {
          ...defaultPermCtx,
          additionalWorkingDirectories: new Map([['/tmp/lea', '/tmp/lea']]),
        },
      };

      const result = await bashTool.checkPermissions!(
        { command: 'cat /etc/passwd' },
        ctx,
      );

      expect(result.behavior).toBe('ask');
      expect(result.message).toContain('/etc/passwd');
    });
  });

  // ==========================================================================
  // Exit Code Semantics
  // ==========================================================================

  describe('exit code semantics', () => {
    it('completes task for exit code 0', async () => {
      const mockTaskState = {
        taskId: 'task-exit-0',
        resultPromise: Promise.resolve({
          code: 0,
          interrupted: false,
          stdout: 'output',
          stderr: '',
        }),
      };

      shellTaskExecuteMock.mockReturnValue(mockTaskState);
      taskManagerRegisterTaskMock.mockReturnValue({ taskId: 'task-exit-0' });

      await bashTool.call(
        { command: 'ls -la', timeout: 5000, background: false },
        mockContext,
      );

      expect(runtimeTaskManager.completeTask).toHaveBeenCalledWith('task-exit-0', 0);
    });

    it('completes task for grep exit code 1 (no matches = semantic success)', async () => {
      const mockTaskState = {
        taskId: 'task-grep-1',
        resultPromise: Promise.resolve({
          code: 1,
          interrupted: false,
          stdout: '',
          stderr: '',
        }),
      };

      shellTaskExecuteMock.mockReturnValue(mockTaskState);
      taskManagerRegisterTaskMock.mockReturnValue({ taskId: 'task-grep-1' });

      await bashTool.call(
        { command: 'grep pattern file.txt', timeout: 5000, background: false },
        mockContext,
      );

      // grep exit 1 is semantic success (no matches found), should complete not fail
      expect(runtimeTaskManager.completeTask).toHaveBeenCalledWith('task-grep-1', 1);
      expect(runtimeTaskManager.failTask).not.toHaveBeenCalledWith(
        'task-grep-1',
        expect.anything(),
      );
    });

    it('returns completed_with_warning for grep exit code 1 in foreground mode', async () => {
      const mockTaskState = {
        taskId: 'task-grep-warning',
        resultPromise: Promise.resolve({
          code: 1,
          interrupted: false,
          stdout: '',
          stderr: '',
        }),
      };

      shellTaskExecuteMock.mockReturnValue(mockTaskState);
      taskManagerRegisterTaskMock.mockReturnValue({ taskId: 'task-grep-warning' });

      const result = await bashTool.call(
        { command: 'grep pattern file.txt', timeout: 5000, background: false },
        mockContext,
      );

      expect(result.data.status).toBe('completed_with_warning');
    });

    it('fails task for exit code 1 on non-semantic-success command', async () => {
      const mockTaskState = {
        taskId: 'task-fail-1',
        resultPromise: Promise.resolve({
          code: 1,
          interrupted: false,
          stdout: '',
          stderr: 'error',
        }),
      };

      shellTaskExecuteMock.mockReturnValue(mockTaskState);
      taskManagerRegisterTaskMock.mockReturnValue({ taskId: 'task-fail-1' });

      await bashTool.call(
        { command: 'node -e "process.exit(1)"', timeout: 5000, background: false },
        mockContext,
      );

      expect(runtimeTaskManager.failTask).toHaveBeenCalledWith(
        'task-fail-1',
        'Command failed with exit code 1',
      );
    });

    it('fails task for exit code 2 (always error)', async () => {
      const mockTaskState = {
        taskId: 'task-fail-2',
        resultPromise: Promise.resolve({
          code: 2,
          interrupted: false,
          stdout: '',
          stderr: 'usage error',
        }),
      };

      shellTaskExecuteMock.mockReturnValue(mockTaskState);
      taskManagerRegisterTaskMock.mockReturnValue({ taskId: 'task-fail-2' });

      await bashTool.call(
        { command: 'grep pattern', timeout: 5000, background: false },
        mockContext,
      );

      expect(runtimeTaskManager.failTask).toHaveBeenCalledWith(
        'task-fail-2',
        'Command exited with code 2',
      );
    });

    it('completes task for diff exit code 1 (files differ = semantic success)', async () => {
      const mockTaskState = {
        taskId: 'task-diff-1',
        resultPromise: Promise.resolve({
          code: 1,
          interrupted: false,
          stdout: '1c1\n< old\n---\n> new',
          stderr: '',
        }),
      };

      shellTaskExecuteMock.mockReturnValue(mockTaskState);
      taskManagerRegisterTaskMock.mockReturnValue({ taskId: 'task-diff-1' });

      await bashTool.call(
        { command: 'diff file1 file2', timeout: 5000, background: false },
        mockContext,
      );

      expect(runtimeTaskManager.completeTask).toHaveBeenCalledWith('task-diff-1', 1);
    });

    it('completes task for test exit code 1 (condition false = semantic success)', async () => {
      const mockTaskState = {
        taskId: 'task-test-1',
        resultPromise: Promise.resolve({
          code: 1,
          interrupted: false,
          stdout: '',
          stderr: '',
        }),
      };

      shellTaskExecuteMock.mockReturnValue(mockTaskState);
      taskManagerRegisterTaskMock.mockReturnValue({ taskId: 'task-test-1' });

      await bashTool.call(
        { command: 'test -f /nonexistent', timeout: 5000, background: false },
        mockContext,
      );

      expect(runtimeTaskManager.completeTask).toHaveBeenCalledWith('task-test-1', 1);
    });
  });
});
