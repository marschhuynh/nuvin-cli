import { BaseLLMProvider } from './base-provider';
import { extractValue } from './utils';
import type { CompletionParams, CompletionResult, StreamChunk, ModelInfo } from './types/base';

export class AnthropicProvider extends BaseLLMProvider {
  constructor(apiKey: string) {
    super({
      providerName: 'Anthropic',
      apiKey,
      apiUrl: 'https://api.anthropic.com',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
    });
  }

  async generateCompletion(params: CompletionParams, signal?: AbortSignal): Promise<CompletionResult> {
    const response = await this.makeRequest('/v1/messages', {
      body: {
        model: params.model,
        messages: params.messages,
        temperature: params.temperature,
        max_tokens: params.maxTokens,
        top_p: params.topP,
        ...(params.tools && {
          tools: params.tools,
        }),
        ...(params.tool_choice && { tool_choice: params.tool_choice }),
      },
      signal,
    });

    const data = await response.json();
    return this.createCompletionResult(data);
  }

  async *generateCompletionStream(params: CompletionParams, signal?: AbortSignal): AsyncGenerator<string> {
    const response = await this.makeRequest('/v1/messages', {
      body: {
        model: params.model,
        messages: params.messages,
        temperature: params.temperature,
        max_tokens: params.maxTokens,
        top_p: params.topP,
        stream: true,
        ...(params.tools && {
          tools: params.tools,
        }),
        ...(params.tool_choice && { tool_choice: params.tool_choice }),
      },
      signal,
    });

    const reader = response.body?.getReader();
    if (!reader) {
      throw new Error('No response body for streaming');
    }

    for await (const data of this.parseStream(
      reader,
      {
        contentPath: 'delta.text',
      },
      signal,
    )) {
      const content = extractValue(data, 'delta.text');
      if (content) {
        yield content;
      }
    }
  }

  async *generateCompletionStreamWithTools(
    params: CompletionParams,
    signal?: AbortSignal,
  ): AsyncGenerator<StreamChunk> {
    const response = await this.makeRequest('/v1/messages', {
      body: {
        model: params.model,
        messages: params.messages,
        temperature: params.temperature,
        max_tokens: params.maxTokens,
        top_p: params.topP,
        stream: true,
        ...(params.tools && {
          tools: params.tools,
        }),
        ...(params.tool_choice && { tool_choice: params.tool_choice }),
      },
      signal,
    });

    const reader = response.body?.getReader();
    if (!reader) {
      throw new Error('No response body for streaming');
    }

    for await (const chunk of this.parseStreamWithTools(
      reader,
      {
        contentPath: 'delta.text',
        toolCallsPath: 'delta.tool_calls',
        usagePath: 'usage',
      },
      signal,
    )) {
      yield chunk;
    }
  }

  async getModels(): Promise<ModelInfo[]> {
    const response = await this.makeRequest('/v1/models', {
      method: 'GET',
    });

    const data = await response.json();
    const models = data.data || [];

    const transformedModels = models
      .map((model: any): ModelInfo => {
        return this.formatModelInfo(model, {
          name: this.getModelDisplayName(model.id),
          contextLength: this.getContextLength(model.id),
          inputCost: this.getInputCost(model.id),
          outputCost: this.getOutputCost(model.id),
          modality: this.getModality(model.id),
          inputModalities: this.getInputModalities(model.id),
          outputModalities: this.getOutputModalities(model.id),
          supportedParameters: ['temperature', 'top_p', 'max_tokens', 'tools'],
        });
      })
      .sort((a: ModelInfo, b: ModelInfo) => this.sortModelsByPriority(a, b));

    return transformedModels;
  }

  private getModelDisplayName(modelId: string): string {
    const nameMap: Record<string, string> = {
      'claude-sonnet-4-20250514': 'Claude Sonnet 4',
      'claude-opus-4-20250514': 'Claude Opus 4',
      'claude-3-7-sonnet-20250219': 'Claude 3.7 Sonnet',
      'claude-3-5-sonnet-20241022': 'Claude 3.5 Sonnet',
      'claude-3-5-haiku-20241022': 'Claude 3.5 Haiku',
      'claude-3-opus-20240229': 'Claude 3 Opus',
      'claude-3-sonnet-20240229': 'Claude 3 Sonnet',
      'claude-3-haiku-20240307': 'Claude 3 Haiku',
    };
    return nameMap[modelId] || modelId;
  }

  private getContextLength(_modelId: string): number {
    // All current Claude models have 200k context
    return 200000;
  }

  private getInputCost(modelId: string): number {
    const costMap: Record<string, number> = {
      'claude-sonnet-4-20250514': 3,
      'claude-opus-4-20250514': 15,
      'claude-3-7-sonnet-20250219': 3,
      'claude-3-5-sonnet-20241022': 3,
      'claude-3-5-haiku-20241022': 0.8,
      'claude-3-opus-20240229': 15,
      'claude-3-sonnet-20240229': 3,
      'claude-3-haiku-20240307': 0.25,
    };
    return costMap[modelId] || 3;
  }

  private getOutputCost(modelId: string): number {
    const costMap: Record<string, number> = {
      'claude-sonnet-4-20250514': 15,
      'claude-opus-4-20250514': 75,
      'claude-3-7-sonnet-20250219': 15,
      'claude-3-5-sonnet-20241022': 15,
      'claude-3-5-haiku-20241022': 4,
      'claude-3-opus-20240229': 75,
      'claude-3-sonnet-20240229': 15,
      'claude-3-haiku-20240307': 1.25,
    };
    return costMap[modelId] || 15;
  }

  private getModality(_modelId: string): string {
    return 'text';
  }

  private getInputModalities(_modelId: string): string[] {
    return ['text'];
  }

  private getOutputModalities(_modelId: string): string[] {
    return ['text'];
  }

  private sortModelsByPriority(a: ModelInfo, b: ModelInfo): number {
    // Sort by model version (4 > 3.7 > 3.5 > 3) and then by tier (Opus > Sonnet > Haiku)
    const getModelPriority = (id: string): number => {
      if (id.includes('claude-sonnet-4')) return 100;
      if (id.includes('claude-opus-4')) return 99;
      if (id.includes('claude-3-7-sonnet')) return 98;
      if (id.includes('claude-3-5-sonnet')) return 97;
      if (id.includes('claude-3-5-haiku')) return 96;
      if (id.includes('claude-3-opus')) return 95;
      if (id.includes('claude-3-sonnet')) return 94;
      if (id.includes('claude-3-haiku')) return 93;
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
