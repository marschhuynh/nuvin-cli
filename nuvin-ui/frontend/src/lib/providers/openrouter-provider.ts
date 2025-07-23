import { BaseLLMProvider } from './base-provider';
import type {
  CompletionParams,
  CompletionResult,
  StreamChunk,
  ModelInfo,
} from './llm-provider';

export class OpenRouterProvider extends BaseLLMProvider {
  constructor(apiKey: string) {
    super({
      providerName: 'OpenRouter',
      apiKey,
      apiUrl: 'https://openrouter.ai',
      referer: 'https://nuvin.dev',
      title: 'Nuvin',
    });
  }

  async generateCompletion(
    params: CompletionParams,
    signal?: AbortSignal,
  ): Promise<CompletionResult> {
    const response = await this.makeRequest('/api/v1/chat/completions', {
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
      '/api/v1/chat/completions',
      params,
      signal,
    );

    for await (const data of this.parseStream(reader, {}, signal)) {
      const content = this.extractValue(data, 'choices.0.delta.content');
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
      '/api/v1/chat/completions',
      params,
      signal,
    );

    for await (const chunk of this.parseStreamWithTools(reader, {}, signal)) {
      yield chunk;
    }
  }

  async getModels(): Promise<ModelInfo[]> {
    const response = await this.makeRequest('/api/v1/models', {
      method: 'GET',
    });

    const data = await response.json();
    const models = data.data || [];

    const transformedModels = models.map((model: any): ModelInfo => {
      return this.formatModelInfo(model, {
        contextLength:
          model.context_length || model.top_provider?.context_length || 4096,
        inputCost: model.pricing?.prompt
          ? parseFloat(model.pricing.prompt) * 1000000
          : undefined,
        outputCost: model.pricing?.completion
          ? parseFloat(model.pricing.completion) * 1000000
          : undefined,
        modality: this.getModality(model),
        inputModalities: this.getInputModalities(model),
        outputModalities: this.getOutputModalities(model),
        supportedParameters: model.supported_parameters || [],
      });
    });

    return this.sortModels(transformedModels);
  }

  private getModality(model: any): string {
    if (
      model.capabilities?.includes('vision') ||
      model.id.includes('vision') ||
      model.id.includes('gpt-4o')
    ) {
      return 'multimodal';
    }
    return 'text';
  }

  private getInputModalities(model: any): string[] {
    const modalities = ['text'];
    if (
      model.capabilities?.includes('vision') ||
      model.id.includes('vision') ||
      model.id.includes('gpt-4o')
    ) {
      modalities.push('image');
    }
    if (model.capabilities?.includes('audio') || model.id.includes('audio')) {
      modalities.push('audio');
    }
    return modalities;
  }

  private getOutputModalities(model: any): string[] {
    const modalities = ['text'];
    if (model.capabilities?.includes('audio') || model.id.includes('audio')) {
      modalities.push('audio');
    }
    return modalities;
  }
}
