/**
 * Preflight Types
 */

export interface PreflightCheck {
  id: string;
  name: string;
  status: 'pending' | 'running' | 'success' | 'warning' | 'error';
  output?: string[];
  duration_ms?: number;
  severity?: 'blocking' | 'warning' | 'info';
  metadata?: Record<string, any>;
}

export interface PreflightRemediationAttempt {
  checkId: string;
  tool: string;
  attempted: boolean;
  success: boolean;
  message: string;
  timestamp: string;
}

export interface PreflightOptions {
  target: string;
  pentestId?: string;
  inScope?: string[];
  outOfScope?: string[];
  pentestType?: 'quick' | 'standard' | 'comprehensive' | 'custom';
  mcpServer?: string;
  mcpTimeout?: number;
}

export interface PreflightResult {
  success: boolean;
  checks: PreflightCheck[];
  blockingFailures: PreflightCheck[];
  warnings: PreflightCheck[];
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
