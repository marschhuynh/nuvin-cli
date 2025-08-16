import { extractValue } from './utils';
import type {
  LLMProvider,
  CompletionParams,
  CompletionResult,
  StreamChunk,
  ModelInfo,
  StreamingRequestBody,
  UsageData,
  ToolCall,
  ChatMessage,
} from './types/base';
import type { ChatCompletionResponse } from './types/openrouter';

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
  processingMarker?: string;
  doneMarker?: string;
}

export type NestedApiResponseData =
  | Record<string, unknown>
  | unknown[]
  | string
  | number
  | boolean
  | null;

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
      body?: object;
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
      
      // Try to parse as JSON for structured error data
      let errorData: any;
      try {
        errorData = JSON.parse(text);
      } catch {
        errorData = text;
      }
      
      // Create error with structured information
      const errorInfo = {
        provider: this.type,
        status: response.status,
        statusText: response.statusText,
        error: errorData
      };
      
      const errorMessage = `${this.type} API error: ${response.status} - ${JSON.stringify(errorInfo)}`;
      throw new Error(errorMessage);
    }

    return response;
  }

  protected parseRequestBody<T>(params: CompletionParams): T {
    return {
      model: params.model,
      messages: params.messages,
      temperature: params.temperature,
      max_tokens: params.maxTokens,
      top_p: params.topP,
      tools: params.tools || [],
      tool_choice: params.tool_choice,
    } as T;
  }

  protected async makeStreamingRequest(
    endpoint: string,
    params: CompletionParams,
    signal?: AbortSignal,
  ): Promise<ReadableStreamDefaultReader<Uint8Array>> {
    const body: StreamingRequestBody = this.parseRequestBody({
      ...params,
    });
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
  ): AsyncGenerator<string> {
    const decoder = new TextDecoder();
    let buffer = '';

    const {
      doneMarker = '[DONE]',
      processingMarker = ': OPENROUTER PROCESSING',
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

        // Handle OpenRouter processing indicators
        if (trimmed.startsWith(processingMarker)) {
          continue;
        }

        if (trimmed === `data: ${doneMarker}`) {
          return;
        }

        if (!trimmed.startsWith('data:')) continue;

        try {
          const jsonStr = trimmed.slice('data:'.length).trim();
          if (jsonStr) {
            const data = JSON.parse(jsonStr);
            yield data;
          }
        } catch (error) {
          console.warn(
            'Failed to parse streaming data:',
            error,
            'Line:',
            trimmed,
          );
        }
      }
    }
  }

  protected createCompletionResult<T = ChatCompletionResponse>(
    data: T,
    startTime?: number,
  ): CompletionResult {
    const content =
      extractValue(data, 'choices.0.message.content') ||
      extractValue(data, 'content.0.text') ||
      '';

    const toolCalls =
      extractValue(data, 'choices.0.message.tool_calls') ||
      extractValue(data, 'tool_calls');

    const usage: UsageData | undefined = extractValue(data, 'usage');
    const model = extractValue(data, 'model');
    const generationId = extractValue(data, 'id');
    const moderationResults = extractValue(data, 'moderation_results');

    // Calculate response time if start time provided
    const responseTime = startTime ? Date.now() - startTime : undefined;

    // Extract cost information if available (OpenRouter specific)
    const estimatedCost = usage ? this.calculateCost(usage, model) : undefined;

    const metadata = {
      model,
      provider: this.type,
      generationId,
      moderationResults,
      responseTime,
      estimatedCost,
      raw: data,
    };

    return {
      content,
      ...(toolCalls && { tool_calls: toolCalls }),
      ...(usage && {
        usage: {
          prompt_tokens: usage.prompt_tokens || usage.input_tokens,
          completion_tokens: usage.completion_tokens || usage.output_tokens,
          total_tokens:
            usage.total_tokens ||
            Number(usage?.input_tokens) + Number(usage?.output_tokens),
        },
      }),
      _metadata: metadata,
    };
  }

  protected calculateCost(
    usage: UsageData,
    model?: string,
  ): number | undefined {
    // This is a basic cost calculation - providers can override this
    // For now, return undefined as costs are provider-specific
    return undefined;
  }

  protected async *parseStreamWithTools(
    reader: ReadableStreamDefaultReader<Uint8Array>,
    options: StreamParseOptions = {},
    signal?: AbortSignal,
    startTime?: number,
  ): AsyncGenerator<StreamChunk> {
    const accumulatedToolCalls: ToolCall[] = [];
    let usage: UsageData | undefined;
    let lastData: string | undefined;
    let hasFinished = false;

    for await (const data of this.parseStream(reader, options, signal)) {
      lastData = data;

      // Handle usage data - OpenRouter sends this in a separate chunk
      const currentUsage: UsageData | undefined = extractValue(
        data,
        options.usagePath || 'usage',
      );
      if (currentUsage) {
        usage = currentUsage;
        // Don't yield content for usage-only chunks, just store the usage
        continue;
      }

      // Handle text content
      const content = extractValue(
        data,
        options.contentPath || 'choices.0.delta.content',
      );
      if (content) {
        yield { content };
      }

      // Handle tool calls
      const toolCallDeltas = extractValue(
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
      const finishReason = extractValue(
        data,
        options.finishReasonPath || 'choices.0.finish_reason',
      );
      if (finishReason === 'tool_calls' || finishReason === 'stop') {
        hasFinished = true;
      }
    }

    // After stream ends, yield final chunk with all accumulated data
    if (hasFinished || accumulatedToolCalls.length > 0 || usage) {
      yield {
        tool_calls:
          accumulatedToolCalls.length > 0 ? accumulatedToolCalls : undefined,
        finished: true,
        usage: usage
          ? {
              prompt_tokens: usage.prompt_tokens || usage.input_tokens || 0,
              completion_tokens:
                usage.completion_tokens || usage.output_tokens || 0,
              total_tokens:
                usage.total_tokens ||
                (usage.prompt_tokens ?? 0) + (usage.completion_tokens ?? 0) ||
                0,
            }
          : undefined,
        _metadata: this.createStreamMetadata(lastData, startTime, usage),
      };
    }
  }

  protected createStreamMetadata(
    data: any,
    startTime?: number,
    usage?: UsageData,
  ) {
    if (!data) return undefined;

    const model = extractValue(data, 'model');
    const generationId = extractValue(data, 'id');
    const moderationResults = extractValue(data, 'moderation_results');
    const responseTime = startTime ? Date.now() - startTime : undefined;
    const estimatedCost = usage ? this.calculateCost(usage, model) : undefined;

    return {
      model,
      provider: this.type,
      generationId,
      moderationResults,
      responseTime,
      estimatedCost,
      promptTokens: usage?.prompt_tokens || usage?.input_tokens || 0,
      completionTokens: usage?.completion_tokens || usage?.output_tokens || 0,
      totalTokens:
        usage?.total_tokens ||
        (usage
          ? (usage.prompt_tokens ?? 0) + (usage.completion_tokens ?? 0)
          : 0) ||
        0,
      raw: data,
    };
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
