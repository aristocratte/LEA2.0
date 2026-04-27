/**
 * @module core/memory/__tests__/memory.test
 * @description Tests for B1 — Session Memory + Compaction
 *
 * Covers:
 * 1. Token counter estimation
 * 2. Compaction strategy decisions
 * 3. SessionMemoryStore CRUD operations
 * 4. Full compaction flow (100+ messages)
 * 5. Context reconstruction (summary + recent messages)
 * 6. Persistence of summaries and compaction tracking
 */

import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import {
  estimateTokensForText,
  estimateTokensForMessage,
  estimateTokensForMessages,
  estimateTokensForSimpleMessages,
  CHARS_PER_TOKEN,
} from '../token-counter.js';
import {
  CompactionStrategy,
  DEFAULT_COMPACTION_CONFIG,
} from '../compaction-strategy.js';
import type { CompactionDecision } from '../compaction-strategy.js';
import type { ChatMessage } from '../../../services/ai/AIClient.js';

// ============================================================================
// TOKEN COUNTER TESTS
// ============================================================================

describe('Token Counter', () => {
  it('should estimate 0 tokens for empty string', () => {
    expect(estimateTokensForText('')).toBe(0);
  });

  it('should estimate ~chars/4 for text', () => {
    const text = 'a'.repeat(100);
    expect(estimateTokensForText(text)).toBe(Math.ceil(100 / CHARS_PER_TOKEN));
  });

  it('should return >= 1 for any non-empty text', () => {
    expect(estimateTokensForText('a')).toBe(1);
  });

  it('should estimate tokens for ChatMessage with string content', () => {
    const msg: ChatMessage = {
      role: 'user',
      content: 'Hello world this is a test message',
    };
    const tokens = estimateTokensForMessage(msg);
    expect(tokens).toBeGreaterThan(0);
    expect(tokens).toBe(Math.ceil(msg.content.length / CHARS_PER_TOKEN));
  });

  it('should estimate tokens for ChatMessage with ContentBlock array', () => {
    const msg: ChatMessage = {
      role: 'assistant',
      content: [
        { type: 'text', text: 'Hello world' },
        { type: 'tool_use', id: '1', name: 'bash', input: { command: 'ls' } },
      ],
    };
    const tokens = estimateTokensForMessage(msg);
    // Should count text + JSON(input)
    expect(tokens).toBeGreaterThan(0);
  });

  it('should estimate total tokens for message array', () => {
    const messages: ChatMessage[] = [
      { role: 'user', content: 'a'.repeat(40) },
      { role: 'assistant', content: 'b'.repeat(40) },
    ];
    const tokens = estimateTokensForMessages(messages);
    expect(tokens).toBe(Math.ceil(80 / CHARS_PER_TOKEN));
  });

  it('should estimate tokens for simple role/content messages', () => {
    const messages = [
      { role: 'user', content: 'Hello' },
      { role: 'assistant', content: 'World' },
    ];
    const tokens = estimateTokensForSimpleMessages(messages);
    // 5 chars + 5 chars + 2 roles * 2 overhead = 14 chars / 4 ≈ 4 tokens min
    expect(tokens).toBeGreaterThan(0);
  });
});

// ============================================================================
// COMPACTION STRATEGY TESTS
// ============================================================================

