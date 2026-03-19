# Backend Deprecations

## PentestAgent orchestration path

The legacy `PentestAgent` execution path remains wired through `backend/src/routes/pentests.ts` via `startPentestAgent()`, but it is now deprecated.

### Deprecated chain

- `backend/src/services/PentestAgent.ts`
- `backend/src/services/FindingsAgent.ts`
- `backend/src/services/FindingsEvidenceVerifier.ts`
- `backend/src/services/FindingQualityPolicy.ts`
- `backend/src/services/FindingsReportComposer.ts`
- `backend/src/services/ReportConsistencyGuard.ts`

### Removal condition

Remove the deprecated chain once `PentestSwarm` fully covers the remaining `PentestAgent` use cases and the route migration is complete.
