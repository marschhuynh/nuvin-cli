import type { CompletionParams, CompletionResult, ToolCall, UsageData, ProviderContentPart } from '../ports.js';
import { createAnthropic } from '@ai-sdk/anthropic';
import {
  streamText,
  generateText,
  jsonSchema,
  APICallError,
  type ModelMessage,
  type TextPart,
  type ImagePart,
  type ToolCallPart,
  type FilePart,
} from 'ai';
import { LLMError } from './base-llm.js';
import { safeParseToolArguments } from '../tools/tool-call-parser.js';
import { normalizeModelInfo, deduplicateModels, type ModelInfo } from './model-limits.js';
import {
  FetchTransport,
  AnthropicAuthTransport,
  LLMErrorTransport,
  type HttpTransport,
  type RetryConfig,
  isRetryableStatusCode,
  isRetryableError,
  DEFAULT_RETRYABLE_STATUS_CODES,
} from '../transports/index.js';

type AnthropicAISDKOptions = {
  apiKey?: string;
  oauth?: {
    type: 'oauth';
    access: string;
    refresh: string;
    expires: number;
  };
  apiUrl?: string;
  baseURL?: string;
  httpLogFile?: string;
  retry?: Partial<RetryConfig>;
  onTokenUpdate?: (newCredentials: { access: string; refresh: string; expires: number }) => void;
};

/**
 * Converts ChatMessage content to AI SDK tool result output format.
 *
 * When content contains ProviderContentPart[] with image_url parts,
 * uses the AI SDK 'content' output type with 'media' parts for images.
 * Falls back to a simple 'text' output for string content.
 *
 * @see LanguageModelV2ToolResultOutput from @ai-sdk/provider
 */
export function buildAISDKToolResultOutput(
  content: string | null | ProviderContentPart[],
): { type: 'text'; value: string } | { type: 'content'; value: Array<{ type: 'text'; text: string } | { type: 'media'; data: string; mediaType: string }> } {
  if (typeof content === 'string') {
    return { type: 'text' as const, value: content };
  }

  if (Array.isArray(content)) {
    const parts = content as ProviderContentPart[];
    const hasImages = parts.some((p) => p.type === 'image_url');

    if (hasImages) {
      const contentParts: Array<{ type: 'text'; text: string } | { type: 'media'; data: string; mediaType: string }> = [];

      for (const part of parts) {
        if (part.type === 'text') {
          contentParts.push({ type: 'text', text: part.text });
        } else if (part.type === 'image_url') {
          const match = part.image_url.url.match(/^data:([^;]+);base64,(.+)$/);
          if (match) {
            contentParts.push({ type: 'media', data: match[2]!, mediaType: match[1]! });
          }
        }
      }

      if (contentParts.length > 0) {
        return { type: 'content' as const, value: contentParts };
      }
    }

    return { type: 'text' as const, value: JSON.stringify(content) };
  }

  return { type: 'text' as const, value: JSON.stringify(content) };
}

export class AnthropicAISDKLLM {
  private readonly opts: AnthropicAISDKOptions;
  private provider?: ReturnType<typeof createAnthropic>;
  private transport?: HttpTransport;
  private authTransport?: AnthropicAuthTransport;

  constructor(opts: AnthropicAISDKOptions = {}) {
    this.opts = opts;
  }

  private getAuthTransport(): AnthropicAuthTransport {
    if (!this.authTransport) {
      const base = new FetchTransport({
        persistFile: this.opts.httpLogFile,
        logLevel: 'INFO',
        enableConsoleLog: false,
        maxFileSize: 5 * 1024 * 1024,
        captureResponseBody: true,
      });

      this.authTransport = new AnthropicAuthTransport(base, {
        apiKey: this.opts.apiKey,
        oauth: this.opts.oauth
          ? {
              access: this.opts.oauth.access,
              refresh: this.opts.oauth.refresh,
              expires: this.opts.oauth.expires,
            }
          : undefined,
        baseUrl: this.opts.baseURL || this.opts.apiUrl,
        retry: this.opts.retry,
        onTokenUpdate: this.opts.onTokenUpdate,
      });
    }

    // return new RetryTransport(authTransport, this.retryConfig);
    return this.authTransport;
  }

