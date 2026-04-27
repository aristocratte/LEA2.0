/**
 * LEA Report Routes
 *
 * REST API endpoints for report management
 */

import { FastifyInstance } from 'fastify';
import type { Prisma } from '@prisma/client';
import { z } from 'zod';
import { ReportService } from '../services/ReportService.js';
import { ExportService } from '../services/ExportService.js';
import { sseManager } from '../services/SSEManager.js';
import type {
  FastifyRequestWithParams,
  FastifyRequestWithReportsQuery,
} from '../types/fastify.d.js';
import type { FindingStatus, ReportStatus, Severity } from '../types/index.js';

const reportService = new ReportService();
const exportService = new ExportService();

export async function reportRoutes(fastify: FastifyInstance) {

  // ========================================
  // GET /api/reports - List all reports
  // ========================================
  fastify.get('/api/reports', async (request, reply) => {
    const schema = z.object({
      page: z.coerce.number().min(1).default(1),
      limit: z.coerce.number().min(1).max(100).default(20),
      status: z.enum(['DRAFT', 'COMPLETE', 'ARCHIVED']).optional(),
      severity: z.enum(['CRITICAL', 'HIGH', 'MEDIUM', 'LOW', 'INFORMATIONAL']).optional(),
      search: z.string().optional(),
      sortBy: z.enum(['created_at', 'title', 'target']).default('created_at'),
      order: z.enum(['asc', 'desc']).default('desc'),
    });

    const query = schema.parse(request.query);

    const where: { status?: ReportStatus; OR?: Array<{ title: { contains: string; mode: 'insensitive' } } | { pentest: { target: { contains: string; mode: 'insensitive' } } }>; findings?: { some: { severity: Severity } } } = {};
    if (query.status) where.status = query.status as ReportStatus;
    if (query.search) {
      where.OR = [
        { title: { contains: query.search, mode: 'insensitive' } },
        { pentest: { target: { contains: query.search, mode: 'insensitive' } } },
      ];
    }
    if (query.severity) {
      where.findings = { some: { severity: query.severity as Severity } };
    }

    const [reports, total] = await Promise.all([
      fastify.prisma.report.findMany({
        where,
        include: {
          pentest: { select: { target: true } },
          _count: { select: { findings: true } },
        },
        orderBy: { [query.sortBy]: query.order },
        skip: (query.page - 1) * query.limit,
        take: query.limit,
      }),
      fastify.prisma.report.count({ where }),
    ]);

    // Get max severity for each report
    const reportsWithSeverity = await Promise.all(
      reports.map(async (report) => {
        const findings = await fastify.prisma.finding.findMany({
          where: { report_id: report.id },
          select: { severity: true },
        });

        const severityOrder = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW', 'INFORMATIONAL'];
        const maxSeverity = findings.length > 0
          ? findings.reduce((min, f) =>
            severityOrder.indexOf(f.severity) < severityOrder.indexOf(min)
              ? f.severity
              : min,
            'INFORMATIONAL'
          )
          : null;

        return {
          ...report,
          findingsCount: report._count.findings,
          maxSeverity,
        };
      })
    );

    return {
      data: reportsWithSeverity,
      meta: {
        total,
        page: query.page,
        limit: query.limit,
        totalPages: Math.ceil(total / query.limit),
      },
    };
  });

  // ========================================
  // GET /api/reports/:id - Report detail
  // ========================================
  fastify.get('/api/reports/:id', async (request, reply) => {
    const { id } = request.params as FastifyRequestWithParams['params'];

    const report = await fastify.prisma.report.findUnique({
      where: { id },
      include: {
        pentest: {
          select: {
            target: true,
            scope: true,
            status: true,
            started_at: true,
            ended_at: true,
          },
        },
        findings: {
          orderBy: [
            { severity: 'asc' },
            { cvss_score: 'desc' },
          ],
        },
      },
    });

    if (!report) {
      return reply.code(404).send({ error: 'Report not found' });
    }

    // Compute fresh stats
    const stats = {
      totalFindings: report.findings.length,
      bySeverity: {
        Critical: report.findings.filter(f => f.severity === 'CRITICAL').length,
        High: report.findings.filter(f => f.severity === 'HIGH').length,
        Medium: report.findings.filter(f => f.severity === 'MEDIUM').length,
        Low: report.findings.filter(f => f.severity === 'LOW').length,
        Informational: report.findings.filter(f => f.severity === 'INFORMATIONAL').length,
      },
      byCategory: report.findings.reduce((acc, f) => {
        acc[f.category] = (acc[f.category] || 0) + 1;
        return acc;
      }, {} as Record<string, number>),
    };

    return {
      data: {
        ...report,
        stats,
      },
    };
  });

  // ========================================
  // PUT /api/reports/:id - Update report
  // ========================================
  fastify.put('/api/reports/:id', async (request, reply) => {
    const { id } = request.params as FastifyRequestWithParams['params'];

    const schema = z.object({
      title: z.string().min(1).optional(),
      executive_summary: z.string().optional(),
      methodology: z.string().optional(),
      status: z.enum(['DRAFT', 'COMPLETE', 'ARCHIVED']).optional(),
    });

    const body = schema.parse(request.body);

    const report = await fastify.prisma.report.update({
      where: { id },
      data: body,
    });

    return { data: report };
  });

  // ========================================
  // PUT /api/reports/:id/findings/:findingId
  // ========================================
  fastify.put('/api/reports/:id/findings/:findingId', async (request, reply) => {
    const { id, findingId } = request.params as { id: string; findingId: string };

    const schema = z.object({
      title: z.string().trim().min(1).optional(),
      severity: z.enum(['CRITICAL', 'HIGH', 'MEDIUM', 'LOW', 'INFORMATIONAL']).optional(),
      category: z.string().trim().min(1).optional(),
      description: z.string().trim().min(1).optional(),
      evidence: z.string().nullable().optional(),
      impact: z.string().nullable().optional(),
      remediation: z.string().nullable().optional(),
      cvss_score: z.number().min(0).max(10).nullable().optional(),
      cvss_vector: z.string().nullable().optional(),
      cve_id: z.string().nullable().optional(),
      cwe_id: z.string().nullable().optional(),
      target_host: z.string().nullable().optional(),
      endpoint: z.string().nullable().optional(),
      port: z.number().int().min(1).max(65535).nullable().optional(),
      protocol: z.string().nullable().optional(),
      status: z.enum(['OPEN', 'CONFIRMED', 'FALSE_POSITIVE', 'FIXED', 'RISK_ACCEPTED']).optional(),
    });

    const body = schema.parse(request.body);
    const existing = await fastify.prisma.finding.findFirst({
      where: { id: findingId, report_id: id },
      select: { id: true },
    });

    if (!existing) {
      return reply.code(404).send({ error: 'Finding not found in report' });
    }

    const data: Prisma.FindingUpdateInput = {};
    if (body.title !== undefined) data.title = body.title;
    if (body.severity !== undefined) data.severity = body.severity as Severity;
    if (body.category !== undefined) data.category = body.category;
    if (body.description !== undefined) data.description = body.description;
    if (body.evidence !== undefined) data.evidence = body.evidence;
    if (body.impact !== undefined) data.impact = body.impact;
    if (body.remediation !== undefined) data.remediation = body.remediation;
    if (body.cvss_score !== undefined) data.cvss_score = body.cvss_score;
    if (body.cvss_vector !== undefined) data.cvss_vector = body.cvss_vector;
    if (body.cve_id !== undefined) data.cve_id = body.cve_id;
    if (body.cwe_id !== undefined) data.cwe_id = body.cwe_id;
    if (body.target_host !== undefined) data.target_host = body.target_host;
    if (body.endpoint !== undefined) data.endpoint = body.endpoint;
    if (body.port !== undefined) data.port = body.port;
    if (body.protocol !== undefined) data.protocol = body.protocol;
    if (body.status !== undefined) data.status = body.status as FindingStatus;

    const finding = await fastify.prisma.finding.update({
      where: { id: findingId },
      data,
    });

    return { data: finding };
  });

  // ========================================
  // DELETE /api/reports/:id
  // ========================================
  fastify.delete('/api/reports/:id', async (request, reply) => {
    const { id } = request.params as FastifyRequestWithParams['params'];

    await fastify.prisma.report.delete({
      where: { id },
    });

    return reply.code(204).send();
  });

  // ========================================
  // GET /api/reports/:id/export/pdf
  // ========================================
  fastify.get('/api/reports/:id/export/pdf', async (request, reply) => {
    const { id } = request.params as FastifyRequestWithParams['params'];

    const report = await fastify.prisma.report.findUnique({
      where: { id },
      include: {
        pentest: true,
        findings: { orderBy: [{ severity: 'asc' }, { cvss_score: 'desc' }] },
      },
    });

    if (!report) {
      return reply.code(404).send({ error: 'Report not found' });
    }

    try {
      const pdfBuffer = await exportService.generatePdf(report as Parameters<typeof exportService.generatePdf>[0]);

      reply.header('Content-Type', 'application/pdf');
      reply.header('Content-Disposition', `attachment; filename="report-${report.pentest.target}.pdf"`);
      return reply.send(pdfBuffer);
    } catch (error) {
      console.error('PDF export error:', error);
      return reply.code(500).send({ error: 'Failed to generate PDF' });
    }
  });

  // ========================================
  // GET /api/reports/:id/export/html
  // ========================================
  fastify.get('/api/reports/:id/export/html', async (request, reply) => {
    const { id } = request.params as FastifyRequestWithParams['params'];

    const report = await fastify.prisma.report.findUnique({
      where: { id },
      include: {
        pentest: true,
        findings: true,
      },
    });

    if (!report) {
      return reply.code(404).send({ error: 'Report not found' });
    }

    const html = await exportService.generateHtml(report as Parameters<typeof exportService.generateHtml>[0]);

    reply.header('Content-Type', 'text/html');
    reply.header('Content-Disposition', `attachment; filename="report-${report.pentest.target}.html"`);
    return reply.send(html);
  });

  // ========================================
  // GET /api/reports/:id/export/json
  // ========================================
  fastify.get('/api/reports/:id/export/json', async (request, reply) => {
    const { id } = request.params as FastifyRequestWithParams['params'];

    const report = await fastify.prisma.report.findUnique({
      where: { id },
      include: {
        pentest: true,
        findings: true,
      },
    });

    if (!report) {
      return reply.code(404).send({ error: 'Report not found' });
    }

    return reply.send(exportService.generateJson(report as Parameters<typeof exportService.generateJson>[0]));
  });

  // ========================================
  // GET /api/pentests/:id/report - Get report by pentest
  // ========================================
  fastify.get('/api/pentests/:id/report', async (request, reply) => {
    const { id } = request.params as FastifyRequestWithParams['params'];

    const report = await fastify.prisma.report.findUnique({
      where: { pentest_id: id },
      include: {
        pentest: true,
        findings: { orderBy: [{ severity: 'asc' }, { cvss_score: 'desc' }] },
      },
    });

    if (!report) {
      // Si pas de report, le créer
      const newReport = await reportService.createReportFromPentest(id);
      return { data: newReport };
    }

    return { data: report };
  });

  // ========================================
  // POST /api/pentests/:id/complete - Complete & create report
  // ========================================
  fastify.post('/api/pentests/:id/complete', async (request, reply) => {
    const { id } = request.params as FastifyRequestWithParams['params'];

    const pentest = await fastify.prisma.pentest.findUnique({
      where: { id },
      select: { status: true, failure_reason: true },
    });

    if (!pentest) {
      return reply.code(404).send({ error: 'Pentest not found' });
    }

    if (pentest.status === 'ERROR' || pentest.failure_reason) {
      return reply.code(409).send({
        error: 'Pentest failed and cannot be completed',
        failure_reason: pentest.failure_reason,
      });
    }

    // Update pentest status
    await fastify.prisma.pentest.update({
      where: { id },
      data: {
        status: 'COMPLETED',
        ended_at: new Date(),
      },
    });

    // Create report
    const report = await reportService.createReportFromPentest(id);

    // Notify SSE clients
    sseManager.broadcast(id, {
      runId: id,
      source: 'system',
      audience: 'internal',
      surfaceHint: 'activity',
      eventType: 'session_complete',
      payload: {
        type: 'session_complete',
        reportId: report.id
      }
    });

    return { data: report };
  });
}
