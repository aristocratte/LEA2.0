import { describe, expect, it } from 'vitest';
import type { ChatMessage } from '@/components/pentest/chat-messages';
import { mergeChatMessagesForDisplay } from '../chat-message-merge';

describe('mergeChatMessagesForDisplay', () => {
  it('keeps a live message when the next source snapshot no longer contains it', () => {
    const liveMessage: ChatMessage = {
      id: 'live-1',
      type: 'orchestrator',
      content: 'Cloudflare WAF confirmed. Continuing with passive checks.',
      ts: 1000,
    };

    const merged = mergeChatMessagesForDisplay([liveMessage], []);

    expect(merged).toEqual([liveMessage]);
  });

  it('updates streaming messages by id instead of rendering stale partial content', () => {
    const partial: ChatMessage = {
      id: 'stream-1',
      type: 'orchestrator',
      content: 'Running',
      ts: 1000,
    };
    const complete: ChatMessage = {
      id: 'stream-1',
      type: 'orchestrator',
      content: 'Running nmap_scan and collecting the output.',
      ts: 1200,
    };

    const merged = mergeChatMessagesForDisplay([partial], [complete]);

    expect(merged).toHaveLength(1);
    expect(merged[0]).toMatchObject({
      id: 'stream-1',
      content: 'Running nmap_scan and collecting the output.',
      ts: 1000,
    });
  });

  it('deduplicates persisted and live copies with the same content', () => {
    const live: ChatMessage = {
      id: 'live-2',
      type: 'orchestrator',
      content: 'The report is ready for review with four findings.',
      ts: 1000,
    };
    const persisted: ChatMessage = {
      id: 'db-2',
      type: 'orchestrator',
      content: 'The report is ready for review with four findings.',
      ts: 5000,
    };

    const merged = mergeChatMessagesForDisplay([live], [persisted]);

    expect(merged).toHaveLength(1);
    expect(merged[0]).toMatchObject({ content: live.content });
    expect(merged[0].ts).toBe(1000);
  });

  it('keeps genuinely repeated short status messages separate', () => {
    const first: ChatMessage = {
      id: 'status-1',
      type: 'orchestrator',
      content: 'OK',
      ts: 1000,
    };
    const second: ChatMessage = {
      id: 'status-2',
      type: 'orchestrator',
      content: 'OK',
      ts: 2000,
    };

    expect(mergeChatMessagesForDisplay([first], [second])).toHaveLength(2);
  });
});
