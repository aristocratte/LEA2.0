import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { expect, type APIRequestContext, type APIResponse, type Page } from '@playwright/test';

export interface TraceMetadata {
  traceId: string;
  pentestId: string;
  mode: string;
  scenarioId?: string;
  status: string;
  storagePath: string;
  eventCount: number;
  createdAt: string;
  completedAt?: string;
  validationPath?: string;
  correlationPath?: string;
  projectionPath?: string;
}

export interface PentestFixture {
  id: string;
  target: string;
}

async function requestWithRetry(
  factory: () => Promise<APIResponse>,
  attempts = 30,
): Promise<APIResponse> {
  let lastResponse: APIResponse | null = null;
  for (let index = 0; index < attempts; index += 1) {
    lastResponse = await factory();
    if (lastResponse.ok()) {
      return lastResponse;
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  if (!lastResponse) {
    throw new Error('No response received');
  }
  return lastResponse;
}

export async function createPentest(
  request: APIRequestContext,
  backendUrl: string,
  target: string,
): Promise<PentestFixture> {
  await requestWithRetry(() => request.get(`${backendUrl}/api/providers`));
  const response = await requestWithRetry(() => request.post(`${backendUrl}/api/pentests`, {
    data: {
      target,
      scope: {},
      config: {
        type: 'quick',
        deepThinkingBudget: 12000,
      },
    },
  }));
  if (!response.ok()) {
    throw new Error(`createPentest failed: ${response.status()} ${await response.text()}`);
  }
  const body = await response.json();
  return {
    id: body.data.id,
    target,
  };
}

export async function startRuntime(
  request: APIRequestContext,
  backendUrl: string,
  pentestId: string,
  runtime: Record<string, unknown>,
) {
  const response = await requestWithRetry(() => request.post(`${backendUrl}/api/pentests/${pentestId}/swarm/start`, {
    data: {
      task: 'Execute dynamic pentest swarm',
      autoPushToSysReptor: false,
      runtime,
    },
  }));
  if (!response.ok()) {
    throw new Error(`startRuntime failed: ${response.status()} ${await response.text()}`);
  }
  return response.json();
}

export async function controlRuntime(
  request: APIRequestContext,
  backendUrl: string,
  pentestId: string,
  payload: Record<string, unknown>,
) {
  const response = await requestWithRetry(() => request.post(`${backendUrl}/api/pentests/${pentestId}/swarm/runtime/control`, {
    data: payload,
  }));
  if (!response.ok()) {
    throw new Error(`controlRuntime failed: ${response.status()} ${await response.text()}`);
  }
  return response.json();
}

export async function waitForTrace(
  request: APIRequestContext,
  backendUrl: string,
  pentestId: string,
  predicate: (trace: TraceMetadata) => boolean = () => true,
  timeoutMs = 20_000,
): Promise<TraceMetadata> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const response = await request.get(`${backendUrl}/api/pentests/${pentestId}/swarm/traces`);
    expect(response.ok()).toBeTruthy();
    const body = await response.json();
    const trace = (body.data as TraceMetadata[]).find(predicate);
    if (trace) return trace;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`Timed out waiting for trace for pentest ${pentestId}`);
}

export async function openPentestShell(page: Page, frontendUrl: string, pentest: PentestFixture) {
  await page.goto(
    `${frontendUrl}/pentest?pentestId=${encodeURIComponent(pentest.id)}&target=${encodeURIComponent(
      pentest.target,
    )}&phase=active`,
  );
}

export async function waitForMainThread(page: Page) {
  await expect(page.getByTestId('swarm-main-thread')).toBeVisible();
  await expect(page.getByTestId('main-thread-item').first()).toBeVisible();
}

export async function emitProjectionArtifacts(page: Page, trace: TraceMetadata) {
  await mkdir(trace.storagePath, { recursive: true });

  const mainThreadSnapshot = await page.locator('[data-testid="main-thread-item"]').evaluateAll((nodes) =>
    nodes.map((node) => ({
      type: (node as HTMLElement).dataset.itemType || null,
      text: (node.textContent || '').replace(/\s+/g, ' ').trim(),
    })),
  );

  const activityFeedSnapshot = await page.locator('[data-testid="activity-row"]').evaluateAll((nodes) =>
    nodes.map((node) => ({
      type: (node as HTMLElement).dataset.itemType || null,
      text: (node.textContent || '').replace(/\s+/g, ' ').trim(),
    })),
  );

  const reviewPaneSnapshot = await page.locator('[data-testid="review-pane-inspector"]').evaluateAll((nodes) =>
    nodes.map((node) => ({
      text: (node.textContent || '').replace(/\s+/g, ' ').trim(),
    })),
  );

  const projectionSummary = {
    mainThreadCount: mainThreadSnapshot.length,
    activityFeedCount: activityFeedSnapshot.length,
    reviewPaneOpen: reviewPaneSnapshot.length > 0,
    centerCalm: mainThreadSnapshot.every((item) => !/(stdout|stderr|curl |jsonrpc)/i.test(item.text)),
    leftRailBounded: activityFeedSnapshot.length <= 12,
  };

  await writeFile(
    resolve(trace.storagePath, 'main-thread.snapshot.json'),
    `${JSON.stringify(mainThreadSnapshot, null, 2)}\n`,
    'utf8',
  );
  await writeFile(
    resolve(trace.storagePath, 'activity-feed.snapshot.json'),
    `${JSON.stringify(activityFeedSnapshot, null, 2)}\n`,
    'utf8',
  );
  await writeFile(
    resolve(trace.storagePath, 'review-pane.snapshot.json'),
    `${JSON.stringify(reviewPaneSnapshot, null, 2)}\n`,
    'utf8',
  );
  await writeFile(
    resolve(trace.storagePath, 'projection-summary.json'),
    `${JSON.stringify(projectionSummary, null, 2)}\n`,
    'utf8',
  );

  return projectionSummary;
}
