/**
 * Types partagés pour l'application LEA
 */

// ============================================
// PENTEST
// ============================================

export type PentestStatus =
  | 'CONFIGURING'
  | 'PREFLIGHT'
  | 'RUNNING'
  | 'PAUSED'
  | 'COMPLETED'
  | 'CANCELLED'
  | 'ERROR';

export type PreflightState = 'NOT_RUN' | 'RUNNING' | 'PASSED' | 'FAILED';

export type PentestPhase =
  | 'INIT'
  | 'PREFLIGHT'
  | 'RECON_PASSIVE'
  | 'RECON_ACTIVE'
  | 'VULN_SCAN'
  | 'EXPLOITATION'
  | 'POST_EXPLOIT'
  | 'REPORTING'
  | 'COMPLETE';

export interface PentestConfig {
  type: 'quick' | 'standard' | 'comprehensive' | 'custom';
  rules?: {
    allowExploitation?: boolean;
    allowDos?: boolean;
    allowBruteForce?: boolean;
    collectOsint?: boolean;
    stealthMode?: boolean;
  };
  mcpServer?: string;
  timeout?: number;
  deepThinkingBudget?: number;
  reasoningEffort?: 'quick' | 'standard' | 'deep' | 'maximum';
}

export interface PreflightCheck {
  id: string;
  name: string;
  status: 'pending' | 'running' | 'success' | 'warning' | 'error';
  output?: string[];
  duration_ms?: number;
  severity?: 'blocking' | 'warning' | 'info';
}

// ============================================
// FINDING
// ============================================

export type Severity = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' | 'INFORMATIONAL';
export type FindingStatus = 'OPEN' | 'CONFIRMED' | 'FALSE_POSITIVE' | 'FIXED' | 'RISK_ACCEPTED';

export interface Finding {
  id: string;
  pentest_id: string;
  title: string;
  severity: Severity;
  category: string;
  description: string;
  evidence?: string;
  impact?: string;
  remediation?: string;
  metadata?: Record<string, unknown>;
  cvss_score?: number;
  cvss_vector?: string;
  cve_id?: string;
  cwe_id?: string;
  target_host?: string;
  endpoint?: string;
  port?: number;
  protocol?: string;
  phase_name?: string;
  tool_used?: string;
  status: FindingStatus;
  verified: boolean;
  false_positive: boolean;
  discovered_at: Date;
  updated_at: Date;
}

// ============================================
// TODO
// ============================================

export type TodoStatus = 'PENDING' | 'IN_PROGRESS' | 'COMPLETED' | 'SKIPPED' | 'ERROR';

export interface Todo {
  id: string;
  pentest_id: string;
  content: string;
  priority: number;
  status: TodoStatus;
  agent_role?: string;
  depends_on: string[];
  created_at: Date;
  updated_at: Date;
  started_at?: Date;
  completed_at?: Date;
}

// ============================================
// MESSAGE
// ============================================

export type MessageType = 'USER' | 'ASSISTANT' | 'THINKING' | 'SYSTEM';

export interface Message {
  id: string;
  pentest_id: string;
  type: MessageType;
  content: string;
  agent_role?: string;
  sequence: number;
  created_at: Date;
}

// ============================================
// TOOL EXECUTION
// ============================================

export type ToolStatus = 'PENDING' | 'RUNNING' | 'COMPLETED' | 'FAILED' | 'TIMEOUT' | 'CANCELLED';

export interface ToolExecution {
  id: string;
  pentest_id: string;
  tool_name: string;
  parameters: any;
  status: ToolStatus;
  output?: string;
  error?: string;
  exit_code?: number;
  duration_ms?: number;
  started_at?: Date;
  ended_at?: Date;
  agent_role?: string;
  created_at: Date;
  updated_at: Date;
}

export type KaliAuditStatus = 'SUCCESS' | 'FAILED' | 'BLOCKED';

export type ScopeProposalSource = 'WHOIS_ORG_CORRELATION';
export type ScopeProposalStatus = 'PENDING' | 'PARTIAL' | 'APPROVED' | 'REJECTED';
export type ScopeCandidateDecision = 'PENDING' | 'APPROVED' | 'REJECTED';
export type ContextSnapshotTrigger = 'PHASE_END' | 'URGENT' | 'ERROR_RECOVERY' | 'MANUAL';

