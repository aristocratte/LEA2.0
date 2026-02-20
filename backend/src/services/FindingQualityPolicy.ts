import type { Severity } from '@prisma/client';

export type VerificationState = 'PROVISIONAL' | 'CONFIRMED' | 'REJECTED';

export interface QualityCandidate {
  title: string;
  category: string;
  severity: Severity;
  description: string;
  endpoint?: string;
  targetHost?: string;
  classificationConfidence?: number;
  classificationBasis?: string;
}

export interface VerificationResult {
  checked: boolean;
  sensitive: boolean;
  evidenceScore: number;
  similarityToRoot: number;
  similarityToProbe: number;
  signature:
    | 'NONE'
    | 'ENV_KEY_VALUE'
    | 'GIT_CONFIG'
    | 'ZIP_MAGIC'
    | 'ADMIN_LOGIN'
    | 'GENERIC_AUTH';
  statusCode?: number;
  contentType?: string;
  reasonCodes: string[];
  details?: string;
}

export interface QualityDecision {
  verificationState: VerificationState;
  evidenceScore: number;
  reasonCodes: string[];
  severity: Severity;
  proposedSeverity?: Severity;
  verified: boolean;
  falsePositive: boolean;
  classificationConfidence: number;
  classificationBasis: string;
}

const SEVERITY_RANK: Record<Severity, number> = {
  CRITICAL: 5,
  HIGH: 4,
  MEDIUM: 3,
  LOW: 2,
  INFORMATIONAL: 1,
};

export class FindingQualityPolicy {
  private readonly confirmThreshold = 85;
  private readonly provisionalThreshold = 60;

  evaluate(candidate: QualityCandidate, verification: VerificationResult): QualityDecision {
    const reasonCodes = [...verification.reasonCodes];
    const proposedSeverity = candidate.severity;
    const evidenceScore = this.clamp(0, 100, verification.evidenceScore);

    let verificationState: VerificationState;
    if (evidenceScore >= this.confirmThreshold) {
      verificationState = 'CONFIRMED';
    } else if (evidenceScore >= this.provisionalThreshold) {
      verificationState = 'PROVISIONAL';
    } else {
      verificationState = 'REJECTED';
    }

    const hasFallbackSignal = reasonCodes.includes('fallback_spa_like');
    const hasStrongSignature = verification.signature !== 'NONE';

    if (hasFallbackSignal && !hasStrongSignature) {
      verificationState = evidenceScore >= this.provisionalThreshold ? 'PROVISIONAL' : 'REJECTED';
      reasonCodes.push('fallback_spa_bias');
    }

    let severity: Severity = proposedSeverity;

    // Strict policy: High/Critical cannot remain unless confirmed.
    if (verificationState !== 'CONFIRMED' && SEVERITY_RANK[severity] >= SEVERITY_RANK.HIGH) {
      severity = 'INFORMATIONAL';
      reasonCodes.push('high_requires_confirmation_downgrade');
    }

    if (verificationState === 'REJECTED') {
      severity = 'INFORMATIONAL';
      reasonCodes.push('rejected_low_evidence');
    }

    if (verification.sensitive && verificationState !== 'CONFIRMED') {
      reasonCodes.push('sensitive_surface_unconfirmed');
    }

    const classificationConfidence = this.computeConfidence(
      this.clamp(0, 100, candidate.classificationConfidence ?? 70),
      verificationState,
      evidenceScore
    );

    const classificationBasis = [
      candidate.classificationBasis || 'quality-policy',
      `verification_state:${verificationState}`,
      `evidence_score:${evidenceScore}`,
    ].join(' | ');

    return {
      verificationState,
      evidenceScore,
      reasonCodes: this.dedupe(reasonCodes),
      severity,
      proposedSeverity,
      verified: verificationState === 'CONFIRMED',
      falsePositive: verificationState === 'REJECTED',
      classificationConfidence,
      classificationBasis,
    };
  }

  isSensitiveSurface(candidate: Pick<QualityCandidate, 'title' | 'endpoint' | 'category'>): boolean {
    const endpoint = String(candidate.endpoint || '').toLowerCase();
    const title = String(candidate.title || '').toLowerCase();
    const category = String(candidate.category || '').toLowerCase();

    if (!endpoint && !title) return false;

    if (/(^|\/)\.env($|\?|#)/.test(endpoint) || /environment configuration/.test(title)) return true;
    if (/(^|\/)\.git(\/|$)/.test(endpoint) || /git configuration/.test(title)) return true;
    if (/\.zip($|\?|#)/.test(endpoint) || /backup file/.test(title)) return true;
    if (/(^|\/)admin($|\/|\?|#)/.test(endpoint) || /administrative interface/.test(title)) return true;
    if (/manifest\.json/.test(endpoint) || /robots\.txt/.test(endpoint)) return true;
    if (/(^|\/)api(\/|$)/.test(endpoint) || /api/.test(category)) return true;

    return false;
  }

  shouldSuppressAsNoise(candidate: Pick<QualityCandidate, 'title' | 'category'>): boolean {
    const title = String(candidate.title || '').toLowerCase();
    const category = String(candidate.category || '').toLowerCase();

    if (title.startsWith('web/technology reconnaissance on')) {
      return true;
    }

    if (title.startsWith('recon data captured from')) {
      return true;
    }

    if (category.includes('technology intelligence') && title.includes('reconnaissance')) {
      return true;
    }

    return false;
  }

  private computeConfidence(
    baseConfidence: number,
    state: VerificationState,
    evidenceScore: number
  ): number {
    if (state === 'CONFIRMED') {
      return this.clamp(0, 100, Math.max(baseConfidence, Math.min(100, evidenceScore + 5)));
    }

    if (state === 'PROVISIONAL') {
      return this.clamp(0, 100, Math.min(94, Math.max(60, Math.round((baseConfidence + evidenceScore) / 2))));
    }

    return this.clamp(0, 100, Math.min(55, Math.round((baseConfidence + evidenceScore) / 2)));
  }

  private dedupe(values: string[]): string[] {
    return Array.from(new Set(values.filter(Boolean)));
  }

  private clamp(min: number, max: number, value: number): number {
    return Math.min(max, Math.max(min, value));
  }
}
