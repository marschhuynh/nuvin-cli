import type { CompletionParams, CompletionResult, LLMPort, UsageData, ToolCall, ChatMessage } from '../ports.js';
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
import { normalizeModelInfo, deduplicateModels, type ModelInfo } from './model-limits.js';

type ModelConfig = false | true | string | string[] | Array<{ id: string; name?: string; [key: string]: unknown }>;

export interface GenericAnthropicLLMOptions {
  apiKey?: string;
  apiUrl?: string;
  httpLogFile?: string;
  enablePromptCaching?: boolean;
  providerName?: string;
  version?: string;
  customHeaders?: Record<string, string>;
  retry?: Partial<RetryConfig>;
  modelConfig?: ModelConfig;
}

type AnthropicContentPart =
  | { type: 'text'; text: string; cache_control?: { type: 'ephemeral' } }
  | { type: 'image'; source: { type: 'base64'; media_type: string; data: string } }
  | { type: 'tool_use'; id: string; name: string; input: Record<string, unknown> }
  | { type: 'tool_result'; tool_use_id: string; content: string }
  | { type: 'thinking'; thinking: string; signature?: string }
  | { type: 'redacted_thinking'; data: string };

type AnthropicMessage = {
  role: 'user' | 'assistant';
  content: string | AnthropicContentPart[];
};

type AnthropicToolDef = {
  name: string;
  description: string;
  input_schema: Record<string, unknown>;
  cache_control?: { type: 'ephemeral' };
};

type AnthropicRequestBody = {
  model: string;
  max_tokens: number;
  messages: AnthropicMessage[];
  system?: string | Array<{ type: 'text'; text: string; cache_control?: { type: 'ephemeral' } }>;
  tools?: AnthropicToolDef[];
  tool_choice?: { type: 'auto' } | { type: 'any' } | { type: 'tool'; name: string };
  temperature?: number;
  top_p?: number;
  stream?: boolean;
  thinking?: { type: 'enabled'; budget_tokens: number } | { type: 'disabled' };
};

type AnthropicContentBlock =
  | { type: 'text'; text: string }
  | { type: 'thinking'; thinking: string; signature?: string }
  | { type: 'redacted_thinking'; data: string }
  | { type: 'tool_use'; id: string; name: string; input: Record<string, unknown> };

type AnthropicUsage = {
  input_tokens: number;
  output_tokens: number;
  cache_creation_input_tokens?: number;
  cache_read_input_tokens?: number;
};

type AnthropicResponse = {
  id: string;
  type: 'message';
  role: 'assistant';
  content: AnthropicContentBlock[];
  model: string;
  stop_reason: string | null;
  stop_sequence: string | null;
  usage: AnthropicUsage;
};

type AnthropicStreamEvent =
  | { type: 'message_start'; message: Partial<AnthropicResponse> }
  | { type: 'content_block_start'; index: number; content_block: AnthropicContentBlock }
  | {
      type: 'content_block_delta';
      index: number;
      delta:
        | { type: 'text_delta'; text: string }
        | { type: 'thinking_delta'; thinking: string }
        | { type: 'signature_delta'; signature: string }
        | { type: 'input_json_delta'; partial_json: string };
    }
  | { type: 'content_block_stop'; index: number }
  | { type: 'message_delta'; delta: { stop_reason: string }; usage?: Partial<AnthropicUsage> }
  | { type: 'message_stop' }
  | { type: 'error'; error: { type: string; message: string } };

export class GenericAnthropicLLM implements LLMPort {
  private readonly opts: GenericAnthropicLLMOptions;
  private readonly apiUrl: string;
  private readonly enablePromptCaching: boolean;
  private readonly providerName: string;
  private readonly modelConfig: ModelConfig;
  private transport: HttpTransport | null = null;

