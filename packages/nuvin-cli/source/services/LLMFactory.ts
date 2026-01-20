import {
  GithubLLM,
  AnthropicAISDKLLM,
  createLLM,
  supportsGetModels,
  getAvailableProviders,
  type LLMPort,
  type RetryConfig,
} from '@nuvin/nuvin-core';
import * as crypto from 'node:crypto';
import type { ConfigManager } from '@/config/manager.js';
import type { ProviderKey } from './OrchestratorManager.js';
import type { AuthMethod, ProviderConfig } from '@/config/types.js';
import { getVersion } from '@/utils/version.js';
import { eventBus } from './EventBus.js';

// Local type definitions since they are not exported from nuvin-core
type ModelConfig = false | true | string | string[] | Array<{ id: string; name?: string; [key: string]: unknown }>;

type CustomProviderDefinition = {
  type?: 'openai-compat' | 'anthropic-compat';
  baseUrl?: string;
  models?: ModelConfig;
  customHeaders?: Record<string, string>;
};

export type LLMConfig = {
  provider: ProviderKey;
  apiKey?: string;
  oauthConfig?: {
    anthropic?: {
      type: 'oauth';
      access: string;
      refresh: string;
      expires: number;
    };
  };
  httpLogFile?: string;
};

export type LLMOptions = {
  httpLogFile?: string;
  retry?: Partial<RetryConfig>;
};

const DEFAULT_RETRY_CONFIG: Partial<RetryConfig> = {
  maxRetries: 10,
  baseDelayMs: 1000,
  maxDelayMs: 60000,
  backoffMultiplier: 2,
  jitterFactor: 0.2,
  onRetry: (attempt, error, delayMs) => {
    eventBus.emit('ui:line', {
      id: crypto.randomUUID(),
      type: 'system',
      content: `Request failed (attempt ${attempt}). Retrying in ${Math.ceil(delayMs / 1000)}s... Error: ${error.message}`,
      metadata: {
        timestamp: new Date().toISOString(),
        isTransient: true, // Mark as transient so it doesn't affect static/dynamic calculation
      },
      color: 'yellow',
    });
  },
  onExhausted: (error, attempts) => {
    eventBus.emit('ui:line', {
      id: crypto.randomUUID(),
      type: 'system',
      content: `Request failed after ${attempts} attempts: ${error.message}`,
      metadata: { timestamp: new Date().toISOString() },
      color: 'red',
    });
  },
};

export interface LLMFactoryInterface {
  createLLM(provider: ProviderKey, options?: LLMOptions): LLMPort;
  getModels?(provider: ProviderKey, signal?: AbortSignal): Promise<string[]>;
  getAvailableProviders?(): string[];
}

export class LLMFactory implements LLMFactoryInterface {
  constructor(private configManager: ConfigManager) {}

  getAvailableProviders(): string[] {
    const customProviders = this.getCustomProviders();
    const factoryProviders = getAvailableProviders(customProviders);
    const specialProviders = ['github', 'anthropic'];
    return [...factoryProviders, ...specialProviders];
  }

  private getCustomProviders(): Record<string, CustomProviderDefinition> | undefined {
    const config = this.configManager.getConfig();
    const providers = config.providers;
    if (!providers) return undefined;

    const customProviders: Record<string, CustomProviderDefinition> = {};

    for (const [name, providerConfig] of Object.entries(providers)) {
      const cfg = providerConfig as ProviderConfig;
      if (cfg.baseUrl) {
        customProviders[name] = {
          type: cfg.type,
          baseUrl: cfg.baseUrl,
          models: cfg.models,
          customHeaders: cfg.customHeaders,
        };
      }
    }

    return Object.keys(customProviders).length > 0 ? customProviders : undefined;
  }

