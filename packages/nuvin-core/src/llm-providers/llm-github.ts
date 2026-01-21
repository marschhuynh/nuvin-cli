import type { LLMPort, UsageData, CompletionParams, CompletionResult, ToolCall } from '../ports.js';
import { BaseLLM, LLMError } from './base-llm.js';
import {
  FetchTransport,
  GithubAuthTransport,
  RetryTransport,
  LLMErrorTransport,
  type RetryConfig,
} from '../transports/index.js';
import { normalizeModelInfo, deduplicateModels, type ModelInfo } from './model-limits.js';
import {
  buildResponsesRequestBody,
  transformFromResponsesOutput,
  transformResponsesUsage,
  type ResponsesApiResponse,
  type ResponsesStreamEvent,
  type ResponsesOutputItem,
} from './responses-api-transform.js';

type GithubOptions = {
  apiKey?: string;
  accessToken?: string;
  apiUrl?: string;
  httpLogFile?: string;
  retry?: Partial<RetryConfig>;
};

type GithubModel = {
  version: string;
  id: string;
  name: string;
  capable_endpoints?: string[];
  supported_endpoints?: string[];
  capabilities: {
    family: string;
    type: string;
    limits?: {
      max_context_window_tokens?: number;
      max_output_tokens?: number;
    };
  };
};

type GithubModelsResponse = {
  data: GithubModel[];
};

export class GithubLLM extends BaseLLM implements LLMPort {
  private readonly opts: GithubOptions;
  private modelEndpointCache: Map<string, string[]> = new Map();

  constructor(opts: GithubOptions = {}) {
    super(opts.apiUrl ?? 'https://api.individual.githubcopilot.com', { retry: opts.retry });
    this.opts = opts;
  }

  protected createTransport() {
    const base = new FetchTransport({
      persistFile: this.opts.httpLogFile,
      logLevel: 'INFO',
      enableConsoleLog: false,
      maxFileSize: 5 * 1024 * 1024,
      captureResponseBody: true,
    });
    const authTransport = new GithubAuthTransport(base, {
      baseUrl: this.opts.apiUrl,
      apiKey: this.opts.apiKey,
      accessToken: this.opts.accessToken,
    });

    const transport = this.retryConfig ? new RetryTransport(authTransport, this.retryConfig) : authTransport;
    return new LLMErrorTransport(transport);
  }

  protected transformUsage(rawUsage: unknown): UsageData | undefined {
    if (!rawUsage) return undefined;

    const usage = rawUsage as {
      prompt_tokens?: number;
      completion_tokens?: number;
      total_tokens?: number;
      prompt_tokens_details?: {
        cached_tokens?: number;
      };
      completion_tokens_details?: {
        reasoning_tokens?: number;
      };
    };

    return {
      prompt_tokens: usage.prompt_tokens,
      completion_tokens: usage.completion_tokens,
      total_tokens: usage.total_tokens,
      prompt_tokens_details: usage.prompt_tokens_details,
      completion_tokens_details: usage.completion_tokens_details,
    };
  }

  async getModels(signal?: AbortSignal): Promise<ModelInfo[]> {
    const res = await this.getTransport().get('/models', undefined, signal);
    const body = (await res.json()) as GithubModelsResponse;
    const models = body.data.map((m) => {
      const modelInfo = normalizeModelInfo('github', m as unknown as Record<string, unknown>);
      if (modelInfo.supportedEndpoints) {
        this.modelEndpointCache.set(modelInfo.id, modelInfo.supportedEndpoints);
      }
      return modelInfo;
    });
    return deduplicateModels(models);
  }

  private needsResponsesApi(model: string): boolean {
    const endpoints = this.modelEndpointCache.get(model);
    if (endpoints) {
      return !endpoints.includes('/chat/completions') && endpoints.includes('/responses');
    }

    const responsesOnlyPatterns = [
      /^gpt-\d+(\.\d+)?-codex/,
      /^gpt-\d+(\.\d+)?-codex-mini/,
      /^gpt-\d+(\.\d+)?-codex-max/,
    ];
    return responsesOnlyPatterns.some((pattern) => pattern.test(model));
  }

  private markModelAsResponsesOnly(model: string): void {
    this.modelEndpointCache.set(model, ['/responses']);
  }

