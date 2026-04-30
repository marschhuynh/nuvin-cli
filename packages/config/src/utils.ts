import type { AuthMethod, CLIConfig, ProviderConfig } from "./types.js";

export function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== "object") {
    return false;
  }
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

export function structuredCloneConfig<T>(value: T): T {
  return structuredClone(value);
}

export function deepMerge<T extends Record<string, unknown>>(
  target: T,
  source: Record<string, unknown>,
): T {
  const out: Record<string, unknown> = { ...target };
  for (const [key, sourceValue] of Object.entries(source)) {
    const targetValue = out[key];
    if (isPlainObject(sourceValue) && isPlainObject(targetValue)) {
      out[key] = deepMerge(targetValue, sourceValue);
    } else if (Array.isArray(sourceValue) && Array.isArray(targetValue)) {
      const merged = targetValue.slice();
      for (let i = 0; i < sourceValue.length; i += 1) {
        const a = merged[i];
        const b = sourceValue[i];
        if (isPlainObject(a) && isPlainObject(b)) {
          merged[i] = deepMerge(a, b);
        } else if (b !== undefined) {
          merged[i] = b;
        }
      }
      out[key] = merged;
    } else if (sourceValue !== undefined) {
      out[key] = sourceValue;
    }
  }
  return out as T;
}

export function mergeConfigs(configs: Array<Partial<CLIConfig>>): CLIConfig {
  let result: CLIConfig = {};
  for (const next of configs) {
    if (!next) continue;
    result = deepMerge(
      result as Record<string, unknown>,
      next as Record<string, unknown>,
    ) as CLIConfig;
  }
  return result;
}

type PathToken = { kind: "key"; value: string } | { kind: "index"; value: number };

function parsePath(path: string): PathToken[] {
  const tokens: PathToken[] = [];
  const parts = path.split(".");
  for (const part of parts) {
    if (!part) continue;
    const arrayMatch = part.match(/^([^[]+)((?:\[\d+\])+)$/);
    if (arrayMatch) {
      const [, head, indices] = arrayMatch;
      if (!head) continue;
      tokens.push({ kind: "key", value: head });
      const indexMatches = indices?.matchAll(/\[(\d+)\]/g);
      for (const m of indexMatches) {
        tokens.push({ kind: "index", value: Number(m[1]) });
      }
    } else {
      tokens.push({ kind: "key", value: part });
    }
  }
  return tokens;
}

export function getNestedValue(obj: Record<string, unknown>, path: string): unknown {
  const tokens = parsePath(path);
  let current: unknown = obj;
  for (const token of tokens) {
    if (current === undefined || current === null) return undefined;
    if (token.kind === "key") {
      if (!isPlainObject(current)) return undefined;
      current = current[token.value];
    } else {
      if (!Array.isArray(current)) return undefined;
      current = current[token.value];
    }
  }
  return current;
}

export function createNestedPatch(path: string, value: unknown): Record<string, unknown> {
  const tokens = parsePath(path);
  if (tokens.length === 0) {
    throw new Error(`Invalid path: ${path}`);
  }
  const root: Record<string, unknown> = {};
  let cursorParent: Record<string, unknown> | unknown[] = root;
  let cursorToken = tokens[0] ?? { kind: "key" as const, value: "" };
  for (let i = 0; i < tokens.length; i += 1) {
    const token = tokens[i];
    if (!token) break;
    const isLast = i === tokens.length - 1;
    if (isLast) {
      if (token.kind === "key") {
        (cursorParent as Record<string, unknown>)[token.value] = value;
      } else {
        (cursorParent as unknown[])[token.value] = value;
      }
      break;
    }
    const nextToken = tokens[i + 1];
    if (!nextToken) break;
    const nextContainer: Record<string, unknown> | unknown[] = nextToken.kind === "index" ? [] : {};
    if (token.kind === "key") {
      (cursorParent as Record<string, unknown>)[token.value] = nextContainer;
    } else {
      (cursorParent as unknown[])[token.value] = nextContainer;
    }
    cursorParent = nextContainer;
    cursorToken = nextToken;
  }
  void cursorToken;
  return root;
}

export function deleteNestedValue<T extends Record<string, unknown>>(obj: T, path: string): T {
  const tokens = parsePath(path);
  if (tokens.length === 0) return obj;
  let current: unknown = obj;
  for (let i = 0; i < tokens.length - 1; i += 1) {
    const token = tokens[i];
    if (!token) break;
    if (current === undefined || current === null) return obj;
    if (token.kind === "key") {
      if (!isPlainObject(current)) return obj;
      current = (current as Record<string, unknown>)[token.value];
    } else {
      if (!Array.isArray(current)) return obj;
      current = (current as unknown[])[token.value];
    }
  }
  const last = tokens.at(-1);
  if (!last) return obj;
  if (last.kind === "key" && isPlainObject(current)) {
    delete (current as Record<string, unknown>)[last.value];
  } else if (last.kind === "index" && Array.isArray(current)) {
    (current as unknown[]).splice(last.value, 1);
  }
  return obj;
}

export function pickActiveAuth(provider: ProviderConfig | undefined): AuthMethod | undefined {
  if (!provider?.auth || provider.auth.length === 0) return undefined;
  const current = provider.currentAuth;
  if (current) {
    const match = provider.auth.find((entry) => entry.type === current);
    if (match) return match;
  }
  return provider.auth.find((entry) => entry.type === "apiKey");
}

export function getProviderAuth(
  config: CLIConfig,
  provider: string | undefined,
): AuthMethod | undefined {
  if (!provider) return undefined;
  return pickActiveAuth(config.providers?.[provider]);
}

export function resolveProviderToken(
  config: CLIConfig,
  provider: string | undefined,
): string | undefined {
  if (!provider) {
    return config.apiKey;
  }
  const providerConfig = config.providers?.[provider];
  if (providerConfig) {
    const active = pickActiveAuth(providerConfig);
    if (active && active.type === "apiKey") {
      if (active.apiKey) return active.apiKey;
    }
    if (providerConfig.token) return providerConfig.token;
    if (providerConfig.apiKey) return providerConfig.apiKey;
  }
  return config.apiKey;
}
