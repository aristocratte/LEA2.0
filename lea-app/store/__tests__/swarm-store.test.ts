import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useSwarmStore } from '@/store/swarm-store';

const mocks = vi.hoisted(() => {
  let connectOptions: {
    onOpen?: () => void;
    onEvent: (eventType: string, event: MessageEvent<string>) => void;
    headers?: HeadersInit;
  } | null = null;
  return {
    get connectOptions() {
      return connectOptions;
    },
    connectMock: vi.fn((options: {
      onOpen?: () => void;
      onEvent: (eventType: string, event: MessageEvent<string>) => void;
      headers?: HeadersInit;
    }) => {
      connectOptions = options;
      options.onOpen?.();
      return { close: vi.fn() };
    }),
    getSwarmStateMock: vi.fn(),
    getDevelopmentApiKeyMock: vi.fn(),
    toastErrorMock: vi.fn(),
  };
});

vi.mock('@/lib/runtime/runtime-client', () => ({
  runtimeClient: {
    connect: mocks.connectMock,
  },
}));

vi.mock('@/lib/api', () => ({
  getSwarmStreamUrl: (pentestId: string) => `/stream/${pentestId}`,
  getDevelopmentApiKey: mocks.getDevelopmentApiKeyMock,
  pentestsApi: {
    getSwarmState: mocks.getSwarmStateMock,
  },
}));

vi.mock('@/hooks/use-toast', () => ({
  toast: {
    error: mocks.toastErrorMock,
  },
}));

function emit(eventType: string, payload: Record<string, unknown>, runId = 'pentest-1') {
  const event = new MessageEvent(eventType, {
    data: JSON.stringify({
      id: `evt-${eventType}-${Date.now()}`,
      runId,
      timestamp: Date.now(),
      eventType,
      payload: { type: eventType, ...payload },
    }),
  });
  mocks.connectOptions?.onEvent(eventType, event);
}

describe('useSwarmStore legacy pentest events', () => {
  beforeEach(() => {
    useSwarmStore.getState().reset();
    mocks.connectMock.mockClear();
    mocks.getSwarmStateMock.mockReset();
    mocks.getSwarmStateMock.mockResolvedValue({ data: null });
    mocks.getDevelopmentApiKeyMock.mockReset();
    mocks.getDevelopmentApiKeyMock.mockReturnValue(undefined);
    mocks.toastErrorMock.mockClear();
  });

  it('passes dev authorization headers to the runtime stream client', () => {
    mocks.getDevelopmentApiKeyMock.mockReturnValue('dev-stream-key');

    useSwarmStore.getState().connect('pentest-1');

    expect(mocks.connectMock).toHaveBeenCalledWith(expect.objectContaining({
      headers: { Authorization: 'Bearer dev-stream-key' },
    }));
  });

  it('surfaces legacy runtime errors as a failed run and visible feed message', () => {
    useSwarmStore.getState().connect('pentest-1');

    emit('error', {
      message: 'Zhipu API error 500: Operation failed',
      code: 'PENTEST_RUNTIME_ERROR',
    });

    const state = useSwarmStore.getState();
    expect(state.run?.status).toBe('FAILED');
    expect(state.connectionError).toBe('Zhipu API error 500: Operation failed (PENTEST_RUNTIME_ERROR)');
    expect(state.feedMessages).toHaveLength(1);
    expect(state.feedMessages[0].level).toBe('error');
    expect(state.feedMessages[0].content).toContain('Runtime failed');
    expect(state.feedMessages[0].content).toContain('Zhipu API error 500');
    expect(mocks.toastErrorMock).toHaveBeenCalledWith('Pentest failed: Zhipu API error 500: Operation failed');
  });

  it('maps cancelled status changes to a terminal cancelled run', () => {
    useSwarmStore.getState().connect('pentest-1');

    emit('status_change', { status: 'CANCELLED' });

    const state = useSwarmStore.getState();
    expect(state.run?.status).toBe('CANCELLED');
    expect(state.run?.endedAt).toBeTruthy();
  });

  it('coalesces legacy assistant message deltas into one feed message', () => {
    useSwarmStore.getState().connect('pentest-1');

    emit('message_start', {});
    emit('message_delta', { text: 'Starting recon' });
    expect(useSwarmStore.getState().feedMessages[0].content).toBe('');

    emit('message_delta', { text: ' for portfolio.acordonnier.com.' });
    emit('message_end', {});

    const state = useSwarmStore.getState();
    expect(state.feedMessages).toHaveLength(1);
    expect(state.feedMessages[0].content).toBe('Starting recon for portfolio.acordonnier.com.');
  });
});
