/**
 * @module core/memory/MemoryExtractor
 * @description Extracts stable facts/memories from agent conversations via LLM.
 *
 * Triggered at three checkpoint points:
 * 1. Agent completion (completeTeammate) — final extraction from full session
 * 2. Post-compaction — extraction from messages about to be condensed
 * 3. Swarm shutdown — fallback for agents that didn't complete normally
 *
 * Design: best-effort, non-blocking. Extraction failures never disrupt the swarm run.
 */

import type { PrismaClient } from '@prisma/client';
import type { SessionMemoryStore, StoredMessage } from './SessionMemoryStore.js';
import type { ModelCallParams, StreamEvent } from '../types/session-types.js';
import { calculateCost } from '../analytics/pricing-table.js';

// ============================================================================
// TYPES
// ============================================================================

/** Extraction trigger source — for traceability and dedup. Matches Prisma ExtractionTrigger enum. */
export type ExtractionTrigger = 'AGENT_COMPLETE' | 'POST_COMPACTION' | 'SWARM_SHUTDOWN' | 'MANUAL';

/** Input message for explicit extraction (e.g. post-compaction). */
export interface ExtractMessageInput {
  role: string;
  content: string;
  sequence?: number; // Absolute sequence from SessionMessage
}

/** Raw extracted memory before persistence. */
export interface ExtractedMemoryRaw {
  type: string;
  category: string;
  title: string;
  payload: Record<string, unknown>;
  confidence: number;
}

/** Result of an extraction operation. */
export interface ExtractResult {
  count: number;
  memories: ExtractedMemoryRaw[];
  trigger: ExtractionTrigger;
  durationMs: number;
}

// ============================================================================
// LLM EXTRACTION PROMPT
// ============================================================================

const EXTRACTION_SYSTEM_PROMPT = `You are a memory extraction assistant. Your job is to analyze an agent's conversation and extract stable, factual memories.

For each significant fact, decision, preference, or constraint you find, output a JSON object.

## MEMORY TYPES

- **TARGET_FACT**: A concrete fact about the target (open port, detected service, OS, tech stack, domain info)
- **FINDING**: A security observation or potential vulnerability discovered during the engagement
- **USER_PREFERENCE**: A user preference or pattern inferred from their input/choices
- **DECISION**: A decision made by the agent or team during execution (with rationale)
- **CONSTRAINT**: A limit, restriction, or boundary identified during operations

## RULES

1. Extract ONLY what is observable in the provided messages — do not invent or assume.
2. Prefer concrete observations over inferences.
3. Set confidence to 1.0 for direct observations, < 1.0 for inferences.
4. Do NOT duplicate — each memory should be unique.
5. Keep titles short and readable (e.g., "Port 22 open on 10.0.0.5").
6. The payload should be structured JSON relevant to the memory type.

## OUTPUT FORMAT

Return ONLY a JSON array. No markdown, no explanation:
[
  {
    "type": "TARGET_FACT|FINDING|USER_PREFERENCE|DECISION|CONSTRAINT",
    "category": "string",
    "title": "string",
    "payload": { ... },
    "confidence": 0.0 to 1.0
  }
]

If no significant memories are found, return an empty array: []`;

const EXTRACTION_USER_PREFIX = '## Conversation to analyze\n\n';
const EXTRACTION_USER_SUFFIX = '\n\nExtract all stable memories from the conversation above as a JSON array.';

// ============================================================================
// MEMORY EXTRACTOR
// ============================================================================

export class MemoryExtractor {
  private readonly prisma: PrismaClient;
  private readonly memoryStore: SessionMemoryStore;
  private readonly callModel: (params: ModelCallParams) => AsyncGenerator<StreamEvent>;
  private readonly model: string;

  constructor(deps: {
    prisma: PrismaClient;
    memoryStore: SessionMemoryStore;
    callModel: (params: ModelCallParams) => AsyncGenerator<StreamEvent>;
    /** Model to use for extraction LLM calls. Defaults to DEFAULT_MODEL env or 'claude-sonnet-4-6'. */
    model?: string;
  }) {
    this.prisma = deps.prisma;
    this.memoryStore = deps.memoryStore;
    this.callModel = deps.callModel;
    this.model = deps.model ?? process.env.DEFAULT_MODEL ?? 'claude-sonnet-4-6';
  }

  // ==========================================================================
  // PUBLIC API
  // ==========================================================================

