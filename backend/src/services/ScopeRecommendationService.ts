import type { AIClient, ChatMessage } from './ai/AIClient.js';
import { AnthropicClient } from './ai/AnthropicClient.js';
import { ZhipuClient } from './ai/ZhipuClient.js';
import { GeminiClient } from './ai/GeminiClient.js';
import { AntigravityClient } from './ai/AntigravityClient.js';
import { CodexClient } from './ai/CodexClient.js';
import { OpenCodeClient } from './ai/OpenCodeClient.js';
import { providerManager } from './ProviderManager.js';

export interface ScopeRecommendationSignal {
  org_match?: boolean;
  nameserver_overlap?: string[];
  from_amass?: boolean;
  from_ct?: boolean;
  from_whois_correlation?: boolean;
  registrar_match_only?: boolean;
}

export interface ScopeRecommendationCandidate {
  domain: string;
  evidence: ScopeRecommendationSignal;
}

export interface ScopeRecommendationInput {
  target: string;
  orgName?: string;
  registrar?: string;
  candidates: ScopeRecommendationCandidate[];
  providerId?: string;
  modelId?: string;
}

export interface ScopeRecommendationResult {
  domain: string;
  confidence: number;
  recommended: boolean;
  reason: string;
}

interface AIRecommendationResult {
  domain: string;
  confidence: number;
  recommended: boolean;
  reason: string;
}

export class ScopeRecommendationService {
  async recommend(input: ScopeRecommendationInput): Promise<ScopeRecommendationResult[]> {
    const heuristic = input.candidates.map((candidate) => this.heuristicRecommendation(candidate));
    if (heuristic.length === 0) {
      return [];
    }

    try {
      const ai = await this.getAIClient(input.providerId);
      if (!ai) {
        return heuristic;
      }

      const aiRecommendations = await this.getAIRecommendations(ai, input);
      if (aiRecommendations.length === 0) {
        return heuristic;
      }

      const aiMap = new Map(aiRecommendations.map((item) => [item.domain, item]));

      return heuristic.map((item) => {
        const aiItem = aiMap.get(item.domain);
        if (!aiItem) return item;

        const mergedConfidence = this.clampConfidence(Math.round((item.confidence + aiItem.confidence) / 2));
        const mergedRecommended = aiItem.recommended || mergedConfidence >= 70;

        return {
          domain: item.domain,
          confidence: mergedConfidence,
          recommended: mergedRecommended,
          reason: aiItem.reason ? `${aiItem.reason} | Signals: ${item.reason}` : item.reason,
        };
      });
    } catch {
      return heuristic;
    }
  }

  private heuristicRecommendation(candidate: ScopeRecommendationCandidate): ScopeRecommendationResult {
    const evidence = candidate.evidence;
    let confidence = 10;
    const reasons: string[] = [];

    if (evidence.org_match) {
      confidence += 45;
      reasons.push('matching WHOIS organization');
    }

    if (evidence.from_whois_correlation) {
      confidence += 20;
      reasons.push('WHOIS correlation');
    }

    if (evidence.from_amass) {
      confidence += 20;
      reasons.push('found by amass intel');
    }

    if (evidence.from_ct) {
      confidence += 15;
      reasons.push('found in certificate transparency');
    }

    if ((evidence.nameserver_overlap || []).length > 0) {
      confidence += 15;
      reasons.push(`shared nameservers (${(evidence.nameserver_overlap || []).slice(0, 2).join(', ')})`);
    }

    if (evidence.registrar_match_only) {
      confidence -= 35;
      reasons.push('registrar-only match (insufficient alone)');
    }

    const normalizedConfidence = this.clampConfidence(confidence);
    const recommended = normalizedConfidence >= 70 && !evidence.registrar_match_only;

    return {
      domain: candidate.domain,
      confidence: normalizedConfidence,
      recommended,
      reason: reasons.length > 0 ? reasons.join('; ') : 'limited correlation signals',
    };
  }

  private clampConfidence(value: number): number {
    if (value < 0) return 0;
    if (value > 100) return 100;
    return value;
  }

  private async getAIClient(preferredProviderId?: string): Promise<AIClient | null> {
    if (preferredProviderId) {
      const selectedProvider = await providerManager.getProvider(preferredProviderId);
      if (selectedProvider && (selectedProvider.type === 'GEMINI' || selectedProvider.type === 'ANTIGRAVITY' || selectedProvider.decryptedKey)) {
        return this.providerToAIClient(
          selectedProvider.type,
          selectedProvider.decryptedKey || '',
          selectedProvider.base_url || undefined,
          selectedProvider.oauth_refresh_token || undefined,
          {
            accessToken: selectedProvider.oauth_access_token || undefined,
            refreshToken: selectedProvider.oauth_refresh_token || undefined,
            expiresAt: selectedProvider.oauth_expiry || undefined,
          }
        );
      }
    }

    const fallback = await providerManager.selectProvider('analysis');
    if (fallback && (fallback.type === 'GEMINI' || fallback.type === 'ANTIGRAVITY' || fallback.decryptedKey)) {
      return this.providerToAIClient(
        fallback.type,
        fallback.decryptedKey || '',
        fallback.base_url || undefined,
        fallback.oauth_refresh_token || undefined,
        {
          accessToken: fallback.oauth_access_token || undefined,
          refreshToken: fallback.oauth_refresh_token || undefined,
          expiresAt: fallback.oauth_expiry || undefined,
        }
      );
    }

    return null;
  }

