/**
 * @module core/memory/SessionMemoryStore
 * @description Prisma-backed persistent store for agent session messages and summaries.
 *
 * Provides CRUD operations for:
 * - SessionMessage: individual agent messages with token estimates
 * - SessionSummary: compaction summaries that replace groups of messages
 *
 * This is the persistence layer that ConversationCompactor operates on top of.
 * The compaction engine replaces old messages with summaries in-memory; this
 * store persists both the original messages and the compaction results so that:
 * - B2 (Extract Memories) can query historical session data
 * - B3 (Away Summary) can reconstruct what happened during a session
 * - Sessions can survive restarts and be resumed
 *
 * Design:
 * - Uses optimistic sequence numbering (auto-increment per session)
 * - Messages are marked `compacted` when replaced by a summary
 * - Active messages = non-compacted messages + all summaries
 * - PentestId is optional (not all sessions are pentest-scoped)
 */

import { PrismaClient } from '@prisma/client';
import { estimateTokensForText } from './token-counter.js';

// ============================================================================
// TYPES
// ============================================================================

/** Data required to store a single message. */
export interface StoreMessageInput {
  role: string;
  content: string;
  /** Optional pentest scope. */
  pentestId?: string;
}

/** A stored session message. */
export interface StoredMessage {
  id: string;
  sessionId: string;
  agentId: string;
  pentestId: string | null;
  role: string;
  content: string;
  estimatedTokens: number;
  sequence: number;
  compacted: boolean;
  summaryId: string | null;
  createdAt: Date;
}

/** A stored compaction summary. */
export interface StoredSummary {
  id: string;
  sessionId: string;
  agentId: string;
  pentestId: string | null;
  summaryContent: string;
  estimatedTokens: number;
  fromSequence: number;
  toSequence: number;
  messageCount: number;
  usedLLM: boolean;
  tokensBefore: number;
  tokensAfter: number;
  createdAt: Date;
}

/** Options for listing messages. */
export interface ListMessagesOptions {
  /** Only return non-compacted messages. Default: true. */
  activeOnly?: boolean;
  /** Maximum number of messages to return. */
  limit?: number;
  /** Offset for pagination. */
  offset?: number;
}

// ============================================================================
// SESSION MEMORY STORE
// ============================================================================

export class SessionMemoryStore {
  private prisma: PrismaClient;

  constructor(prismaClient?: PrismaClient) {
    this.prisma = prismaClient || new PrismaClient();
  }

  // ==========================================================================
  // MESSAGE OPERATIONS
  // ==========================================================================

  /**
   * Store a single message for a session.
   *
   * Automatically calculates the next sequence number and estimates tokens.
   *
   * @param sessionId - The session identifier
   * @param agentId - The agent identifier
   * @param input - Message data
   * @returns The stored message
   */
  async addMessage(
    sessionId: string,
    agentId: string,
    input: StoreMessageInput,
  ): Promise<StoredMessage> {
    const nextSeq = await this.getNextSequence(sessionId);
    const estimatedTokens = estimateTokensForText(input.content);

    const msg = await this.prisma.sessionMessage.create({
      data: {
        sessionId,
        agentId,
        pentestId: input.pentestId ?? null,
        role: input.role,
        content: input.content,
        estimatedTokens,
        sequence: nextSeq,
      },
    });

    return this.toStoredMessage(msg);
  }

  /**
   * Store multiple messages in bulk (efficient for turn logging).
   *
   * All messages get sequential sequence numbers.
   *
   * @param sessionId - The session identifier
   * @param agentId - The agent identifier
   * @param inputs - Array of message data
   * @returns Array of stored messages in order
   */
  async addMessages(
    sessionId: string,
    agentId: string,
    inputs: StoreMessageInput[],
  ): Promise<StoredMessage[]> {
    if (inputs.length === 0) return [];

    const startSeq = await this.getNextSequence(sessionId);
    const results: StoredMessage[] = [];

    // Use createMany for efficiency, then fetch back
    const data = inputs.map((input, i) => ({
      sessionId,
      agentId,
      pentestId: input.pentestId ?? null,
      role: input.role,
      content: input.content,
      estimatedTokens: estimateTokensForText(input.content),
      sequence: startSeq + i,
    }));

    await this.prisma.sessionMessage.createMany({ data });

    // Fetch back the created messages
    const created = await this.prisma.sessionMessage.findMany({
      where: {
        sessionId,
        sequence: { gte: startSeq, lt: startSeq + inputs.length },
      },
      orderBy: { sequence: 'asc' },
    });

    for (const msg of created) {
      results.push(this.toStoredMessage(msg));
    }

    return results;
  }

