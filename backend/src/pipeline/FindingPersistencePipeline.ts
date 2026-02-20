/**
 * Finding Persistence Pipeline
 *
 * Résout ISSUE-004 & ISSUE-005: Pipeline complet pour la persistence des findings
 * Tool execution → Parsing → Enrichment → Deduplication → Persistence → SSE notification
 */

import { PrismaClient, Finding, ToolExecution } from '@prisma/client';

interface ParsedFinding {
  title: string;
  severity: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' | 'INFORMATIONAL';
  category: string;
  description: string;
  evidence?: string;
  impact?: string;
  remediation?: string;
  cvss_score?: number;
  cvss_vector?: string;
  cve_id?: string;
  cwe_id?: string;
  target_host?: string;
  endpoint?: string;
  port?: number;
  protocol?: string;
}

export abstract class OutputParser {
  abstract parse(output: string): Promise<ParsedFinding[]>;
}

export class FindingPersistencePipeline {
  constructor(
    private prisma: PrismaClient,
    private parsers: Map<string, OutputParser>,
    private sseEmitter?: (pentestId: string, event: any) => void
  ) {}

  /**
   * Process tool execution and extract findings
   */
  async processToolExecution(
    toolExecution: ToolExecution,
    pentestId: string
  ): Promise<Finding[]> {
    console.log(`[Pipeline] Processing tool execution: ${toolExecution.tool_name}`);

    // 1. Get appropriate parser
    const parser = this.parsers.get(toolExecution.tool_name);
    if (!parser) {
      console.log(`[Pipeline] No parser for tool: ${toolExecution.tool_name}`);
      return [];
    }

    // 2. Parse output
    let parsedFindings: ParsedFinding[] = [];
    try {
      parsedFindings = await parser.parse(toolExecution.output || '');
      console.log(`[Pipeline] Parsed ${parsedFindings.length} findings`);
    } catch (error) {
      console.error(`[Pipeline] Parse error:`, error);
      return [];
    }

    if (parsedFindings.length === 0) return [];

    // 3. Enrich findings
    const enrichedFindings = await this.enrichFindings(parsedFindings, pentestId);

    // 4. Deduplicate
    const uniqueFindings = await this.deduplicateFindings(enrichedFindings, pentestId);

    // 5. Persist to DB
    const findings = await this.persistFindings(uniqueFindings, pentestId, toolExecution);

    // 6. Emit SSE events
    findings.forEach(finding => {
      this.sseEmitter?.(pentestId, {
        type: 'finding',
        data: finding,
      });
    });

    console.log(`[Pipeline] ✓ Persisted ${findings.length} findings`);
    return findings;
  }

  /**
   * Enrich findings with additional context
   */
  private async enrichFindings(
    findings: ParsedFinding[],
    pentestId: string
  ): Promise<ParsedFinding[]> {
    // Get pentest context
    const pentest = await this.prisma.pentest.findUnique({
      where: { id: pentestId },
      select: { target: true },
    });

    const target = pentest?.target || 'unknown';

    return findings.map(finding => ({
      ...finding,
      // Set target_host if not specified
      target_host: finding.target_host || target,
      // Calculate CVSS if not present
      cvss_score: finding.cvss_score || this.calculateCVSS(finding.severity),
      // Generate remediation if not present
      remediation: finding.remediation || this.generateRemediation(finding),
      // Lookup CWE if not present
      cwe_id: finding.cwe_id || this.lookupCWE(finding.category),
    }));
  }

  /**
   * Calculate CVSS score from severity
   */
  private calculateCVSS(severity: string): number {
    const scores: Record<string, number> = {
      CRITICAL: 9.5,
      HIGH: 7.5,
      MEDIUM: 5.0,
      LOW: 2.5,
      INFORMATIONAL: 0.0,
    };
    return scores[severity] || 0.0;
  }

  /**
   * Generate remediation text
   */
  private generateRemediation(finding: ParsedFinding): string {
    const templates: Record<string, string> = {
      'Injection':
        'Use parameterized queries (prepared statements) to prevent injection attacks. Validate and sanitize all user inputs.',
      'XSS':
        'Encode all user-supplied data before rendering in the browser. Implement Content Security Policy (CSP) headers.',
      'Authentication':
        'Implement strong password policies and multi-factor authentication (MFA). Use secure session management.',
      'Configuration':
        'Review and harden configuration settings. Remove default credentials. Disable unnecessary features.',
      'Information Disclosure':
        'Restrict access to sensitive information. Implement proper access controls and error handling.',
    };

    return templates[finding.category] || 'Review security best practices for this vulnerability type.';
  }

