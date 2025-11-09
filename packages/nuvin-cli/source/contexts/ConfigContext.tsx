import { createContext, useContext, useState, useCallback, useEffect, type ReactNode } from 'react';
import { ConfigManager } from '@/config/manager.js';
import type { CLIConfig, ConfigScope } from '@/config/types.js';

interface ConfigContextValue {
  config: CLIConfig;
  get: <T>(key: string, scope?: ConfigScope) => T | undefined;
  set: (key: string, value: unknown, scope?: ConfigScope) => Promise<void>;
  delete: (key: string, scope?: ConfigScope) => Promise<void>;
  reload: () => Promise<void>;
}

const ConfigContext = createContext<ConfigContextValue | null>(null);

interface ConfigProviderProps {
  children: ReactNode;
  initialConfig?: CLIConfig;
}

export function ConfigProvider({ children, initialConfig = {} }: ConfigProviderProps) {
  const [config, setConfig] = useState<CLIConfig>(initialConfig);
  const configManager = ConfigManager.getInstance();

  // Load initial config and set up state
  useEffect(() => {
    const loadConfig = async () => {
      try {
        await configManager.load();
        const loadedConfig = configManager.getConfig();
        setConfig(loadedConfig);
      } catch (error) {
        console.error('Failed to load config in ConfigProvider:', error);
      }
    };

    // If we have initial config (e.g., merged with CLI flags), use it
    if (Object.keys(initialConfig).length > 0) {
      // Update ConfigManager's internal combined config so get() calls work correctly
      configManager.combined = initialConfig;
      setConfig(initialConfig);
    } else {
      loadConfig();
    }
  }, [configManager, initialConfig]);

  const get = useCallback(
    (key: string, scope?: ConfigScope): unknown => {
      return configManager.get(key, scope);
    },
    [configManager],
  );

  const set = useCallback(
    async (key: string, value: unknown, scope: ConfigScope = 'global'): Promise<void> => {
      try {
        // Update ConfigManager and persist to file
        await configManager.set(key, value, scope);

        // Update local state to trigger re-renders
        const updatedConfig = configManager.getConfig();
        setConfig(updatedConfig);
      } catch (error) {
        console.error(`Failed to set config ${key}:`, error);
        throw error;
      }
    },
    [configManager],
  );

  const deleteKey = useCallback(
    async (key: string, scope: ConfigScope = 'global'): Promise<void> => {
      try {
        // Delete from ConfigManager and persist to file
        await configManager.delete(key, scope);

        // Update local state to trigger re-renders
        const updatedConfig = configManager.getConfig();
        setConfig(updatedConfig);
      } catch (error) {
        console.error(`Failed to delete config ${key}:`, error);
        throw error;
      }
    },
    [configManager],
  );

  const reload = useCallback(async (): Promise<void> => {
    try {
      await configManager.load();
      const reloadedConfig = configManager.getConfig();
      setConfig(reloadedConfig);
    } catch (error) {
      console.error('Failed to reload config:', error);
      throw error;
    }
  }, [configManager]);

  const value: ConfigContextValue = {
    config,
    get,
    set,
    delete: deleteKey,
    reload,
  };

  return <ConfigContext.Provider value={value}>{children}</ConfigContext.Provider>;
}

export function useConfig(): ConfigContextValue {
  const context = useContext(ConfigContext);
  if (!context) {
    throw new Error('useConfig must be used within a ConfigProvider');
  }
  return context;
}

// Convenience hooks for common config patterns
export function useConfigValue<T = unknown>(key: string, defaultValue?: T): T {
  const { get } = useConfig();
  const value = get(key);
  return (value as T) ?? (defaultValue as T);
}

export function useConfigSetter(key: string, scope: ConfigScope = 'global') {
  const { set } = useConfig();
  return useCallback((value: unknown) => set(key, value, scope), [set, key, scope]);
}

// Specific hooks for common config values
export function useThinkingSetting(): [string | undefined, (value: string) => Promise<void>] {
  const { get, set } = useConfig();
  const thinking = get('thinking') as string | undefined;

  const setThinking = useCallback(
    async (value: string) => {
      const normalizedValue = value.toUpperCase();
      await set('thinking', normalizedValue, 'global');
    },
    [set],
  );

  return [thinking, setThinking];
}

export function useActiveProvider(): [string | undefined, (provider: string) => Promise<void>] {
  const { get, set } = useConfig();
  const activeProvider = get('activeProvider') as string | undefined;

  const setActiveProvider = useCallback(
    async (provider: string) => {
      await set('activeProvider', provider, 'global');
    },
    [set],
  );

  return [activeProvider, setActiveProvider];
}

export function useProviderToken(provider: string): [string | undefined, (token: string) => Promise<void>] {
  const { get, set } = useConfig();
  const token = get(`providers.${provider.toLowerCase()}.token`) as string | undefined;

  const setToken = useCallback(
    async (token: string) => {
      await set(`providers.${provider.toLowerCase()}.token`, token, 'global');
    },
    [set, provider],
  );

  return [token, setToken];
}
