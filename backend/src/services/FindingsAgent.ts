/**
 * FindingsAgent
 *
 * Dedicated asynchronous AI co-pilot that:
 * - ingests pentester signals (tool outputs + report_finding requests)
 * - classifies/normalizes findings
 * - verifies sensitive evidence deterministically
 * - applies strict quality policy (provisional -> confirmed / rejected)
 * - deduplicates and upserts findings
 * - emits real-time SSE finding upsert events
 */

import { randomUUID } from 'node:crypto';
import {
  PrismaClient,
  type Finding as PrismaFinding,
  type Severity,
  type FindingVerificationState,
  type FindingSourceSignalType,
} from '@prisma/client';
import type { AIClient, ChatMessage, ContentBlock } from './ai/AIClient.js';
import { AnthropicClient } from './ai/AnthropicClient.js';
import { ZhipuClient } from './ai/ZhipuClient.js';
import { GeminiClient } from './ai/GeminiClient.js';
import { AntigravityClient } from './ai/AntigravityClient.js';
import { CodexClient } from './ai/CodexClient.js';
import { OpenCodeClient } from './ai/OpenCodeClient.js';
import { kaliMcpClient, type ToolExecutionContext } from './mcp/KaliMCPClient.js';
import { providerManager } from './ProviderManager.js';
import { sseManager, type SSEManager } from './SSEManager.js';
import {
  FindingQualityPolicy,
  type QualityDecision,
  type VerificationState,
} from './FindingQualityPolicy.js';
import { FindingsEvidenceVerifier } from './FindingsEvidenceVerifier.js';
import { supportsZaiReasoningModel } from './ZaiModelCatalog.js';

type FindingEventAction = 'created' | 'updated';
type FindingsAgentStatus = 'idle' | 'queued' | 'processing' | 'error';
type FindingsAgentStage = 'classify' | 'verify' | 'score' | 'dedupe' | 'upsert' | 'emit' | 'report' | 'idle';

interface ToolResultSignal {
  kind: 'TOOL_RESULT';
  pentestId: string;
  toolName: string;
  toolInput: Record<string, unknown>;
  toolOutput: string;
  phaseName?: string;
  target?: string;
  providerId?: string;
  modelId?: string;
  thinkingBudget?: number;
}

interface PentesterReportedSignal {
  kind: 'PENTESTER_REPORTED';
  pentestId: string;
  reportedFinding: Record<string, unknown>;
  phaseName?: string;
  target?: string;
  providerId?: string;
  modelId?: string;
  thinkingBudget?: number;
}

type FindingsSignal = ToolResultSignal | PentesterReportedSignal;

interface FindingsJob {
  id: string;
  enqueuedAt: number;
  signal: FindingsSignal;
}

interface FindingsAgentMetrics {
  jobsProcessed: number;
  createdCount: number;
  updatedCount: number;
  lastAction?: FindingEventAction;
  lastFindingTitle?: string;
  lastActivityAt?: string;
}

interface JobProcessResult {
  created: number;
  updated: number;
  lastAction?: FindingEventAction;
  lastFindingTitle?: string;
}

interface PentestContext {
  pentestId: string;
  target: string;
  phaseName: string;
  providerId?: string;
  modelId?: string;
  thinkingBudget?: number;
  findingsLockedAt?: string;
}

interface NormalizedFinding {
  title: string;
  severity: Severity;
  category: string;
  description: string;
  evidence?: string;
  impact?: string;
  remediation?: string;
  cvssScore?: number;
  cvssVector?: string;
  cveId?: string;
  cweId?: string;
  targetHost?: string;
  endpoint?: string;
  port?: number;
  protocol?: string;
  phaseName?: string;
  toolUsed?: string;
  metadata?: Record<string, unknown>;
  classificationConfidence?: number;
  classificationBasis?: string;
  verificationState: FindingVerificationState;
  proposedSeverity?: Severity;
  evidenceScore: number;
  reasonCodes: string[];
  verified: boolean;
  falsePositive: boolean;
  sourceSignalType: FindingSourceSignalType;
}

interface FindingSnapshot {
  id: string;
  title: string;
  severity: Severity;
  category: string;
  description: string;
  evidence: string | null;
  impact: string | null;
  remediation: string | null;
  metadata: unknown;
  cvss_score: number | null;
  cvss_vector: string | null;
  cve_id: string | null;
  cwe_id: string | null;
  target_host: string | null;
  endpoint: string | null;
  port: number | null;
  protocol: string | null;
  phase_name: string | null;
  tool_used: string | null;
  verification_state: FindingVerificationState;
  proposed_severity: Severity | null;
  evidence_score: number;
  reason_codes: string[];
  source_signal_type: FindingSourceSignalType | null;
  verified: boolean;
  false_positive: boolean;
  created_at: Date;
}

interface AIPipelineContext {
  client: AIClient;
  model: string;
  thinkingBudget?: number;
}

interface ClassificationPayload {
  source: 'tool_result' | 'pentester_reported';
  target: string;
  phase: string;
  tool?: {
    name: string;
    input: Record<string, unknown>;
    output: string;
  };
  pentester_reported?: Record<string, unknown>;
}

interface AutoInformationalFinding {
  title: string;
  category: string;
  description: string;
  evidence?: string;
  target_host?: string;
  endpoint?: string;
  port?: number;
  protocol?: string;
}

const SEVERITY_RANK: Record<Severity, number> = {
  CRITICAL: 5,
  HIGH: 4,
  MEDIUM: 3,
  LOW: 2,
  INFORMATIONAL: 1,
};

const MAX_FINDINGS_PER_JOB = 15;
const REFLECTION_MAX_PASSES = 2;

export class FindingsAgent {
  private prisma: PrismaClient;
  private queues: Map<string, FindingsJob[]>;
  private processingPentests: Set<string>;
  private metricsByPentest: Map<string, FindingsAgentMetrics>;
  private eventSeqByPentest: Map<string, number>;
  private readonly policy: FindingQualityPolicy;
  private readonly verifier: FindingsEvidenceVerifier;

  constructor(private readonly sse: SSEManager) {
    this.prisma = new PrismaClient();
    this.queues = new Map();
    this.processingPentests = new Set();
    this.metricsByPentest = new Map();
    this.eventSeqByPentest = new Map();
    this.policy = new FindingQualityPolicy();
    this.verifier = new FindingsEvidenceVerifier();
  }

  enqueueToolResult(payload: Omit<ToolResultSignal, 'kind'>): void {
    this.enqueue({
      kind: 'TOOL_RESULT',
      ...payload,
    });
  }

  enqueuePentesterReported(payload: Omit<PentesterReportedSignal, 'kind'>): void {
    this.enqueue({
      kind: 'PENTESTER_REPORTED',
      ...payload,
    });
  }

  async drain(pentestId: string, timeoutMs: number = 90000): Promise<boolean> {
    const started = Date.now();

    while (Date.now() - started < timeoutMs) {
      const queueDepth = (this.queues.get(pentestId) || []).length;
      const processing = this.processingPentests.has(pentestId);
      if (queueDepth === 0 && !processing) {
        return true;
      }
      await new Promise((resolve) => setTimeout(resolve, 100));
    }

    return false;
  }

  private enqueue(signal: FindingsSignal): void {
    const pentestId = signal.pentestId;
    const queue = this.queues.get(pentestId) || [];
    queue.push({
      id: randomUUID(),
      enqueuedAt: Date.now(),
      signal,
    });
    this.queues.set(pentestId, queue);

    this.emitAgentStatus(pentestId, 'queued', {
      stage: 'classify',
      activeJobId: queue[0]?.id,
      message: signal.kind === 'TOOL_RESULT'
        ? `Queued tool output from ${signal.toolName}`
        : 'Queued pentester-reported finding',
    });

    if (!this.processingPentests.has(pentestId)) {
      this.processingPentests.add(pentestId);
      void this.processQueue(pentestId);
    }
  }

