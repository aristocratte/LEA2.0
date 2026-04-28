/**
 * Frontend types for Agent Swarm pentest and SysReptor integration
 */

export type SwarmRunStatus =
  | 'QUEUED'
  | 'RUNNING'
  | 'PAUSED'
  | 'MERGING'
  | 'COMPLETED'
  | 'FAILED'
  | 'CANCELLED'
  | 'PARTIAL_COMPLETED';

export type SwarmAgentStatus =
  | 'SPAWNED'
  | 'THINKING'
  | 'RUNNING_TOOL'
  | 'IDLE'
  | 'DONE'
  | 'FAILED';

export type SwarmSeverity = 'critical' | 'high' | 'medium' | 'low' | 'info';
export type FindingReviewState = 'draft' | 'validated' | 'rejected';

export interface SwarmAgent {
  id: string;
  swarmRunId: string;
  name: string;
  role: string;
  status: SwarmAgentStatus;
  progress: number;
  toolName?: string;
  lastMessage?: string;
  createdAt: string;
  updatedAt: string;
}

export interface SwarmFinding {
  id: string;
  pentestId: string;
  swarmRunId: string;
  agentId: string;
  title: string;
  description: string;
  severity: SwarmSeverity;
  cvss?: number;
  proof?: string;
  remediation?: string;
  affected_components?: string[];
  reviewState?: FindingReviewState;
  evidenceScore?: number;
  verificationState?: 'PROVISIONAL' | 'CONFIRMED' | 'REJECTED';
  reasonCodes?: string[];
  status?: 'OPEN' | 'CONFIRMED' | 'FALSE_POSITIVE' | 'FIXED' | 'RISK_ACCEPTED';
  verified?: boolean;
  falsePositive?: boolean;
  hasEvidence?: boolean;
  pushed: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface SwarmRun {
  id: string;
  pentestId: string;
  target: string;
  task?: string;
  status: SwarmRunStatus;
  maxAgents: number;
  maxConcurrentAgents: number;
  forceMerged: boolean;
  sysReptorProjectId?: string;
  agents: SwarmAgent[];
  findings: SwarmFinding[];
  tasks?: SwarmTask[];
  startedAt: string;
  endedAt?: string;
}

export interface SwarmTask {
  id: string;
  swarmRunId: string;
  agentId: string;
  agentName: string;
  agentRole: string;
  title: string;
  description: string;
  status: 'planned' | 'in_progress' | 'completed' | 'failed';
  toolName?: string;
  createdAt: string;
  startedAt?: string;
  completedAt?: string;
}

export interface AgentMessage {
  id: string;
  swarmRunId: string;
  fromAgentId: string;
  fromAgentName: string;
  fromRole: string;
  content: string;
  type: 'status' | 'finding' | 'handoff';
  timestamp: number;
}

export interface SwarmFeedMessage {
  id: string;
  swarmRunId: string;
  source: string;
  agentId?: string;
  content: string;
  toolName?: string;
  findingId?: string;
  severity?: string;
  level?: 'error';
  timestamp: number;
}

export interface StartSwarmAuditRequest {
  task?: string;
  scope?: string[];
  maxAgents?: number;
  maxConcurrentAgents?: number;
  autoPushToSysReptor?: boolean;
  runtime?: {
    mode?: 'live' | 'scenario' | 'replay';
    scenarioId?: string;
    traceId?: string;
    speed?: number;
    startAtSequence?: number;
    autoStart?: boolean;
    capture?: boolean;
    failureProfileId?: string;
  };
}

export interface StartSwarmResponse {
  swarmRunId: string;
  status: SwarmRunStatus;
  maxAgents: number;
  maxConcurrentAgents: number;
}

export interface SysReptorReference {
  key: string;
  value: string;
}

export interface SysReptorFindingPayload {
  title: string;
  description: string;
  severity: SwarmSeverity;
  cvss?: number;
  proof?: string;
  remediation?: string;
  affected_components: string[];
  references: SysReptorReference[];
}

export type SwarmStreamEventType =
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
  | 'task_created'
  | 'task_updated'
  | 'agent_message';

export interface SwarmConnectedEventData {
  connection_id: string;
  pentest_id: string;
  timestamp: number;
  last_event_id?: number;
}

export interface SwarmStartedEventData {
  swarmRunId: string;
  target: string;
  status: Extract<SwarmRunStatus, 'QUEUED' | 'RUNNING'>;
  maxAgents: number;
  maxConcurrentAgents: number;
  task?: string;
  timestamp: number;
}

export interface SwarmAgentSpawnedEventData {
  swarmRunId: string;
  agent: SwarmAgent;
  index: number;
  timestamp: number;
}

export interface SwarmAgentStatusEventData {
  swarmRunId: string;
  agent: SwarmAgent;
  timestamp: number;
}

export interface SwarmFindingEventData {
  swarmRunId: string;
  finding: SwarmFinding;
  timestamp: number;
}

export interface SwarmPausedEventData {
  swarmRunId: string;
  status: Extract<SwarmRunStatus, 'PAUSED'>;
  timestamp: number;
}

export interface SwarmResumedEventData {
  swarmRunId: string;
  status: Extract<SwarmRunStatus, 'RUNNING'>;
  reason?: string;
  timestamp: number;
}

export interface SwarmMergedEventData {
  swarmRunId: string;
  requested?: boolean;
  findingsCount?: number;
  timestamp: number;
}

export interface SwarmCompletedEventData {
  swarmRunId: string;
  status: Extract<SwarmRunStatus, 'COMPLETED' | 'PARTIAL_COMPLETED'>;
  findingsCount: number;
  agentsCount: number;
  sysReptorProjectId?: string;
  timestamp: number;
}

export interface SwarmFailedEventData {
  swarmRunId: string;
  error: string;
  timestamp: number;
}

export interface SwarmTaskEventData {
  swarmRunId: string;
  task: SwarmTask;
  timestamp: number;
}

export interface AgentMessageEventData {
  swarmRunId: string;
  message: AgentMessage;
  timestamp: number;
}

export interface SwarmStreamEventMap {
  swarm_connected: SwarmConnectedEventData;
  swarm_started: SwarmStartedEventData;
  agent_spawned: SwarmAgentSpawnedEventData;
  agent_status: SwarmAgentStatusEventData;
  finding_created: SwarmFindingEventData;
  finding_updated: SwarmFindingEventData;
  swarm_paused: SwarmPausedEventData;
  swarm_resumed: SwarmResumedEventData;
  swarm_merged: SwarmMergedEventData;
  swarm_completed: SwarmCompletedEventData;
  swarm_failed: SwarmFailedEventData;
  task_created: SwarmTaskEventData;
  task_updated: SwarmTaskEventData;
  agent_message: AgentMessageEventData;
}

export type SwarmStreamMessage = {
  [K in SwarmStreamEventType]: {
    type: K;
    data: SwarmStreamEventMap[K];
    eventId?: number;
  };
}[SwarmStreamEventType];

export type Agent = SwarmAgent;
export type SysReptorFinding = SwarmFinding;
export type Swarm = SwarmRun;
export type StartSwarmParams = StartSwarmAuditRequest;
