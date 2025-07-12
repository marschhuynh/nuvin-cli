import {
  LLMProvider,
  CompletionParams,
  CompletionResult,
  ModelInfo,
} from './llm-provider';

export class GithubCopilotProvider implements LLMProvider {
  readonly type = 'GitHub';
  private apiKey: string;
  private apiUrl: string = 'https://api.githubcopilot.com';

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
      }),
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`GitHub Copilot API error: ${response.status} - ${text}`);
    }

    const data = await response.json();
    const content: string = data.choices?.[0]?.message?.content ?? '';
    return { content };
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
      }),
    });

    if (!response.ok || !response.body) {
      const text = await response.text();
      throw new Error(`GitHub Copilot API error: ${response.status} - ${text}`);
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
          'X-GitHub-Api-Version': '2022-11-28',
        },
      });

      if (!response.ok) {
        console.warn(
          `GitHub Models API error: ${response.status}. Returning empty models list.`,
        );
        return [];
      }

      const data = await response.json();
      const models = data.models || data.data || [];

      // Transform GitHub models to our ModelInfo format
      const transformedModels = models
        .map((model: any): ModelInfo => {
          return {
            id: model.name || model.id,
            name: this.getModelDisplayName(model.name || model.id),
            description:
              model.description ||
              `${model.name || model.id} via GitHub Copilot`,
            contextLength: this.getContextLength(model.name || model.id),
            inputCost: 0, // No additional cost through Copilot subscription
            outputCost: 0,
          };
        })
        .sort((a: ModelInfo, b: ModelInfo) => this.sortModels(a, b));

      return transformedModels;
    } catch (error) {
      console.error('Failed to fetch GitHub models:', error);
      return [];
    }
  }

  private getModelDisplayName(modelId: string): string {
    const nameMap: Record<string, string> = {
      'claude-3.7-sonnet': 'Claude 3.7 Sonnet',
      'claude-3.5-sonnet': 'Claude 3.5 Sonnet',
      'o3-mini': 'OpenAI o3-mini',
      'gemini-2.0-flash': 'Gemini 2.0 Flash',
      'gpt-4o': 'GPT-4o',
      'gpt-4o-mini': 'GPT-4o Mini',
      'gpt-4': 'GPT-4',
      'gpt-3.5-turbo': 'GPT-3.5 Turbo',
    };
    return nameMap[modelId] || modelId;
  }

  private getContextLength(modelId: string): number {
    const contextMap: Record<string, number> = {
      'claude-3.7-sonnet': 200000,
      'claude-3.5-sonnet': 200000,
      'o3-mini': 128000,
      'gemini-2.0-flash': 128000,
      'gpt-4o': 128000,
      'gpt-4o-mini': 128000,
      'gpt-4': 8192,
      'gpt-3.5-turbo': 16385,
    };
    return contextMap[modelId] || 128000;
  }

  private sortModels(a: ModelInfo, b: ModelInfo): number {
    // Sort by model priority (Claude 3.7 > Claude 3.5 > o3-mini > Gemini > GPT-4o > GPT-4 > GPT-3.5)
    const getModelPriority = (id: string): number => {
      if (id.includes('claude-3.7')) return 100;
      if (id.includes('claude-3.5')) return 90;
      if (id.includes('o3-mini')) return 80;
      if (id.includes('gemini-2.0')) return 70;
      if (id.includes('gpt-4o')) return 60;
      if (id.includes('gpt-4')) return 50;
      if (id.includes('gpt-3.5')) return 40;
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
