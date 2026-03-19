# Backend Features - Context & Memory Management

## Current Implementation ✅

### Implemented Endpoints
```
GET    /api/pentests/:id/context/snapshots   - List context snapshots
POST   /api/pentests/:id/context/compact     - Compact/archived old context
POST   /api/pentests/:id/context/query       - Semantic query of context
```

## Context Compaction

### Purpose
When conversations get too long, old messages and tool executions are "compacted" into a summary to save tokens while preserving important information.

### Endpoint
```
POST /api/pentests/:id/context/compact
```

**Request:**
```typescript
{
  reason?: string;  // Why compaction was triggered
}
```

**Response:**
```typescript
{
  snapshot: ContextSnapshot;
  memoryPayload: string;  // The summarized context
  stats: {
    beforeEstimatedTokens: number;
    afterEstimatedTokens: number;
    reductionPct: number;
    deltaMessages: number;  // How many messages archived
    deltaTools: number;     // How many tool executions archived
  };
}
```

### Database Schema
```sql
CREATE TABLE context_snapshots (
  id UUID PRIMARY KEY,
  pentest_id UUID REFERENCES pentests(id),
  memory_payload TEXT,           -- The summarized content
  archived_until_message_seq INTEGER,
  archived_until_tool_ts TIMESTAMP,
  token_estimate_before INTEGER,
  token_estimate_after INTEGER,
  trigger_reason VARCHAR(255),
  created_at TIMESTAMP DEFAULT NOW()
);
```

## Context Query (Semantic Search)

### Purpose
Search through the conversation history using natural language queries with semantic matching.

### Endpoint
```
POST /api/pentests/:id/context/query
```

**Request:**
```typescript
{
  query: string;      // Natural language query
  limit?: number;     // Max results (default 10)
}
```

**Response:**
```typescript
{
  results: Array<{
    type: 'message' | 'tool_execution' | 'finding';
    id: string;
    content: string;
    timestamp: string;
    relevanceScore: number;  // 0-1 similarity score
    metadata?: Record<string, unknown>;
  }>;
  totalResults: number;
  queryEmbedding?: number[];  // Vector representation
}
```

### Implementation Options

#### Option 1: Simple Keyword Search (Current)
- Uses PostgreSQL full-text search
- Fast but limited semantic understanding
- Good for exact matches

#### Option 2: Vector Embeddings (Recommended)
- Generate embeddings for all messages
- Store in pgvector extension
- Cosine similarity for semantic search
- Requires: OpenAI/Anthropic embedding API

#### Option 3: Hybrid Search
- Combine keyword + vector search
- Best relevance results
- More complex implementation

## Missing/Needs Improvement 🔴

### 1. Context Recovery
**Need:**
```
POST   /api/pentests/:id/context/restore/:snapshotId - Restore archived context
GET    /api/pentests/:id/context/archived            - List archived items
```

### 2. Smart Compaction Triggers
**Current:** Manual or size-based only
**Need:**
- Automatic compaction when token threshold reached
- Intelligent summarization using LLM
- Preserved key decisions and findings

### 3. Cross-Pentest Memory
**Need:**
```
GET    /api/context/global?query=          - Search across all pentests
POST   /api/pentests/:id/context/link      - Link to other pentest context
```

Useful for:
- Finding similar vulnerabilities across targets
- Reusing successful recon strategies
- Pattern recognition

### 4. Context Import/Export
**Need:**
```
POST   /api/pentests/:id/context/export    - Export context as JSON/Markdown
POST   /api/pentests/:id/context/import    - Import context from file
```

### 5. Context Visualization
**Need:**
```
GET    /api/pentests/:id/context/timeline   - Get context timeline
GET    /api/pentests/:id/context/graph      - Get knowledge graph
```

## Frontend Integration

### useContextStore (to be created)
```typescript
interface ContextState {
  snapshots: ContextSnapshot[];
  currentContextWindow: number;  // Current token window
  isCompacting: boolean;
  
  // Actions
  fetchSnapshots: () => Promise<void>;
  compactContext: (reason?: string) => Promise<void>;
  queryContext: (query: string) => Promise<ContextQueryResult>;
  restoreSnapshot: (snapshotId: string) => Promise<void>;
}
```

## Token Management

### Current Token Estimation
```typescript
function estimateTokens(text: string): number {
  // Rough approximation: 1 token ≈ 4 characters
  return Math.ceil(text.length / 4);
}
```

### Context Window Limits
| Provider | Context Window | Reserved for Output |
|----------|---------------|---------------------|
| Claude 3.5 Sonnet | 200K | 8K |
| GPT-4 Turbo | 128K | 4K |
| GLM-4 | 128K | 4K |

### Compaction Thresholds
- **Warning:** 70% of context window
- **Auto-compact:** 85% of context window
- **Hard limit:** 95% of context window (must compact)

## Database Storage

### Message Archiving
```sql
-- When compacting, messages before a sequence number are "archived"
-- They're not deleted, just excluded from active queries
SELECT * FROM messages 
WHERE pentest_id = ? 
  AND sequence > (SELECT archived_until_message_seq 
                  FROM context_snapshots 
                  WHERE pentest_id = ? 
                  ORDER BY created_at DESC 
                  LIMIT 1);
```

### Storage Optimization
- Archive old messages to cold storage (S3/minio)
- Keep only recent 100 messages in hot database
- Lazy-load archived content when needed

## Performance Considerations

### Compaction Performance
- Compaction runs in background
- Pentest continues during compaction
- Summary generation uses LLM (can be slow)
- Progress events via SSE

### Query Performance
- Without vector index: O(n) scan
- With pgvector index: O(log n) approximate search
- Hybrid search: O(log n + k) where k is result count

## Known Issues ⚠️

1. **Compaction Gaps** - Messages between compacted and active can lose context
2. **Query Accuracy** - Keyword search misses semantic meaning
3. **No Recovery** - Once compacted, original messages not easily recoverable
4. **Memory Pressure** - Large pentests still load all messages into memory