  private getTransport(): HttpTransport {
    if (!this.transport) {
      this.transport = new LLMErrorTransport(this.getAuthTransport().createRetryTransport());
    }
    return this.transport;
  }

  private getProvider(): ReturnType<typeof createAnthropic> {
    if (this.provider) {
      return this.provider;
    }

    const authTransport = this.getAuthTransport();

    if (this.opts.oauth) {
      this.provider = createAnthropic({
        apiKey: 'sk-ant-oauth-placeholder',
        baseURL: authTransport.getBaseUrl(),
        headers: {
          authorization: `Bearer ${this.opts.oauth.access}`,
          'anthropic-beta':
            'oauth-2025-04-20,claude-code-20250219,interleaved-thinking-2025-05-14,fine-grained-tool-streaming-2025-05-14',
        },
        fetch: authTransport.createFetchFunction(),
      });
    } else {
      this.provider = createAnthropic({
        apiKey: this.opts.apiKey,
        baseURL: authTransport.getBaseUrl(),
        fetch: authTransport.createFetchFunction(),
      });
    }

    return this.provider;
  }

  private getModel(modelName: string) {
    const provider = this.getProvider();
    return provider(modelName);
  }

  private transformMessages(messages: CompletionParams['messages']): ModelMessage[] {
    const transformed: ModelMessage[] = [];

    const systemMessages = messages.filter((msg) => msg.role === 'system');
    if (systemMessages.length > 0) {
      transformed.push({
        role: 'system' as const,
        content: "You are Claude Code, Anthropic's official CLI for Claude.",
        providerOptions: {
          anthropic: { cacheControl: { type: 'ephemeral' } },
        },
      });

      let systemIndex = 0;
      for (const msg of systemMessages) {
        const shouldCache = systemIndex < 2;
        if (typeof msg.content === 'string') {
          transformed.push({
            role: 'system' as const,
            content: msg.content,
            ...(shouldCache && {
              providerOptions: {
                anthropic: { cacheControl: { type: 'ephemeral' } },
              },
            }),
          });
        } else if (Array.isArray(msg.content)) {
          for (const part of msg.content) {
            if (part.type === 'text') {
              transformed.push({
                role: 'system' as const,
                content: part.text,
                ...(shouldCache && {
                  providerOptions: {
                    anthropic: { cacheControl: { type: 'ephemeral' } },
                  },
                }),
              });
            }
          }
        }
        systemIndex++;
      }
    }

    const nonSystemMessages: ModelMessage[] = messages
      .filter((msg) => msg.role !== 'system')
      .map((msg): ModelMessage => {
        if (msg.role === 'tool') {
          const output = buildAISDKToolResultOutput(msg.content);

          return {
            role: 'tool' as const,
            content: [
              {
                type: 'tool-result' as const,
                toolCallId: msg.tool_call_id || '',
                toolName: msg.name || '',
                output,
              },
            ],
          };
        }

        if (msg.role === 'assistant') {
          const assistantContent: Array<TextPart | FilePart | ToolCallPart> = [];

          if (typeof msg.content === 'string' && msg.content) {
            assistantContent.push({ type: 'text', text: msg.content });
          } else if (Array.isArray(msg.content)) {
            for (const part of msg.content) {
              if (part.type === 'text') {
                assistantContent.push({ type: 'text', text: part.text });
              }
            }
          }

          if (msg.tool_calls) {
            for (const toolCall of msg.tool_calls) {
              assistantContent.push({
                type: 'tool-call',
                toolCallId: toolCall.id,
                toolName: toolCall.function.name,
                input: safeParseToolArguments(toolCall.function.arguments),
              });
            }
          }

          return {
            role: 'assistant' as const,
            content: assistantContent,
          };
        } else {
          const userContent: Array<TextPart | ImagePart | FilePart> = [];

          if (typeof msg.content === 'string' && msg.content) {
            userContent.push({ type: 'text', text: msg.content });
          } else if (Array.isArray(msg.content)) {
            for (const part of msg.content) {
              if (part.type === 'text') {
                userContent.push({ type: 'text', text: part.text });
              } else if (part.type === 'image_url') {
                userContent.push({ type: 'image', image: part.image_url.url });
              }
            }
          }

          return {
            role: 'user' as const,
            content: userContent,
          };
        }
      });

    let allMessages = [...transformed, ...nonSystemMessages];

    // Filter out messages with empty content, except for the final assistant message
    // Anthropic allows empty content only for the final assistant message
    allMessages = allMessages.filter((msg, idx) => {
      const isLastMessage = idx === allMessages.length - 1;
      const isAssistant = msg.role === 'assistant';
      const hasEmptyContent = !msg.content || (Array.isArray(msg.content) && msg.content.length === 0);

      // Keep the message if:
      // - It has non-empty content, OR
      // - It's the last message AND it's an assistant message (Anthropic allows this)
      return !hasEmptyContent || (isLastMessage && isAssistant);
    });

    const userAssistantMessages = allMessages.filter((msg) => msg.role === 'user' || msg.role === 'assistant');
    const lastTwoIndices: number[] = [];
    if (userAssistantMessages.length >= 2) {
      const lastMsg = userAssistantMessages[userAssistantMessages.length - 1];
      const secondLastMsg = userAssistantMessages[userAssistantMessages.length - 2];
      if (lastMsg) {
        const lastIdx = allMessages.indexOf(lastMsg);
        if (lastIdx !== -1) lastTwoIndices.push(lastIdx);
      }
      if (secondLastMsg) {
        const secondLastIdx = allMessages.indexOf(secondLastMsg);
        if (secondLastIdx !== -1) lastTwoIndices.push(secondLastIdx);
      }
    } else if (userAssistantMessages.length === 1) {
      const lastMsg = userAssistantMessages[0];
      if (lastMsg) {
        const lastIdx = allMessages.indexOf(lastMsg);
        if (lastIdx !== -1) lastTwoIndices.push(lastIdx);
      }
    }

    for (const idx of lastTwoIndices) {
      allMessages[idx] = {
        ...allMessages[idx],
        providerOptions: {
          anthropic: { cacheControl: { type: 'ephemeral' } },
        },
      };
    }

    return allMessages;
  }

