import { PrismaClient } from '@prisma/client';
import { kaliMcpClient } from '../mcp/KaliMCPClient.js';
import {
  parseJsonWithSchema,
  contextSnapshotSummarySchema,
  toPrismaJson,
} from '../../types/schemas.js';

export type ContextCompactionTrigger = 'PHASE_END' | 'URGENT' | 'ERROR_RECOVERY' | 'MANUAL';

export interface ContextCompactionRequest {
  pentestId: string;
  trigger: ContextCompactionTrigger;
  phaseFrom?: string;
  phaseTo?: string;
  reason?: string;
  actor?: string;
  estimatedTokensBefore?: number;
  summarizeWithAI?: (prompt: string) => Promise<string>;
}

export interface ContextCompactionResult {
  snapshot: {
    id: string;
    trigger: ContextCompactionTrigger;
    phase_from: string | null;
    phase_to: string | null;
    summary_markdown: string;
    summary_json: Record<string, unknown>;
    workspace_file: string | null;
    archived_until_message_seq: number | null;
    archived_until_tool_ts: string | null;
    created_at: string;
  };
  memoryPayload: string;
  stats: {
    beforeEstimatedTokens: number;
    afterEstimatedTokens: number;
    reductionPct: number;
    deltaMessages: number;
    deltaTools: number;
  };
}

interface DeltaData {
  pentest: {
    id: string;
    target: string;
    phase: string;
    scope: Record<string, unknown>;
  };
  messages: Array<{
    sequence: number;
    type: string;
    content: string;
    created_at: Date;
  }>;
  toolExecutions: Array<{
    tool_name: string;
    status: string;
    output: string | null;
    error: string | null;
    created_at: Date;
  }>;
  todos: Array<{
    content: string;
    status: string;
    priority: number;
  }>;
  findings: Array<{
    title: string;
    severity: string;
    category: string;
    created_at: Date;
  }>;
  lastSnapshot: {
    id: string;
    created_at: Date;
    archived_until_message_seq: number | null;
    archived_until_tool_ts: Date | null;
  } | null;
}

const MAX_MESSAGE_DELTA = 400;
const MAX_TOOL_DELTA = 250;
const MAX_PROMPT_CHARS = 120_000;
const HOT_ITEMS_LIMIT = 12;

function asScopeList(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((entry) => String(entry || '').trim())
    .filter(Boolean);
}

function clip(text: string, max: number): string {
  if (text.length <= max) return text;
  return `${text.substring(0, max)}\n...[truncated]`;
}

function estimateTokens(text: string): number {
  return Math.ceil(Math.max(0, text.length) / 4);
}

function overlapScore(query: string, candidate: string): number {
  const qTokens = new Set(
    query
      .toLowerCase()
      .split(/[^a-z0-9._-]+/g)
      .filter((token) => token.length >= 3)
  );
  if (qTokens.size === 0) return 0;
  const cLower = candidate.toLowerCase();
  let score = 0;
  for (const token of qTokens) {
    if (cLower.includes(token)) score += 1;
  }
  return score / qTokens.size;
}

export class ContextCompactionService {
  private prisma: PrismaClient;

  constructor(prismaClient?: PrismaClient) {
    this.prisma = prismaClient || new PrismaClient();
  }