  /**
   * Extract memories from a full agent session.
   *
   * Uses getEffectiveContext() to get summary + recent messages,
   * then calls LLM to extract structured facts.
   */
  async extractFromSession(params: {
    swarmRunId: string;
    agentId: string;
    pentestId?: string;
    projectKey: string;
    trigger: ExtractionTrigger;
    maxRecentMessages?: number;
  }): Promise<ExtractResult> {
    const { swarmRunId, agentId, pentestId, projectKey, trigger, maxRecentMessages = 30 } = params;
    const start = Date.now();

    try {
      // 1. Get effective context (summary + recent active messages)
      const { summary, recentMessages } = await this.memoryStore.getEffectiveContext(swarmRunId);

      // 2. Build conversation text for LLM
      const messagesToSend = recentMessages.slice(-maxRecentMessages);
      if (messagesToSend.length === 0 && !summary) {
        return this.emptyResult(trigger, start);
      }

      const conversationText = this.buildConversationText(summary, messagesToSend);

      // 3. Call LLM for extraction
      const rawMemories = await this.callLLM(conversationText);

      // 4. Dedup + persist
      const count = await this.dedupAndPersist({
        memories: rawMemories,
        swarmRunId,
        agentId,
        pentestId,
        projectKey,
        trigger,
      });

      return { count, memories: rawMemories, trigger, durationMs: Date.now() - start };
    } catch (error: any) {
      console.error(`[MemoryExtractor] extractFromSession failed [${trigger}] swarm=${swarmRunId} agent=${agentId}:`, error.message ?? error);
      return this.emptyResult(trigger, start);
    }
  }

  /**
   * Extract memories from an explicit set of messages (e.g. post-compaction).
   *
   * Each message can carry its absolute sequence for traceability.
   */
  async extractFromMessages(params: {
    messages: ExtractMessageInput[];
    swarmRunId: string;
    agentId: string;
    pentestId?: string;
    projectKey: string;
    trigger: ExtractionTrigger;
  }): Promise<ExtractResult> {
    const { messages, swarmRunId, agentId, pentestId, projectKey, trigger } = params;
    const start = Date.now();

    try {
      if (messages.length === 0) {
        return this.emptyResult(trigger, start);
      }

      // 1. Build conversation text from provided messages
      const conversationText = this.buildConversationTextFromMessages(messages);

      // 2. Call LLM for extraction
      const rawMemories = await this.callLLM(conversationText);

      // 3. Dedup + persist (with sequences for sourceTurns)
      const sourceTurns = messages
        .filter(m => m.sequence !== undefined)
        .map(m => m.sequence!);

      const count = await this.dedupAndPersist({
        memories: rawMemories,
        swarmRunId,
        agentId,
        pentestId,
        projectKey,
        trigger,
        sourceTurns: sourceTurns.length > 0 ? sourceTurns : undefined,
      });

      return { count, memories: rawMemories, trigger, durationMs: Date.now() - start };
    } catch (error: any) {
      console.error(`[MemoryExtractor] extractFromMessages failed [${trigger}] swarm=${swarmRunId} agent=${agentId}:`, error.message ?? error);
      return this.emptyResult(trigger, start);
    }
  }

