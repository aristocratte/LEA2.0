/**
 * @module core/runtime/ConversationCompactor
 * @description Compacts conversation history when token estimate exceeds threshold.
 *
 * Strategy: Replace message prefix with a single summary message,
 * keeping the last N messages verbatim to preserve recent context.
 *
 * Adapted from claude-code's autoCompact.ts for LEA's swarm architecture.
 */

import type { ChatMessage, AIClient } from '../../services/ai/AIClient.js';

// ============================================================================
// TYPES
// ============================================================================

/**
 * Parameters for conversation compaction.
 */
export interface CompactionParams {
  /** The message history to compact. */
  messages: ChatMessage[];
  /** Token threshold that triggers compaction. */
  maxTokens: number;
  /** Number of recent messages to preserve verbatim. */
  keepRecentCount: number;
  /** Optional custom prompt for summary generation. */
  summaryPrompt?: string;
  /** Optional LLM client for AI-based summarization. */
  llmClient?: AIClient | null;
  /** Model to use for LLM summarization. */
  model?: string;
  /** System prompt for the summarizer. */
  systemPrompt?: string;
}

/**
 * Result of a compaction operation.
 */
export interface CompactionResult {
  /** The compacted message list (or original if no compaction occurred). */
  messages: ChatMessage[];
  /** Whether compaction was actually performed. */
  wasCompacted: true | false;
  /** Estimated token count before compaction. */
  estimatedTokensBefore: number;
  /** Estimated token count after compaction. */
  estimatedTokensAfter: number;
  /** Whether LLM summarization was used (vs text concatenation). */
  usedLLM?: boolean;
}

/**
 * Configuration for compaction behavior.
 */
export interface CompactionConfig {
  /** Default number of recent messages to preserve. */
  readonly defaultKeepRecentCount: number;
  /** Percentage of model context window that triggers compaction. */
  readonly compactionThresholdRatio: number;
  /** Maximum tokens to allocate for LLM summarization. */
  readonly maxSummaryTokens: number;
}

/** Default compaction configuration. */
export const DEFAULT_COMPACT_CONFIG: CompactionConfig = {
  defaultKeepRecentCount: 6,
  compactionThresholdRatio: 0.8, // 80% of context
  maxSummaryTokens: 2000,
};

// ============================================================================
// CONVERSATION COMPACTOR
// ============================================================================

/**
 * Compacts conversation history when token estimate exceeds threshold.
 *
 * Uses a simple heuristic: characters / 4 ≈ tokens. This is not perfectly
 * accurate but sufficient for triggering compaction before hitting actual
 * API limits.
 *
 * When compaction is triggered:
 * 1. Split messages at (length - keepRecentCount)
 * 2. If LLM client provided: generate AI summary of prefix
 * 3. Otherwise: build text summary from prefix
 * 4. Replace prefix with a single summary message
 * 5. Keep recent messages verbatim
 */
export class ConversationCompactor {
  /** Average characters per token for estimation (conservative). */
  private static readonly CHARS_PER_TOKEN = 4;

  constructor(private readonly config: Partial<CompactionConfig> = {}) {}

  private get cfg(): CompactionConfig {
    return { ...DEFAULT_COMPACT_CONFIG, ...this.config };
  }

  /**
   * Estimate token count for a list of messages.
   *
   * Counts all text content in messages and divides by CHARS_PER_TOKEN.
   * This is a heuristic — actual tokenization varies by model/vendor.
   *
   * @param messages - The messages to estimate
   * @returns Estimated token count
   */
  estimateTokens(messages: ChatMessage[]): number {
    let totalChars = 0;

    for (const msg of messages) {
      if (typeof msg.content === 'string') {
        totalChars += msg.content.length;
      } else if (Array.isArray(msg.content)) {
        for (const block of msg.content) {
          if ('text' in block) {
            totalChars += block.text.length;
          }
          if ('content' in block && typeof block.content === 'string') {
            totalChars += block.content.length;
          }
        }
      }
    }

    return Math.ceil(totalChars / ConversationCompactor.CHARS_PER_TOKEN);
  }

  /**
   * Calculate the compaction threshold for a given model context window.
   *
   * @param modelContextWindow - The model's context window size
   * @returns Token count that should trigger compaction
   */
  getCompactionThreshold(modelContextWindow: number): number {
    return Math.floor(modelContextWindow * this.cfg.compactionThresholdRatio);
  }

