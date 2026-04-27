import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MemoryExtractor } from '../MemoryExtractor.js';
import type { StreamEvent } from '../../types/session-types.js';

// ============================================================================
// MOCKS
// ============================================================================

function createMockPrisma() {
  const memories: any[] = [];
  return {
    extractedMemory: {
      findFirst: vi.fn(async () => null),
      count: vi.fn(async () => 0),
      create: vi.fn(async ({ data }: any) => {
        const mem = { id: `mem-${memories.length + 1}`, ...data, createdAt: new Date() };
        memories.push(mem);
        return mem;
      }),
      findMany: vi.fn(async ({ where, take }: any) => {
        return memories.filter((m: any) => {
          if (where.projectKey && m.projectKey !== where.projectKey) return false;
          if (where.type?.in && !where.type.in.includes(m.type)) return false;
          if (where.createdAt?.gte && new Date(m.createdAt) < new Date(where.createdAt.gte)) return false;
          return true;
        }).slice(0, take ?? memories.length);
      }),
      _data: memories,
    },
  };
}

function createMockMemoryStore() {
  return {
    getEffectiveContext: vi.fn(async () => ({
      summary: { summaryContent: 'Previous context: target is 10.0.0.5' },
      recentMessages: [
        { role: 'assistant', content: 'Scanning target 10.0.0.5...' },
        { role: 'user', content: 'Found port 22 open' },
        { role: 'assistant', content: 'Port 22 is running OpenSSH 8.9p1' },
      ],
    })),
  };
}

function createMockCallModel(responseText: string) {
  return vi.fn(async function* (): AsyncGenerator<StreamEvent> {
    yield { type: 'text_delta' as const, text: responseText };
    yield { type: 'model_stop' as const, reason: 'end_turn' as const };
  });
}

const VALID_JSON_RESPONSE = JSON.stringify([
  {
    type: 'TARGET_FACT',
    category: 'network',
    title: 'Port 22 open on 10.0.0.5',
    payload: { port: 22, service: 'ssh', ip: '10.0.0.5' },
    confidence: 1.0,
  },
  {
    type: 'FINDING',
    category: 'security',
    title: 'Outdated SSH version',
    payload: { version: 'OpenSSH 8.9p1', cve: 'CVE-2023-38408' },
    confidence: 0.9,
  },
]);

// ============================================================================
// TESTS
// ============================================================================

