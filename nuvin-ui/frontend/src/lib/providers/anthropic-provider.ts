import {
  CompletionParams,
  CompletionResult,
  LLMProvider,
  ModelInfo,
} from "./llm-provider";

export class AnthropicProvider implements LLMProvider {
  readonly type = "Anthropic";
  private apiKey: string;
  private apiUrl: string = "https://api.anthropic.com";

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  async generateCompletion(
    params: CompletionParams
  ): Promise<CompletionResult> {
    const response = await fetch(`${this.apiUrl}/v1/messages`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": this.apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: params.model,
        messages: params.messages.map((m) => ({
          role: m.role,
          content: m.content,
        })),
        temperature: params.temperature,
        max_tokens: params.maxTokens,
        top_p: params.topP,
      }),
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Anthropic API error: ${response.status} - ${text}`);
    }

    const data = await response.json();
    const content: string = data.content?.[0]?.text ?? "";
    return { content };
  }

  async *generateCompletionStream(
    params: CompletionParams
  ): AsyncGenerator<string> {
    const response = await fetch(`${this.apiUrl}/v1/messages`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": this.apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: params.model,
        messages: params.messages.map((m) => ({
          role: m.role,
          content: m.content,
        })),
        temperature: params.temperature,
        max_tokens: params.maxTokens,
        top_p: params.topP,
        stream: true,
      }),
    });

    if (!response.ok || !response.body) {
      const text = await response.text();
      throw new Error(`Anthropic API error: ${response.status} - ${text}`);
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let done = false;
    let buffer = "";

    while (!done) {
      const { value, done: doneReading } = await reader.read();
      done = doneReading;
      if (value) {
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";
        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed) continue;
          if (trimmed === "data: [DONE]") return;
          if (!trimmed.startsWith("data:")) continue;
          const data = JSON.parse(trimmed.slice("data:".length));
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
        }
      });

      if (!response.ok) {
        console.warn(`Anthropic models API error: ${response.status}. Falling back to known models.`);
        return this.getFallbackModels();
      }

      const data = await response.json();
      const models = data.data || [];

      // Transform Anthropic models to our ModelInfo format
      const transformedModels = models
        .map((model: any): ModelInfo => {
          const modelInfo: ModelInfo = {
            id: model.id,
            name: this.getModelDisplayName(model.id),
            description: model.description || this.getModelDescription(model.id),
            contextLength: this.getContextLength(model.id),
            inputCost: this.getInputCost(model.id),
            outputCost: this.getOutputCost(model.id),
          };
          return modelInfo;
        })
        .sort((a: ModelInfo, b: ModelInfo) => this.sortModels(a, b));

      return transformedModels.length > 0 ? transformedModels : this.getFallbackModels();
    } catch (error) {
      console.error('Failed to fetch Anthropic models:', error);
      return this.getFallbackModels();
    }
  }

  private getFallbackModels(): ModelInfo[] {
    return [
      {
        id: "claude-sonnet-4-20250514",
        name: "Claude Sonnet 4",
        description: "Latest Claude 4 model with extended thinking capabilities",
        contextLength: 200000,
        inputCost: 3,
        outputCost: 15,
      },
      {
        id: "claude-opus-4-20250514",
        name: "Claude Opus 4",
        description: "Most capable Claude 4 model with extended thinking",
        contextLength: 200000,
        inputCost: 15,
        outputCost: 75,
      },
      {
        id: "claude-3-7-sonnet-20250219",
        name: "Claude 3.7 Sonnet",
        description: "Most intelligent model with extended thinking capability",
        contextLength: 200000,
        inputCost: 3,
        outputCost: 15,
      },
      {
        id: "claude-3-5-sonnet-20241022",
        name: "Claude 3.5 Sonnet",
        description: "Most intelligent model for complex tasks",
        contextLength: 200000,
        inputCost: 3,
        outputCost: 15,
      },
      {
        id: "claude-3-5-haiku-20241022",
        name: "Claude 3.5 Haiku",
        description: "Fastest model for everyday tasks",
        contextLength: 200000,
        inputCost: 0.8,
        outputCost: 4,
      },
      {
        id: "claude-3-opus-20240229",
        name: "Claude 3 Opus",
        description: "Previous top-tier model for most complex tasks",
        contextLength: 200000,
        inputCost: 15,
        outputCost: 75,
      },
      {
        id: "claude-3-sonnet-20240229",
        name: "Claude 3 Sonnet",
        description: "Balance of intelligence and speed",
        contextLength: 200000,
        inputCost: 3,
        outputCost: 15,
      },
      {
        id: "claude-3-haiku-20240307",
        name: "Claude 3 Haiku",
        description: "Fast and cost-effective",
        contextLength: 200000,
        inputCost: 0.25,
        outputCost: 1.25,
      },
    ];
  }

  private getModelDisplayName(modelId: string): string {
    const nameMap: Record<string, string> = {
      "claude-sonnet-4-20250514": "Claude Sonnet 4",
      "claude-opus-4-20250514": "Claude Opus 4",
      "claude-3-7-sonnet-20250219": "Claude 3.7 Sonnet",
      "claude-3-5-sonnet-20241022": "Claude 3.5 Sonnet",
      "claude-3-5-haiku-20241022": "Claude 3.5 Haiku",
      "claude-3-opus-20240229": "Claude 3 Opus",
      "claude-3-sonnet-20240229": "Claude 3 Sonnet",
      "claude-3-haiku-20240307": "Claude 3 Haiku",
    };
    return nameMap[modelId] || modelId;
  }

  private getModelDescription(modelId: string): string {
    const descriptionMap: Record<string, string> = {
      "claude-sonnet-4-20250514": "Latest Claude 4 model with extended thinking capabilities",
      "claude-opus-4-20250514": "Most capable Claude 4 model with extended thinking",
      "claude-3-7-sonnet-20250219": "Most intelligent model with extended thinking capability",
      "claude-3-5-sonnet-20241022": "Most intelligent model for complex tasks",
      "claude-3-5-haiku-20241022": "Fastest model for everyday tasks",
      "claude-3-opus-20240229": "Previous top-tier model for most complex tasks",
      "claude-3-sonnet-20240229": "Balance of intelligence and speed",
      "claude-3-haiku-20240307": "Fast and cost-effective",
    };
    return descriptionMap[modelId] || `Claude model: ${modelId}`;
  }

  private getContextLength(modelId: string): number {
    // All current Claude models have 200k context
    return 200000;
  }

  private getInputCost(modelId: string): number {
    const costMap: Record<string, number> = {
      "claude-sonnet-4-20250514": 3,
      "claude-opus-4-20250514": 15,
      "claude-3-7-sonnet-20250219": 3,
      "claude-3-5-sonnet-20241022": 3,
      "claude-3-5-haiku-20241022": 0.8,
      "claude-3-opus-20240229": 15,
      "claude-3-sonnet-20240229": 3,
      "claude-3-haiku-20240307": 0.25,
    };
    return costMap[modelId] || 3;
  }

  private getOutputCost(modelId: string): number {
    const costMap: Record<string, number> = {
      "claude-sonnet-4-20250514": 15,
      "claude-opus-4-20250514": 75,
      "claude-3-7-sonnet-20250219": 15,
      "claude-3-5-sonnet-20241022": 15,
      "claude-3-5-haiku-20241022": 4,
      "claude-3-opus-20240229": 75,
      "claude-3-sonnet-20240229": 15,
      "claude-3-haiku-20240307": 1.25,
    };
    return costMap[modelId] || 15;
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
