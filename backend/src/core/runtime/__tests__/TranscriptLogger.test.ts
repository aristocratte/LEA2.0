/**
 * Tests for TranscriptLogger
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { rm } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';
import { TranscriptLogger } from '../TranscriptLogger.js';
import type { TranscriptEntry } from '../TranscriptLogger.js';

describe('TranscriptLogger', () => {
  let logger: TranscriptLogger;
  let testDir: string;
  let swarmRunId: string;
  let agentId: string;

  beforeEach(() => {
    // Use a unique temp directory for each test
    const uniqueId = `test-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    testDir = join(tmpdir(), uniqueId);
    logger = new TranscriptLogger(testDir);
    swarmRunId = 'test-swarm';
    agentId = 'test-agent';
  });

  afterEach(async () => {
    // Clean up temp directory
    try {
      await rm(testDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  describe('append', () => {
    it('should create directory and file on first append', async () => {
      const entry: TranscriptEntry = {
        timestamp: '2026-03-31T12:00:00.000Z',
        role: 'user',
        content: 'Hello',
        turn: 1,
      };

      await logger.append(swarmRunId, agentId, entry);

      // File should now exist and be readable
      const read = await logger.read(swarmRunId, agentId);
      expect(read).toEqual([entry]);
    });

    it('should append multiple entries', async () => {
      const entry1: TranscriptEntry = {
        timestamp: '2026-03-31T12:00:00.000Z',
        role: 'user',
        content: 'Hello',
        turn: 1,
      };
      const entry2: TranscriptEntry = {
        timestamp: '2026-03-31T12:00:01.000Z',
        role: 'assistant',
        content: 'Hi there',
        turn: 1,
      };

      await logger.append(swarmRunId, agentId, entry1);
      await logger.append(swarmRunId, agentId, entry2);

      const read = await logger.read(swarmRunId, agentId);
      expect(read).toEqual([entry1, entry2]);
    });

    it('should handle multiple agents separately', async () => {
      const agent1Entry: TranscriptEntry = {
        timestamp: '2026-03-31T12:00:00.000Z',
        role: 'user',
        content: 'Agent 1 message',
        turn: 1,
      };
      const agent2Entry: TranscriptEntry = {
        timestamp: '2026-03-31T12:00:00.000Z',
        role: 'user',
        content: 'Agent 2 message',
        turn: 1,
      };

      await logger.append(swarmRunId, 'agent-1', agent1Entry);
      await logger.append(swarmRunId, 'agent-2', agent2Entry);

      expect(await logger.read(swarmRunId, 'agent-1')).toEqual([agent1Entry]);
      expect(await logger.read(swarmRunId, 'agent-2')).toEqual([agent2Entry]);
    });
  });

  describe('appendTurn', () => {
    it('should append all messages from a turn', async () => {
      const messages = [
        { role: 'user' as const, content: 'Question' },
        { role: 'assistant' as const, content: 'Answer' },
      ];

      await logger.appendTurn(swarmRunId, agentId, messages, 1);

      const read = await logger.read(swarmRunId, agentId);
      expect(read).toHaveLength(2);
      expect(read[0].role).toBe('user');
      expect(read[0].content).toBe('Question');
      expect(read[0].turn).toBe(1);
      expect(read[1].role).toBe('assistant');
      expect(read[1].content).toBe('Answer');
      expect(read[1].turn).toBe(1);
    });

    it('should use same timestamp for all messages in a turn', async () => {
      const messages = [
        { role: 'user' as const, content: 'Msg 1' },
        { role: 'assistant' as const, content: 'Msg 2' },
      ];

      await logger.appendTurn(swarmRunId, agentId, messages, 1);

      const read = await logger.read(swarmRunId, agentId);
      expect(read[0].timestamp).toBe(read[1].timestamp);
    });

    it('should stringify array content', async () => {
      const messages = [
        {
          role: 'assistant' as const,
          content: [
            { type: 'text' as const, text: 'Text block' },
            { type: 'tool_use' as const, id: '123', name: 'test', input: {} },
          ],
        },
      ];

      await logger.appendTurn(swarmRunId, agentId, messages, 1);

      const read = await logger.read(swarmRunId, agentId);
      expect(read[0].content).toContain('text');
      expect(read[0].content).toContain('tool_use');
    });
  });

  describe('read', () => {
    it('should return empty array for non-existent file', async () => {
      const read = await logger.read('non-existent', 'agent');
      expect(read).toEqual([]);
    });

    it('should roundtrip entries correctly', async () => {
      const entry: TranscriptEntry = {
        timestamp: '2026-03-31T12:00:00.000Z',
        role: 'user',
        content: 'Test message with special chars: "quotes" and \'apostrophes\'',
        turn: 5,
      };

      await logger.append(swarmRunId, agentId, entry);
      const read = await logger.read(swarmRunId, agentId);

      expect(read).toEqual([entry]);
    });

    it('should handle empty lines gracefully', async () => {
      // Manually write a file with some empty lines
      const { appendFile } = await import('fs/promises');
      const filePath = logger.getTranscriptPath(swarmRunId, agentId);
      const dir = join(testDir, swarmRunId);
      await import('fs/promises').then(({ mkdir }) => mkdir(dir, { recursive: true }));
      await appendFile(filePath, '{"timestamp":"2026-03-31T12:00:00.000Z","role":"user","content":"Msg1","turn":1}\n\n\n');
      await appendFile(filePath, '{"timestamp":"2026-03-31T12:00:01.000Z","role":"assistant","content":"Msg2","turn":1}\n');

      const read = await logger.read(swarmRunId, agentId);
      expect(read).toHaveLength(2);
      expect(read[0].content).toBe('Msg1');
      expect(read[1].content).toBe('Msg2');
    });

    it('should skip malformed JSON lines', async () => {
      // Write file with one bad line
      const { appendFile } = await import('fs/promises');
      const filePath = logger.getTranscriptPath(swarmRunId, agentId);
      const dir = join(testDir, swarmRunId);
      await import('fs/promises').then(({ mkdir }) => mkdir(dir, { recursive: true }));
      await appendFile(filePath, '{"timestamp":"2026-03-31T12:00:00.000Z","role":"user","content":"Good","turn":1}\n');
      await appendFile(filePath, 'this is not json\n');
      await appendFile(filePath, '{"timestamp":"2026-03-31T12:00:01.000Z","role":"assistant","content":"Also good","turn":1}\n');

      const read = await logger.read(swarmRunId, agentId);
      expect(read).toHaveLength(2);
      expect(read[0].content).toBe('Good');
      expect(read[1].content).toBe('Also good');
    });
  });

  describe('getLastN', () => {
    it('should return last N entries', async () => {
      for (let i = 0; i < 10; i++) {
        await logger.append(swarmRunId, agentId, {
          timestamp: `2026-03-31T12:00:${i.toString().padStart(2, '0')}.000Z`,
          role: 'user',
          content: `Message ${i}`,
          turn: i,
        });
      }

      const last3 = await logger.getLastN(swarmRunId, agentId, 3);
      expect(last3).toHaveLength(3);
      expect(last3[0].content).toBe('Message 7');
      expect(last3[1].content).toBe('Message 8');
      expect(last3[2].content).toBe('Message 9');
    });

    it('should return all entries if fewer than N', async () => {
      await logger.append(swarmRunId, agentId, {
        timestamp: '2026-03-31T12:00:00.000Z',
        role: 'user',
        content: 'Only message',
        turn: 1,
      });

      const last10 = await logger.getLastN(swarmRunId, agentId, 10);
      expect(last10).toHaveLength(1);
      expect(last10[0].content).toBe('Only message');
    });

    it('should return empty array for non-existent file', async () => {
      const last5 = await logger.getLastN('non-existent', 'agent', 5);
      expect(last5).toEqual([]);
    });

    it('should handle N=0', async () => {
      await logger.append(swarmRunId, agentId, {
        timestamp: '2026-03-31T12:00:00.000Z',
        role: 'user',
        content: 'Some message',
        turn: 1,
      });

      const last0 = await logger.getLastN(swarmRunId, agentId, 0);
      expect(last0).toEqual([]);
    });
  });

  describe('getTranscriptPath', () => {
    it('should return correct path structure', () => {
      const path = logger.getTranscriptPath(swarmRunId, agentId);
      expect(path).toContain(testDir);
      expect(path).toContain(swarmRunId);
      expect(path).toContain(`${agentId}.jsonl`);
    });

    it('should handle special characters in IDs', () => {
      const specialSwarmId = 'swarm-with-dashes_and.dots';
      const specialAgentId = 'agent@with#special';
      const path = logger.getTranscriptPath(specialSwarmId, specialAgentId);
      expect(path).toContain(specialSwarmId);
      expect(path).toContain(`${specialAgentId}.jsonl`);
    });
  });
});