  private providerToAIClient(
    type: string,
    apiKey: string,
    baseUrl?: string,
    oauthToken?: string,
    geminiOAuth?: { accessToken?: string; refreshToken?: string; expiresAt?: Date | string | null }
  ): AIClient {
    switch (type) {
      case 'ZHIPU':
        return new ZhipuClient(apiKey, baseUrl || undefined, 'zhipu');
      case 'OPENAI':
        return new ZhipuClient(apiKey, baseUrl || 'https://api.openai.com/v1', 'openai');
      case 'ANTHROPIC':
        return new AnthropicClient(apiKey);
      case 'GEMINI':
        return new GeminiClient(apiKey, geminiOAuth);
      case 'ANTIGRAVITY':
        if (!oauthToken) {
          throw new Error('Antigravity provider requires OAuth login before use.');
        }
        return new AntigravityClient(oauthToken);
      case 'CODEX':
        return new CodexClient(apiKey, baseUrl || undefined);
      case 'OPENCODE':
        return new OpenCodeClient(apiKey, baseUrl || undefined);
      default:
        if (baseUrl) {
          return new ZhipuClient(apiKey, baseUrl, 'custom');
        }
        return new AnthropicClient(apiKey);
    }
  }

  private defaultModelFor(client: AIClient, preferredModel?: string): string {
    if (preferredModel) return preferredModel;
    switch (client.getProviderName()) {
      case 'zhipu':
        return 'glm-4.7';
      case 'openai':
        return 'gpt-4o-2024-11-20';
      case 'gemini':
        return 'gemini-2.5-pro-preview-03-25';
      case 'antigravity':
        return 'antigravity-gemini-3-pro';
      case 'anthropic':
      default:
        return 'claude-sonnet-4-6';
    }
  }

  private async getAIRecommendations(aiClient: AIClient, input: ScopeRecommendationInput): Promise<AIRecommendationResult[]> {
    const systemPrompt = [
      'You are a strict pentest scope analyst.',
      'Goal: classify candidate domains as in-scope recommendations based on organization-level evidence.',
      'Rule: registrar-only match is never sufficient alone.',
      'Return JSON only: {"items":[{"domain":"...","confidence":0-100,"recommended":true|false,"reason":"..."}]}',
      'Do not include markdown fences.',
    ].join(' ');

    const userPayload = {
      target: input.target,
      organization: input.orgName || null,
      registrar: input.registrar || null,
      candidates: input.candidates,
    };

    const messages: ChatMessage[] = [
      {
        role: 'user',
        content: JSON.stringify(userPayload),
      },
    ];

    let textOutput = '';
    const result = await aiClient.streamChat({
      model: this.defaultModelFor(aiClient, input.modelId),
      messages,
      tools: [],
      systemPrompt,
      maxTokens: 1200,
      signal: AbortSignal.timeout(20000),
      onEvent: (event) => {
        if (event.type === 'text_delta') {
          textOutput += event.text;
        }
      },
    });

    if (!textOutput.trim()) {
      const textBlocks = result.content
        .filter((block): block is { type: 'text'; text: string } => block.type === 'text')
        .map((block) => block.text)
        .join('\n');
      textOutput = textBlocks;
    }

    const parsed = this.parseAIResponse(textOutput);
    return parsed;
  }

  private parseAIResponse(raw: string): AIRecommendationResult[] {
    const trimmed = raw.trim();
    if (!trimmed) return [];

    const cleaned = trimmed
      .replace(/^```json\s*/i, '')
      .replace(/^```\s*/i, '')
      .replace(/\s*```$/i, '');

    const jsonLike = this.extractJsonObject(cleaned);
    if (!jsonLike) return [];

    try {
      const parsed = JSON.parse(jsonLike) as { items?: AIRecommendationResult[] };
      const items = Array.isArray(parsed.items) ? parsed.items : [];
      return items
        .map((item) => ({
          domain: String(item.domain || '').toLowerCase(),
          confidence: this.clampConfidence(Number(item.confidence) || 0),
          recommended: Boolean(item.recommended),
          reason: String(item.reason || ''),
        }))
        .filter((item) => Boolean(item.domain));
    } catch {
      return [];
    }
  }

  private extractJsonObject(raw: string): string | null {
    const firstBrace = raw.indexOf('{');
    const lastBrace = raw.lastIndexOf('}');
    if (firstBrace === -1 || lastBrace === -1 || lastBrace <= firstBrace) {
      return null;
    }
    return raw.slice(firstBrace, lastBrace + 1);
  }
}
