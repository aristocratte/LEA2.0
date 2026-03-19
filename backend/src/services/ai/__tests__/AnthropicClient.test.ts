import { afterEach, describe, expect, it, vi } from 'vitest';

const createMock = vi.fn();

vi.mock('@anthropic-ai/sdk', () => ({
  default: class AnthropicMock {
    messages = {
      create: createMock,
    };
  },
}));

import { AnthropicClient } from '../AnthropicClient.js';

function collectEvents() {
  const events: Array<Record<string, unknown>> = [];
  return {
    events,
    onEvent: (event: Record<string, unknown>) => {
      events.push(event);
    },
  };
}

afterEach(() => {
  vi.clearAllMocks();
});

describe('AnthropicClient', () => {
  it('streams text and tool-use events through the AIClient contract', async () => {
    createMock.mockResolvedValue((async function* () {
      yield { type: 'message_start', message: { usage: { input_tokens: 11 } } };
      yield { type: 'content_block_start', content_block: { type: 'text' } };
      yield { type: 'content_block_delta', delta: { type: 'text_delta', text: 'Hello' } };
      yield { type: 'content_block_stop' };
      yield { type: 'content_block_start', content_block: { type: 'tool_use', id: 'tool-1', name: 'nmap_scan' } };
      yield { type: 'content_block_delta', delta: { type: 'input_json_delta', partial_json: '{"target":"app.example.com"}' } };
      yield { type: 'content_block_stop' };
      yield { type: 'message_delta', delta: { stop_reason: 'tool_use' }, usage: { output_tokens: 7 } };
      yield { type: 'message_stop' };
    })());

    const { events, onEvent } = collectEvents();
    const client = new AnthropicClient('api-key');

    const result = await client.streamChat({
      model: 'claude-sonnet-4-6',
      messages: [{ role: 'user', content: 'scan the host' }],
      tools: [{ name: 'nmap_scan', description: 'Run nmap', input_schema: { type: 'object', properties: {} } }],
      systemPrompt: 'You are helpful.',
      onEvent,
    });

    expect(result.stopReason).toBe('tool_use');
    expect(result.content).toEqual([
      { type: 'text', text: 'Hello' },
      {
        type: 'tool_use',
        id: 'tool-1',
        name: 'nmap_scan',
        input: { target: 'app.example.com' },
      },
    ]);
    expect(events.some((event) => event.type === 'text_delta')).toBe(true);
    expect(events.some((event) => event.type === 'tool_use')).toBe(true);
    expect(events.at(-1)).toMatchObject({ type: 'message_stop', stopReason: 'tool_use' });
  });
});
