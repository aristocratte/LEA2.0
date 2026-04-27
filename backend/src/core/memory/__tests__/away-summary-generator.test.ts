import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AwaySummaryGenerator } from '../AwaySummaryGenerator.js';
import type { AwaySummary } from '../AwaySummaryGenerator.js';

// ============================================================================
// MOCKS
// ============================================================================

function createMockDeps(overrides?: {
  history?: any[];
  currentRun?: any;
  memories?: any[];
}) {
  const history = overrides?.history ?? [];
  const currentRun = overrides?.currentRun ?? null;
  const memories = overrides?.memories ?? [];

  return {
    prisma: {} as any, // not directly used by generator
    getSwarmHistory: vi.fn(async () => history),
    getSwarmRun: vi.fn(async () => currentRun),
    listMemories: vi.fn(async (_projectKey: string, _options?: any) => memories),
  };
}

/** A minimal Swarm-like object for testing. */
function makeSwarm(partial: Record<string, unknown> = {}): any {
  return {
    id: 'swarm-1',
    pentestId: 'pt-1',
    target: '10.0.0.5',
    status: 'COMPLETED',
    maxAgents: 5,
    maxConcurrentAgents: 3,
    forceMerged: false,
    agents: [],
    findings: [],
    tasks: [],
    startedAt: new Date().toISOString(),
    ...partial,
  };
}

// ============================================================================
// TESTS
// ============================================================================

