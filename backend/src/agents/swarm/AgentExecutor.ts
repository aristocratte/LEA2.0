import { randomUUID } from 'node:crypto';
import type { PrismaClient } from '@prisma/client';
import type { Agent } from '../../types/swarm.js';
import type { EmitFn, SwarmRuntime } from './types.js';
import type { AgentTemplate } from './types.js';
import { SwarmEventEmitter } from './SwarmEventEmitter.js';
import { ToolFindingPipeline } from './ToolFindingPipeline.js';

export class AgentExecutor {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly eventEmitter: SwarmEventEmitter,
    private readonly toolFindingPipeline: ToolFindingPipeline,
    private readonly emit: EmitFn,
    private readonly waitWhilePaused: (runtime: SwarmRuntime) => Promise<void>
  ) {}

  initializeAgents(runtime: SwarmRuntime): void {
    const run = runtime.run;
    run.agents = runtime.supervisorPlan.map((template, index) => {
      const now = new Date().toISOString();
      const agent: Agent = {
        id: randomUUID(),
        swarmRunId: run.id,
        name: template.name,
        role: template.role,
        status: 'SPAWNED',
        progress: 0,
        lastMessage: template.objective,
        createdAt: now,
        updatedAt: now,
      };

      this.eventEmitter.emitAgentSpawned(run.pentestId, run.id, agent, index);

      void this.prisma.swarmAgent.upsert({
        where: { id: agent.id },
        create: {
          id: agent.id,
          swarmRunId: run.id,
          name: agent.name,
          role: agent.role,
          status: agent.status,
          progress: agent.progress,
          lastMessage: agent.lastMessage ?? null,
          toolHistory: [],
          spawnedAt: new Date(),
        },
        update: {
          status: agent.status,
        },
      }).catch((dbErr: Error) => {
        console.warn('[Swarm] Could not persist SwarmAgent to DB:', dbErr.message);
      });

      return agent;
    });
  }

  async runAgents(runtime: SwarmRuntime): Promise<void> {
    const run = runtime.run;
    const workers = Math.min(run.maxConcurrentAgents, run.agents.length);
    let cursor = 0;

    const worker = async (): Promise<void> => {
      while (true) {
        if (runtime.forceMergeRequested) return;

        const index = cursor;
        cursor += 1;

        if (index >= run.agents.length) {
          return;
        }

        await this.executeAgent(runtime, run.agents[index], runtime.supervisorPlan[index]);
      }
    };

    await Promise.all(Array.from({ length: workers }, () => worker()));
  }

  async executeAgent(runtime: SwarmRuntime, agent: Agent, template: AgentTemplate): Promise<void> {
    const run = runtime.run;
    await this.waitWhilePaused(runtime);
    if (runtime.forceMergeRequested) return;

    this.eventEmitter.updateAgent(run.pentestId, agent, {
      status: 'THINKING',
      progress: 20,
      lastMessage: template.objective,
    });

    const toolName = this.pickTool(template, agent.id);
    this.eventEmitter.updateAgent(run.pentestId, agent, {
      status: 'RUNNING_TOOL',
      progress: 60,
      toolName,
      lastMessage: `Running ${toolName}`,
    });

    const args = this.buildToolArgs(run.target, runtime.scope, agent.role);
    const correlationId = `tool-${agent.id}-${Date.now()}`;
    this.emit(run.pentestId, {
      runId: run.id,
      correlationId,
      source: `agent:${agent.role}`,
      audience: 'internal',
      surfaceHint: 'activity',
      eventType: 'tool.call.started',
      payload: {
        type: 'tool.call.started',
        toolName,
        agentId: agent.id,
      },
    });
    const result = await this.toolFindingPipeline.executeTool(run.pentestId, agent.role, run.target, runtime.scope, toolName, args);
    this.emit(run.pentestId, {
      runId: run.id,
      correlationId,
      source: `agent:${agent.role}`,
      audience: 'internal',
      surfaceHint: 'activity',
      eventType: 'tool.call.completed',
      payload: {
        type: 'tool.call.completed',
        toolName,
        agentId: agent.id,
      },
    });

    await this.toolFindingPipeline.persistToolExecution(run.pentestId, agent.role, toolName, result);

    if (result.success && result.output && this.shouldGenerateFinding(agent.role)) {
      await this.toolFindingPipeline.createFinding(runtime, agent, toolName, result.output);
    }

    this.eventEmitter.updateAgent(run.pentestId, agent, {
      status: result.success ? 'DONE' : 'FAILED',
      progress: 100,
      lastMessage: result.success ? 'Task completed' : `Tool failed: ${result.error || 'unknown'}`,
    });
  }

  private pickTool(template: AgentTemplate, agentId: string): string {
    if (template.tools.length === 0) {
      return 'http_request';
    }

    const seed = agentId.split('').reduce((sum, char) => sum + char.charCodeAt(0), 0);
    return template.tools[seed % template.tools.length];
  }

  private shouldGenerateFinding(role: string): boolean {
    return ['WebScanner', 'Network', 'ExploitSim', 'FindingGenerator'].includes(role);
  }

  private buildToolArgs(target: string, scope: string[], role: string): Record<string, unknown> {
    if (role === 'WebScanner' || role === 'ExploitSim' || role === 'FindingGenerator') {
      const url = target.startsWith('http://') || target.startsWith('https://')
        ? target
        : `https://${target}`;

      return {
        method: 'GET',
        url,
        response_extract: 'all',
        timeout: 30,
        in_scope: scope,
      };
    }

    return {
      target,
      in_scope: scope,
    };
  }
}