  private handleError(error: unknown, model: string): never {
    if (error instanceof LLMError) {
      try {
        let jsonToParse = error.message;
        if (jsonToParse.startsWith('Invalid request: ')) {
          jsonToParse = jsonToParse.slice('Invalid request: '.length);
        }
        const errorBody = JSON.parse(jsonToParse);
        if (errorBody?.error?.code === 'unsupported_api_for_model') {
          this.markModelAsResponsesOnly(model);
          throw new LLMError(
            `The model '${model}' is not supported for chat completions. Please select a different model using '/model'.`,
            error.statusCode,
            false,
          );
        }
      } catch (e) {
        if (e instanceof LLMError && e.message.includes('not supported')) {
          throw e;
        }
      }
    }
    throw error;
  }

  private throwResponsesApiError(statusCode: number, message: string): never {
    if (statusCode === 429 || statusCode === 408) {
      throw new LLMError('Rate limit exceeded. Please try again later.', statusCode, true);
    } else if (statusCode === 401 || statusCode === 403) {
      throw new LLMError('Authentication failed. Please check your API key.', statusCode, false);
    } else if (statusCode === 400) {
      throw new LLMError(`Invalid request: ${message}`, statusCode, false);
    }
    throw new LLMError(message, statusCode, false);
  }

  private async generateCompletionViaResponses(
    params: CompletionParams,
    signal?: AbortSignal,
  ): Promise<CompletionResult> {
    const body = buildResponsesRequestBody(params, false);
    const res = await this.getTransport().post('/responses', body, undefined, signal);

    if (!res.ok) {
      const text = await res.text();
      this.throwResponsesApiError(res.status, text || `GitHub API error ${res.status}`);
    }

    const data: ResponsesApiResponse = await res.json();

    if (data.status === 'failed' && data.error) {
      throw new LLMError(data.error.message, undefined, false);
    }

    return transformFromResponsesOutput(data);
  }

