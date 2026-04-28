import { describe, expect, it } from 'vitest';
import { ExportService } from '../ExportService.js';

function buildReportWithMultilineContent(): Parameters<ExportService['generatePdf']>[0] {
  const now = new Date('2026-04-27T10:00:00.000Z');

  return {
    id: 'report-1',
    pentest_id: 'pentest-1',
    title: 'Security Assessment - app.example.com',
    executive_summary: '## Executive summary\n\nLine one.\nLine two with **markdown**.',
    methodology: null,
    scope_description: null,
    status: 'COMPLETE',
    stats: null,
    template: 'standard',
    confidential: true,
    created_at: now,
    updated_at: now,
    completed_at: now,
    pentest: {
      target: 'app.example.com',
      scope: { inScope: ['app.example.com'] },
      started_at: now,
      ended_at: now,
    },
    findings: [
      {
        id: 'finding-1',
        pentest_id: 'pentest-1',
        report_id: 'report-1',
        title: 'Missing security headers',
        severity: 'LOW',
        category: 'Headers',
        description: 'Observed response:\nStrict-Transport-Security: missing\nX-Frame-Options: missing',
        evidence: 'GET /\nHTTP/1.1 200 OK',
        impact: null,
        remediation: 'Add HSTS.\nAdd X-Frame-Options or CSP frame-ancestors.',
        metadata: null,
        cvss_score: 3.1,
        cvss_vector: 'CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:N/I:L/A:N',
        cve_id: null,
        cwe_id: null,
        target_host: 'app.example.com',
        endpoint: '/',
        port: 443,
        protocol: 'https',
        phase_name: null,
        tool_used: null,
        source_signal_type: null,
        status: 'CONFIRMED',
        verified: true,
        false_positive: false,
        verification_state: 'CONFIRMED',
        proposed_severity: null,
        evidence_score: 80,
        reason_codes: [],
        created_at: now,
        discovered_at: now,
        updated_at: now,
      },
    ],
  };
}

describe('ExportService', () => {
  it('generates a PDF when report text contains multiline Markdown-like content', async () => {
    const service = new ExportService();

    const pdf = await service.generatePdf(buildReportWithMultilineContent());

    expect(pdf.subarray(0, 4).toString('utf8')).toBe('%PDF');
    expect(pdf.length).toBeGreaterThan(1000);
  });

  it('exports finding evidence, review state, and recalculated statistics in JSON', () => {
    const service = new ExportService();

    const json = service.generateJson(buildReportWithMultilineContent()) as {
      statistics: {
        total: number;
        review: { validated: number; draft: number; rejected: number };
        evidence: { present: number; missing: number };
      };
      findings: Array<{
        review: {
          state: string;
          verificationState: string;
          evidenceScore: number;
          reasonCodes: string[];
        };
        location: { display: string };
        source: { toolUsed: string | null };
        evidence: string | null;
        hasEvidence: boolean;
      }>;
    };

    expect(json.statistics).toMatchObject({
      total: 1,
      review: { validated: 1, draft: 0, rejected: 0 },
      evidence: { present: 1, missing: 0 },
    });
    expect(json.findings[0]).toMatchObject({
      review: {
        state: 'validated',
        verificationState: 'CONFIRMED',
        evidenceScore: 80,
        reasonCodes: [],
      },
      location: { display: 'app.example.com / https/443' },
      evidence: 'GET /\nHTTP/1.1 200 OK',
      hasEvidence: true,
    });
  });

  it('includes evidence and review metadata in HTML exports', async () => {
    const service = new ExportService();

    const html = await service.generateHtml(buildReportWithMultilineContent());

    expect(html).toContain('Validated');
    expect(html).toContain('Evidence present');
    expect(html).toContain('Score 80');
    expect(html).toContain('GET /');
    expect(html).toContain('app.example.com / https/443');
    expect(html).toContain('Informational');
  });
});