  private transformTools(tools?: CompletionParams['tools']) {
    if (!tools || tools.length === 0) return undefined;

    const result: Record<
      string,
      {
        description: string;
        inputSchema: ReturnType<typeof jsonSchema>;
      }
    > = {};
    for (const tool of tools) {
      result[tool.function.name] = {
        description: tool.function.description,
        inputSchema: jsonSchema(tool.function.parameters),
      };
    }
    return result;
  }

  private transformToolChoice(toolChoice?: CompletionParams['tool_choice']) {
    if (!toolChoice || toolChoice === 'auto') {
      return 'auto' as const;
    }
    if (toolChoice === 'none') {
      return 'none' as const;
    }
    if (typeof toolChoice === 'object' && toolChoice.type === 'function') {
      return { type: 'tool' as const, toolName: toolChoice.function.name };
    }
    return 'auto' as const;
  }

  private transformUsage(rawUsage: {
    // AI SDK format (camelCase)
    inputTokens?: number;
    outputTokens?: number;
    cachedInputTokens?: number;
    cacheCreationInputTokens?: number;
    cacheReadInputTokens?: number;
    // Raw Anthropic API format (snake_case)
    input_tokens?: number;
    output_tokens?: number;
    cache_creation_input_tokens?: number;
    cache_read_input_tokens?: number;
  }): UsageData {
    if (!rawUsage) {
      return { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 };
    }

    const inputTokens = rawUsage.inputTokens ?? rawUsage.input_tokens ?? 0;
    const outputTokens = rawUsage.outputTokens ?? rawUsage.output_tokens ?? 0;
    const cacheCreation = rawUsage.cacheCreationInputTokens ?? rawUsage.cache_creation_input_tokens ?? 0;
    const cacheRead = rawUsage.cacheReadInputTokens ?? rawUsage.cache_read_input_tokens ?? 0;
    const cachedTokens = rawUsage.cachedInputTokens ?? cacheCreation + cacheRead;

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

  private handleError(error: unknown): never {
    if (error instanceof LLMError) {
      throw error;
    }

    if (APICallError.isInstance(error)) {
      const statusCode = error.statusCode;
      const message = error.message || 'API call failed';

      if (statusCode === 429 || statusCode === 408) {
        throw new LLMError('Rate limit exceeded. Please try again later.', statusCode, true, error);
      } else if (statusCode === 401 || statusCode === 403) {
        throw new LLMError('Authentication failed. Please check your API key.', statusCode, false, error);
      } else if (statusCode === 400) {
        throw new LLMError(`Invalid request: ${message}`, statusCode, false, error);
      } else if (statusCode && isRetryableStatusCode(statusCode, DEFAULT_RETRYABLE_STATUS_CODES)) {
        throw new LLMError('Service temporarily unavailable. Please try again later.', statusCode, true, error);
      }

      throw new LLMError(
        message,
        statusCode,
        error.isRetryable ?? isRetryableError(error, DEFAULT_RETRYABLE_STATUS_CODES),
        error,
      );
    }

    if (error && typeof error === 'object' && 'statusCode' in error && 'message' in error) {
      const statusCode = typeof error.statusCode === 'number' ? error.statusCode : undefined;
      const message = typeof error.message === 'string' ? error.message : 'Unknown error';

      if (statusCode === 429 || statusCode === 408) {
        throw new LLMError('Rate limit exceeded. Please try again later.', statusCode, true, error);
      } else if (statusCode === 401 || statusCode === 403) {
        throw new LLMError('Authentication failed. Please check your API key.', statusCode, false, error);
      } else if (statusCode === 400) {
        throw new LLMError(`Invalid request: ${message}`, statusCode, false, error);
      } else if (statusCode && isRetryableStatusCode(statusCode, DEFAULT_RETRYABLE_STATUS_CODES)) {
        throw new LLMError('Service temporarily unavailable. Please try again later.', statusCode, true, error);
      }

      throw new LLMError(message, statusCode, isRetryableError(error, DEFAULT_RETRYABLE_STATUS_CODES), error);
    }

    if (error instanceof Error) {
      if (error.name === 'AbortError') {
        throw new LLMError('Request was cancelled', undefined, false, error);
      }

      if (error.message.includes('rate limit')) {
        throw new LLMError('Rate limit exceeded. Please try again later.', 429, true, error);
      }

      const isNetworkRetryable = isRetryableError(error, DEFAULT_RETRYABLE_STATUS_CODES);
      if (isNetworkRetryable) {
        throw new LLMError('Network error occurred. Please try again.', undefined, true, error);
      }

      throw new LLMError(error.message, undefined, false, error);
    }

    throw new LLMError('An unknown error occurred', undefined, false, error);
  }

  async generateCompletion(params: CompletionParams, signal?: AbortSignal): Promise<CompletionResult> {
    try {
      const model = this.getModel(params.model);
      const messages = this.transformMessages(params.messages);
      const tools = this.transformTools(params.tools);
      const toolChoice = tools ? this.transformToolChoice(params.tool_choice) : undefined;

      const result = await generateText({
        model,
        messages,
        tools,
        toolChoice,
        maxOutputTokens: params.maxTokens ?? 10240,
        temperature: params.temperature,
        abortSignal: signal,
        ...(params.thinking && {
          thinking:
            params.thinking.type === 'enabled'
              ? { type: 'enabled' as const, budgetTokens: params.thinking.budget_tokens }
              : { type: 'disabled' as const },
        }),
      });

      const tool_calls: ToolCall[] | undefined =
        result.toolCalls && result.toolCalls.length > 0
          ? result.toolCalls.map((tc) => ({
              id: tc.toolCallId,
              type: 'function' as const,
              function: {
                name: tc.toolName,
                arguments: JSON.stringify(tc.input),
              },
            }))
          : undefined;

      const rawUsage = result.usage as typeof result.usage & {
        cacheCreationInputTokens?: number;
        cacheReadInputTokens?: number;
      };
      const usage = this.transformUsage(rawUsage);

      return {
        content: result.text,
        ...(tool_calls && { tool_calls }),
        usage,
      };
    } catch (error) {
      this.handleError(error);
    }
  }

  async streamCompletion(
    params: CompletionParams,
    handlers: {
      onChunk?: (delta: string, usage?: UsageData) => Promise<void>;
      onToolCallDelta?: (tc: ToolCall) => Promise<void>;
      onStreamFinish?: (finishReason?: string, usage?: UsageData) => Promise<void>;
      onUsage?: (usage: UsageData) => Promise<void>;
    } = {},
    signal?: AbortSignal,
  ): Promise<CompletionResult> {
    let streamError: unknown = null;

    const model = this.getModel(params.model);
    const messages = this.transformMessages(params.messages);
    const tools = this.transformTools(params.tools);
    const toolChoice = tools ? this.transformToolChoice(params.tool_choice) : undefined;

    const result = streamText({
      model,
      messages,
      tools,
      toolChoice,
      maxOutputTokens: params.maxTokens,
      temperature: params.temperature,
      abortSignal: signal,
      maxRetries: 10,
      ...(params.thinking && {
        thinking:
          params.thinking.type === 'enabled'
            ? { type: 'enabled' as const, budgetTokens: params.thinking.budget_tokens }
            : { type: 'disabled' as const },
      }),
      onError: (event) => {
        streamError = event.error;
      },
      onAbort: () => {
        streamError = new LLMError('Request was cancelled', undefined, false);
      },
    });

    try {
      let content = '';

      for await (const chunk of result.textStream) {
        content += chunk;
        await handlers.onChunk?.(chunk);
      }

      if (streamError) {
        throw streamError;
      }

      const tool_calls: ToolCall[] | undefined =
        result.toolCalls && (await result.toolCalls).length > 0
          ? (await result.toolCalls).map((tc) => ({
              id: tc.toolCallId,
              type: 'function' as const,
              function: {
                name: tc.toolName,
                arguments: JSON.stringify(tc.input),
              },
            }))
          : undefined;

      const rawUsage = (await result.usage) as Awaited<typeof result.usage> & {
        cacheCreationInputTokens?: number;
        cacheReadInputTokens?: number;
      };
      const usage = this.transformUsage(rawUsage);

      const finishReason = await result.finishReason;
      await handlers.onStreamFinish?.(finishReason, usage);

      return {
        content,
        ...(tool_calls && { tool_calls }),
        usage,
      };
    } catch (error) {
      this.handleError(error);
    }
  }

  async getModels(signal?: AbortSignal): Promise<ModelInfo[]> {
    const authTransport = this.getAuthTransport();

    if (!authTransport.getApiKey() && !authTransport.getOAuth()) {
      throw new LLMError('No API key or OAuth credentials provided', 401, false);
    }

    const res = await this.getTransport().get('/models', undefined, signal);
    const data = (await res.json()) as { data: Record<string, unknown>[] };
    const models = data.data.map((model) => normalizeModelInfo('anthropic', model));
    return deduplicateModels(models);
  }
}
