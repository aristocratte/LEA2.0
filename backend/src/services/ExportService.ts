/**
 * LEA Export Service
 *
 * Handles PDF, HTML, and JSON export generation
 */

import { Report, Finding } from '@prisma/client';
import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';
import handlebars from 'handlebars';

interface ReportWithRelations extends Report {
  pentest: {
    target: string;
    scope: any;
    started_at: Date | null;
    ended_at: Date | null;
  };
  findings: Finding[];
}

type FindingReviewState = 'validated' | 'draft' | 'rejected';

export class ExportService {

  /**
   * GÉNÈRE UN PDF AVEC pdf-lib (léger, pas de Puppeteer)
   */
  async generatePdf(report: ReportWithRelations): Promise<Buffer> {
    const pdfDoc = await PDFDocument.create();

    // Embed fonts
    const helvetica = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const helveticaBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
    const courier = await pdfDoc.embedFont(StandardFonts.Courier);

    // Colors
    const colors = {
      black: rgb(0, 0, 0),
      white: rgb(1, 1, 1),
      gray: rgb(0.5, 0.5, 0.5),
      purple: rgb(0.55, 0.36, 0.96),
      red: rgb(1, 0.28, 0.34),
      orange: rgb(1, 0.62, 0.26),
      yellow: rgb(1, 0.85, 0.24),
      green: rgb(0, 1, 0.62),
      blue: rgb(0.23, 0.51, 0.96),
    };

    // Severity colors
    const severityColors: Record<string, any> = {
      CRITICAL: colors.red,
      HIGH: colors.orange,
      MEDIUM: colors.yellow,
      LOW: colors.green,
      INFORMATIONAL: colors.blue,
    };

    let page = pdfDoc.addPage([595.28, 841.89]); // A4
    const { width, height } = page.getSize();
    const margin = 50;
    let y = height - margin;

    // Helper to add text
    const addText = (
      text: string,
      options: {
        font?: any;
        size?: number;
        color?: any;
        x?: number;
        maxWidth?: number;
      } = {}
    ) => {
      const { font = helvetica, size = 11, color = colors.black, x = margin, maxWidth } = options;

      const lines = maxWidth
        ? this.wrapText(text, font, size, maxWidth)
        : this.normalizePdfText(text).split('\n');

      lines.forEach(line => {
        if (y < margin + 30) {
          page = pdfDoc.addPage([595.28, 841.89]);
          y = height - margin;
        }
        page.drawText(line || ' ', { x, y, size, font, color });
        y -= size + 4;
      });
    };

    // ========================================
    // COVER PAGE
    // ========================================

    // Title
    addText('SECURITY ASSESSMENT REPORT', {
      font: helveticaBold,
      size: 28,
      color: colors.purple,
      x: margin,
    });
    y -= 20;

    // Target
    addText(`Target: ${report.pentest.target}`, {
      font: helveticaBold,
      size: 18,
    });
    y -= 10;

    // Date
    addText(`Date: ${new Date(report.created_at).toLocaleDateString()}`, {
      size: 12,
      color: colors.gray,
    });
    y -= 30;

    // Stats box
    const stats = this.buildExportStats(report.findings);

    addText('Summary', { font: helveticaBold, size: 14 });
    y -= 5;
    addText(`Total Findings: ${stats.total}`, { size: 12 });
    addText(`Validated: ${stats.review.validated}`, { size: 12, color: colors.green });
    addText(`Draft / Needs Review: ${stats.review.draft}`, { size: 12, color: colors.orange });
    addText(`Evidence Missing: ${stats.evidence.missing}`, { size: 12, color: colors.red });
    addText(`Critical: ${stats.bySeverity.CRITICAL}`, { size: 12, color: colors.red });
    addText(`High: ${stats.bySeverity.HIGH}`, { size: 12, color: colors.orange });
    addText(`Medium: ${stats.bySeverity.MEDIUM}`, { size: 12, color: colors.yellow });
    addText(`Low: ${stats.bySeverity.LOW}`, { size: 12, color: colors.green });
    y -= 30;

    // ========================================
    // EXECUTIVE SUMMARY
    // ========================================

    if (report.executive_summary) {
      addText('Executive Summary', { font: helveticaBold, size: 16, color: colors.purple });
      y -= 10;
      addText(report.executive_summary, { size: 10, maxWidth: width - margin * 2 });
      y -= 30;
    }

    // ========================================
    // FINDINGS
    // ========================================

    addText('Detailed Findings', { font: helveticaBold, size: 16, color: colors.purple });
    y -= 20;

    // Group by severity
    const severityOrder = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW', 'INFORMATIONAL'];

    severityOrder.forEach(severity => {
      const findings = report.findings.filter(f => f.severity === severity);
      if (findings.length === 0) return;

      // Section header
      addText(`${severity} (${findings.length})`, {
        font: helveticaBold,
        size: 14,
        color: severityColors[severity],
      });
      y -= 10;

      findings.forEach((finding, index) => {
        const reviewState = this.getFindingReviewState(finding);
        const location = this.getFindingLocation(finding);
        const source = finding.tool_used || finding.phase_name || finding.source_signal_type || 'LEA analysis';

        // Finding title
        addText(`${index + 1}. ${finding.title}`, {
          font: helveticaBold,
          size: 11,
        });
        y -= 5;

        addText(
          `Review: ${this.getFindingReviewLabel(finding)} | Evidence: ${this.hasEvidence(finding) ? 'present' : 'missing'} | Score: ${finding.evidence_score ?? 0}`,
          {
            size: 8,
            color: reviewState === 'validated' ? colors.green : colors.orange,
            maxWidth: width - margin * 2 - 20,
          }
        );

        addText(`Location: ${location} | Source: ${source}`, {
          size: 8,
          color: colors.gray,
          maxWidth: width - margin * 2 - 20,
        });
        y -= 3;

        // Description
        if (finding.description) {
          addText(finding.description, {
            size: 9,
            maxWidth: width - margin * 2 - 20,
          });
          y -= 5;
        }

        // CVSS
        if (finding.cvss_score) {
          addText(`CVSS: ${finding.cvss_score} (${finding.cvss_vector || 'N/A'})`, {
            size: 9,
            color: colors.gray,
          });
          y -= 3;
        }

        // Evidence
        if (finding.evidence) {
          addText('Evidence:', { font: helveticaBold, size: 9 });
          addText(finding.evidence, {
            font: courier,
            size: 8,
            color: colors.black,
            maxWidth: width - margin * 2 - 20,
          });
          y -= 5;
        } else {
          addText('Evidence: missing - keep this finding in review before client delivery.', {
            size: 9,
            color: colors.red,
            maxWidth: width - margin * 2 - 20,
          });
          y -= 5;
        }

        // Remediation
        if (finding.remediation) {
          addText('Remediation:', { font: helveticaBold, size: 9 });
          addText(finding.remediation, {
            size: 9,
            color: colors.green,
            maxWidth: width - margin * 2 - 20,
          });
        }

        y -= 15;
      });

      y -= 10;
    });

    // ========================================
    // FOOTER
    // ========================================

    addText('CONFIDENTIAL', {
      font: helveticaBold,
      size: 10,
      color: colors.gray,
      x: width / 2 - 40,
    });

    // Save
    const pdfBytes = await pdfDoc.save();
    return Buffer.from(pdfBytes);
  }

