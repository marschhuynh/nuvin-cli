export function calculateBackoff(
  attempt: number,
  baseDelayMs: number,
  maxDelayMs: number,
  multiplier: number,
  jitterFactor: number,
): number {
  const exponentialDelay = baseDelayMs * multiplier ** attempt;
  const cappedDelay = Math.min(exponentialDelay, maxDelayMs);
  const jitterRange = cappedDelay * jitterFactor;
  const jitter = jitterRange * (Math.random() * 2 - 1);
  return Math.max(0, Math.round(cappedDelay + jitter));
}

export function parseRetryAfterHeader(header: string | null): number | null {
  if (!header) return null;

  const seconds = parseInt(header, 10);
  if (!Number.isNaN(seconds) && seconds >= 0) {
    return seconds * 1000;
  }

  const date = Date.parse(header);
  if (!Number.isNaN(date)) {
    const delayMs = date - Date.now();
    return delayMs > 0 ? delayMs : null;
  }

  return null;
}