  /**
   * Lookup CWE ID from category
   */
  private lookupCWE(category: string): string | undefined {
    const cweMap: Record<string, string> = {
      'Injection': 'CWE-89',
      'XSS': 'CWE-79',
      'Authentication': 'CWE-287',
      'Authorization': 'CWE-285',
      'Configuration': 'CWE-16',
      'Crypto': 'CWE-327',
      'Information Disclosure': 'CWE-200',
    };
    return cweMap[category];
  }

  /**
   * Deduplicate findings against existing ones
   */
  private async deduplicateFindings(
    findings: ParsedFinding[],
    pentestId: string
  ): Promise<ParsedFinding[]> {
    // Get existing findings for this pentest
    const existing = await this.prisma.finding.findMany({
      where: { pentest_id: pentestId },
      select: { title: true, target_host: true, endpoint: true },
    });

    // Filter out duplicates based on title + target + endpoint
    return findings.filter(f => {
      return !existing.some(
        e =>
          e.title === f.title &&
          e.target_host === f.target_host &&
          e.endpoint === f.endpoint
      );
    });
  }

  /**
   * Persist findings to database
   */
  private async persistFindings(
    findings: ParsedFinding[],
    pentestId: string,
    toolExecution: ToolExecution
  ): Promise<Finding[]> {
    const created: Finding[] = [];

    for (const f of findings) {
      try {
        const finding = await this.prisma.finding.create({
          data: {
            pentest_id: pentestId,
            title: f.title,
            severity: f.severity,
            category: f.category,
            description: f.description,
            evidence: f.evidence,
            impact: f.impact,
            remediation: f.remediation,
            cvss_score: f.cvss_score,
            cvss_vector: f.cvss_vector,
            cve_id: f.cve_id,
            cwe_id: f.cwe_id,
            target_host: f.target_host,
            endpoint: f.endpoint,
            port: f.port,
            protocol: f.protocol,
            phase_name: toolExecution.agent_role || 'UNKNOWN',
            tool_used: toolExecution.tool_name,
          },
        });
        created.push(finding);
      } catch (error) {
        console.error(`[Pipeline] Error persisting finding:`, error);
      }
    }

    return created;
  }
}

// ============================================
// NUCLEI PARSER
// ============================================

export class NucleiParser extends OutputParser {
  async parse(output: string): Promise<ParsedFinding[]> {
    const findings: ParsedFinding[] = [];

    // Nuclei outputs JSON lines
    const lines = output.split('\n').filter(l => l.trim());

    for (const line of lines) {
      try {
        const data = JSON.parse(line);

        if (data.type === 'finding') {
          findings.push({
            title: data.info?.name || 'Nuclei Finding',
            severity: this.mapSeverity(data.info?.severity),
            category: data.info?.tags?.[0] || 'Unknown',
            description: data.info?.description || '',
            evidence: JSON.stringify(data.matcher_status || {}),
            cve_id: data.info?.classification?.cve_id,
            cwe_id: data.info?.classification?.cwe_id,
            target_host: data.host,
            endpoint: data.path,
          });
        }
      } catch {
        // Skip non-JSON lines
      }
    }

    return findings;
  }

  private mapSeverity(severity: string): 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' | 'INFORMATIONAL' {
    const map: Record<string, 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' | 'INFORMATIONAL'> = {
      critical: 'CRITICAL',
      high: 'HIGH',
      medium: 'MEDIUM',
      low: 'LOW',
      info: 'INFORMATIONAL',
      informational: 'INFORMATIONAL',
    };
    return map[severity?.toLowerCase()] || 'INFORMATIONAL';
  }
}

// ============================================
// NMAP PARSER
// ============================================

export class NmapParser extends OutputParser {
  async parse(output: string): Promise<ParsedFinding[]> {
    const findings: ParsedFinding[] = [];

    // Parse open ports
    const portRegex = /(\d+)\/(tcp|udp)\s+(open|filtered)\s+(.+)/g;
    let match;

    while ((match = portRegex.exec(output)) !== null) {
      const [, port, protocol, state, service] = match;

      if (state === 'open') {
        findings.push({
          title: `Open Port: ${port}/${protocol}`,
          severity: 'INFORMATIONAL',
          category: 'Network',
          description: `Open ${protocol} port ${port} running ${service}`,
          port: parseInt(port),
          protocol: protocol,
        });
      }
    }

    return findings;
  }
}