  /**
   * Helper to wrap text
   */
  private wrapText(text: string, font: any, size: number, maxWidth: number): string[] {
    const lines: string[] = [];
    const paragraphs = this.normalizePdfText(text).split('\n');

    paragraphs.forEach(paragraph => {
      const words = paragraph.trim().split(/\s+/).filter(Boolean);

      if (words.length === 0) {
        lines.push('');
        return;
      }

      let currentLine = '';

      words.forEach(word => {
        const testLine = currentLine ? `${currentLine} ${word}` : word;
        const testWidth = font.widthOfTextAtSize(testLine, size);

        if (testWidth > maxWidth && currentLine) {
          lines.push(currentLine);
          currentLine = word;
        } else {
          currentLine = testLine;
        }
      });

      if (currentLine) lines.push(currentLine);
    });

    return lines;
  }

  private normalizePdfText(text: string): string {
    return text.replace(/\r\n?/g, '\n').replace(/\t/g, '  ');
  }

  /**
   * GÉNÈRE UN HTML INTERACTIF
   */
  async generateHtml(report: ReportWithRelations): Promise<string> {
    const template = this.getHtmlTemplate();
    const compiled = handlebars.compile(template);
    const exportReport = this.buildTemplateReport(report);

    return compiled({
      report: exportReport,
      generatedAt: new Date().toISOString(),
      stats: this.buildExportStats(report.findings),
      severityColor: (severity: string) => {
        const colors: Record<string, string> = {
          CRITICAL: '#ff4757',
          HIGH: '#ff9f43',
          MEDIUM: '#ffd93d',
          LOW: '#00ff9f',
          INFORMATIONAL: '#3b82f6',
        };
        return colors[severity] || '#666';
      },
    });
  }