export interface ScopeProposalCandidate {
  id: string;
  proposal_id: string;
  domain: string;
  confidence: number;
  recommended: boolean;
  recommendation_reason?: string;
  evidence?: Record<string, unknown>;
  decision: ScopeCandidateDecision;
  decided_at?: Date;
  created_at: Date;
  updated_at: Date;
}

export interface ScopeProposal {
  id: string;
  pentest_id: string;
  base_target: string;
  source: ScopeProposalSource;
  status: ScopeProposalStatus;
  summary?: Record<string, unknown>;
  decided_at?: Date;
  created_at: Date;
  updated_at: Date;
  candidates?: ScopeProposalCandidate[];
}

export interface ContextSnapshot {
  id: string;
  pentest_id: string;
  trigger: ContextSnapshotTrigger;
  phase_from?: string;
  phase_to?: string;
  summary_markdown: string;
  summary_json: Record<string, unknown>;
  workspace_file?: string;
  archived_until_message_seq?: number;
  archived_until_tool_ts?: Date;
  created_at: Date;
}

export interface ContextRecallLog {
  id: string;
  pentest_id: string;
  actor: string;
  query: string;
  results_json: Record<string, unknown>;
  created_at: Date;
}

export interface ContextRecallResult {
  query: string;
  snippets: Array<{
    source: 'snapshot' | 'workspace';
    snapshotId?: string;
    file?: string;
    score: number;
    excerpt: string;
  }>;
}

export interface KaliAuditLog {
  id: string;
  pentest_id: string;
  actor: string;
  tool_name: string;
  command?: string;
  arguments?: any;
  cwd?: string;
  status: KaliAuditStatus;
  output?: string;
  error?: string;
  exit_code?: number;
  duration_ms?: number;
  created_at: Date;
}

// ============================================
// SSE EVENTS
// ============================================

export type SSEEventType =
  | 'connected'
  | 'preflight_started'
  | 'preflight_check'
  | 'preflight_remediation'
  | 'preflight_blocked'
  | 'preflight_complete'
  | 'thinking_start'
  | 'thinking_delta'
  | 'thinking_end'
  | 'message_start'
  | 'message_delta'
  | 'message_end'
  | 'tool_start'
  | 'tool_delta'
  | 'tool_end'
  | 'finding'
  | 'todos_updated'
  | 'phase_change'
  | 'status_change'
  | 'session_complete'
  | 'session_cancelled'
  | 'scope_review_required'
  | 'scope_review_updated'
  | 'scope_review_applied'
  | 'context_usage'
  | 'context_compaction_started'
  | 'context_compacted'
  | 'swarm_connected'
  | 'swarm_started'
  | 'agent_spawned'
  | 'agent_status'
  | 'finding_created'
  | 'finding_updated'
  | 'swarm_paused'
  | 'swarm_resumed'
  | 'swarm_merged'
  | 'swarm_completed'
  | 'swarm_failed'
  | 'tool_approval_required'
  | 'error';

export interface SSEEvent {
  type: SSEEventType;
  data: unknown;
  timestamp?: number;
}

// ============================================
// REPORT
// ============================================

export type ReportStatus = 'DRAFT' | 'COMPLETE' | 'ARCHIVED';

export type ExportFormat = 'PDF' | 'HTML' | 'JSON' | 'DOCX';

export type JobStatus = 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED';

export type {
  SwarmRunStatus,
  SwarmAgentStatus,
  SwarmSeverity,
  SwarmStreamEventType,
  SwarmStreamEventMap,
  SwarmStreamMessage,
  Agent,
  SwarmAgent,
  SysReptorFinding,
  SysReptorFindingPayload,
  SwarmFinding,
  Swarm,
  SwarmRun,
  StartSwarmAuditRequest,
  StartSwarmParams,
  StartSwarmAuditResponse,
  StartSwarmResponse,
} from './swarm.js';
