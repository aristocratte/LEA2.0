import net from 'node:net';
import { PrismaClient } from '@prisma/client';
import { kaliMcpClient } from './mcp/KaliMCPClient.js';
import { ScopeRecommendationService, type ScopeRecommendationSignal } from './ScopeRecommendationService.js';

const prisma = new PrismaClient();

interface ToolContext {
  pentestId: string;
  actor: string;
  target: string;
  inScope: string[];
  outOfScope: string[];
  scopeMode: 'extended';
}

export interface ScopeDiscoveryInput {
  pentestId: string;
  target: string;
  currentInScope: string[];
  currentOutOfScope: string[];
  providerId?: string;
  modelId?: string;
  actor?: string;
}

interface ParsedWhois {
  registrar?: string;
  registrarIanaId?: string;
  registrantOrg?: string;
  abuseEmail?: string;
  nameservers: string[];
  dnssec?: string;
  statuses: string[];
  creationDate?: string;
  updatedDate?: string;
  expiryDate?: string;
}

export interface ScopeDiscoveryCandidate {
  domain: string;
  confidence: number;
  recommended: boolean;
  recommendation_reason: string;
  evidence: ScopeRecommendationSignal;
}

export interface ScopeDiscoveryResult {
  proposal: {
    id: string;
    pentest_id: string;
    base_target: string;
    source: 'WHOIS_ORG_CORRELATION';
    status: 'PENDING' | 'PARTIAL' | 'APPROVED' | 'REJECTED';
    summary: Record<string, unknown> | null;
    decided_at: string | null;
    created_at: string;
    updated_at: string;
    candidates: Array<{
      id: string;
      proposal_id: string;
      domain: string;
      confidence: number;
      recommended: boolean;
      recommendation_reason: string | null;
      evidence: Record<string, unknown> | null;
      decision: 'PENDING' | 'APPROVED' | 'REJECTED';
      decided_at: string | null;
      created_at: string;
      updated_at: string;
    }>;
  } | null;
  warnings: string[];
}

interface DiscoveryEvidenceMap extends ScopeRecommendationSignal {
  candidate_whois_org?: string;
  candidate_registrar?: string;
}

const DOMAIN_RE = /\b(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}\b/gi;

export class ScopeDiscoveryService {
  private recommender = new ScopeRecommendationService();

