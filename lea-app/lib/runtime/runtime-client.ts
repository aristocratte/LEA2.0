interface RuntimeClientOptions {
  url: string;
  eventTypes: string[];
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

export class RuntimeClient {
  connect(options: RuntimeClientOptions): RuntimeClientConnection {
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
}

export const runtimeClient = new RuntimeClient();