  /**
   * List messages for a session.
   *
   * By default returns only active (non-compacted) messages.
   *
   * @param sessionId - The session identifier
   * @param options - Filter and pagination options
   * @returns Array of stored messages
   */
  async listMessages(
    sessionId: string,
    options: ListMessagesOptions = {},
  ): Promise<StoredMessage[]> {
    const { activeOnly = true, limit, offset } = options;

    const messages = await this.prisma.sessionMessage.findMany({
      where: {
        sessionId,
        ...(activeOnly ? { compacted: false } : {}),
      },
      orderBy: { sequence: 'asc' },
      ...(limit ? { take: limit } : {}),
      ...(offset ? { skip: offset } : {}),
    });

    return messages.map(m => this.toStoredMessage(m));
  }

  /**
   * Get the total number of active messages for a session.
   *
   * @param sessionId - The session identifier
   * @returns Count of non-compacted messages
   */
  async getActiveMessageCount(sessionId: string): Promise<number> {
    return this.prisma.sessionMessage.count({
      where: { sessionId, compacted: false },
    });
  }

  /**
   * Get the total estimated tokens for active messages.
   *
   * @param sessionId - The session identifier
   * @returns Sum of estimatedTokens for non-compacted messages
   */
  async getActiveTokenCount(sessionId: string): Promise<number> {
    const result = await this.prisma.sessionMessage.aggregate({
      where: { sessionId, compacted: false },
      _sum: { estimatedTokens: true },
    });
    return result._sum.estimatedTokens ?? 0;
  }

  // ==========================================================================
  // SUMMARY OPERATIONS
  // ==========================================================================

  /**
   * Store a compaction summary and mark the covered messages as compacted.
   *
   * This is the key operation: it atomically:
   * 1. Creates a SessionSummary record
   * 2. Marks all messages in [fromSequence, toSequence] as compacted
   * 3. Links those messages to the summary
   *
   * @param sessionId - The session identifier
   * @param agentId - The agent identifier
   * @param params - Summary data including covered message range
   * @returns The stored summary
   */
  async storeSummary(
    sessionId: string,
    agentId: string,
    params: {
      summaryContent: string;
      fromSequence: number;
      toSequence: number;
      messageCount: number;
      usedLLM: boolean;
      tokensBefore: number;
      tokensAfter: number;
      pentestId?: string;
    },
  ): Promise<StoredSummary> {
    const estimatedTokens = estimateTokensForText(params.summaryContent);

    // Create the summary
    const summary = await this.prisma.sessionSummary.create({
      data: {
        sessionId,
        agentId,
        pentestId: params.pentestId ?? null,
        summaryContent: params.summaryContent,
        estimatedTokens,
        fromSequence: params.fromSequence,
        toSequence: params.toSequence,
        messageCount: params.messageCount,
        usedLLM: params.usedLLM,
        tokensBefore: params.tokensBefore,
        tokensAfter: params.tokensAfter,
      },
    });

    // Mark covered messages as compacted and link to summary
    await this.prisma.sessionMessage.updateMany({
      where: {
        sessionId,
        sequence: { gte: params.fromSequence, lte: params.toSequence },
        compacted: false,
      },
      data: {
        compacted: true,
        summaryId: summary.id,
      },
    });

    return this.toStoredSummary(summary);
  }

