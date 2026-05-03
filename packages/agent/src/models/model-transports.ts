import { addAbortListener, throwIfAborted, toAbortError } from "../shared/abort.ts";

export interface ModelWebSocket {
  readonly readyState: number;
  addEventListener(
    type: "close" | "error" | "message" | "open",
    listener: EventListenerOrEventListenerObject,
  ): void;
  close(code?: number, reason?: string): void;
  removeEventListener(
    type: "close" | "error" | "message" | "open",
    listener: EventListenerOrEventListenerObject,
  ): void;
  send(data: string): void;
}

export type WebSocketFactory = (options: {
  headers: Record<string, string>;
  url: string;
}) => ModelWebSocket;

function toErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.length > 0) {
    return error.message;
  }

  return "WebSocket request failed";
}

export function createDefaultWebSocketFactory(): WebSocketFactory {
  return ({ headers, url }) => {
    const WebSocketCtor = globalThis.WebSocket as unknown as new (
      url: string,
      options?: {
        headers?: Record<string, string>;
        protocols?: string[];
      },
    ) => ModelWebSocket;

    return new WebSocketCtor(url, {
      headers,
      protocols: [],
    });
  };
}

export async function* iterateSseEvents(
  response: Response,
  signal?: AbortSignal,
): AsyncGenerator<string> {
  const reader = response.body?.getReader();

  if (!reader) {
    return;
  }

  const decoder = new TextDecoder("utf-8");
  let buffer = "";
  const removeAbortListener = addAbortListener(signal, () => {
    void reader.cancel(toAbortError(signal?.reason)).catch(() => {});
  });

  try {
    while (true) {
      throwIfAborted(signal);
      const { value, done } = await reader.read();

      throwIfAborted(signal);

      if (done) {
        break;
      }

      buffer += decoder.decode(value, { stream: true });

      while (true) {
        const boundary = buffer.indexOf("\n\n");

        if (boundary === -1) {
          break;
        }

        const event = buffer.slice(0, boundary);
        buffer = buffer.slice(boundary + 2);

        if (event.trim().length > 0) {
          yield event;
        }
      }
    }

    buffer += decoder.decode();
    throwIfAborted(signal);

    if (buffer.trim().length > 0) {
      yield buffer;
    }
  } finally {
    removeAbortListener();
  }
}

export async function waitForWebSocketOpen(
  socket: ModelWebSocket,
  signal?: AbortSignal,
): Promise<void> {
  if (socket.readyState === WebSocket.OPEN) {
    throwIfAborted(signal);
    return;
  }

  throwIfAborted(signal);

  await new Promise<void>((resolve, reject) => {
    const onOpen = (): void => {
      cleanup();
      resolve();
    };
    const onError = (event: Event): void => {
      cleanup();
      reject(new Error((event as ErrorEvent).message || "WebSocket request failed"));
    };
    const onClose = (event: Event): void => {
      cleanup();
      const closeEvent = event as CloseEvent;
      reject(new Error(closeEvent.reason || "WebSocket closed before opening"));
    };
    const onAbort = (): void => {
      cleanup();

      if (socket.readyState === WebSocket.OPEN) {
        socket.close(1000, "aborted");
      }

      reject(toAbortError(signal?.reason));
    };
    const cleanup = (): void => {
      socket.removeEventListener("open", onOpen);
      socket.removeEventListener("error", onError);
      socket.removeEventListener("close", onClose);
      signal?.removeEventListener("abort", onAbort);
    };

    socket.addEventListener("open", onOpen);
    socket.addEventListener("error", onError);
    socket.addEventListener("close", onClose);
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

export function iterateWebSocketMessages(
  socket: ModelWebSocket,
  signal?: AbortSignal,
): AsyncIterable<Record<string, unknown>> {
  const queue: Record<string, unknown>[] = [];
  let ended = false;
  let failure: Error | undefined;
  let resolveNext: (() => void) | undefined;

  const onMessage = (event: Event): void => {
    const messageEvent = event as MessageEvent;

    try {
      queue.push(JSON.parse(String(messageEvent.data)) as Record<string, unknown>);
      resolveNext?.();
      resolveNext = undefined;
    } catch (error) {
      failure = new Error(`Invalid WebSocket message: ${toErrorMessage(error)}`);
      resolveNext?.();
      resolveNext = undefined;
    }
  };
  const onError = (event: Event): void => {
    const errorEvent = event as ErrorEvent;
    failure = new Error(errorEvent.message || "WebSocket request failed");
    resolveNext?.();
    resolveNext = undefined;
  };
  const onClose = (event: Event): void => {
    const closeEvent = event as CloseEvent;

    if (!ended && closeEvent.code !== 1000 && !failure) {
      failure = new Error(closeEvent.reason || `WebSocket closed with code ${closeEvent.code}`);
    }

    ended = true;
    resolveNext?.();
    resolveNext = undefined;
  };
  const removeAbortListener = addAbortListener(signal, () => {
    failure = toAbortError(signal?.reason);

    if (socket.readyState === WebSocket.OPEN) {
      socket.close(1000, "aborted");
    }

    resolveNext?.();
    resolveNext = undefined;
  });

  socket.addEventListener("message", onMessage);
  socket.addEventListener("error", onError);
  socket.addEventListener("close", onClose);

  return {
    async *[Symbol.asyncIterator](): AsyncGenerator<Record<string, unknown>> {
      try {
        while (true) {
          if (failure) {
            throw failure;
          }

          if (queue.length > 0) {
            yield queue.shift() as Record<string, unknown>;
            continue;
          }

          if (ended) {
            break;
          }

          await new Promise<void>((resolve) => {
            resolveNext = resolve;
          });
        }
      } finally {
        socket.removeEventListener("message", onMessage);
        socket.removeEventListener("error", onError);
        socket.removeEventListener("close", onClose);
        removeAbortListener();
      }
    },
  };
}

export function toWebSocketUrl(baseUrl: string, path: string): string {
  const url = new URL(path, baseUrl);
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
  return url.toString();
}
