import {
  GithubLLM,
  AnthropicAISDKLLM,
  createLLM,
  supportsGetModels,
  getAvailableProviders,
  type LLMPort,
} from '@nuvin/nuvin-core';
import type { ConfigManager } from '@/config/manager.js';
import type { ProviderKey } from './OrchestratorManager.js';
import type { AuthMethod, ProviderConfig } from '@/config/types.js';
import { getVersion } from '@/utils/version.js';

// Local type definitions since they are not exported from nuvin-core
type ModelConfig = false | true | string | string[] | Array<{ id: string; name?: string; [key: string]: unknown }>;

type CustomProviderDefinition = {
  type?: 'openai-compat' | 'anthropic';
  baseUrl?: string;
  models?: ModelConfig;
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
};

export interface LLMFactoryInterface {
  createLLM(provider: ProviderKey, options?: LLMOptions): LLMPort;
  getModels?(provider: ProviderKey, signal?: AbortSignal): Promise<string[]>;
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

    switch (provider) {
      case 'openrouter':
      case 'deepinfra':
      case 'zai':
      case 'moonshot':
        return createLLM(
          provider,
          {
            apiKey: config.apiKey,
            httpLogFile: options.httpLogFile,
            version: getVersion(),
          },
          customProviders,
        );

      case 'github':
        return new GithubLLM({
          accessToken: config.apiKey,
          httpLogFile: options.httpLogFile,
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
        if (customProviders?.[provider]) {
          return createLLM(
            provider,
            {
              apiKey: config.apiKey,
              httpLogFile: options.httpLogFile,
              version: getVersion(),
            },
            customProviders,
          );
        }
        throw new Error(`Unsupported provider: ${provider}`);
    }
  }

  async getModels(provider: ProviderKey, signal?: AbortSignal): Promise<string[]> {
    const customProviders = this.getCustomProviders();

    if (!supportsGetModels(provider, customProviders)) {
      return [];
    }

    const config = this.getProviderConfig(provider);

    if (!config.apiKey) {
      throw new Error(`${provider} API key not configured. Please run /auth first.`);
    }

    const llm = createLLM(provider, { apiKey: config.apiKey }, customProviders);

    if (llm && 'getModels' in llm && typeof llm.getModels === 'function') {
      const models = await llm.getModels(signal);
      return models.map((m: { id: string }) => m.id);
    }

    return [];
  }
}
