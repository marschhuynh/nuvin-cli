import type {
  LLMProvider,
  CompletionParams,
  CompletionResult,
  ModelInfo,
} from './llm-provider';

export class OpenRouterProvider implements LLMProvider {
  readonly type = 'OpenRouter';
  private apiKey: string;
  private apiUrl: string = 'https://openrouter.ai';

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  async generateCompletion(
    params: CompletionParams,
  ): Promise<CompletionResult> {
    const response = await fetch(`${this.apiUrl}/api/v1/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey}`,
        'HTTP-Referer': 'https://nuvin.dev',
        'X-Title': 'Nuvin',
      },
      body: JSON.stringify({
        model: params.model,
        messages: params.messages,
        temperature: params.temperature,
        max_tokens: params.maxTokens,
        top_p: params.topP,
        ...(params.tools && { tools: params.tools }),
        ...(params.tool_choice && { tool_choice: params.tool_choice }),
      }),
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`OpenRouter API error: ${response.status} - ${text}`);
    }

    const data = await response.json();
    const content: string = data.choices?.[0]?.message?.content ?? '';
    const tool_calls = data.choices?.[0]?.message?.tool_calls;

    return { content, tool_calls };
  }

  async *generateCompletionStream(
    params: CompletionParams,
  ): AsyncGenerator<string> {
    const response = await fetch(`${this.apiUrl}/api/v1/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey}`,
        'HTTP-Referer': 'https://nuvin.dev',
        'X-Title': 'Nuvin',
      },
      body: JSON.stringify({
        model: params.model,
        messages: params.messages,
        temperature: params.temperature,
        max_tokens: params.maxTokens,
        top_p: params.topP,
        stream: true,
        ...(params.tools && { tools: params.tools }),
        ...(params.tool_choice && { tool_choice: params.tool_choice }),
      }),
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`OpenRouter API error: ${response.status} - ${text}`);
    }

    const reader = response.body?.getReader();
    if (!reader) {
      throw new Error('No response body');
    }

    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const data = line.slice(6);
          if (data === '[DONE]') return;

          try {
            const parsed = JSON.parse(data);
            const delta = parsed.choices?.[0]?.delta?.content;
            if (delta) {
              yield delta;
            }
          } catch (e) {
            // Skip invalid JSON
          }
        }
      }
    }
  }

  async getModels(): Promise<ModelInfo[]> {
    try {
      const response = await fetch(`${this.apiUrl}/api/v1/models`, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
        },
      });

      if (!response.ok) {
        console.warn(
          `OpenRouter models API error: ${response.status}. Returning empty models list.`,
        );
        return [];
      }

      const data = await response.json();
      const models = data.data || [];

      // Transform OpenRouter models to our ModelInfo format
      const transformedModels = models
        .map((model: any): ModelInfo => {
          return {
            id: model.id,
            name: model.name || model.id,
            contextLength:
              model.context_length ||
              model.top_provider?.context_length ||
              4096,
            inputCost: model.pricing?.prompt
              ? parseFloat(model.pricing.prompt) * 1000000
              : undefined,
            outputCost: model.pricing?.completion
              ? parseFloat(model.pricing.completion) * 1000000
              : undefined,
            modality: model.architecture?.modality || this.getModality(model),
            inputModalities:
              model.architecture?.input_modalities ||
              this.getInputModalities(model),
            outputModalities:
              model.architecture?.output_modalities ||
              this.getOutputModalities(model),
            supportedParameters: model.supported_parameters || [],
          };
        })
        .sort((a: ModelInfo, b: ModelInfo) => a.name.localeCompare(b.name));

      return transformedModels;
    } catch (error) {
      console.error('Failed to fetch OpenRouter models:', error);
      return [];
    }
  }

  private getModality(model: any): string {
    // Check model capabilities or ID patterns for modality
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
