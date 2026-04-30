import type { AuthMethod, RecentModel } from "./types.js";
import { getNestedValue, isPlainObject } from "./utils.js";

export class ConfigConflictError extends Error {
  readonly path: string;
  readonly diskValue: unknown;
  readonly baselineValue: unknown;
  readonly desiredValue: unknown;

  constructor(path: string, diskValue: unknown, baselineValue: unknown, desiredValue: unknown) {
    super(
      `Config write conflict at "${path}": value changed on disk since last load. Reload and retry, or pass force: true.`,
    );
    this.name = "ConfigConflictError";
    this.path = path;
    this.diskValue = diskValue;
    this.baselineValue = baselineValue;
    this.desiredValue = desiredValue;
  }
}

function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== typeof b) return false;
  if (a === null || b === null) return false;
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i += 1) {
      if (!deepEqual(a[i], b[i])) return false;
    }
    return true;
  }
  if (typeof a === "object" && typeof b === "object") {
    const ak = Object.keys(a as Record<string, unknown>);
    const bk = Object.keys(b as Record<string, unknown>);
    if (ak.length !== bk.length) return false;
    for (const key of ak) {
      if (!deepEqual((a as Record<string, unknown>)[key], (b as Record<string, unknown>)[key])) {
        return false;
      }
    }
    return true;
  }
  return false;
}

const SPECIAL_MERGE_PATHS = [/^providers\.[^.]+\.auth$/, /^recentModels$/];

function pathHasSpecialMerge(path: string): boolean {
  return SPECIAL_MERGE_PATHS.some((re) => re.test(path));
}

export function detectScalarConflict(
  path: string,
  baseline: Record<string, unknown>,
  diskData: Record<string, unknown>,
  desiredValue: unknown,
): void {
  if (pathHasSpecialMerge(path)) return;
  const baselineValue = getNestedValue(baseline, path);
  const diskValue = getNestedValue(diskData, path);
  if (deepEqual(baselineValue, diskValue)) return;
  if (deepEqual(diskValue, desiredValue)) return;
  throw new ConfigConflictError(path, diskValue, baselineValue, desiredValue);
}

export function mergeAuthArray(
  existing: AuthMethod[] | undefined,
  incoming: AuthMethod[],
): AuthMethod[] {
  const byType = new Map<string, AuthMethod>();
  for (const entry of existing ?? []) {
    byType.set(entry.type, entry);
  }
  for (const entry of incoming) {
    byType.set(entry.type, entry);
  }
  return Array.from(byType.values());
}

const RECENT_MODELS_CAP = 5;

export function mergeRecentModels(
  existing: RecentModel[] | undefined,
  incoming: RecentModel[] | undefined,
): RecentModel[] {
  const map = new Map<string, RecentModel>();
  for (const list of [existing ?? [], incoming ?? []]) {
    for (const entry of list) {
      const key = `${entry.provider}::${entry.model}`;
      const prev = map.get(key);
      if (!prev || entry.usedAt > prev.usedAt) {
        map.set(key, entry);
      }
    }
  }
  return Array.from(map.values())
    .sort((a, b) => b.usedAt - a.usedAt)
    .slice(0, RECENT_MODELS_CAP);
}

export function deepMergeForWrite<T>(target: T, source: unknown): T {
  if (isPlainObject(target) && isPlainObject(source)) {
    const result: Record<string, unknown> = { ...target };
    for (const [key, value] of Object.entries(source)) {
      if (key in result) {
        result[key] = deepMergeForWrite(result[key], value);
      } else {
        result[key] = value;
      }
    }
    return result as T;
  }
  if (source === undefined) return target;
  return source as T;
}