  async compact(input: ContextCompactionRequest): Promise<ContextCompactionResult> {
    const delta = await this.collectDelta(input.pentestId);
    const heuristic = this.buildHeuristicSummary(delta, input);
    const aiSummary = await this.maybeBuildAISummary(delta, input, heuristic.markdown);
    const markdown = aiSummary || heuristic.markdown;
    const summaryJson: Record<string, unknown> = {
      ...heuristic.summaryJson,
      summary_mode: aiSummary ? 'ai' : 'heuristic',
      trigger: input.trigger,
      reason: input.reason || null,
    };

    const workspaceFile = await this.writeWorkspaceSnapshot(
      delta,
      input,
      markdown
    );

    const archivedUntilMessageSeq = delta.messages.length > 0
      ? delta.messages[delta.messages.length - 1].sequence
      : (delta.lastSnapshot?.archived_until_message_seq ?? null);
    const archivedUntilToolTs = delta.toolExecutions.length > 0
      ? delta.toolExecutions[delta.toolExecutions.length - 1].created_at
      : (delta.lastSnapshot?.archived_until_tool_ts ?? null);

    const created = await this.prisma.contextSnapshot.create({
      data: {
        pentest_id: input.pentestId,
        trigger: input.trigger,
        phase_from: input.phaseFrom || delta.pentest.phase || null,
        phase_to: input.phaseTo || delta.pentest.phase || null,
        summary_markdown: markdown,
        summary_json: toPrismaJson(summaryJson),
        workspace_file: workspaceFile || null,
        archived_until_message_seq: archivedUntilMessageSeq,
        archived_until_tool_ts: archivedUntilToolTs,
      },
    });

    const memoryPayload = this.buildMemoryPayload(
      created.id,
      markdown,
      summaryJson
    );

    const beforeEstimatedTokens = Math.max(
      input.estimatedTokensBefore || 0,
      estimateTokens(this.serializeDeltaForEstimate(delta))
    );
    const afterEstimatedTokens = estimateTokens(memoryPayload);
    const reductionPct = beforeEstimatedTokens > 0
      ? Math.max(0, Math.round(((beforeEstimatedTokens - afterEstimatedTokens) / beforeEstimatedTokens) * 100))
      : 0;

    return {
      snapshot: {
        id: created.id,
        trigger: created.trigger as ContextCompactionTrigger,
        phase_from: created.phase_from,
        phase_to: created.phase_to,
        summary_markdown: created.summary_markdown,
        summary_json: parseJsonWithSchema(contextSnapshotSummarySchema, created.summary_json, {}),
        workspace_file: created.workspace_file,
        archived_until_message_seq: created.archived_until_message_seq,
        archived_until_tool_ts: created.archived_until_tool_ts
          ? created.archived_until_tool_ts.toISOString()
          : null,
        created_at: created.created_at.toISOString(),
      },
      memoryPayload,
      stats: {
        beforeEstimatedTokens,
        afterEstimatedTokens,
        reductionPct,
        deltaMessages: delta.messages.length,
        deltaTools: delta.toolExecutions.length,
      },
    };
  }

  private async collectDelta(pentestId: string): Promise<DeltaData> {
    const pentest = await this.prisma.pentest.findUnique({
      where: { id: pentestId },
      select: {
        id: true,
        target: true,
        phase: true,
        scope: true,
      },
    });
    if (!pentest) {
      throw new Error(`Pentest not found: ${pentestId}`);
    }

    const lastSnapshot = await this.prisma.contextSnapshot.findFirst({
      where: { pentest_id: pentestId },
      orderBy: { created_at: 'desc' },
      select: {
        id: true,
        created_at: true,
        archived_until_message_seq: true,
        archived_until_tool_ts: true,
      },
    });

    const messages = await this.prisma.message.findMany({
      where: {
        pentest_id: pentestId,
        ...(lastSnapshot?.archived_until_message_seq
          ? { sequence: { gt: lastSnapshot.archived_until_message_seq } }
          : {}),
      },
      orderBy: { sequence: 'asc' },
      take: MAX_MESSAGE_DELTA,
      select: {
        sequence: true,
        type: true,
        content: true,
        created_at: true,
      },
    });

    const toolExecutions = await this.prisma.toolExecution.findMany({
      where: {
        pentest_id: pentestId,
        ...(lastSnapshot?.archived_until_tool_ts
          ? { created_at: { gt: lastSnapshot.archived_until_tool_ts } }
          : {}),
      },
      orderBy: { created_at: 'asc' },
      take: MAX_TOOL_DELTA,
      select: {
        tool_name: true,
        status: true,
        output: true,
        error: true,
        created_at: true,
      },
    });

    const [todos, findings] = await Promise.all([
      this.prisma.todo.findMany({
        where: { pentest_id: pentestId },
        orderBy: [{ status: 'asc' }, { priority: 'asc' }],
        select: {
          content: true,
          status: true,
          priority: true,
        },
      }),
      this.prisma.finding.findMany({
        where: {
          pentest_id: pentestId,
          ...(lastSnapshot ? { created_at: { gt: lastSnapshot.created_at } } : {}),
        },
        orderBy: { created_at: 'desc' },
        take: 100,
        select: {
          title: true,
          severity: true,
          category: true,
          created_at: true,
        },
      }),
    ]);

    return {
      pentest: {
        id: pentest.id,
        target: pentest.target,
        phase: String(pentest.phase),
        scope: (pentest.scope || {}) as Record<string, unknown>,
      },
      messages,
      toolExecutions,
      todos,
      findings,
      lastSnapshot: lastSnapshot
        ? {
            id: lastSnapshot.id,
            created_at: lastSnapshot.created_at,
            archived_until_message_seq: lastSnapshot.archived_until_message_seq,
            archived_until_tool_ts: lastSnapshot.archived_until_tool_ts,
          }
        : null,
    };
  }

