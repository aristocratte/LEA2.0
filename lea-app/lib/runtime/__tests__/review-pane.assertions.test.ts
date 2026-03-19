import { describe, expect, it } from 'vitest';
import { validateReviewPaneData } from '@/lib/runtime/projection-assertions';
import type { ActivityFeedItem, ReviewPaneData } from '@/hooks/use-swarm-store';

describe('validateReviewPaneData', () => {
  it('fails when a tool execution lacks review linkage', () => {
    const activityFeed = [
      {
        id: 'tool-httpx',
        type: 'tool_execution',
        status: 'completed',
        content: 'httpx triage sweep',
        timestamp: Date.now(),
      } satisfies ActivityFeedItem,
    ];

    const results = validateReviewPaneData(activityFeed, {});
    expect(results.find((result) => result.rule === 'review_linkage')?.passed).toBe(false);
  });

  it('fails when a review entry is missing a title', () => {
    const reviewPaneData: Record<string, ReviewPaneData> = {
      'tool-httpx': {
        id: 'tool-httpx',
        title: '',
        timestamp: Date.now(),
      },
    };

    const results = validateReviewPaneData([], reviewPaneData);
    expect(results.find((result) => result.rule === 'review_titles_present')?.passed).toBe(false);
  });
});
