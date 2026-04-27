// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
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
    vi.unstubAllGlobals();
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
    vi.unstubAllGlobals();
  });
});
