import { randomUUID } from 'node:crypto';
import type { VerificationResult } from './FindingQualityPolicy.js';

interface CandidateForVerification {
  title: string;
  category: string;
  endpoint?: string;
  targetHost?: string;
  protocol?: string;
}

interface VerificationContext {
  target: string;
}

interface HttpSnapshot {
  ok: boolean;
  statusCode?: number;
  contentType?: string;
  lastModified?: string;
  etag?: string;
  bodySnippet?: string;
  firstBytesHex?: string;
  failureReason?: string;
}

const VERIFY_RETRIES = 3;
const VERIFY_BACKOFF_MS = 150;

export class FindingsEvidenceVerifier {
  async verify(
    candidate: CandidateForVerification,
    context: VerificationContext,
    isSensitive: boolean
  ): Promise<VerificationResult> {
    if (!isSensitive) {
      return {
        checked: false,
        sensitive: false,
        evidenceScore: 70,
        similarityToRoot: 0,
        similarityToProbe: 0,
        signature: 'NONE',
        reasonCodes: ['verification_skipped_non_sensitive'],
      };
    }

    const resolved = this.resolveUrls(candidate, context.target);
    if (!resolved) {
      return {
        checked: false,
        sensitive: true,
        evidenceScore: 20,
        similarityToRoot: 0,
        similarityToProbe: 0,
        signature: 'NONE',
        reasonCodes: ['verification_url_resolution_failed'],
        details: 'Unable to resolve candidate URL for deterministic verification.',
      };
    }

    const [root, probe, current] = await Promise.all([
      this.fetchWithRetry(resolved.rootUrl),
      this.fetchWithRetry(resolved.probeUrl),
      this.fetchWithRetry(resolved.candidateUrl),
    ]);

    const reasonCodes: string[] = [];
    if (!current.ok) {
      reasonCodes.push('candidate_fetch_failed');
      return {
        checked: true,
        sensitive: true,
        evidenceScore: 25,
        similarityToRoot: 0,
        similarityToProbe: 0,
        signature: 'NONE',
        statusCode: current.statusCode,
        contentType: current.contentType,
        reasonCodes,
        details: current.failureReason || 'Candidate request failed',
      };
    }

    const similarityToRoot = this.snapshotSimilarity(current, root);
    const similarityToProbe = this.snapshotSimilarity(current, probe);
    const fallbackSpaLike = similarityToRoot >= 0.9 && similarityToProbe >= 0.9;

    if (fallbackSpaLike) {
      reasonCodes.push('fallback_spa_like');
    }

    const signature = this.detectSignature(candidate, current);
    if (signature !== 'NONE') {
      reasonCodes.push(`signature_${signature.toLowerCase()}`);
    }

    if (current.statusCode && current.statusCode >= 200 && current.statusCode < 300) {
      reasonCodes.push('candidate_status_2xx');
    }

    if (current.contentType && /text\/html/i.test(current.contentType)) {
      reasonCodes.push('candidate_content_type_html');
    }

    const evidenceScore = this.computeEvidenceScore(candidate, current, {
      fallbackSpaLike,
      signature,
      similarityToRoot,
      similarityToProbe,
    });

    return {
      checked: true,
      sensitive: true,
      evidenceScore,
      similarityToRoot,
      similarityToProbe,
      signature,
      statusCode: current.statusCode,
      contentType: current.contentType,
      reasonCodes,
      details: [
        `root=${resolved.rootUrl}`,
        `probe=${resolved.probeUrl}`,
        `candidate=${resolved.candidateUrl}`,
        `similarityRoot=${similarityToRoot.toFixed(3)}`,
        `similarityProbe=${similarityToProbe.toFixed(3)}`,
      ].join(' | '),
    };
  }

