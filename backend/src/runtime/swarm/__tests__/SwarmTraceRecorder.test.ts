import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { SwarmTraceRecorder } from '../SwarmTraceRecorder.js';
import { SwarmTraceStore } from '../SwarmTraceStore.js';
import type { SwarmEventEnvelope, SwarmEventPayload } from '../../../types/events.js';

function envelope(
  sequence: number,
  eventType: SwarmEventPayload['type'],
  payload: SwarmEventPayload,
): SwarmEventEnvelope<SwarmEventPayload> {
  return {
    id: `evt-${sequence}`,
    sequence,
    timestamp: Date.now() + sequence,
    runId: 'run-1',
    correlationId: eventType.startsWith('approval.') ? 'corr-approval' : undefined,
    source: 'nia',
    audience: 'user',
    surfaceHint: eventType.startsWith('approval.') ? 'main' : 'none',
    eventType,
    payload,
  };
}

describe('SwarmTraceRecorder', () => {
  it('writes NDJSON traces and validation artifacts', async () => {
    const root = await mkdtemp(join(tmpdir(), 'lea-swarm-trace-'));
    const recorder = new SwarmTraceRecorder(new SwarmTraceStore(undefined, root));

    const trace = await recorder.startCapture({
      pentestId: 'pentest-1',
      mode: 'scenario',
      scenarioId: 'nia-only-reply',
    });

    recorder.recordEnvelope(
      'pentest-1',
      envelope(1, 'approval.requested', {
        type: 'approval.requested',
        tool: 'sqlmap',
        scope: ['api.example.com'],
        riskClass: 'active_scan',
        requiresEscalation: true,
        affectedTargets: ['api.example.com'],
      }),
    );
    recorder.recordEnvelope(
      'pentest-1',
      envelope(2, 'approval.resolved', {
        type: 'approval.resolved',
        tool: 'sqlmap',
        decision: 'approved',
        scope: ['api.example.com'],
        riskClass: 'active_scan',
        requiresEscalation: true,
        affectedTargets: ['api.example.com'],
      }),
    );
    recorder.recordEnvelope(
      'pentest-1',
      envelope(3, 'artifact.created', {
        type: 'artifact.created',
        artifactId: 'artifact-1',
        title: 'httpx triage sweep',
        reviewId: 'review-1',
      }),
    );

    const finalized = await recorder.finalizeCapture('pentest-1');
    expect(finalized?.traceId).toBe(trace.traceId);
    expect(finalized?.validationPath).toContain('validation.json');
    expect(finalized?.correlationPath).toContain('correlations.json');
  });
});