  private async processQueue(pentestId: string): Promise<void> {
    const queue = this.queues.get(pentestId);
    if (!queue) {
      this.processingPentests.delete(pentestId);
      return;
    }

    try {
      while (queue.length > 0) {
        const job = queue.shift()!;
        this.emitAgentStatus(pentestId, 'processing', {
          stage: 'classify',
          activeJobId: job.id,
          progressPct: 5,
        });

        try {
          const result = await this.processJob(job);
          const metrics = this.getMetrics(pentestId);
          metrics.jobsProcessed += 1;
          metrics.createdCount += result.created;
          metrics.updatedCount += result.updated;
          if (result.lastAction) metrics.lastAction = result.lastAction;
          if (result.lastFindingTitle) metrics.lastFindingTitle = result.lastFindingTitle;
          metrics.lastActivityAt = new Date().toISOString();

          this.emitAgentStatus(pentestId, queue.length > 0 ? 'queued' : 'idle', {
            stage: queue.length > 0 ? 'classify' : 'idle',
            progressPct: queue.length > 0 ? 10 : 100,
          });
        } catch (error: any) {
          const metrics = this.getMetrics(pentestId);
          metrics.jobsProcessed += 1;
          metrics.lastActivityAt = new Date().toISOString();
          console.warn(`[FindingsAgent] Job ${job.id} failed: ${error?.message || 'unknown error'}`);
          this.emitAgentStatus(pentestId, 'error', {
            stage: 'classify',
            activeJobId: job.id,
            message: `Processing error: ${error?.message || 'unknown error'}`,
          });
        }
      }
    } finally {
      this.processingPentests.delete(pentestId);
      if ((this.queues.get(pentestId) || []).length === 0) {
        this.queues.delete(pentestId);
        this.emitAgentStatus(pentestId, 'idle', {
          stage: 'idle',
          progressPct: 100,
        });
      } else if (!this.processingPentests.has(pentestId)) {
        this.processingPentests.add(pentestId);
        void this.processQueue(pentestId);
      }
    }
  }

  private async processJob(job: FindingsJob): Promise<JobProcessResult> {
    const { signal } = job;
    const context = await this.resolvePentestContext(signal);

    if (context.findingsLockedAt) {
      return { created: 0, updated: 0 };
    }

    const result: JobProcessResult = { created: 0, updated: 0 };

    let candidates: NormalizedFinding[] = [];
    if (signal.kind === 'TOOL_RESULT') {
      candidates = await this.extractFromToolResult(signal, context);
    } else {
      candidates = await this.extractFromReportedFinding(signal, context);
    }

    if (candidates.length === 0) {
      return result;
    }

    const existing = await this.prisma.finding.findMany({
      where: { pentest_id: signal.pentestId },
      select: {
        id: true,
        title: true,
        severity: true,
        category: true,
        description: true,
        evidence: true,
        impact: true,
        remediation: true,
        metadata: true,
        cvss_score: true,
        cvss_vector: true,
        cve_id: true,
        cwe_id: true,
        target_host: true,
        endpoint: true,
        port: true,
        protocol: true,
        phase_name: true,
        tool_used: true,
        verification_state: true,
        proposed_severity: true,
        evidence_score: true,
        reason_codes: true,
        source_signal_type: true,
        verified: true,
        false_positive: true,
        created_at: true,
      },
    });

    let processed = 0;

    for (const candidate of candidates.slice(0, MAX_FINDINGS_PER_JOB)) {
      if (!candidate.title || !candidate.description) continue;

      processed += 1;
      const progressBase = Math.floor((processed / Math.max(1, candidates.length)) * 100);

      let prepared = this.prepareCandidate(candidate, context, signal);

      this.emitAgentStatus(signal.pentestId, 'processing', {
        stage: 'verify',
        activeJobId: job.id,
        candidateTitle: prepared.title,
        progressPct: Math.max(10, progressBase),
      });

      const isSensitive = this.policy.isSensitiveSurface({
        title: prepared.title,
        category: prepared.category,
        endpoint: prepared.endpoint,
      });

      let verification = await this.verifier.verify(prepared, { target: context.target }, isSensitive);

      this.emitAgentStatus(signal.pentestId, 'processing', {
        stage: 'score',
        activeJobId: job.id,
        candidateTitle: prepared.title,
        verificationStep: verification.reasonCodes.join(',') || undefined,
        progressPct: Math.max(20, progressBase),
      });

      let decision = this.policy.evaluate(prepared, verification);

      for (let pass = 1; pass <= REFLECTION_MAX_PASSES; pass += 1) {
        if (!this.shouldReflect(prepared, decision)) break;

        const reflected = await this.reflectCandidateWithVerification(context, prepared, verification, decision, pass);
        if (!reflected) break;

        prepared = this.prepareCandidate(reflected, context, signal);
        verification = await this.verifier.verify(prepared, { target: context.target }, isSensitive);
        decision = this.policy.evaluate(prepared, verification);
      }

      prepared = this.applyDecision(prepared, decision);

      if (
        prepared.verificationState !== 'CONFIRMED'
        && prepared.severity === 'INFORMATIONAL'
        && this.policy.shouldSuppressAsNoise({ title: prepared.title, category: prepared.category })
      ) {
        continue;
      }

      this.emitAgentStatus(signal.pentestId, 'processing', {
        stage: 'dedupe',
        activeJobId: job.id,
        candidateTitle: prepared.title,
        progressPct: Math.max(35, progressBase),
      });

      const match = this.findDuplicate(prepared, existing);

      this.emitAgentStatus(signal.pentestId, 'processing', {
        stage: 'upsert',
        activeJobId: job.id,
        candidateTitle: prepared.title,
        progressPct: Math.max(55, progressBase),
      });

      if (match) {
        const updated = await this.updateFinding(match, prepared);
        this.emitFindingEvent(updated, 'updated', 'emit');
        this.refreshSnapshot(existing, updated);
        result.updated += 1;
        result.lastAction = 'updated';
        result.lastFindingTitle = updated.title;
      } else {
        const created = await this.createFinding(signal.pentestId, prepared);
        this.emitFindingEvent(created, 'created', 'emit');
        this.pushSnapshot(existing, created);
        result.created += 1;
        result.lastAction = 'created';
        result.lastFindingTitle = created.title;
      }
    }

    return result;
  }

  private shouldReflect(candidate: NormalizedFinding, decision: QualityDecision): boolean {
    if ((decision.classificationConfidence || 0) < 95) {
      return true;
    }

    if (decision.reasonCodes.includes('high_requires_confirmation_downgrade')) {
      return true;
    }

    if (decision.reasonCodes.includes('fallback_spa_like') && candidate.proposedSeverity) {
      const rank = SEVERITY_RANK[candidate.proposedSeverity];
      return rank >= SEVERITY_RANK.MEDIUM;
    }

    return false;
  }

