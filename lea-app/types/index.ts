// Types pour LEA Platform

// Frontend UI phases (simplified from backend for UX purposes)
export type UiPentestPhase = 'idle' | 'config' | 'preflight' | 'active' | 'complete';

// Backend API phases (use for API calls)
export type ApiPentestPhase =
  | 'INIT'
  | 'PREFLIGHT'
  | 'RECON_PASSIVE'
  | 'RECON_ACTIVE'
  | 'VULN_SCAN'
  | 'EXPLOITATION'
  | 'POST_EXPLOIT'
  | 'REPORTING'
  | 'COMPLETE';

// Backend status enum
export type PentestStatus =
  | 'CONFIGURING'
  | 'PREFLIGHT'
  | 'RUNNING'
  | 'PAUSED'
  | 'COMPLETED'
  | 'CANCELLED'
  | 'ERROR';

export type PreflightState = 'NOT_RUN' | 'RUNNING' | 'PASSED' | 'FAILED';

// Finding status enum
export type FindingStatus = 'OPEN' | 'CONFIRMED' | 'FALSE_POSITIVE' | 'FIXED' | 'RISK_ACCEPTED';

// For backward compatibility, alias the old type
export type PentestPhase = UiPentestPhase;

export type PentestType = 'quick' | 'standard' | 'comprehensive' | 'custom';

// Backend severity enum (UPPERCASE to match Prisma)
export type ApiSeverity = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' | 'INFORMATIONAL';

// Frontend UI severity (Title Case for display)
export type Severity = 'Critical' | 'High' | 'Medium' | 'Low' | 'Informational';
export type FindingVerificationState = 'PROVISIONAL' | 'CONFIRMED' | 'REJECTED';
export type FindingSourceSignalType = 'TOOL_RESULT' | 'PENTESTER_REPORTED';
export type FindingsAgentStage = 'classify' | 'verify' | 'score' | 'dedupe' | 'upsert' | 'emit' | 'report' | 'idle';

export interface PentestConfig {
  target: string;
  inScope: string[];
  outOfScope: string[];
  pentestType: PentestType;
  deepThinkingBudget: number;
  rules: EngagementRules;
}

export interface EngagementRules {
  allowExploitation: boolean;
  allowDos: boolean;
  allowBruteForce: boolean;
  collectOsint: boolean;
  stealthMode: boolean;
}

export interface PreflightCheck {
  id: string;
  label: string;
  description: string;
  status: 'pending' | 'running' | 'success' | 'warning' | 'error';
  severity?: 'blocking' | 'warning' | 'info';
  output?: string[];
  duration_ms?: number;
  metadata?: Record<string, unknown>;
  message?: string;
}

export interface PreflightRemediationAttempt {
  checkId: string;
  tool: string;
  attempted: boolean;
  success: boolean;
  message: string;
  timestamp: string;
}

export interface PreflightResult {
  success: boolean;
  checks: Array<{
    id: string;
    name: string;
    status: 'pending' | 'running' | 'success' | 'warning' | 'error';
    output?: string[];
    duration_ms?: number;
    severity?: 'blocking' | 'warning' | 'info';
    metadata?: Record<string, unknown>;
  }>;
  blockingFailures: Array<{
    id: string;
    name: string;
    status: 'error';
    output?: string[];
    severity?: 'blocking' | 'warning' | 'info';
  }>;
  warnings: Array<{
    id: string;
    name: string;
    status: 'warning';
    output?: string[];
    severity?: 'blocking' | 'warning' | 'info';
  }>;
  remediationAttempts: PreflightRemediationAttempt[];
  workspace?: string;
  summary: {
    total: number;
    passed: number;
    failed: number;
    warnings: number;
    duration: number;
  };
  timestamp: string;
}

export type TodoStatus = 'PENDING' | 'IN_PROGRESS' | 'COMPLETED' | 'SKIPPED' | 'ERROR';

export interface PentestTodo {
  id: string;
  content: string;
  priority: number;
  status: TodoStatus;
  agentRole?: string;
  startedAt?: string;
  completedAt?: string;
}

export interface Finding {
  id: string;
  title: string;
  severity: Severity;
  proposedSeverity?: Severity;
  verificationState?: FindingVerificationState;
  evidenceScore?: number;
  reasonCodes?: string[];
  sourceSignalType?: FindingSourceSignalType;
  category: string;
  description: string;
  evidence: string;
  impact?: string;
  remediation?: string;
  metadata?: Record<string, unknown>;
  cvssScore?: number;
  cvssVector?: string;
  cveId?: string;
  cweId?: string;
  phaseName?: string;
  targetHost?: string;
  endpoint?: string;
  port?: number;
  protocol?: string;
  toolUsed?: string;
  status?: FindingStatus;
  verified?: boolean;
  falsePositive?: boolean;
  classificationConfidence?: number;
  classificationBasis?: string;
  eventAction?: 'created' | 'updated';
  agentStage?: FindingsAgentStage;
  eventId?: string;
  eventSeq?: number;
  createdAt: string;
  updatedAt?: string;
  discoveredAt?: string;
  pentestId?: string;
  reportId?: string;
}