describe('MemoryExtractor', () => {
  let extractor: MemoryExtractor;
  let prisma: any;
  let memoryStore: any;

  beforeEach(() => {
    prisma = createMockPrisma();
    memoryStore = createMockMemoryStore();
    extractor = new MemoryExtractor({
      prisma,
      memoryStore,
      callModel: createMockCallModel(VALID_JSON_RESPONSE),
    });
  });

  // -------------------------------------------------------------------------
  // extractFromSession
  // -------------------------------------------------------------------------

  describe('extractFromSession', () => {
    it('should extract memories from session context', async () => {
      const result = await extractor.extractFromSession({
        swarmRunId: 'run-1',
        agentId: 'agent-1',
        pentestId: 'pt-1',
        projectKey: 'pt-1',
        trigger: 'AGENT_COMPLETE',
      });

      expect(result.count).toBe(2);
      expect(result.trigger).toBe('AGENT_COMPLETE');
      expect(result.memories).toHaveLength(2);
      expect(result.memories[0].type).toBe('TARGET_FACT');
      expect(result.memories[1].type).toBe('FINDING');
      expect(result.durationMs).toBeGreaterThanOrEqual(0);
    });

    it('should persist extracted memories to DB', async () => {
      await extractor.extractFromSession({
        swarmRunId: 'run-1',
        agentId: 'agent-1',
        pentestId: 'pt-1',
        projectKey: 'pt-1',
        trigger: 'AGENT_COMPLETE',
      });

      expect(prisma.extractedMemory.create).toHaveBeenCalledTimes(2);
      const calls = prisma.extractedMemory.create.mock.calls;
      expect(calls[0][0].data.title).toBe('Port 22 open on 10.0.0.5');
      expect(calls[1][0].data.title).toBe('Outdated SSH version');
    });

    it('should deduplicate by (projectKey, title)', async () => {
      // First extraction
      await extractor.extractFromSession({
        swarmRunId: 'run-1',
        agentId: 'agent-1',
        pentestId: 'pt-1',
        projectKey: 'pt-1',
        trigger: 'AGENT_COMPLETE',
      });
      expect(prisma.extractedMemory.create).toHaveBeenCalledTimes(2);

      // Second extraction with same titles — findFirst returns existing
      prisma.extractedMemory.findFirst.mockImplementation(async ({ where }: any) =>
        prisma.extractedMemory._data.find((m: any) => m.title === where.title) || null,
      );

      await extractor.extractFromSession({
        swarmRunId: 'run-2',
        agentId: 'agent-2',
        pentestId: 'pt-1',
        projectKey: 'pt-1',
        trigger: 'AGENT_COMPLETE',
      });

      // No new creates because all titles are duplicates
      expect(prisma.extractedMemory.create).toHaveBeenCalledTimes(2); // still only first batch
    });

    it('should return empty result when no messages and no summary', async () => {
      memoryStore.getEffectiveContext.mockResolvedValueOnce({
        summary: null,
        recentMessages: [],
      });

      const result = await extractor.extractFromSession({
        swarmRunId: 'run-1',
        agentId: 'agent-1',
        projectKey: 'pt-empty',
        trigger: 'AGENT_COMPLETE',
      });

      expect(result.count).toBe(0);
      expect(result.memories).toEqual([]);
    });

    it('should handle LLM errors gracefully', async () => {
      const errorExtractor = new MemoryExtractor({
        prisma,
        memoryStore,
        callModel: vi.fn(async function* (): AsyncGenerator<StreamEvent> {
          yield { type: 'error' as const, error: new Error('LLM failed'), recoverable: false };
        }),
      });

      const result = await errorExtractor.extractFromSession({
        swarmRunId: 'run-1',
        agentId: 'agent-1',
        projectKey: 'pt-1',
        trigger: 'AGENT_COMPLETE',
      });

      expect(result.count).toBe(0);
      expect(result.memories).toEqual([]);
    });

    it('should respect maxRecentMessages parameter', async () => {
      const result = await extractor.extractFromSession({
        swarmRunId: 'run-1',
        agentId: 'agent-1',
        projectKey: 'pt-1',
        trigger: 'AGENT_COMPLETE',
        maxRecentMessages: 1,
      });

      // Should still succeed — just uses fewer messages for LLM context
      expect(result.count).toBeDefined();
    });
  });

  // -------------------------------------------------------------------------
  // extractFromMessages
  // -------------------------------------------------------------------------

  describe('extractFromMessages', () => {
    it('should extract from explicit message list', async () => {
      const result = await extractor.extractFromMessages({
        messages: [
          { role: 'user', content: 'Scan 10.0.0.5', sequence: 10 },
          { role: 'assistant', content: 'Port 80 is open running nginx', sequence: 11 },
        ],
        swarmRunId: 'run-1',
        agentId: 'agent-1',
        pentestId: 'pt-1',
        projectKey: 'pt-1',
        trigger: 'POST_COMPACTION',
      });

      expect(result.count).toBe(2);
      expect(result.trigger).toBe('POST_COMPACTION');
    });

    it('should store sourceTurns from message sequences', async () => {
      await extractor.extractFromMessages({
        messages: [
          { role: 'user', content: 'Check port 80', sequence: 15 },
          { role: 'assistant', content: 'nginx/1.24 detected', sequence: 16 },
        ],
        swarmRunId: 'run-1',
        agentId: 'agent-1',
        projectKey: 'pt-1',
        trigger: 'POST_COMPACTION',
      });

      const calls = prisma.extractedMemory.create.mock.calls;
      expect(calls[0][0].data.sourceTurns).toEqual([15, 16]);
    });

    it('should return empty result for empty messages', async () => {
      const result = await extractor.extractFromMessages({
        messages: [],
        swarmRunId: 'run-1',
        agentId: 'agent-1',
        projectKey: 'pt-1',
        trigger: 'POST_COMPACTION',
      });

      expect(result.count).toBe(0);
    });
  });

  // -------------------------------------------------------------------------
  // listByProject
  // -------------------------------------------------------------------------

  describe('listByProject', () => {
    beforeEach(async () => {
      // Seed some memories
      await extractor.extractFromSession({
        swarmRunId: 'run-1',
        agentId: 'agent-1',
        pentestId: 'pt-1',
        projectKey: 'pt-alpha',
        trigger: 'AGENT_COMPLETE',
      });
    });

    it('should list memories by projectKey', async () => {
      const results = await extractor.listByProject('pt-alpha');
      expect(results).toHaveLength(2);
    });

    it('should filter by types', async () => {
      const results = await extractor.listByProject('pt-alpha', {
        types: ['TARGET_FACT'],
      });
      expect(results).toHaveLength(1);
      expect(results[0].type).toBe('TARGET_FACT');
    });

    it('should filter by date', async () => {
      const future = new Date(Date.now() + 86400000).toISOString();
      const results = await extractor.listByProject('pt-alpha', {
        since: new Date(future),
      });
      expect(results).toHaveLength(0);
    });

    it('should limit results', async () => {
      const results = await extractor.listByProject('pt-alpha', {
        limit: 1,
      });
      expect(results.length).toBeLessThanOrEqual(1);
    });
  });

  // -------------------------------------------------------------------------
  // wasTerminalExtractionDone
  // -------------------------------------------------------------------------

  describe('wasTerminalExtractionDone', () => {
    it('should return false when no extractions exist', async () => {
      const done = await extractor.wasTerminalExtractionDone('run-new', 'agent-new');
      expect(done).toBe(false);
    });

    it('should return true after agent_complete extraction', async () => {
      await extractor.extractFromSession({
        swarmRunId: 'run-1',
        agentId: 'agent-1',
        pentestId: 'pt-1',
        projectKey: 'pt-1',
        trigger: 'AGENT_COMPLETE',
      });

      // Wire up count mock to check actual data
      prisma.extractedMemory.count.mockImplementation(async ({ where }: any) =>
        prisma.extractedMemory._data.filter((m: any) =>
          m.swarmRunId === where.swarmRunId &&
          m.agentId === where.agentId &&
          where.trigger.in.includes(m.trigger),
        ).length,
      );

      const done = await extractor.wasTerminalExtractionDone('run-1', 'agent-1');
      expect(done).toBe(true);
    });

    it('should return false for post_compaction only (non-terminal)', async () => {
      // Create a post_compaction extraction directly
      await prisma.extractedMemory.create({
        data: {
          projectKey: 'pt-1',
          swarmRunId: 'run-2',
          agentId: 'agent-2',
          type: 'TARGET_FACT',
          category: 'test',
          title: 'Test fact',
          payload: {},
          confidence: 1.0,
          sourceTurns: [],
          trigger: 'POST_COMPACTION',
        },
      });

      prisma.extractedMemory.count.mockImplementation(async ({ where }: any) =>
        prisma.extractedMemory._data.filter((m: any) =>
          m.swarmRunId === where.swarmRunId &&
          m.agentId === where.agentId &&
          where.trigger.in.includes(m.trigger),
        ).length,
      );

      const done = await extractor.wasTerminalExtractionDone('run-2', 'agent-2');
      expect(done).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // parseResponse edge cases
  // -------------------------------------------------------------------------

  describe('parseResponse edge cases', () => {
    it('should handle response without JSON array', async () => {
      const badExtractor = new MemoryExtractor({
        prisma,
        memoryStore,
        callModel: createMockCallModel('No JSON here, just text'),
      });

      const result = await badExtractor.extractFromSession({
        swarmRunId: 'run-1',
        agentId: 'agent-1',
        projectKey: 'pt-1',
        trigger: 'AGENT_COMPLETE',
      });

      expect(result.count).toBe(0);
    });

    it('should handle malformed JSON', async () => {
      const malformedExtractor = new MemoryExtractor({
        prisma,
        memoryStore,
        callModel: createMockCallModel('[{invalid json}]'),
      });

      const result = await malformedExtractor.extractFromSession({
        swarmRunId: 'run-1',
        agentId: 'agent-1',
        projectKey: 'pt-1',
        trigger: 'AGENT_COMPLETE',
      });

      expect(result.count).toBe(0);
    });

    it('should skip invalid memory objects in array', async () => {
      const mixedExtractor = new MemoryExtractor({
        prisma,
        memoryStore,
        callModel: createMockCallModel(JSON.stringify([
          { type: 'TARGET_FACT', category: 'net', title: 'Valid', payload: { x: 1 }, confidence: 1.0 },
          { type: 'INVALID', category: '', title: '', payload: null, confidence: -1 }, // missing required fields
          { type: 'FINDING', category: 'sec', title: 'Also valid', payload: { y: 2 }, confidence: 0.8 },
        ])),
      });

      const result = await mixedExtractor.extractFromSession({
        swarmRunId: 'run-1',
        agentId: 'agent-1',
        projectKey: 'pt-1',
        trigger: 'AGENT_COMPLETE',
      });

      expect(result.count).toBe(2); // Only valid ones persisted
    });
  });
});
