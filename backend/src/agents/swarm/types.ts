import type { ProviderType, Severity } from '@prisma/client';
import type {
  Agent,
  Swarm,
  SwarmSeverity,
  SysReptorFinding,
} from '../../types/swarm.js';
import type {
  LegacySseEventPayload,
  LegacySseEventType,
  SwarmEventEnvelope,
  SwarmEventPayload,
} from '../../types/events.js';

export interface SwarmToolResult {
  success: boolean;
  output?: string;
  error?: string;
  duration: number;
}

export interface SwarmToolGateway {
  executeSwarmTool(
    pentestId: string,
    toolName: string,
    args: Record<string, unknown>,
    context: { target: string; scope: string[]; agentRole: string }
  ): Promise<SwarmToolResult>;
}

export interface SwarmEmitter {
  broadcast<T extends SwarmEventPayload>(
    pentestId: string,
    envelopeInfo: Omit<SwarmEventEnvelope<T>, 'sequence' | 'timestamp' | 'id'>
  ): SwarmEventEnvelope<T>;
}

export interface SupervisorContext {
  providerId?: string;
  providerType?: ProviderType;
  modelId?: string;
  usingGlm47: boolean;
  supervisorPrompt: string;
}

export interface AgentTemplate {
  name: string;
  role: string;
  tools: string[];
  objective: string;
}

export interface SwarmRuntime {
  run: Swarm;
  scope: string[];
  autoPushToSysReptor: boolean;
  forceMergeRequested: boolean;
  supervisorPlan: AgentTemplate[];
  supervisorContext?: SupervisorContext;
  executionPromise?: Promise<void>;
}

export interface PendingApproval {
  resolve: () => void;
  reject: (reason: string) => void;
  timeout: ReturnType<typeof setTimeout>;
}

export interface SwarmState {
  runtimeByPentestId: Map<string, SwarmRuntime>;
  historyByPentestId: Map<string, Swarm[]>;
  pendingApprovals: Map<string, PendingApproval>;
}

export const createSwarmState = (): SwarmState => ({
  runtimeByPentestId: new Map(),
  historyByPentestId: new Map(),
  pendingApprovals: new Map(),
});

export const ACTIVE_STATUSES = new Set(['QUEUED', 'RUNNING', 'PAUSED', 'MERGING']);
export const SWARM_MIN_AGENTS = 8;
export const SWARM_DEFAULT_AGENTS = 10;
export const SWARM_MAX_AGENTS = 30;
export const SWARM_DEFAULT_CONCURRENCY = 5;
export const SWARM_MAX_CONCURRENCY = 20;

export const ROLE_BLUEPRINTS: Array<{ name: string; role: string; tools: string[] }> = [
  { name: 'Recon Alpha', role: 'Recon', tools: ['whois_lookup', 'dig_lookup'] },
  { name: 'Web Surface Scanner', role: 'WebScanner', tools: ['http_request', 'whatweb_scan'] },
  { name: 'Network Mapper', role: 'Network', tools: ['nmap_scan', 'waf_detect'] },
  { name: 'Exploit Simulator', role: 'ExploitSim', tools: ['http_request'] },
  { name: 'Finding Generator', role: 'FindingGenerator', tools: ['http_request'] },
  { name: 'SysReptor Reporter', role: 'SysReptorReporter', tools: ['http_request'] },
  { name: 'API Probe', role: 'WebScanner', tools: ['http_request'] },
  { name: 'External Exposure Analyst', role: 'Recon', tools: ['dig_lookup', 'http_request'] },
  { name: 'TLS Analyzer', role: 'Network', tools: ['http_request', 'waf_detect'] },
  { name: 'Auth Workflow Tester', role: 'ExploitSim', tools: ['http_request'] },
];

export const SENSITIVE_TOOLS = new Set([
  'exec_command',
  'bash',
  'write_file',
  'delete_file',
  'http_request',
  'sql_query',
  'spawn_process',
]);

export const severityToPrisma: Record<SwarmSeverity, Severity> = {
  critical: 'CRITICAL',
  high: 'HIGH',
  medium: 'MEDIUM',
  low: 'LOW',
  info: 'INFORMATIONAL',
};

export type LegacyEventEnvelope = Omit<
  SwarmEventEnvelope<LegacySseEventPayload>,
  'sequence' | 'timestamp' | 'id'
>;

export type EmitFn = {
  <T extends SwarmEventPayload>(
    pentestId: string,
    envelope: Omit<SwarmEventEnvelope<T>, 'sequence' | 'timestamp' | 'id'>
  ): void;
  (pentestId: string, type: LegacySseEventType, data: Record<string, unknown>): void;
};

export type EmitMessageFn = (pentestId: string, data: Record<string, unknown>) => void;
export type EmitCompleteFn = (run: Swarm) => void;
export type PersistEventFn = (
  pentestId: string,
  eventType: string,
  eventData: Record<string, unknown>
) => Promise<void>;
export type PersistToolExecutionFn = (
  pentestId: string,
  agentRole: string,
  toolName: string,
  result: SwarmToolResult
) => Promise<void>;
export type WaitWhilePausedFn = (runtime: SwarmRuntime) => Promise<void>;
export type CloneRunFn = (run: Swarm) => Swarm;
export type GetClientsCountFn = (pentestId: string) => number;
export type GetSysReptorServiceFn = () => {
  createProject(name: string, tags: string[]): Promise<{ id: string }>;
  pushFinding(projectId: string, finding: SysReptorFinding): Promise<{ findingId: string }>;
};
