// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { RuntimeClient } from '../runtime-client';

type Listener = (event: Event) => void;

class FakeEventSource {
  static latest?: FakeEventSource;
  readonly listeners = new Map<string, Listener[]>();
  onopen: (() => void) | null = null;
  onerror: ((event: Event) => void) | null = null;
  closed = false;

  constructor(readonly url: string) {
    FakeEventSource.latest = this;
  }

  addEventListener(type: string, listener: Listener) {
    this.listeners.set(type, [...(this.listeners.get(type) ?? []), listener]);
  }

  close() {
    this.closed = true;
  }

  emit(type: string, event: Event) {
    for (const listener of this.listeners.get(type) ?? []) {
      listener(event);
    }
  }
}

describe('RuntimeClient', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('routes native EventSource error events to onError without onEvent', () => {
    vi.stubGlobal('EventSource', FakeEventSource);
    const onError = vi.fn();
    const onEvent = vi.fn();

    new RuntimeClient().connect({
      url: '/stream',
      eventTypes: ['error'],
      onError,
      onEvent,
    });

    FakeEventSource.latest!.emit('error', new Event('error'));

    expect(onError).toHaveBeenCalledTimes(1);
    expect(onEvent).not.toHaveBeenCalled();
  });

  it('routes application error message events to onEvent without onError', () => {
    vi.stubGlobal('EventSource', FakeEventSource);
    const onError = vi.fn();
    const onEvent = vi.fn();

    new RuntimeClient().connect({
      url: '/stream',
      eventTypes: ['error'],
      onError,
      onEvent,
    });

    const message = new MessageEvent('error', { data: '{"type":"error"}' });
    FakeEventSource.latest!.emit('error', message);

    expect(onEvent).toHaveBeenCalledWith('error', message);
    expect(onError).not.toHaveBeenCalled();
  });

  it('uses fetch streaming when headers are provided and dispatches SSE frames', async () => {
    const onOpen = vi.fn();
    const onError = vi.fn();
    const onEvent = vi.fn();
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      statusText: 'OK',
      body: new ReadableStream({
        start(controller) {
          controller.enqueue(new TextEncoder().encode(
            'id: evt-7-live\n'
            + 'event: status_change\n'
            + 'data: {"sequence":7,"payload":{"type":"status_change"}}\n\n'
          ));
          controller.close();
        },
      }),
    });
    vi.stubGlobal('fetch', fetchMock);
    vi.stubGlobal('EventSource', vi.fn());

    new RuntimeClient().connect({
      url: '/stream',
      headers: { Authorization: 'Bearer dev-key' },
      eventTypes: ['status_change'],
      onOpen,
      onError,
      onEvent,
    });

    await vi.waitFor(() => {
      expect(onEvent).toHaveBeenCalledTimes(1);
    });

    expect(fetchMock).toHaveBeenCalledWith('/stream', expect.objectContaining({
      headers: { Authorization: 'Bearer dev-key' },
    }));
    expect(onOpen).toHaveBeenCalledTimes(1);
    expect(onError).not.toHaveBeenCalled();
    expect(onEvent).toHaveBeenCalledWith(
      'status_change',
      expect.objectContaining({
        data: '{"sequence":7,"payload":{"type":"status_change"}}',
        lastEventId: 'evt-7-live',
      })
    );
    expect(EventSource).not.toHaveBeenCalled();
  });

  it('reports fetch stream authorization failures through onError', async () => {
    const onError = vi.fn();
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      statusText: 'Unauthorized',
      body: null,
    });
    vi.stubGlobal('fetch', fetchMock);

    new RuntimeClient().connect({
      url: '/stream',
      headers: { Authorization: 'Bearer wrong' },
      eventTypes: ['status_change'],
      onError,
      onEvent: vi.fn(),
    });

    await vi.waitFor(() => {
      expect(onError).toHaveBeenCalledTimes(1);
    });
  });
});
