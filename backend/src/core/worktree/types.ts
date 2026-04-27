export interface WorktreeSession {
  readonly slug: string;
  readonly worktreePath: string;
  readonly branch: string;
  readonly agentId?: string;
  readonly originalCwd: string;
  readonly createdAt: Date;
}

export interface WorktreeCreateOptions {
  slug: string;
  branch?: string;
  baseBranch?: string;
  agentId?: string;
}

export interface WorktreeRemoveOptions {
  force?: boolean;
  removeBranch?: boolean;
}

export interface WorktreeInfo {
  slug: string;
  worktreePath: string;
  branch: string;
  agentId?: string;
  createdAt: Date;
  hasChanges: boolean;
}
