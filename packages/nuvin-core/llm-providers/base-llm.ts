import type { CompletionParams, CompletionResult, LLMPort, UsageData, ToolCall } from '../ports.js';
import type { HttpTransport } from '../transports/index.js';
import { mergeChoices, normalizeUsage } from './llm-utils.js';

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

type CompletionBody = Omit<CompletionParams, 'maxTokens' | 'topP'> & {
  max_tokens?: number;
  top_p?: number;
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
};

type LLMMessageDelta = {
  role?: string;
  content?: string | null;
  reasoning?: string | null;
  tool_calls?: LLMToolCallDelta[];
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

  constructor(apiUrl: string, options?: { enablePromptCaching?: boolean }) {
    this.apiUrl = apiUrl;
    this.enablePromptCaching = options?.enablePromptCaching ?? false;
  }

  // Implemented by provider to inject auth, headers, refresh, etc.
  protected abstract createTransport(): HttpTransport;

  private getTransport(): HttpTransport {
    if (!this.transport) this.transport = this.createTransport();
    return this.transport;
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
      temperature: enhancedParams.temperature,
      max_tokens: enhancedParams.maxTokens,
      top_p: enhancedParams.topP,
      stream: false,
      ...(enhancedParams.reasoning && { reasoning: enhancedParams.reasoning }),
      ...(enhancedParams.usage && { usage: enhancedParams.usage }),
    };

    if (enhancedParams.tools && enhancedParams.tools.length > 0) body.tools = enhancedParams.tools;
    if (enhancedParams.tool_choice && enhancedParams.tools && enhancedParams.tools.length > 0)
      body.tool_choice = enhancedParams.tool_choice;

    const res = await this.getTransport().postJson('/chat/completions', body, undefined, signal);

    if (!res.ok) {
      const text = await res.text();
      const isRetryable = res.status === 429 || res.status >= 500;
      throw new LLMError(text || `LLM error ${res.status}`, res.status, isRetryable);
    }

    const data: LLMCompletionResponse = await res.json();
    const merged = mergeChoices(data.choices);
    const usage: UsageData | undefined = normalizeUsage(data.usage);
    return { ...merged, ...(usage ? { usage } : {}) };
  }

  async streamCompletion(
    params: CompletionParams,
    handlers: {
      onChunk?: (delta: string, usage?: UsageData) => void;
      onToolCallDelta?: (tc: ToolCall) => void;
      onStreamFinish?: (finishReason?: string, usage?: UsageData) => void;
    } = {},
    signal?: AbortSignal,
  ): Promise<CompletionResult> {
    const enhancedParams = this.applyCacheControl(params);

    const body: CompletionBody = {
      model: enhancedParams.model,
      messages: enhancedParams.messages,
      temperature: enhancedParams.temperature,
      max_tokens: enhancedParams.maxTokens,
      top_p: enhancedParams.topP,
      stream: true,
      ...(enhancedParams.reasoning && { reasoning: enhancedParams.reasoning }),
      ...(enhancedParams.usage && { usage: enhancedParams.usage }),
    };

    if (enhancedParams.tools && enhancedParams.tools.length > 0) body.tools = enhancedParams.tools;
    if (enhancedParams.tool_choice && enhancedParams.tools && enhancedParams.tools.length > 0)
      body.tool_choice = enhancedParams.tool_choice;

    const res = await this.getTransport().postStream(
      '/chat/completions',
      body,
      { Accept: 'text/event-stream' },
      signal,
    );

    if (!res.ok) {
      const text = await res.text();
      const isRetryable = res.status === 429 || res.status >= 500;
      throw new LLMError(text || `LLM stream error ${res.status}`, res.status, isRetryable);
    }

    const reader = res.body?.getReader();
    if (!reader) return { content: '' };

    const decoder = new TextDecoder('utf-8');
    let buffer = '';
    let content = '';
    const mergedToolCalls: ToolCall[] = [];
    let usage: UsageData | undefined;
    let lastFinishReason: string | undefined;

    const flushEvent = (rawEvent: string) => {
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

        // Track finish_reason across chunks
        if (finishReason) {
          lastFinishReason = finishReason;
        }

        // Extract usage from top level or from choices (Kimi/Moonshot pattern)
        const usageData = evt.usage || (choices[0] as LLMStreamEvent)?.usage;

        if (usageData) {
          usage = normalizeUsage(usageData);
          // Emit finish event when we have usage (and finish_reason from any chunk)
          if (lastFinishReason && handlers.onStreamFinish) {
            handlers.onStreamFinish(lastFinishReason, usage);
          } else {
            // Fallback to chunk event for backward compatibility
            handlers.onChunk?.('', usage);
          }
        }

        for (const ch of choices) {
          const delta: LLMMessageDelta = ch.delta ?? ch.message ?? {};
          const textDelta: string | undefined = delta.content ?? undefined;
          if (typeof textDelta === 'string' && textDelta.length > 0) {
            if (content === '') {
              const trimmedDelta = textDelta.replace(/^\n+/, '');
              if (trimmedDelta) {
                content += trimmedDelta;
                handlers.onChunk?.(trimmedDelta);
              }
            } else {
              content += textDelta;
              handlers.onChunk?.(textDelta);
            }
          }
          const toolDeltas: LLMToolCallDelta[] = Array.isArray(delta.tool_calls) ? delta.tool_calls : [];
          for (const td of toolDeltas) {
            let toolCall: ToolCall | undefined;

            if (td.id) {
              toolCall = mergedToolCalls.find((tc) => tc.id === td.id);
              if (!toolCall) {
                toolCall = {
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
            if (handlers.onToolCallDelta) handlers.onToolCallDelta(toolCall);
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
      for (const part of parts) flushEvent(part);
    }
    if (buffer.trim()) flushEvent(buffer);

    content = content.replace(/^\n+/, '');

    const tool_calls = mergedToolCalls.length ? mergedToolCalls : undefined;
    return { content, ...(tool_calls ? { tool_calls } : {}), ...(usage ? { usage } : {}) };
  }
}
