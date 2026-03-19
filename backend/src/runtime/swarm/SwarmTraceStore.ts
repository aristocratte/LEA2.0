import { mkdir, readFile, readdir, stat, writeFile, appendFile } from 'node:fs/promises';
import { basename, dirname, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import type { PrismaClient } from '@prisma/client';
import type { SwarmEventEnvelope, SwarmEventPayload } from '../../types/events.js';
import type { SwarmRuntimeMode } from './ScenarioModel.js';

export interface RecordedTraceMetadata {
  traceId: string;
  pentestId: string;
  mode: Exclude<SwarmRuntimeMode, 'scenario'> | 'scenario_capture';
  scenarioId?: string;
  sourceTraceId?: string;
  status: 'running' | 'completed' | 'failed' | 'cancelled';
  storagePath: string;
  eventCount: number;
  createdAt: string;
  completedAt?: string;
  validationPath?: string;
  correlationPath?: string;
  projectionPath?: string;
  metadata?: Record<string, unknown>;
}

function resolveDefaultRoot(): string {
  const cwd = process.cwd();
  if (basename(cwd) === 'backend') {
    return resolve(dirname(cwd), 'output', 'swarm-runs');
  }
  return resolve(cwd, 'output', 'swarm-runs');
}

export class SwarmTraceStore {
  private readonly rootDir: string;

  constructor(
    private readonly prisma?: PrismaClient,
    rootDir: string = process.env.SWARM_TRACE_ROOT || resolveDefaultRoot(),
  ) {
    this.rootDir = rootDir;
  }

  async createTrace(
    metadata: Omit<RecordedTraceMetadata, 'traceId' | 'storagePath' | 'eventCount' | 'createdAt' | 'status'> & {
      traceId?: string;
      status?: RecordedTraceMetadata['status'];
    },
  ): Promise<RecordedTraceMetadata> {
    const traceId = metadata.traceId || randomUUID();
    const traceDir = resolve(this.rootDir, traceId);
    await mkdir(traceDir, { recursive: true });

    const traceMetadata: RecordedTraceMetadata = {
      traceId,
      pentestId: metadata.pentestId,
      mode: metadata.mode,
      scenarioId: metadata.scenarioId,
      sourceTraceId: metadata.sourceTraceId,
      status: metadata.status || 'running',
      storagePath: traceDir,
      eventCount: 0,
      createdAt: new Date().toISOString(),
      metadata: metadata.metadata,
    };

    await writeFile(resolve(traceDir, 'metadata.json'), `${JSON.stringify(traceMetadata, null, 2)}\n`, 'utf8');
    await writeFile(resolve(traceDir, 'trace.ndjson'), '', 'utf8');
    await this.persistMetadata(traceMetadata);

    return traceMetadata;
  }

  async appendEnvelope(traceId: string, envelope: SwarmEventEnvelope<SwarmEventPayload>): Promise<void> {
    const trace = await this.getTrace(traceId);
    if (!trace) return;

    await appendFile(
      resolve(trace.storagePath, 'trace.ndjson'),
      `${JSON.stringify(envelope)}\n`,
      'utf8',
    );

    trace.eventCount += 1;
    await this.writeMetadata(trace);
  }

  async writeArtifact(traceId: string, fileName: string, payload: unknown): Promise<string> {
    const trace = await this.getTrace(traceId);
    if (!trace) {
      throw new Error(`Unknown trace ${traceId}`);
    }

    const outputPath = resolve(trace.storagePath, fileName);
    await writeFile(outputPath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
    return outputPath;
  }

  async finalizeTrace(
    traceId: string,
    patch: Partial<Pick<RecordedTraceMetadata, 'status' | 'validationPath' | 'correlationPath' | 'projectionPath'>> = {},
  ): Promise<RecordedTraceMetadata | null> {
    const trace = await this.getTrace(traceId);
    if (!trace) return null;

    trace.status = patch.status || trace.status || 'completed';
    trace.completedAt = new Date().toISOString();
    trace.validationPath = patch.validationPath || trace.validationPath;
    trace.correlationPath = patch.correlationPath || trace.correlationPath;
    trace.projectionPath = patch.projectionPath || trace.projectionPath;
    await this.writeMetadata(trace);
    return trace;
  }

  async getTrace(traceId: string): Promise<RecordedTraceMetadata | null> {
    try {
      const metadataPath = resolve(this.rootDir, traceId, 'metadata.json');
      const raw = await readFile(metadataPath, 'utf8');
      return JSON.parse(raw) as RecordedTraceMetadata;
    } catch {
      return null;
    }
  }

  async loadTraceEnvelopes(traceId: string): Promise<SwarmEventEnvelope<SwarmEventPayload>[]> {
    const trace = await this.getTrace(traceId);
    if (!trace) return [];

    const raw = await readFile(resolve(trace.storagePath, 'trace.ndjson'), 'utf8');
    return raw
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => JSON.parse(line) as SwarmEventEnvelope<SwarmEventPayload>);
  }

  async listTracesForPentest(pentestId: string): Promise<RecordedTraceMetadata[]> {
    try {
      const entries = await readdir(this.rootDir);
      const traces: RecordedTraceMetadata[] = [];
      for (const entry of entries) {
        const entryPath = resolve(this.rootDir, entry);
        const entryStat = await stat(entryPath);
        if (!entryStat.isDirectory()) continue;
        const trace = await this.getTrace(entry);
        if (trace?.pentestId === pentestId) traces.push(trace);
      }
      return traces.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    } catch {
      return [];
    }
  }

  private async writeMetadata(trace: RecordedTraceMetadata): Promise<void> {
    await writeFile(resolve(trace.storagePath, 'metadata.json'), `${JSON.stringify(trace, null, 2)}\n`, 'utf8');
    await this.persistMetadata(trace);
  }

  private async persistMetadata(trace: RecordedTraceMetadata): Promise<void> {
    const delegate = (this.prisma as any)?.swarmTrace;
    if (!delegate || typeof delegate.upsert !== 'function') {
      return;
    }

    try {
      await delegate.upsert({
        where: { id: trace.traceId },
        create: {
          id: trace.traceId,
          pentest_id: trace.pentestId,
          runtime_mode: trace.mode,
          scenario_id: trace.scenarioId,
          source_trace_id: trace.sourceTraceId,
          status: trace.status,
          storage_path: trace.storagePath,
          event_count: trace.eventCount,
          created_at: trace.createdAt,
          completed_at: trace.completedAt,
          metadata: trace.metadata || {},
          validation_path: trace.validationPath,
          correlation_path: trace.correlationPath,
          projection_path: trace.projectionPath,
        },
        update: {
          status: trace.status,
          event_count: trace.eventCount,
          completed_at: trace.completedAt,
          metadata: trace.metadata || {},
          validation_path: trace.validationPath,
          correlation_path: trace.correlationPath,
          projection_path: trace.projectionPath,
        },
      });
    } catch (error) {
      console.warn('[SwarmTraceStore] Unable to persist DB metadata:', error);
    }
  }
}
