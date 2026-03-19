import type { PrismaClient } from '@prisma/client';
import { ProviderManager } from '../../services/ProviderManager.js';
import type { SwarmRuntime, AgentTemplate, PersistEventFn, EmitMessageFn } from './types.js';

export class SupervisorPlanner {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly providerManager: ProviderManager,
    private readonly emitMessage: EmitMessageFn,
    private readonly persistEvent: PersistEventFn,
    private readonly buildTemplates: (maxAgents: number, task: string, scope: string[]) => AgentTemplate[]
  ) {}

  async buildPlan(runtime: SwarmRuntime): Promise<AgentTemplate[]> {
    const context = await this.resolveContext(runtime.run.task || '');
    runtime.supervisorContext = context;

    const providerLabel = context.providerType
      ? `${context.providerType}${context.modelId ? `/${context.modelId}` : ''}`
      : 'fallback-local';

    this.emitMessage(runtime.run.pentestId, {
      swarmRunId: runtime.run.id,
      source: 'supervisor',
      content: `Supervisor planned ${runtime.run.maxAgents} agents via ${providerLabel}${context.usingGlm47 ? ' (GLM-4.7 default)' : ''}`,
      timestamp: Date.now(),
    });

    await this.persistEvent(runtime.run.pentestId, 'swarm_supervisor_plan', {
      swarmRunId: runtime.run.id,
      providerId: context.providerId,
      providerType: context.providerType,
      modelId: context.modelId,
      usingGlm47: context.usingGlm47,
      supervisorPrompt: context.supervisorPrompt,
      agentsPlanned: runtime.run.maxAgents,
    });

    return this.buildTemplates(runtime.run.maxAgents, runtime.run.task || '', runtime.scope);
  }

  async resolveContext(task: string) {
    const supervisorPrompt = this.buildPrompt(task);
    let provider = null;

    try {
      provider = await this.providerManager.getProvider('zhipu', 'glm-4.7');
    } catch (error) {
      console.warn('[Swarm] Unable to load zhipu/glm-4.7 provider:', error);
    }

    if (!provider) {
      try {
        provider = await this.providerManager.selectProvider('coordination', 'ZHIPU');
      } catch (error) {
        console.warn('[Swarm] Unable to load preferred provider:', error);
      }
    }

    if (!provider) {
      try {
        provider = await this.providerManager.selectProvider('coordination');
      } catch (error) {
        console.warn('[Swarm] Unable to load fallback provider:', error);
      }
    }

    if (!provider) {
      return {
        usingGlm47: false,
        supervisorPrompt,
      };
    }

    const modelId = await this.resolveModel(provider.id, 'glm-4.7');

    try {
      const inputTokens = Math.max(1, Math.ceil(task.length / 4));
      const outputTokens = Math.max(1, Math.ceil(inputTokens / 2));
      await this.providerManager.recordUsage(provider.id, inputTokens, outputTokens, modelId);
    } catch (error) {
      console.warn('[Swarm] Unable to record provider usage:', error);
    }

    return {
      providerId: provider.id,
      providerType: provider.type,
      modelId,
      usingGlm47: provider.type === 'ZHIPU' && (modelId || '').toLowerCase().includes('glm-4.7'),
      supervisorPrompt,
    };
  }

  async resolveModel(providerId: string, preferredModelId?: string): Promise<string | undefined> {
    try {
      const models = await this.prisma.modelConfig.findMany({
        where: { provider_id: providerId, enabled: true },
        orderBy: [{ usage_count: 'desc' }, { last_used_at: 'desc' }],
      });

      if (models.length === 0) {
        return undefined;
      }

      const preferred = String(preferredModelId || '').toLowerCase();
      if (preferred) {
        const exact = models.find((entry) => entry.model_id.toLowerCase() === preferred);
        if (exact) return exact.model_id;

        const contains = models.find((entry) => entry.model_id.toLowerCase().includes(preferred));
        if (contains) return contains.model_id;
      }

      const glm47 = models.find((entry) => entry.model_id.toLowerCase().includes('glm-4.7'));
      const glm = models.find((entry) => entry.model_id.toLowerCase().includes('glm'));
      return (glm47 || glm || models[0]).model_id;
    } catch (error) {
      console.warn('[Swarm] Unable to resolve provider model:', error);
      return undefined;
    }
  }

  private buildPrompt(task: string): string {
    return [
      'Tu es GLM-4.7 Swarm Master de LEA2.0.',
      'Décompose la mission en 8 à 30 sous-agents spécialisés pentest.',
      'Rôles attendus: Recon, WebScanner, Network, ExploitSim, FindingGenerator, SysReptorReporter.',
      `Mission: ${task || 'Pentest task not provided'}`,
    ].join(' ');
  }
}