  /**
   * List all summaries for a session.
   *
   * @param sessionId - The session identifier
   * @returns Array of stored summaries in creation order
   */
  async listSummaries(sessionId: string): Promise<StoredSummary[]> {
    const summaries = await this.prisma.sessionSummary.findMany({
      where: { sessionId },
      orderBy: { createdAt: 'asc' },
    });

    return summaries.map(s => this.toStoredSummary(s));
  }

  /**
   * Get the most recent summary for a session.
   *
   * Useful for reconstructing the effective conversation context:
   * latest summary + active messages after the summary.
   *
   * @param sessionId - The session identifier
   * @returns The most recent summary, or null
   */
  async getLatestSummary(sessionId: string): Promise<StoredSummary | null> {
    const summary = await this.prisma.sessionSummary.findFirst({
      where: { sessionId },
      orderBy: { createdAt: 'desc' },
    });

    return summary ? this.toStoredSummary(summary) : null;
  }

  // ==========================================================================
  // RECONSTRUCTION
  // ==========================================================================

  /**
   * Get the effective conversation context for a session.
   *
   * Returns the latest summary (if any) + all active messages after it.
   * This is what should be fed to the LLM — compacted history + recent messages.
   *
   * @param sessionId - The session identifier
   * @returns Object with optional summary and recent messages
   */
  async getEffectiveContext(sessionId: string): Promise<{
    summary: StoredSummary | null;
    recentMessages: StoredMessage[];
  }> {
    const latestSummary = await this.getLatestSummary(sessionId);

    // Get active messages after the summary's coverage
    const where = latestSummary
      ? { sessionId, compacted: false, sequence: { gt: latestSummary.toSequence } }
      : { sessionId, compacted: false };

    const recentMessages = await this.prisma.sessionMessage.findMany({
      where,
      orderBy: { sequence: 'asc' },
    });

    return {
      summary: latestSummary,
      recentMessages: recentMessages.map(m => this.toStoredMessage(m)),
    };
  }

  // ==========================================================================
  // INTERNAL HELPERS
  // ==========================================================================

  /**
   * Get the next sequence number for a session.
   */
  private async getNextSequence(sessionId: string): Promise<number> {
    const lastMsg = await this.prisma.sessionMessage.findFirst({
      where: { sessionId },
      orderBy: { sequence: 'desc' },
      select: { sequence: true },
    });

    return (lastMsg?.sequence ?? 0) + 1;
  }

  /**
   * Map Prisma result to StoredMessage.
   */
  private toStoredMessage(msg: {
    id: string;
    sessionId: string;
    agentId: string;
    pentestId: string | null;
    role: string;
    content: string;
    estimatedTokens: number;
    sequence: number;
    compacted: boolean;
    summaryId: string | null;
    createdAt: Date;
  }): StoredMessage {
    return {
      id: msg.id,
      sessionId: msg.sessionId,
      agentId: msg.agentId,
      pentestId: msg.pentestId,
      role: msg.role,
      content: msg.content,
      estimatedTokens: msg.estimatedTokens,
      sequence: msg.sequence,
      compacted: msg.compacted,
      summaryId: msg.summaryId,
      createdAt: msg.createdAt,
    };
  }

  /**
   * Map Prisma result to StoredSummary.
   */
  private toStoredSummary(s: {
    id: string;
    sessionId: string;
    agentId: string;
    pentestId: string | null;
    summaryContent: string;
    estimatedTokens: number;
    fromSequence: number;
    toSequence: number;
    messageCount: number;
    usedLLM: boolean;
    tokensBefore: number;
    tokensAfter: number;
    createdAt: Date;
  }): StoredSummary {
    return {
      id: s.id,
      sessionId: s.sessionId,
      agentId: s.agentId,
      pentestId: s.pentestId,
      summaryContent: s.summaryContent,
      estimatedTokens: s.estimatedTokens,
      fromSequence: s.fromSequence,
      toSequence: s.toSequence,
      messageCount: s.messageCount,
      usedLLM: s.usedLLM,
      tokensBefore: s.tokensBefore,
      tokensAfter: s.tokensAfter,
      createdAt: s.createdAt,
    };
  }
}
