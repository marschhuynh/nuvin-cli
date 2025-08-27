import { GetCopilotToken } from '@wails/services/githuboauthservice';
import { BaseLLMProvider } from './base-provider';
import type { ProviderConfig } from '@/types';
import { useProviderStore } from '@/store/useProviderStore';
import type { CompletionParams, CompletionResult, StreamChunk, ModelInfo } from './types/base';
import type { ChatCompletionResponse } from './types/openrouter'; // GitHub uses similar response format
import { extractValue } from './utils';
import { validateAndCleanGitHubToken } from '../github';
import { smartFetch } from '../fetch-proxy';

export class GithubCopilotProvider extends BaseLLMProvider {
  private providerConfig: ProviderConfig;

  constructor(providerConfig: ProviderConfig) {
    const cleanApiKey = validateAndCleanGitHubToken(providerConfig.apiKey);
    super({
      providerName: 'GitHub',
      apiKey: cleanApiKey,
      apiUrl: 'https://api.githubcopilot.com',
    });
    this.providerConfig = providerConfig;
  }

  protected getCommonHeaders(): Record<string, string> {
    return {
      ...super.getCommonHeaders(),
      'editor-version': 'vscode/1.100.3',
      'editor-plugin-version': 'GitHub.copilot/1.330.0',
      'user-agent': 'GithubCopilot/1.330.0',
    };
  }

  protected async makeRequest(
    endpoint: string,
    options: {
      method?: string;
      body?: any;
      signal?: AbortSignal;
      headers?: Record<string, string>;
    } = {},
    isRetry = false,
  ): Promise<Response> {
    const url = `${this.apiUrl}${endpoint}`;
    const headers = { ...this.getCommonHeaders(), ...options.headers } as Record<string, string>;

    // If this is a streaming request, prefer SSE accept header and mark init as streaming
    const isStreaming = Boolean(options.body && options.body.stream === true);
    if (isStreaming) {
      headers.accept = 'text/event-stream';
    }

    const response = await smartFetch(url, {
      method: options.method || 'POST',
      headers,
      body: options.body ? JSON.stringify(options.body) : undefined,
      signal: options.signal,
      // Hint to our proxy that this request expects streaming semantics
      ...(isStreaming ? { stream: true } : {}),
    });

    if (!response.ok) {
      const text = await response.text();
      if (response.status === 401 && !isRetry) {
        console.log('Token expired, trying to get a new token');
        const newToken = await GetCopilotToken(this.providerConfig.accessToken);
        this.apiKey = validateAndCleanGitHubToken(newToken.apiKey);
        // Update the provider store with the new token
        useProviderStore.getState().updateProvider({
          ...this.providerConfig,
          apiKey: newToken.apiKey,
        });
        // Retry the request with the new token
        return this.makeRequest(endpoint, options, true);
      }
      if (response.status === 403) {
        throw new Error(
          `GitHub Copilot API access denied. Please ensure you have a valid GitHub Copilot subscription and the correct authentication token. Status: ${response.status}`,
        );
      }
      throw new Error(`GitHub Copilot API error: ${response.status} - ${text}`);
    }

    return response;
  }

  async generateCompletion(params: CompletionParams, signal?: AbortSignal): Promise<CompletionResult> {
    const startTime = Date.now();
    const requestBody: any = {
      model: params.model,
      messages: params.messages,
      temperature: params.temperature,
      max_tokens: params.maxTokens,
      top_p: params.topP,
      stream: false,
    };

    // Only add tools if they exist and are not empty
    if (params.tools && params.tools.length > 0) {
      requestBody.tools = params.tools;
    }

    // Only add tool_choice if tools are present
    if (params.tool_choice && params.tools && params.tools.length > 0) {
      requestBody.tool_choice = params.tool_choice;
    }

    const response = await this.makeRequest('/chat/completions', {
      body: requestBody,
      signal,
    });

    const data: ChatCompletionResponse = await response.json();

    const result = this.createCompletionResult<ChatCompletionResponse>(data, startTime);

    return result;
  }

