/**
 * Types for Agent Swarm pentest runs and SysReptor integration
 */

export type SwarmRunStatus =
  | 'QUEUED'
  | 'RUNNING'
  | 'PAUSED'
  | 'MERGING'
  | 'COMPLETED'
  | 'FAILED'
  | 'PARTIAL_COMPLETED';

export type SwarmAgentStatus =
  | 'SPAWNED'
  | 'THINKING'
  | 'RUNNING_TOOL'
  | 'IDLE'
  | 'DONE'
  | 'FAILED';

export type SwarmSeverity = 'critical' | 'high' | 'medium' | 'low' | 'info';

// ============================================
// CORE SWARM TYPES
// ============================================

export interface Agent {
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

export interface SysReptorFinding {
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
  pushed: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface Swarm {
  id: string;
  pentestId: string;
  target: string;
  task?: string;
  status: SwarmRunStatus;
  maxAgents: number;
  maxConcurrentAgents: number;
  forceMerged: boolean;
  sysReptorProjectId?: string;
  agents: Agent[];
  findings: SysReptorFinding[];
  startedAt: string;
  endedAt?: string;
}

// ============================================
// API REQUEST/RESPONSE
// ============================================

export interface StartSwarmAuditRequest {
  task?: string;
  scope?: string[];
  maxAgents?: number;
  maxConcurrentAgents?: number;
  autoPushToSysReptor?: boolean;
}

export interface StartSwarmParams extends StartSwarmAuditRequest {
  pentestId: string;
  target: string;
}

export interface StartSwarmAuditResponse {
  swarmRunId: string;
  status: SwarmRunStatus;
  maxAgents: number;
  maxConcurrentAgents: number;
}

// ============================================
// SYSREPTOR PAYLOAD TYPES
// ============================================

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

// ============================================
// SWARM STREAMING EVENTS (SSE)
// ============================================

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
  | 'swarm_failed';

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
  agent: Agent;
  index: number;
  timestamp: number;
}

export interface SwarmAgentStatusEventData {
  swarmRunId: string;
  agent: Agent;
  timestamp: number;
}

export interface SwarmFindingEventData {
  swarmRunId: string;
  finding: SysReptorFinding;
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
}

export type SwarmStreamMessage = {
  [K in SwarmStreamEventType]: {
    type: K;
    data: SwarmStreamEventMap[K];
    eventId?: number;
  };
}[SwarmStreamEventType];

// Compatibility aliases used across backend/frontend naming variants
export type SwarmAgent = Agent;
export type SwarmFinding = SysReptorFinding;
export type SwarmRun = Swarm;
export type StartSwarmResponse = StartSwarmAuditResponse;
