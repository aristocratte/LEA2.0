/**
 * @module core/memory/token-counter
 * @description Shared token estimation utility for LEA's memory system.
 *
 * Uses a simple heuristic: characters / CHARS_PER_TOKEN ≈ tokens.
 * This is intentionally not a perfect tokenizer — it provides a fast,
 * consistent estimate sufficient for compaction threshold decisions.
 *
 * Used by:
 * - ConversationCompactor (core/runtime)
 * - SessionMemoryStore (core/memory)
 * - CompactionStrategy (core/memory)
 * - ContextCompactionService (services/context)
 */

import type { ChatMessage } from '../../services/ai/AIClient.js';

// ============================================================================
// CONSTANTS
// ============================================================================

/**
 * Average characters per token for estimation.
 *
 * Conservative estimate based on English text with mixed code.
 * Actual tokenization varies by model (BPE, WordPiece, etc.) but
 * this heuristic is stable enough for threshold decisions.
 *
 * claude-code uses the same ratio (chars / 4).
 */
export const CHARS_PER_TOKEN = 4;

// ============================================================================
// ESTIMATION FUNCTIONS
// ============================================================================

/**
 * Estimate token count for a plain text string.
 *
 * @param text - The text to estimate
 * @returns Estimated token count (always >= 1 for non-empty text)
 */
export function estimateTokensForText(text: string): number {
  if (!text) return 0;
  return Math.ceil(Math.max(0, text.length) / CHARS_PER_TOKEN);
}

/**
 * Estimate token count for a single ChatMessage.
 *
 * Handles both string content and ContentBlock arrays.
 * Counts text from: TextContent.text, ToolResultContent.content,
 * and JSON-serialized tool inputs.
 *
 * @param message - The ChatMessage to estimate
 * @returns Estimated token count
 */
export function estimateTokensForMessage(message: ChatMessage): number {
  let totalChars = 0;

  if (typeof message.content === 'string') {
    totalChars += message.content.length;
  } else if (Array.isArray(message.content)) {
    for (const block of message.content) {
      if ('text' in block) {
        totalChars += block.text.length;
      }
      if ('content' in block && typeof block.content === 'string') {
        totalChars += block.content.length;
      }
      // Tool use inputs contribute tokens too
      if ('input' in block && typeof block.input === 'object') {
        totalChars += JSON.stringify(block.input).length;
      }
    }
  }

  return Math.ceil(totalChars / CHARS_PER_TOKEN);
}

/**
 * Estimate total token count for a list of ChatMessages.
 *
 * @param messages - The messages to estimate
 * @returns Total estimated token count
 */
export function estimateTokensForMessages(messages: ChatMessage[]): number {
  let total = 0;
  for (const msg of messages) {
    total += estimateTokensForMessage(msg);
  }
  return total;
}

/**
 * Estimate tokens for a simple role/content message pair.
 *
 * Used by AgentRunner's internal message format
 * (Array<{ role: string; content: string }>).
 *
 * @param messages - Simple messages with role and content
 * @returns Total estimated token count
 */
export function estimateTokensForSimpleMessages(
  messages: Array<{ role: string; content: string }>,
): number {
  let total = 0;
  for (const msg of messages) {
    total += estimateTokensForText(msg.content);
    // Role overhead (role label + formatting)
    total += 2;
  }
  return total;
}