  /**
   * List memories for a project (cross-session query).
   */
  async listByProject(
    projectKey: string,
    options?: { types?: string[]; limit?: number; since?: Date },
  ): Promise<Record<string, unknown>[]> {
    const where: Record<string, unknown> = { projectKey };
    if (options?.types?.length) {
      where.type = { in: options.types };
    }
    if (options?.since) {
      where.createdAt = { gte: options.since };
    }

    const memories = await (this.prisma as any).extractedMemory.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      ...(options?.limit ? { take: options.limit } : {}),
    });

    return memories.map((m: Record<string, unknown>) => ({
      id: m.id as string,
      swarmRunId: m.swarmRunId as string,
      agentId: m.agentId as string,
      type: m.type as string,
      category: m.category as string,
      title: m.title as string,
      payload: m.payload as Record<string, unknown>,
      confidence: m.confidence as number,
      trigger: m.trigger as string,
      createdAt: (m.createdAt as Date).toISOString(),
    }));
  }

  /**
   * Check if a terminal extraction was already done for this agent session.
   *
   * Used by SwarmOrchestrator.shutdown() as anti-duplication guard.
   * Only considers 'AGENT_COMPLETE' and 'SWARM_SHUTDOWN' triggers as terminal.
   * A 'POST_COMPACTION' extraction does NOT block the shutdown fallback.
   */
  async wasTerminalExtractionDone(swarmRunId: string, agentId: string): Promise<boolean> {
    const count = await (this.prisma as any).extractedMemory.count({
      where: {
        swarmRunId,
        agentId,
        trigger: { in: ['AGENT_COMPLETE', 'SWARM_SHUTDOWN'] },
      },
    });
    return count > 0;
  }

  // ==========================================================================
  // INTERNAL — LLM CALL
  // ==========================================================================

  /**
   * Call the LLM with the conversation text and parse extraction result.
   * Returns parsed memories or empty array on failure.
   */
  private async callLLM(conversationText: string): Promise<ExtractedMemoryRaw[]> {
    try {
      let responseText = '';

      for await (const event of this.callModel({
        model: this.model,
        messages: [{ role: 'user', content: EXTRACTION_USER_PREFIX + conversationText + EXTRACTION_USER_SUFFIX }],
        tools: [],
        systemPrompt: EXTRACTION_SYSTEM_PROMPT,
        maxTokens: 2048,
      })) {
        if (event.type === 'text_delta') {
          responseText += event.text;
        }
        if (event.type === 'model_stop') {
          break;
        }
        if (event.type === 'error') {
          console.error('[MemoryExtractor] LLM error during extraction:', event.error.message);
          return [];
        }
      }

      return this.parseResponse(responseText);
    } catch (error: any) {
      console.error('[MemoryExtractor] LLM call failed:', error.message ?? error);
      return [];
    }
  }

  // ==========================================================================
  // INTERNAL — PARSING
  // ==========================================================================

  /**
   * Parse the LLM response into structured memories.
   * Gracefully handles malformed JSON.
   */
  private parseResponse(text: string): ExtractedMemoryRaw[] {
    // Try to extract JSON array from the response
    const jsonMatch = text.match(/\[[\s\S]*\]/);
    if (!jsonMatch) {
      console.warn('[MemoryExtractor] No JSON array found in LLM response');
      return [];
    }

    try {
      const parsed: unknown = JSON.parse(jsonMatch[0]);
      if (!Array.isArray(parsed)) {
        console.warn('[MemoryExtractor] LLM response is not a JSON array');
        return [];
      }

      return parsed
        .filter((item: unknown) => this.isValidMemory(item))
        .map((item: unknown) => item as ExtractedMemoryRaw);
    } catch (error: any) {
      console.warn('[MemoryExtractor] Failed to parse LLM JSON response:', error.message);
      return [];
    }
  }

  /**
   * Validate a parsed memory object has required fields.
   */
  private isValidMemory(item: unknown): item is ExtractedMemoryRaw {
    if (!item || typeof item !== 'object') return false;
    const m = item as Record<string, unknown>;
    return (
      typeof m.type === 'string' &&
      typeof m.category === 'string' &&
      typeof m.title === 'string' &&
      typeof m.payload === 'object' &&
      m.payload !== null &&
      typeof m.confidence === 'number'
    );
  }

  // ==========================================================================
  // INTERNAL — DEDUP + PERSIST
  // ==========================================================================

  /**
   * Deduplicate against existing memories and persist new ones.
   *
   * Dedup key: (projectKey, title) — same title in same project = duplicate.
   */
  private async dedupAndPersist(params: {
    memories: ExtractedMemoryRaw[];
    swarmRunId: string;
    agentId: string;
    pentestId?: string;
    projectKey: string;
    trigger: string;
    sourceTurns?: number[];
  }): Promise<number> {
    const { memories, swarmRunId, agentId, pentestId, projectKey, trigger, sourceTurns } = params;

    let persistedCount = 0;

    for (const mem of memories) {
      try {
        // Dedup check: has this title already been extracted for this project?
        const existing = await (this.prisma as any).extractedMemory.findFirst({
          where: { projectKey, title: mem.title },
        });

        if (existing) {
          continue; // Skip duplicate
        }

        await (this.prisma as any).extractedMemory.create({
          data: {
            projectKey,
            swarmRunId,
            agentId,
            pentestId: pentestId ?? null,
            type: mem.type as any,
            category: mem.category,
            title: mem.title,
            payload: mem.payload as any,
            confidence: mem.confidence,
            sourceTurns: sourceTurns ?? [],
            trigger,
          },
        });

        persistedCount++;
      } catch (error: any) {
        console.error(`[MemoryExtractor] Failed to persist memory "${mem.title}":`, error.message);
      }
    }

    return persistedCount;
  }

  // ==========================================================================
  // INTERNAL — TEXT BUILDING
  // ==========================================================================

  /**
   * Build conversation text from summary + messages (for extractFromSession).
   */
  private buildConversationText(
    summary: { summaryContent?: string } | null,
    messages: StoredMessage[],
  ): string {
    const parts: string[] = [];

    if (summary?.summaryContent) {
      parts.push(`## Previous context summary\n${summary.summaryContent}\n`);
    }

    if (messages.length > 0) {
      parts.push('## Recent messages');
      for (const msg of messages) {
        const roleLabel = msg.role === 'user' ? 'User' : msg.role === 'assistant' ? 'Assistant' : msg.role;
        parts.push(`**[${roleLabel}]** ${msg.content}`);
      }
    }

    return parts.join('\n\n');
  }

  /**
   * Build conversation text from explicit message inputs (for extractFromMessages).
   */
  private buildConversationTextFromMessages(messages: ExtractMessageInput[]): string {
    const parts: string[] = ['## Messages'];

    for (const msg of messages) {
      const roleLabel = msg.role === 'user' ? 'User' : msg.role === 'assistant' ? 'Assistant' : msg.role;
      const seqInfo = msg.sequence !== undefined ? ` [seq:${msg.sequence}]` : '';
      parts.push(`**[${roleLabel}]**${seqInfo} ${msg.content}`);
    }

    return parts.join('\n\n');
  }

  /**
   * Return an empty (zero-result) ExtractResult.
   */
  private emptyResult(trigger: ExtractionTrigger, start: number): ExtractResult {
    return { count: 0, memories: [], trigger, durationMs: Date.now() - start };
  }
}
