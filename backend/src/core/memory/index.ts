/**
 * @module core/memory
 * @description Session memory and compaction system.
 *
 * Provides persistent message storage and compaction for agent sessions.
 */

export { SessionMemoryStore } from './SessionMemoryStore.js';
export type {
  StoreMessageInput,
  StoredMessage,
  StoredSummary,
  ListMessagesOptions,
} from './SessionMemoryStore.js';

export {
  estimateTokensForText,
  estimateTokensForMessage,
  estimateTokensForMessages,
  estimateTokensForSimpleMessages,
  CHARS_PER_TOKEN,
} from './token-counter.js';

export {
  CompactionStrategy,
  DEFAULT_COMPACTION_CONFIG,
} from './compaction-strategy.js';
export type {
  CompactionStrategyConfig,
  CompactionDecision,
} from './compaction-strategy.js';
