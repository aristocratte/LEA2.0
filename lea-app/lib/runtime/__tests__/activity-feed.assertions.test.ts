// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { validateActivityFeed } from '@/lib/runtime/projection-assertions';
import type { ActivityFeedItem } from '@/hooks/use-swarm-store';

describe('validateActivityFeed', () => {
  it('fails when the left rail grows beyond the compact bound', () => {
    const activityFeed = Array.from({ length: 13 }, (_, index) => ({
      id: String(index),
      type: 'agent_lifecycle',
      status: 'running',
      content: `Signal ${index}`,
      timestamp: index,
    })) as ActivityFeedItem[];

    const results = validateActivityFeed(activityFeed);
    expect(results.find((result) => result.rule === 'activity_feed_compact')?.passed).toBe(false);
  });

  it('fails when conversational copy leaks into the activity rail', () => {
    const activityFeed = [
      {
        id: '1',
        type: 'todo',
        status: 'completed',
        content: 'Approval received. I will execute the sensitive probe.',
        timestamp: Date.now(),
      } satisfies ActivityFeedItem,
    ];

    const results = validateActivityFeed(activityFeed);
    expect(results.find((result) => result.rule === 'activity_feed_secondary')?.passed).toBe(false);
  });
});
