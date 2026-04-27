/**
 * BashTool Tests
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createBashTool } from '../tools/BashTool.js';
import type { RuntimeTaskManager } from '../RuntimeTaskManager.js';
import type { ToolUseContext } from '../../types/tool-types.js';

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

describe('BashTool', () => {
  let runtimeTaskManager: RuntimeTaskManager;
  let taskManager: InstanceType<typeof TaskManagerMock>;
  let stallDetector: InstanceType<typeof StallDetectorMock>;
  let bashTool: ReturnType<typeof createBashTool>;
  let mockContext: ToolUseContext;

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
      // Private properties needed for type compatibility
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

    mockContext = {
      sessionId: 'test-session',
      agentId: 'test-agent',
      permissions: {} as any,
      abortController: new AbortController(),
      provider: null,
    };
  });

  describe('foreground execution', () => {
    it('executes command and waits for result', async () => {
      const mockTaskState = {
        taskId: 'task-123',
        resultPromise: Promise.resolve({
          code: 0,
          interrupted: false,
          stdout: 'hello world',
          stderr: '',
        }),
      };

      shellTaskExecuteMock.mockReturnValue(mockTaskState);
      taskManagerRegisterTaskMock.mockReturnValue({ taskId: 'task-123' });

      const resultPromise = bashTool.call(
        { command: 'echo hello world', timeout: 5000, background: false },
        mockContext
      );

      const executeOptions = shellTaskExecuteMock.mock.calls[0]?.[1];
      executeOptions?.onStdoutChunk?.('hello world');

      const result = await resultPromise;

      expect(shellTaskExecuteMock).toHaveBeenCalledWith('echo hello world', expect.objectContaining({
        timeout: 5000,
        background: false,
        agentId: 'test-agent',
        maxBuffer: 10 * 1024 * 1024,
        onStdoutChunk: expect.any(Function),
        onStderrChunk: expect.any(Function),
      }));

      expect(runtimeTaskManager.registerTask).toHaveBeenCalledWith('task-123', {
        taskId: 'task-123',
        command: 'echo hello world',
        agentId: 'test-agent',
        status: 'running',
      });

      expect(result.data).toEqual({
        taskId: 'task-123',
        status: 'completed',
        exitCode: 0,
        stdout: 'hello world',
        stderr: '',
      });

      expect(runtimeTaskManager.appendOutput).toHaveBeenCalledWith('task-123', 'hello world');
      expect(runtimeTaskManager.completeTask).toHaveBeenCalledWith('task-123', 0);
    });

    it('marks task as failed on non-zero exit code', async () => {
      const mockTaskState = {
        taskId: 'task-123',
        resultPromise: Promise.resolve({
          code: 1,
          interrupted: false,
          stdout: '',
          stderr: 'error occurred',
        }),
      };

      shellTaskExecuteMock.mockReturnValue(mockTaskState);
      taskManagerRegisterTaskMock.mockReturnValue({ taskId: 'task-123' });

      const result = await bashTool.call(
        { command: 'exit 1', timeout: 5000, background: false },
        mockContext
      );

      expect(result.data.status).toBe('failed');
      expect(result.data.exitCode).toBe(1);
      expect(runtimeTaskManager.failTask).toHaveBeenCalledWith('task-123', 'Command failed with exit code 1');
    });
  });

  describe('background execution', () => {
    it('returns immediately with taskId for background tasks', async () => {
      const mockTaskState = {
        taskId: 'task-456',
        resultPromise: new Promise(() => {}), // Never resolves
      };

      shellTaskExecuteMock.mockReturnValue(mockTaskState);
      taskManagerRegisterTaskMock.mockReturnValue({ taskId: 'task-456' });

      const result = await bashTool.call(
        { command: 'long-running-task', timeout: 30000, background: true },
        mockContext
      );

      expect(result.data).toEqual({
        taskId: 'task-456',
        status: 'running',
      });

      // Verify background flag was passed to ShellTask
      expect(shellTaskExecuteMock).toHaveBeenCalledWith('long-running-task', expect.objectContaining({
        timeout: 30000,
        background: true,
        agentId: 'test-agent',
        maxBuffer: 10 * 1024 * 1024,
        onStdoutChunk: expect.any(Function),
        onStderrChunk: expect.any(Function),
      }));

      // Verify status is 'running' in RuntimeTaskManager
      expect(runtimeTaskManager.registerTask).toHaveBeenCalledWith('task-456', {
        taskId: 'task-456',
        command: 'long-running-task',
        agentId: 'test-agent',
        status: 'running',
      });
    });
  });

  describe('error handling', () => {
    it('handles execution errors gracefully', async () => {
      const mockTaskState = {
        taskId: 'task-789',
        resultPromise: Promise.reject(new Error('Command failed to spawn')),
      };

      shellTaskExecuteMock.mockReturnValue(mockTaskState);
      taskManagerRegisterTaskMock.mockReturnValue({ taskId: 'task-789' });

      await expect(
        bashTool.call({ command: 'invalid-command', timeout: 5000, background: false }, mockContext)
      ).rejects.toThrow('Command failed to spawn');

      expect(runtimeTaskManager.failTask).toHaveBeenCalledWith('task-789', 'Command failed to spawn');
    });
  });

  describe('metadata', () => {
    it('returns correct tool metadata', () => {
      expect(bashTool.name).toBe('bash');
      expect(bashTool.description).toContain('bash command');
      expect(bashTool.maxResultSizeChars).toBe(10_000_000);
    });

    it('isReadOnly returns true for ls', () => {
      expect(bashTool.isReadOnly?.({ command: 'ls' })).toBe(true);
    });

    it('isConcurrencySafe returns false', () => {
      expect(bashTool.isConcurrencySafe?.({ command: 'ls' })).toBe(false);
    });

    it('isDestructive returns true for rm -rf /', () => {
      expect(bashTool.isDestructive?.({ command: 'rm -rf /' })).toBe(true);
    });

    it('userFacingName returns bash', () => {
      expect(bashTool.userFacingName?.({ command: 'ls' })).toBe('bash');
    });

    it('getActivityDescription truncates long commands', () => {
      const longCommand = 'this is a very long command that should be truncated for display purposes';
      const description = bashTool.getActivityDescription?.({ command: longCommand });
      expect(description).toBe('Executing: this is a very long command that should be trun...');
    });

    it('getActivityDescription shows short commands fully', () => {
      const description = bashTool.getActivityDescription?.({ command: 'ls -la' });
      expect(description).toBe('Executing: ls -la');
    });
  });
});
