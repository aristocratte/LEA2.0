import type { ActivityFeedItem, MainThreadItem, ReviewPaneData } from '@/hooks/use-swarm-store';

export interface ProjectionAssertionResult {
  rule: string;
  passed: boolean;
  details?: string;
}

interface ProjectionInput {
  mainThreadItems: MainThreadItem[];
  activityFeed: ActivityFeedItem[];
  reviewPaneData: Record<string, ReviewPaneData>;
}

export function validateMainThreadItems(mainThreadItems: MainThreadItem[]): ProjectionAssertionResult[] {
  const threadNoise = mainThreadItems.filter((item) =>
    item.content.toLowerCase().includes('stdout') ||
    item.content.toLowerCase().includes('stderr') ||
    item.content.toLowerCase().includes('curl ') ||
    item.content.toLowerCase().includes('jsonrpc'),
  );

  const thinkingItems = mainThreadItems.filter((item) => item.type === 'thinking_summary');

  return [
    {
      rule: 'center_thread_calm',
      passed: threadNoise.length === 0,
      details: `${threadNoise.length} raw technical items found in main thread`,
    },
    {
      rule: 'center_thread_sparse',
      passed: mainThreadItems.length <= 8,
      details: `${mainThreadItems.length} main thread items`,
    },
    {
      rule: 'thinking_summary_compact',
      passed: thinkingItems.every((item) => item.content.length <= 500),
      details: `${thinkingItems.length} thinking summaries checked`,
    },
  ];
}

export function validateActivityFeed(activityFeed: ActivityFeedItem[]): ProjectionAssertionResult[] {
  const conversationalLeak = activityFeed.filter((item) =>
    /operator voice|approval received|approval denied/i.test(item.content),
  );

  return [
    {
      rule: 'activity_feed_compact',
      passed: activityFeed.length <= 12,
      details: `${activityFeed.length} activity items`,
    },
    {
      rule: 'activity_feed_secondary',
      passed: conversationalLeak.length === 0,
      details: `${conversationalLeak.length} conversational items leaked into activity feed`,
    },
  ];
}

export function validateReviewPaneData(
  activityFeed: ActivityFeedItem[],
  reviewPaneData: Record<string, ReviewPaneData>,
): ProjectionAssertionResult[] {
  const reviewIds = new Set(Object.keys(reviewPaneData));
  const orphanedActivity = activityFeed.filter((item) => item.type === 'tool_execution' && !reviewIds.has(item.id));
  const emptyTitles = Object.values(reviewPaneData).filter((item) => !item.title || item.title.trim().length === 0);

  return [
    {
      rule: 'review_linkage',
      passed: orphanedActivity.length === 0,
      details: `${orphanedActivity.length} tool items missing review linkage`,
    },
    {
      rule: 'review_titles_present',
      passed: emptyTitles.length === 0,
      details: `${emptyTitles.length} review entries missing titles`,
    },
  ];
}

export function validateProjectionArtifacts(input: ProjectionInput) {
  return [
    ...validateMainThreadItems(input.mainThreadItems),
    ...validateActivityFeed(input.activityFeed),
    ...validateReviewPaneData(input.activityFeed, input.reviewPaneData),
  ];
}