  /**
   * GÉNÈRE UN JSON POUR API
   */
  generateJson(report: ReportWithRelations): object {
    const stats = this.buildExportStats(report.findings);

    return {
      metadata: {
        id: report.id,
        title: report.title,
        target: report.pentest.target,
        generatedAt: new Date().toISOString(),
        createdAt: report.created_at,
      },
      summary: {
        executiveSummary: report.executive_summary,
        methodology: report.methodology,
      },
      statistics: stats,
      findings: report.findings.map(f => ({
        id: f.id,
        title: f.title,
        severity: f.severity,
        category: f.category,
        status: f.status,
        review: {
          state: this.getFindingReviewState(f),
          label: this.getFindingReviewLabel(f),
          verified: f.verified,
          falsePositive: f.false_positive,
          verificationState: f.verification_state,
          evidenceScore: f.evidence_score,
          reasonCodes: f.reason_codes,
        },
        cvss: {
          score: f.cvss_score,
          vector: f.cvss_vector,
        },
        cve: f.cve_id,
        cwe: f.cwe_id,
        location: {
          targetHost: f.target_host,
          endpoint: f.endpoint,
          port: f.port,
          protocol: f.protocol,
          display: this.getFindingLocation(f),
        },
        source: {
          phaseName: f.phase_name,
          toolUsed: f.tool_used,
          sourceSignalType: f.source_signal_type,
        },
        description: f.description,
        evidence: f.evidence,
        hasEvidence: this.hasEvidence(f),
        impact: f.impact,
        remediation: f.remediation,
        discoveredAt: f.discovered_at,
      })),
    };
  }

  private buildTemplateReport(report: ReportWithRelations): ReportWithRelations & { findings: Array<Finding & {
    review_state: FindingReviewState;
    review_label: string;
    has_evidence: boolean;
    location_display: string;
    source_display: string;
  }> } {
    return {
      ...report,
      findings: report.findings.map((finding) => ({
        ...finding,
        review_state: this.getFindingReviewState(finding),
        review_label: this.getFindingReviewLabel(finding),
        has_evidence: this.hasEvidence(finding),
        location_display: this.getFindingLocation(finding),
        source_display: finding.tool_used || finding.phase_name || finding.source_signal_type || 'LEA analysis',
      })),
    };
  }

  private buildExportStats(findings: Finding[]) {
    const bySeverity = {
      CRITICAL: 0,
      HIGH: 0,
      MEDIUM: 0,
      LOW: 0,
      INFORMATIONAL: 0,
    };
    const review = {
      validated: 0,
      draft: 0,
      rejected: 0,
    };
    const evidence = {
      present: 0,
      missing: 0,
    };

    findings.forEach((finding) => {
      bySeverity[finding.severity] += 1;
      review[this.getFindingReviewState(finding)] += 1;
      if (this.hasEvidence(finding)) evidence.present += 1;
      else evidence.missing += 1;
    });

    return {
      total: findings.length,
      bySeverity,
      review,
      evidence,
    };
  }

