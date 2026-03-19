import type { SwarmEventEnvelope, SwarmEventPayload } from '../../types/events.js';
import type { SwarmRuntimeMode } from './ScenarioModel.js';
import { SwarmTraceStore, type RecordedTraceMetadata } from './SwarmTraceStore.js';
import { SwarmRuntimeValidator } from './SwarmRuntimeValidator.js';

interface ActiveTraceSession {
  trace: RecordedTraceMetadata;
  envelopes: SwarmEventEnvelope<SwarmEventPayload>[];
  writeChain: Promise<void>;
}

export class SwarmTraceRecorder {
  private readonly activeByPentestId = new Map<string, ActiveTraceSession>();
  private readonly validator = new SwarmRuntimeValidator();

  constructor(private readonly store: SwarmTraceStore) {}

  async startCapture(params: {
    pentestId: string;
    mode: SwarmRuntimeMode;
    scenarioId?: string;
    sourceTraceId?: string;
    metadata?: Record<string, unknown>;
  }): Promise<RecordedTraceMetadata> {
    const normalizedMode = params.mode === 'scenario' ? 'scenario_capture' : params.mode;
    const trace = await this.store.createTrace({
      pentestId: params.pentestId,
      mode: normalizedMode,
      scenarioId: params.scenarioId,
      sourceTraceId: params.sourceTraceId,
      metadata: params.metadata,
    });

    this.activeByPentestId.set(params.pentestId, {
      trace,
      envelopes: [],
      writeChain: Promise.resolve(),
    });

    return trace;
  }

  getActiveTrace(pentestId: string): RecordedTraceMetadata | null {
    return this.activeByPentestId.get(pentestId)?.trace || null;
  }

  recordEnvelope(pentestId: string, envelope: SwarmEventEnvelope<SwarmEventPayload>): void {
    const session = this.activeByPentestId.get(pentestId);
    if (!session) return;

    session.envelopes.push(envelope);
    session.writeChain = session.writeChain.then(async () => {
      await this.store.appendEnvelope(session.trace.traceId, envelope);
      if (envelope.eventType === 'swarm.completed' || envelope.eventType === 'swarm.failed') {
        await this.finalizeSession(session, envelope.eventType === 'swarm.failed' ? 'failed' : 'completed');
      }
    });
  }

  async finalizeCapture(
    pentestId: string,
    status: RecordedTraceMetadata['status'] = 'completed',
    projectionSnapshot?: Record<string, unknown>,
  ): Promise<RecordedTraceMetadata | null> {
    const session = this.activeByPentestId.get(pentestId);
    if (!session) return null;

    await session.writeChain;
    return this.finalizeSession(session, status, projectionSnapshot);
  }

  private async finalizeSession(
    session: ActiveTraceSession,
    status: RecordedTraceMetadata['status'] = 'completed',
    projectionSnapshot?: Record<string, unknown>,
  ): Promise<RecordedTraceMetadata | null> {
    const validation = this.validator.validate(session.envelopes);
    const correlations = this.validator.buildCorrelationSummary(session.envelopes);

    const validationPath = await this.store.writeArtifact(session.trace.traceId, 'validation.json', validation);
    const correlationPath = await this.store.writeArtifact(session.trace.traceId, 'correlations.json', correlations);
    let projectionPath: string | undefined;
    if (projectionSnapshot) {
      projectionPath = await this.store.writeArtifact(session.trace.traceId, 'projection-summary.json', projectionSnapshot);
    }

    const finalized = await this.store.finalizeTrace(session.trace.traceId, {
      status,
      validationPath,
      correlationPath,
      projectionPath,
    });

    this.activeByPentestId.delete(session.trace.pentestId);
    return finalized;
  }

  async loadTrace(traceId: string) {
    return this.store.loadTraceEnvelopes(traceId);
  }

  async listTracesForPentest(pentestId: string) {
    return this.store.listTracesForPentest(pentestId);
  }

  async getTrace(traceId: string) {
    return this.store.getTrace(traceId);
  }
}
