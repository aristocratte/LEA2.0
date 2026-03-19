# Backend Features - Real-time Communication

## Current Implementation ✅

### SSE (Server-Sent Events) Endpoints
```
GET /api/pentests/:id/stream       - Main pentest event stream
GET /api/pentests/:id/swarm/stream - Swarm-specific event stream
```

## SSE Event Structure

### Standard Event Format
```typescript
interface SSEEvent {
  id: string;           // Event sequence ID
  event: string;        // Event type
  data: string;         // JSON-encoded payload
}
```

### Event Payload
```typescript
interface PentestEvent {
  runId: string;
  source: 'system' | 'agent' | 'tool' | 'user';
  audience: 'user' | 'internal';
  surfaceHint: 'main' | 'thinking' | 'activity' | 'approval';
  eventType: string;
  payload: Record<string, unknown>;
  timestamp: string;
}
```

## Event Types

### System Events
| Event | Description | Payload |
|-------|-------------|---------|
| `session.started` | Pentest started | `{ pentestId, target }` |
| `session.paused` | Pentest paused | `{ pentestId, reason }` |
| `session.resumed` | Pentest resumed | `{ pentestId }` |
| `session.completed` | Pentest finished | `{ pentestId, summary }` |
| `session.cancelled` | Pentest cancelled | `{ pentestId, reason }` |
| `session.error` | Error occurred | `{ pentestId, error }` |

### Agent Events
| Event | Description | Payload |
|-------|-------------|---------|
| `agent.spawned` | Agent created | `{ agentId, name, role }` |
| `agent.updated` | Status changed | `{ agentId, status, progress }` |
| `agent.completed` | Agent finished | `{ agentId, result }` |
| `agent.failed` | Agent error | `{ agentId, error }` |
| `agent.message` | Agent message | `{ agentId, content }` |

### Message Events
| Event | Description | Payload |
|-------|-------------|---------|
| `assistant.preamble` | AI introduction | `{ content }` |
| `assistant.message.start` | Start streaming | `{ messageId }` |
| `assistant.message.delta` | Content chunk | `{ messageId, delta }` |
| `assistant.message.done` | Stream complete | `{ messageId }` |
| `thinking.summary.start` | Thinking block | `{ }` |
| `thinking.summary.delta` | Thinking content | `{ delta }` |
| `thinking.summary.done` | Thinking complete | `{ }` |

### Tool Events
| Event | Description | Payload |
|-------|-------------|---------|
| `tool.call.started` | Tool execution | `{ toolName, parameters }` |
| `tool.call.completed` | Tool success | `{ toolName, output }` |
| `tool.call.failed` | Tool error | `{ toolName, error }` |
| `terminal.stream.start` | Terminal output | `{ }` |
| `terminal.stream.delta` | Terminal chunk | `{ content }` |
| `terminal.stream.done` | Terminal done | `{ exitCode }` |

### Finding Events
| Event | Description | Payload |
|-------|-------------|---------|
| `finding.created` | New finding | `{ findingId, title, severity }` |
| `finding.updated` | Finding changed | `{ findingId, changes }` |

### Approval Events
| Event | Description | Payload |
|-------|-------------|---------|
| `approval.requested` | Needs approval | `{ approvalId, toolName, preview }` |
| `approval.resolved` | Decision made | `{ approvalId, decision }` |

## Implementation Details

### Connection Management
```typescript
// SSEManager service handles connections
class SSEManager {
  private connections: Map<string, Response[]>;
  
  subscribe(pentestId: string, response: Response): void;
  unsubscribe(pentestId: string, response: Response): void;
  broadcast(pentestId: string, event: PentestEvent): void;
}
```

### Reconnection Support
- Events include `id` for replay
- Client sends `Last-Event-ID` header on reconnect
- Server replays events since that ID (if available)

### Keep-alive
- Heartbeat every 30 seconds
- Prevents proxy timeouts
- Format: `:heartbeat`

## Missing/Needs Improvement 🟡

### 1. WebSocket Alternative
**Current:** SSE only (one-way server→client)
**Need:** WebSocket for bidirectional

