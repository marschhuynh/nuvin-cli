import type { CompletionParams, CompletionResult, LLMPort, UsageData, ToolCall } from '../ports.js';
import type { HttpTransport, RetryConfig } from '../transports/index.js';
import { isRetryableStatusCode, DEFAULT_RETRYABLE_STATUS_CODES } from '../transports/index.js';
import { mergeChoices } from './llm-utils.js';

export interface BaseLLMOptions {
  enablePromptCaching?: boolean;
  retry?: Partial<RetryConfig>;
}

export class LLMError extends Error {
  constructor(
    message: string,
    public readonly statusCode?: number,
    public readonly isRetryable: boolean = false,
    cause?: unknown,
  ) {
    super(message, cause ? { cause } : undefined);
    this.name = 'LLMError';

    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, LLMError);
    }
  }
}

type CompletionBody = Omit<CompletionParams, 'maxTokens' | 'topP' | 'temperature'> & {
  max_tokens?: number;
  top_p?: number;
  temperature?: number;
  stream: boolean;
};

// API Response Types
type LLMUsageResponse = {
  prompt_tokens?: number;
  completion_tokens?: number;
  total_tokens?: number;
  reasoning_tokens?: number;
  prompt_tokens_details?: {
    cached_tokens?: number;
    audio_tokens?: number;
  };
  completion_tokens_details?: {
    reasoning_tokens?: number;
  };
  cost?: number;
  cost_details?: {
    upstream_inference_cost?: number;
  };
};

type LLMToolCallResponse = {
  id: string;
  type: 'function';
  function: {
    name: string;
    arguments: string;
  };
};

type LLMMessageResponse = {
  role: string;
  content?: string | null;
  tool_calls?: LLMToolCallResponse[];
  [key: string]: unknown;
};

type LLMChoiceResponse = {
  index: number;
  message?: LLMMessageResponse;
  finish_reason?: string | null;
};

type LLMCompletionResponse = {
  id?: string;
  object?: string;
  created?: number;
  model?: string;
  choices?: LLMChoiceResponse[];
  usage?: LLMUsageResponse;
};

// Streaming Event Types
type LLMToolCallDelta = {
  id?: string;
  type?: 'function';
  index?: number;
  function?: {
    name?: string;
    arguments?: string;
  };
  [key: string]: unknown;
};

type LLMMessageDelta = {
  role?: string;
  content?: string | null;
  reasoning?: string | null;
  reasoning_content?: string | null;
  reasoning_text?: string | null;
  tool_calls?: LLMToolCallDelta[];
  [key: string]: unknown;
};

type LLMStreamChoiceDelta = {
  index?: number;
  delta?: LLMMessageDelta;
  message?: LLMMessageDelta;
  finish_reason?: string | null;
};

type LLMStreamEvent = {
  id?: string;
  object?: string;
  created?: number;
  model?: string;
  choices?: LLMStreamChoiceDelta[];
  usage?: LLMUsageResponse;
};

export abstract class BaseLLM implements LLMPort {
  protected transport: HttpTransport | null = null;
  protected apiUrl: string;
  protected enablePromptCaching: boolean = false;
  protected retryConfig?: Partial<RetryConfig>;

  constructor(apiUrl: string, options?: BaseLLMOptions) {
    this.apiUrl = apiUrl;
    this.enablePromptCaching = options?.enablePromptCaching ?? false;
    this.retryConfig = options?.retry;
  }

  // Implemented by provider to inject auth, headers, refresh, etc.
  protected abstract createTransport(): HttpTransport;

  protected transformUsage(rawUsage: unknown): UsageData | undefined {
    if (!rawUsage) return undefined;

    const usage = rawUsage as Partial<UsageData> & {
      input_tokens?: number;
      output_tokens?: number;
      estimated_cost?: number;
    };

    const promptTokens = usage.prompt_tokens ?? usage.input_tokens;
    const completionTokens = usage.completion_tokens ?? usage.output_tokens;
    const totalTokens =
      usage.total_tokens ??
      (promptTokens != null && completionTokens != null ? promptTokens + completionTokens : undefined);
    const cost = usage.cost ?? usage.estimated_cost;

    return {
      prompt_tokens: promptTokens,
      completion_tokens: completionTokens,
      total_tokens: totalTokens,
      ...(usage.reasoning_tokens !== undefined && { reasoning_tokens: usage.reasoning_tokens }),
      ...(usage.prompt_tokens_details && { prompt_tokens_details: usage.prompt_tokens_details }),
      ...(usage.completion_tokens_details && { completion_tokens_details: usage.completion_tokens_details }),
      ...(cost !== undefined && { cost }),
      ...(usage.cost_details && { cost_details: usage.cost_details }),
      ...(usage.cache_creation_input_tokens !== undefined && {
        cache_creation_input_tokens: usage.cache_creation_input_tokens,
      }),
      ...(usage.cache_read_input_tokens !== undefined && { cache_read_input_tokens: usage.cache_read_input_tokens }),
    };
  }