  private buildHeuristicSummary(delta: DeltaData, input: ContextCompactionRequest): {
    markdown: string;
    summaryJson: Record<string, unknown>;
  } {
    const inScope = asScopeList(delta.pentest.scope.inScope);
    const outOfScope = asScopeList(delta.pentest.scope.outOfScope);
    const inProgressTodos = delta.todos.filter((todo) => todo.status === 'IN_PROGRESS').slice(0, HOT_ITEMS_LIMIT);
    const pendingTodos = delta.todos.filter((todo) => todo.status === 'PENDING').slice(0, HOT_ITEMS_LIMIT);
    const completedTodos = delta.todos.filter((todo) => todo.status === 'COMPLETED').slice(0, HOT_ITEMS_LIMIT);
    const findingHighlights = delta.findings.slice(0, HOT_ITEMS_LIMIT);

    const recentTextMessages = delta.messages
      .filter((msg) => msg.type === 'ASSISTANT' || msg.type === 'SYSTEM')
      .slice(-10)
      .map((msg) => `- [${msg.type}] ${clip(msg.content.replace(/\s+/g, ' ').trim(), 260)}`);
    const recentToolHighlights = delta.toolExecutions
      .slice(-10)
      .map((tool) => {
        const excerpt = clip((tool.output || tool.error || '').replace(/\s+/g, ' ').trim(), 180);
        return `- ${tool.tool_name} (${tool.status})${excerpt ? ` -> ${excerpt}` : ''}`;
      });

    const severityCounts = delta.findings.reduce<Record<string, number>>((acc, finding) => {
      const key = String(finding.severity || 'INFORMATIONAL');
      acc[key] = (acc[key] || 0) + 1;
      return acc;
    }, {});

    const markdownLines: string[] = [
      `# Context Snapshot (${input.trigger})`,
      '',
      `- Pentest: ${delta.pentest.id}`,
      `- Target: ${delta.pentest.target}`,
      `- Phase: ${delta.pentest.phase}`,
      `- Trigger reason: ${input.reason || 'n/a'}`,
      `- Delta messages: ${delta.messages.length}`,
      `- Delta tools: ${delta.toolExecutions.length}`,
      `- New findings since last snapshot: ${delta.findings.length}`,
      '',
      '## Scope',
      `- In scope (${inScope.length}): ${inScope.slice(0, 12).join(', ') || 'none'}`,
      `- Out of scope (${outOfScope.length}): ${outOfScope.slice(0, 12).join(', ') || 'none'}`,
      '',
      '## Active Todos',
      ...(
        inProgressTodos.length > 0
          ? inProgressTodos.map((todo) => `- [IN_PROGRESS] P${todo.priority} ${todo.content}`)
          : ['- none']
      ),
      '',
      '## Pending Todos',
      ...(
        pendingTodos.length > 0
          ? pendingTodos.map((todo) => `- [PENDING] P${todo.priority} ${todo.content}`)
          : ['- none']
      ),
      '',
      '## Completed Todos (sample)',
      ...(
        completedTodos.length > 0
          ? completedTodos.map((todo) => `- [COMPLETED] P${todo.priority} ${todo.content}`)
          : ['- none']
      ),
      '',
      '## Findings Highlights',
      ...(
        findingHighlights.length > 0
          ? findingHighlights.map((finding) => `- [${finding.severity}] ${finding.title} (${finding.category})`)
          : ['- none']
      ),
      '',
      '## Recent Assistant/System Messages',
      ...(recentTextMessages.length > 0 ? recentTextMessages : ['- none']),
      '',
      '## Recent Tool Outcomes',
      ...(recentToolHighlights.length > 0 ? recentToolHighlights : ['- none']),
      '',
      '## Next Actions',
      '- Continue from active todos.',
      '- Prioritize unresolved hypotheses and pending scope decisions.',
      '- Use context_lookup only if memory is ambiguous.',
    ];

    const markdown = clip(markdownLines.join('\n'), 80_000);
    const summaryJson: Record<string, unknown> = {
      pentestId: delta.pentest.id,
      target: delta.pentest.target,
      phase: delta.pentest.phase,
      delta: {
        messages: delta.messages.length,
        tools: delta.toolExecutions.length,
        findings: delta.findings.length,
      },
      severity_counts: severityCounts,
      in_scope: inScope,
      out_of_scope: outOfScope,
      active_todos: inProgressTodos.map((todo) => ({
        priority: todo.priority,
        content: todo.content,
      })),
      pending_todos: pendingTodos.map((todo) => ({
        priority: todo.priority,
        content: todo.content,
      })),
      recent_findings: findingHighlights.map((finding) => ({
        severity: finding.severity,
        title: finding.title,
        category: finding.category,
      })),
    };

    return { markdown, summaryJson };
  }

