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

export class RuntimeClient {
  connect(options: RuntimeClientOptions): RuntimeClientConnection {
    const eventSource = new EventSource(options.url);

    eventSource.onopen = () => {
      options.onOpen?.();
    };

    eventSource.onerror = (event) => {
      options.onError?.(event);
    };

    options.eventTypes.forEach((eventType) => {
      eventSource.addEventListener(eventType, (event: Event) => {
        options.onEvent(eventType, event as MessageEvent);
      });
    });

    return {
      close: () => {
        eventSource.close();
      },
    };
  }
}

export const runtimeClient = new RuntimeClient();
