import { LLMProvider, CompletionParams, CompletionResult } from './llm-provider';

export class OpenRouterProvider implements LLMProvider {
  readonly type = 'OpenRouter';
  private apiKey: string;

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
    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
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
    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
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
}
