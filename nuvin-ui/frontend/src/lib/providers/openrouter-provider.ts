import { BaseLLMProvider } from './base-provider';
import { extractValue } from './utils';
import type {
  CompletionParams,
  CompletionResult,
  StreamChunk,
  ModelInfo,
} from './types/base';
import type { ChatCompletionResponse } from './types/openrouter';

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

    const response = await this.makeRequest('/api/v1/chat/completions', {
      body: requestBody,
      signal,
    });

    const data: ChatCompletionResponse = await response.json();

    const result = this.createCompletionResult<ChatCompletionResponse>(
      data,
      startTime,
    );

    return result;
  }

  async *generateCompletionStream(
    params: CompletionParams,
    signal?: AbortSignal,
  ): AsyncGenerator<string> {
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

    const response = await this.makeRequest('/api/v1/chat/completions', {
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

    const response = await this.makeRequest('/api/v1/chat/completions', {
      body: requestBody,
      signal,
    });

    if (!response.body) {
      throw new Error('No response body for streaming');
    }

    const reader = response.body.getReader();

    for await (const chunk of this.parseStreamWithTools(
      reader,
      {},
      signal,
      startTime,
    )) {
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

  protected calculateCost(usage: any, model?: string): number | undefined {
    if (!usage || !model) return undefined;

    // For OpenRouter, we need to get model pricing from cache or fetch it
    // For now, return a basic calculation - this could be enhanced to fetch live pricing
    const promptTokens = usage.prompt_tokens || usage.input_tokens || 0;
    const completionTokens =
      usage.completion_tokens || usage.output_tokens || 0;

    // Default rough pricing (per million tokens) - should be replaced with actual model pricing
    const avgInputCost = 0.5; // $0.50 per 1M tokens
    const avgOutputCost = 1.5; // $1.50 per 1M tokens

    return (
      (promptTokens * avgInputCost + completionTokens * avgOutputCost) / 1000000
    );
  }
}