  /**
   * Compact messages if token count exceeds threshold.
   *
   * @param params - Compaction parameters
   * @returns Compaction result with potentially compacted messages
   */
  async compact(params: CompactionParams): Promise<CompactionResult> {
    const {
      messages,
      maxTokens,
      keepRecentCount = this.cfg.defaultKeepRecentCount,
      llmClient,
      model,
      systemPrompt,
    } = params;

    const estimatedTokens = this.estimateTokens(messages);

    // No compaction needed — under threshold
    if (estimatedTokens <= maxTokens) {
      return {
        messages,
        wasCompacted: false,
        estimatedTokensBefore: estimatedTokens,
        estimatedTokensAfter: estimatedTokens,
        usedLLM: false,
      };
    }

    // Can't compact — not enough messages to split
    if (messages.length <= keepRecentCount) {
      return {
        messages,
        wasCompacted: false,
        estimatedTokensBefore: estimatedTokens,
        estimatedTokensAfter: estimatedTokens,
        usedLLM: false,
      };
    }

    // Split: prefix to summarize, recent messages to keep
    const splitIndex = messages.length - keepRecentCount;
    const prefixMessages = messages.slice(0, splitIndex);
    const recentMessages = messages.slice(splitIndex);

    // Build summary from prefix (LLM if available, otherwise text concatenation)
    let summaryText: string;
    let usedLLM = false;

    if (llmClient && model) {
      try {
        summaryText = await this.generateLLMSummary(
          prefixMessages,
          llmClient,
          model,
          systemPrompt,
        );
        usedLLM = true;
      } catch (error) {
        // LLM failed, fall back to text summarization
        summaryText = this.buildTextSummary(prefixMessages);
        usedLLM = false;
      }
    } else {
      summaryText = this.buildTextSummary(prefixMessages);
      usedLLM = false;
    }

    const summaryMessage: ChatMessage = {
      role: 'user',
      content: `[Conversation summary — earlier messages compacted]\n${summaryText}`,
    };

    const compactedMessages = [summaryMessage, ...recentMessages];

    return {
      messages: compactedMessages,
      wasCompacted: true,
      estimatedTokensBefore: estimatedTokens,
      estimatedTokensAfter: this.estimateTokens(compactedMessages),
      usedLLM,
    };
  }

  /**
   * Generate an AI summary using the LLM.
   *
   * @param messages - Messages to summarize
   * @param client - AI client to use
   * @param model - Model identifier
   * @param systemPrompt - Optional system prompt
   * @returns Generated summary text
   */
  private async generateLLMSummary(
    messages: ChatMessage[],
    client: AIClient,
    model: string,
    systemPrompt?: string,
  ): Promise<string> {
    const summaryPrompt = systemPrompt ||
      'You are a helpful assistant that summarizes conversations concisely. ' +
      'Summarize the key points, decisions made, and important context. ' +
      'Keep the summary brief and focused on information needed to continue the conversation.';

    // Convert messages to format expected by AIClient
    const messagesToSummarize: ChatMessage[] = [
      {
        role: 'user',
        content: 'Please summarize the following conversation:\n\n' +
          this.buildTextSummary(messages),
      },
    ];

    const result = await client.streamChat({
      model,
      messages: messagesToSummarize,
      tools: [],
      systemPrompt: summaryPrompt,
      maxTokens: this.cfg.maxSummaryTokens,
      onEvent: () => {}, // Ignore streaming events for summary
    });

    // Extract text from content blocks
    return this.extractTextFromContent(result.content);
  }

  /**
   * Build a text summary from a list of messages (fallback method).
   *
   * Extracts key content from each message, truncating to 500 chars
   * per message to keep the summary manageable.
   *
   * @param messages - Messages to summarize
   * @returns Text summary with role prefixes
   */
  private buildTextSummary(messages: ChatMessage[]): string {
    const parts: string[] = [];

    for (const msg of messages) {
      const role = msg.role;
      let text = '';

      if (typeof msg.content === 'string') {
        text = msg.content;
      } else if (Array.isArray(msg.content)) {
        // Filter for TextContent blocks only
        const textBlocks = msg.content.filter(
          (b): b is { type: 'text'; text: string } => b.type === 'text'
        );
        text = textBlocks.map(b => b.text).join(' ');
      }

      if (text) {
        // Truncate to keep summary manageable
        const truncated = text.length > 500 ? text.slice(0, 500) + '...' : text;
        parts.push(`${role}: ${truncated}`);
      }
    }

    return parts.join('\n');
  }

  /**
   * Extract text content from ContentBlock array.
   */
  private extractTextFromContent(content: ChatMessage['content']): string {
    if (typeof content === 'string') {
      return content;
    }

    return content
      .filter((b): b is { type: 'text'; text: string } => b.type === 'text')
      .map(b => b.text)
      .join(' ');
  }
}

// ============================================================================
// EXPORTS
// ============================================================================

export default ConversationCompactor;
