/**
 * Skills API Client
 *
 * Frontend access to the C12 skills management API and C9 tool invocation API.
 */

import { requestJson } from './api';

export interface SkillStepMetadata {
  id: string;
  tool: string;
  optional: boolean;
}

export interface SkillMetadata {
  id: string;
  toolName: string;
  aliases: string[];
  description: string;
  steps: SkillStepMetadata[];
  readOnly: boolean;
  concurrencySafe: boolean;
  destructive: boolean;
  maxResultSizeChars: number;
}

export interface SkillsSnapshot {
  skillsDir: string;
  loadedAt?: string;
  registered: number;
  skipped: number;
  errors: string[];
  skills: SkillMetadata[];
}

export interface SkillInvokeResult {
  toolName: string;
  toolUseId: string;
  success: boolean;
  result: string;
  metadata?: {
    sessionId: string;
    captureTaskId?: string;
    truncated: boolean;
    resultLength: number;
  };
  error?: {
    code?: string;
    recoverable?: boolean;
    suggestions?: string[];
  };
}

export async function listSkills(): Promise<SkillsSnapshot> {
  const res = await requestJson<{ data: SkillsSnapshot }>('/api/skills');
  return res.data;
}

export async function reloadSkills(): Promise<SkillsSnapshot> {
  const res = await requestJson<{ data: SkillsSnapshot }>('/api/skills/reload', {
    method: 'POST',
    body: {},
  });
  return res.data;
}

export async function invokeSkill(
  toolName: string,
  input: Record<string, unknown>,
): Promise<SkillInvokeResult> {
  return await requestJson<SkillInvokeResult>(
    `/api/tools/${encodeURIComponent(toolName)}/invoke`,
    {
      method: 'POST',
      body: { input },
    },
  );
}

export const skillsApi = {
  listSkills,
  reloadSkills,
  invokeSkill,
};
