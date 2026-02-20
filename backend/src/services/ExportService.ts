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

      if (maxWidth) {
        const lines = this.wrapText(text, font, size, maxWidth);
        lines.forEach(line => {
          if (y < margin + 30) {
            page = pdfDoc.addPage([595.28, 841.89]);
            y = height - margin;
          }
          page.drawText(line, { x, y, size, font, color });
          y -= size + 4;
        });
      } else {
        if (y < margin + 30) {
          page = pdfDoc.addPage([595.28, 841.89]);
          y = height - margin;
        }
        page.drawText(text, { x, y, size, font, color });
        y -= size + 4;
      }
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
    const stats = {
      total: report.findings.length,
      critical: report.findings.filter(f => f.severity === 'CRITICAL').length,
      high: report.findings.filter(f => f.severity === 'HIGH').length,
      medium: report.findings.filter(f => f.severity === 'MEDIUM').length,
      low: report.findings.filter(f => f.severity === 'LOW').length,
    };

    addText('Summary', { font: helveticaBold, size: 14 });
    y -= 5;
    addText(`Total Findings: ${stats.total}`, { size: 12 });
    addText(`Critical: ${stats.critical}`, { size: 12, color: colors.red });
    addText(`High: ${stats.high}`, { size: 12, color: colors.orange });
    addText(`Medium: ${stats.medium}`, { size: 12, color: colors.yellow });
    addText(`Low: ${stats.low}`, { size: 12, color: colors.green });
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
        // Finding title
        addText(`${index + 1}. ${finding.title}`, {
          font: helveticaBold,
          size: 11,
        });
        y -= 5;

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
    const words = text.split(' ');
    const lines: string[] = [];
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
    return lines;
  }

  /**
   * GÉNÈRE UN HTML INTERACTIF
   */
  async generateHtml(report: ReportWithRelations): Promise<string> {
    const template = this.getHtmlTemplate();
    const compiled = handlebars.compile(template);

    return compiled({
      report,
      generatedAt: new Date().toISOString(),
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
      statistics: report.stats,
      findings: report.findings.map(f => ({
        id: f.id,
        title: f.title,
        severity: f.severity,
        category: f.category,
        cvss: {
          score: f.cvss_score,
          vector: f.cvss_vector,
        },
        cve: f.cve_id,
        cwe: f.cwe_id,
        description: f.description,
        evidence: f.evidence,
        impact: f.impact,
        remediation: f.remediation,
        discoveredAt: f.discovered_at,
      })),
    };
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
      {{#each (array "Critical" "High" "Medium" "Low" "Info") as |s|}}
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
      <p>{{finding.description}}</p>
      {{#if finding.evidence}}
      <div class="finding-section">
        <h4>Evidence:</h4>
        <pre>{{finding.evidence}}</pre>
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
