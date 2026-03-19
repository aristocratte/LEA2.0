import { afterEach, describe, expect, it, vi } from 'vitest';

const { refreshAccessTokenMock } = vi.hoisted(() => ({
  refreshAccessTokenMock: vi.fn(),
}));

vi.mock('../antigravity/oauth.js', () => ({
  ANTIGRAVITY_ENDPOINT: 'https://antigravity.example.test',
  refreshAccessToken: refreshAccessTokenMock,
}));

import { AntigravityClient } from '../AntigravityClient.js';

const originalFetch = global.fetch;

function streamFromText(text: string): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream({
    start(controller) {
      controller.enqueue(encoder.encode(text));
      controller.close();
    },
  });
}

afterEach(() => {
  global.fetch = originalFetch;
  vi.restoreAllMocks();
});

describe('AntigravityClient', () => {
  it('refreshes credentials and streams content through the AIClient contract', async () => {
    refreshAccessTokenMock.mockResolvedValue({
      access_token: 'access-token',
      expires_in: 3600,
    });
    global.fetch = vi.fn().mockImplementation(async (url: string) => {
      if (url.includes('loadCodeAssist')) {
        return {
          ok: true,
          json: vi.fn().mockResolvedValue({ cloudaicompanionProject: 'project-1' }),
        } as unknown as Response;
      }

      return {
        ok: true,
        body: streamFromText(
          [
            'data: {"response":{"candidates":[{"content":{"parts":[{"text":"antigravity hello"}]},"finishReason":"STOP"}],"usageMetadata":{"promptTokenCount":5,"candidatesTokenCount":3}}}',
            '',
            'data: [DONE]',
            '',
          ].join('\n')
        ),
      } as unknown as Response;
    });

    const events: Array<Record<string, unknown>> = [];
    const client = new AntigravityClient('refresh-token');

    const result = await client.streamChat({
      model: 'gemini-3-pro-preview',
      messages: [{ role: 'user', content: 'hello' }],
      tools: [],
      systemPrompt: 'system',
      onEvent: (event) => events.push(event as Record<string, unknown>),
    });

    expect(result.stopReason).toBe('end_turn');
    expect(result.content).toEqual([{ type: 'text', text: 'antigravity hello' }]);
    expect(refreshAccessTokenMock).toHaveBeenCalledWith('refresh-token');
    expect(events.map((event) => event.type)).toContain('text_delta');
  });

  it('throws when all endpoint attempts fail', async () => {
    refreshAccessTokenMock.mockResolvedValue({
      access_token: 'access-token',
      expires_in: 3600,
    });
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 503,
      text: vi.fn().mockResolvedValue('temporarily unavailable'),
    } as unknown as Response);

    const client = new AntigravityClient('refresh-token');

    await expect(client.streamChat({
      model: 'gemini-3-pro-preview',
      messages: [{ role: 'user', content: 'hello' }],
      tools: [],
      systemPrompt: 'system',
      onEvent: vi.fn(),
    })).rejects.toThrow('Antigravity API error');
  });
});