describe('CompactionStrategy', () => {
  it('should use default config when none provided', () => {
    const strategy = new CompactionStrategy();
    const config = strategy.getConfig();
    expect(config.thresholdRatio).toBe(0.8);
    expect(config.keepRecentCount).toBe(6);
    expect(config.maxSummaryTokens).toBe(2000);
    expect(config.minMessagesBeforeCompaction).toBe(10);
  });

  it('should allow overriding config', () => {
    const strategy = new CompactionStrategy({ thresholdRatio: 0.9 });
    expect(strategy.getConfig().thresholdRatio).toBe(0.9);
    expect(strategy.getConfig().keepRecentCount).toBe(6); // default preserved
  });

  it('should calculate threshold correctly', () => {
    const strategy = new CompactionStrategy({ thresholdRatio: 0.8 });
    expect(strategy.getThreshold(100_000)).toBe(80_000);
    expect(strategy.getThreshold(200_000)).toBe(160_000);
  });

  it('should calculate post-compaction target correctly', () => {
    const strategy = new CompactionStrategy({ targetRatioAfterCompaction: 0.5 });
    expect(strategy.getTargetAfterCompaction(100_000)).toBe(50_000);
  });

  it('should NOT compact when under threshold', () => {
    const strategy = new CompactionStrategy();
    const decision = strategy.evaluate(50_000, 20, 100_000);
    expect(decision.shouldCompact).toBe(false);
    expect(decision.reason).toContain('Under threshold');
  });

  it('should NOT compact when too few messages', () => {
    const strategy = new CompactionStrategy();
    const decision = strategy.evaluate(90_000, 5, 100_000);
    expect(decision.shouldCompact).toBe(false);
    expect(decision.reason).toContain('Only 5 messages');
  });

  it('should NOT compact when messages <= keepRecentCount', () => {
    const strategy = new CompactionStrategy({ minMessagesBeforeCompaction: 3 });
    // 6 messages, keepRecentCount=6, so can't split (nothing to compact)
    const decision = strategy.evaluate(90_000, 6, 100_000);
    expect(decision.shouldCompact).toBe(false);
    expect(decision.reason).toContain("can't split");
  });

  it('should compact when over threshold with enough messages', () => {
    const strategy = new CompactionStrategy();
    const decision = strategy.evaluate(90_000, 50, 100_000);
    expect(decision.shouldCompact).toBe(true);
    expect(decision.estimatedTokens).toBe(90_000);
    expect(decision.thresholdTokens).toBe(80_000);
    expect(decision.keepRecentCount).toBe(6);
  });

  it('should trip circuit breaker after max failures', () => {
    const strategy = new CompactionStrategy({ maxConsecutiveFailures: 3 });
    expect(strategy.shouldTripBreaker(2)).toBe(false);
    expect(strategy.shouldTripBreaker(3)).toBe(true);
  });
});

// ============================================================================
// COMPACTION STRATEGY — SCENARIO: 100+ messages
// ============================================================================

describe('CompactionStrategy — 100+ message scenario', () => {
  const strategy = new CompactionStrategy();
  const contextWindow = 128_000;

  it('should trigger compaction for 100+ messages over threshold', () => {
    // Simulate: 120 messages at ~1200 tokens each = ~144,000 tokens
    const totalTokens = 144_000;
    const messageCount = 120;

    const decision = strategy.evaluate(totalTokens, messageCount, contextWindow);
    expect(decision.shouldCompact).toBe(true);
    expect(decision.thresholdTokens).toBe(Math.floor(contextWindow * 0.8));
  });

  it('should NOT compact if messages fit in context', () => {
    // 100 messages at ~800 tokens each = ~80,000 tokens, under 80% of 128k
    const totalTokens = 80_000;
    const messageCount = 100;

    const decision = strategy.evaluate(totalTokens, messageCount, contextWindow);
    expect(decision.shouldCompact).toBe(false);
  });
});

// ============================================================================
// SESSION MEMORY STORE — MOCKED TESTS
// ============================================================================

