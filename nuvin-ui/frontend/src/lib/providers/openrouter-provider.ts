import { LLMProvider, CompletionParams, CompletionResult, ModelInfo } from './llm-provider';

export class OpenRouterProvider implements LLMProvider {
  readonly type = 'OpenRouter';
  private apiKey: string;
  private apiUrl: string = "https://openrouter.ai";

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  private buildHeaders() {
    return {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${this.apiKey}`
    } as Record<string, string>;
  }

  async generateCompletion(params: CompletionParams): Promise<CompletionResult> {
    const response = await fetch(`${this.apiUrl}/api/v1/chat/completions`, {
      method: 'POST',
      headers: this.buildHeaders(),
      body: JSON.stringify({
        model: params.model,
        messages: params.messages,
        temperature: params.temperature,
        max_tokens: params.maxTokens,
        top_p: params.topP
      })
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`OpenRouter API error: ${response.status} - ${text}`);
    }

    const data = await response.json();
    const content: string = data.choices?.[0]?.message?.content ?? '';
    return { content };
  }

  async *generateCompletionStream(params: CompletionParams): AsyncGenerator<string> {
    const response = await fetch(`${this.apiUrl}/api/v1/chat/completions`, {
      method: 'POST',
      headers: this.buildHeaders(),
      body: JSON.stringify({
        model: params.model,
        messages: params.messages,
        temperature: params.temperature,
        max_tokens: params.maxTokens,
        top_p: params.topP,
        stream: true
      })
    });

    if (!response.ok || !response.body) {
      const text = await response.text();
      throw new Error(`OpenRouter API error: ${response.status} - ${text}`);
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let done = false;
    let buffer = '';

    while (!done) {
      const { value, done: doneReading } = await reader.read();
      done = doneReading;
      if (value) {
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';
        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed) continue;
          if (trimmed === 'data: [DONE]') return;
          if (!trimmed.startsWith('data:')) continue;
          const data = JSON.parse(trimmed.slice('data:'.length));
          const delta = data.choices?.[0]?.delta?.content;
          if (delta) {
            yield delta;
          }
        }
      }
    }
  }

  async getModels(): Promise<ModelInfo[]> {
    const response = await fetch(`${this.apiUrl}/api/v1/models`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${this.apiKey}`
      }
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`OpenRouter API error: ${response.status} - ${text}`);
    }

    const data = await response.json();
    const models = data.data || [];

    // Transform OpenRouter models to our ModelInfo format
    const transformedModels = models
      .map((model: any): ModelInfo => {
        return {
          id: model.id,
          name: model.name || model.id,
          description: model.description || `${model.id} via OpenRouter`,
          contextLength: model.context_length || model.max_tokens || 4096,
          inputCost: model.pricing?.prompt ? parseFloat(model.pricing.prompt) * 1000000 : undefined,
          outputCost: model.pricing?.completion ? parseFloat(model.pricing.completion) * 1000000 : undefined,
        };
      })
      .sort((a: ModelInfo, b: ModelInfo) => a.name.localeCompare(b.name));

    return transformedModels;
  }
}
