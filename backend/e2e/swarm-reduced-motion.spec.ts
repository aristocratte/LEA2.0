import { expect, test } from '@playwright/test';
import {
  controlRuntime,
  createPentest,
  emitProjectionArtifacts,
  openPentestShell,
  startRuntime,
  waitForMainThread,
  waitForTrace,
} from './helpers/swarmRuntime';

const backendUrl = 'http://127.0.0.1:3301';
const frontendUrl = 'http://127.0.0.1:3300';

test('replay mode honors reduced motion while keeping review linkage intact', async ({ page, request }) => {
  const sourcePentest = await createPentest(request, backendUrl, `replay-source-${Date.now()}.example.com`);
  await openPentestShell(page, frontendUrl, sourcePentest);
  await expect(page.getByText(/Ready for Swarm Orchestration/i)).toBeVisible();
  await startRuntime(request, backendUrl, sourcePentest.id, {
    mode: 'scenario',
    scenarioId: 'multi-agent-approval',
    speed: 30,
    capture: true,
  });

  await waitForMainThread(page);
  await expect(page.getByRole('button', { name: 'Approve Execution' })).toBeVisible();
  await page.getByRole('button', { name: 'Approve Execution' }).click();

  const sourceTrace = await waitForTrace(request, backendUrl, sourcePentest.id, (item) => item.status === 'completed');

  const replayPentest = await createPentest(request, backendUrl, `replay-${Date.now()}.example.com`);
  await openPentestShell(page, frontendUrl, replayPentest);
  await expect(page.getByText(/Ready for Swarm Orchestration/i)).toBeVisible();
  await startRuntime(request, backendUrl, replayPentest.id, {
    mode: 'replay',
    traceId: sourceTrace.traceId,
    autoStart: false,
    capture: true,
    speed: 50,
  });

  await page.emulateMedia({ reducedMotion: 'reduce' });
  await controlRuntime(request, backendUrl, replayPentest.id, { action: 'jump_to_sequence', sequence: 2 });
  await waitForMainThread(page);

  await controlRuntime(request, backendUrl, replayPentest.id, { action: 'jump_to_correlation', correlationId: 'corr-tool-httpx' });
  await controlRuntime(request, backendUrl, replayPentest.id, { action: 'jump_to_sequence', sequence: 999 });

  await expect(page.getByText(/single operator voice/i).first()).toBeVisible();
  await expect(page.getByText(/Approval received/i).first()).toBeVisible();

  const reducedMotion = await page.evaluate(() => window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  expect(reducedMotion).toBe(true);

  const animationName = await page.locator('[data-testid="activity-row"]').first().evaluate((node) => {
    const statusNode = [...node.querySelectorAll('*')].find((child) => child.textContent?.trim().toLowerCase() === 'running');
    return statusNode ? window.getComputedStyle(statusNode).animationName : 'none';
  });
  expect(animationName).toBe('none');

  await page.getByText(/httpx triage sweep/i).click();
  await expect(page.getByTestId('swarm-review-pane')).toBeVisible();

  const replayTrace = await waitForTrace(request, backendUrl, replayPentest.id, (item) => item.status === 'completed');
  const projectionSummary = await emitProjectionArtifacts(page, replayTrace);
  expect(projectionSummary.reviewPaneOpen).toBe(true);
});
