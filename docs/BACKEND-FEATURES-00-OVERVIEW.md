# Backend Features to Connect - Overview

This document lists all backend functionalities that need to be implemented or connected to make the LEA Platform fully operational.

## Table of Contents

1. [Core Pentest API](./BACKEND-FEATURES-01-PENTEST.md)
2. [Provider Management](./BACKEND-FEATURES-02-PROVIDERS.md)
3. [Dashboard & Analytics](./BACKEND-FEATURES-03-DASHBOARD.md)
4. [Swarm & Agent System](./BACKEND-FEATURES-04-SWARM.md)
5. [Context & Memory Management](./BACKEND-FEATURES-05-CONTEXT.md)
6. [Reports & Export](./BACKEND-FEATURES-06-REPORTS.md)
7. [File Upload & Processing](./BACKEND-FEATURES-07-FILES.md)
8. [Real-time Communication](./BACKEND-FEATURES-08-REALTIME.md)

## Quick Status Overview

| Feature Category | Status | Priority |
|-----------------|--------|----------|
| Core Pentest CRUD | ✅ Implemented | High |
| Provider Management | ✅ Implemented | High |
| SSE Streaming | ✅ Implemented | High |
| Message Persistence | ✅ Implemented | Medium |
| Swarm System | 🟡 Partial | High |
| Dashboard Analytics | 🔴 Missing | Medium |
| File Upload | 🔴 Missing | Medium |
| Context Compaction | ✅ Implemented | Medium |
| Reports Generation | 🔴 Missing | Low |

## Legend

- ✅ **Implemented** - Backend endpoint exists and is functional
- 🟡 **Partial** - Some endpoints exist but need completion
- 🔴 **Missing** - No backend implementation yet
- ⚠️ **Issues** - Implemented but has known issues

## Next Steps Priority

### High Priority (Critical for MVP)
1. Complete Swarm runtime control endpoints
2. Dashboard analytics aggregation endpoints
3. File upload and text extraction

### Medium Priority (Important for UX)
1. Activity feed real events (not generated from pentest list)
2. Provider health check automated testing
3. Context query semantic search

### Low Priority (Nice to have)
1. Advanced report generation (PDF)
2. Workspace file tree browsing
3. Batch operations optimization