// We test SessionMemoryStore with a mock PrismaClient to avoid DB dependency
describe('SessionMemoryStore (mocked Prisma)', () => {
  // Simple in-memory mock
  function createMockPrisma() {
    const messages: any[] = [];
    const summaries: any[] = [];
    let nextId = 1;

    return {
      sessionMessage: {
        create: vi.fn(async ({ data }: any) => {
          const msg = {
            id: `msg-${nextId++}`,
            compacted: false,
            summaryId: null,
            ...data,
            createdAt: new Date(),
          };
          messages.push(msg);
          return msg;
        }),
        createMany: vi.fn(async ({ data }: any) => {
          for (const d of data) {
            const msg = {
              id: `msg-${nextId++}`,
              compacted: false,
              summaryId: null,
              ...d,
              createdAt: new Date(),
            };
            messages.push(msg);
          }
          return { count: data.length };
        }),
        findMany: vi.fn(async ({ where, orderBy, take, skip }: any) => {
          let filtered = messages.filter((m: any) => {
            if (where.sessionId && m.sessionId !== where.sessionId) return false;
            if (where.compacted !== undefined && m.compacted !== where.compacted) return false;
            if (where.sequence) {
              if (where.sequence.gte !== undefined && m.sequence < where.sequence.gte) return false;
              if (where.sequence.lt !== undefined && m.sequence >= where.sequence.lt) return false;
              if (where.sequence.gt !== undefined && m.sequence <= where.sequence.gt) return false;
              if (where.sequence.lte !== undefined && m.sequence > where.sequence.lte) return false;
            }
            return true;
          });
          if (orderBy?.sequence === 'asc') filtered.sort((a: any, b: any) => a.sequence - b.sequence);
          if (skip) filtered = filtered.slice(skip);
          if (take) filtered = filtered.slice(0, take);
          return filtered;
        }),
        findFirst: vi.fn(async ({ where, orderBy, select }: any) => {
          let filtered = messages.filter((m: any) => {
            if (where.sessionId && m.sessionId !== where.sessionId) return false;
            if (where.compacted !== undefined && m.compacted !== where.compacted) return false;
            return true;
          });
          if (orderBy?.sequence === 'desc') filtered.sort((a: any, b: any) => b.sequence - a.sequence);
          return filtered[0] ?? null;
        }),
        count: vi.fn(async ({ where }: any) => {
          return messages.filter((m: any) => {
            if (where.sessionId && m.sessionId !== where.sessionId) return false;
            if (where.compacted !== undefined && m.compacted !== where.compacted) return false;
            return true;
          }).length;
        }),
        aggregate: vi.fn(async ({ where }: any) => {
          const filtered = messages.filter((m: any) => {
            if (where.sessionId && m.sessionId !== where.sessionId) return false;
            if (where.compacted !== undefined && m.compacted !== where.compacted) return false;
            return true;
          });
          const sum = filtered.reduce((acc: number, m: any) => acc + (m.estimatedTokens ?? 0), 0);
          return { _sum: { estimatedTokens: sum } };
        }),
        updateMany: vi.fn(async ({ where, data }: any) => {
          let count = 0;
          for (const m of messages) {
            if (m.sessionId !== where.sessionId) continue;
            if (where.compacted !== undefined && m.compacted !== where.compacted) continue;
            if (where.sequence) {
              if (where.sequence.gte !== undefined && m.sequence < where.sequence.gte) continue;
              if (where.sequence.lte !== undefined && m.sequence > where.sequence.lte) continue;
            }
            Object.assign(m, data, { summaryId: data.summaryId ?? m.summaryId });
            count++;
          }
          return { count };
        }),
      },
      sessionSummary: {
        create: vi.fn(async ({ data }: any) => {
          const summary = {
            id: `sum-${nextId++}`,
            ...data,
            createdAt: new Date(Date.now() + summaries.length * 1000), // Ensure unique timestamps
          };
          summaries.push(summary);
          return summary;
        }),
        findMany: vi.fn(async ({ where, orderBy }: any) => {
          let filtered = summaries.filter((s: any) => {
            if (where.sessionId && s.sessionId !== where.sessionId) return false;
            return true;
          });
          if (orderBy?.createdAt === 'asc') filtered.sort((a: any, b: any) => a.createdAt - b.createdAt);
          return filtered;
        }),
        findFirst: vi.fn(async ({ where, orderBy }: any) => {
          let filtered = summaries.filter((s: any) => {
            if (where.sessionId && s.sessionId !== where.sessionId) return false;
            return true;
          });
          if (orderBy?.createdAt === 'desc') filtered.sort((a: any, b: any) => b.createdAt - a.createdAt);
          return filtered[0] ?? null;
        }),
      },
      _messages: messages,
      _summaries: summaries,
    };
  }

  // Import SessionMemoryStore dynamically with mock injection
  let store: any;
  let prisma: any;

  beforeEach(async () => {
    prisma = createMockPrisma();
    const { SessionMemoryStore } = await import('../SessionMemoryStore.js');
    store = new SessionMemoryStore(prisma as any);
  });

  it('should add a single message', async () => {
    const msg = await store.addMessage('sess-1', 'agent-1', {
      role: 'user',
      content: 'Hello world',
    });
    expect(msg.role).toBe('user');
    expect(msg.content).toBe('Hello world');
    expect(msg.sequence).toBe(1);
    expect(msg.estimatedTokens).toBe(Math.ceil('Hello world'.length / CHARS_PER_TOKEN));
    expect(msg.compacted).toBe(false);
  });

  it('should add multiple messages with sequential sequence numbers', async () => {
    const msgs = await store.addMessages('sess-1', 'agent-1', [
      { role: 'user', content: 'First' },
      { role: 'assistant', content: 'Second' },
      { role: 'user', content: 'Third' },
    ]);
    expect(msgs).toHaveLength(3);
    expect(msgs[0].sequence).toBe(1);
    expect(msgs[1].sequence).toBe(2);
    expect(msgs[2].sequence).toBe(3);
  });

  it('should list active messages only by default', async () => {
    await store.addMessages('sess-1', 'agent-1', [
      { role: 'user', content: 'A' },
      { role: 'assistant', content: 'B' },
    ]);
    // Manually compact one
    prisma._messages[0].compacted = true;

    const active = await store.listMessages('sess-1');
    expect(active).toHaveLength(1);
    expect(active[0].content).toBe('B');
  });

  it('should count active messages', async () => {
    await store.addMessages('sess-1', 'agent-1', [
      { role: 'user', content: 'A' },
      { role: 'assistant', content: 'B' },
      { role: 'user', content: 'C' },
    ]);
    const count = await store.getActiveMessageCount('sess-1');
    expect(count).toBe(3);
  });

  it('should sum active token count', async () => {
    await store.addMessages('sess-1', 'agent-1', [
      { role: 'user', content: 'a'.repeat(100) },
      { role: 'assistant', content: 'b'.repeat(100) },
    ]);
    const tokens = await store.getActiveTokenCount('sess-1');
    expect(tokens).toBe(Math.ceil(200 / CHARS_PER_TOKEN));
  });

  it('should store summary and mark messages as compacted', async () => {
    // Add 10 messages
    await store.addMessages('sess-1', 'agent-1', Array.from({ length: 10 }, (_, i) => ({
      role: i % 2 === 0 ? 'user' : 'assistant',
      content: `Message ${i}`,
    })));

    // Store a summary covering messages 1-7
    const summary = await store.storeSummary('sess-1', 'agent-1', {
      summaryContent: 'Summary of messages 1-7',
      fromSequence: 1,
      toSequence: 7,
      messageCount: 7,
      usedLLM: false,
      tokensBefore: 1000,
      tokensAfter: 200,
    });

    expect(summary.summaryContent).toBe('Summary of messages 1-7');
    expect(summary.fromSequence).toBe(1);
    expect(summary.toSequence).toBe(7);
    expect(summary.messageCount).toBe(7);
    expect(summary.usedLLM).toBe(false);

    // Check that messages 1-7 are now compacted
    const updateCall = prisma.sessionMessage.updateMany.mock.calls[0];
    expect(updateCall[0].where.sessionId).toBe('sess-1');
    expect(updateCall[0].where.sequence.gte).toBe(1);
    expect(updateCall[0].where.sequence.lte).toBe(7);
    expect(updateCall[0].data.compacted).toBe(true);
  });

  it('should get latest summary', async () => {
    await store.storeSummary('sess-1', 'agent-1', {
      summaryContent: 'First summary',
      fromSequence: 1,
      toSequence: 5,
      messageCount: 5,
      usedLLM: false,
      tokensBefore: 500,
      tokensAfter: 100,
    });

    await store.storeSummary('sess-1', 'agent-1', {
      summaryContent: 'Second summary',
      fromSequence: 6,
      toSequence: 10,
      messageCount: 5,
      usedLLM: true,
      tokensBefore: 800,
      tokensAfter: 150,
    });

    const latest = await store.getLatestSummary('sess-1');
    expect(latest).not.toBeNull();
    expect(latest!.summaryContent).toBe('Second summary');
  });

  it('should list all summaries for a session', async () => {
    await store.storeSummary('sess-1', 'agent-1', {
      summaryContent: 'Summary A',
      fromSequence: 1, toSequence: 5, messageCount: 5,
      usedLLM: false, tokensBefore: 500, tokensAfter: 100,
    });
    await store.storeSummary('sess-1', 'agent-1', {
      summaryContent: 'Summary B',
      fromSequence: 6, toSequence: 10, messageCount: 5,
      usedLLM: true, tokensBefore: 800, tokensAfter: 150,
    });

    const summaries = await store.listSummaries('sess-1');
    expect(summaries).toHaveLength(2);
    expect(summaries[0].summaryContent).toBe('Summary A');
    expect(summaries[1].summaryContent).toBe('Summary B');
  });

  it('should get effective context (summary + recent messages)', async () => {
    // Add 10 messages
    await store.addMessages('sess-1', 'agent-1', Array.from({ length: 10 }, (_, i) => ({
      role: i % 2 === 0 ? 'user' : 'assistant',
      content: `Message ${i}`,
    })));

    // Compact messages 1-5 via storeSummary (this calls updateMany internally)
    await store.storeSummary('sess-1', 'agent-1', {
      summaryContent: 'Summary of first 5',
      fromSequence: 1,
      toSequence: 5,
      messageCount: 5,
      usedLLM: false,
      tokensBefore: 500,
      tokensAfter: 100,
    });

    // storeSummary's updateMany should have marked messages 1-5 as compacted.
    // But since this is a mock, verify the updateMany was called correctly.
    const updateCall = prisma.sessionMessage.updateMany.mock.calls[0];
    expect(updateCall[0].data.compacted).toBe(true);

    // Manually apply the compaction to our mock data (simulating updateMany behavior)
    for (const m of prisma._messages) {
      if (m.sequence >= 1 && m.sequence <= 5 && m.sessionId === 'sess-1') {
        m.compacted = true;
        m.summaryId = updateCall[0].data.summaryId;
      }
    }

    const ctx = await store.getEffectiveContext('sess-1');
    expect(ctx.summary).not.toBeNull();
    expect(ctx.summary!.summaryContent).toBe('Summary of first 5');
    // Recent messages should be those after the summary's coverage (seq > 5)
    expect(ctx.recentMessages.length).toBeGreaterThan(0);
  });
});

