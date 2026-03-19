# Backend Features - Dashboard & Analytics

## Current Implementation 🔴

**Status:** Frontend generates stats client-side from pentest list. No dedicated backend endpoints.

### Frontend Hooks (Client-side only)
```typescript
// useDashboardStats.ts - Calculates from usePentestList
const stats = {
  activeScans: pentests.filter(p => p.status === 'RUNNING').length,
  queuedScans: pentests.filter(p => p.status === 'PAUSED').length,
  completedScans: pentests.filter(p => p.status === 'COMPLETED').length,
  riskScore: 78, // Hardcoded
  coverage: 89,  // Hardcoded
  totalAssets: pentests.length * 3, // Estimated
  totalFindings: sum of p._count.findings,
  newFindingsToday: totalFindings * 0.15, // Estimated
};

// useActivityFeed.ts - Generates from pentest list
const events = [
  { type: 'scan_started', timestamp, title },
  { type: 'scan_progress', progress: random },
  { type: 'scan_completed', description: findings count },
  { type: 'finding', severity: estimated },
];
```

## Required Backend Endpoints 🔴

### Dashboard Summary
```
GET /api/dashboard/stats
```
**Response:**
```typescript
{
  activeScans: number;
  queuedScans: number;
  completedScans: number;
  failedScans: number;
  riskScore: number;           // Calculated from findings severity
  coverage: number;            // % of assets scanned
  totalAssets: number;         // Unique targets
  totalFindings: number;
  newFindingsToday: number;
  avgScanDuration: number;     // minutes
  tokensUsedTotal: number;
  costTotal: number;           // USD
}
```

### Activity Feed
```
GET /api/dashboard/activity?limit=50&from=timestamp
```
**Response:**
```typescript
Array<{
  id: string;
  timestamp: string;
  type: 'scan_started' | 'scan_completed' | 'scan_failed' | 
        'finding_discovered' | 'agent_spawned' | 'phase_changed' |
        'tool_executed' | 'approval_requested';
  title: string;
  description?: string;
  scanId?: string;
  scanName?: string;
  severity?: 'critical' | 'high' | 'medium' | 'low';
  progress?: number;
  agentName?: string;
  toolName?: string;
}>;
```

### Scan History
```
GET /api/dashboard/history?limit=20&offset=0&status=&dateFrom=&dateTo=
```
**Response:**
```typescript
Array<{
  id: string;
  target: string;
  status: PentestStatus;
  type: PentestType;
  startedAt: string;
  endedAt?: string;
  duration?: number;           // minutes
  findingsCount: number;
  severityCounts: {
    critical: number;
    high: number;
    medium: number;
    low: number;
  };
  providerName?: string;
  modelName?: string;
}>;
```

### Trends & Analytics
```
GET /api/dashboard/trends?period=30d
```
**Response:**
```typescript
{
  period: string;              // '7d' | '30d' | '90d'
  scansByDay: Array<{ date: string; count: number; status: string }>;
  findingsByDay: Array<{ date: string; count: number; severity: string }>;
  riskScoreHistory: Array<{ date: string; score: number }>;
  topTargets: Array<{ target: string; scanCount: number; findingCount: number }>;
  severityDistribution: {
    critical: number;
    high: number;
    medium: number;
    low: number;
    info: number;
  };
}
```

### Real-time Metrics (for charts)
```
GET /api/dashboard/metrics/realtime
```
**Response:**
```typescript
{
  activeScans: number;
  activeAgents: number;
  toolsRunning: number;
  eventsPerSecond: number;
  queueDepth: number;
}
```

## Database Queries Needed

### Stats Aggregation
```sql
-- Active/queued/completed counts
SELECT status, COUNT(*) FROM pentests GROUP BY status;

-- Total findings with severity breakdown
SELECT severity, COUNT(*) FROM findings GROUP BY severity;

-- Today's new findings
SELECT COUNT(*) FROM findings 
WHERE created_at >= CURRENT_DATE;

-- Risk score calculation (weighted average)
SELECT 
  SUM(CASE severity 
    WHEN 'Critical' THEN 100 
    WHEN 'High' THEN 50 
    WHEN 'Medium' THEN 25 
    WHEN 'Low' THEN 10 
    ELSE 0 
  END) / COUNT(*) as risk_score
FROM findings;
```

### Activity Feed Query
```sql
-- Union of different event types
(SELECT id, created_at, 'scan_started' as type, target as title 
 FROM pentests WHERE created_at > NOW() - INTERVAL '7 days')
UNION ALL
(SELECT id, ended_at as created_at, 'scan_completed' as type, 
 CONCAT(target, ' completed') as title
 FROM pentests WHERE status = 'COMPLETED' AND ended_at > NOW() - INTERVAL '7 days')
UNION ALL
(SELECT id, created_at, 'finding_discovered' as type, title,
 severity FROM findings WHERE created_at > NOW() - INTERVAL '7 days')
ORDER BY created_at DESC
LIMIT 50;
```

## Frontend Components Using This Data

| Component | Hook | Backend Needed |
|-----------|------|----------------|
| OverviewCards | useDashboardStats | ✅ stats endpoint |
| ActivityFeed | useActivityFeed | ✅ activity endpoint |
| ScanHistoryTable | useScanHistory | ✅ history endpoint |
| DashboardCharts | useDashboardTrends | ✅ trends endpoint |

## Implementation Priority

### Phase 1 - Basic Stats
- Dashboard summary endpoint
- Activity feed endpoint
- Scan history endpoint

### Phase 2 - Analytics
- Trends endpoint with time-series data
- Real-time metrics
- Top targets aggregation

### Phase 3 - Advanced
- Custom date range filtering
- Export analytics (CSV/JSON)
- Comparative analytics (period over period)

## Cache Strategy

Dashboard data should be cached:
- Stats: 30 seconds
- Activity: 10 seconds
- Trends: 5 minutes
- Real-time: No cache (or 1 second)

## Frontend Fallback

While backend not ready, frontend uses:
- `usePentestList()` to get all pentests
- Client-side calculations for stats
- Generated mock activity events
- This creates unnecessary load - should migrate to dedicated endpoints