  async discover(input: ScopeDiscoveryInput): Promise<ScopeDiscoveryResult> {
    const warnings: string[] = [];
    const baseHost = this.normalizeHost(input.target);
    if (!baseHost || !this.isDomain(baseHost) || net.isIP(baseHost) !== 0) {
      return {
        proposal: null,
        warnings: ['Scope discovery skipped: target is not a domain host'],
      };
    }

    const baseDomain = this.rootDomain(baseHost);
    const context = this.buildContext(input, baseDomain, input.actor || 'scope-discovery');

    const whoisBase = await kaliMcpClient.callTool(
      'whois_lookup',
      { target: baseDomain },
      45000,
      context
    );

    if (!whoisBase.success) {
      warnings.push(`WHOIS failed: ${whoisBase.error || 'unknown error'}`);
    }

    const baseWhois = this.parseWhois(whoisBase.output || whoisBase.error || '');

    const ensureAmass = await kaliMcpClient.callTool(
      'ensure_tool',
      { tool: 'amass', package: 'amass', manager: 'auto' },
      600000,
      this.buildContext(input, baseDomain, 'scope-discovery-remediation')
    );

    if (!ensureAmass.success) {
      warnings.push(`amass installation check failed: ${this.compactError(ensureAmass.error || 'unknown error')}`);
    }

    const amassDomains = await this.collectAmassDomains({
      baseDomain,
      registrantOrg: baseWhois.registrantOrg,
      context,
      warnings,
    });

    const ctResult = await kaliMcpClient.callTool(
      'shell_exec',
      {
        command: `curl -s "https://crt.sh/?q=%25.${baseDomain}&output=json"`,
        timeout: 60,
      },
      90000,
      context
    );

    if (!ctResult.success) {
      warnings.push(`crt.sh query failed: ${this.compactError(ctResult.error || 'unknown error')}`);
    }

    const ctDomains = this.extractCtDomains(ctResult.output || '');

    const evidenceMap = new Map<string, DiscoveryEvidenceMap>();
    for (const domain of amassDomains) {
      this.upsertEvidence(evidenceMap, domain, { from_amass: true });
    }

    for (const domain of ctDomains) {
      this.upsertEvidence(evidenceMap, domain, { from_ct: true });
    }

    const filteredDomains = Array.from(evidenceMap.keys())
      .map((domain) => this.normalizeDomain(domain))
      .filter((domain): domain is string => Boolean(domain))
      .filter((domain) => domain !== baseDomain)
      .filter((domain) => !this.isDomainInScope(domain, input.currentInScope))
      .filter((domain) => !this.isDomainInScope(domain, input.currentOutOfScope));

    const baseOrgNorm = this.normalizeOrg(baseWhois.registrantOrg || '');
    const baseRegistrarNorm = (baseWhois.registrar || '').trim().toLowerCase();
    const baseNameservers = new Set(baseWhois.nameservers.map((item) => item.toLowerCase()));

    const candidateWhoisLimit = 25;
    for (const domain of filteredDomains.slice(0, candidateWhoisLimit)) {
      const result = await kaliMcpClient.callTool(
        'shell_exec',
        {
          command: `whois ${domain} 2>&1 | head -n 350`,
          timeout: 60,
        },
        90000,
        context
      );

      if (!result.success) {
        continue;
      }

      const parsed = this.parseWhois(result.output || '');
      const evidence = evidenceMap.get(domain) || {};

      const candidateOrg = this.normalizeOrg(parsed.registrantOrg || '');
      if (baseOrgNorm && candidateOrg && baseOrgNorm === candidateOrg) {
        evidence.org_match = true;
        evidence.from_whois_correlation = true;
        evidence.candidate_whois_org = parsed.registrantOrg;
      }

      const overlap = parsed.nameservers
        .map((ns) => ns.toLowerCase())
        .filter((ns) => baseNameservers.has(ns));
      if (overlap.length > 0) {
        evidence.nameserver_overlap = Array.from(new Set(overlap)).slice(0, 5);
        evidence.from_whois_correlation = true;
      }

      const registrarNorm = (parsed.registrar || '').trim().toLowerCase();
      if (baseRegistrarNorm && registrarNorm && baseRegistrarNorm === registrarNorm) {
        evidence.candidate_registrar = parsed.registrar;
      }

      evidenceMap.set(domain, evidence);
    }

    for (const domain of filteredDomains) {
      const evidence = evidenceMap.get(domain) || {};
      const hasStrongSignal = Boolean(evidence.org_match) || Boolean((evidence.nameserver_overlap || []).length > 0) || Boolean(evidence.from_amass) || Boolean(evidence.from_ct) || Boolean(evidence.from_whois_correlation);
      const sameRegistrar = Boolean(evidence.candidate_registrar) && !hasStrongSignal;
      evidence.registrar_match_only = sameRegistrar;
      evidenceMap.set(domain, evidence);
    }

    const recommendationInput = filteredDomains.map((domain) => ({
      domain,
      evidence: evidenceMap.get(domain) || {},
    }));

    const recommendations = await this.recommender.recommend({
      target: baseDomain,
      orgName: baseWhois.registrantOrg,
      registrar: baseWhois.registrar,
      candidates: recommendationInput,
      providerId: input.providerId,
      modelId: input.modelId,
    });

    const candidates: ScopeDiscoveryCandidate[] = recommendations
      .map((item) => {
        const evidence = evidenceMap.get(item.domain) || {};
        return {
          domain: item.domain,
          confidence: item.confidence,
          recommended: item.recommended,
          recommendation_reason: item.reason,
          evidence,
        };
      })
      .sort((a, b) => {
        if (b.confidence !== a.confidence) return b.confidence - a.confidence;
        return a.domain.localeCompare(b.domain);
      });

    const summary = {
      target: baseDomain,
      registrar: baseWhois.registrar || null,
      registrarIanaId: baseWhois.registrarIanaId || null,
      registrantOrg: baseWhois.registrantOrg || null,
      abuseEmail: baseWhois.abuseEmail || null,
      nameservers: baseWhois.nameservers,
      dnssec: baseWhois.dnssec || null,
      statuses: baseWhois.statuses,
      creationDate: baseWhois.creationDate || null,
      updatedDate: baseWhois.updatedDate || null,
      expiryDate: baseWhois.expiryDate || null,
      discoveredCounts: {
        amass: amassDomains.length,
        ct: ctDomains.length,
        candidates: candidates.length,
        recommended: candidates.filter((candidate) => candidate.recommended).length,
      },
      warnings,
    };

    await this.upsertInformationalFinding({
      pentestId: input.pentestId,
      title: `Registrar Intelligence: ${baseDomain}`,
      description: `WHOIS intelligence collected for ${baseDomain}, including registrar, organization hints, nameservers, and lifecycle dates.`,
      evidence: this.compactEvidence([
        `Registrar: ${baseWhois.registrar || 'unknown'}`,
        `Registrant Org: ${baseWhois.registrantOrg || 'unknown'}`,
        `Nameservers: ${(baseWhois.nameservers || []).join(', ') || 'none'}`,
        `DNSSEC: ${baseWhois.dnssec || 'unknown'}`,
      ]),
      metadata: {
        source: 'whois',
        target: baseDomain,
        registrar: baseWhois.registrar || null,
        registrarIanaId: baseWhois.registrarIanaId || null,
        registrantOrg: baseWhois.registrantOrg || null,
        nameservers: baseWhois.nameservers,
        dnssec: baseWhois.dnssec || null,
        statuses: baseWhois.statuses,
        creationDate: baseWhois.creationDate || null,
        updatedDate: baseWhois.updatedDate || null,
        expiryDate: baseWhois.expiryDate || null,
        abuseEmail: baseWhois.abuseEmail || null,
      },
    });

    await this.upsertInformationalFinding({
      pentestId: input.pentestId,
      title: `Potential in-scope related domains: ${baseDomain}`,
      description: `Candidate domains correlated to ${baseDomain} were discovered and require manual scope confirmation before active testing.`,
      evidence: this.compactEvidence([
        `Candidates found: ${candidates.length}`,
        `Recommended by AI: ${candidates.filter((item) => item.recommended).length}`,
        ...candidates.slice(0, 12).map((item) => `${item.domain} (confidence ${item.confidence}, recommended ${item.recommended ? 'yes' : 'no'})`),
      ]),
      metadata: {
        source: 'scope_correlation',
        target: baseDomain,
        candidates: candidates.map((item) => ({
          domain: item.domain,
          confidence: item.confidence,
          recommended: item.recommended,
          reason: item.recommendation_reason,
          evidence: item.evidence,
        })),
      },
    });

    if (candidates.length === 0) {
      warnings.push('No candidate domains discovered for manual scope validation.');
      return {
        proposal: null,
        warnings: Array.from(new Set(warnings)),
      };
    }

    const proposalRecord = await prisma.scopeProposal.create({
      data: {
        pentest_id: input.pentestId,
        base_target: baseDomain,
        source: 'WHOIS_ORG_CORRELATION',
        status: 'PENDING',
        summary: summary as any,
        candidates: {
          create: candidates.map((candidate) => ({
            domain: candidate.domain,
            confidence: candidate.confidence,
            recommended: candidate.recommended,
            recommendation_reason: candidate.recommendation_reason,
            evidence: candidate.evidence as any,
            decision: 'PENDING',
          })),
        },
      },
      include: {
        candidates: {
          orderBy: [{ confidence: 'desc' }, { domain: 'asc' }],
        },
      },
    });

    return {
      proposal: {
        id: proposalRecord.id,
        pentest_id: proposalRecord.pentest_id,
        base_target: proposalRecord.base_target,
        source: proposalRecord.source,
        status: proposalRecord.status,
        summary: proposalRecord.summary as Record<string, unknown> | null,
        decided_at: proposalRecord.decided_at ? proposalRecord.decided_at.toISOString() : null,
        created_at: proposalRecord.created_at.toISOString(),
        updated_at: proposalRecord.updated_at.toISOString(),
        candidates: proposalRecord.candidates.map((candidate) => ({
          id: candidate.id,
          proposal_id: candidate.proposal_id,
          domain: candidate.domain,
          confidence: candidate.confidence,
          recommended: candidate.recommended,
          recommendation_reason: candidate.recommendation_reason,
          evidence: candidate.evidence as Record<string, unknown> | null,
          decision: candidate.decision,
          decided_at: candidate.decided_at ? candidate.decided_at.toISOString() : null,
          created_at: candidate.created_at.toISOString(),
          updated_at: candidate.updated_at.toISOString(),
        })),
      },
      warnings,
    };
  }