  private getFindingReviewState(finding: Finding): FindingReviewState {
    if (
      finding.verification_state === 'REJECTED'
      || finding.false_positive
      || finding.status === 'FALSE_POSITIVE'
    ) {
      return 'rejected';
    }

    if (
      finding.verification_state === 'CONFIRMED'
      || finding.verified
      || finding.status === 'CONFIRMED'
    ) {
      return 'validated';
    }

    return 'draft';
  }

  private getFindingReviewLabel(finding: Finding): string {
    const state = this.getFindingReviewState(finding);
    if (state === 'validated') return 'Validated';
    if (state === 'rejected') return 'Rejected';
    return 'Draft / Needs Review';
  }

  private hasEvidence(finding: Finding): boolean {
    return Boolean(finding.evidence?.trim());
  }

  private getFindingLocation(finding: Finding): string {
    const host = finding.target_host || 'target';
    const endpoint = finding.endpoint || '';
    const service = finding.port
      ? `${finding.protocol || 'tcp'}/${finding.port}`
      : '';

    return [host, endpoint, service].filter(Boolean).join(' ');
  }

  /**
   * TEMPLATE HTML POUR EXPORT
   */
  private getHtmlTemplate(): string {
    return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>{{report.title}}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      line-height: 1.6;
      color: #1a1a1a;
      background: #f5f5f5;
      padding: 20px;
    }
    .container {
      max-width: 1200px;
      margin: 0 auto;
      background: white;
      padding: 40px;
      border-radius: 8px;
      box-shadow: 0 2px 8px rgba(0,0,0,0.1);
    }
    h1 {
      font-size: 32px;
      font-weight: 700;
      margin-bottom: 10px;
      color: #2563eb;
    }
    .meta {
      display: flex;
      gap: 30px;
      color: #666;
      font-size: 14px;
      margin-bottom: 30px;
      padding-bottom: 20px;
      border-bottom: 2px solid #e5e7eb;
    }
    h2 {
      font-size: 24px;
      font-weight: 600;
      margin: 30px 0 20px;
      color: #111;
    }
    .stats {
      display: flex;
      gap: 20px;
      margin: 20px 0;
    }
    .stat-box {
      flex: 1;
      padding: 20px;
      border-radius: 8px;
      text-align: center;
      background: #f8fafc;
      border: 1px solid #e2e8f0;
    }
    .stat-value {
      font-size: 36px;
      font-weight: 700;
      color: #2563eb;
    }
    .stat-label {
      font-size: 14px;
      color: #666;
      margin-top: 5px;
    }
    .finding {
      border: 1px solid #e5e7eb;
      border-radius: 8px;
      padding: 20px;
      margin-bottom: 20px;
      background: #fafafa;
    }
    .finding-header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      margin-bottom: 15px;
    }
    .finding-title {
      font-size: 18px;
      font-weight: 600;
      color: #111;
    }
    .badge {
      display: inline-block;
      padding: 4px 12px;
      border-radius: 4px;
      font-size: 12px;
      font-weight: 600;
      text-transform: uppercase;
    }
    .badge.CRITICAL { background: #fecaca; color: #991b1b; }
    .badge.HIGH { background: #fed7aa; color: #9a3412; }
    .badge.MEDIUM { background: #fef08a; color: #854d0e; }
    .badge.LOW { background: #dbeafe; color: #1e40af; }
    .badge.INFORMATIONAL { background: #e5e7eb; color: #374151; }
    .review-row {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      margin: 10px 0 14px;
      font-size: 12px;
    }
    .review-badge {
      display: inline-flex;
      align-items: center;
      border-radius: 999px;
      border: 1px solid #e5e7eb;
      padding: 3px 10px;
      background: #fff;
      color: #374151;
      font-weight: 600;
    }
    .review-badge.validated { border-color: #bbf7d0; background: #f0fdf4; color: #166534; }
    .review-badge.draft { border-color: #fed7aa; background: #fff7ed; color: #9a3412; }
    .review-badge.rejected { border-color: #fecaca; background: #fef2f2; color: #991b1b; }
    .review-badge.missing { border-color: #fecaca; background: #fef2f2; color: #991b1b; }
    .review-badge.present { border-color: #bfdbfe; background: #eff6ff; color: #1e40af; }
    .finding-section {
      margin: 15px 0;
    }
    .finding-section h4 {
      font-size: 14px;
      font-weight: 600;
      color: #333;
      margin-bottom: 8px;
    }
    code, pre {
      background: #1e293b;
      color: #e2e8f0;
      padding: 15px;
      border-radius: 6px;
      font-family: 'Courier New', monospace;
      font-size: 13px;
      overflow-x: auto;
    }
    .footer {
      margin-top: 40px;
      padding-top: 20px;
      border-top: 1px solid #e5e7eb;
      text-align: center;
      color: #999;
      font-size: 12px;
    }
  </style>
</head>
<body>
  <div class="container">
    <h1>{{report.title}}</h1>
    <div class="meta">
      <div><strong>Target:</strong> {{report.pentest.target}}</div>
      <div><strong>Date:</strong> {{formatDate report.created_at}}</div>
    </div>

    <div class="stats">
      {{#each (array "Critical" "High" "Medium" "Low" "Informational") as |s|}}
      <div class="stat-box">
        <div class="stat-value">{{countSeverity ../report.findings s}}</div>
        <div class="stat-label">{{s}}</div>
      </div>
      {{/each}}
    </div>

    {{#if report.executive_summary}}
    <h2>Executive Summary</h2>
    <p>{{report.executive_summary}}</p>
    {{/if}}

    <h2>Detailed Findings</h2>
    {{#each report.findings as |finding|}}
    <div class="finding">
      <div class="finding-header">
        <div class="finding-title">{{finding.title}}</div>
        <span class="badge {{finding.severity}}">{{finding.severity}}</span>
      </div>
      <div class="review-row">
        <span class="review-badge {{finding.review_state}}">{{finding.review_label}}</span>
        <span class="review-badge {{#if finding.has_evidence}}present{{else}}missing{{/if}}">
          Evidence {{#if finding.has_evidence}}present{{else}}missing{{/if}}
        </span>
        <span class="review-badge">Score {{finding.evidence_score}}</span>
        <span class="review-badge">Location {{finding.location_display}}</span>
        <span class="review-badge">Source {{finding.source_display}}</span>
      </div>
      <p>{{finding.description}}</p>
      {{#if finding.evidence}}
      <div class="finding-section">
        <h4>Evidence:</h4>
        <pre>{{finding.evidence}}</pre>
      </div>
      {{else}}
      <div class="finding-section">
        <h4>Evidence:</h4>
        <p><strong>Missing.</strong> Keep this finding in review before client delivery.</p>
      </div>
      {{/if}}
      {{#if finding.remediation}}
      <div class="finding-section">
        <h4>Remediation:</h4>
        <p>{{finding.remediation}}</p>
      </div>
      {{/if}}
    </div>
    {{/each}}

    <div class="footer">
      Generated on {{generatedAt}} | Confidential
    </div>
  </div>
</body>
</html>
    `;
  }
}

// Register Handlebars helpers
handlebars.registerHelper('formatDate', (date: Date) => {
  return new Date(date).toLocaleDateString();
});

handlebars.registerHelper('countSeverity', (findings: Finding[], severity: string) => {
  return findings.filter(f => f.severity === severity.toUpperCase()).length;
});

handlebars.registerHelper('array', function() {
  return Array.from(arguments).slice(0, -1);
});

handlebars.registerHelper('severityColor', (severity: string) => {
  const colors: Record<string, string> = {
    CRITICAL: '#ff4757',
    HIGH: '#ff9f43',
    MEDIUM: '#ffd93d',
    LOW: '#00ff9f',
    INFORMATIONAL: '#3b82f6',
  };
  return colors[severity] || '#666';
});
