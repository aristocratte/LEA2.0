/**
 * Tests for ConversationCompactor
 */

import { describe, it, expect } from 'vitest';
import { ConversationCompactor } from '../ConversationCompactor.js';
import type { ChatMessage } from '../../../services/ai/AIClient.js';

describe('ConversationCompactor', () => {
  const compactor = new ConversationCompactor();

  describe('estimateTokens', () => {
    it('should return 0 for empty array', () => {
      const tokens = compactor.estimateTokens([]);
      expect(tokens).toBe(0);
    });

    it('should estimate tokens for string content messages', () => {
      const messages: ChatMessage[] = [
        { role: 'user', content: 'Hello world!' }, // 12 chars
        { role: 'assistant', content: 'Hi there!' }, // 9 chars
      ];
      const tokens = compactor.estimateTokens(messages);
      // (12 + 9) / 4 = 5.25 -> ceil to 6
      expect(tokens).toBe(6);
    });

    it('should estimate tokens for array content messages with text blocks', () => {
      const messages: ChatMessage[] = [
        {
          role: 'user',
          content: [
            { type: 'text', text: 'This is a longer message' }, // 26 chars
          ],
        },
      ];
      const tokens = compactor.estimateTokens(messages);
      // 26 / 4 = 6.5 -> ceil to 7
      expect(tokens).toBeGreaterThanOrEqual(6);
      expect(tokens).toBeLessThanOrEqual(7);
    });

    it('should handle mixed content blocks', () => {
      const messages: ChatMessage[] = [
        {
          role: 'assistant',
          content: [
            { type: 'text', text: 'Text content' }, // 12 chars
            { type: 'tool_use', id: '123', name: 'test', input: {} }, // no text
          ],
        },
      ];
      const tokens = compactor.estimateTokens(messages);
      // 12 / 4 = 3
      expect(tokens).toBe(3);
    });

    it('should accumulate multiple messages correctly', () => {
      const messages: ChatMessage[] = [
        { role: 'user', content: 'A'.repeat(100) }, // 100 chars
        { role: 'assistant', content: 'B'.repeat(100) }, // 100 chars
        { role: 'user', content: 'C'.repeat(100) }, // 100 chars
      ];
      const tokens = compactor.estimateTokens(messages);
      // 300 / 4 = 75
      expect(tokens).toBe(75);
    });
  });

  describe('compact (without LLM)', () => {
    it('should not compact when under threshold', async () => {
      const messages: ChatMessage[] = [
        { role: 'user', content: 'Short message' },
        { role: 'assistant', content: 'Response' },
      ];

      const result = await compactor.compact({
        messages,
        maxTokens: 1000,
        keepRecentCount: 4,
      });

      expect(result.wasCompacted).toBe(false);
      expect(result.messages).toEqual(messages);
      expect(result.estimatedTokensBefore).toBeLessThan(1000);
      expect(result.estimatedTokensAfter).toBe(result.estimatedTokensBefore);
    });

    it('should compact when over threshold', async () => {
      // Create messages that exceed 100 tokens (~400+ chars)
      const messages: ChatMessage[] = [
        { role: 'user', content: 'A'.repeat(200) }, // ~50 tokens
        { role: 'assistant', content: 'B'.repeat(200) }, // ~50 tokens
        { role: 'user', content: 'Recent message 1' },
        { role: 'assistant', content: 'Recent message 2' },
        { role: 'user', content: 'Recent message 3' },
        { role: 'assistant', content: 'Recent message 4' },
      ];

      const result = await compactor.compact({
        messages,
        maxTokens: 80, // Trigger compaction
        keepRecentCount: 4,
      });

      expect(result.wasCompacted).toBe(true);
      expect(result.messages.length).toBe(5); // 1 summary + 4 recent
      expect(result.messages[0].role).toBe('user');
      expect(result.messages[0].content).toContain('[Conversation summary');
      expect(result.usedLLM).toBe(false);
    });

    it('should keep exact number of recent messages', async () => {
      const messages: ChatMessage[] = [
        { role: 'user', content: 'Msg 1' },
        { role: 'assistant', content: 'Msg 2' },
        { role: 'user', content: 'Msg 3' },
        { role: 'assistant', content: 'Msg 4' },
        { role: 'user', content: 'Msg 5' },
        { role: 'assistant', content: 'Msg 6' },
        { role: 'user', content: 'Msg 7' },
      ];

      const result = await compactor.compact({
        messages,
        maxTokens: 1, // Force compaction
        keepRecentCount: 2,
      });

      expect(result.wasCompacted).toBe(true);
      expect(result.messages.length).toBe(3); // 1 summary + 2 recent
      // Last two messages should be preserved (Msg 6 is assistant, Msg 7 is user)
      expect(result.messages[1]).toEqual({ role: 'assistant', content: 'Msg 6' });
      expect(result.messages[2]).toEqual({ role: 'user', content: 'Msg 7' });
    });

    it('should not compact when too few messages', async () => {
      const messages: ChatMessage[] = [
        { role: 'user', content: 'A'.repeat(500) }, // Would exceed any small threshold
      ];

      const result = await compactor.compact({
        messages,
        maxTokens: 10,
        keepRecentCount: 4,
      });

      // Can't compact — only 1 message, need to keep 4
      expect(result.wasCompacted).toBe(false);
      expect(result.messages).toEqual(messages);
    });

    it('should not compact when message count equals keepRecentCount', async () => {
      const messages: ChatMessage[] = [
        { role: 'user', content: 'Msg 1' },
        { role: 'assistant', content: 'Msg 2' },
        { role: 'user', content: 'Msg 3' },
        { role: 'assistant', content: 'Msg 4' },
      ];

      const result = await compactor.compact({
        messages,
        maxTokens: 1,
        keepRecentCount: 4,
      });

      // Can't compact — 4 messages, need to keep 4 (0 to summarize)
      expect(result.wasCompacted).toBe(false);
    });
  });

  describe('buildTextSummary (via compact output)', () => {
    it('should include role prefixes in summary', async () => {
      const messages: ChatMessage[] = [
        { role: 'user', content: 'User message' },
        { role: 'assistant', content: 'Assistant response' },
        { role: 'user', content: 'Keep this' },
      ];

      const result = await compactor.compact({
        messages,
        maxTokens: 1,
        keepRecentCount: 1,
      });

      const summary = result.messages[0].content as string;
      expect(summary).toContain('user: User message');
      expect(summary).toContain('assistant: Assistant response');
    });

    it('should truncate messages over 500 characters', async () => {
      const longText = 'A'.repeat(600);
      const messages: ChatMessage[] = [
        { role: 'user', content: longText },
        { role: 'assistant', content: 'Keep this' },
      ];

      const result = await compactor.compact({
        messages,
        maxTokens: 1,
        keepRecentCount: 1,
      });

      const summary = result.messages[0].content as string;
      // Should be truncated with ellipsis
      const lines = summary.split('\n');
      const userLine = lines.find(l => l.startsWith('user:'));
      expect(userLine).toBeTruthy();
      expect(userLine!.length).toBeLessThan(700); // Truncated
      expect(userLine).toContain('...');
    });

    it('should handle array content with text blocks', async () => {
      const messages: ChatMessage[] = [
        {
          role: 'assistant',
          content: [
            { type: 'text', text: 'Block 1 text' },
            { type: 'text', text: 'Block 2 text' },
          ],
        },
        { role: 'user', content: 'Keep this' },
      ];

      const result = await compactor.compact({
        messages,
        maxTokens: 1,
        keepRecentCount: 1,
      });

      const summary = result.messages[0].content as string;
      expect(summary).toContain('assistant: Block 1 text Block 2 text');
    });

    it('should skip non-text content blocks gracefully', async () => {
      const messages: ChatMessage[] = [
        {
          role: 'assistant',
          content: [
            { type: 'tool_use', id: '123', name: 'test', input: {} },
            { type: 'text', text: 'Some text' },
          ],
        },
        { role: 'user', content: 'Keep this' },
      ];

      const result = await compactor.compact({
        messages,
        maxTokens: 1,
        keepRecentCount: 1,
      });

      const summary = result.messages[0].content as string;
      expect(summary).toContain('Some text');
      // Should not have 'undefined' or errors from tool_use block
    });
  });

  describe('getCompactionThreshold', () => {
    it('should calculate 80% of context window by default', () => {
      const threshold = compactor.getCompactionThreshold(100000);
      expect(threshold).toBe(80000);
    });

    it('should respect custom config', () => {
      const customCompactor = new ConversationCompactor({
        compactionThresholdRatio: 0.7,
      });
      const threshold = customCompactor.getCompactionThreshold(100000);
      expect(threshold).toBe(70000);
    });
  });
});
