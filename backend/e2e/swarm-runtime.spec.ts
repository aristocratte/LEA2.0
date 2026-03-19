import { expect, test } from '@playwright/test';
import {
  createPentest,
  emitProjectionArtifacts,
  openPentestShell,
  startRuntime,
  waitForMainThread,
  waitForTrace,
} from './helpers/swarmRuntime';

const backendUrl = 'http://127.0.0.1:3301';
const frontendUrl = 'http://127.0.0.1:3300';

test('scenario mode renders a Nia-only reply with a calm center thread', async ({ page, request }) => {
  const pentest = await createPentest(request, backendUrl, `nia-only-${Date.now()}.example.com`);
  await openPentestShell(page, frontendUrl, pentest);
  await expect(page.getByText(/Ready for Swarm Orchestration/i)).toBeVisible();
  await startRuntime(request, backendUrl, pentest.id, {
    mode: 'scenario',
    scenarioId: 'nia-only-reply',
    speed: 50,
    capture: true,
  });

  await waitForMainThread(page);

  await expect(page.getByText(/single-voice/i)).toBeVisible();
  await expect(page.getByTestId('activity-row')).toHaveCount(0);

  const trace = await waitForTrace(request, backendUrl, pentest.id, (item) => item.status === 'completed');
  const projectionSummary = await emitProjectionArtifacts(page, trace);
  expect(projectionSummary.centerCalm).toBe(true);
  expect(projectionSummary.leftRailBounded).toBe(true);
});

test('scenario mode approval path shows approval, review linkage, and approve flow', async ({ page, request }) => {
  const pentest = await createPentest(request, backendUrl, `approval-${Date.now()}.example.com`);
  await openPentestShell(page, frontendUrl, pentest);
  await expect(page.getByText(/Ready for Swarm Orchestration/i)).toBeVisible();
  await startRuntime(request, backendUrl, pentest.id, {
    mode: 'scenario',
    scenarioId: 'multi-agent-approval',
    speed: 20,
    capture: true,
  });

  await waitForMainThread(page);

  await expect(page.getByRole('button', { name: 'Approve Execution' })).toBeVisible();
  await page.getByText(/httpx triage sweep/i).click();
  await expect(page.getByTestId('swarm-review-pane')).toBeVisible();
  await expect(page.getByTestId('review-pane-inspector').getByText(/httpx triage sweep/i)).toBeVisible();

  await page.getByRole('button', { name: 'Approve Execution' }).click();
  await expect(page.getByText(/Approval received/i)).toBeVisible();

  const trace = await waitForTrace(request, backendUrl, pentest.id, (item) => item.status === 'completed');
  const projectionSummary = await emitProjectionArtifacts(page, trace);
  expect(projectionSummary.reviewPaneOpen).toBe(true);
});

test('scenario mode deny path preserves calm center thread and bounded left rail', async ({ page, request }) => {
  const pentest = await createPentest(request, backendUrl, `deny-${Date.now()}.example.com`);
  await openPentestShell(page, frontendUrl, pentest);
  await expect(page.getByText(/Ready for Swarm Orchestration/i)).toBeVisible();
  await startRuntime(request, backendUrl, pentest.id, {
    mode: 'scenario',
    scenarioId: 'multi-agent-approval',
    speed: 20,
    capture: true,
  });

  await waitForMainThread(page);

  await expect(page.getByRole('button', { name: 'Deny' })).toBeVisible();
  await page.getByRole('button', { name: 'Deny' }).click();
  await expect(page.getByText(/Approval denied/i)).toBeVisible();

  const trace = await waitForTrace(request, backendUrl, pentest.id, (item) => item.status === 'completed');
  const projectionSummary = await emitProjectionArtifacts(page, trace);
  expect(projectionSummary.centerCalm).toBe(true);
  expect(projectionSummary.leftRailBounded).toBe(true);
});
