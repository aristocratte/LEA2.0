/**
 * @module core/runtime/TranscriptLogger
 * @description Persists agent conversation transcripts as JSONL files.
 *
 * One file per agent, one JSON object per line. This enables efficient
 * append-only writes and easy line-by-line reading for transcript replay.
 */

import { mkdir, appendFile, readFile, access } from 'fs/promises';
import { join } from 'path';
import type { ChatMessage } from '../../services/ai/AIClient.js';

// ============================================================================
// TYPES
// ============================================================================

/**
 * A single transcript entry (one line in the JSONL file).
 */
export interface TranscriptEntry {
  /** ISO timestamp of when this entry was logged. */
  timestamp: string;
  /** Message role ('user' or 'assistant'). */
  role: string;
  /** Message content (text or stringified). */
  content: string;
  /** Turn number in the conversation. */
  turn: number;
}

// ============================================================================
// TRANSCRIPT LOGGER
// ============================================================================

/**
 * Persists agent conversation transcripts as JSONL files.
 *
 * Each agent gets its own transcript file under:
 * <baseDir>/<swarmRunId>/<agentId>.jsonl
 *
 * JSONL format (one JSON object per line):
 * {"timestamp":"2026-03-31T12:00:00.000Z","role":"user","content":"hello","turn":1}
 * {"timestamp":"2026-03-31T12:00:01.000Z","role":"assistant","content":"hi","turn":1}
 *
 * This format enables:
 * - Efficient append-only writes (no file rewrite)
 * - Line-by-line reading for recent entries
 * - Easy grepping/filtering with standard tools
 */
export class TranscriptLogger {
  constructor(private readonly baseDir: string = 'data/transcripts') {}

  /**
   * Append a single transcript entry.
   *
   * Creates the directory structure if it doesn't exist.
   *
   * @param swarmRunId - The swarm run ID (for directory organization)
   * @param agentId - The agent ID (for filename)
   * @param entry - The entry to append
   */
  async append(
    swarmRunId: string,
    agentId: string,
    entry: TranscriptEntry,
  ): Promise<void> {
    const filePath = this.getTranscriptPath(swarmRunId, agentId);
    const dir = join(this.baseDir, swarmRunId);

    // Ensure directory exists
    await mkdir(dir, { recursive: true });

    // Append JSONL line
    const line = JSON.stringify(entry) + '\n';
    await appendFile(filePath, line, 'utf-8');
  }

  /**
   * Append all messages from a conversation turn.
   *
   * Each message becomes a separate transcript entry with the same turn number.
   *
   * @param swarmRunId - The swarm run ID
   * @param agentId - The agent ID
   * @param messages - Messages to append
   * @param turn - The turn number
   */
  async appendTurn(
    swarmRunId: string,
    agentId: string,
    messages: ChatMessage[],
    turn: number,
  ): Promise<void> {
    const timestamp = new Date().toISOString();

    for (const msg of messages) {
      const content =
        typeof msg.content === 'string'
          ? msg.content
          : JSON.stringify(msg.content);

      const entry: TranscriptEntry = {
        timestamp,
        role: msg.role,
        content,
        turn,
      };

      await this.append(swarmRunId, agentId, entry);
    }
  }

  /**
   * Read all entries from an agent's transcript file.
   *
   * Returns empty array if file doesn't exist.
   *
   * @param swarmRunId - The swarm run ID
   * @param agentId - The agent ID
   * @returns Array of transcript entries
   */
  async read(
    swarmRunId: string,
    agentId: string,
  ): Promise<TranscriptEntry[]> {
    const filePath = this.getTranscriptPath(swarmRunId, agentId);

    try {
      await access(filePath);
    } catch {
      // File doesn't exist
      return [];
    }

    const content = await readFile(filePath, 'utf-8');
    const entries: TranscriptEntry[] = [];

    for (const line of content.split('\n')) {
      if (line.trim()) {
        try {
          entries.push(JSON.parse(line) as TranscriptEntry);
        } catch {
          // Skip malformed lines
        }
      }
    }

    return entries;
  }

  /**
   * Read the last N entries from an agent's transcript file.
   *
   * Returns all entries if file has fewer than N entries.
   * Returns empty array if file doesn't exist or N is 0.
   *
   * @param swarmRunId - The swarm run ID
   * @param agentId - The agent ID
   * @param n - Number of entries to return
   * @returns Array of transcript entries (max N)
   */
  async getLastN(
    swarmRunId: string,
    agentId: string,
    n: number,
  ): Promise<TranscriptEntry[]> {
    if (n <= 0) {
      return [];
    }
    const allEntries = await this.read(swarmRunId, agentId);
    return allEntries.slice(-n);
  }

  /**
   * Get the file path for an agent's transcript file.
   *
   * @param swarmRunId - The swarm run ID
   * @param agentId - The agent ID
   * @returns Absolute path to the transcript file
   */
  getTranscriptPath(swarmRunId: string, agentId: string): string {
    return join(this.baseDir, swarmRunId, `${agentId}.jsonl`);
  }
}

// ============================================================================
// EXPORTS
// ============================================================================

export default TranscriptLogger;