export interface StreamMessage {
  id: string;
  type: 'thinking' | 'text' | 'tool_use' | 'tool_result' | 'finding' | 'context_summary';
  content: string;
  toolName?: string;
  toolParams?: Record<string, unknown>;
  toolUseId?: string;
  finding?: Finding;
  contextSnapshotId?: string;
  timestamp: string;
  isCollapsed?: boolean;
  streaming?: boolean;
  thinkingBudget?: number;
  thinkingDurationMs?: number;
}

export interface PentestSession {
  id: string;
  target: string;
  phase: string;
  startedAt: string;
  duration: number;
  messages: StreamMessage[];
  findings: Finding[];
  tokensUsed: number;
  toolsUsed: number;
}

// Provider types
// Backend API provider type (UPPERCASE to match Prisma)
export type ApiProviderType = 'ANTHROPIC' | 'ZHIPU' | 'OPENAI' | 'GEMINI' | 'CUSTOM' | 'ANTIGRAVITY';

// Frontend UI provider type (lowercase for display)
export type ProviderType = 'anthropic' | 'zhipu' | 'openai' | 'gemini' | 'custom' | 'antigravity';

export interface ModelConfig {
  id: string;
  modelId: string;
  displayName: string;
  contextWindow: number;
  maxOutputTokens?: number;
  supportsStreaming?: boolean;
  supportsVision?: boolean;
  supportsTools?: boolean;
  inputPricePer1k?: number;
  outputPricePer1k?: number;
  enabled: boolean;
  usageCount?: number;
  lastUsedAt?: string;
}

export interface Provider {
  id: string;
  name: string;
  type: ProviderType;
  displayName: string;
  enabled: boolean;
  apiKey?: string;
  apiKeyConfigured?: boolean;
  baseUrl?: string;
  organizationId?: string;
  models: ModelConfig[];
  isDefault: boolean;
  priority?: number;
  healthStatus: 'healthy' | 'degraded' | 'unhealthy' | 'unknown';
  lastHealthCheck?: string;
  lastError?: string;
  createdAt?: string;
  updatedAt?: string;
  lastUsedAt?: string;
}

// Backend API provider type (raw from database, snake_case)
export interface ApiProvider {
  id: string;
  name: string;
  type: ApiProviderType;
  display_name: string;
  enabled: boolean;
  base_url?: string;
  organization_id?: string;
  is_default: boolean;
  priority?: number;
  health_status: 'HEALTHY' | 'DEGRADED' | 'UNHEALTHY' | 'UNKNOWN';
  last_health_check?: string;
  last_error?: string;
  created_at: string;
  updated_at: string;
  last_used_at?: string;
  api_key_hash?: string;
  oauth_configured?: boolean;
  models?: ApiModelConfig[];
}

// Backend API model config (raw from database, snake_case)
export interface ApiModelConfig {
  id: string;
  provider_id: string;
  model_id: string;
  display_name: string;
  context_window: number;
  max_output_tokens: number;
  supports_streaming: boolean;
  supports_vision: boolean;
  supports_tools: boolean;
  input_price_per_1k: number;
  output_price_per_1k: number;
  enabled: boolean;
  usage_count: number;
  last_used_at?: string;
}

// ============================================
// Backend API Pentest Types (snake_case)
// ============================================

export interface ApiPentest {
  id: string;
  target: string;
  scope?: Record<string, unknown>;
  config?: Record<string, unknown>;
  status: PentestStatus;
  phase: ApiPentestPhase;
  preflight_state?: PreflightState;
  preflight_summary?: PreflightResult | Record<string, unknown> | null;
  kali_workspace?: string | null;
  started_at?: string;
  ended_at?: string;
  created_at: string;
  updated_at: string;
  tokens_used: number;
  cost_usd: number;
  _count?: {
    findings?: number;
    tool_executions?: number;
    messages?: number;
    kali_audit_logs?: number;
  };
}

export interface ApiTodo {
  id: string;
  pentest_id: string;
  content: string;
  priority: number;
  status: 'PENDING' | 'IN_PROGRESS' | 'COMPLETED' | 'SKIPPED' | 'ERROR';
  agent_role?: string;
  depends_on: string[];
  created_at: string;
  updated_at: string;
  started_at?: string;
  completed_at?: string;
}

