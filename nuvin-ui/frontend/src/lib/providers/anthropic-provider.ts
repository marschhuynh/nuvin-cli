import {
  CompletionParams,
  CompletionResult,
  LLMProvider,
  ModelInfo,
} from './llm-provider';

export class AnthropicProvider implements LLMProvider {
  readonly type = 'Anthropic';
  private apiKey: string;
  private apiUrl: string = 'https://api.anthropic.com';

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  async generateCompletion(
    params: CompletionParams,
  ): Promise<CompletionResult> {
    const response = await fetch(`${this.apiUrl}/v1/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': this.apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: params.model,
        messages: params.messages.map((m) => ({
          role: m.role,
          content: m.content,
          ...(m.tool_calls && { tool_calls: m.tool_calls }),
          ...(m.tool_call_id && { tool_call_id: m.tool_call_id }),
          ...(m.name && { name: m.name }),
        })),
        temperature: params.temperature,
        max_tokens: params.maxTokens,
        top_p: params.topP,
        ...(params.tools && {
          tools: params.tools.map((tool) => tool.function),
        }),
        ...(params.tool_choice && { tool_choice: params.tool_choice }),
      }),
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Anthropic API error: ${response.status} - ${text}`);
    }

    const data = await response.json();
    const content: string = data.content?.[0]?.text ?? '';
    const tool_calls = data.tool_calls;

    return {
      content,
      ...(tool_calls && { tool_calls }),
    };
  }

  async *generateCompletionStream(
    params: CompletionParams,
  ): AsyncGenerator<string> {
    const response = await fetch(`${this.apiUrl}/v1/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': this.apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: params.model,
        messages: params.messages.map((m) => ({
          role: m.role,
          content: m.content,
          ...(m.tool_calls && { tool_calls: m.tool_calls }),
          ...(m.tool_call_id && { tool_call_id: m.tool_call_id }),
          ...(m.name && { name: m.name }),
        })),
        temperature: params.temperature,
        max_tokens: params.maxTokens,
        top_p: params.topP,
        stream: true,
        ...(params.tools && {
          tools: params.tools.map((tool) => tool.function),
        }),
        ...(params.tool_choice && { tool_choice: params.tool_choice }),
      }),
    });

    if (!response.ok || !response.body) {
      const text = await response.text();
      throw new Error(`Anthropic API error: ${response.status} - ${text}`);
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
          const delta = data.delta?.text;
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
          'x-api-key': this.apiKey,
          'anthropic-version': '2023-06-01',
        },
      });

      if (!response.ok) {
        console.warn(
          `Anthropic models API error: ${response.status}. Returning empty models list.`,
        );
        return [];
      }

      const data = await response.json();
      const models = data.data || [];

      // Transform Anthropic models to our ModelInfo format
      const transformedModels = models
        .map((model: any): ModelInfo => {
          const modelInfo: ModelInfo = {
            id: model.id,
            name: this.getModelDisplayName(model.id),
            contextLength: this.getContextLength(model.id),
            inputCost: this.getInputCost(model.id),
            outputCost: this.getOutputCost(model.id),
            modality: this.getModality(model.id),
            inputModalities: this.getInputModalities(model.id),
            outputModalities: this.getOutputModalities(model.id),
            supportedParameters: [
              'temperature',
              'top_p',
              'max_tokens',
              'tools',
            ],
          };
          return modelInfo;
        })
        .sort((a: ModelInfo, b: ModelInfo) => this.sortModels(a, b));

      return transformedModels;
    } catch (error) {
      console.error('Failed to fetch Anthropic models:', error);
      return [];
    }
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

  private getModelDescription(modelId: string): string {
    const descriptionMap: Record<string, string> = {
      'claude-sonnet-4-20250514':
        'Latest Claude 4 model with extended thinking capabilities',
      'claude-opus-4-20250514':
        'Most capable Claude 4 model with extended thinking',
      'claude-3-7-sonnet-20250219':
        'Most intelligent model with extended thinking capability',
      'claude-3-5-sonnet-20241022': 'Most intelligent model for complex tasks',
      'claude-3-5-haiku-20241022': 'Fastest model for everyday tasks',
      'claude-3-opus-20240229':
        'Previous top-tier model for most complex tasks',
      'claude-3-sonnet-20240229': 'Balance of intelligence and speed',
      'claude-3-haiku-20240307': 'Fast and cost-effective',
    };
    return descriptionMap[modelId] || `Claude model: ${modelId}`;
  }

  private getContextLength(modelId: string): number {
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

  private getModality(modelId: string): string {
    return 'text';
  }

  private getInputModalities(modelId: string): string[] {
    return ['text'];
  }

  private getOutputModalities(modelId: string): string[] {
    return ['text'];
  }

  private sortModels(a: ModelInfo, b: ModelInfo): number {
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
