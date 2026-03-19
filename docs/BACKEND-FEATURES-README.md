# Backend Features - Implementation Roadmap

## Overview

This directory contains detailed specifications for all backend features that need to be implemented or connected to make LEA Platform fully operational.

## Documentation Structure

```
docs/
├── BACKEND-FEATURES-00-OVERVIEW.md      (This file)
├── BACKEND-FEATURES-01-PENTEST.md       (Core pentest API)
├── BACKEND-FEATURES-02-PROVIDERS.md     (Provider management)
├── BACKEND-FEATURES-03-DASHBOARD.md     (Analytics & stats)
├── BACKEND-FEATURES-04-SWARM.md         (Agent swarm system)
├── BACKEND-FEATURES-05-CONTEXT.md       (Memory & context)
├── BACKEND-FEATURES-06-REPORTS.md       (Export & reports)
├── BACKEND-FEATURES-07-FILES.md         (File upload)
└── BACKEND-FEATURES-08-REALTIME.md      (SSE/WebSocket)
```

## Quick Reference

### By Priority

#### 🔴 Critical (MVP Blockers)
1. **Dashboard Analytics** - Currently client-side generated, needs backend
2. **File Upload** - Frontend ready, no backend endpoints
3. **Swarm Runtime Control** - Partial implementation

#### 🟡 High (Important for UX)
4. **Message Management** - Edit/delete/regenerate endpoints
5. **Finding Management** - Update status, verify findings
6. **Provider Health Automation** - Background health checks

#### 🟢 Medium (Nice to have)
7. **Report Generation** - PDF export, templates
8. **Advanced Context** - Vector search, cross-pentest memory
9. **WebSocket** - Bidirectional real-time

### By Frontend Store

| Store | Backend Status | Missing |
|-------|---------------|---------|
| usePentestStore | 🟡 Partial | Update pentest, todo CRUD, finding CRUD |
| useProviderStore | ✅ Complete | Health automation, model management |
| useSwarmStore | 🟡 Partial | Agent control, task management |
| useDashboardStats | 🔴 Missing | All endpoints (stats, activity, history) |
| useActivityFeed | 🔴 Missing | Real event feed endpoint |
| File Upload | 🔴 Missing | Upload, extraction, storage |

## Implementation Checklist

### Phase 1: Core MVP (Weeks 1-2)
- [ ] Dashboard stats endpoint
- [ ] Activity feed endpoint
- [ ] Scan history endpoint
- [ ] File upload endpoints
- [ ] Text extraction pipeline

### Phase 2: Enhanced UX (Weeks 3-4)
- [ ] Todo CRUD endpoints
- [ ] Finding management endpoints
- [ ] Message edit/delete
- [ ] Swarm agent control
- [ ] Provider health automation

### Phase 3: Advanced Features (Weeks 5-6)
- [ ] Report generation (PDF)
- [ ] Export endpoints
- [ ] Context vector search
- [ ] WebSocket support
- [ ] Batch operations

## API Consistency Guidelines

### Response Format
All endpoints should return:
```typescript
// Success
{ data: T }

// Error
{ error: string, details?: unknown }
```

### Pagination
```typescript
// Request
GET /api/resource?limit=20&offset=0

// Response
{
  data: T[],
  meta: {
    total: number,
    limit: number,
    offset: number,
    hasMore: boolean
  }
}
```

### Filtering
```typescript
GET /api/resource?status=active&severity=critical,high&from=2024-01-01
```

### Sorting
```typescript
GET /api/resource?sort=-created_at  // Descending
GET /api/resource?sort=severity,-cvss_score  // Multiple
```

## Database Migrations Needed

### New Tables
- [ ] `uploaded_files` - File storage metadata
- [ ] `events` - Event persistence for replay
- [ ] `report_templates` - Custom report templates
- [ ] `activity_log` - Real activity events

### Table Modifications
- [ ] `pentests` - Add analytics fields
- [ ] `findings` - Add verification fields
- [ ] `providers` - Add health check timestamps

## Testing Strategy

### Unit Tests
- All new service methods
- Data transformation functions
- Validation schemas

### Integration Tests
- API endpoint happy paths
- Error handling
- Authentication/authorization

### E2E Tests
- Full user workflows
- SSE stream consistency
- File upload → processing → usage

## Performance Targets

| Endpoint | Target Response Time |
|----------|---------------------|
| Dashboard stats | < 200ms |
| List pentests | < 100ms |
| Get messages | < 100ms |
| File upload | < 5s for 10MB |
| SSE connect | < 50ms |
| Report generate | < 30s |

## Security Checklist

- [ ] All endpoints authenticated
- [ ] Input validation (Zod schemas)
- [ ] SQL injection protection (Prisma)
- [ ] File type validation
- [ ] File size limits
- [ ] Virus scanning
- [ ] Rate limiting
- [ ] CORS configuration

## Getting Started

1. Read the overview (this file)
2. Pick a feature category by priority
3. Read the detailed spec
4. Check existing backend routes for patterns
5. Implement following the API guidelines
6. Add tests
7. Update this checklist

## Questions?

If something is unclear:
1. Check the frontend store/hook to understand expected data
2. Look at existing backend routes for patterns
3. Ask for clarification on specific endpoints

## Contributing

When implementing a feature:
1. Update the status in the feature doc
2. Add any deviations from spec
3. Document known issues
4. Update this roadmap