describe('AwaySummaryGenerator', () => {
  let gen: AwaySummaryGenerator;

  beforeEach(() => {
    gen = new AwaySummaryGenerator(createMockDeps());
  });

  // -------------------------------------------------------------------------
  // No activity
  // -------------------------------------------------------------------------

  describe('when no activity since last visit', () => {
    it('returns hasActivity=false with empty summary', async () => {
      const result = await gen.generate('pt-1');

      expect(result.hasActivity).toBe(false);
      expect(result.headline).toContain('No new activity');
      expect(result.highlights).toEqual([]);
      expect(result.stats.agentsActive).toBe(0);
      expect(result.stats.findingsNew).toBe(0);
      expect(result.stats.memoriesExtracted).toBe(0);
    });
  });

  // -------------------------------------------------------------------------
  // Activity from completed runs (history)
  // -------------------------------------------------------------------------

  describe('with completed swarm runs in history', () => {
    it('reports agents completed and findings', async () => {
      const deps = createMockDeps({
        history: [
          makeSwarm({
            status: 'COMPLETED',
            agents: [
              { id: 'a1', name: 'Recon Alpha', role: 'Recon', status: 'DONE' },
              { id: 'a2', name: 'Web Scanner', role: 'Web', status: 'DONE' },
              { id: 'a3', name: 'Exploit Sim', role: 'Exploit', status: 'FAILED' },
            ],
            findings: [
              { id: 'f1', title: 'SQL Injection in login form', severity: 'critical' },
              { id: 'f2', title: 'Open SSH with weak key', severity: 'high' },
            ],
          }),
        ],
      });

      const generator = new AwaySummaryGenerator(deps);
      const result = await generator.generate('pt-1');

      expect(result.hasActivity).toBe(true);
      expect(result.stats.agentsCompleted).toBe(2);
      expect(result.stats.errorsCount).toBe(1);
      expect(result.stats.findingsNew).toBe(2);

      // Headline mentions the key facts
      expect(result.headline).toBeTruthy();
      expect(result.headline.length).toBeGreaterThan(0);

      // Highlights include findings and agent counts
      const kinds = result.highlights.map((h) => h.kind);
      expect(kinds).toContain('finding');
      expect(kinds).toContain('agent');
      expect(kinds).toContain('error');
    });

    it('deduplicates findings across runs', async () => {
      const finding = { id: 'f1', title: 'Dup Finding', severity: 'medium' };
      const deps = createMockDeps({
        history: [
          makeSwarm({ findings: [finding], agents: [] }),
          makeSwarm({ findings: [finding], agents: [] }),
        ],
      });

      const generator = new AwaySummaryGenerator(deps);
      const result = await generator.generate('pt-1');

      const findingHighlights = result.highlights.filter((h) => h.kind === 'finding');
      // Same finding should appear only once
      expect(findingHighlights.length).toBe(1);
    });
  });

  // -------------------------------------------------------------------------
  // Active running swarm
  // -------------------------------------------------------------------------

  describe('with currently active swarm run', () => {
    it('reports active agents and current findings', async () => {
      const deps = createMockDeps({
        currentRun: makeSwarm({
          status: 'RUNNING',
          agents: [
            { id: 'a1', name: 'Recon Alpha', role: 'Recon', status: 'RUNNING_TOOL' },
            { id: 'a2', name: 'Web Scanner', role: 'Web', status: 'IDLE' },
            { id: 'a3', name: 'Exploit Sim', role: 'Exploit', status: 'SPAWNED' },
          ],
          findings: [{ id: 'f3', title: 'XSS in search', severity: 'medium' }],
          tasks: [
            { id: 't1', description: 'Scan ports', status: 'completed' },
            { id: 't2', description: 'Check headers', status: 'running' },
          ],
        }),
      });

      const generator = new AwaySummaryGenerator(deps);
      const result = await generator.generate('pt-1');

      expect(result.hasActivity).toBe(true);
      expect(result.stats.agentsActive).toBe(3);
      expect(result.stats.tasksCompleted).toBe(1);
      expect(result.stats.findingsNew).toBe(1);

      const kinds = result.highlights.map((h) => h.kind);
      expect(kinds).toContain('agent');
      expect(kinds).toContain('task');
    });
  });

  // -------------------------------------------------------------------------
  // B2 extracted memories integration
  // -------------------------------------------------------------------------

  describe('with B2 extracted memories', () => {
    it('includes memories as highlights', async () => {
      const deps = createMockDeps({
        memories: [
          { id: 'm1', type: 'FINDING', category: 'security', title: 'Port 22 open', confidence: 1.0 },
          { id: 'm2', type: 'TARGET_FACT', category: 'network', title: 'nginx/1.24 on :80', confidence: 0.95 },
          { id: 'm3', type: 'DECISION', category: 'ops', title: 'Focus on auth bypass', confidence: 0.9 },
          { id: 'm4', type: 'CONSTRAINT', category: 'scope', title: 'Scope: 10.0.0.0/24 only', confidence: 1.0 },
        ],
      });

      const generator = new AwaySummaryGenerator(deps);
      const result = await generator.generate('pt-1');

      expect(result.stats.memoriesExtracted).toBe(4);

      const memoryKinds = result.highlights.filter((h) => h.kind === 'memory');
      expect(memoryKinds.length).toBeGreaterThanOrEqual(2); // at least target_facts + decisions

      const titles = memoryKinds.map((h) => h.text);
      expect(titles).toContain('nginx/1.24 on :80');
      expect(titles.some((t) => t.includes('Decision:'))).toBe(true);
      expect(titles.some((t) => t.includes('Decision:'))).toBe(true);
    });

    it('shows memories even when no swarm activity', async () => {
      const deps = createMockDeps({
        memories: [
          { id: 'm1', type: 'TARGET_FACT', category: 'network', title: 'DNS resolves to 192.168.1.1', confidence: 1.0 },
        ],
      });

      const generator = new AwaySummaryGenerator(deps);
      const result = await generator.generate('pt-1');

      expect(result.hasActivity).toBe(true);
      expect(result.headline).toContain('fact');
    });
  });

  // -------------------------------------------------------------------------
  // Period / timestamps
  // -------------------------------------------------------------------------

  describe('period tracking', () => {
    it('sets period.from to provided since timestamp', async () => {
      const since = new Date(Date.now() - 30 * 60 * 1000).toISOString(); // 30 min ago
      const result = await gen.generate('pt-1', since);

      expect(result.period.since).toBe(since);
      expect(new Date(result.period.until).getTime()).toBeGreaterThanOrEqual(Date.now() - 5000); // roughly now
    });

    it('defaults to 1 hour ago when no since provided', async () => {
      const result = await gen.generate('pt-1');

      const sinceDate = new Date(result.period.since);
      const diffMs = Date.now() - sinceDate.getTime();

      // Should be ~1 hour ago (give or take 5s)
      expect(diffMs).toBeGreaterThan(55 * 60 * 1000); // > 55 min
      expect(diffMs).toBeLessThan(65 * 60 * 1000); // < 65 min
    });
  });

  // -------------------------------------------------------------------------
  // Error resilience
  // -------------------------------------------------------------------------

  describe('error handling', () => {
    it('handles getSwarmHistory failure gracefully', async () => {
      const deps = createMockDeps();
      deps.getSwarmHistory = vi.fn(() => { throw new Error('DB down'); });

      const generator = new AwaySummaryGenerator(deps);
      const result = await generator.generate('pt-1');

      // Should not throw — returns empty/minimal summary
      expect(result).toBeDefined();
      expect(result.hasActivity).toBe(false);
    });

    it('handles getSwarmRun failure gracefully', async () => {
      const deps = createMockDeps();
      deps.getSwarmRun = vi.fn(() => { throw new Error('Timeout'); });

      const generator = new AwaySummaryGenerator(deps);
      const result = await generator.generate('pt-1');

      expect(result).toBeDefined();
    });

    it('handles listMemories failure gracefully', async () => {
      const deps = createMockDeps();
      deps.listMemories = vi.fn(() => { throw new Error('Memory table missing'); });

      const generator = new AwaySummaryGenerator(deps);
      const result = await generator.generate('pt-1');

      expect(result).toBeDefined();
      // Still can report from swarm history if available
    });
  });

  // -------------------------------------------------------------------------
  // Combined scenario: full picture
  // -------------------------------------------------------------------------

  describe('full scenario with all data sources', () => {
    it('produces a rich multi-source summary', async () => {
      const deps = createMockDeps({
        history: [
          makeSwarm({
            status: 'COMPLETED',
            agents: [
              { id: 'a1', name: 'Recon', role: 'Recon', status: 'DONE' },
            ],
            findings: [{ id: 'f1', title: 'Port 443 open', severity: 'info' }],
          }),
        ],
        currentRun: makeSwarm({
          status: 'RUNNING',
          agents: [
            { id: 'a2', name: 'Scanner', role: 'Web', status: 'RUNNING_TOOL' },
          ],
          findings: [],
          tasks: [{ id: 't1', description: 'Dir bust', status: 'completed' }],
        }),
        memories: [
          { id: 'm1', type: 'FINDING', category: 'sec', title: 'Admin panel exposed', confidence: 1.0 },
          { id: 'm2', type: 'TARGET_FACT', category: 'net', title: 'Ubuntu 22.04 detected', confidence: 0.9 },
        ],
      });

      const generator = new AwaySummaryGenerator(deps);
      const result = await generator.generate('pt-1');

      expect(result.hasActivity).toBe(true);
      expect(result.stats.agentsCompleted).toBe(1);
      expect(result.stats.agentsActive).toBe(1);
      expect(result.stats.findingsNew).toBe(1);
      expect(result.stats.memoriesExtracted).toBe(2);
      expect(result.stats.tasksCompleted).toBe(1);

      // Verify highlight diversity
      const kindSet = new Set(result.highlights.map((h) => h.kind));
      expect(kindSet.has('finding')).toBe(true);
      expect(kindSet.has('agent')).toBe(true);
      expect(kindSet.has('task')).toBe(true);
      expect(kindSet.has('memory')).toBe(true);

      // Headline is meaningful
      expect(result.headline).toBeTruthy();
      expect(result.headline.length).toBeGreaterThan(10);
    });
  });
});
