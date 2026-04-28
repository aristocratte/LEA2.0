// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { getDevelopmentApiKey, getStreamUrl, pentestsApi, providersApi } from '../api';

describe('api URL resolution', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('uses the IPv4 loopback for localhost browser sessions', () => {
    vi.stubEnv('NEXT_PUBLIC_API_BASE', '');
    vi.stubEnv('NEXT_PUBLIC_WS_BASE', '');
    window.history.pushState({}, '', 'http://localhost:3000/pentest');

    expect(getStreamUrl('pentest-1')).toBe(
      'http://127.0.0.1:3001/api/pentests/pentest-1/stream'
    );
  });

  it('lowercases OAuth provider routes for the backend', async () => {
    vi.stubEnv('NEXT_PUBLIC_API_BASE', 'http://api.test');
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      headers: new Headers({ 'content-type': 'application/json' }),
      json: vi.fn().mockResolvedValue({ url: 'https://oauth.test', message: 'ok' }),
    });
    vi.stubGlobal('fetch', fetchMock);

    await providersApi.connectOAuth('GEMINI');

    expect(fetchMock).toHaveBeenCalledWith(
      'http://api.test/api/providers/oauth/gemini',
      expect.any(Object)
    );
  });

  it('exposes the development API key only outside production', () => {
    vi.stubEnv('NODE_ENV', 'development');
    vi.stubEnv('NEXT_PUBLIC_LEA_DEV_API_KEY', 'dev-key');
    expect(getDevelopmentApiKey()).toBe('dev-key');

    vi.stubEnv('NODE_ENV', 'production');
    expect(getDevelopmentApiKey()).toBeUndefined();
  });

  it('stops swarm runtime first, then persists the canonical pentest stop', async () => {
    vi.stubEnv('NEXT_PUBLIC_API_BASE', 'http://api.test');
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers({ 'content-type': 'application/json' }),
      json: vi.fn().mockResolvedValue({ data: { status: 'stopped' } }),
    });
    vi.stubGlobal('fetch', fetchMock);

    await pentestsApi.stop('pentest-1');

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      'http://api.test/api/pentests/pentest-1/swarm/stop',
      expect.objectContaining({ method: 'POST' }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      'http://api.test/api/pentests/pentest-1/stop',
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('fetches the pentest run projection snapshot', async () => {
    vi.stubEnv('NEXT_PUBLIC_API_BASE', 'http://api.test');
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers({ 'content-type': 'application/json' }),
      json: vi.fn().mockResolvedValue({
        data: {
          pentestId: 'pentest-1',
          status: 'RUNNING',
          phase: 'RECON_ACTIVE',
          target: 'app.example.com',
          scopeSummary: { inScope: ['app.example.com'], outOfScope: [] },
          counters: {
            events: 3,
            messages: 2,
            toolCalls: 1,
            findingsDraft: 1,
            findingsValidated: 0,
            errors: 0,
          },
          recentToolCalls: [],
          recentErrors: [],
          findingsSummary: { total: 1, draft: 1, validated: 0 },
          lastSeq: 3,
          recentEvents: [],
          recentFindings: [],
          todos: [],
        },
      }),
    });
    vi.stubGlobal('fetch', fetchMock);

    await pentestsApi.getProjection('pentest-1', { sinceSeq: 2, eventLimit: 25 });

    expect(fetchMock).toHaveBeenCalledWith(
      'http://api.test/api/pentests/pentest-1/projection?sinceSeq=2&eventLimit=25',
      expect.objectContaining({ method: 'GET' }),
    );
  });
});
