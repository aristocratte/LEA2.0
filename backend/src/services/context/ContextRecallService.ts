import { PrismaClient } from '@prisma/client';
import { kaliMcpClient } from '../mcp/KaliMCPClient.js';
import { ContextCompactionService } from './ContextCompactionService.js';
import { contextRecallResultsSchema, toPrismaJson } from '../../types/schemas.js';

export interface ContextRecallRequest {
  pentestId: string;
  actor: string;
  query: string;
  limit?: number;
}

export interface ContextRecallSnippet {
  source: 'snapshot' | 'workspace';
  snapshotId?: string;
  file?: string;
  score: number;
  excerpt: string;
}

export interface ContextRecallResponse {
  query: string;
  snippets: ContextRecallSnippet[];
}

function clip(text: string, max: number): string {
  if (text.length <= max) return text;
  return `${text.substring(0, max)}...`;
}

export class ContextRecallService {
  private prisma: PrismaClient;
  private compaction: ContextCompactionService;

  constructor(prismaClient?: PrismaClient) {
    this.prisma = prismaClient || new PrismaClient();
    this.compaction = new ContextCompactionService(this.prisma);
  }

  async recall(input: ContextRecallRequest): Promise<ContextRecallResponse> {
    const limit = Math.max(1, Math.min(input.limit || 8, 20));
    const query = String(input.query || '').trim();
    if (!query) {
      throw new Error('context recall query is required');
    }

    const snapshotHits = await this.compaction.querySnapshots(input.pentestId, query, limit);
    const snippets: ContextRecallSnippet[] = snapshotHits.map((hit) => ({
      source: 'snapshot',
      snapshotId: hit.snapshotId,
      score: Number(hit.score.toFixed(3)),
      excerpt: hit.excerpt,
    }));

    if (snippets.length < limit) {
      const workspaceHits = await this.searchWorkspace(input.pentestId, query, limit - snippets.length);
      snippets.push(...workspaceHits);
    }

    const deduped = this.dedupeSnippets(snippets).slice(0, limit);

    await this.prisma.contextRecallLog.create({
      data: {
        pentest_id: input.pentestId,
        actor: input.actor || 'system',
        query,
        results_json: toPrismaJson(contextRecallResultsSchema.parse({
          snippets: deduped,
          count: deduped.length,
        })),
      },
    });

    return {
      query,
      snippets: deduped,
    };
  }

  private async searchWorkspace(pentestId: string, query: string, limit: number): Promise<ContextRecallSnippet[]> {
    if (limit <= 0) return [];

    const result = await kaliMcpClient.callTool(
      'workspace_search',
      {
        pentest_id: pentestId,
        path: 'notes/context',
        query,
        max_results: Math.max(1, Math.min(limit * 2, 50)),
      },
      30_000,
      {
        pentestId,
        actor: 'context-recall',
        scopeMode: 'extended',
      }
    );

    if (!result.success || !result.output) {
      return [];
    }

    const lines = result.output
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
      .slice(0, limit * 3);

    return lines
      .map((line) => {
        const parts = line.split(':');
        const file = parts.length >= 3 ? parts[0] : undefined;
        const excerpt = parts.length >= 3 ? parts.slice(2).join(':').trim() : line;
        return {
          source: 'workspace' as const,
          file,
          score: 0.35,
          excerpt: clip(excerpt, 360),
        };
      })
      .slice(0, limit);
  }

  private dedupeSnippets(snippets: ContextRecallSnippet[]): ContextRecallSnippet[] {
    const seen = new Set<string>();
    const deduped: ContextRecallSnippet[] = [];
    for (const snippet of snippets) {
      const key = [
        snippet.source,
        snippet.snapshotId || '',
        snippet.file || '',
        snippet.excerpt.toLowerCase(),
      ].join('|');
      if (seen.has(key)) continue;
      seen.add(key);
      deduped.push(snippet);
    }
    return deduped.sort((a, b) => b.score - a.score);
  }
}