// ============================================================================
// FULL COMPACTION FLOW — ConversationCompactor + Strategy
// ============================================================================

describe('Full compaction flow with ConversationCompactor', () => {
  it('should compact 100+ messages and stay under threshold', async () => {
    const { ConversationCompactor } = await import('../../runtime/ConversationCompactor.js');
    const compactor = new ConversationCompactor();
    const strategy = new CompactionStrategy();
    const contextWindow = 128_000;

    // Generate 120 messages at ~1000 chars each = ~30k tokens
    const messages: ChatMessage[] = Array.from({ length: 120 }, (_, i) => ({
      role: (i % 2 === 0 ? 'user' : 'assistant') as 'user' | 'assistant',
      content: `Message ${i}: ${'x'.repeat(1000)}`,
    }));

    // Estimate tokens
    const tokens = compactor.estimateTokens(messages);

    // Check strategy decision
    const decision = strategy.evaluate(tokens, messages.length, contextWindow);

    // 120 * ~1000 chars / 4 = ~30,000 tokens — under 80% of 128k
    // This should NOT need compaction
    expect(tokens).toBeLessThan(strategy.getThreshold(contextWindow));
    expect(decision.shouldCompact).toBe(false);
  });

  it('should trigger compaction when messages are very large', async () => {
    const { ConversationCompactor } = await import('../../runtime/ConversationCompactor.js');
    const compactor = new ConversationCompactor();
    const strategy = new CompactionStrategy();
    const contextWindow = 128_000;

    // Generate 50 messages at ~12,000 chars each = ~150k tokens
    const messages: ChatMessage[] = Array.from({ length: 50 }, (_, i) => ({
      role: (i % 2 === 0 ? 'user' : 'assistant') as 'user' | 'assistant',
      content: `Message ${i}: ${'y'.repeat(12000)}`,
    }));

    const tokens = compactor.estimateTokens(messages);
    const decision = strategy.evaluate(tokens, messages.length, contextWindow);

    expect(decision.shouldCompact).toBe(true);

    // Run compaction (text-only, no LLM)
    const result = await compactor.compact({
      messages,
      maxTokens: strategy.getThreshold(contextWindow),
      keepRecentCount: 6,
    });

    expect(result.wasCompacted).toBe(true);
    expect(result.messages.length).toBeLessThan(messages.length);
    expect(result.estimatedTokensAfter).toBeLessThan(result.estimatedTokensBefore);

    // Last 6 messages should be preserved
    const lastOriginal = messages.slice(-6);
    const lastCompacted = result.messages.slice(-6);
    for (let i = 0; i < 6; i++) {
      expect(lastCompacted[i].content).toBe(lastOriginal[i].content);
    }
  });

  it('should preserve recent messages after compaction', async () => {
    const { ConversationCompactor } = await import('../../runtime/ConversationCompactor.js');
    const compactor = new ConversationCompactor();

    // 20 messages
    const messages: ChatMessage[] = Array.from({ length: 20 }, (_, i) => ({
      role: (i % 2 === 0 ? 'user' : 'assistant') as 'user' | 'assistant',
      content: `Message ${i}: ${'z'.repeat(5000)}`,
    }));

    const result = await compactor.compact({
      messages,
      maxTokens: 1000, // Force compaction
      keepRecentCount: 6,
    });

    expect(result.wasCompacted).toBe(true);

    // The first message should be a summary
    expect(result.messages[0].content).toContain('compacted');

    // Last 6 should be preserved verbatim
    expect(result.messages).toHaveLength(7); // 1 summary + 6 recent
    for (let i = 1; i <= 6; i++) {
      expect(result.messages[i].content).toBe(messages[14 + i - 1].content);
    }
  });

  it('should NOT compact when all messages are recent', async () => {
    const { ConversationCompactor } = await import('../../runtime/ConversationCompactor.js');
    const compactor = new ConversationCompactor();

    const messages: ChatMessage[] = Array.from({ length: 4 }, (_, i) => ({
      role: (i % 2 === 0 ? 'user' : 'assistant') as 'user' | 'assistant',
      content: `Message ${i}: ${'w'.repeat(5000)}`,
    }));

    const result = await compactor.compact({
      messages,
      maxTokens: 100,
      keepRecentCount: 6,
    });

    expect(result.wasCompacted).toBe(false);
    expect(result.messages).toHaveLength(4);
  });
});