  private async maybeBuildAISummary(
    delta: DeltaData,
    input: ContextCompactionRequest,
    heuristicMarkdown: string
  ): Promise<string | null> {
    if (!input.summarizeWithAI) return null;

    const condensedForPrompt = clip(this.serializeDeltaForPrompt(delta), MAX_PROMPT_CHARS);
    const prompt = [
      'You are a pentest context compactor.',
      'Return ONLY markdown.',
      'Goal: preserve critical operational memory while minimizing tokens.',
      'Rules:',
      '- Keep: target/scope boundaries, active hypotheses, unfinished todos, key evidence, open findings.',
      '- Drop: verbose tool noise and duplicate chatter.',
      '- Format sections: Scope, Active Work, Findings, Evidence Highlights, Next Best Actions.',
      `Trigger: ${input.trigger}`,
      `Reason: ${input.reason || 'n/a'}`,
      '',
      'Raw delta:',
      condensedForPrompt,
      '',
      'If uncertain, keep details conservative and explicit.',
    ].join('\n');

    try {
      const ai = await input.summarizeWithAI(prompt);
      const normalized = clip(String(ai || '').trim(), 80_000);
      if (!normalized) return null;
      return normalized;
    } catch {
      return heuristicMarkdown;
    }
  }

  private serializeDeltaForPrompt(delta: DeltaData): string {
    const toolLines = delta.toolExecutions.map((tool) => {
      const output = clip((tool.output || tool.error || '').replace(/\s+/g, ' ').trim(), 260);
      return `[TOOL:${tool.status}] ${tool.tool_name}: ${output}`;
    });
    const msgLines = delta.messages.map((msg) => {
      const normalized = clip(msg.content.replace(/\s+/g, ' ').trim(), 220);
      return `[MSG:${msg.type}#${msg.sequence}] ${normalized}`;
    });
    const todoLines = delta.todos.map((todo) => `[TODO:${todo.status}] P${todo.priority} ${todo.content}`);
    const findingLines = delta.findings.map((finding) => `[FINDING:${finding.severity}] ${finding.title} (${finding.category})`);

    return [
      `Target=${delta.pentest.target}`,
      `Phase=${delta.pentest.phase}`,
      '',
      'TODOS:',
      ...todoLines,
      '',
      'FINDINGS:',
      ...findingLines,
      '',
      'MESSAGES:',
      ...msgLines,
      '',
      'TOOLS:',
      ...toolLines,
    ].join('\n');
  }