export interface ApiMessage {
  id: string;
  pentest_id: string;
  type: 'USER' | 'ASSISTANT' | 'THINKING' | 'SYSTEM';
  content: string;
  agent_role?: string;
  sequence: number;
  created_at: string;
}

export interface ApiToolExecution {
  id: string;
  pentest_id: string;
  tool_name: string;
  parameters: Record<string, unknown>;
  status: 'PENDING' | 'RUNNING' | 'COMPLETED' | 'FAILED' | 'TIMEOUT' | 'CANCELLED';
  output?: string;
  error?: string;
  exit_code?: number;
  duration_ms?: number;
  started_at?: string;
  ended_at?: string;
  agent_role?: string;
  created_at: string;
  updated_at: string;
}

export interface ApiFinding {
  id: string;
  pentest_id: string;
  report_id?: string;
  title: string;
  severity: ApiSeverity;
  proposed_severity?: ApiSeverity;
  verification_state?: FindingVerificationState;
  evidence_score?: number;
  reason_codes?: string[];
  source_signal_type?: FindingSourceSignalType;
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
  event_action?: 'created' | 'updated';
  agent_stage?: FindingsAgentStage;
  event_id?: string;
  event_seq?: number;
  classification_confidence?: number;
  classification_basis?: string;
  created_at?: string;
  discovered_at: string;
  updated_at: string;
}

export type ScopeProposalStatus = 'PENDING' | 'PARTIAL' | 'APPROVED' | 'REJECTED';
export type ScopeCandidateDecision = 'PENDING' | 'APPROVED' | 'REJECTED';
export type ScopeDecisionAction =
  | 'approve_all'
  | 'approve_recommended'
  | 'approve_selected'
  | 'reject_all'
  | 'reject_selected';

export interface ScopeProposalCandidate {
  id: string;
  proposal_id: string;
  domain: string;
  confidence: number;
  recommended: boolean;
  recommendation_reason?: string | null;
  evidence?: Record<string, unknown> | null;
  decision: ScopeCandidateDecision;
  decided_at?: string | null;
  created_at: string;
  updated_at: string;
}

export interface ScopeProposal {
  id: string;
  pentest_id: string;
  base_target: string;
  source: 'WHOIS_ORG_CORRELATION';
  status: ScopeProposalStatus;
  summary?: Record<string, unknown> | null;
  decided_at?: string | null;
  created_at: string;
  updated_at: string;
  candidates: ScopeProposalCandidate[];
}

export interface ApiKaliAuditLog {
  id: string;
  pentest_id: string;
  actor: string;
  tool_name: string;
  command?: string;
  arguments?: Record<string, unknown>;
  cwd?: string;
  status: 'SUCCESS' | 'FAILED' | 'BLOCKED';
  output?: string;
  error?: string;
  exit_code?: number;
  duration_ms?: number;
  created_at: string;
}

export type ContextCompactionTrigger = 'PHASE_END' | 'URGENT' | 'ERROR_RECOVERY' | 'MANUAL';

export interface ContextSnapshot {
  id: string;
  pentest_id: string;
  trigger: ContextCompactionTrigger;
  phase_from?: string | null;
  phase_to?: string | null;
  summary_markdown: string;
  summary_json: Record<string, unknown>;
  workspace_file?: string | null;
  archived_until_message_seq?: number | null;
  archived_until_tool_ts?: string | null;
  created_at: string;
}

export interface ContextRecallSnippet {
  source: 'snapshot' | 'workspace';
  snapshotId?: string;
  file?: string;
  score: number;
  excerpt: string;
}

export interface ContextRecallResult {
  query: string;
  snippets: ContextRecallSnippet[];
}

export type {
  SwarmRunStatus,
  SwarmAgentStatus,
  SwarmSeverity,
  SwarmStreamEventType,
  SwarmStreamEventMap,
  SwarmStreamMessage,
  SwarmAgent,
  SwarmFinding,
  SwarmRun,
  Agent,
  SysReptorFinding,
  Swarm,
  SysReptorFindingPayload,
  StartSwarmAuditRequest,
  StartSwarmParams,
  StartSwarmResponse,
} from '../src/types/swarm';

export interface ContextUsage {
  modelId: string;
  phase?: string;
  reason?: 'pre_llm' | 'post_turn' | 'session_complete' | string;
  contextWindowTokens: number;
  staticContextTokens: number;
  estimatedConversationTokens: number;
  estimatedContextTokens: number;
  estimatedUsagePct: number;
  warnThresholdTokens: number;
  urgentThresholdTokens: number;
  hardThresholdTokens: number;
  remainingBeforeCompactionTokens: number;
  remainingInWindowTokens: number;
  compactionThresholdPct: number;
  totalSessionTokens: number;
  timestamp?: number;
}

