import { Prisma } from '@prisma/client';
import { z } from 'zod';

const stringArraySchema = z.array(z.string());
export const jsonRecordSchema = z.record(z.unknown());

const normalizedScopeSchema = z.object({
  inScope: stringArraySchema.default([]),
  outOfScope: stringArraySchema.default([]),
}).passthrough();

export type JsonRecord = z.infer<typeof jsonRecordSchema>;

export const pentestScopeSchema = z.union([
  normalizedScopeSchema,
  stringArraySchema.transform((entries) => ({
    inScope: entries,
    outOfScope: [],
  })),
  z.null().transform(() => ({
    inScope: [],
    outOfScope: [],
  })),
]).catch({
  inScope: [],
  outOfScope: [],
});
export type PentestScope = z.infer<typeof pentestScopeSchema>;

export const pentestConfigSchema = z.object({
  provider: z.string().optional(),
  providerId: z.string().optional(),
  model: z.string().optional(),
  modelId: z.string().optional(),
  type: z.enum(['quick', 'standard', 'comprehensive', 'custom']).optional(),
  mcpServer: z.string().optional(),
  timeout: z.number().nullable().optional(),
  deepThinkingBudget: z.number().nullable().optional(),
  reasoningEffort: z.enum(['quick', 'standard', 'deep', 'maximum']).optional(),
  rules: z.record(z.boolean()).optional(),
  findingsStrictEvidenceV2: z.boolean().optional(),
  findingsReportHardGate: z.boolean().optional(),
  findingsUiV2: z.boolean().optional(),
  preflight: jsonRecordSchema.optional(),
  preflight_state: z.string().optional(),
  preflight_summary: jsonRecordSchema.optional(),
  kali_workspace: z.string().nullable().optional(),
}).passthrough().catch({});
export type PentestConfigJson = z.infer<typeof pentestConfigSchema>;

export const preflightSummarySchema = jsonRecordSchema.catch({});
export type PreflightSummaryJson = z.infer<typeof preflightSummarySchema>;

export const findingMetadataSchema = z.object({
  source: z.string().optional(),
  swarmRunId: z.string().optional(),
  agentId: z.string().optional(),
  agentRole: z.string().optional(),
}).passthrough().catch({});
export type FindingMetadata = z.infer<typeof findingMetadataSchema>;

export const toolExecutionParametersSchema = jsonRecordSchema.catch({});
export type ToolExecutionParameters = z.infer<typeof toolExecutionParametersSchema>;

export const pentestEventDataSchema = jsonRecordSchema.catch({});
export type PentestEventData = z.infer<typeof pentestEventDataSchema>;

export const scopeProposalSummarySchema = jsonRecordSchema.catch({});
export type ScopeProposalSummary = z.infer<typeof scopeProposalSummarySchema>;

export const scopeProposalCandidateEvidenceSchema = z.object({
  from_amass: z.boolean().optional(),
  from_ct: z.boolean().optional(),
  from_whois_correlation: z.boolean().optional(),
  org_match: z.boolean().optional(),
  nameserver_overlap: stringArraySchema.optional(),
  candidate_whois_org: z.string().optional(),
  candidate_registrar: z.string().optional(),
  registrar_match_only: z.boolean().optional(),
}).passthrough().catch({});
export type ScopeProposalCandidateEvidence = z.infer<typeof scopeProposalCandidateEvidenceSchema>;

export const contextSnapshotSummarySchema = jsonRecordSchema.catch({});
export type ContextSnapshotSummary = z.infer<typeof contextSnapshotSummarySchema>;

export const contextRecallSnippetSchema = z.object({
  source: z.enum(['snapshot', 'workspace']),
  snapshotId: z.string().optional(),
  file: z.string().optional(),
  score: z.number(),
  excerpt: z.string(),
}).passthrough();

export const contextRecallResultsSchema = z.object({
  snippets: z.array(contextRecallSnippetSchema).default([]),
  count: z.number().int().nonnegative().default(0),
}).passthrough().catch({
  snippets: [],
  count: 0,
});
export type ContextRecallResults = z.infer<typeof contextRecallResultsSchema>;

export const reportStatsSchema = z.object({
  totalFindings: z.number().int().nonnegative(),
  bySeverity: z.object({
    Critical: z.number().int().nonnegative(),
    High: z.number().int().nonnegative(),
    Medium: z.number().int().nonnegative(),
    Low: z.number().int().nonnegative(),
    Informational: z.number().int().nonnegative(),
  }),
  byCategory: z.record(z.number().int().nonnegative()),
  avgCvssScore: z.number().nullable(),
  maxSeverity: z.string().nullable(),
  source: z.enum(['classic', 'swarm']).optional(),
}).passthrough();
export type ReportStatsJson = z.infer<typeof reportStatsSchema>;

export const mcpServerToolSchema = z.object({
  name: z.string(),
  description: z.string(),
  inputSchema: jsonRecordSchema.optional(),
}).passthrough();

export const mcpServerToolsSchema = z.array(mcpServerToolSchema).catch([]);
export type McpServerToolJson = z.infer<typeof mcpServerToolSchema>;
export type McpServerToolsJson = z.infer<typeof mcpServerToolsSchema>;

export const mcpServerArgsSchema = stringArraySchema.catch([]);
export type McpServerArgsJson = z.infer<typeof mcpServerArgsSchema>;

export const exportJobOptionsSchema = jsonRecordSchema.catch({});
export type ExportJobOptionsJson = z.infer<typeof exportJobOptionsSchema>;

export function parseJsonWithSchema<TSchema extends z.ZodTypeAny>(
  schema: TSchema,
  value: unknown,
  fallback: z.output<TSchema>
): z.output<TSchema> {
  const result = schema.safeParse(value);
  return result.success ? result.data : fallback;
}

export function parseOptionalJsonWithSchema<TSchema extends z.ZodTypeAny>(
  schema: TSchema,
  value: unknown,
  fallback?: z.output<TSchema>
): z.output<TSchema> | undefined {
  if (value === null || value === undefined) {
    return fallback;
  }

  const result = schema.safeParse(value);
  return result.success ? result.data : fallback;
}

export function toPrismaJson(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value ?? null)) as Prisma.InputJsonValue;
}

export function toJsonRecord(value: unknown): Record<string, unknown> {
  return jsonRecordSchema.parse(JSON.parse(JSON.stringify(value ?? {})));
}
