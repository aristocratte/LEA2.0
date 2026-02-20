import type {
  ApiFinding,
  ApiKaliAuditLog,
  ApiMessage,
  ApiPentest,
  ApiProvider,
  ApiReport,
  ApiTodo,
  ContextRecallResult,
  ContextSnapshot,
  CreatePentestRequest,
  PreflightResult,
  PreflightState,
  ScopeDecisionAction,
  ScopeProposal,
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
    return `${protocol}//${window.location.hostname}:${DEFAULT_API_PORT}`;
  }

  return `http://localhost:${DEFAULT_API_PORT}`;
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

async function requestJson<T>(pathname: string, options: RequestOptions = {}): Promise<T> {
  const { query, body, headers, method = 'GET', cache = 'no-store', ...init } = options;
  const url = buildUrl(pathname, query);

  const finalHeaders = new Headers(headers || {});
  if (!finalHeaders.has('Accept')) {
    finalHeaders.set('Accept', 'application/json');
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

export function getStreamUrl(pentestId: string, lastEventId?: number): string {
  const query: QueryParams = {};
  if (typeof lastEventId === 'number' && Number.isFinite(lastEventId) && lastEventId > 0) {
    query.lastEventId = Math.floor(lastEventId);
  }

  return buildUrl(
    `/api/pentests/${encodeURIComponent(pentestId)}/stream`,
    query,
    resolveStreamBase()
  );
}

export const pentestsApi = {
  list(params?: { status?: string; limit?: number; offset?: number }) {
    return requestJson<ApiEnvelope<ApiPentest[]>>('/api/pentests', { query: params });
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
};