  async *generateCompletionStream(params: CompletionParams, signal?: AbortSignal): AsyncGenerator<string> {
    const requestBody: any = {
      model: params.model,
      messages: params.messages,
      temperature: params.temperature,
      max_tokens: params.maxTokens,
      top_p: params.topP,
      stream: true,
    };

    // Only add tools if they exist and are not empty
    if (params.tools && params.tools.length > 0) {
      requestBody.tools = params.tools;
    }

    // Only add tool_choice if tools are present
    if (params.tool_choice && params.tools && params.tools.length > 0) {
      requestBody.tool_choice = params.tool_choice;
    }

    const response = await this.makeRequest('/chat/completions', {
      body: requestBody,
      signal,
    });

    if (!response.body) {
      throw new Error('No response body for streaming');
    }

    const reader = response.body.getReader();

    for await (const data of this.parseStream(reader, {}, signal)) {
      const content = extractValue(data, 'choices.0.delta.content');
      if (content) {
        yield content;
      }
    }
  }

  async *generateCompletionStreamWithTools(
    params: CompletionParams,
    signal?: AbortSignal,
  ): AsyncGenerator<StreamChunk> {
    const startTime = Date.now();

    const requestBody: any = {
      model: params.model,
      messages: params.messages,
      temperature: params.temperature,
      max_tokens: params.maxTokens,
      top_p: params.topP,
      stream: true,
    };

    // Only add tools if they exist and are not empty
    if (params.tools && params.tools.length > 0) {
      requestBody.tools = params.tools;
    }

    // Only add tool_choice if tools are present
    if (params.tool_choice && params.tools && params.tools.length > 0) {
      requestBody.tool_choice = params.tool_choice;
    }

    const response = await this.makeRequest('/chat/completions', {
      body: requestBody,
      signal,
    });

    if (!response.body) {
      throw new Error('No response body for streaming');
    }

    const reader = response.body.getReader();

    for await (const chunk of this.parseStreamWithTools(reader, {}, signal, startTime)) {
      yield chunk;
    }
  }

  async getModels(): Promise<ModelInfo[]> {
    const response = await this.makeRequest('/models', {
      method: 'GET',
    });

    const data = await response.json();
    const models = data.data || [];

    const transformedModels = models.map((model: any): ModelInfo => {
      return this.formatModelInfo(model, {
        contextLength: this.getContextLength(model.id),
        inputCost: 0, // GitHub Copilot subscription covers usage
        outputCost: 0,
        modality: this.getModality(model.id),
        inputModalities: this.getInputModalities(model.id),
        outputModalities: this.getOutputModalities(model.id),
        supportedParameters: model.supported_parameters || [],
      });
    });

    return this.sortModels(transformedModels);
  }

  private getContextLength(modelId: string): number {
    const contextMap: Record<string, number> = {
      'openai/gpt-4.1': 200000,
      'openai/gpt-4.1-mini': 200000,
      'openai/gpt-4.1-nano': 200000,
      'openai/gpt-4o': 128000,
      'openai/gpt-4o-mini': 128000,
      'openai/o1': 200000,
      'openai/o1-mini': 128000,
      'openai/o1-preview': 128000,
      'openai/o3': 200000,
      'openai/o3-mini': 128000,
      'openai/o4-mini': 200000,
      'ai21-labs/ai21-jamba-1.5-large': 256000,
      'ai21-labs/ai21-jamba-1.5-mini': 256000,
      'cohere/cohere-command-a': 128000,
      'cohere/cohere-command-r-08-2024': 128000,
    };
    return contextMap[modelId] || 128000;
  }

  private getModality(modelId: string): string {
    if (modelId?.includes('gpt-4o') || modelId?.includes('o1') || modelId?.includes('o3') || modelId?.includes('o4')) {
      return 'multimodal';
    }
    return 'text';
  }

  private getInputModalities(modelId: string): string[] {
    const modalities = ['text'];
    if (modelId?.includes('gpt-4o') || modelId?.includes('o1') || modelId?.includes('o3') || modelId?.includes('o4')) {
      modalities.push('image');
    }
    return modalities;
  }

  private getOutputModalities(_modelId: string): string[] {
    return ['text'];
  }

  protected calculateCost(usage: any, model?: string): number | undefined {
    if (!usage || !model) return undefined;

    // GitHub Copilot subscription covers usage - treat as zero cost
    return 0;
  }
}