  private async collectAmassDomains(input: {
    baseDomain: string;
    registrantOrg?: string;
    context: ToolContext;
    warnings: string[];
  }): Promise<string[]> {
    const domains = new Set<string>();
    const quotedDomain = this.shellQuote(input.baseDomain);
    const registrantOrg = this.normalizeRegistrantOrg(input.registrantOrg || '');
    let intelSupported = true;

    const intelCommands: string[] = [
      `amass intel -d ${quotedDomain} -whois -active=false -timeout 1 2>&1`,
    ];
    if (registrantOrg) {
      intelCommands.push(`amass intel -org ${this.shellQuote(registrantOrg)} -whois -active=false -timeout 1 2>&1`);
    }

    for (const command of intelCommands) {
      if (!intelSupported) break;
      const result = await kaliMcpClient.callTool(
        'shell_exec',
        { command, timeout: 180 },
        200000,
        input.context
      );

      if (!result.success) {
        const err = String(result.error || '');
        if (err.toLowerCase().includes('subcommand provided but not defined: intel')) {
          intelSupported = false;
          continue;
        }
        input.warnings.push(`amass intel failed: ${this.compactError(err || 'unknown error')}`);
        continue;
      }

      for (const domain of this.extractDomains(result.output || '')) {
        domains.add(domain);
      }
    }

    const enumResult = await kaliMcpClient.callTool(
      'shell_exec',
      {
        command: `amass enum -passive -d ${quotedDomain} -timeout 1 2>&1`,
        timeout: 210,
      },
      240000,
      input.context
    );

    if (!enumResult.success) {
      input.warnings.push(`amass enum failed: ${this.compactError(enumResult.error || 'unknown error')}`);
      return Array.from(domains);
    }

    for (const domain of this.extractDomains(enumResult.output || '')) {
      domains.add(domain);
    }

    return Array.from(domains);
  }