// ============================================
// Backend API Report Types (snake_case)
// ============================================

export interface ApiReport {
  id: string;
  pentest_id: string;
  title: string;
  executive_summary?: string;
  methodology?: string;
  scope_description?: string;
  status: 'DRAFT' | 'COMPLETE' | 'ARCHIVED';
  stats?: Record<string, unknown>;
  template: string;
  confidential: boolean;
  created_at: string;
  updated_at: string;
  completed_at?: string;
  pentest?: {
    target: string;
    scope?: Record<string, unknown>;
    status: PentestStatus;
    started_at?: string;
    ended_at?: string;
  };
  findings?: ApiFinding[];
  _count?: {
    findings?: number;
  };
}

export interface ApiExportJob {
  id: string;
  reportId: string;
  format: 'PDF' | 'HTML' | 'JSON' | 'DOCX';
  options?: Record<string, unknown>;
  status: 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED';
  file_path?: string;
  file_size?: number;
  error?: string;
  created_at: string;
  completed_at?: string;
}

// ============================================
// API Request/Response Types
// ============================================

export interface CreatePentestRequest {
  target: string;
  scope?: {
    inScope?: string[];
    outOfScope?: string[];
    maxDepth?: number;
    rateLimit?: number;
  };
  config?: {
    type?: PentestType;
    rules?: Partial<EngagementRules>;
    mcpServer?: string;
    timeout?: number;
    deepThinkingBudget?: number;
  };
  providerId?: string;
  modelId?: string;
}

export interface CreateProviderRequest {
  name: string;
  type: ApiProviderType;
  display_name: string;
  api_key?: string;
  base_url?: string;
  organization_id?: string;
  is_default?: boolean;
  priority?: number;
  enabled?: boolean;
  default_temperature?: number;
  default_max_tokens?: number;
  timeout_ms?: number;
  retry_count?: number;
}

export interface UpdateProviderRequest {
  name?: string;
  type?: ApiProviderType;
  display_name?: string;
  api_key?: string;
  base_url?: string;
  organization_id?: string;
  is_default?: boolean;
  priority?: number;
  enabled?: boolean;
}

export interface ProviderTestResponse {
  success: boolean;
  latency?: number;
  error?: string;
  models_available?: string[];
}

// ============================================
// SSE Event Types
// ============================================

export interface SSEEvent {
  type: 'connected'
  | 'preflight_started'
  | 'preflight_check'
  | 'preflight_remediation'
  | 'preflight_blocked'
  | 'preflight_complete'
  | 'phase_change'
  | 'status_change'
  | 'context_usage'
  | 'thinking_delta'
  | 'message_delta'
  | 'tool_start'
  | 'tool_end'
  | 'todos_updated'
  | 'finding'
  | 'tool_use'
  | 'tool_result'
  | 'error'
  | 'session_complete'
  | 'session_cancelled'
  | 'scope_review_required'
  | 'scope_review_updated'
  | 'scope_review_applied'
  | 'context_compaction_started'
  | 'context_compacted'
  | 'findings_agent_status'
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
  | 'tool_approval_required';
  data: Record<string, unknown> | unknown;
}

export interface SSEConnectedEvent extends SSEEvent {
  type: 'connected';
  data: {
    connection_id: string;
    pentest_id: string;
    timestamp: number;
  };
}

export interface SSEPhaseChangeEvent extends SSEEvent {
  type: 'phase_change';
  data: {
    phase: ApiPentestPhase;
  };
}

export interface SSEFindingEvent extends SSEEvent {
  type: 'finding';
  data: ApiFinding;
}

export interface SSEErrorEvent extends SSEEvent {
  type: 'error';
  data: {
    message: string;
    errors?: string[];
  };
}

export interface SSESessionCompleteEvent extends SSEEvent {
  type: 'session_complete';
  data: {
    reportId?: string;
    tokensUsed?: number;
    iterations?: number;
  };
}

export interface SSEFindingsAgentStatusEvent extends SSEEvent {
  type: 'findings_agent_status';
  data: {
    status: 'idle' | 'queued' | 'processing' | 'error';
    queue_depth: number;
    jobs_processed: number;
    created_count: number;
    updated_count: number;
    last_action?: 'created' | 'updated';
    last_finding_title?: string;
    last_activity_at?: string;
    current_stage?: FindingsAgentStage;
    active_job_id?: string;
    candidate_title?: string;
    progress_pct?: number;
    verification_step?: string;
    message?: string;
    timestamp?: number;
  };
}

export interface SSEContextUsageEvent extends SSEEvent {
  type: 'context_usage';
  data: ContextUsage;
}
