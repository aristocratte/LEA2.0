// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { validateMainThreadItems } from '@/lib/runtime/projection-assertions';
import type { MainThreadItem } from '@/hooks/use-swarm-store';

describe('validateMainThreadItems', () => {
  it('flags raw technical noise in the center thread', () => {
    const results = validateMainThreadItems([
      {
        id: '1',
        type: 'assistant_message',
        content: 'curl https://api.example.com returned 200',
        timestamp: Date.now(),
      } satisfies MainThreadItem,
    ]);

    expect(results.find((result) => result.rule === 'center_thread_calm')?.passed).toBe(false);
  });

  it('enforces sparse conversational output', () => {
    const items = Array.from({ length: 9 }, (_, index) => ({
      id: String(index),
      type: 'assistant_message',
      content: `Message ${index}`,
      timestamp: index,
    })) as MainThreadItem[];

    const results = validateMainThreadItems(items);
    expect(results.find((result) => result.rule === 'center_thread_sparse')?.passed).toBe(false);
  });
});
