import { BaseLLMProvider } from './base-provider';
import { extractValue } from './utils';
import type {
  CompletionParams,
  CompletionResult,
  StreamChunk,
  ModelInfo,
} from './types/base';

export class OpenAIProvider extends BaseLLMProvider {
  constructor(apiKey: string, apiUrl: string = 'https://api.openai.com/v1') {
    super({
      providerName: 'OpenAI',
      apiKey,
      apiUrl: apiUrl,
    });
  }

  async generateCompletion(
    params: CompletionParams,
    signal?: AbortSignal,
  ): Promise<CompletionResult> {
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

  async *generateCompletionStream(
    params: CompletionParams,
    signal?: AbortSignal,
  ): AsyncGenerator<string> {
    const reader = await this.makeStreamingRequest(
      'chat/completions',
      params,
      signal,
    );

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
    const reader = await this.makeStreamingRequest(
      '/chat/completions',
      params,
      signal,
    );

    for await (const chunk of this.parseStreamWithTools(reader, {}, signal)) {
      yield chunk;
    }
  }

  async getModels(): Promise<ModelInfo[]> {
    const response = await this.makeRequest('/models', {
      method: 'GET',
    });

    const data = await response.json();
    const models = data.data || [];

    const transformedModels = models
      .filter(
        (model: any) =>
          model.id &&
          !model.id.includes('tts') &&
          !model.id.includes('whisper'),
      )
      .map((model: any): ModelInfo => {
        return this.formatModelInfo(model, {
          contextLength: this.getContextLength(model.id),
          inputCost: this.getInputCost(model.id),
          outputCost: this.getOutputCost(model.id),
          modality: this.getModality(model.id),
          inputModalities: this.getInputModalities(model.id),
          outputModalities: this.getOutputModalities(model.id),
        });
      });

    return this.sortModels(transformedModels);
  }

  protected getContextLength(modelId: string): number {
    const contextMap: Record<string, number> = {
      'gpt-4.1': 200000,
      'gpt-4.1-mini': 200000,
      'gpt-4.1-nano': 200000,
      'gpt-4o': 128000,
      'gpt-4o-mini': 128000,
      o1: 200000,
      'o1-mini': 128000,
      'o1-preview': 128000,
      o3: 200000,
      'o3-mini': 128000,
      'o4-mini': 200000,
      'gpt-4-turbo': 128000,
      'gpt-4': 8192,
      'gpt-3.5-turbo': 16385,
    };
    return contextMap[modelId] || 4096;
  }

  protected getInputCost(modelId: string): number | undefined {
    const costMap: Record<string, number> = {
      'gpt-4.1': 2.0,
      'gpt-4.1-mini': 0.4,
      'gpt-4.1-nano': 0.1,
      'gpt-4o': 5.0,
      'gpt-4o-mini': 0.15,
      o1: 15.0,
      'o1-mini': 3.0,
      'o1-preview': 15.0,
      o3: 10.0,
      'o3-mini': 1.1,
      'o4-mini': 1.1,
      'gpt-4-turbo': 10.0,
      'gpt-4': 30.0,
      'gpt-3.5-turbo': 0.5,
    };
    return costMap[modelId];
  }

  protected getOutputCost(modelId: string): number | undefined {
    const costMap: Record<string, number> = {
      'gpt-4.1': 8.0,
      'gpt-4.1-mini': 1.6,
      'gpt-4.1-nano': 0.4,
      'gpt-4o': 15.0,
      'gpt-4o-mini': 0.6,
      o1: 60.0,
      'o1-mini': 12.0,
      'o1-preview': 60.0,
      o3: 40.0,
      'o3-mini': 4.4,
      'o4-mini': 4.4,
      'gpt-4-turbo': 30.0,
      'gpt-4': 60.0,
      'gpt-3.5-turbo': 1.5,
    };
    return costMap[modelId];
  }

  protected getModality(modelId: string): string {
    if (
      modelId.includes('gpt-4o') ||
      modelId.includes('o1') ||
      modelId.includes('o3') ||
      modelId.includes('o4')
    ) {
      return 'multimodal';
    }
    return 'text';
  }

  protected getInputModalities(modelId: string): string[] {
    if (
      modelId.includes('gpt-4o') ||
      modelId.includes('o1') ||
      modelId.includes('o3') ||
      modelId.includes('o4')
    ) {
      return ['text', 'image'];
    }
    return ['text'];
  }

  protected getOutputModalities(modelId: string): string[] {
    return ['text'];
  }

  protected parseRequestBody<T>(params: CompletionParams): T {
    return {
      model: params.model,
      messages: params.messages,
      temperature: params.temperature,
      max_tokens: params.maxTokens,
      top_p: params.topP,
      stream: true,
      ...(params.tools && { tools: params.tools }),
      ...(params.tool_choice && { tool_choice: params.tool_choice }),
    } as T;
  }
}
