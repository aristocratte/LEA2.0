import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useSwarmStore } from '@/store/swarm-store';

const mocks = vi.hoisted(() => {
  let connectOptions: {
    onOpen?: () => void;
    onEvent: (eventType: string, event: MessageEvent<string>) => void;
  } | null = null;
  return {
    get connectOptions() {
      return connectOptions;
    },
    connectMock: vi.fn((options: {
      onOpen?: () => void;
      onEvent: (eventType: string, event: MessageEvent<string>) => void;
    }) => {
      connectOptions = options;
      options.onOpen?.();
      return { close: vi.fn() };
    }),
    getSwarmStateMock: vi.fn(),
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
    mocks.toastErrorMock.mockClear();
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
