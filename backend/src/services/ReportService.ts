/**
 * LEA Report Service
 *
 * Handles report creation and management
 */

import { PrismaClient, Severity } from '@prisma/client';

const prisma = new PrismaClient();

interface ReportStats {
  totalFindings: number;
  bySeverity: {
    Critical: number;
    High: number;
    Medium: number;
    Low: number;
    Informational: number;
  };
  byCategory: Record<string, number>;
  avgCvssScore: number | null;
  maxSeverity: string | null;
}

export class ReportService {

  /**
   * CRÉE AUTOMATIQUEMENT UN REPORT À LA FIN DU PENTEST
   * Appelé par completePentest() dans l'orchestrateur
   */
  async createReportFromPentest(pentestId: string) {
    // 1. Récupérer le pentest avec findings
    const pentest = await prisma.pentest.findUnique({
      where: { id: pentestId },
      include: {
        findings: {
          orderBy: [
            { severity: 'asc' }, // CRITICAL first (enum order is reversed in Prisma)
            { cvss_score: 'desc' },
          ],
        },
      },
    });

    if (!pentest) {
      throw new Error('Pentest not found');
    }

    // 2. Vérifier si report existe déjà
    const existing = await prisma.report.findUnique({
      where: { pentest_id: pentestId },
    });

    if (existing) {
      return existing;
    }

    // 3. Calculer les statistiques
    const stats = this.calculateStats(pentest.findings);

    // 4. Générer le résumé exécutif
    const executiveSummary = await this.generateExecutiveSummary(pentest, stats);

    // 5. Créer le report
    const report = await prisma.report.create({
      data: {
        pentest_id: pentest.id,
        title: `Security Assessment - ${pentest.target}`,
        executive_summary: executiveSummary,
        methodology: this.getDefaultMethodology(),
        scope_description: JSON.stringify(pentest.scope, null, 2),
        status: 'COMPLETE',
        stats: stats as any,
        completed_at: new Date(),
        findings: {
          connect: pentest.findings.map(f => ({ id: f.id })),
        },
      },
      include: {
        findings: true,
      },
    });

    return report;
  }

  /**
   * CALCULE LES STATISTIQUES DES FINDINGS
   */
  private calculateStats(findings: any[]): ReportStats {
    const severityOrder: Record<Severity, number> = {
      CRITICAL: 0,
      HIGH: 1,
      MEDIUM: 2,
      LOW: 3,
      INFORMATIONAL: 4,
    };

    const bySeverity = {
      Critical: findings.filter(f => f.severity === 'CRITICAL').length,
      High: findings.filter(f => f.severity === 'HIGH').length,
      Medium: findings.filter(f => f.severity === 'MEDIUM').length,
      Low: findings.filter(f => f.severity === 'LOW').length,
      Informational: findings.filter(f => f.severity === 'INFORMATIONAL').length,
    };

    const byCategory = findings.reduce((acc, f) => {
      acc[f.category] = (acc[f.category] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    const avgCvssScore = this.calculateAvgCvss(findings);

    const maxSeverity = findings.length > 0
      ? findings.reduce((max, f) =>
          severityOrder[f.severity as Severity] < severityOrder[max as Severity]
            ? f.severity
            : max,
          'INFORMATIONAL' as Severity
        )
      : null;

    return {
      totalFindings: findings.length,
      bySeverity,
      byCategory,
      avgCvssScore,
      maxSeverity,
    };
  }

  /**
   * GÉNÈRE UN RÉSUMÉ EXÉCUTIF
   */
  private async generateExecutiveSummary(pentest: any, stats: ReportStats): Promise<string> {
    // Si pas de findings, retourner un message simple
    if (pentest.findings.length === 0) {
      return `A security assessment was performed on ${pentest.target}. No significant vulnerabilities were identified during this assessment.`;
    }

    // Sinon, générer un résumé template
    return `
A penetration test was conducted on ${pentest.target} to identify security vulnerabilities.

## Key Findings

The assessment identified **${stats.totalFindings} findings**:
- **${stats.bySeverity.Critical} Critical** severity vulnerabilities
- **${stats.bySeverity.High} High** severity vulnerabilities
- **${stats.bySeverity.Medium} Medium** severity vulnerabilities
- **${stats.bySeverity.Low} Low** severity vulnerabilities
- **${stats.bySeverity.Informational} Informational** findings

## Risk Assessment

${this.generateRiskAssessment(stats)}

## Recommendations

Immediate attention is required for critical and high severity findings to prevent potential security breaches.
`.trim();
  }

  private generateRiskAssessment(stats: ReportStats): string {
    if (stats.bySeverity.Critical > 0) {
      return `The presence of ${stats.bySeverity.Critical} critical vulnerability(ies) indicates a **HIGH RISK** security posture. Immediate remediation is strongly recommended.`;
    }
    if (stats.bySeverity.High > 0) {
      return `The presence of ${stats.bySeverity.High} high severity vulnerability(ies) indicates a **MEDIUM-HIGH RISK** security posture. Remediation should be prioritized.`;
    }
    if (stats.bySeverity.Medium > 0) {
      return `The presence of ${stats.bySeverity.Medium} medium severity vulnerability(ies) indicates a **MEDIUM RISK** security posture. Remediation is recommended.`;
    }
    return `The security posture appears **LOW RISK** based on the findings. Standard security practices should be maintained.`;
  }

  private calculateAvgCvss(findings: any[]): number | null {
    const withCvss = findings.filter(f => f.cvss_score !== null);
    if (withCvss.length === 0) return null;
    return withCvss.reduce((sum, f) => sum + f.cvss_score, 0) / withCvss.length;
  }

  private getDefaultMethodology(): string {
    return `
## Methodology

This penetration test was conducted following industry-standard methodologies including:

- **Reconnaissance**: Passive and active information gathering
- **Vulnerability Assessment**: Automated scanning and manual testing
- **Exploitation**: Controlled exploitation of identified vulnerabilities
- **Post-Exploitation**: Assessment of potential impact
- **Reporting**: Documentation of findings and recommendations

The assessment was performed using the LEA/EASM AI Platform with multi-agent orchestration.
`.trim();
  }
}