  private async reflectCandidateWithVerification(
    context: PentestContext,
    candidate: NormalizedFinding,
    verification: {
      evidenceScore: number;
      reasonCodes: string[];
      statusCode?: number;
      contentType?: string;
      details?: string;
      similarityToRoot: number;
      similarityToProbe: number;
    },
    decision: QualityDecision,
    pass: number
  ): Promise<NormalizedFinding | null> {
    let aiContext: AIPipelineContext | null = null;
    try {
      aiContext = await this.resolveAIContext(context);
      if (!aiContext) return null;
    } catch {
      return null;
    }

    let textOutput = '';
    const payload = {
      current_finding: candidate,
      deterministic_verification: verification,
      policy_decision: decision,
      instructions: {
        objective: 'Reclassify this finding strictly according to deterministic evidence.',
        hard_rules: [
          'Do not keep HIGH/CRITICAL unless deterministic proof is present.',
          'If endpoint looks like SPA fallback, downgrade severity and explain.',
          'Return only JSON object with one finding.',
        ],
      },
      pass,
    };

    const messages: ChatMessage[] = [
      {
        role: 'user',
        content: JSON.stringify(payload),
      },
    ];

    try {
      const result = await aiContext.client.streamChat({
        model: aiContext.model,
        messages,
        tools: [],
        systemPrompt: this.classifierSystemPrompt(),
        maxTokens: 2200,
        thinkingBudget: aiContext.thinkingBudget,
        signal: AbortSignal.timeout(20000),
        onEvent: (event) => {
          if (event.type === 'text_delta') {
            textOutput += event.text;
          }
        },
      });

      if (!textOutput.trim()) {
        textOutput = this.extractTextFromContent(result.content);
      }
    } catch {
      return null;
    }

    const parsed = this.parseClassifierResponse(textOutput);
    if (parsed.length === 0) return null;

    const normalized = this.normalizeClassifierFinding(parsed[0], context);
    if (!normalized) return null;

    normalized.classificationBasis = [
      normalized.classificationBasis || 'ai-reflection',
      `reflection-pass:${pass}`,
    ].join(' | ');

    return normalized;
  }

  private applyDecision(candidate: NormalizedFinding, decision: QualityDecision): NormalizedFinding {
    return {
      ...candidate,
      severity: decision.severity,
      proposedSeverity: decision.proposedSeverity,
      verificationState: decision.verificationState,
      evidenceScore: decision.evidenceScore,
      reasonCodes: decision.reasonCodes,
      verified: decision.verified,
      falsePositive: decision.falsePositive,
      classificationConfidence: decision.classificationConfidence,
      classificationBasis: decision.classificationBasis,
    };
  }

  private getMetrics(pentestId: string): FindingsAgentMetrics {
    const existing = this.metricsByPentest.get(pentestId);
    if (existing) return existing;

    const initialized: FindingsAgentMetrics = {
      jobsProcessed: 0,
      createdCount: 0,
      updatedCount: 0,
    };
    this.metricsByPentest.set(pentestId, initialized);
    return initialized;
  }

  private emitAgentStatus(
    pentestId: string,
    status: FindingsAgentStatus,
    extra?: {
      stage?: FindingsAgentStage;
      activeJobId?: string;
      candidateTitle?: string;
      progressPct?: number;
      verificationStep?: string;
      message?: string;
    }
  ): void {
    const metrics = this.getMetrics(pentestId);
    this.sse.broadcast(pentestId, {
      runId: pentestId,
      source: 'system',
      audience: 'internal',
      surfaceHint: 'activity',
      eventType: 'findings_agent_status',
      payload: {
        type: 'findings_agent_status',
        status,
        queue_depth: (this.queues.get(pentestId) || []).length,
        jobs_processed: metrics.jobsProcessed,
        created_count: metrics.createdCount,
        updated_count: metrics.updatedCount,
        last_action: metrics.lastAction,
        last_finding_title: metrics.lastFindingTitle,
        last_activity_at: metrics.lastActivityAt,
        current_stage: extra?.stage,
        active_job_id: extra?.activeJobId,
        candidate_title: extra?.candidateTitle,
        progress_pct: extra?.progressPct,
        verification_step: extra?.verificationStep,
        message: extra?.message,
        timestamp: Date.now(),
      },
    });
  }

  private async resolvePentestContext(signal: FindingsSignal): Promise<PentestContext> {
    const pentest = await this.prisma.pentest.findUnique({
      where: { id: signal.pentestId },
      select: {
        id: true,
        target: true,
        phase: true,
        config: true,
        findings_locked_at: true,
      },
    });

    const config = (pentest?.config || {}) as Record<string, unknown>;

    return {
      pentestId: signal.pentestId,
      target: signal.target || pentest?.target || '',
      phaseName: signal.phaseName || String(pentest?.phase || 'RECON_PASSIVE'),
      providerId: signal.providerId || this.toStringOrUndefined(config.providerId),
      modelId: signal.modelId || this.toStringOrUndefined(config.modelId),
      thinkingBudget: signal.thinkingBudget ?? this.toNumberOrUndefined(config.deepThinkingBudget),
      findingsLockedAt: pentest?.findings_locked_at ? pentest.findings_locked_at.toISOString() : undefined,
    };
  }

  private async extractFromToolResult(
    signal: ToolResultSignal,
    context: PentestContext
  ): Promise<NormalizedFinding[]> {
    if (!signal.toolOutput || !signal.toolOutput.trim()) {
      return [];
    }

    const payload: ClassificationPayload = {
      source: 'tool_result',
      target: context.target,
      phase: context.phaseName,
      tool: {
        name: signal.toolName,
        input: signal.toolInput,
        output: signal.toolOutput.substring(0, 20000),
      },
    };

    const aiFindings = await this.classifyWithAI(context, payload);
    if (aiFindings.length > 0) {
      return aiFindings;
    }

    return this.fallbackFromToolOutput(signal, context);
  }

  private async extractFromReportedFinding(
    signal: PentesterReportedSignal,
    context: PentestContext
  ): Promise<NormalizedFinding[]> {
    const payload: ClassificationPayload = {
      source: 'pentester_reported',
      target: context.target,
      phase: context.phaseName,
      pentester_reported: signal.reportedFinding,
    };

    const aiFindings = await this.classifyWithAI(context, payload);
    if (aiFindings.length > 0) {
      return aiFindings;
    }

    const fallback = this.fallbackFromReportedFinding(signal.reportedFinding, context);
    return fallback ? [fallback] : [];
  }

  private async classifyWithAI(
    context: PentestContext,
    payload: ClassificationPayload
  ): Promise<NormalizedFinding[]> {
    let aiContext: AIPipelineContext | null = null;
    try {
      aiContext = await this.resolveAIContext(context);
      if (!aiContext) {
        return [];
      }
    } catch {
      return [];
    }

    let textOutput = '';
    const messages: ChatMessage[] = [
      {
        role: 'user',
        content: JSON.stringify(payload),
      },
    ];

    try {
      const result = await aiContext.client.streamChat({
        model: aiContext.model,
        messages,
        tools: [],
        systemPrompt: this.classifierSystemPrompt(),
        maxTokens: 3200,
        thinkingBudget: aiContext.thinkingBudget,
        signal: AbortSignal.timeout(25000),
        onEvent: (event) => {
          if (event.type === 'text_delta') {
            textOutput += event.text;
          }
        },
      });

      if (!textOutput.trim()) {
        textOutput = this.extractTextFromContent(result.content);
      }
    } catch {
      return [];
    }

    const parsed = this.parseClassifierResponse(textOutput);
    if (parsed.length === 0) {
      return [];
    }

    return parsed
      .map((item) => this.normalizeClassifierFinding(item, context))
      .filter((item): item is NormalizedFinding => Boolean(item));
  }

