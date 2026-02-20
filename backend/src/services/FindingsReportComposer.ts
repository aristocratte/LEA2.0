import { PrismaClient, type Severity } from '@prisma/client';
import type { FindingsSummarySnapshot } from './ReportConsistencyGuard.js';

interface ComposedReport {
  markdown: string;
  summary: FindingsSummarySnapshot;
}

const SEVERITY_ORDER: Severity[] = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW', 'INFORMATIONAL'];

export class FindingsReportComposer {
  constructor(private readonly prisma: PrismaClient) {}

  async compose(pentestId: string): Promise<ComposedReport> {
    const pentest = await this.prisma.pentest.findUnique({
      where: { id: pentestId },
      select: {
        id: true,
        target: true,
        started_at: true,
        ended_at: true,
        status: true,
      },
    });

    if (!pentest) {
      throw new Error('Pentest not found for report composition');
    }

    const findings = await this.prisma.finding.findMany({
      where: { pentest_id: pentestId },
      orderBy: [{ severity: 'asc' }, { evidence_score: 'desc' }, { updated_at: 'desc' }],
      select: {
        title: true,
        severity: true,
        category: true,
        endpoint: true,
        target_host: true,
        evidence_score: true,
        verification_state: true,
        remediation: true,
      },
    });

    const summary = this.buildSummary(findings);
    const markdown = this.buildMarkdown(pentest.target, pentest.started_at, pentest.ended_at, findings, summary);

    return { markdown, summary };
  }

  private buildSummary(
    findings: Array<{ severity: Severity; verification_state: 'PROVISIONAL' | 'CONFIRMED' | 'REJECTED' }>
  ): FindingsSummarySnapshot {
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

  private buildMarkdown(
    target: string,
    startedAt: Date | null,
    endedAt: Date | null,
    findings: Array<{
      title: string;
      severity: Severity;
      category: string;
      endpoint: string | null;
      target_host: string | null;
      evidence_score: number;
      verification_state: 'PROVISIONAL' | 'CONFIRMED' | 'REJECTED';
      remediation: string | null;
    }>,
    summary: FindingsSummarySnapshot
  ): string {
    const confirmedCritical = findings.filter(
      (f) => f.verification_state === 'CONFIRMED' && (f.severity === 'CRITICAL' || f.severity === 'HIGH')
    );
    const provisionalNotable = findings.filter(
      (f) => f.verification_state === 'PROVISIONAL' && (f.severity === 'MEDIUM' || f.severity === 'LOW')
    );

    const duration = this.formatDuration(startedAt, endedAt);

    const lines: string[] = [];
    lines.push('## Findings Agent Final Summary');
    lines.push('');
    lines.push(`- Target: ${target}`);
    lines.push(`- Duration: ${duration}`);
    lines.push(`- Total findings: ${summary.total}`);
    lines.push(`- Confirmed: ${summary.confirmed}`);
    lines.push(`- Provisional: ${summary.provisional}`);
    lines.push(`- Rejected: ${summary.rejected}`);
    lines.push('');
    lines.push('### Severity Breakdown');
    for (const sev of SEVERITY_ORDER) {
      lines.push(`- ${sev}: ${summary.bySeverity[sev]}`);
    }

    lines.push('');
    lines.push('### Confirmed Priority Findings');
    if (confirmedCritical.length === 0) {
      lines.push('- None');
    } else {
      for (const finding of confirmedCritical.slice(0, 8)) {
        const location = finding.endpoint || finding.target_host || 'n/a';
        lines.push(`- [${finding.severity}] ${finding.title} (${location}) — score ${finding.evidence_score}`);
      }
    }

    lines.push('');
    lines.push('### Provisional Findings (Need Validation)');
    if (provisionalNotable.length === 0) {
      lines.push('- None');
    } else {
      for (const finding of provisionalNotable.slice(0, 8)) {
        const location = finding.endpoint || finding.target_host || 'n/a';
        lines.push(`- [${finding.severity}] ${finding.title} (${location}) — evidence ${finding.evidence_score}`);
      }
    }

    lines.push('');
    lines.push('### Suggested Remediation Priority');
    const remediationList = findings
      .filter((f) => f.verification_state === 'CONFIRMED' && f.remediation)
      .slice(0, 5);

    if (remediationList.length === 0) {
      lines.push('- Continue monitoring and rerun focused checks after deployment changes.');
    } else {
      remediationList.forEach((f, idx) => {
        lines.push(`${idx + 1}. ${f.title}: ${String(f.remediation || '').split('\n')[0]}`);
      });
    }

    return lines.join('\n');
  }

  private formatDuration(startedAt: Date | null, endedAt: Date | null): string {
    if (!startedAt) return 'n/a';
    const end = endedAt || new Date();
    const ms = Math.max(0, end.getTime() - startedAt.getTime());
    const minutes = Math.floor(ms / 60000);
    const seconds = Math.floor((ms % 60000) / 1000);
    return `${minutes}m ${seconds}s`;
  }
}
