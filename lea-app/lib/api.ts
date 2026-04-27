import type {
  ApiFinding,
  ApiKaliAuditLog,
  ApiMessage,
  ApiPentest,
  ApiProvider,
  ApiReport,
  ApiTodo,
  Checkpoint,
  ContextRecallResult,
  ContextSnapshot,
  CreatePentestRequest,
  PreflightResult,
  PreflightState,
  ScopeDecisionAction,
  ScopeProposal,
  StartSwarmAuditRequest,
  StartSwarmResponse,
  SwarmRun,
} from '@/types';

type QueryValue = string | number | boolean | null | undefined;
type QueryParams = Record<string, QueryValue>;

interface ApiEnvelope<T> {
  data: T;
}

interface ApiErrorPayload {
  error?: unknown;
  message?: unknown;
  details?: unknown;
}

interface RequestOptions extends Omit<RequestInit, 'body'> {
  query?: QueryParams;
  body?: unknown;
}

const DEFAULT_API_PORT = '3001';

function trimTrailingSlash(value: string): string {
  return value.replace(/\/+$/, '');
}

function resolveLocalApiHostname(hostname: string): string {
  return hostname === 'localhost' ? '127.0.0.1' : hostname;
}

function normalizeBaseUrl(input: string): string {
  const raw = String(input || '').trim();
  if (!raw) {
    return '';
  }

  try {
    const parsed = new URL(raw);
    if (typeof window !== 'undefined' && parsed.hostname === 'backend') {
      parsed.hostname = window.location.hostname;
    }
    return trimTrailingSlash(parsed.toString());
  } catch {
    return trimTrailingSlash(raw);
  }
}

function resolveApiBase(): string {
  const configured = process.env.NEXT_PUBLIC_API_BASE;
  if (configured && configured.trim().length > 0) {
    return normalizeBaseUrl(configured);
  }

  if (typeof window !== 'undefined') {
    const protocol = window.location.protocol === 'https:' ? 'https:' : 'http:';
    return `${protocol}//${resolveLocalApiHostname(window.location.hostname)}:${DEFAULT_API_PORT}`;
  }

  return `http://127.0.0.1:${DEFAULT_API_PORT}`;
}

export function getDevelopmentApiKey(): string | undefined {
  if (process.env.NODE_ENV === 'production') {
    return undefined;
  }

  const apiKey = process.env.NEXT_PUBLIC_LEA_DEV_API_KEY?.trim();
  return apiKey && apiKey.length > 0 ? apiKey : undefined;
}