  private classifierSystemPrompt(): string {
    return [
      'You are the LEA Findings Agent.',
      'Your mission: transform pentest evidence into objective, deduplicable findings.',
      'Use objective references: CVSS v3.1 ranges, CWE identifiers, CVE references, OWASP/NIST naming when relevant.',
      'Return JSON ONLY with shape:',
      '{"findings":[{"title":"string","category":"string","severity":"CRITICAL|HIGH|MEDIUM|LOW|INFORMATIONAL","description":"string","evidence":"string","impact":"string","remediation":"string","cvss_score":number|null,"cvss_vector":"string|null","cve_id":"string|null","cwe_id":"string|null","target_host":"string|null","endpoint":"string|null","port":number|null,"protocol":"string|null","classification_confidence":0-100,"classification_basis":"string"}]}',
      'Rules:',
      '- Never output markdown fences.',
      '- If nothing actionable is found, return {"findings":[]}.',
      '- Keep evidence concise and concrete.',
    ].join(' ');
  }

  private async resolveAIContext(context: PentestContext): Promise<AIPipelineContext | null> {
    if (context.providerId) {
      const selected = await providerManager.getProvider(context.providerId);
      if (selected && (selected.type === 'GEMINI' || selected.type === 'ANTIGRAVITY' || selected.decryptedKey)) {
        const client = this.providerToAIClient(
          selected.type,
          selected.decryptedKey || '',
          selected.base_url || undefined,
          selected.oauth_refresh_token || undefined,
          {
            accessToken: selected.oauth_access_token || undefined,
            refreshToken: selected.oauth_refresh_token || undefined,
            expiresAt: selected.oauth_expiry || undefined,
          }
        );
        return {
          client,
          model: context.modelId || this.defaultModelFor(client),
          thinkingBudget: this.resolveThinkingBudget(context.modelId || this.defaultModelFor(client), context.thinkingBudget),
        };
      }
    }

    const fallback = await providerManager.selectProvider('analysis');
    if (fallback && (fallback.type === 'GEMINI' || fallback.type === 'ANTIGRAVITY' || fallback.decryptedKey)) {
      const client = this.providerToAIClient(
        fallback.type,
        fallback.decryptedKey || '',
        fallback.base_url || undefined,
        fallback.oauth_refresh_token || undefined,
        {
          accessToken: fallback.oauth_access_token || undefined,
          refreshToken: fallback.oauth_refresh_token || undefined,
          expiresAt: fallback.oauth_expiry || undefined,
        }
      );
      return {
        client,
        model: context.modelId || this.defaultModelFor(client),
        thinkingBudget: this.resolveThinkingBudget(context.modelId || this.defaultModelFor(client), context.thinkingBudget),
      };
    }

    // Last resort for local auth environment compatibility.
    const client = new AnthropicClient();
    return {
      client,
      model: context.modelId || this.defaultModelFor(client),
      thinkingBudget: undefined,
    };
  }

  private providerToAIClient(
    type: string,
    apiKey: string,
    baseUrl?: string,
    oauthToken?: string,
    geminiOAuth?: { accessToken?: string; refreshToken?: string; expiresAt?: Date | string | null }
  ): AIClient {
    switch (type) {
      case 'ZHIPU':
        return new ZhipuClient(apiKey, baseUrl || undefined, 'zhipu');
      case 'OPENAI':
        return new ZhipuClient(apiKey, baseUrl || 'https://api.openai.com/v1', 'openai');
      case 'ANTHROPIC':
        return new AnthropicClient(apiKey);
      case 'GEMINI':
        return new GeminiClient(apiKey, geminiOAuth);
      case 'ANTIGRAVITY':
        if (!oauthToken) {
          throw new Error('Antigravity provider requires OAuth login before use.');
        }
        return new AntigravityClient(oauthToken);
      case 'CODEX':
        return new CodexClient(apiKey, baseUrl || undefined);
      case 'OPENCODE':
        return new OpenCodeClient(apiKey, baseUrl || undefined);
      default:
        if (baseUrl) return new ZhipuClient(apiKey, baseUrl, 'custom');
        return new AnthropicClient(apiKey);
    }
  }

  private defaultModelFor(client: AIClient): string {
    switch (client.getProviderName()) {
      case 'zhipu':
        return 'glm-5.1';
      case 'openai':
        return 'gpt-4o-2024-11-20';
      case 'gemini':
        return 'gemini-2.5-pro-preview-03-25';
      case 'antigravity':
        return 'antigravity-gemini-3-pro';
      case 'anthropic':
      default:
        return 'claude-sonnet-4-6';
    }
  }

  private resolveThinkingBudget(modelId: string, rawBudget?: number): number | undefined {
    if (!Number.isFinite(rawBudget) || Number(rawBudget) <= 0) return undefined;
    const modelStr = String(modelId || '').toLowerCase();
    const supports = supportsZaiReasoningModel(modelStr) || modelStr.includes('thinking') || modelStr.includes('gemini') || modelStr.includes('antigravity');
    if (!supports) return undefined;
    const rounded = Math.round(Number(rawBudget));
    return Math.max(0, Math.min(50000, rounded));
  }

