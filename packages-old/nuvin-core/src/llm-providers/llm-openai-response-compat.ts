import type { CompletionParams, CompletionResult, LLMPort, UsageData, ToolCall } from '../ports.js';
import type { HttpTransport, RetryConfig } from '../transports/index.js';
import {
  FetchTransport,
  createTransport,
  RetryTransport,
  LLMErrorTransport,
  isRetryableStatusCode,
  DEFAULT_RETRYABLE_STATUS_CODES,
} from '../transports/index.js';
import { LLMError } from './base-llm.js';
import { sanitizeToolArguments } from '../tools/tool-call-parser.js';
import { normalizeModelInfo, deduplicateModels, type ModelInfo } from './model-limits.js';
import {
  buildResponsesRequestBody,
  transformFromResponsesOutput,
  transformResponsesUsage,
  type ResponsesApiResponse,
  type ResponsesOutputItem,
  type ResponsesStreamEvent,
} from './responses-api-transform.js';

type ModelConfig = false | true | string | string[] | Array<{ id: string; name?: string; [key: string]: unknown }>;

export interface GenericOpenAIResponsesLLMOptions {
  apiKey?: string;
  apiUrl?: string;
  httpLogFile?: string;
  providerName?: string;
  version?: string;
  customHeaders?: Record<string, string>;
  retry?: Partial<RetryConfig>;
  modelConfig?: ModelConfig;
}

export class GenericOpenAIResponsesLLM implements LLMPort {
  private readonly opts: GenericOpenAIResponsesLLMOptions;
  private readonly apiUrl: string;
  private readonly providerName: string;
  private readonly modelConfig: ModelConfig;
  private transport: HttpTransport | null = null;

  constructor(baseUrl: string, modelConfig: ModelConfig, opts: GenericOpenAIResponsesLLMOptions = {}) {
    this.apiUrl = opts.apiUrl || baseUrl;
    this.providerName = opts.providerName ?? 'openai-response-compat';
    this.modelConfig = opts.modelConfig ?? modelConfig;
    this.opts = opts;
  }

  protected createTransport(): HttpTransport {
    const base = new FetchTransport({
      persistFile: this.opts.httpLogFile,
      logLevel: 'INFO',
      enableConsoleLog: false,
      maxFileSize: 5 * 1024 * 1024,
      captureResponseBody: true,
    });

    const authTransport = createTransport(
      base,
      this.apiUrl,
      this.opts.apiKey,
      this.opts.apiUrl,
      this.opts.version,
      this.opts.customHeaders,
    );

    const transport = this.opts.retry ? new RetryTransport(authTransport, this.opts.retry) : authTransport;
    return new LLMErrorTransport(transport);
  }

  protected getTransport(): HttpTransport {
    if (!this.transport) {
      this.transport = this.createTransport();
    }
    return this.transport;
  }

  private throwResponseError(statusCode: number, message: string): never {
    if (statusCode === 429 || statusCode === 408) {
      throw new LLMError('Rate limit exceeded. Please try again later.', statusCode, true);
    } else if (statusCode === 401 || statusCode === 403) {
      throw new LLMError('Authentication failed. Please check your API key.', statusCode, false);
    } else if (statusCode === 400) {
      throw new LLMError(`Invalid request: ${message}`, statusCode, false);
    } else if (isRetryableStatusCode(statusCode, DEFAULT_RETRYABLE_STATUS_CODES)) {
      throw new LLMError('Service temporarily unavailable. Please try again later.', statusCode, true);
    }
    throw new LLMError(message, statusCode, false);
  }

  async generateCompletion(params: CompletionParams, signal?: AbortSignal): Promise<CompletionResult> {
    const body = buildResponsesRequestBody(params, false);
    const res = await this.getTransport().post('/responses', body, undefined, signal);

    if (!res.ok) {
      const text = await res.text();
      this.throwResponseError(res.status, text || `Responses API error ${res.status}`);
    }

    const data: ResponsesApiResponse = await res.json();

    if (data.status === 'failed' && data.error) {
      throw new LLMError(data.error.message, undefined, false);
    }

    return transformFromResponsesOutput(data);
  }