  private resolveUrls(candidate: CandidateForVerification, fallbackTarget: string): {
    rootUrl: string;
    probeUrl: string;
    candidateUrl: string;
  } | null {
    const endpoint = String(candidate.endpoint || '').trim();
    const targetHost = this.cleanHost(candidate.targetHost || fallbackTarget);

    if (!targetHost && !/^https?:\/\//i.test(endpoint)) {
      return null;
    }

    let candidateUrl: string;
    let base: URL;

    try {
      if (/^https?:\/\//i.test(endpoint)) {
        const endpointUrl = new URL(endpoint);
        candidateUrl = endpointUrl.toString();
        base = new URL(`${endpointUrl.protocol}//${endpointUrl.host}/`);
      } else {
        const protocol = this.normalizeProtocol(candidate.protocol);
        base = new URL(`${protocol}://${targetHost}/`);
        const normalizedEndpoint = endpoint
          ? (endpoint.startsWith('/') ? endpoint : `/${endpoint}`)
          : '/';
        candidateUrl = new URL(normalizedEndpoint, base).toString();
      }
    } catch {
      return null;
    }

    const probePath = `/__lea_probe_${randomUUID()}`;
    return {
      rootUrl: new URL('/', base).toString(),
      probeUrl: new URL(probePath, base).toString(),
      candidateUrl,
    };
  }

  private normalizeProtocol(raw?: string): 'http' | 'https' {
    const protocol = String(raw || '').toLowerCase();
    if (protocol === 'http') return 'http';
    return 'https';
  }

  private cleanHost(raw: string): string {
    const value = String(raw || '').trim();
    if (!value) return '';

    if (/^https?:\/\//i.test(value)) {
      try {
        return new URL(value).host;
      } catch {
        return '';
      }
    }

    return value.replace(/\/$/, '');
  }

  private async fetchWithRetry(url: string): Promise<HttpSnapshot> {
    let attempt = 0;
    let lastFailure = 'unknown failure';

    while (attempt < VERIFY_RETRIES) {
      attempt += 1;
      try {
        const response = await fetch(url, {
          method: 'GET',
          redirect: 'follow',
          signal: AbortSignal.timeout(8000),
          headers: {
            accept: '*/*',
            'user-agent': 'LEA-FindingsEvidenceVerifier/1.0',
          },
        });

        const buffer = new Uint8Array(await response.arrayBuffer());
        const bodySnippet = this.decodeSnippet(buffer, 2048);
        const firstBytesHex = Buffer.from(buffer.slice(0, 4)).toString('hex');

        return {
          ok: true,
          statusCode: response.status,
          contentType: response.headers.get('content-type') || undefined,
          lastModified: response.headers.get('last-modified') || undefined,
          etag: response.headers.get('etag') || undefined,
          bodySnippet,
          firstBytesHex,
        };
      } catch (error: any) {
        lastFailure = error?.message || 'request error';
        if (attempt < VERIFY_RETRIES) {
          await this.sleep(VERIFY_BACKOFF_MS * attempt);
        }
      }
    }

    return {
      ok: false,
      failureReason: `Failed after ${VERIFY_RETRIES} attempts: ${lastFailure}`,
    };
  }

