import type {
  LLMProvider,
  CompletionParams,
  CompletionResult,
  ModelInfo,
} from './llm-provider';

export class OpenAIProvider implements LLMProvider {
  readonly type = 'OpenAI';
  private apiKey: string;
  private apiUrl: string = 'https://api.openai.com';

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  async generateCompletion(
    params: CompletionParams,
  ): Promise<CompletionResult> {
    const response = await fetch(`${this.apiUrl}/v1/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey}`,
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
      throw new Error(`OpenAI API error: ${response.status} - ${text}`);
    }

    const data = await response.json();
    const message = data.choices?.[0]?.message;
    const content: string = message?.content ?? '';
    const tool_calls = message?.tool_calls;

    return {
      content,
      ...(tool_calls && { tool_calls }),
    };
  }

  async *generateCompletionStream(
    params: CompletionParams,
  ): AsyncGenerator<string> {
    const response = await fetch(`${this.apiUrl}/v1/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey}`,
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

    if (!response.ok || !response.body) {
      const text = await response.text();
      throw new Error(`OpenAI API error: ${response.status} - ${text}`);
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
    try {
      const response = await fetch(`${this.apiUrl}/v1/models`, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
        },
      });

      if (!response.ok) {
        console.warn(
          `OpenAI models API error: ${response.status}. Returning empty models list.`,
        );
        return [];
      }

      const data = await response.json();
      const models = data.data || [];

      // Filter for chat models and add known pricing/context info
      const chatModels = models
        .filter(
          (model: { id: string }) =>
            model.id.includes('gpt') || model.id.includes('chat'),
        )
        .map((model: { id: string }): ModelInfo => {
          const modelInfo: ModelInfo = {
            id: model.id,
            name: model.id,
            supportedParameters: [
              'temperature',
              'top_p',
              'max_tokens',
              'frequency_penalty',
              'presence_penalty',
              'tools',
            ],
          };

          // Add known context lengths, pricing, and modality info
          switch (true) {
            case model.id.includes('gpt-4o'):
              modelInfo.contextLength = 128000;
              modelInfo.inputCost = 2.5;
              modelInfo.outputCost = 10;
              modelInfo.modality = 'multimodal';
              modelInfo.inputModalities = ['text', 'image', 'audio'];
              modelInfo.outputModalities = ['text', 'audio'];
              break;
            case model.id.includes('gpt-4-turbo'):
              modelInfo.contextLength = 128000;
              modelInfo.inputCost = 10;
              modelInfo.outputCost = 30;
              modelInfo.modality = 'multimodal';
              modelInfo.inputModalities = ['text', 'image'];
              modelInfo.outputModalities = ['text'];
              break;
            case model.id.includes('gpt-4'):
              modelInfo.contextLength = 8192;
              modelInfo.inputCost = 30;
              modelInfo.outputCost = 60;
              modelInfo.modality = 'text';
              modelInfo.inputModalities = ['text'];
              modelInfo.outputModalities = ['text'];
              break;
            case model.id.includes('gpt-3.5-turbo'):
              modelInfo.contextLength = 16385;
              modelInfo.inputCost = 0.5;
              modelInfo.outputCost = 1.5;
              modelInfo.modality = 'text';
              modelInfo.inputModalities = ['text'];
              modelInfo.outputModalities = ['text'];
              break;
            default:
              modelInfo.contextLength = 4096;
              modelInfo.modality = 'text';
              modelInfo.inputModalities = ['text'];
              modelInfo.outputModalities = ['text'];
              break;
          }

          return modelInfo;
        })
        .sort((a: ModelInfo, b: ModelInfo) => a.name.localeCompare(b.name));

      return chatModels;
    } catch (error) {
      console.error('Failed to fetch OpenAI models:', error);
      return [];
    }
  }
}
