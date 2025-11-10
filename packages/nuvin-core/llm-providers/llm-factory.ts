import type { LLMPort } from '../ports.js';
import { BaseLLM } from './base-llm.js';
import { FetchTransport, createTransport } from '../transports/index.js';
import providerConfig from './llm-provider-config.json';

interface ProviderConfig {
  name: string;
  className: string;
  baseUrl: string;
  transportName: string;
  features: {
    promptCaching?: boolean;
    getModels?: boolean;
    includeUsage?: boolean;
  };
}

export interface LLMOptions {
  apiKey?: string;
  apiUrl?: string;
  httpLogFile?: string;
  enablePromptCaching?: boolean;
  includeUsage?: boolean;
}

const providers = providerConfig.providers as ProviderConfig[];

type ModelResponse = {
  id: string;
  [key: string]: unknown;
};

type ModelsListResponse = {
  data: ModelResponse[];
};

export class GenericLLM extends BaseLLM implements LLMPort {
  private readonly opts: LLMOptions;
  private readonly transportName: string;
  private readonly includeUsage: boolean;
  private readonly supportsModels: boolean;

  constructor(transportName: string, baseUrl: string, supportsModels: boolean, opts: LLMOptions = {}) {
    const { enablePromptCaching = false, includeUsage = false, ...restOpts } = opts;
    super(opts.apiUrl || baseUrl, { enablePromptCaching });
    this.transportName = transportName;
    this.includeUsage = includeUsage;
    this.supportsModels = supportsModels;
    this.opts = restOpts;
  }

  protected createTransport() {
    const base = new FetchTransport({
      persistFile: this.opts.httpLogFile,
      logLevel: 'INFO',
      enableConsoleLog: false,
      maxFileSize: 5 * 1024 * 1024,
      captureResponseBody: true,
    });
    return createTransport(this.transportName, base, this.apiUrl, this.opts.apiKey, this.opts.apiUrl);
  }

  async getModels(signal?: AbortSignal): Promise<ModelResponse[]> {
    if (!this.supportsModels) {
      throw new Error(`Provider ${this.transportName} does not support getModels`);
    }

    const transport = this.createTransport();
    const res = await transport.get('/models', undefined, signal);

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Failed to fetch models: ${res.status} ${text}`);
    }

    const data: ModelsListResponse = await res.json();
    return data.data;
  }

  async generateCompletion(
    params: import('../ports.js').CompletionParams,
    signal?: AbortSignal,
  ): Promise<import('../ports.js').CompletionResult> {
    let enhancedParams = params;

    if (this.includeUsage && !enhancedParams.usage) {
      enhancedParams = { ...enhancedParams, usage: { include: true } };
    }

    return super.generateCompletion(enhancedParams, signal);
  }

  async streamCompletion(
    params: import('../ports.js').CompletionParams,
    handlers?: {
      onChunk?: (delta: string, usage?: import('../ports.js').UsageData) => void;
      onToolCallDelta?: (tc: import('../ports.js').ToolCall) => void;
      onStreamFinish?: (finishReason?: string, usage?: import('../ports.js').UsageData) => void;
    },
    signal?: AbortSignal,
  ): Promise<import('../ports.js').CompletionResult> {
    let enhancedParams = params;

    if (this.includeUsage && !enhancedParams.usage) {
      enhancedParams = { ...enhancedParams, usage: { include: true } };
    }

    return super.streamCompletion(enhancedParams, handlers, signal);
  }
}

export function createLLM(providerName: string, options: LLMOptions = {}): LLMPort {
  const config = providers.find((p) => p.name.toLowerCase() === providerName.toLowerCase());
  if (!config) {
    throw new Error(`Unknown LLM provider: ${providerName}. Available: ${providers.map((p) => p.name).join(', ')}`);
  }

  return new GenericLLM(config.transportName, config.baseUrl, config.features.getModels ?? false, {
    ...options,
    enablePromptCaching: options.enablePromptCaching ?? config.features.promptCaching,
    includeUsage: options.includeUsage ?? config.features.includeUsage,
  });
}

export function getAvailableProviders(): string[] {
  return providers.map((p) => p.name);
}

export function supportsGetModels(providerName: string): boolean {
  const config = providers.find((p) => p.name.toLowerCase() === providerName.toLowerCase());
  return config?.features.getModels ?? false;
}
