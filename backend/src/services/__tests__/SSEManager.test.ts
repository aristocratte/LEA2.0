import { describe, expect, it, vi } from 'vitest';
import { SSEManager } from '../SSEManager.js';

describe('SSEManager', () => {
  it('replays only newer events when Last-Event-ID uses the evt-<sequence>-... format', () => {
    const manager = new SSEManager();
    const first = manager.emit('pentest-1', {
      runId: 'run-1',
      source: 'system',
      audience: 'internal',
      surfaceHint: 'none',
      eventType: 'swarm.started',
      payload: {
        type: 'swarm.started',
        status: 'RUNNING',
        target: 'api.example.com',
      },
    });
    const second = manager.emit('pentest-1', {
      runId: 'run-1',
      source: 'system',
      audience: 'internal',
      surfaceHint: 'activity',
      eventType: 'finding.created',
      payload: {
        type: 'finding.created',
        findingId: 'finding-1',
        title: 'SQL injection',
        severity: 'high',
      },
    });
    const third = manager.emit('pentest-1', {
      runId: 'run-1',
      source: 'system',
      audience: 'internal',
      surfaceHint: 'review',
      eventType: 'approval.requested',
      payload: {
        type: 'approval.requested',
        tool: 'sqlmap',
        scope: ['api.example.com'],
        riskClass: 'exec',
        requiresEscalation: false,
        affectedTargets: ['api.example.com'],
      },
    });
    const send = vi.fn();

    manager.register(
      'pentest-1',
      {
        id: 'client-evt',
        send,
        connectedAt: new Date(),
      },
      { lastEventId: second.id },
    );

    expect(send).toHaveBeenCalledTimes(1);
    expect(send).toHaveBeenCalledWith(third.eventType, third, third.id);
    expect(send).not.toHaveBeenCalledWith(first.eventType, first, first.id);
  });

  it('replays only newer events when Last-Event-ID uses the legacy numeric format', () => {
    const manager = new SSEManager();
    manager.emit('pentest-1', {
      runId: 'run-1',
      source: 'system',
      audience: 'internal',
      surfaceHint: 'none',
      eventType: 'swarm.started',
      payload: {
        type: 'swarm.started',
        status: 'RUNNING',
        target: 'api.example.com',
      },
    });
    manager.emit('pentest-1', {
      runId: 'run-1',
      source: 'system',
      audience: 'internal',
      surfaceHint: 'activity',
      eventType: 'finding.created',
      payload: {
        type: 'finding.created',
        findingId: 'finding-1',
        title: 'SQL injection',
        severity: 'high',
      },
    });
    const third = manager.emit('pentest-1', {
      runId: 'run-1',
      source: 'system',
      audience: 'internal',
      surfaceHint: 'review',
      eventType: 'approval.requested',
      payload: {
        type: 'approval.requested',
        tool: 'sqlmap',
        scope: ['api.example.com'],
        riskClass: 'exec',
        requiresEscalation: false,
        affectedTargets: ['api.example.com'],
      },
    });
    const send = vi.fn();

    manager.register(
      'pentest-1',
      {
        id: 'client-legacy',
        send,
        connectedAt: new Date(),
      },
      { lastEventId: '2' },
    );

    expect(send).toHaveBeenCalledTimes(1);
    expect(send).toHaveBeenCalledWith(third.eventType, third, third.id);
  });
});