function resolveStreamBase(): string {
  const configuredWs = process.env.NEXT_PUBLIC_WS_BASE;
  if (configuredWs && configuredWs.trim().length > 0) {
    const normalized = configuredWs
      .replace(/^ws:\/\//i, 'http://')
      .replace(/^wss:\/\//i, 'https://');
    return normalizeBaseUrl(normalized);
  }

  return resolveApiBase();
}

function buildUrl(pathname: string, query?: QueryParams, baseUrl: string = resolveApiBase()): string {
  const normalizedPath = pathname.startsWith('/') ? pathname : `/${pathname}`;
  const url = new URL(normalizedPath, `${trimTrailingSlash(baseUrl)}/`);

  if (query) {
    for (const [key, rawValue] of Object.entries(query)) {
      if (rawValue === undefined || rawValue === null) continue;
      url.searchParams.set(key, String(rawValue));
    }
  }

  return url.toString();
}

function extractErrorMessage(payload: unknown, fallback: string): string {
  if (typeof payload === 'string') {
    const trimmed = payload.trim();
    return trimmed.length > 0 ? trimmed : fallback;
  }

  if (payload && typeof payload === 'object') {
    const obj = payload as ApiErrorPayload;
    if (typeof obj.error === 'string' && obj.error.trim().length > 0) {
      return obj.error;
    }
    if (typeof obj.message === 'string' && obj.message.trim().length > 0) {
      return obj.message;
    }
    if (Array.isArray(obj.details) && obj.details.length > 0) {
      const first = obj.details[0];
      if (first && typeof first === 'object' && 'message' in first) {
        const detailMessage = (first as { message?: unknown }).message;
        if (typeof detailMessage === 'string' && detailMessage.trim().length > 0) {
          return detailMessage;
        }
      }
    }
  }

  return fallback;
}

export async function requestJson<T>(pathname: string, options: RequestOptions = {}): Promise<T> {
  const { query, body, headers, method = 'GET', cache = 'no-store', ...init } = options;
  const url = buildUrl(pathname, query);

  const finalHeaders = new Headers(headers || {});
  if (!finalHeaders.has('Accept')) {
    finalHeaders.set('Accept', 'application/json');
  }
  const apiKey = getDevelopmentApiKey();
  if (apiKey && !finalHeaders.has('Authorization')) {
    finalHeaders.set('Authorization', `Bearer ${apiKey}`);
  }
  if (body !== undefined && !finalHeaders.has('Content-Type')) {
    finalHeaders.set('Content-Type', 'application/json');
  }

  const response = await fetch(url, {
    ...init,
    method,
    headers: finalHeaders,
    cache,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  if (response.status === 204) {
    return undefined as T;
  }

  const contentType = response.headers.get('content-type') || '';
  const payload: unknown = contentType.includes('application/json')
    ? await response.json()
    : await response.text();

  if (!response.ok) {
    const fallback = `${response.status} ${response.statusText}`.trim();
    throw new Error(extractErrorMessage(payload, fallback));
  }

  return payload as T;
}

function unwrapData<T>(payload: T | ApiEnvelope<T>): T {
  if (payload && typeof payload === 'object' && 'data' in (payload as object)) {
    return (payload as ApiEnvelope<T>).data;
  }
  return payload as T;
}

function normalizeLastEventCursor(lastEventId?: string | number | null): string | undefined {
  if (typeof lastEventId === 'string') {
    const trimmed = lastEventId.trim();
    return trimmed.length > 0 ? trimmed : undefined;
  }

  if (typeof lastEventId === 'number' && Number.isFinite(lastEventId) && lastEventId > 0) {
    return String(Math.floor(lastEventId));
  }

  return undefined;
}

export function getStreamUrl(pentestId: string, lastEventId?: string | number | null): string {
  const query: QueryParams = {};
  const normalizedCursor = normalizeLastEventCursor(lastEventId);
  if (normalizedCursor) {
    query.lastEventId = normalizedCursor;
  }

  return buildUrl(
    `/api/pentests/${encodeURIComponent(pentestId)}/stream`,
    query,
    resolveStreamBase()
  );
}

export function getSwarmStreamUrl(pentestId: string, lastEventId?: string | number | null): string {
  const query: QueryParams = {};
  const normalizedCursor = normalizeLastEventCursor(lastEventId);
  if (normalizedCursor) {
    query.lastEventId = normalizedCursor;
  }

  return buildUrl(
    `/api/pentests/${encodeURIComponent(pentestId)}/swarm/stream`,
    query,
    resolveStreamBase()
  );
}

export function getSwarmReportPdfUrl(pentestId: string): string {
  return buildUrl(`/api/pentests/${encodeURIComponent(pentestId)}/swarm/report.pdf`);
}

export const pentestsApi = {
  list(params?: { status?: string; limit?: number; offset?: number }) {
    return requestJson<ApiEnvelope<ApiPentest[]>>('/api/pentests', { query: params });
  },

  get(pentestId: string) {
    return requestJson<ApiEnvelope<ApiPentest>>(`/api/pentests/${encodeURIComponent(pentestId)}`);
  },

  create(payload: CreatePentestRequest) {
    return requestJson<ApiEnvelope<ApiPentest>>('/api/pentests', {
      method: 'POST',
      body: payload,
    });
  },

  bulkDelete(ids: string[]) {
    return requestJson<ApiEnvelope<{
      requested: number;
      deletedIds: string[];
      skipped: Array<{ id: string; reason: string }>;
      notFoundIds: string[];
    }>>('/api/pentests/bulk-delete', {
      method: 'POST',
      body: { ids },
    });
  },

  runPreflight(pentestId: string) {
    return requestJson<ApiEnvelope<{ status: string }>>(
      `/api/pentests/${encodeURIComponent(pentestId)}/preflight/run`,
      { method: 'POST' }
    );
  },

  retryPreflight(pentestId: string) {
    return requestJson<ApiEnvelope<{ status: string }>>(
      `/api/pentests/${encodeURIComponent(pentestId)}/preflight/retry`,
      { method: 'POST' }
    );
  },

  getPreflight(pentestId: string) {
    return requestJson<ApiEnvelope<{
      id: string;
      status: string;
      phase: string;
      preflight_state: PreflightState;
      preflight_summary: PreflightResult | Record<string, unknown> | null;
      kali_workspace: string | null;
      updated_at: string;
    }>>(`/api/pentests/${encodeURIComponent(pentestId)}/preflight`);
  },

  start(pentestId: string) {
    return requestJson<ApiEnvelope<{
      status: string;
      providerId?: string;
      modelId?: string;
      thinkingBudget?: number;
      fallbackApplied?: boolean;
    }>>(`/api/pentests/${encodeURIComponent(pentestId)}/start`, { method: 'POST' });
  },

  startSwarm(
    pentestId: string,
    payload?: StartSwarmAuditRequest
  ) {
    return requestJson<ApiEnvelope<StartSwarmResponse>>(
      `/api/pentests/${encodeURIComponent(pentestId)}/swarm/start`,
      { method: 'POST', body: payload || {} }
    );
  },

  getSwarmState(pentestId: string) {
    return requestJson<ApiEnvelope<SwarmRun>>(
      `/api/pentests/${encodeURIComponent(pentestId)}/swarm/state`
    );
  },

  getSwarmHistory(pentestId: string) {
    return requestJson<ApiEnvelope<SwarmRun[]>>(
      `/api/pentests/${encodeURIComponent(pentestId)}/swarm/history`
    );
  },

  pauseSwarm(pentestId: string) {
    return requestJson<ApiEnvelope<SwarmRun>>(
      `/api/pentests/${encodeURIComponent(pentestId)}/swarm/pause`,
      { method: 'POST' }
    );
  },

  resumeSwarm(pentestId: string) {
    return requestJson<ApiEnvelope<SwarmRun>>(
      `/api/pentests/${encodeURIComponent(pentestId)}/swarm/resume`,
      { method: 'POST' }
    );
  },

  forceMergeSwarm(pentestId: string) {
    return requestJson<ApiEnvelope<SwarmRun>>(
      `/api/pentests/${encodeURIComponent(pentestId)}/swarm/force-merge`,
      { method: 'POST' }
    );
  },

  controlSwarmRuntime(
    pentestId: string,
    payload: {
      action: 'pause' | 'resume' | 'step' | 'jump_to_sequence' | 'jump_to_correlation';
      sequence?: number;
      correlationId?: string;
    },
  ) {
    return requestJson<ApiEnvelope<SwarmRun | null>>(
      `/api/pentests/${encodeURIComponent(pentestId)}/swarm/runtime/control`,
      { method: 'POST', body: payload },
    );
  },

  listSwarmTraces(pentestId: string) {
    return requestJson<ApiEnvelope<unknown[]>>(
      `/api/pentests/${encodeURIComponent(pentestId)}/swarm/traces`,
    );
  },

  getSwarmTrace(traceId: string) {
    return requestJson<ApiEnvelope<unknown>>(
      `/api/swarm/traces/${encodeURIComponent(traceId)}`,
    );
  },

  async submitApproval(pentestId: string, eventId: string, decision: 'approved' | 'denied') {
    const route = decision === 'approved' ? 'approve' : 'deny';
    return requestJson<ApiEnvelope<unknown>>(
      `/api/pentests/${encodeURIComponent(pentestId)}/swarm/tools/${route}`,
      {
        method: 'POST',
        body: decision === 'approved'
          ? { approvalId: eventId }
          : { approvalId: eventId, reason: 'Denied by operator' },
      }
    );
  },

  pause(pentestId: string) {
    return requestJson<ApiEnvelope<{ status: string }>>(
      `/api/pentests/${encodeURIComponent(pentestId)}/pause`,
      { method: 'POST' }
    );
  },

  resume(pentestId: string) {
    return requestJson<ApiEnvelope<{ status: string }>>(
      `/api/pentests/${encodeURIComponent(pentestId)}/resume`,
      { method: 'POST' }
    );
  },

  cancel(pentestId: string) {
    return requestJson<ApiEnvelope<{ status: string }>>(
      `/api/pentests/${encodeURIComponent(pentestId)}/cancel`,
      { method: 'POST' }
    );
  },

  complete(pentestId: string) {
    return requestJson<ApiEnvelope<ApiReport>>(
      `/api/pentests/${encodeURIComponent(pentestId)}/complete`,
      { method: 'POST' }
    );
  },

  getFindings(
    pentestId: string,
    params?: { severity?: string; status?: string; limit?: number; offset?: number }
  ) {
    return requestJson<ApiEnvelope<ApiFinding[]>>(
      `/api/pentests/${encodeURIComponent(pentestId)}/findings`,
      { query: params }
    );
  },

  getTodos(pentestId: string) {
    return requestJson<ApiEnvelope<ApiTodo[]>>(`/api/pentests/${encodeURIComponent(pentestId)}/todos`);
  },

  getMessages(
    pentestId: string,
    params?: { limit?: number; before?: number | string; includeArchived?: boolean }
  ) {
    return requestJson<ApiEnvelope<ApiMessage[]>>(
      `/api/pentests/${encodeURIComponent(pentestId)}/messages`,
      { query: params }
    );
  },

  createMessage(
    pentestId: string,
    payload: { type?: string; content: string; agent_role?: string }
  ) {
    return requestJson<ApiEnvelope<ApiMessage>>(
      `/api/pentests/${encodeURIComponent(pentestId)}/messages`,
      { method: 'POST', body: payload }
    );
  },

  getAudit(
    pentestId: string,
    params?: { limit?: number; includeArchived?: boolean }
  ) {
    return requestJson<ApiEnvelope<ApiKaliAuditLog[]>>(
      `/api/pentests/${encodeURIComponent(pentestId)}/audit`,
      { query: params }
    );
  },

  getWorkspaceTree(pentestId: string, params?: { depth?: number }) {
    return requestJson<ApiEnvelope<{ workspace?: string | null; tree: string }>>(
      `/api/pentests/${encodeURIComponent(pentestId)}/workspace/tree`,
      { query: params }
    );
  },

  getScopeProposal(pentestId: string) {
    return requestJson<ApiEnvelope<ScopeProposal | null>>(
      `/api/pentests/${encodeURIComponent(pentestId)}/scope/proposals`
    );
  },

  discoverScope(pentestId: string) {
    return requestJson<ApiEnvelope<{ proposal: ScopeProposal | null; warnings?: string[] }>>(
      `/api/pentests/${encodeURIComponent(pentestId)}/scope/discover`,
      { method: 'POST' }
    );
  },

  decideScope(
    pentestId: string,
    proposalId: string,
    payload: { action: ScopeDecisionAction; domains?: string[] }
  ) {
    return requestJson<ApiEnvelope<ScopeProposal>>(
      `/api/pentests/${encodeURIComponent(pentestId)}/scope/proposals/${encodeURIComponent(proposalId)}/decision`,
      {
        method: 'POST',
        body: payload,
      }
    );
  },

  getContextSnapshots(pentestId: string) {
    return requestJson<ApiEnvelope<ContextSnapshot[]>>(
      `/api/pentests/${encodeURIComponent(pentestId)}/context/snapshots`
    );
  },

  compactContext(pentestId: string, payload?: { reason?: string }) {
    return requestJson<ApiEnvelope<{
      snapshot: ContextSnapshot;
      memoryPayload: string;
      stats: {
        beforeEstimatedTokens: number;
        afterEstimatedTokens: number;
        reductionPct: number;
        deltaMessages: number;
        deltaTools: number;
      };
    }>>(`/api/pentests/${encodeURIComponent(pentestId)}/context/compact`, {
      method: 'POST',
      body: payload || {},
    });
  },

  queryContext(pentestId: string, payload: { query: string; limit?: number }) {
    return requestJson<ApiEnvelope<ContextRecallResult>>(
      `/api/pentests/${encodeURIComponent(pentestId)}/context/query`,
      {
        method: 'POST',
        body: payload,
      }
    );
  },

  getCheckpoints(pentestId: string, params?: { limit?: number; offset?: number }) {
    return requestJson<ApiEnvelope<{ items: Checkpoint[]; total: number }>>(
      `/api/pentests/${encodeURIComponent(pentestId)}/checkpoints`,
      { query: params },
    );
  },

  createCheckpoint(pentestId: string, opts?: { label?: string }) {
    return requestJson<ApiEnvelope<Checkpoint>>(
      `/api/pentests/${encodeURIComponent(pentestId)}/checkpoints`,
      { method: 'POST', body: opts || {} },
    );
  },

  getCheckpoint(pentestId: string, checkpointId: string) {
    return requestJson<ApiEnvelope<Checkpoint>>(
      `/api/pentests/${encodeURIComponent(pentestId)}/checkpoints/${encodeURIComponent(checkpointId)}`,
    );
  },

  rewindToCheckpoint(pentestId: string, checkpointId: string) {
    return requestJson<ApiEnvelope<{ preRewindCheckpointId: string; rewoundAt: string }>>(
      `/api/pentests/${encodeURIComponent(pentestId)}/checkpoints/${encodeURIComponent(checkpointId)}/rewind`,
      { method: 'POST' },
    );
  },
};

export const providersApi = {
  async list() {
    const payload = await requestJson<ApiProvider[] | ApiEnvelope<ApiProvider[]>>('/api/providers');
    return unwrapData(payload);
  },

  async create(data: Record<string, unknown>) {
    const payload = await requestJson<ApiProvider | ApiEnvelope<ApiProvider>>('/api/providers', {
      method: 'POST',
      body: data,
    });
    return unwrapData(payload);
  },

  async update(id: string, data: Record<string, unknown>) {
    const payload = await requestJson<ApiProvider | ApiEnvelope<ApiProvider>>(
      `/api/providers/${encodeURIComponent(id)}`,
      {
        method: 'PUT',
        body: data,
      }
    );
    return unwrapData(payload);
  },

  async delete(id: string) {
    await requestJson<void>(`/api/providers/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    });
  },

  async testConnection(id: string): Promise<{ success: boolean; latency?: number; error?: string; models_available?: string[] }> {
    return requestJson<{ success: boolean; latency?: number; error?: string; models_available?: string[] }>(
      `/api/providers/${encodeURIComponent(id)}/test`,
      { method: 'POST' }
    );
  },

  async connectOAuth(providerType: 'ANTHROPIC' | 'GEMINI' | 'ANTIGRAVITY'): Promise<{ url: string; message: string }> {
    const routeProviderType = providerType.toLowerCase();
    return requestJson<{ url: string; message: string }>(
      `/api/providers/oauth/${routeProviderType}`,
      { method: 'POST' }
    );
  },
};

export const reportsApi = {
  list(params?: { page?: number; limit?: number; status?: string; severity?: string; search?: string; sortBy?: string; order?: string }) {
    return requestJson<{
      data: Array<{
        id: string;
        pentest_id: string;
        title: string;
        status: 'DRAFT' | 'COMPLETE' | 'ARCHIVED';
        created_at: string;
        updated_at: string;
        completed_at?: string;
        executive_summary?: string;
        template: string;
        confidential: boolean;
        findingsCount: number;
        maxSeverity: string | null;
        pentest?: { target: string };
        _count?: { findings: number };
      }>;
      meta: { total: number; page: number; limit: number; totalPages: number };
    }>('/api/reports', { query: params });
  },

  get(id: string) {
    return requestJson<ApiEnvelope<ApiReport>>(`/api/reports/${encodeURIComponent(id)}`);
  },

  update(id: string, data: { title?: string; executive_summary?: string; methodology?: string; scope_description?: string; status?: string; confidential?: boolean }) {
    return requestJson<ApiEnvelope<ApiReport>>(`/api/reports/${encodeURIComponent(id)}`, {
      method: 'PUT',
      body: data,
    });
  },

  delete(id: string) {
    return requestJson<void>(`/api/reports/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    });
  },

  exportJson(id: string) {
    return requestJson<unknown>(`/api/reports/${encodeURIComponent(id)}/export/json`);
  },
};