  private async streamCompletionViaResponses(
    params: CompletionParams,
    handlers: {
      onChunk?: (delta: string, usage?: UsageData) => void;
      onReasoningChunk?: (delta: string) => void;
      onToolCallDelta?: (tc: ToolCall) => void;
      onStreamFinish?: (finishReason?: string, usage?: UsageData) => void;
      onUsage?: (usage: UsageData) => void;
    } = {},
    signal?: AbortSignal,
  ): Promise<CompletionResult> {
    const body = buildResponsesRequestBody(params, true);
    const res = await this.getTransport().post('/responses', body, { Accept: 'text/event-stream' }, signal);

    if (!res.ok) {
      const text = await res.text();
      this.throwResponsesApiError(res.status, text || `GitHub API error ${res.status}`);
    }

    const reader = res.body?.getReader();
    if (!reader) return { content: '' };

    const decoder = new TextDecoder('utf-8');
    let buffer = '';
    let content = '';
    const toolCalls: ToolCall[] = [];
    const toolCallArgsMap: Map<string, string> = new Map();
    const outputIndexToCallId: Map<number, string> = new Map();
    let usage: UsageData | undefined;
    let finalResponse: ResponsesApiResponse | undefined;

    const processEvent = (eventData: string) => {
      const lines = eventData.split('\n');
      let eventType = '';
      let data = '';

      for (const line of lines) {
        if (line.startsWith('event:')) {
          eventType = line.slice(6).trim();
        } else if (line.startsWith('data:')) {
          data = line.slice(5).trim();
        }
      }

      if (!data || data === '[DONE]') return;

      try {
        const evt = JSON.parse(data) as ResponsesStreamEvent | Record<string, unknown>;

        const type = eventType || (evt as { type?: string }).type;

        switch (type) {
          case 'response.output_text.delta': {
            const textEvt = evt as { delta?: string };
            if (textEvt.delta) {
              content += textEvt.delta;
              handlers.onChunk?.(textEvt.delta);
            }
            break;
          }

          case 'response.output_item.added': {
            const itemEvt = evt as { item?: ResponsesOutputItem; output_index?: number };
            if (itemEvt.item?.type === 'function_call') {
              const tc: ToolCall = {
                id: itemEvt.item.call_id,
                type: 'function',
                function: {
                  name: itemEvt.item.name,
                  arguments: '',
                },
              };
              toolCalls.push(tc);
              toolCallArgsMap.set(itemEvt.item.call_id, '');
              if (itemEvt.output_index !== undefined) {
                outputIndexToCallId.set(itemEvt.output_index, itemEvt.item.call_id);
              }
              handlers.onToolCallDelta?.(tc);
            }
            break;
          }

          case 'response.function_call_arguments.delta': {
            const argEvt = evt as { call_id?: string; output_index?: number; delta?: string };
            const callId = argEvt.call_id ?? (argEvt.output_index !== undefined ? outputIndexToCallId.get(argEvt.output_index) : undefined);
            if (callId && argEvt.delta) {
              const currentArgs = toolCallArgsMap.get(callId) ?? '';
              const newArgs = currentArgs + argEvt.delta;
              toolCallArgsMap.set(callId, newArgs);

              const tc = toolCalls.find((t) => t.id === callId);
              if (tc) {
                tc.function.arguments = newArgs;
                handlers.onToolCallDelta?.(tc);
              }
            }
            break;
          }

          case 'response.function_call_arguments.done': {
            const doneEvt = evt as { call_id?: string; output_index?: number; arguments?: string };
            const callId = doneEvt.call_id ?? (doneEvt.output_index !== undefined ? outputIndexToCallId.get(doneEvt.output_index) : undefined);
            if (callId && doneEvt.arguments) {
              const tc = toolCalls.find((t) => t.id === callId);
              if (tc) {
                tc.function.arguments = doneEvt.arguments;
                handlers.onToolCallDelta?.(tc);
              }
            }
            break;
          }

          case 'response.completed': {
            const completedEvt = evt as { response?: ResponsesApiResponse };
            if (completedEvt.response) {
              finalResponse = completedEvt.response;
              if (finalResponse.usage) {
                usage = transformResponsesUsage(finalResponse.usage);
                handlers.onUsage?.(usage);
              }
              handlers.onStreamFinish?.('stop', usage);
            }
            break;
          }

          case 'response.failed': {
            const failedEvt = evt as { response?: ResponsesApiResponse };
            if (failedEvt.response?.error) {
              throw new LLMError(failedEvt.response.error.message, undefined, false);
            }
            break;
          }

          case 'error': {
            const errorEvt = evt as { error?: { message?: string } };
            if (errorEvt.error?.message) {
              throw new LLMError(errorEvt.error.message, undefined, false);
            }
            break;
          }
        }
      } catch (e) {
        if (e instanceof LLMError) throw e;
      }
    };

    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      const events = buffer.split('\n\n');
      buffer = events.pop() ?? '';

      for (const event of events) {
        if (event.trim()) processEvent(event);
      }
    }

    if (buffer.trim()) processEvent(buffer);

    return {
      content,
      ...(toolCalls.length > 0 && { tool_calls: toolCalls }),
      ...(usage && { usage }),
    };
  }

  async generateCompletion(params: CompletionParams, signal?: AbortSignal): Promise<CompletionResult> {
    if (this.needsResponsesApi(params.model)) {
      return this.generateCompletionViaResponses(params, signal);
    }

    try {
      return await super.generateCompletion(params, signal);
    } catch (error) {
      if (error instanceof LLMError && error.message.includes('unsupported_api_for_model')) {
        this.markModelAsResponsesOnly(params.model);
        return this.generateCompletionViaResponses(params, signal);
      }
      this.handleError(error, params.model);
    }
  }

  async streamCompletion(
    params: CompletionParams,
    handlers?: {
      onChunk?: (delta: string, usage?: UsageData) => void;
      onReasoningChunk?: (delta: string) => void;
      onToolCallDelta?: (tc: ToolCall) => void;
      onStreamFinish?: (finishReason?: string, usage?: UsageData) => void;
      onUsage?: (usage: UsageData) => void;
    },
    signal?: AbortSignal,
  ): Promise<CompletionResult> {
    if (this.needsResponsesApi(params.model)) {
      return this.streamCompletionViaResponses(params, handlers, signal);
    }

    try {
      return await super.streamCompletion(params, handlers, signal);
    } catch (error) {
      if (error instanceof LLMError && error.message.includes('unsupported_api_for_model')) {
        this.markModelAsResponsesOnly(params.model);
        return this.streamCompletionViaResponses(params, handlers, signal);
      }
      this.handleError(error, params.model);
    }
  }
}