  private buildContext(input: ScopeDiscoveryInput, target: string, actor = 'scope-discovery'): ToolContext {
    return {
      pentestId: input.pentestId,
      actor,
      target,
      inScope: input.currentInScope,
      outOfScope: input.currentOutOfScope,
      scopeMode: 'extended',
    };
  }

  private normalizeHost(target: string): string {
    const value = String(target || '').trim();
    if (!value) return '';

    if (value.includes('://')) {
      try {
        return new URL(value).hostname.toLowerCase();
      } catch {
        return '';
      }
    }

    return value.split('/')[0].split(':')[0].toLowerCase();
  }

  private normalizeDomain(value: string): string {
    const host = this.normalizeHost(value)
      .replace(/^\*+\./, '')
      .replace(/^\.+/, '')
      .replace(/\.+$/, '');
    if (!this.isDomain(host)) return '';
    return host;
  }

  private isDomain(value: string): boolean {
    return /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/i.test(value);
  }

  private rootDomain(host: string): string {
    const clean = this.normalizeDomain(host);
    const parts = clean.split('.').filter(Boolean);
    if (parts.length <= 2) return clean;
    return `${parts[parts.length - 2]}.${parts[parts.length - 1]}`;
  }

  private parseWhois(raw: string): ParsedWhois {
    const nameserverSet = new Set<string>();
    const statuses = new Set<string>();

    const nameServerPatterns = [
      /Name Server:\s*([^\s#]+)/gi,
      /nserver:\s*([^\s#]+)/gi,
      /Nameserver:\s*([^\s#]+)/gi,
    ];

    for (const pattern of nameServerPatterns) {
      let match: RegExpExecArray | null;
      while ((match = pattern.exec(raw)) !== null) {
        if (match[1]) {
          nameserverSet.add(this.normalizeDomain(match[1]) || match[1].trim().toLowerCase());
        }
      }
    }

    const statusPatterns = [/Domain Status:\s*([^\n\r]+)/gi, /Status:\s*([^\n\r]+)/gi];
    for (const pattern of statusPatterns) {
      let match: RegExpExecArray | null;
      while ((match = pattern.exec(raw)) !== null) {
        if (match[1]) {
          statuses.add(match[1].trim());
        }
      }
    }

    const registrar = this.firstCapture(raw, [
      /Registrar:\s*([^\n\r]+)/i,
      /Sponsoring Registrar:\s*([^\n\r]+)/i,
    ]);

    const registrantOrg = this.firstCapture(raw, [
      /Registrant Organization:\s*([^\n\r]+)/i,
      /Registrant Org(?:anization)?:\s*([^\n\r]+)/i,
      /^OrgName:\s*([^\n\r]+)/im,
      /^Organization:\s*([^\n\r]+)/im,
    ]);

    return {
      registrar,
      registrarIanaId: this.firstCapture(raw, [/Registrar IANA ID:\s*([^\n\r]+)/i]),
      registrantOrg,
      abuseEmail: this.firstCapture(raw, [/Registrar Abuse Contact Email:\s*([^\s\n\r]+)/i]),
      nameservers: Array.from(nameserverSet).filter(Boolean),
      dnssec: this.firstCapture(raw, [/DNSSEC:\s*([^\n\r]+)/i]),
      statuses: Array.from(statuses),
      creationDate: this.firstCapture(raw, [/Creation Date:\s*([^\n\r]+)/i, /Created On:\s*([^\n\r]+)/i]),
      updatedDate: this.firstCapture(raw, [/Updated Date:\s*([^\n\r]+)/i, /Last Updated On:\s*([^\n\r]+)/i]),
      expiryDate: this.firstCapture(raw, [/Registry Expiry Date:\s*([^\n\r]+)/i, /Expiration Date:\s*([^\n\r]+)/i]),
    };
  }

  private firstCapture(raw: string, patterns: RegExp[]): string | undefined {
    for (const pattern of patterns) {
      const match = raw.match(pattern);
      if (match?.[1]) {
        const value = match[1].trim();
        if (value) return value;
      }
    }
    return undefined;
  }

  private extractDomains(raw: string): string[] {
    const set = new Set<string>();
    DOMAIN_RE.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = DOMAIN_RE.exec(raw)) !== null) {
      const domain = this.normalizeDomain(match[0]);
      if (domain) set.add(domain);
    }
    return Array.from(set);
  }

  private extractCtDomains(raw: string): string[] {
    const domains = new Set<string>();

    const addDomain = (value: string) => {
      const domain = this.normalizeDomain(value);
      if (domain) domains.add(domain);
    };

    try {
      const parsed = JSON.parse(raw) as Array<{ name_value?: string; common_name?: string }>;
      if (Array.isArray(parsed)) {
        for (const row of parsed) {
          const names = [row.name_value || '', row.common_name || ''];
          for (const nameBlock of names) {
            if (!nameBlock) continue;
            nameBlock.split(/\s+/).forEach((value) => addDomain(value));
          }
        }
      }
    } catch {
      const extracted = this.extractDomains(raw);
      for (const domain of extracted) {
        addDomain(domain);
      }
    }

    return Array.from(domains);
  }

  private normalizeOrg(value: string): string {
    return value
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '')
      .trim();
  }

  private normalizeRegistrantOrg(value: string): string {
    const cleaned = String(value || '').trim();
    if (!cleaned) return '';
    const normalized = cleaned.toLowerCase();
    if (
      normalized.includes('data redacted')
      || normalized.includes('privacy')
      || normalized.includes('whoisguard')
      || normalized.includes('redacted for privacy')
    ) {
      return '';
    }
    return cleaned;
  }

  private shellQuote(value: string): string {
    return `'${String(value || '').replace(/'/g, `'\\''`)}'`;
  }

  private compactError(value: string): string {
    const text = String(value || '').replace(/\s+/g, ' ').trim();
    if (!text) return 'unknown error';
    return text.slice(0, 220);
  }

  private upsertEvidence(map: Map<string, DiscoveryEvidenceMap>, domain: string, patch: Partial<DiscoveryEvidenceMap>): void {
    const key = this.normalizeDomain(domain);
    if (!key) return;
    const existing = map.get(key) || {};
    map.set(key, { ...existing, ...patch });
  }

  private isDomainInScope(domain: string, scopeItems: string[]): boolean {
    if (!scopeItems || scopeItems.length === 0) return false;

    return scopeItems.some((item) => {
      const scopeValue = this.normalizeHost(item);
      if (!scopeValue) return false;

      if (scopeValue.startsWith('*.')) {
        const suffix = scopeValue.slice(2);
        return domain === suffix || domain.endsWith(`.${suffix}`);
      }

      if (net.isIP(scopeValue) !== 0) {
        return domain === scopeValue;
      }

      return domain === scopeValue || domain.endsWith(`.${scopeValue}`);
    });
  }

  private compactEvidence(lines: string[]): string {
    return lines.filter(Boolean).join('\n').slice(0, 50000);
  }

  private async upsertInformationalFinding(params: {
    pentestId: string;
    title: string;
    description: string;
    evidence: string;
    metadata: Record<string, unknown>;
  }): Promise<void> {
    const existing = await prisma.finding.findFirst({
      where: {
        pentest_id: params.pentestId,
        title: params.title,
        severity: 'INFORMATIONAL',
      },
      select: { id: true },
      orderBy: { discovered_at: 'desc' },
    });

    if (existing) {
      await prisma.finding.update({
        where: { id: existing.id },
        data: {
          description: params.description,
          evidence: params.evidence,
          metadata: params.metadata as any,
          tool_used: 'whois/amass/crt.sh',
          phase_name: 'RECON_PASSIVE',
        },
      });
      return;
    }

    await prisma.finding.create({
      data: {
        pentest_id: params.pentestId,
        title: params.title,
        severity: 'INFORMATIONAL',
        category: 'Asset Intelligence',
        description: params.description,
        evidence: params.evidence,
        metadata: params.metadata as any,
        status: 'OPEN',
        verified: true,
        false_positive: false,
        phase_name: 'RECON_PASSIVE',
        tool_used: 'whois/amass/crt.sh',
      },
    });
  }
}
