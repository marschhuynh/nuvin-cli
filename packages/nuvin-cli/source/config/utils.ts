import type { CLIConfig, ProviderConfig } from './types';

export function mergeConfigs(configs: Array<Partial<CLIConfig>>): CLIConfig {
  return configs.reduce<CLIConfig>((acc, cfg) => deepMerge(acc, cfg), {} as CLIConfig);
}

export function deepMerge<T extends Record<string, unknown>>(target: T, source: Record<string, unknown>): T {
  const output: Record<string, unknown> = { ...target };
  for (const [key, value] of Object.entries(source)) {
    if (value === undefined) {
      continue;
    }

    const existing = output[key];
    if (isPlainObject(existing) && isPlainObject(value)) {
      output[key] = deepMerge(existing as Record<string, unknown>, value as Record<string, unknown>);
      continue;
    }

    if (Array.isArray(value)) {
      if (Array.isArray(existing)) {
        const merged = [...existing];
        for (let i = 0; i < value.length; i++) {
          if (i < merged.length && isPlainObject(merged[i]) && isPlainObject(value[i])) {
            merged[i] = deepMerge(merged[i] as Record<string, unknown>, value[i] as Record<string, unknown>);
          } else {
            merged[i] = isPlainObject(value[i]) ? deepMerge({}, value[i] as Record<string, unknown>) : value[i];
          }
        }
        output[key] = merged;
      } else {
        output[key] = value.map((item) =>
          isPlainObject(item) ? deepMerge({}, item as Record<string, unknown>) : item,
        );
      }
      continue;
    }

    output[key] = isPlainObject(value) ? deepMerge({}, value as Record<string, unknown>) : value;
  }
  return output as T;
}

export function isPlainObject(value: unknown): value is Record<string, unknown> {
  return (
    typeof value === 'object' &&
    value !== null &&
    (value.constructor === Object || Object.getPrototypeOf(value) === null)
  );
}

export function structuredCloneConfig<T>(value: T): T {
  const cloneFn = (globalThis as { structuredClone?: (input: unknown) => unknown }).structuredClone;
  if (typeof cloneFn === 'function') {
    return cloneFn(value) as T;
  }
  return JSON.parse(JSON.stringify(value)) as T;
}

export type AuthCredentials = {
  apiKey?: string;
  oauth?: {
    type: 'oauth';
    access: string;
    refresh: string;
    expires: number;
  };
};

/**
 * Get active authentication credentials from new format
 * Returns undefined if not found or using legacy format
 */
export function getProviderAuth(config: CLIConfig, provider: string | undefined): AuthCredentials | undefined {
  if (!provider || typeof provider !== 'string') return undefined;

  const normalized = provider.toLowerCase();
  const providerConfig = findProviderConfig(config.providers, normalized);
  if (!providerConfig) return undefined;

  const currentAuthType = providerConfig['current-auth'];
  const authMethods = providerConfig.auth;

  if (!currentAuthType || !Array.isArray(authMethods)) {
    return undefined; // New format not found
  }

  const activeAuth = authMethods.find((auth) => auth.type === currentAuthType);
  if (!activeAuth) return undefined;

  if (activeAuth.type === 'api-key') {
    return { apiKey: activeAuth['api-key'] };
  }

  if (activeAuth.type === 'oauth') {
    return {
      oauth: {
        type: 'oauth',
        access: activeAuth.access,
        refresh: activeAuth.refresh,
        expires: activeAuth.expires || Date.now(),
      },
    };
  }

  return undefined;
}

export function resolveProviderToken(config: CLIConfig, provider: string | undefined): string | undefined {
  if (!provider || typeof provider !== 'string') return undefined;
  const normalized = provider.toLowerCase();
  const providerConfig = findProviderConfig(config.providers, normalized);
  const directToken = providerConfig?.token ?? providerConfig?.apiKey;
  if (typeof directToken === 'string' && directToken.trim()) {
    return directToken.trim();
  }

  const tokenFromMap = config.tokens?.[normalized];
  if (typeof tokenFromMap === 'string' && tokenFromMap.trim()) {
    return tokenFromMap.trim();
  }

  if (config.tokens) {
    for (const [name, value] of Object.entries(config.tokens)) {
      if (name.toLowerCase() === normalized && typeof value === 'string' && value.trim()) {
        return value.trim();
      }
    }
  }

  if (typeof config.apiKey === 'string' && config.apiKey.trim()) {
    return config.apiKey.trim();
  }

  return undefined;
}

function findProviderConfig(providers: CLIConfig['providers'] | undefined, key: string): ProviderConfig | undefined {
  if (!providers) return undefined;
  if (providers[key]) return providers[key];
  for (const [name, value] of Object.entries(providers)) {
    if (name.toLowerCase() === key) {
      return value;
    }
  }
  return undefined;
}
