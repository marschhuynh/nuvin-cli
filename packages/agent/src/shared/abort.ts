export class OperationAbortedError extends Error {
  public readonly code = "ABORT_ERR";

  constructor(message = "Operation aborted") {
    super(message);
    this.name = "AbortError";
  }
}

export function toAbortError(reason: unknown): Error {
  if (isAbortError(reason)) {
    return reason as Error;
  }

  if (reason instanceof Error) {
    return new OperationAbortedError(reason.message);
  }

  if (typeof reason === "string" && reason.length > 0) {
    return new OperationAbortedError(reason);
  }

  return new OperationAbortedError();
}

export function isAbortError(error: unknown): boolean {
  return (
    error instanceof OperationAbortedError ||
    (error instanceof Error &&
      (error.name === "AbortError" ||
        ("code" in error && (error as { code?: unknown }).code === "ABORT_ERR")))
  );
}

export function throwIfAborted(signal?: AbortSignal): void {
  if (!signal?.aborted) {
    return;
  }

  throw toAbortError(signal.reason);
}

export function addAbortListener(signal: AbortSignal | undefined, onAbort: () => void): () => void {
  if (!signal) {
    return () => {};
  }

  if (signal.aborted) {
    onAbort();
    return () => {};
  }

  const listener = () => {
    onAbort();
  };

  signal.addEventListener("abort", listener, { once: true });

  return () => {
    signal.removeEventListener("abort", listener);
  };
}
