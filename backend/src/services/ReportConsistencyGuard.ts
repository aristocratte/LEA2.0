import { PrismaClient, type Severity } from '@prisma/client';

export interface FindingsSummarySnapshot {
  total: number;
  bySeverity: Record<Severity, number>;
  confirmed: number;
  provisional: number;
  rejected: number;
}

export interface ConsistencyValidationResult {
  ok: boolean;
  mismatches: string[];
  dbSnapshot: FindingsSummarySnapshot;
}

export class ReportConsistencyGuard {
  constructor(private readonly prisma: PrismaClient) {}

  async captureDbSnapshot(pentestId: string): Promise<FindingsSummarySnapshot> {
    const findings = await this.prisma.finding.findMany({
      where: { pentest_id: pentestId },
      select: {
        severity: true,
        verification_state: true,
      },
    });

    const bySeverity: Record<Severity, number> = {
      CRITICAL: 0,
      HIGH: 0,
      MEDIUM: 0,
      LOW: 0,
      INFORMATIONAL: 0,
    };

    let confirmed = 0;
    let provisional = 0;
    let rejected = 0;

    for (const finding of findings) {
      bySeverity[finding.severity] += 1;
      if (finding.verification_state === 'CONFIRMED') confirmed += 1;
      else if (finding.verification_state === 'REJECTED') rejected += 1;
      else provisional += 1;
    }

    return {
      total: findings.length,
      bySeverity,
      confirmed,
      provisional,
      rejected,
    };
  }

  async validate(
    pentestId: string,
    summary: FindingsSummarySnapshot
  ): Promise<ConsistencyValidationResult> {
    const dbSnapshot = await this.captureDbSnapshot(pentestId);
    const mismatches: string[] = [];

    if (summary.total !== dbSnapshot.total) {
      mismatches.push(`total mismatch: summary=${summary.total}, db=${dbSnapshot.total}`);
    }

    for (const sev of Object.keys(dbSnapshot.bySeverity) as Severity[]) {
      if ((summary.bySeverity[sev] || 0) !== dbSnapshot.bySeverity[sev]) {
        mismatches.push(`severity mismatch ${sev}: summary=${summary.bySeverity[sev] || 0}, db=${dbSnapshot.bySeverity[sev]}`);
      }
    }

    if (summary.confirmed !== dbSnapshot.confirmed) {
      mismatches.push(`confirmed mismatch: summary=${summary.confirmed}, db=${dbSnapshot.confirmed}`);
    }
    if (summary.provisional !== dbSnapshot.provisional) {
      mismatches.push(`provisional mismatch: summary=${summary.provisional}, db=${dbSnapshot.provisional}`);
    }
    if (summary.rejected !== dbSnapshot.rejected) {
      mismatches.push(`rejected mismatch: summary=${summary.rejected}, db=${dbSnapshot.rejected}`);
    }

    return {
      ok: mismatches.length === 0,
      mismatches,
      dbSnapshot,
    };
  }
}