  protected getTransport(): HttpTransport {
    if (!this.transport) this.transport = this.createTransport();
    return this.transport;
  }

  protected throwResponseError(statusCode: number, message: string): never {
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

  protected applyCacheControl(params: CompletionParams): CompletionParams {
    if (!this.enablePromptCaching) {
      return params;
    }

    const messages = params.messages.map((msg) => {
      if (typeof msg.content === 'string' || msg.content === null) {
        return msg;
      }

      return {
        ...msg,
        content: msg.content.map((part) => ({ ...part })),
      };
    });

    const systemMessages = messages.filter((msg) => msg.role === 'system');
    if (systemMessages.length > 0) {
      for (let i = 0; i < Math.min(2, systemMessages.length); i++) {
        const msg = systemMessages[i];
        if (msg && typeof msg.content === 'string' && msg.content) {
          msg.content = [{ type: 'text', text: msg.content, cache_control: { type: 'ephemeral' } }];
        } else if (msg && Array.isArray(msg.content)) {
          const lastPart = msg.content[msg.content.length - 1];
          if (lastPart?.type === 'text') {
            lastPart.cache_control = { type: 'ephemeral' };
          }
        }
      }
    }

    const userAssistantMessages = messages.filter((msg) => msg.role === 'user' || msg.role === 'assistant');

    const lastTwoIndices: number[] = [];
    if (userAssistantMessages.length >= 2) {
      for (let i = userAssistantMessages.length - 2; i < userAssistantMessages.length; i++) {
        const msg = userAssistantMessages[i];
        if (msg) {
          const idx = messages.indexOf(msg);
          if (idx !== -1) lastTwoIndices.push(idx);
        }
      }
    } else if (userAssistantMessages.length === 1) {
      const msg = userAssistantMessages[0];
      if (msg) {
        const idx = messages.indexOf(msg);
        if (idx !== -1) lastTwoIndices.push(idx);
      }
    }

    for (const idx of lastTwoIndices) {
      const msg = messages[idx];
      if (msg && typeof msg.content === 'string' && msg.content) {
        msg.content = [{ type: 'text', text: msg.content, cache_control: { type: 'ephemeral' } }];
      } else if (msg && Array.isArray(msg.content)) {
        const lastPart = msg.content[msg.content.length - 1];
        if (lastPart?.type === 'text') {
          lastPart.cache_control = { type: 'ephemeral' };
        }
      }
    }

    return { ...params, messages };
  }

  async generateCompletion(params: CompletionParams, signal?: AbortSignal): Promise<CompletionResult> {
    const enhancedParams = this.applyCacheControl(params);

    const body: CompletionBody = {
      model: enhancedParams.model,
      messages: enhancedParams.messages,
      stream: false,
      max_tokens: enhancedParams.maxTokens ?? 64000,
      ...(enhancedParams.temperature !== undefined && { temperature: enhancedParams.temperature }),
      ...(enhancedParams.topP !== undefined && { top_p: enhancedParams.topP }),
      ...(enhancedParams.reasoning && { reasoning: enhancedParams.reasoning }),
      ...(enhancedParams.usage && { usage: enhancedParams.usage }),
    };

    if (enhancedParams.tools && enhancedParams.tools.length > 0) body.tools = enhancedParams.tools;
    if (enhancedParams.tool_choice && enhancedParams.tools && enhancedParams.tools.length > 0)
      body.tool_choice = enhancedParams.tool_choice;

    const res = await this.getTransport().post('/chat/completions', body, undefined, signal);

    if (!res.ok) {
      const text = await res.text();
      this.throwResponseError(res.status, text || `LLM error ${res.status}`);
    }

    const data: LLMCompletionResponse = await res.json();
    const merged = mergeChoices(data.choices);
    const usage = this.transformUsage(data.usage);
    return { ...merged, ...(usage ? { usage } : {}) };
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
    const enhancedParams = this.applyCacheControl(params);

    const body: CompletionBody = {
      model: enhancedParams.model,
      messages: enhancedParams.messages,
      stream: true,
      max_tokens: enhancedParams.maxTokens ?? 64000,
      ...(enhancedParams.temperature !== undefined && { temperature: enhancedParams.temperature }),
      ...(enhancedParams.topP !== undefined && { top_p: enhancedParams.topP }),
      ...(enhancedParams.reasoning && { reasoning: enhancedParams.reasoning }),
      ...(enhancedParams.usage && { usage: enhancedParams.usage }),
    };

    if (enhancedParams.tools && enhancedParams.tools.length > 0) body.tools = enhancedParams.tools;
    if (enhancedParams.tool_choice && enhancedParams.tools && enhancedParams.tools.length > 0)
      body.tool_choice = enhancedParams.tool_choice;

    const res = await this.getTransport().post('/chat/completions', body, { Accept: 'text/event-stream' }, signal);

    if (!res.ok) {
      const text = await res.text();
      this.throwResponseError(res.status, text || `LLM error ${res.status}`);
    }

    const reader = res.body?.getReader();
    if (!reader) return { content: '' };

    const decoder = new TextDecoder('utf-8');
    let buffer = '';
    let content = '';
    let reasoning = '';
    const mergedToolCalls: ToolCall[] = [];
    let usage: UsageData | undefined;
    let lastFinishReason: string | undefined;
    const extraFields: Record<string, unknown> = {};

    const flushEvent = async (rawEvent: string) => {
      const lines = rawEvent.split('\n');
      const dataLines: string[] = [];
      for (const ln of lines) {
        if (ln.startsWith('data:')) dataLines.push(ln.slice(5).trimStart());
      }
      if (dataLines.length === 0) return;
      const dataStr = dataLines.join('\n').trim();
      if (!dataStr || dataStr === '[DONE]') return;
      try {
        const evt: LLMStreamEvent = JSON.parse(dataStr);

        const choices = Array.isArray(evt.choices) ? evt.choices : [];
        const finishReason = choices.find((ch) => ch.finish_reason && ch.finish_reason !== null)?.finish_reason;

        if (finishReason) {
          lastFinishReason = finishReason;
        }

        const usageData = evt.usage || (choices[0] as LLMStreamEvent)?.usage;

        if (usageData) {
          usage = this.transformUsage(usageData);
          if (usage) {
            if (lastFinishReason && handlers.onStreamFinish) {
              await handlers.onStreamFinish(lastFinishReason, usage);
            } else {
              await handlers.onUsage?.(usage);
            }
          }
        }

        for (const ch of choices) {
          const delta: LLMMessageDelta = ch.delta ?? ch.message ?? {};
          const textDelta: string | undefined = delta.content ?? undefined;
          const reasoningDelta: string | undefined =
            delta.reasoning_content ?? delta.reasoning ?? delta.reasoning_text ?? undefined;

          if (typeof reasoningDelta === 'string' && reasoningDelta.length > 0) {
            reasoning += reasoningDelta;
            await handlers.onReasoningChunk?.(reasoningDelta);
          }

          if (typeof textDelta === 'string' && textDelta.length > 0) {
            if (content === '') {
              const trimmedDelta = textDelta.replace(/^\n+/, '');
              if (trimmedDelta) {
                content += trimmedDelta;
                await handlers.onChunk?.(trimmedDelta);
              }
            } else {
              content += textDelta;
              await handlers.onChunk?.(textDelta);
            }
          }

          // Dynamically accumulate unknown fields into root object (extraFields)
          const knownKeys = ['role', 'content', 'tool_calls', 'reasoning', 'reasoning_content', 'reasoning_text'];
          for (const key of Object.keys(delta)) {
            if (knownKeys.includes(key)) continue;

            const val = (delta as Record<string, unknown>)[key];
            if (typeof val === 'string') {
              extraFields[key] = ((extraFields[key] as string) || '') + val;
            } else if (val !== undefined && val !== null) {
              extraFields[key] = val;
            }
          }

          const toolDeltas: LLMToolCallDelta[] = Array.isArray(delta.tool_calls) ? delta.tool_calls : [];
          for (const td of toolDeltas) {
            let toolCall: ToolCall | undefined;

            if (td.id) {
              toolCall = mergedToolCalls.find((tc) => tc.id === td.id);
              if (!toolCall) {
                toolCall = {
                  ...td,
                  id: td.id,
                  type: 'function',
                  function: { name: td.function?.name ?? '', arguments: '' },
                };
                mergedToolCalls.push(toolCall);
              }
            } else {
              if (mergedToolCalls.length > 0) {
                toolCall = mergedToolCalls[mergedToolCalls.length - 1];
              } else {
                const idx = td.index ?? 0;
                toolCall = {
                  id: String(idx),
                  type: 'function',
                  function: { name: td.function?.name ?? '', arguments: '' },
                };
                mergedToolCalls.push(toolCall);
              }
            }

            if (typeof td.function?.name === 'string' && td.function.name) {
              toolCall.function.name = td.function.name;
            }
            if (typeof td.function?.arguments === 'string' && td.function.arguments) {
              toolCall.function.arguments += td.function.arguments;
            }
            await handlers?.onToolCallDelta?.(toolCall);
          }
        }
      } catch {}
    };

    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      const chunk = decoder.decode(value, { stream: true });

      if (buffer && chunk.trim().startsWith('data:') && !buffer.endsWith('\n\n') && !buffer.endsWith('\n')) {
        buffer += '\n\n';
      }

      buffer += chunk;
      const parts = buffer.split('\n\n');
      buffer = parts.pop() ?? '';
      for (const part of parts) await flushEvent(part);
    }
    if (buffer.trim()) await flushEvent(buffer);

    content = content.replace(/^\n+/, '');

    const tool_calls = mergedToolCalls.length ? mergedToolCalls : undefined;

    return {
      content,
      ...(tool_calls ? { tool_calls } : {}),
      ...(usage ? { usage } : {}),
      ...(reasoning && { reasoning }),
      ...extraFields,
    };
  }
}