Use cases:
- Typing indicators
- Real-time collaboration
- Faster message sending

```
WS /api/ws/pentests/:id
```

### 2. Event Persistence
**Current:** Events lost on server restart
**Need:** Event store for replay

```sql
CREATE TABLE events (
  id BIGSERIAL PRIMARY KEY,
  pentest_id UUID,
  event_type VARCHAR(100),
  payload JSONB,
  created_at TIMESTAMP DEFAULT NOW()
);
```

### 3. Selective Subscriptions
**Current:** All clients receive all events
**Need:** Filter by event type

```
GET /api/pentests/:id/stream?types=agent,finding
```

### 4. Connection Pooling
**Current:** One connection per pentest per user
**Need:** Shared connections for efficiency

### 5. Rate Limiting
**Need:** Prevent event flooding
```typescript
// Max 100 events per second per connection
// Burst allowance: 200 events
```

## Frontend Integration

### useEventStream Hook
```typescript
function useEventStream(pentestId: string) {
  const [messages, setMessages] = useState<StreamMessage[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const [lastEventId, setLastEventId] = useState<number>(0);

  useEffect(() => {
    const url = getStreamUrl(pentestId, lastEventId);
    const eventSource = new EventSource(url);
    
    eventSource.onopen = () => setIsConnected(true);
    eventSource.onerror = () => setIsConnected(false);
    
    eventSource.addEventListener('assistant.message.delta', (e) => {
      const data = JSON.parse(e.data);
      setLastEventId(Number(e.lastEventId));
      // Update message content
    });
    
    return () => eventSource.close();
  }, [pentestId]);

  return { messages, isConnected };
}
```

### Connection Status Indicator
- Green: Connected
- Yellow: Reconnecting
- Red: Disconnected

## Event Buffering

### Client-side Buffer
```typescript
// Buffer events during reconnection
const pendingEvents: PentestEvent[] = [];

// Flush buffer on reconnect
function flushBuffer() {
  while (pendingEvents.length > 0) {
    processEvent(pendingEvents.shift());
  }
}
```

### Server-side Buffer
- Keep last 1000 events in memory
- Persist to Redis for multi-instance
- Auto-cleanup old events

## Scaling Considerations

### Single Server
- Max ~10,000 concurrent SSE connections
- Memory: ~100KB per connection
- Use for small deployments

### Multi-server (Redis)
```
┌─────────┐     ┌─────────┐     ┌─────────┐
│ Client 1│────→│ Server 1│────→│ Redis   │
└─────────┘     └─────────┘     │ Pub/Sub │
                                └────┬────┘
┌─────────┐     ┌─────────┐          │
│ Client 2│────→│ Server 2│←─────────┘
└─────────┘     └─────────┘
```

### CDN/Edge (Cloudflare Workers)
- Durable Objects for state
- Edge-level SSE streaming
- Global low-latency

## Security

### Authentication
- SSE connections need auth token
- Validate pentest access on connect
- Close connection on auth expiry

### Rate Limiting
- Max 1 connection per user per pentest
- Max 100 events/minute per connection
- Ban IPs with abnormal patterns

### Data Sanitization
- Never send API keys in events
- Mask sensitive data (passwords, tokens)
- Validate all payload fields

## Monitoring

### Metrics
- Active SSE connections
- Events per second
- Reconnection rate
- Error rate
- Latency percentiles

### Alerting
- Connection drops > 10%
- Event backlog > 1000
- Error rate > 1%

## Testing

### Load Testing
```bash
# Simulate 1000 concurrent connections
wrk -t10 -c1000 -d30s http://localhost:3001/api/pentests/123/stream
```

### Event Replay Testing
```typescript
// Verify events replay correctly on reconnect
test('reconnect replays missed events', async () => {
  const events = [];
  const es1 = connect('123');
  es1.onmessage = (e) => events.push(e);
  
  await waitForEvents(10);
  es1.close();
  
  const lastId = events[events.length - 1].id;
  const es2 = connect('123', lastId);
  
  // Should receive events after lastId
});
```
