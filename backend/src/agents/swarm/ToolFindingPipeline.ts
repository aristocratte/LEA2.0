import { randomUUID } from 'node:crypto';
import type { PrismaClient } from '@prisma/client';
import { kaliMcpClient } from '../../services/mcp/KaliMCPClient.js';
import { findingMetadataSchema, parseJsonWithSchema, toPrismaJson } from '../../types/schemas.js';
import type { Agent, SwarmSeverity, SysReptorFinding } from '../../types/swarm.js';
import { severityToPrisma, SENSITIVE_TOOLS } from './types.js';
import type {
  EmitFn,
  EmitMessageFn,
  EmitCompleteFn,
  GetClientsCountFn,
  GetSysReptorServiceFn,
  PersistEventFn,
  SwarmRuntime,
  SwarmState,
  SwarmToolGateway,
  SwarmToolResult,
} from './types.js';

export class ToolFindingPipeline {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly state: SwarmState,
    private readonly emit: EmitFn,
    private readonly emitMessage: EmitMessageFn,
    private readonly emitComplete: EmitCompleteFn,
    private readonly persistEvent: PersistEventFn,
    private readonly getClientsCount: GetClientsCountFn,
    private readonly getSysReptorService: GetSysReptorServiceFn,
    private readonly toolGateway?: SwarmToolGateway
  ) {}

  async requestApproval(
    runtime: SwarmRuntime,
    agentId: string,
    toolName: string,
    args: Record<string, unknown>
  ): Promise<void> {
    const approvalId = randomUUID();
    const pentestId = runtime.run.pentestId;

    this.emit(pentestId, {
      runId: runtime.run.id,
      correlationId: approvalId,
      source: 'system',
      audience: 'user',
      surfaceHint: 'review',
      eventType: 'approval.requested',
      payload: {
        type: 'approval.requested',
        tool: toolName,
        scope: runtime.scope,
        riskClass: 'exec',
        requiresEscalation: false,
        affectedTargets: [runtime.run.target],
      },
    });
    this.emit(pentestId, 'tool_approval_required', {
      approvalId,
      requestId: approvalId,
      toolName,
      tool: toolName,
      toolInput: args,
      agentId,
      timestamp: Date.now(),
    });

    console.log(`[Swarm] Approval required — approvalId=${approvalId} tool=${toolName} agent=${agentId}`, args);

    return new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.state.pendingApprovals.delete(approvalId);
        console.log(`[Swarm] Approval ${approvalId} timed out — auto-approving`);
        resolve();
      }, 120_000);

      this.state.pendingApprovals.set(approvalId, { pentestId, resolve, reject, timeout });
    });
  }

  private isStopped(pentestId: string): boolean {
    const runtime = this.state.runtimeByPentestId.get(pentestId);
    return Boolean(runtime?.forceMergeRequested || runtime?.run.status === 'CANCELLED');
  }

  async executeTool(
    pentestId: string,
    agentRole: string,
    target: string,
    scope: string[],
    toolName: string,
    args: Record<string, unknown>
  ): Promise<SwarmToolResult> {
    if (this.isStopped(pentestId)) {
      return {
        success: false,
        output: '',
        error: 'Tool execution cancelled',
        duration: 0,
      };
    }

    if (SENSITIVE_TOOLS.has(toolName) && this.getClientsCount(pentestId) > 0) {
      const runtime = this.state.runtimeByPentestId.get(pentestId);
      if (runtime) {
        try {
          await this.requestApproval(runtime, agentRole, toolName, args);
        } catch (denialReason) {
          return {
            success: false,
            output: '',
            error: `Tool execution denied: ${denialReason}`,
            duration: 0,
          };
        }
      }
    }

    if (this.isStopped(pentestId)) {
      return {
        success: false,
        output: '',
        error: 'Tool execution cancelled',
        duration: 0,
      };
    }

    if (this.toolGateway) {
      try {
        return await this.toolGateway.executeSwarmTool(pentestId, toolName, args, {
          target,
          scope,
          agentRole,
        });
      } catch (error) {
        console.warn(`[Swarm] Tool gateway failed for ${toolName}, falling back to Kali MCP`, error);
      }
    }

    const result = await kaliMcpClient.callTool(
      toolName,
      args,
      120000,
      {
        pentestId,
        actor: `swarm:${agentRole}`,
        target,
        inScope: scope,
      }
    );

    return {
      success: result.success,
      output: result.output,
      error: result.error,
      duration: result.duration,
    };
  }

  async persistToolExecution(
    pentestId: string,
    agentRole: string,
    toolName: string,
    result: SwarmToolResult
  ): Promise<void> {
    try {
      await this.prisma.toolExecution.create({
        data: {
          pentest_id: pentestId,
          tool_name: toolName,
          parameters: toPrismaJson({ source: 'dynamic_swarm' }),
          status: result.success ? 'COMPLETED' : 'FAILED',
          output: result.output,
          error: result.error,
          duration_ms: result.duration,
          agent_role: `swarm:${agentRole}`,
          started_at: new Date(Date.now() - result.duration),
          ended_at: new Date(),
        },
      });
    } catch (error) {
      console.warn('[Swarm] Unable to persist tool execution:', error);
    }
  }

  async createFinding(
    runtime: SwarmRuntime,
    agent: Agent,
    toolName: string,
    output: string
  ): Promise<void> {
    const run = runtime.run;
    const severity = this.deriveSeverity(agent.role);
    const title = this.deriveFindingTitle(agent.role, toolName, run.target);
    const description = this.buildFindingDescription(output, toolName, agent.role);
    const remediation = this.defaultRemediation(agent.role);

    let findingId: string = randomUUID();

    try {
      const created = await this.prisma.finding.create({
        data: {
          pentest_id: run.pentestId,
          title,
          severity: severityToPrisma[severity],
          category: `Swarm/${agent.role}`,
          description,
          evidence: output.slice(0, 8000),
          remediation,
          tool_used: toolName,
          phase_name: 'SWARM',
          metadata: toPrismaJson(parseJsonWithSchema(findingMetadataSchema, {
            source: 'dynamic_swarm',
            swarmRunId: run.id,
            agentId: agent.id,
            agentRole: agent.role,
          }, {})),
        },
      });

      findingId = created.id as SysReptorFinding['id'];
    } catch (error) {
      console.warn('[Swarm] Unable to persist finding in Prisma:', error);
    }

    const now = new Date().toISOString();
    const finding: SysReptorFinding = {
      id: findingId,
      pentestId: run.pentestId,
      swarmRunId: run.id,
      agentId: agent.id,
      title,
      description,
      severity,
      cvss: this.suggestCvss(severity),
      proof: output.slice(0, 8000),
      remediation,
      affected_components: [run.target],
      pushed: false,
      createdAt: now,
      updatedAt: now,
    };

    run.findings.push(finding);

    this.emit(run.pentestId, {
      runId: run.id,
      source: `agent:${agent.role}`,
      audience: 'internal',
      surfaceHint: 'activity',
      eventType: 'finding.created',
      payload: {
        type: 'finding.created',
        findingId,
        title,
        severity,
      },
    });
    this.emit(run.pentestId, 'finding_created', {
      swarmRunId: run.id,
      finding,
      timestamp: Date.now(),
    });
  }

  async finalize(runtime: SwarmRuntime): Promise<void> {
    const run = runtime.run;
    run.status = 'MERGING';

    this.emitMessage(run.pentestId, {
      swarmRunId: run.id,
      source: 'supervisor',
      content: `Merging ${run.findings.length} findings`,
      timestamp: Date.now(),
    });
    this.emit(run.pentestId, 'swarm_merged', {
      swarmRunId: run.id,
      findingsCount: run.findings.length,
      requested: run.forceMerged,
      timestamp: Date.now(),
    });

    await this.persistEvent(run.pentestId, 'swarm_run_merging', {
      swarmRunId: run.id,
      findingsCount: run.findings.length,
      forceMerged: run.forceMerged,
    });

    if (runtime.autoPushToSysReptor && run.findings.length > 0) {
      try {
        const sysReptor = this.getSysReptorService();
        const project = await sysReptor.createProject(
          `[LEA Swarm] ${run.target}`,
          ['lea', 'swarm', 'dynamic']
        );

        run.sysReptorProjectId = project.id;

        const pushResults = await Promise.all(
          run.findings.map((finding) => sysReptor.pushFinding(project.id, finding))
        );
        const pushedSet = new Set(pushResults.map((item) => item.findingId));

        run.findings = run.findings.map((finding) => ({
          ...finding,
          pushed: pushedSet.has(finding.id),
          updatedAt: new Date().toISOString(),
        }));
      } catch (error) {
        console.error('[Swarm] Failed to push findings to SysReptor:', error);
      }
    }

    run.status = runtime.forceMergeRequested && run.findings.length === 0
      ? 'PARTIAL_COMPLETED'
      : 'COMPLETED';
    run.endedAt = new Date().toISOString();

    await this.persistEvent(run.pentestId, 'swarm_run_completed', {
      swarmRunId: run.id,
      status: run.status,
      findingsCount: run.findings.length,
      agentsCount: run.agents.length,
      sysReptorProjectId: run.sysReptorProjectId,
      startedAt: run.startedAt,
      endedAt: run.endedAt,
    });

    try {
      await this.prisma.swarmRun.update({
        where: { id: run.id },
        data: {
          status: run.status,
          findingsCount: run.findings.length,
          sysReptorProjectId: run.sysReptorProjectId ?? null,
          completedAt: new Date(),
        },
      });
    } catch {
      // ignore
    }

    this.emitComplete(run);
  }

  private deriveSeverity(role: string): SwarmSeverity {
    if (role === 'ExploitSim') return 'high';
    if (role === 'WebScanner' || role === 'Network') return 'medium';
    if (role === 'FindingGenerator') return 'low';
    return 'info';
  }

  private suggestCvss(severity: SwarmSeverity): number {
    switch (severity) {
      case 'critical':
        return 9.1;
      case 'high':
        return 8.1;
      case 'medium':
        return 6.4;
      case 'low':
        return 3.4;
      default:
        return 0;
    }
  }

  private deriveFindingTitle(role: string, toolName: string, target: string): string {
    const roleTitle = role.replace(/([A-Z])/g, ' $1').trim();
    return `[${roleTitle}] Potential issue detected via ${toolName} on ${target}`;
  }

  private buildFindingDescription(output: string, toolName: string, role: string): string {
    const excerpt = output.trim().slice(0, 1200);
    return [
      `Swarm agent role: ${role}`,
      `Tool: ${toolName}`,
      '',
      'Raw evidence excerpt:',
      excerpt || '(no output)',
    ].join('\n');
  }

  private defaultRemediation(role: string): string {
    switch (role) {
      case 'WebScanner':
        return 'Review HTTP security controls, patch affected endpoint, and enforce secure headers.';
      case 'Network':
        return 'Restrict exposed services, apply least privilege network ACLs, and validate firewall rules.';
      case 'ExploitSim':
        return 'Prioritize immediate remediation and validate with a controlled retest.';
      default:
        return 'Validate finding manually and apply defense-in-depth mitigations.';
    }
  }
}