  private serializeDeltaForEstimate(delta: DeltaData): string {
    return [
      delta.messages.map((msg) => msg.content).join('\n'),
      delta.toolExecutions.map((tool) => tool.output || tool.error || '').join('\n'),
      delta.findings.map((finding) => `${finding.severity}:${finding.title}`).join('\n'),
      delta.todos.map((todo) => `${todo.status}:${todo.content}`).join('\n'),
    ].join('\n');
  }

  private buildMemoryPayload(
    snapshotId: string,
    markdown: string,
    summaryJson: Record<string, unknown>
  ): string {
    const activeTodos = Array.isArray(summaryJson.active_todos) ? summaryJson.active_todos : [];
    const pendingTodos = Array.isArray(summaryJson.pending_todos) ? summaryJson.pending_todos : [];
    const findings = Array.isArray(summaryJson.recent_findings) ? summaryJson.recent_findings : [];
    const phase = String(summaryJson.phase || 'unknown');
    const target = String(summaryJson.target || 'unknown');

    const lines: string[] = [
      `CONTEXT_MEMORY_SNAPSHOT_ID=${snapshotId}`,
      `Target: ${target}`,
      `Phase: ${phase}`,
      '',
      'Continue from this compacted memory first.',
      '',
      'Active todos:',
      ...(activeTodos.length > 0
        ? activeTodos.slice(0, HOT_ITEMS_LIMIT).map((item) => {
            const rec = item as Record<string, unknown>;
            return `- P${rec.priority ?? '?'} ${String(rec.content || '')}`;
          })
        : ['- none']),
      '',
      'Pending todos:',
      ...(pendingTodos.length > 0
        ? pendingTodos.slice(0, HOT_ITEMS_LIMIT).map((item) => {
            const rec = item as Record<string, unknown>;
            return `- P${rec.priority ?? '?'} ${String(rec.content || '')}`;
          })
        : ['- none']),
      '',
      'Findings highlights:',
      ...(findings.length > 0
        ? findings.slice(0, HOT_ITEMS_LIMIT).map((item) => {
            const rec = item as Record<string, unknown>;
            return `- [${String(rec.severity || 'INFORMATIONAL')}] ${String(rec.title || '')}`;
          })
        : ['- none']),
      '',
      'Compacted summary markdown:',
      clip(markdown, 12_000),
    ];

    return clip(lines.join('\n'), 20_000);
  }

  private async writeWorkspaceSnapshot(
    delta: DeltaData,
    input: ContextCompactionRequest,
    markdown: string
  ): Promise<string | null> {
    const safeTs = new Date().toISOString().replace(/[:.]/g, '-');
    const relPath = `notes/context/${safeTs}-${input.trigger.toLowerCase()}.md`;
    const scope = delta.pentest.scope || {};
    const inScope = asScopeList(scope.inScope);
    const outOfScope = asScopeList(scope.outOfScope);

    const result = await kaliMcpClient.callTool(
      'workspace_write_file',
      {
        pentest_id: delta.pentest.id,
        path: relPath,
        content: markdown,
        append: false,
      },
      30_000,
      {
        pentestId: delta.pentest.id,
        actor: input.actor || 'context-compaction',
        target: delta.pentest.target,
        inScope,
        outOfScope,
        scopeMode: 'extended',
      }
    );

    if (!result.success) {
      return null;
    }

    return relPath;
  }

  async querySnapshots(
    pentestId: string,
    query: string,
    limit: number = 8
  ): Promise<Array<{ snapshotId: string; score: number; createdAt: string; excerpt: string }>> {
    const snapshots = await this.prisma.contextSnapshot.findMany({
      where: { pentest_id: pentestId },
      orderBy: { created_at: 'desc' },
      take: 50,
      select: {
        id: true,
        summary_markdown: true,
        created_at: true,
      },
    });

    return snapshots
      .map((snapshot) => ({
        snapshotId: snapshot.id,
        score: overlapScore(query, snapshot.summary_markdown),
        createdAt: snapshot.created_at.toISOString(),
        excerpt: clip(snapshot.summary_markdown.replace(/\s+/g, ' ').trim(), 360),
      }))
      .filter((item) => item.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, Math.max(1, Math.min(limit, 20)));
  }
}