  private getProviderConfig(provider: ProviderKey): LLMConfig {
    const config = this.configManager.getConfig();
    const providerConfig = config.providers?.[provider];
    const auth = providerConfig?.auth;

    let apiKey: string | undefined;
    let oauthConfig: LLMConfig['oauthConfig'];

    if (Array.isArray(auth)) {
      const apiKeyEntry = auth.find((a: AuthMethod) => a.type === 'api-key');
      const oauthEntry = auth.find((a: AuthMethod) => a.type === 'oauth');

      if (apiKeyEntry && apiKeyEntry.type === 'api-key') {
        apiKey = apiKeyEntry['api-key'];
      }

      if (oauthEntry && oauthEntry.type === 'oauth' && provider === 'anthropic') {
        oauthConfig = {
          anthropic: {
            type: 'oauth',
            access: oauthEntry.access,
            refresh: oauthEntry.refresh,
            expires: oauthEntry.expires ?? 0,
          },
        };
      }
    }

    return {
      provider,
      apiKey,
      oauthConfig,
    };
  }

  createLLM(provider: ProviderKey, options: LLMOptions = {}): LLMPort {
    const config = this.getProviderConfig(provider);
    const customProviders = this.getCustomProviders();
    const retryConfig = { ...DEFAULT_RETRY_CONFIG, ...options.retry };

    switch (provider) {
      case 'github':
        return new GithubLLM({
          accessToken: config.apiKey,
          httpLogFile: options.httpLogFile,
          retry: retryConfig,
        });

      case 'anthropic':
        return new AnthropicAISDKLLM({
          apiKey: config.apiKey,
          oauth: config.oauthConfig?.anthropic,
          httpLogFile: options.httpLogFile,
          onTokenUpdate: async (newCredentials) => {
            type AuthEntry = {
              type: 'api-key' | 'oauth';
              'api-key'?: string;
              access?: string;
              refresh?: string;
              expires?: number;
            };

            const currentAuth = (this.configManager.get('providers.anthropic.auth') as AuthEntry[]) || [];
            const updatedAuth = currentAuth.map((auth) =>
              auth.type === 'oauth'
                ? {
                    type: 'oauth' as const,
                    access: newCredentials.access,
                    refresh: newCredentials.refresh,
                    expires: newCredentials.expires,
                  }
                : auth,
            );

            if (!updatedAuth.some((auth) => auth.type === 'oauth')) {
              updatedAuth.push({
                type: 'oauth' as const,
                access: newCredentials.access,
                refresh: newCredentials.refresh,
                expires: newCredentials.expires,
              });
            }

            await this.configManager.set('providers.anthropic.auth', updatedAuth, 'global');
          },
        });

      default:
        return createLLM(
          provider,
          {
            apiKey: config.apiKey,
            httpLogFile: options.httpLogFile,
            version: getVersion(),
            retry: retryConfig,
          },
          customProviders,
        );
    }
  }

  async getModels(provider: ProviderKey, signal?: AbortSignal): Promise<string[]> {
    const customProviders = this.getCustomProviders();
    const isSupportedInCore = supportsGetModels(provider, customProviders);
    const isGithub = provider === 'github';
    const isAnthropic = provider === 'anthropic';

    // If not supported in core AND not github AND not anthropic, return empty
    if (!isSupportedInCore && !isGithub && !isAnthropic) {
      return [];
    }

    const config = this.getProviderConfig(provider);

    // Anthropic can use either API key or OAuth
    if (!config.apiKey && !config.oauthConfig?.anthropic && provider !== 'anthropic') {
      throw new Error(`${provider} API key not configured. Please run /auth first.`);
    }

    if (provider === 'anthropic' && !config.apiKey && !config.oauthConfig?.anthropic) {
      throw new Error(`${provider} authentication not configured. Please run /auth first.`);
    }

    // Use the factory's createLLM to handle both core and special providers (like github)
    // Pass silent retry config to suppress error messages when fetching models
    const llm = this.createLLM(provider, { retry: { onRetry: () => {}, onExhausted: () => {} } });

    if (llm?.getModels) {
      const models = await llm.getModels(signal);
      return models.map((m: { id: string }) => m.id);
    }

    return [];
  }
}