  private parseClassifierResponse(raw: string): Record<string, unknown>[] {
    const cleaned = raw
      .trim()
      .replace(/^```json\s*/i, '')
      .replace(/^```\s*/i, '')
      .replace(/\s*```$/i, '');

    const parsed = this.parseJsonValue(cleaned);
    if (!parsed) return [];

    if (Array.isArray(parsed)) {
      return parsed.filter((item) => this.isObject(item)) as Record<string, unknown>[];
    }

    if (!this.isObject(parsed)) return [];

    const single = parsed.finding;
    if (this.isObject(single)) return [single];

    const findings = parsed.findings;
    if (Array.isArray(findings)) {
      return findings.filter((item) => this.isObject(item)) as Record<string, unknown>[];
    }

    return [];
  }

  private parseJsonValue(raw: string): unknown {
    if (!raw) return null;
    try {
      return JSON.parse(raw);
    } catch {
      const firstBrace = raw.indexOf('{');
      const lastBrace = raw.lastIndexOf('}');
      if (firstBrace !== -1 && lastBrace > firstBrace) {
        try {
          return JSON.parse(raw.substring(firstBrace, lastBrace + 1));
        } catch {
          return null;
        }
      }
      const firstBracket = raw.indexOf('[');
      const lastBracket = raw.lastIndexOf(']');
      if (firstBracket !== -1 && lastBracket > firstBracket) {
        try {
          return JSON.parse(raw.substring(firstBracket, lastBracket + 1));
        } catch {
          return null;
        }
      }
      return null;
    }
  }

  private normalizeClassifierFinding(
    item: Record<string, unknown>,
    context: PentestContext
  ): NormalizedFinding | null {
    const title = this.cleanText(item.title, 240);
    const description = this.cleanText(item.description, 4000);
    if (!title || !description) return null;

    const cvss = this.toNumberOrUndefined(item.cvss_score);
    const severity = cvss !== undefined
      ? this.severityFromCvss(cvss)
      : this.normalizeSeverity(item.severity);

    const confidence = this.clamp(0, 100, this.toNumberOrUndefined(item.classification_confidence) ?? 70);
    const basis = this.cleanText(item.classification_basis, 1200) || 'ai-classification';

    return {
      title,
      severity,
      category: this.cleanText(item.category, 120) || 'General',
      description,
      evidence: this.cleanText(item.evidence, 12000),
      impact: this.cleanText(item.impact, 3000),
      remediation: this.cleanText(item.remediation, 3000),
      cvssScore: cvss,
      cvssVector: this.cleanText(item.cvss_vector, 256),
      cveId: this.normalizeIdentifier(item.cve_id, /^CVE-\d{4}-\d{4,}$/i),
      cweId: this.normalizeIdentifier(item.cwe_id, /^CWE-\d+$/i),
      targetHost: this.cleanText(item.target_host, 255) || context.target,
      endpoint: this.cleanText(item.endpoint, 1024),
      port: this.normalizePort(item.port),
      protocol: this.cleanText(item.protocol, 32),
      classificationConfidence: confidence,
      classificationBasis: basis,
      verificationState: 'PROVISIONAL',
      proposedSeverity: severity,
      evidenceScore: 0,
      reasonCodes: [],
      verified: false,
      falsePositive: false,
      sourceSignalType: 'TOOL_RESULT',
    };
  }

  private fallbackFromReportedFinding(
    raw: Record<string, unknown>,
    context: PentestContext
  ): NormalizedFinding | null {
    const title = this.cleanText(raw.title, 240);
    const description = this.cleanText(raw.description, 4000);
    if (!title || !description) return null;

    const cvss = this.toNumberOrUndefined(raw.cvss_score);
    const severity = cvss !== undefined
      ? this.severityFromCvss(cvss)
      : this.normalizeSeverity(raw.severity);

    return {
      title,
      severity,
      category: this.cleanText(raw.category, 120) || 'General',
      description,
      evidence: this.cleanText(raw.evidence, 12000),
      impact: this.cleanText(raw.impact, 3000),
      remediation: this.cleanText(raw.remediation, 3000),
      cvssScore: cvss,
      cvssVector: this.cleanText(raw.cvss_vector, 256),
      cveId: this.normalizeIdentifier(raw.cve_id, /^CVE-\d{4}-\d{4,}$/i),
      cweId: this.normalizeIdentifier(raw.cwe_id, /^CWE-\d+$/i),
      targetHost: this.cleanText(raw.target_host, 255) || context.target,
      endpoint: this.cleanText(raw.endpoint, 1024),
      port: this.normalizePort(raw.port),
      protocol: this.cleanText(raw.protocol, 32),
      toolUsed: this.cleanText(raw.tool_used, 120),
      phaseName: context.phaseName,
      classificationConfidence: 45,
      classificationBasis: 'fallback:reported-finding',
      verificationState: 'PROVISIONAL',
      proposedSeverity: severity,
      evidenceScore: 0,
      reasonCodes: [],
      verified: false,
      falsePositive: false,
      sourceSignalType: 'PENTESTER_REPORTED',
    };
  }

  private fallbackFromToolOutput(
    signal: ToolResultSignal,
    context: PentestContext
  ): NormalizedFinding[] {
    const fallback = this.buildAutoInformationalFindings(
      signal.toolName,
      signal.toolInput,
      signal.toolOutput,
      context.target
    );

    return fallback.map((item) => ({
      title: item.title,
      severity: 'INFORMATIONAL',
      category: item.category,
      description: item.description,
      evidence: item.evidence,
      targetHost: item.target_host || context.target,
      endpoint: item.endpoint,
      port: item.port,
      protocol: item.protocol,
      phaseName: context.phaseName,
      toolUsed: signal.toolName,
      classificationConfidence: 35,
      classificationBasis: 'fallback:heuristic-recon',
      verificationState: 'PROVISIONAL',
      proposedSeverity: 'INFORMATIONAL',
      evidenceScore: 0,
      reasonCodes: [],
      verified: false,
      falsePositive: false,
      sourceSignalType: 'TOOL_RESULT',
    }));
  }

  private prepareCandidate(
    candidate: NormalizedFinding,
    context: PentestContext,
    signal: FindingsSignal
  ): NormalizedFinding {
    const severity = candidate.cvssScore !== undefined
      ? this.severityFromCvss(candidate.cvssScore)
      : candidate.severity;

    return {
      ...candidate,
      title: this.cleanText(candidate.title, 240) || 'Untitled finding',
      category: this.cleanText(candidate.category, 120) || 'General',
      description: this.cleanText(candidate.description, 4000) || 'No description provided.',
      severity,
      proposedSeverity: candidate.proposedSeverity || severity,
      targetHost: this.cleanText(candidate.targetHost, 255) || context.target,
      endpoint: this.cleanText(candidate.endpoint, 1024),
      protocol: this.cleanText(candidate.protocol, 32),
      phaseName: this.cleanText(candidate.phaseName, 64) || context.phaseName,
      toolUsed: this.cleanText(candidate.toolUsed, 120) || (signal.kind === 'TOOL_RESULT' ? signal.toolName : undefined),
      evidence: this.cleanText(candidate.evidence, 12000),
      impact: this.cleanText(candidate.impact, 3000),
      remediation: this.cleanText(candidate.remediation, 3000),
      cvssVector: this.cleanText(candidate.cvssVector, 256),
      cveId: this.normalizeIdentifier(candidate.cveId, /^CVE-\d{4}-\d{4,}$/i),
      cweId: this.normalizeIdentifier(candidate.cweId, /^CWE-\d+$/i),
      port: this.normalizePort(candidate.port),
      classificationConfidence: this.clamp(0, 100, candidate.classificationConfidence ?? 60),
      classificationBasis: this.cleanText(candidate.classificationBasis, 1200) || 'normalized',
      verificationState: candidate.verificationState || 'PROVISIONAL',
      evidenceScore: this.clamp(0, 100, Math.round(candidate.evidenceScore || 0)),
      reasonCodes: Array.from(new Set((candidate.reasonCodes || []).filter(Boolean))),
      verified: Boolean(candidate.verified),
      falsePositive: Boolean(candidate.falsePositive),
      sourceSignalType: candidate.sourceSignalType || (signal.kind === 'TOOL_RESULT' ? 'TOOL_RESULT' : 'PENTESTER_REPORTED'),
    };
  }

  private findDuplicate(candidate: NormalizedFinding, existing: FindingSnapshot[]): FindingSnapshot | null {
    const candidateKey = this.canonicalKey(candidate);

    for (const row of existing) {
      if (this.canonicalKey(row) === candidateKey) {
        return row;
      }
    }

    let best: { row: FindingSnapshot; score: number } | null = null;
    for (const row of existing) {
      if (!this.hasSurfaceOverlap(candidate, row)) continue;
      const score = this.fuzzyScore(candidate, row);
      if (score >= 0.84 && (!best || score > best.score)) {
        best = { row, score };
      }
    }

    return best?.row || null;
  }

  private hasSurfaceOverlap(candidate: NormalizedFinding, existing: FindingSnapshot): boolean {
    const sameHost = this.normalizeToken(candidate.targetHost) === this.normalizeToken(existing.target_host || undefined);
    const sameEndpoint = this.normalizeToken(candidate.endpoint) === this.normalizeToken(existing.endpoint || undefined);
    const samePort = (candidate.port || 0) > 0 && candidate.port === (existing.port || 0);
    return sameHost || sameEndpoint || samePort;
  }

  private fuzzyScore(candidate: NormalizedFinding, existing: FindingSnapshot): number {
    const titleScore = this.jaccardSimilarity(candidate.title, existing.title);
    const descScore = this.jaccardSimilarity(candidate.description, existing.description);
    const categoryScore = this.jaccardSimilarity(candidate.category, existing.category);
    const surfaceScore = this.surfaceSimilarity(candidate, existing);

    return (titleScore * 0.45) + (descScore * 0.25) + (categoryScore * 0.10) + (surfaceScore * 0.20);
  }

  private surfaceSimilarity(candidate: NormalizedFinding, existing: FindingSnapshot): number {
    const sameHost = this.normalizeToken(candidate.targetHost) === this.normalizeToken(existing.target_host || undefined);
    const sameEndpoint = this.normalizeToken(candidate.endpoint) === this.normalizeToken(existing.endpoint || undefined);
    const samePort = (candidate.port || 0) > 0 && candidate.port === (existing.port || 0);
    if (sameHost && sameEndpoint) return 1;
    if (sameHost && samePort) return 0.9;
    if (sameHost || sameEndpoint || samePort) return 0.7;
    return 0.2;
  }

  private canonicalKey(source: {
    category: string;
    cweId?: string | null;
    cwe_id?: string | null;
    cveId?: string | null;
    cve_id?: string | null;
    targetHost?: string | null;
    target_host?: string | null;
    endpoint?: string | null;
    port?: number | null;
    protocol?: string | null;
  }): string {
    const cwe = 'cweId' in source ? source.cweId : source.cwe_id;
    const cve = 'cveId' in source ? source.cveId : source.cve_id;
    const target = 'targetHost' in source ? source.targetHost : source.target_host;
    const endpoint = 'endpoint' in source ? source.endpoint : undefined;

    return [
      this.normalizeToken(source.category),
      this.normalizeToken(cwe),
      this.normalizeToken(cve),
      this.normalizeToken(target),
      this.normalizeEndpoint(endpoint),
      String(source.port || ''),
      this.normalizeToken(source.protocol),
    ].join('|');
  }

  private normalizeEndpoint(value?: string | null): string {
    if (!value) return '';
    const text = String(value).trim().toLowerCase();
    if (!text) return '';
    if (/^https?:\/\//.test(text)) {
      try {
        const u = new URL(text);
        return `${u.pathname || '/'}${u.search || ''}`;
      } catch {
        return this.normalizeToken(text);
      }
    }
    return this.normalizeToken(text.startsWith('/') ? text : `/${text}`);
  }

  private async createFinding(pentestId: string, candidate: NormalizedFinding): Promise<PrismaFinding> {
    const metadata = this.withClassifierMetadata(candidate, null);

    return this.prisma.finding.create({
      data: {
        pentest_id: pentestId,
        title: candidate.title,
        severity: candidate.severity,
        category: candidate.category,
        description: candidate.description,
        evidence: candidate.evidence,
        impact: candidate.impact,
        remediation: candidate.remediation,
        metadata: metadata as any,
        cvss_score: candidate.cvssScore,
        cvss_vector: candidate.cvssVector,
        cve_id: candidate.cveId,
        cwe_id: candidate.cweId,
        target_host: candidate.targetHost,
        endpoint: candidate.endpoint,
        port: candidate.port,
        protocol: candidate.protocol,
        phase_name: candidate.phaseName,
        tool_used: candidate.toolUsed,
        verification_state: candidate.verificationState,
        proposed_severity: candidate.proposedSeverity,
        evidence_score: candidate.evidenceScore,
        reason_codes: candidate.reasonCodes,
        source_signal_type: candidate.sourceSignalType,
        verified: candidate.verified,
        false_positive: candidate.falsePositive,
      },
    });
  }

  private async updateFinding(existing: FindingSnapshot, candidate: NormalizedFinding): Promise<PrismaFinding> {
    const existingState = existing.verification_state;
    const nextState = this.mergeVerificationState(existingState, candidate.verificationState);

    let severity = candidate.severity;
    if (existingState === 'CONFIRMED' && nextState !== 'CONFIRMED') {
      severity = existing.severity;
    } else if (existingState === 'CONFIRMED' && nextState === 'CONFIRMED') {
      severity = this.moreSevere(existing.severity, candidate.severity);
    }

    const metadata = this.withClassifierMetadata(candidate, existing.metadata);

    return this.prisma.finding.update({
      where: { id: existing.id },
      data: {
        title: this.selectTitle(existing.title, candidate.title),
        severity,
        category: this.selectCategory(existing.category, candidate.category),
        description: this.selectPreferredText(existing.description, candidate.description),
        evidence: this.mergeEvidence(existing.evidence || undefined, candidate.evidence),
        impact: this.selectPreferredText(existing.impact || undefined, candidate.impact),
        remediation: this.selectPreferredText(existing.remediation || undefined, candidate.remediation),
        metadata: metadata as any,
        cvss_score: this.maxNumber(existing.cvss_score, candidate.cvssScore),
        cvss_vector: this.selectPreferredText(existing.cvss_vector || undefined, candidate.cvssVector),
        cve_id: this.selectPreferredText(existing.cve_id || undefined, candidate.cveId),
        cwe_id: this.selectPreferredText(existing.cwe_id || undefined, candidate.cweId),
        target_host: this.selectPreferredText(existing.target_host || undefined, candidate.targetHost),
        endpoint: this.selectPreferredText(existing.endpoint || undefined, candidate.endpoint),
        port: candidate.port || existing.port || undefined,
        protocol: this.selectPreferredText(existing.protocol || undefined, candidate.protocol),
        phase_name: this.selectPreferredText(existing.phase_name || undefined, candidate.phaseName),
        tool_used: this.selectPreferredText(existing.tool_used || undefined, candidate.toolUsed),
        verification_state: nextState,
        proposed_severity: candidate.proposedSeverity || existing.proposed_severity || undefined,
        evidence_score: Math.max(existing.evidence_score || 0, candidate.evidenceScore || 0),
        reason_codes: Array.from(new Set([...(existing.reason_codes || []), ...(candidate.reasonCodes || [])])),
        source_signal_type: candidate.sourceSignalType || existing.source_signal_type || undefined,
        verified: nextState === 'CONFIRMED',
        false_positive: nextState === 'REJECTED',
      },
    });
  }

  private mergeVerificationState(
    current: FindingVerificationState,
    incoming: FindingVerificationState
  ): FindingVerificationState {
    const rank: Record<VerificationState, number> = {
      REJECTED: 1,
      PROVISIONAL: 2,
      CONFIRMED: 3,
    };

    return rank[incoming] >= rank[current as VerificationState]
      ? incoming
      : current;
  }

  private withClassifierMetadata(
    candidate: NormalizedFinding,
    current: unknown
  ): Record<string, unknown> {
    const base = this.asMetadataObject(current);
    const merged: Record<string, unknown> = {
      ...base,
      ...(candidate.metadata || {}),
      canonical_key: this.canonicalKey(candidate),
      classification_confidence: candidate.classificationConfidence,
      classification_basis: candidate.classificationBasis,
      verification_state: candidate.verificationState,
      evidence_score: candidate.evidenceScore,
      reason_codes: candidate.reasonCodes,
      proposed_severity: candidate.proposedSeverity,
      source_signal_type: candidate.sourceSignalType,
      findings_agent: 'v2',
      findings_agent_updated_at: new Date().toISOString(),
      source_signal: candidate.sourceSignalType,
    };

    if (candidate.cvssScore !== undefined) {
      merged.cvss_score_objective = candidate.cvssScore;
      merged.severity_objective = this.severityFromCvss(candidate.cvssScore);
    }

    return this.compactRecord(merged);
  }

  private emitFindingEvent(
    finding: PrismaFinding,
    action: FindingEventAction,
    stage: FindingsAgentStage
  ): void {
    this.sse.broadcast(finding.pentest_id, {
      runId: finding.pentest_id,
      source: 'agent',
      audience: 'internal',
      surfaceHint: 'activity',
      eventType: 'finding',
      payload: {
        type: 'finding',
        ...this.toSSEFindingPayload(finding, action, stage)
      },
    });
  }

  private toSSEFindingPayload(
    finding: PrismaFinding,
    eventAction: FindingEventAction,
    stage: FindingsAgentStage
  ): Record<string, unknown> {
    const metadata = this.asMetadataObject(finding.metadata);
    const confidence = this.toNumberOrUndefined(
      metadata.classification_confidence ?? metadata.classificationConfidence
    );
    const basis = this.toStringOrUndefined(
      metadata.classification_basis ?? metadata.classificationBasis
    );
    const reasonCodes = Array.isArray(finding.reason_codes)
      ? finding.reason_codes
      : [];

    return {
      id: finding.id,
      pentest_id: finding.pentest_id,
      report_id: finding.report_id,
      title: finding.title,
      severity: finding.severity,
      proposed_severity: finding.proposed_severity,
      verification_state: finding.verification_state,
      evidence_score: finding.evidence_score,
      reason_codes: reasonCodes,
      source_signal_type: finding.source_signal_type,
      category: finding.category,
      description: finding.description,
      evidence: finding.evidence,
      impact: finding.impact,
      remediation: finding.remediation,
      metadata: finding.metadata,
      cvss_score: finding.cvss_score,
      cvss_vector: finding.cvss_vector,
      cve_id: finding.cve_id,
      cwe_id: finding.cwe_id,
      target_host: finding.target_host,
      endpoint: finding.endpoint,
      port: finding.port,
      protocol: finding.protocol,
      phase_name: finding.phase_name,
      tool_used: finding.tool_used,
      status: finding.status,
      verified: finding.verified,
      false_positive: finding.false_positive,
      created_at: finding.created_at.toISOString(),
      discovered_at: finding.discovered_at.toISOString(),
      updated_at: finding.updated_at.toISOString(),
      event_action: eventAction,
      classification_confidence: confidence,
      classification_basis: basis,
      agent_stage: stage,
      event_id: randomUUID(),
      event_seq: this.nextEventSeq(finding.pentest_id),
    };
  }

  private nextEventSeq(pentestId: string): number {
    const next = (this.eventSeqByPentest.get(pentestId) || 0) + 1;
    this.eventSeqByPentest.set(pentestId, next);
    return next;
  }

  private refreshSnapshot(existing: FindingSnapshot[], finding: PrismaFinding): void {
    const idx = existing.findIndex((item) => item.id === finding.id);
    const snapshot = this.toSnapshot(finding);
    if (idx === -1) {
      existing.push(snapshot);
      return;
    }
    existing[idx] = snapshot;
  }

  private pushSnapshot(existing: FindingSnapshot[], finding: PrismaFinding): void {
    existing.push(this.toSnapshot(finding));
  }

  private toSnapshot(finding: PrismaFinding): FindingSnapshot {
    return {
      id: finding.id,
      title: finding.title,
      severity: finding.severity,
      category: finding.category,
      description: finding.description,
      evidence: finding.evidence,
      impact: finding.impact,
      remediation: finding.remediation,
      metadata: finding.metadata,
      cvss_score: finding.cvss_score,
      cvss_vector: finding.cvss_vector,
      cve_id: finding.cve_id,
      cwe_id: finding.cwe_id,
      target_host: finding.target_host,
      endpoint: finding.endpoint,
      port: finding.port,
      protocol: finding.protocol,
      phase_name: finding.phase_name,
      tool_used: finding.tool_used,
      verification_state: finding.verification_state,
      proposed_severity: finding.proposed_severity,
      evidence_score: finding.evidence_score,
      reason_codes: finding.reason_codes,
      source_signal_type: finding.source_signal_type,
      verified: finding.verified,
      false_positive: finding.false_positive,
      created_at: finding.created_at,
    };
  }

  private normalizeSeverity(value: unknown): Severity {
    const normalized = String(value || '').toUpperCase();
    const valid: Severity[] = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW', 'INFORMATIONAL'];
    return valid.includes(normalized as Severity) ? (normalized as Severity) : 'INFORMATIONAL';
  }

  private severityFromCvss(cvss: number): Severity {
    if (cvss >= 9.0) return 'CRITICAL';
    if (cvss >= 7.0) return 'HIGH';
    if (cvss >= 4.0) return 'MEDIUM';
    if (cvss > 0.0) return 'LOW';
    return 'INFORMATIONAL';
  }

  private moreSevere(a: Severity, b: Severity): Severity {
    return SEVERITY_RANK[b] > SEVERITY_RANK[a] ? b : a;
  }

  private selectTitle(existing: string, incoming: string): string {
    const existingNorm = this.normalizeToken(existing);
    const incomingNorm = this.normalizeToken(incoming);
    if (!existingNorm) return incoming;
    if (!incomingNorm) return existing;
    if (incomingNorm.includes(existingNorm) && incoming.length > existing.length) return incoming;
    return existing.length >= incoming.length ? existing : incoming;
  }

  private selectCategory(existing: string, incoming: string): string {
    if (!existing || existing.toLowerCase() === 'general') return incoming || existing || 'General';
    if (!incoming || incoming.toLowerCase() === 'general') return existing;
    return incoming.length > existing.length ? incoming : existing;
  }

  private selectPreferredText(existing?: string, incoming?: string): string | undefined {
    const e = this.cleanText(existing, 12000);
    const i = this.cleanText(incoming, 12000);
    if (!e) return i;
    if (!i) return e;
    return i.length > e.length ? i : e;
  }

  private mergeEvidence(existing?: string, incoming?: string): string | undefined {
    const e = this.cleanText(existing, 12000);
    const i = this.cleanText(incoming, 12000);
    if (!e) return i;
    if (!i) return e;
    if (e.includes(i)) return e;
    if (i.includes(e)) return i;
    return `${e}\n\n---\n\n${i}`.substring(0, 20000);
  }

  private maxNumber(a?: number | null, b?: number): number | undefined {
    const n1 = typeof a === 'number' ? a : undefined;
    const n2 = typeof b === 'number' ? b : undefined;
    if (n1 === undefined) return n2;
    if (n2 === undefined) return n1;
    return Math.max(n1, n2);
  }

  private normalizeIdentifier(value: unknown, pattern: RegExp): string | undefined {
    const text = this.cleanText(value, 64);
    if (!text) return undefined;
    return pattern.test(text) ? text.toUpperCase() : undefined;
  }

  private normalizePort(value: unknown): number | undefined {
    const n = this.toNumberOrUndefined(value);
    if (n === undefined) return undefined;
    const rounded = Math.round(n);
    if (rounded < 1 || rounded > 65535) return undefined;
    return rounded;
  }

  private extractTextFromContent(content: ContentBlock[]): string {
    return content
      .filter((block) => block.type === 'text')
      .map((block) => (block as { type: 'text'; text: string }).text)
      .join('\n');
  }

  private asMetadataObject(value: unknown): Record<string, unknown> {
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      return { ...(value as Record<string, unknown>) };
    }
    return {};
  }

  private compactRecord(input: Record<string, unknown>): Record<string, unknown> {
    const output: Record<string, unknown> = {};
    Object.entries(input).forEach(([key, value]) => {
      if (value !== undefined) {
        output[key] = value;
      }
    });
    return output;
  }

  private normalizeToken(value?: string | number | null): string {
    if (value === null || value === undefined) return '';
    return String(value)
      .toLowerCase()
      .trim()
      .replace(/https?:\/\//g, '')
      .replace(/[^a-z0-9]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  private tokenize(value: string): Set<string> {
    return new Set(
      this.normalizeToken(value)
        .split(' ')
        .filter((token) => token.length >= 3)
    );
  }

  private jaccardSimilarity(a: string, b: string): number {
    const setA = this.tokenize(a);
    const setB = this.tokenize(b);
    if (setA.size === 0 && setB.size === 0) return 1;
    if (setA.size === 0 || setB.size === 0) return 0;

    let intersection = 0;
    for (const token of setA) {
      if (setB.has(token)) intersection += 1;
    }
    const union = new Set([...setA, ...setB]).size;
    return union === 0 ? 0 : intersection / union;
  }

  private cleanText(value: unknown, maxLen: number): string | undefined {
    if (value === null || value === undefined) return undefined;
    const text = String(value).replace(/\u0000/g, '').trim();
    if (!text) return undefined;
    return text.length > maxLen ? text.substring(0, maxLen) : text;
  }

  private toNumberOrUndefined(value: unknown): number | undefined {
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (typeof value === 'string' && value.trim() !== '') {
      const n = Number(value);
      if (Number.isFinite(n)) return n;
    }
    return undefined;
  }

  private toStringOrUndefined(value: unknown): string | undefined {
    if (typeof value === 'string' && value.trim() !== '') return value;
    return undefined;
  }

  private clamp(min: number, max: number, value: number): number {
    return Math.min(max, Math.max(min, value));
  }

  private isObject(value: unknown): value is Record<string, unknown> {
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
  }

  private buildAutoInformationalFindings(
    toolName: string,
    toolInput: Record<string, unknown>,
    output: string,
    defaultTarget: string
  ): AutoInformationalFinding[] {
    const rawOutput = output?.trim() || '';
    if (!rawOutput) return [];

    const normalizedTool = toolName.toLowerCase();
    const command = typeof toolInput.command === 'string' ? toolInput.command : '';
    if (!this.isReconLikeToolInvocation(normalizedTool, command)) {
      return [];
    }

    const inferredTarget =
      (typeof toolInput.target === 'string' && toolInput.target) ||
      (typeof toolInput.host === 'string' && toolInput.host) ||
      (typeof toolInput.domain === 'string' && toolInput.domain) ||
      (typeof toolInput.hostname === 'string' && toolInput.hostname) ||
      (typeof toolInput.url === 'string' && toolInput.url) ||
      defaultTarget;

    const endpoint = typeof toolInput.url === 'string' ? toolInput.url : undefined;
    const evidence = this.truncateEvidence(rawOutput, 2500);
    const findings: AutoInformationalFinding[] = [];

    const ips = this.extractIPv4Addresses(rawOutput).slice(0, 10);
    for (const ip of ips) {
      findings.push({
        title: `Discovered IP address: ${ip}`,
        category: 'Infrastructure Discovery',
        description: `IP address ${ip} was observed in ${toolName} output during reconnaissance.`,
        evidence,
        target_host: ip,
      });
    }

    if (normalizedTool === 'nmap_scan' || /\bnmap\b/i.test(command)) {
      const openPorts = this.extractOpenPorts(rawOutput).slice(0, 12);
      for (const openPort of openPorts) {
        findings.push({
          title: `Open port ${openPort.port}/${openPort.protocol} on ${inferredTarget}`,
          category: 'Network Exposure',
          description: `Service "${openPort.service}" is exposed on ${openPort.port}/${openPort.protocol} for target ${inferredTarget}.`,
          evidence,
          target_host: inferredTarget,
          port: openPort.port,
          protocol: openPort.protocol,
        });
      }
    }

    if (['dig_lookup', 'dig'].includes(normalizedTool) || /\b(dig|nslookup|host)\b/i.test(command)) {
      findings.push({
        title: `DNS intelligence for ${inferredTarget}`,
        category: 'DNS Intelligence',
        description: `DNS records were enumerated for ${inferredTarget}.`,
        evidence,
        target_host: inferredTarget,
      });
    }

    if (['whois_lookup', 'whois'].includes(normalizedTool) || /\bwhois\b/i.test(command)) {
      findings.push({
        title: `WHOIS profile collected for ${inferredTarget}`,
        category: 'Asset Intelligence',
        description: `WHOIS and registration intelligence was collected for ${inferredTarget}.`,
        evidence,
        target_host: inferredTarget,
      });
    }

    if (
      ['whatweb_scan', 'httpx', 'curl_request', 'curl', 'waf_detect', 'subfinder', 'dnsx'].includes(normalizedTool)
      || /\b(whatweb|httpx|curl|wafw00f|subfinder|dnsx)\b/i.test(command)
    ) {
      findings.push({
        title: `Web/technology reconnaissance on ${inferredTarget}`,
        category: 'Technology Intelligence',
        description: `Technology stack, web behavior, or defensive controls were identified for ${inferredTarget}.`,
        evidence,
        target_host: inferredTarget,
        endpoint,
      });
    }

    if (/waf\s+detected/i.test(rawOutput)) {
      findings.push({
        title: `WAF detected on ${inferredTarget}`,
        category: 'Defensive Controls',
        description: `A Web Application Firewall appears to protect ${inferredTarget}.`,
        evidence,
        target_host: inferredTarget,
      });
    }

    if (findings.length === 0) {
      findings.push({
        title: `Recon data captured from ${toolName}`,
        category: 'Reconnaissance',
        description: `Reconnaissance output was captured from ${toolName} and should be reviewed.`,
        evidence,
        target_host: inferredTarget,
        endpoint,
      });
    }

    const unique = new Map<string, AutoInformationalFinding>();
    for (const finding of findings) {
      const key = [
        this.normalizeToken(finding.title),
        this.normalizeToken(finding.target_host),
        this.normalizeToken(finding.endpoint),
        String(finding.port || ''),
      ].join('|');
      unique.set(key, finding);
      if (unique.size >= MAX_FINDINGS_PER_JOB) break;
    }

    return Array.from(unique.values());
  }

  private isReconLikeToolInvocation(toolName: string, command: string): boolean {
    const reconTools = new Set([
      'dig_lookup', 'dig', 'whois_lookup', 'whois', 'nmap_scan',
      'whatweb_scan', 'waf_detect', 'curl_request', 'curl', 'httpx',
      'subfinder', 'dnsx', 'shell_exec',
    ]);

    if (!reconTools.has(toolName)) return false;
    if (toolName !== 'shell_exec') return true;

    return /\b(dig|nslookup|host|whois|nmap|whatweb|httpx|curl|wafw00f|subfinder|dnsx)\b/i.test(command);
  }

  private extractIPv4Addresses(output: string): string[] {
    const matches = output.match(/\b(?:\d{1,3}\.){3}\d{1,3}\b/g) || [];
    const valid = matches.filter((ip) => {
      const octets = ip.split('.').map((part) => Number(part));
      return octets.length === 4 && octets.every((octet) => Number.isInteger(octet) && octet >= 0 && octet <= 255);
    });
    return Array.from(new Set(valid));
  }

  private extractOpenPorts(output: string): Array<{ port: number; protocol: string; service: string }> {
    const findings: Array<{ port: number; protocol: string; service: string }> = [];
    const portRegex = /(\d{1,5})\/(tcp|udp)\s+open\s+([^\n]+)/gi;
    let match: RegExpExecArray | null;
    while ((match = portRegex.exec(output)) !== null) {
      findings.push({
        port: Number(match[1]),
        protocol: match[2],
        service: match[3].trim().replace(/\s+/g, ' '),
      });
    }
    return findings;
  }

  private truncateEvidence(output: string, maxLength: number): string {
    if (output.length <= maxLength) return output;
    return `${output.substring(0, maxLength)}\n...[truncated]`;
  }
}

export const findingsAgent = new FindingsAgent(sseManager);
