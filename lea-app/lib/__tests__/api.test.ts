// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { getStreamUrl, providersApi } from '../api';

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
});