  private detectSignature(
    candidate: CandidateForVerification,
    snapshot: HttpSnapshot
  ): VerificationResult['signature'] {
    const endpoint = String(candidate.endpoint || '').toLowerCase();
    const title = String(candidate.title || '').toLowerCase();
    const body = String(snapshot.bodySnippet || '');

    if (/(^|\/)\.env($|\?|#)/.test(endpoint) || title.includes('environment')) {
      if (/^[A-Z][A-Z0-9_]{1,}\s*=\s*.+$/m.test(body)) {
        return 'ENV_KEY_VALUE';
      }
    }

    if (/(^|\/)\.git\//.test(endpoint) || title.includes('.git')) {
      if (/\[(core|remote|branch)\]/i.test(body) || /repositoryformatversion\s*=\s*\d+/i.test(body)) {
        return 'GIT_CONFIG';
      }
    }

    if (/\.zip($|\?|#)/.test(endpoint) || title.includes('backup')) {
      if (snapshot.firstBytesHex?.toLowerCase() === '504b0304') {
        return 'ZIP_MAGIC';
      }
    }

    if (/(^|\/)admin($|\/|\?|#)/.test(endpoint) || title.includes('admin')) {
      if (/<form[^>]*(login|sign in|auth)/i.test(body) || /type=["']password["']/i.test(body)) {
        return 'ADMIN_LOGIN';
      }
      if (/(username|password|signin|log in)/i.test(body)) {
        return 'GENERIC_AUTH';
      }
    }

    return 'NONE';
  }

  private computeEvidenceScore(
    candidate: CandidateForVerification,
    snapshot: HttpSnapshot,
    signals: {
      fallbackSpaLike: boolean;
      signature: VerificationResult['signature'];
      similarityToRoot: number;
      similarityToProbe: number;
    }
  ): number {
    let score = 20;

    if ((snapshot.statusCode || 0) >= 200 && (snapshot.statusCode || 0) < 300) {
      score += 10;
    }

    if (signals.fallbackSpaLike) {
      score -= 35;
    } else {
      score += 20;
    }

    switch (signals.signature) {
      case 'ENV_KEY_VALUE':
      case 'GIT_CONFIG':
      case 'ZIP_MAGIC':
        score += 65;
        break;
      case 'ADMIN_LOGIN':
      case 'GENERIC_AUTH':
        score += 48;
        break;
      case 'NONE':
      default:
        break;
    }

    const endpoint = String(candidate.endpoint || '').toLowerCase();

    if (/manifest\.json/.test(endpoint) && /text\/html/i.test(snapshot.contentType || '')) {
      score = Math.max(score, 72);
    }

    if (/robots\.txt/.test(endpoint) && /text\/html/i.test(snapshot.contentType || '')) {
      score = Math.max(score, 70);
    }

    if (signals.fallbackSpaLike && signals.signature === 'NONE') {
      score = Math.min(score, 45);
    }

    if (signals.similarityToRoot >= 0.95 && signals.similarityToProbe >= 0.95) {
      score = Math.min(score, 40);
    }

    return this.clamp(0, 100, score);
  }

  private snapshotSimilarity(a: HttpSnapshot, b: HttpSnapshot): number {
    if (!a.ok || !b.ok) return 0;

    const status = a.statusCode === b.statusCode ? 1 : 0;
    const ct = this.headerSimilarity(a.contentType, b.contentType);
    const lm = this.headerSimilarity(a.lastModified, b.lastModified);
    const et = this.headerSimilarity(a.etag, b.etag);
    const body = this.textSimilarity(a.bodySnippet || '', b.bodySnippet || '');

    return this.clamp(0, 1, (status * 0.2) + (ct * 0.2) + (lm * 0.15) + (et * 0.15) + (body * 0.3));
  }

  private headerSimilarity(a?: string, b?: string): number {
    if (!a && !b) return 1;
    if (!a || !b) return 0;
    if (a === b) return 1;
    return this.textSimilarity(a, b);
  }

  private textSimilarity(a: string, b: string): number {
    const left = this.normalizeText(a);
    const right = this.normalizeText(b);
    if (!left && !right) return 1;
    if (!left || !right) return 0;

    const leftBigrams = this.bigrams(left);
    const rightBigrams = this.bigrams(right);
    if (leftBigrams.size === 0 || rightBigrams.size === 0) {
      return left === right ? 1 : 0;
    }

    let shared = 0;
    for (const bg of leftBigrams) {
      if (rightBigrams.has(bg)) shared += 1;
    }

    return (2 * shared) / (leftBigrams.size + rightBigrams.size);
  }

  private bigrams(value: string): Set<string> {
    const out = new Set<string>();
    const trimmed = value.slice(0, 800);
    for (let i = 0; i < trimmed.length - 1; i += 1) {
      out.add(trimmed.slice(i, i + 2));
    }
    return out;
  }

  private normalizeText(value: string): string {
    return value
      .toLowerCase()
      .replace(/\s+/g, ' ')
      .replace(/[^a-z0-9\-_.:/= ]/g, '')
      .trim();
  }

  private decodeSnippet(buffer: Uint8Array, maxLen: number): string {
    if (!buffer.length) return '';

    const sliced = buffer.slice(0, maxLen);
    try {
      return new TextDecoder('utf-8', { fatal: false }).decode(sliced);
    } catch {
      return Buffer.from(sliced).toString('utf8');
    }
  }

  private async sleep(ms: number): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve, ms));
  }

  private clamp(min: number, max: number, value: number): number {
    return Math.min(max, Math.max(min, value));
  }
}
