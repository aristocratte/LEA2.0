import { afterEach, describe, expect, it, vi } from 'vitest';
import { GeminiClient } from '../GeminiClient.js';

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

describe('GeminiClient', () => {
  it('streams text responses from the API-key transport', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      body: streamFromText(
        [
          'data: {"candidates":[{"content":{"parts":[{"text":"hello"}]},"finishReason":"STOP"}],"usageMetadata":{"promptTokenCount":9,"candidatesTokenCount":4}}',
          '',
          'data: [DONE]',
          '',
        ].join('\n')
      ),
      text: vi.fn(),
    } as unknown as Response);

    const events: Array<Record<string, unknown>> = [];
    const client = new GeminiClient('api-key');

    const result = await client.streamChat({
      model: 'gemini-2.5-flash',
      messages: [{ role: 'user', content: 'hello' }],
      tools: [],
      systemPrompt: 'system',
      onEvent: (event) => events.push(event as Record<string, unknown>),
    });

    expect(result.stopReason).toBe('end_turn');
    expect(result.content).toEqual([{ type: 'text', text: 'hello' }]);
    expect(events.map((event) => event.type)).toContain('message_start');
    expect(events.at(-1)).toMatchObject({ type: 'message_stop', stopReason: 'end_turn' });
  });

  it('throws when the Gemini API returns a non-OK response', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      text: vi.fn().mockResolvedValue('upstream failure'),
    } as unknown as Response);

    const client = new GeminiClient('api-key');

    await expect(client.streamChat({
      model: 'gemini-2.5-flash',
      messages: [{ role: 'user', content: 'hello' }],
      tools: [],
      systemPrompt: 'system',
      onEvent: vi.fn(),
    })).rejects.toThrow('Gemini API error 500');
  });
});
