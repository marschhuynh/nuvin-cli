import { BaseLLMProvider } from './base-provider';
import type { CompletionParams, CompletionResult, StreamChunk, ModelInfo } from './types/base';
import { smartFetch } from '../fetch-proxy';
import { extractValue } from './utils';

export class GithubCopilotProvider extends BaseLLMProvider {
  constructor(apiKey: string) {
    super({
      providerName: 'GitHub',
      apiKey,
      apiUrl: 'https://api.githubcopilot.com',
    });
  }

  protected getCommonHeaders(): Record<string, string> {
    return {
      ...super.getCommonHeaders(),
      accept: 'application/json',
      'editor-version': 'vscode/1.100.3',
      'editor-plugin-version': 'GitHub.copilot/1.330.0',
      'user-agent': 'GithubCopilot/1.330.0',
      'accept-encoding': 'gzip,deflate,br',
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
  ): Promise<Response> {
    const url = `${this.apiUrl}${endpoint}`;
    const headers = { ...this.getCommonHeaders(), ...options.headers };

    const response = await smartFetch(url, {
      method: options.method || 'POST',
      headers,
      body: options.body ? JSON.stringify(options.body) : undefined,
      signal: options.signal,
    });

    if (!response.ok) {
      const text = await response.text();
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
    const response = await this.makeRequest('/chat/completions', {
      body: {
        model: params.model,
        messages: params.messages,
        temperature: params.temperature,
        max_tokens: params.maxTokens,
        top_p: params.topP,
        ...(params.tools && { tools: params.tools }),
        ...(params.tool_choice && { tool_choice: params.tool_choice }),
      },
      signal,
    });

    const data = await response.json();
    return this.createCompletionResult(data);
  }

  async *generateCompletionStream(params: CompletionParams, signal?: AbortSignal): AsyncGenerator<string> {
    const response = await this.makeRequest('/chat/completions', {
      body: {
        model: params.model,
        messages: params.messages,
        temperature: params.temperature,
        max_tokens: params.maxTokens,
        top_p: params.topP,
        stream: true,
        ...(params.tools && { tools: params.tools }),
        ...(params.tool_choice && { tool_choice: params.tool_choice }),
      },
      signal,
    });

    const reader = response.body?.getReader();
    if (!reader) {
      throw new Error('No response body for streaming');
    }

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
    const response = await this.makeRequest('/chat/completions', {
      body: {
        model: params.model,
        messages: params.messages,
        temperature: params.temperature,
        max_tokens: params.maxTokens,
        top_p: params.topP,
        stream: true,
        ...(params.tools && { tools: params.tools }),
        ...(params.tool_choice && { tool_choice: params.tool_choice }),
      },
      signal,
    });

    const reader = response.body?.getReader();
    if (!reader) {
      throw new Error('No response body for streaming');
    }

    for await (const chunk of this.parseStreamWithTools(reader, {}, signal)) {
      yield chunk;
    }
  }

  async getModels(): Promise<ModelInfo[]> {
    try {
      // Try Copilot API first, fallback to public GitHub Models API
      let response: Response;
      try {
        response = await this.makeRequest('/models', {
          method: 'GET',
        });
      } catch (error) {
        console.warn('Copilot API failed, trying public GitHub Models API:', error);
        response = await smartFetch(`https://models.github.ai/catalog/models`, {
          method: 'GET',
          headers: {
            Authorization: `Bearer ${this.apiKey}`,
            'X-GitHub-Api-Version': '2022-11-28',
          },
        });
      }

      if (!response.ok) {
        console.warn(`GitHub Models API error: ${response.status}. Returning empty models list.`);
        return [];
      }

      const data = await response.json();
      const models = Array.isArray(data) ? data : data.models || data.data || [];

      const transformedModels = models
        .map((model: any): ModelInfo => {
          return this.formatModelInfo(model, {
            name: model.name || this.getModelDisplayName(model.id),
            contextLength: this.getContextLength(model.id),
            inputCost: 0, // No additional cost through Copilot subscription
            outputCost: 0,
            modality: this.getModality(model.id),
            inputModalities: this.getInputModalities(model.id),
            outputModalities: this.getOutputModalities(model.id),
          });
        })
        .sort((a: ModelInfo, b: ModelInfo) => this.sortModelsByPriority(a, b));

      return transformedModels;
    } catch (error) {
      console.error('Failed to fetch GitHub models:', error);
      return [];
    }
  }

  private getModelDisplayName(modelId: string): string {
    const nameMap: Record<string, string> = {
      'openai/gpt-4.1': 'OpenAI GPT-4.1',
      'openai/gpt-4.1-mini': 'OpenAI GPT-4.1 Mini',
      'openai/gpt-4.1-nano': 'OpenAI GPT-4.1 Nano',
      'openai/gpt-4o': 'OpenAI GPT-4o',
      'openai/gpt-4o-mini': 'OpenAI GPT-4o Mini',
      'openai/o1': 'OpenAI o1',
      'openai/o1-mini': 'OpenAI o1-mini',
      'openai/o1-preview': 'OpenAI o1-preview',
      'openai/o3': 'OpenAI o3',
      'openai/o3-mini': 'OpenAI o3-mini',
      'openai/o4-mini': 'OpenAI o4-mini',
      'ai21-labs/ai21-jamba-1.5-large': 'AI21 Jamba 1.5 Large',
      'ai21-labs/ai21-jamba-1.5-mini': 'AI21 Jamba 1.5 Mini',
      'cohere/cohere-command-a': 'Cohere Command A',
      'cohere/cohere-command-r-08-2024': 'Cohere Command R',
    };
    return nameMap[modelId] || modelId;
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
    if (modelId.includes('gpt-4o') || modelId.includes('o1') || modelId.includes('o3') || modelId.includes('o4')) {
      return 'multimodal';
    }
    return 'text';
  }

  private getInputModalities(modelId: string): string[] {
    if (modelId.includes('gpt-4o') || modelId.includes('o1') || modelId.includes('o3') || modelId.includes('o4')) {
      return ['text', 'image'];
    }
    return ['text'];
  }

  private getOutputModalities(_modelId: string): string[] {
    return ['text'];
  }

  private sortModelsByPriority(a: ModelInfo, b: ModelInfo): number {
    // Sort by model priority (GPT-4.1 > o4-mini > o3 > o1 > GPT-4o > Jamba > Cohere)
    const getModelPriority = (id: string): number => {
      if (id.includes('gpt-4.1') && !id.includes('mini') && !id.includes('nano')) return 100;
      if (id.includes('gpt-4.1-mini')) return 95;
      if (id.includes('gpt-4.1-nano')) return 90;
      if (id.includes('o4-mini')) return 85;
      if (id.includes('o3') && !id.includes('mini')) return 80;
      if (id.includes('o3-mini')) return 75;
      if (id.includes('o1') && !id.includes('mini') && !id.includes('preview')) return 70;
      if (id.includes('o1-preview')) return 65;
      if (id.includes('o1-mini')) return 60;
      if (id.includes('gpt-4o') && !id.includes('mini')) return 55;
      if (id.includes('gpt-4o-mini')) return 50;
      if (id.includes('jamba-1.5-large')) return 45;
      if (id.includes('jamba-1.5-mini')) return 40;
      if (id.includes('cohere')) return 35;
      return 0;
    };

    const priorityA = getModelPriority(a.id);
    const priorityB = getModelPriority(b.id);

    if (priorityA !== priorityB) {
      return priorityB - priorityA; // Higher priority first
    }

    return a.name.localeCompare(b.name);
  }
}