  async streamCompletion(
    params: CompletionParams,
    handlers: {
      onChunk?: (delta: string, usage?: UsageData) => Promise<void>;
      onReasoningChunk?: (delta: string) => Promise<void>;
      onToolCallDelta?: (tc: ToolCall) => Promise<void>;
      onStreamFinish?: (finishReason?: string, usage?: UsageData) => Promise<void>;
      onUsage?: (usage: UsageData) => Promise<void>;
    } = {},
    signal?: AbortSignal,
  ): Promise<CompletionResult> {
    const body = buildResponsesRequestBody(params, true);
    const res = await this.getTransport().post('/responses', body, { Accept: 'text/event-stream' }, signal);

    if (!res.ok) {
      const text = await res.text();
      this.throwResponseError(res.status, text || `Responses API error ${res.status}`);
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

    const processEvent = async (eventData: string) => {
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
              await handlers.onChunk?.(textEvt.delta);
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
              await handlers.onToolCallDelta?.(tc);
            }
            break;
          }

          case 'response.function_call_arguments.delta': {
            const argEvt = evt as { call_id?: string; output_index?: number; delta?: string };
            const callId =
              argEvt.call_id ??
              (argEvt.output_index !== undefined ? outputIndexToCallId.get(argEvt.output_index) : undefined);
            if (callId && argEvt.delta) {
              const currentArgs = toolCallArgsMap.get(callId) ?? '';
              const newArgs = currentArgs + sanitizeToolArguments(argEvt.delta);
              toolCallArgsMap.set(callId, newArgs);

              const tc = toolCalls.find((t) => t.id === callId);
              if (tc) {
                tc.function.arguments = newArgs;
                await handlers.onToolCallDelta?.(tc);
              }
            }
            break;
          }

          case 'response.function_call_arguments.done': {
            const doneEvt = evt as { call_id?: string; output_index?: number; arguments?: string };
            const callId =
              doneEvt.call_id ??
              (doneEvt.output_index !== undefined ? outputIndexToCallId.get(doneEvt.output_index) : undefined);
            if (callId && doneEvt.arguments) {
              const tc = toolCalls.find((t) => t.id === callId);
              if (tc) {
                tc.function.arguments = sanitizeToolArguments(doneEvt.arguments);
                await handlers.onToolCallDelta?.(tc);
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
                await handlers.onUsage?.(usage);
              }
              await handlers.onStreamFinish?.('stop', usage);
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
        if (event.trim()) await processEvent(event);
      }
    }

    if (buffer.trim()) await processEvent(buffer);

    if (finalResponse) {
      const transformed = transformFromResponsesOutput(finalResponse);
      if (!content) {
        content = transformed.content;
      }
      if (toolCalls.length === 0 && transformed.tool_calls && transformed.tool_calls.length > 0) {
        toolCalls.push(...transformed.tool_calls);
      }
      if (!usage && transformed.usage) {
        usage = transformed.usage;
      }
    }

    return {
      content,
      ...(toolCalls.length > 0 && { tool_calls: toolCalls }),
      ...(usage && { usage }),
    };
  }

  async getModels(signal?: AbortSignal): Promise<ModelInfo[]> {
    if (this.modelConfig === false) {
      throw new Error('Provider does not support getModels');
    }

    if (Array.isArray(this.modelConfig)) {
      const models = this.modelConfig.map((m) => {
        const raw = typeof m === 'string' ? { id: m } : m;
        return normalizeModelInfo(this.providerName, raw);
      });
      return deduplicateModels(models);
    }

    if (typeof this.modelConfig === 'string') {
      const res = await this.getTransport().get(this.modelConfig, undefined, signal);

      if (!res.ok) {
        const text = await res.text();
        this.throwResponseError(res.status, text || `Failed to fetch models`);
      }

      const data = (await res.json()) as { data: Record<string, unknown>[] };
      const models = data.data.map((model) => normalizeModelInfo(this.providerName, model));
      return deduplicateModels(models);
    }

    const res = await this.getTransport().get('/models', undefined, signal);

    if (!res.ok) {
      const text = await res.text();
      this.throwResponseError(res.status, text || `Failed to fetch models`);
    }

    const data = (await res.json()) as { data: Record<string, unknown>[] };
    const models = data.data.map((model) => normalizeModelInfo(this.providerName, model));
    return deduplicateModels(models);
  }
}
