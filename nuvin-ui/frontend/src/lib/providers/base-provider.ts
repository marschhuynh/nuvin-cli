import type {
  LLMProvider,
  CompletionParams,
  CompletionResult,
  StreamChunk,
  ModelInfo,
  ToolCall,
} from './llm-provider';

export interface BaseProviderConfig {
  apiKey: string;
  apiUrl: string;
  providerName: string;
  headers?: Record<string, string>;
  referer?: string;
  title?: string;
}

export interface StreamParseOptions {
  contentPath?: string;
  toolCallsPath?: string;
  usagePath?: string;
  finishReasonPath?: string;
  doneMarker?: string;
}

export abstract class BaseLLMProvider implements LLMProvider {
  readonly type: string;
  protected apiKey: string;
  protected apiUrl: string;
  protected headers: Record<string, string>;
  protected referer?: string;
  protected title?: string;

  constructor(config: BaseProviderConfig) {
    this.type = config.providerName;
    this.apiKey = config.apiKey;
    this.apiUrl = config.apiUrl;
    this.headers = {
      'Content-Type': 'application/json',
      ...config.headers,
    };
    this.referer = config.referer;
    this.title = config.title;
  }

  protected getAuthHeaders(): Record<string, string> {
    return {
      Authorization: `Bearer ${this.apiKey}`,
    };
  }

  protected getCommonHeaders(): Record<string, string> {
    const headers = { ...this.headers, ...this.getAuthHeaders() };

    if (this.referer) {
      headers['HTTP-Referer'] = this.referer;
    }

    if (this.title) {
      headers['X-Title'] = this.title;
    }

    return headers;
  }

  protected async makeRequest(
    endpoint: string,
    options: {
      method?: string;
      body?: any;
      signal?: AbortSignal;
      headers?: Record<string, string>;
    } = {},
  ): Promise<Response> {
    const url = `${this.apiUrl}${endpoint}`;
    const headers = { ...this.getCommonHeaders(), ...options.headers };

    const response = await fetch(url, {
      method: options.method || 'POST',
      headers,
      body: options.body ? JSON.stringify(options.body) : undefined,
      signal: options.signal,
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`${this.type} API error: ${response.status} - ${text}`);
    }

    return response;
  }

  protected async makeStreamingRequest(
    endpoint: string,
    params: CompletionParams,
    signal?: AbortSignal,
  ): Promise<ReadableStreamDefaultReader<Uint8Array>> {
    const body = {
      model: params.model,
      messages: params.messages,
      temperature: params.temperature,
      max_tokens: params.maxTokens,
      top_p: params.topP,
      stream: true,
      ...(params.tools && { tools: params.tools }),
      ...(params.tool_choice && { tool_choice: params.tool_choice }),
    };

    const response = await this.makeRequest(endpoint, {
      method: 'POST',
      body,
      signal,
    });

    if (!response.body) {
      throw new Error('No response body for streaming');
    }

    return response.body.getReader();
  }

