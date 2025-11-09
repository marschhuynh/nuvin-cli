import {
  EchoLLM,
  GithubLLM,
  OpenRouterLLM,
  DeepInfraLLM,
  ZaiLLM,
  AnthropicAISDKLLM,
  type LLMPort,
} from '@nuvin/nuvin-core';
import type { ConfigManager } from '@/config/manager.js';
import type { ProviderKey } from './OrchestratorManager.js';
import type { AuthMethod } from '@/config/types.js';

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

    switch (provider) {
      case 'openrouter':
        return new OpenRouterLLM({
          apiKey: config.apiKey,
          httpLogFile: options.httpLogFile,
        });

      case 'deepinfra':
        return new DeepInfraLLM({
          apiKey: config.apiKey,
          httpLogFile: options.httpLogFile,
        });

      case 'github':
        return new GithubLLM({
          accessToken: config.apiKey,
          httpLogFile: options.httpLogFile,
        });

      case 'zai':
        return new ZaiLLM({
          apiKey: config.apiKey,
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
        return new EchoLLM();
    }
  }

  async getModels(provider: ProviderKey, signal?: AbortSignal): Promise<string[]> {
    const config = this.getProviderConfig(provider);

    switch (provider) {
      case 'openrouter': {
        if (!config.apiKey) {
          throw new Error('OpenRouter API key not configured. Please run /auth first.');
        }

        const llm = new OpenRouterLLM({ apiKey: config.apiKey });
        const models = await llm.getModels(signal);
        return models.map((m) => m.id);
      }

      case 'deepinfra': {
        if (!config.apiKey) {
          throw new Error('DeepInfra API key not configured. Please run /auth first.');
        }

        const llm = new DeepInfraLLM({ apiKey: config.apiKey });
        const models = await llm.getModels(signal);
        return models.map((m) => m.id);
      }

      default:
        return [];
    }
  }
}
