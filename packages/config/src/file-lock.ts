import { mkdir, rm, stat, writeFile } from "node:fs/promises";
import { hostname } from "node:os";
import { dirname } from "node:path";

export interface FileLockOptions {
  timeoutMs?: number;
  staleMs?: number;
  retryMinMs?: number;
  retryMaxMs?: number;
}

const DEFAULT_TIMEOUT_MS = 5000;
const DEFAULT_STALE_MS = 30_000;
const DEFAULT_RETRY_MIN_MS = 25;
const DEFAULT_RETRY_MAX_MS = 150;

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function jitter(min: number, max: number): number {
  return Math.floor(min + Math.random() * Math.max(1, max - min));
}

async function tryAcquire(lockPath: string): Promise<boolean> {
  try {
    await mkdir(lockPath, { recursive: false });
    await writeFile(
      `${lockPath}/owner.json`,
      JSON.stringify({ pid: process.pid, hostname: hostname(), createdAt: Date.now() }),
      "utf8",
    );
    return true;
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException).code === "EEXIST") return false;
    throw err;
  }
}

async function isStale(lockPath: string, staleMs: number): Promise<boolean> {
  try {
    const ownerStat = await stat(`${lockPath}/owner.json`);
    return Date.now() - ownerStat.mtimeMs > staleMs;
  } catch {
    try {
      const dirStat = await stat(lockPath);
      return Date.now() - dirStat.mtimeMs > staleMs;
    } catch {
      return false;
    }
  }
}

export async function withFileLock<T>(
  targetFile: string,
  fn: () => Promise<T>,
  options: FileLockOptions = {},
): Promise<T> {
  const lockPath = `${targetFile}.lock`;
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const staleMs = options.staleMs ?? DEFAULT_STALE_MS;
  const retryMin = options.retryMinMs ?? DEFAULT_RETRY_MIN_MS;
  const retryMax = options.retryMaxMs ?? DEFAULT_RETRY_MAX_MS;
  const deadline = Date.now() + timeoutMs;

  await mkdir(dirname(targetFile), { recursive: true });

  for (;;) {
    if (await tryAcquire(lockPath)) {
      try {
        return await fn();
      } finally {
        await rm(lockPath, { recursive: true, force: true });
      }
    }
    if (await isStale(lockPath, staleMs)) {
      await rm(lockPath, { recursive: true, force: true });
      continue;
    }
    if (Date.now() > deadline) {
      throw new Error(`Timed out acquiring lock for ${targetFile}`);
    }
    await delay(jitter(retryMin, retryMax));
  }
}