  protected async *parseStream(
    reader: ReadableStreamDefaultReader<Uint8Array>,
    options: StreamParseOptions = {},
    signal?: AbortSignal,
  ): AsyncGenerator<any> {
    const decoder = new TextDecoder();
    let buffer = '';
    const {
      contentPath = 'choices.0.delta.content',
      toolCallsPath = 'choices.0.delta.tool_calls',
      usagePath = 'usage',
      finishReasonPath = 'choices.0.finish_reason',
      doneMarker = '[DONE]',
    } = options;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      if (signal?.aborted) {
        throw new Error('Request cancelled by user');
      }

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;

        if (trimmed === `data: ${doneMarker}`) {
          return;
        }

        if (!trimmed.startsWith('data:')) continue;

        try {
          const data = JSON.parse(trimmed.slice('data:'.length));
          yield data;
        } catch (error) {
          console.warn('Failed to parse streaming data:', error);
        }
      }
    }
  }

  protected extractValue(obj: any, path: string): any {
    return path.split('.').reduce((current, key) => {
      if (current === null || current === undefined) return undefined;
      if (key.includes('[') && key.includes(']')) {
        const [arrayKey, indexStr] = key.split('[');
        const index = parseInt(indexStr.replace(']', ''));
        return current[arrayKey]?.[index];
      }
      return current[key];
    }, obj);
  }

  protected transformMessagesForProvider(
    messages: any[],
    providerType: string,
  ): any[] {
    switch (providerType) {
      case 'Anthropic':
        return messages.map((m) => ({
          role: m.role,
          content: m.content,
          ...(m.tool_calls && { tool_calls: m.tool_calls }),
          ...(m.tool_call_id && { tool_call_id: m.tool_call_id }),
          ...(m.name && { name: m.name }),
        }));
      default:
        return messages;
    }
  }

  protected transformToolsForProvider(
    tools: any[],
    providerType: string,
  ): any[] {
    switch (providerType) {
      case 'Anthropic':
        return tools.map((tool) => tool.function);
      default:
        return tools;
    }
  }

  protected createCompletionResult(data: any): CompletionResult {
    const content =
      this.extractValue(data, 'choices.0.message.content') ||
      this.extractValue(data, 'content.0.text') ||
      '';

    const toolCalls =
      this.extractValue(data, 'choices.0.message.tool_calls') ||
      this.extractValue(data, 'tool_calls');

    const usage = this.extractValue(data, 'usage');

    return {
      content,
      ...(toolCalls && { tool_calls: toolCalls }),
      ...(usage && {
        usage: {
          prompt_tokens: usage.prompt_tokens || usage.input_tokens,
          completion_tokens: usage.completion_tokens || usage.output_tokens,
          total_tokens:
            usage.total_tokens || usage.input_tokens + usage.output_tokens,
        },
      }),
    };
  }

  protected async *parseStreamWithTools(
    reader: ReadableStreamDefaultReader<Uint8Array>,
    options: StreamParseOptions = {},
    signal?: AbortSignal,
  ): AsyncGenerator<StreamChunk> {
    const decoder = new TextDecoder();
    let buffer = '';
    let accumulatedToolCalls: any[] = [];
    let usage: any = null;

    for await (const data of this.parseStream(reader, options, signal)) {
      // Handle usage data
      if (options.usagePath && this.extractValue(data, options.usagePath)) {
        usage = this.extractValue(data, options.usagePath);
      }

      // Handle text content
      const content = this.extractValue(
        data,
        options.contentPath || 'choices.0.delta.content',
      );
      if (content) {
        yield { content };
      }

      // Handle tool calls
      const toolCallDeltas = this.extractValue(
        data,
        options.toolCallsPath || 'choices.0.delta.tool_calls',
      );
      if (toolCallDeltas) {
        for (const tcDelta of toolCallDeltas) {
          if (tcDelta.index !== undefined) {
            if (!accumulatedToolCalls[tcDelta.index]) {
              accumulatedToolCalls[tcDelta.index] = {
                id: tcDelta.id || '',
                type: 'function',
                function: {
                  name: '',
                  arguments: '',
                },
              };
            }

            const toolCall = accumulatedToolCalls[tcDelta.index];
            if (tcDelta.id) toolCall.id = tcDelta.id;
            if (tcDelta.function?.name) {
              toolCall.function.name += tcDelta.function.name;
            }
            if (tcDelta.function?.arguments) {
              toolCall.function.arguments += tcDelta.function.arguments;
            }
          }
        }
        yield { tool_calls: [...accumulatedToolCalls] };
      }

      // Check for finish
      const finishReason = this.extractValue(
        data,
        options.finishReasonPath || 'choices.0.finish_reason',
      );
      if (finishReason === 'tool_calls' || finishReason === 'stop') {
        yield {
          tool_calls:
            accumulatedToolCalls.length > 0 ? accumulatedToolCalls : undefined,
          finished: true,
          usage: usage
            ? {
                prompt_tokens: usage.prompt_tokens || usage.input_tokens,
                completion_tokens:
                  usage.completion_tokens || usage.output_tokens,
                total_tokens:
                  usage.total_tokens ||
                  usage.input_tokens + usage.output_tokens,
              }
            : undefined,
        };
      }
    }

    if (accumulatedToolCalls.length > 0) {
      yield { tool_calls: accumulatedToolCalls, finished: true };
    }
  }

  abstract generateCompletion(
    params: CompletionParams,
    signal?: AbortSignal,
  ): Promise<CompletionResult>;

  abstract generateCompletionStream(
    params: CompletionParams,
    signal?: AbortSignal,
  ): AsyncGenerator<string>;

  abstract generateCompletionStreamWithTools(
    params: CompletionParams,
    signal?: AbortSignal,
  ): AsyncGenerator<StreamChunk>;

  abstract getModels(): Promise<ModelInfo[]>;

  protected formatModelInfo(
    model: any,
    overrides: Partial<ModelInfo> = {},
  ): ModelInfo {
    return {
      id: model.id,
      name: model.name || model.id,
      contextLength: model.context_length || 4096,
      inputCost: model.pricing?.prompt
        ? parseFloat(model.pricing.prompt) * 1000000
        : undefined,
      outputCost: model.pricing?.completion
        ? parseFloat(model.pricing.completion) * 1000000
        : undefined,
      modality: 'text',
      inputModalities: ['text'],
      outputModalities: ['text'],
      supportedParameters: ['temperature', 'top_p', 'max_tokens'],
      ...overrides,
    };
  }

  protected sortModels(models: ModelInfo[]): ModelInfo[] {
    return models.sort((a, b) => a.name.localeCompare(b.name));
  }
}