  constructor(baseUrl: string, opts: GenericAnthropicLLMOptions = {}) {
    this.apiUrl = opts.apiUrl || baseUrl;
    this.enablePromptCaching = opts.enablePromptCaching ?? false;
    this.providerName = opts.providerName ?? 'anthropic-compat';
    this.modelConfig = opts.modelConfig ?? true;
    this.opts = opts;
  }

  private createTransport(): HttpTransport {
    const base = new FetchTransport({
      persistFile: this.opts.httpLogFile,
      logLevel: 'INFO',
      enableConsoleLog: false,
      maxFileSize: 5 * 1024 * 1024,
      captureResponseBody: true,
    });

    const headers: Record<string, string> = {
      'anthropic-version': '2023-06-01',
      'x-api-key': this.opts.apiKey || '',
      ...this.opts.customHeaders,
    };

    const authTransport = createTransport(base, this.apiUrl, undefined, undefined, this.opts.version, headers);
    const transport = this.opts.retry ? new RetryTransport(authTransport, this.opts.retry) : authTransport;
    return new LLMErrorTransport(transport);
  }

  private getTransport(): HttpTransport {
    if (!this.transport) {
      this.transport = this.createTransport();
    }
    return this.transport;
  }

  private transformMessages(messages: ChatMessage[]): {
    system?: AnthropicRequestBody['system'];
    messages: AnthropicMessage[];
  } {
    const systemMessages = messages.filter((m) => m.role === 'system');
    const nonSystemMessages = messages.filter((m) => m.role !== 'system');

    let system: AnthropicRequestBody['system'];
    if (systemMessages.length > 0) {
      if (this.enablePromptCaching) {
        system = systemMessages.map((msg, idx) => ({
          type: 'text' as const,
          text: typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content),
          ...(idx < 2 && { cache_control: { type: 'ephemeral' as const } }),
        }));
      } else {
        system = systemMessages
          .map((msg) => (typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content)))
          .join('\n\n');
      }
    }

    const anthropicMessages: AnthropicMessage[] = [];

    for (const msg of nonSystemMessages) {
      if (msg.role === 'tool') {
        const lastMsg = anthropicMessages[anthropicMessages.length - 1];
        if (lastMsg && lastMsg.role === 'user' && Array.isArray(lastMsg.content)) {
          lastMsg.content.push({
            type: 'tool_result',
            tool_use_id: msg.tool_call_id || '',
            content: typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content),
          });
        } else {
          anthropicMessages.push({
            role: 'user',
            content: [
              {
                type: 'tool_result',
                tool_use_id: msg.tool_call_id || '',
                content: typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content),
              },
            ],
          });
        }
        continue;
      }

      if (msg.role === 'assistant') {
        const content: AnthropicContentPart[] = [];

        const thinkingBlocks = (msg as Record<string, unknown>).thinking_blocks as AnthropicContentBlock[] | undefined;
        const reasoning = (msg as Record<string, unknown>).reasoning as string | undefined;

        if (thinkingBlocks && thinkingBlocks.length > 0) {
          for (const block of thinkingBlocks) {
            if (block.type === 'thinking') {
              content.push({
                type: 'thinking',
                thinking: block.thinking,
                ...(block.signature && { signature: block.signature }),
              });
            } else if (block.type === 'redacted_thinking') {
              content.push({ type: 'redacted_thinking', data: block.data });
            }
          }
        } else if (reasoning) {
          content.push({ type: 'thinking', thinking: reasoning });
        }

        if (typeof msg.content === 'string' && msg.content) {
          content.push({ type: 'text', text: msg.content });
        } else if (Array.isArray(msg.content)) {
          for (const part of msg.content) {
            if (part.type === 'text') {
              content.push({ type: 'text', text: part.text });
            }
          }
        }

        if (msg.tool_calls) {
          for (const tc of msg.tool_calls) {
            content.push({
              type: 'tool_use',
              id: tc.id,
              name: tc.function.name,
              input: JSON.parse(tc.function.arguments || '{}'),
            });
          }
        }

        anthropicMessages.push({ role: 'assistant', content: content.length > 0 ? content : '' });
        continue;
      }

      if (msg.role === 'user') {
        const content: AnthropicContentPart[] = [];

        if (typeof msg.content === 'string' && msg.content) {
          content.push({ type: 'text', text: msg.content });
        } else if (Array.isArray(msg.content)) {
          for (const part of msg.content) {
            if (part.type === 'text') {
              content.push({ type: 'text', text: part.text });
            } else if (part.type === 'image_url') {
              const url = part.image_url.url;
              if (url.startsWith('data:')) {
                const match = url.match(/^data:([^;]+);base64,(.+)$/);
                if (match) {
                  content.push({
                    type: 'image',
                    source: { type: 'base64', media_type: match[1], data: match[2] },
                  });
                }
              }
            }
          }
        }

        anthropicMessages.push({ role: 'user', content: content.length > 0 ? content : '' });
      }
    }

    if (this.enablePromptCaching && anthropicMessages.length > 0) {
      const lastTwoIndices =
        anthropicMessages.length >= 2
          ? [anthropicMessages.length - 2, anthropicMessages.length - 1]
          : [anthropicMessages.length - 1];

      for (const idx of lastTwoIndices) {
        const msg = anthropicMessages[idx];
        if (msg && Array.isArray(msg.content) && msg.content.length > 0) {
          const lastPart = msg.content[msg.content.length - 1];
          if (lastPart && lastPart.type === 'text') {
            lastPart.cache_control = { type: 'ephemeral' };
          }
        }
      }
    }

    return { system, messages: anthropicMessages };
  }

  private transformTools(tools?: CompletionParams['tools']): AnthropicToolDef[] | undefined {
    if (!tools || tools.length === 0) return undefined;

    return tools.map((tool, idx) => ({
      name: tool.function.name,
      description: tool.function.description,
      input_schema: tool.function.parameters as Record<string, unknown>,
      ...(this.enablePromptCaching && idx < 2 && { cache_control: { type: 'ephemeral' as const } }),
    }));
  }

  private transformToolChoice(toolChoice?: CompletionParams['tool_choice']): AnthropicRequestBody['tool_choice'] {
    if (!toolChoice || toolChoice === 'auto') return { type: 'auto' };
    if (toolChoice === 'none') return undefined;
    if (typeof toolChoice === 'object' && toolChoice.type === 'function') {
      return { type: 'tool', name: toolChoice.function.name };
    }
    return { type: 'auto' };
  }

  private transformUsage(rawUsage: AnthropicUsage): UsageData {
    const inputTokens = rawUsage.input_tokens ?? 0;
    const outputTokens = rawUsage.output_tokens ?? 0;
    const cacheCreation = rawUsage.cache_creation_input_tokens ?? 0;
    const cacheRead = rawUsage.cache_read_input_tokens ?? 0;
    const cachedTokens = cacheCreation + cacheRead;

    // Per Anthropic docs: Total input tokens = input_tokens + cache_creation_input_tokens + cache_read_input_tokens
    const promptTokens = inputTokens + cachedTokens;
    const totalTokens = promptTokens + outputTokens;

    return {
      prompt_tokens: promptTokens,
      completion_tokens: outputTokens,
      total_tokens: totalTokens,
      prompt_tokens_details: {
        cached_tokens: cachedTokens,
      },
      ...(cacheCreation > 0 && { cache_creation_input_tokens: cacheCreation }),
      ...(cacheRead > 0 && { cache_read_input_tokens: cacheRead }),
    };
  }

  private transformResponse(response: AnthropicResponse): CompletionResult {
    let content = '';
    let reasoning = '';
    const toolCalls: ToolCall[] = [];
    const thinkingBlocks: AnthropicContentBlock[] = [];

    for (const block of response.content) {
      if (block.type === 'text') {
        content += block.text;
      } else if (block.type === 'thinking') {
        reasoning += block.thinking;
        thinkingBlocks.push(block);
      } else if (block.type === 'redacted_thinking') {
        thinkingBlocks.push(block);
      } else if (block.type === 'tool_use') {
        toolCalls.push({
          id: block.id,
          type: 'function',
          function: {
            name: block.name,
            arguments: JSON.stringify(block.input),
          },
        });
      }
    }

    return {
      content,
      ...(reasoning && { reasoning }),
      ...(thinkingBlocks.length > 0 && { thinking_blocks: thinkingBlocks }),
      ...(toolCalls.length > 0 && { tool_calls: toolCalls }),
      usage: this.transformUsage(response.usage),
    };
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
    const { system, messages } = this.transformMessages(params.messages);
    const tools = this.transformTools(params.tools);

    const body: AnthropicRequestBody = {
      model: params.model,
      max_tokens: params.maxTokens ?? 32000,
      messages,
      ...(system && { system }),
      ...(tools && { tools }),
      ...(tools && { tool_choice: this.transformToolChoice(params.tool_choice) }),
      ...(params.temperature !== undefined && { temperature: params.temperature }),
      ...(params.topP !== undefined && { top_p: params.topP }),
      ...(params.thinking && {
        thinking:
          params.thinking.type === 'enabled'
            ? { type: 'enabled' as const, budget_tokens: params.thinking.budget_tokens }
            : { type: 'disabled' as const },
      }),
    };

    const res = await this.getTransport().post('/messages', body, undefined, signal);

    if (!res.ok) {
      const text = await res.text();
      this.throwResponseError(res.status, text || `Anthropic API error ${res.status}`);
    }

    const data: AnthropicResponse = await res.json();
    return this.transformResponse(data);
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
    const { system, messages } = this.transformMessages(params.messages);
    const tools = this.transformTools(params.tools);

    const body: AnthropicRequestBody = {
      model: params.model,
      max_tokens: params.maxTokens ?? 32000,
      messages,
      stream: true,
      ...(system && { system }),
      ...(tools && { tools }),
      ...(tools && { tool_choice: this.transformToolChoice(params.tool_choice) }),
      ...(params.temperature !== undefined && { temperature: params.temperature }),
      ...(params.topP !== undefined && { top_p: params.topP }),
      ...(params.thinking && {
        thinking:
          params.thinking.type === 'enabled'
            ? { type: 'enabled' as const, budget_tokens: params.thinking.budget_tokens }
            : { type: 'disabled' as const },
      }),
    };

    const res = await this.getTransport().post('/messages', body, { Accept: 'text/event-stream' }, signal);

    if (!res.ok) {
      const text = await res.text();
      this.throwResponseError(res.status, text || `Anthropic API error ${res.status}`);
    }

    const reader = res.body?.getReader();
    if (!reader) return { content: '' };

    const decoder = new TextDecoder('utf-8');
    let buffer = '';
    let content = '';
    let reasoning = '';
    const toolCalls: ToolCall[] = [];
    const toolCallArgs: Map<number, string> = new Map();
    const thinkingBlocksMap: Map<
      number,
      { type: 'thinking'; thinking: string; signature?: string } | { type: 'redacted_thinking'; data: string }
    > = new Map();
    let usage: UsageData | undefined;
    let stopReason: string | undefined;

    const processEvent = async (eventData: string) => {
      const lines = eventData.split('\n');
      let data = '';

      for (const line of lines) {
        if (line.startsWith('data:')) {
          data = line.slice(5).trim();
        }
      }

      if (!data || data === '[DONE]') return;

      try {
        const evt: AnthropicStreamEvent = JSON.parse(data);

        switch (evt.type) {
          case 'message_start':
            if (evt.message?.usage) {
              usage = this.transformUsage(evt.message.usage as AnthropicUsage);
            }
            break;

          case 'content_block_start':
            if (evt.content_block.type === 'tool_use') {
              const tc: ToolCall = {
                id: evt.content_block.id,
                type: 'function',
                function: {
                  name: evt.content_block.name,
                  arguments: '',
                },
              };
              toolCalls.push(tc);
              toolCallArgs.set(evt.index, '');
              await handlers.onToolCallDelta?.(tc);
            } else if (evt.content_block.type === 'thinking') {
              thinkingBlocksMap.set(evt.index, { type: 'thinking', thinking: '' });
            } else if (evt.content_block.type === 'redacted_thinking') {
              thinkingBlocksMap.set(evt.index, { type: 'redacted_thinking', data: evt.content_block.data });
            }
            break;

          case 'content_block_delta':
            if (evt.delta.type === 'text_delta') {
              content += evt.delta.text;
              await handlers.onChunk?.(evt.delta.text);
            } else if (evt.delta.type === 'thinking_delta') {
              reasoning += evt.delta.thinking;
              await handlers.onReasoningChunk?.(evt.delta.thinking);
              const block = thinkingBlocksMap.get(evt.index);
              if (block && block.type === 'thinking') {
                block.thinking += evt.delta.thinking;
              }
            } else if (evt.delta.type === 'signature_delta') {
              const block = thinkingBlocksMap.get(evt.index);
              if (block && block.type === 'thinking') {
                block.signature = evt.delta.signature;
              }
            } else if (evt.delta.type === 'input_json_delta') {
              const currentArgs = toolCallArgs.get(evt.index) ?? '';
              const newArgs = currentArgs + evt.delta.partial_json;
              toolCallArgs.set(evt.index, newArgs);

              const tcIndex = toolCalls.length - 1;
              if (tcIndex >= 0 && toolCalls[tcIndex]) {
                toolCalls[tcIndex].function.arguments = newArgs;
                await handlers.onToolCallDelta?.(toolCalls[tcIndex]);
              }
            }
            break;

          case 'message_delta':
            if (evt.delta.stop_reason) {
              stopReason = evt.delta.stop_reason;
            }
            if (evt.usage) {
              const partialUsage = evt.usage as Partial<AnthropicUsage>;
              
              // If message_delta contains input_tokens, it has cumulative usage - recalculate everything
              if (partialUsage.input_tokens !== undefined) {
                const inputTokens = partialUsage.input_tokens;
                const outputTokens = partialUsage.output_tokens ?? 0;
                const cacheCreation = partialUsage.cache_creation_input_tokens ?? 0;
                const cacheRead = partialUsage.cache_read_input_tokens ?? 0;
                const cachedTokens = cacheCreation + cacheRead;
                
                // Calculate prompt_tokens as input_tokens + cached tokens (per Anthropic docs)
                const promptTokens = inputTokens + cachedTokens;
                const totalTokens = promptTokens + outputTokens;
                
                usage = {
                  prompt_tokens: promptTokens,
                  completion_tokens: outputTokens,
                  total_tokens: totalTokens,
                  prompt_tokens_details: {
                    cached_tokens: cachedTokens,
                  },
                  ...(cacheCreation > 0 && { cache_creation_input_tokens: cacheCreation }),
                  ...(cacheRead > 0 && { cache_read_input_tokens: cacheRead }),
                };
              } else if (usage) {
                // Only output_tokens updated - preserve prompt_tokens from message_start
                usage.completion_tokens = partialUsage.output_tokens ?? usage.completion_tokens;
                usage.total_tokens = (usage.prompt_tokens ?? 0) + (usage.completion_tokens ?? 0);
              }
            }
            break;

          case 'message_stop':
            await handlers.onStreamFinish?.(stopReason, usage);
            break;

          case 'error':
            throw new LLMError(evt.error.message, undefined, false);
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

    const thinkingBlocks = Array.from(thinkingBlocksMap.values());

    return {
      content,
      ...(reasoning && { reasoning }),
      ...(thinkingBlocks.length > 0 && { thinking_blocks: thinkingBlocks }),
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
