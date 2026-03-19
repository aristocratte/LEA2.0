import { afterEach, describe, expect, it, vi } from 'vitest';
import { ZhipuClient } from '../ZhipuClient.js';

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

describe('ZhipuClient', () => {
  it('emits reasoning, text, and usage events from an SSE stream', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      body: streamFromText(
        [
          'data: {"choices":[{"delta":{"reasoning_content":"plan","role":"assistant"}}]}',
          '',
          'data: {"choices":[{"delta":{"content":"hello"}}],"usage":{"prompt_tokens":12,"completion_tokens":5}}',
          '',
          'data: {"choices":[{"finish_reason":"stop"}]}',
          '',
          'data: [DONE]',
          '',
        ].join('\n')
      ),
    } as Response);

    const events: Array<Record<string, unknown>> = [];
    const client = new ZhipuClient('api-key');

    const result = await client.streamChat({
      model: 'glm-4.7',
      messages: [{ role: 'user', content: 'hello' }],
      tools: [],
      systemPrompt: 'system',
      onEvent: (event) => events.push(event as Record<string, unknown>),
    });

    expect(result.stopReason).toBe('end_turn');
    expect(result.content).toEqual([{ type: 'text', text: 'hello' }]);
    expect(events.map((event) => event.type)).toContain('thinking_delta');
    expect(events.map((event) => event.type)).toContain('text_delta');
    expect(events.at(-1)).toMatchObject({ type: 'message_stop', stopReason: 'end_turn' });
  });

  it('throws when the HTTP request fails', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      text: vi.fn().mockResolvedValue('unauthorized'),
    } as unknown as Response);

    const client = new ZhipuClient('bad-key');

    await expect(client.streamChat({
      model: 'glm-4.7',
      messages: [{ role: 'user', content: 'hello' }],
      tools: [],
      systemPrompt: 'system',
      onEvent: vi.fn(),
    })).rejects.toThrow('Zhipu API error 401');
  });
});
