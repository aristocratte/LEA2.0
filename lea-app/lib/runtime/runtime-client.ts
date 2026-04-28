interface RuntimeClientOptions {
  url: string;
  eventTypes: string[];
  headers?: HeadersInit;
  onOpen?: () => void;
  onError?: (event: Event) => void;
  onEvent: (eventType: string, event: MessageEvent) => void;
}

export interface RuntimeClientConnection {
  close: () => void;
}

function hasMessageData(event: Event): event is MessageEvent {
  return 'data' in event && typeof (event as MessageEvent).data === 'string';
}

function hasHeaders(headers: HeadersInit | undefined): boolean {
  if (!headers) return false;
  return Array.from(new Headers(headers).keys()).length > 0;
}

function createRuntimeErrorEvent(error: unknown): Event {
  const event = new Event('error');
  Object.defineProperty(event, 'error', {
    configurable: true,
    value: error,
  });
  return event;
}

function dispatchSseFrame(
  frame: string,
  eventTypes: string[],
  onEvent: (eventType: string, event: MessageEvent) => void
): void {
  const lines = frame.split(/\r?\n/);
  let eventType = 'message';
  let eventId = '';
  const dataLines: string[] = [];

  for (const line of lines) {
    if (!line || line.startsWith(':')) continue;
    const separatorIndex = line.indexOf(':');
    const field = separatorIndex === -1 ? line : line.slice(0, separatorIndex);
    const rawValue = separatorIndex === -1 ? '' : line.slice(separatorIndex + 1);
    const value = rawValue.startsWith(' ') ? rawValue.slice(1) : rawValue;

    if (field === 'event') eventType = value || 'message';
    if (field === 'id') eventId = value;
    if (field === 'data') dataLines.push(value);
  }

  if (dataLines.length === 0 || !eventTypes.includes(eventType)) {
    return;
  }

  onEvent(eventType, new MessageEvent(eventType, {
    data: dataLines.join('\n'),
    lastEventId: eventId,
  }));
}

export class RuntimeClient {
  connect(options: RuntimeClientOptions): RuntimeClientConnection {
    if (hasHeaders(options.headers)) {
      return this.connectWithFetch(options);
    }

    const eventSource = new EventSource(options.url);

    eventSource.onopen = () => {
      options.onOpen?.();
    };

    options.eventTypes.forEach((eventType) => {
      if (eventType === 'error') return;
      eventSource.addEventListener(eventType, (event: Event) => {
        if (hasMessageData(event)) {
          options.onEvent(eventType, event);
        }
      });
    });

    eventSource.addEventListener('error', (event: Event) => {
      if (hasMessageData(event)) {
        if (options.eventTypes.includes('error')) {
          options.onEvent('error', event);
        }
        return;
      }

      options.onError?.(event);
    });

    return {
      close: () => {
        eventSource.close();
      },
    };
  }

  private connectWithFetch(options: RuntimeClientOptions): RuntimeClientConnection {
    const controller = new AbortController();

    void (async () => {
      try {
        const response = await fetch(options.url, {
          cache: 'no-store',
          headers: options.headers,
          signal: controller.signal,
        });

        if (!response.ok) {
          throw new Error(`SSE request failed: ${response.status} ${response.statusText}`.trim());
        }

        options.onOpen?.();

        const reader = response.body?.getReader();
        if (!reader) {
          throw new Error('SSE response has no readable body');
        }

        const decoder = new TextDecoder();
        let buffer = '';

        while (!controller.signal.aborted) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });

          let boundary = buffer.indexOf('\n\n');
          while (boundary !== -1) {
            const frame = buffer.slice(0, boundary);
            buffer = buffer.slice(boundary + 2);
            dispatchSseFrame(frame, options.eventTypes, options.onEvent);
            boundary = buffer.indexOf('\n\n');
          }
        }
      } catch (error) {
        if (!controller.signal.aborted) {
          options.onError?.(createRuntimeErrorEvent(error));
        }
      }
    })();

    return {
      close: () => controller.abort(),
    };
  }
}

export const runtimeClient = new RuntimeClient();
