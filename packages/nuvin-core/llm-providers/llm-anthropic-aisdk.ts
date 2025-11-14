import type { CompletionParams, CompletionResult, ToolCall, UsageData } from '../ports.js';
import { createAnthropic } from '@ai-sdk/anthropic';
import {
  streamText,
  generateText,
  jsonSchema,
  APICallError,
  type CoreMessage,
  type TextPart,
  type ImagePart,
  type ToolCallPart,
  type FilePart,
} from 'ai';
import { LLMError } from './base-llm.js';

const CLIENT_ID = '9d1c250a-e61b-44d9-88ed-5944d1962f5e';

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
  onTokenUpdate?: (newCredentials: { access: string; refresh: string; expires: number }) => void;
};

interface TokenRefreshResult {
  type: 'success' | 'failed';
  access?: string;
  refresh?: string;
  expires?: number;
}

export class AnthropicAISDKLLM {
  private readonly opts: AnthropicAISDKOptions;
  private provider?: ReturnType<typeof createAnthropic>;
  private refreshPromise: Promise<TokenRefreshResult> | null = null;

  constructor(opts: AnthropicAISDKOptions = {}) {
    this.opts = opts;
  }

  private async refreshAccessToken(): Promise<TokenRefreshResult> {
    if (!this.opts.oauth) {
      return { type: 'failed' };
    }

    try {
      const response = await fetch('https://console.anthropic.com/v1/oauth/token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          grant_type: 'refresh_token',
          refresh_token: this.opts.oauth.refresh,
          client_id: CLIENT_ID,
        }),
      });

      if (!response.ok) {
        return { type: 'failed' };
      }

      const json = await response.json();
      return {
        type: 'success',
        access: json.access_token,
        refresh: json.refresh_token,
        expires: Date.now() + json.expires_in * 1000,
      };
    } catch (_error) {
      return { type: 'failed' };
    }
  }

  private updateCredentials(result: TokenRefreshResult): void {
    if (result.type === 'success' && result.access && result.refresh && result.expires) {
      if (this.opts.oauth) {
        this.opts.oauth.access = result.access;
        this.opts.oauth.refresh = result.refresh;
        this.opts.oauth.expires = result.expires;
      }

      this.opts.onTokenUpdate?.({
        access: result.access,
        refresh: result.refresh,
        expires: result.expires,
      });
    }
  }

  private async ensureValidToken(): Promise<void> {
    if (!this.opts.oauth) return;

    if (this.refreshPromise) {
      const result = await this.refreshPromise;
      if (result.type === 'failed') {
        throw new Error('Token refresh failed');
      }
      return;
    }

    this.refreshPromise = this.refreshAccessToken();
    try {
      const result = await this.refreshPromise;
      if (result.type === 'success') {
        this.updateCredentials(result);
        this.provider = undefined;
      } else {
        throw new Error('Token refresh failed');
      }
    } finally {
      this.refreshPromise = null;
    }
  }

  private createFetchWithRetry(): typeof fetch {
    return async (url: string | URL | Request, init?: RequestInit) => {
      if (init?.headers && this.opts.oauth) {
        const headers = new Headers(init.headers);
        headers.delete('x-api-key');
        headers.set('authorization', `Bearer ${this.opts.oauth.access}`);
        headers.set('user-agent', 'ai-sdk/anthropic/2.0.30 ai-sdk/provider-utils/3.0.12');
        init = { ...init, headers };
      }

      const response = await fetch(url, init);

      if ((response.status === 401 || response.status === 403) && this.opts.oauth) {
        await this.ensureValidToken();

        if (init?.headers) {
          const headers = new Headers(init.headers);
          headers.set('authorization', `Bearer ${this.opts.oauth.access}`);
          init = { ...init, headers };
        }

        return fetch(url, init);
      }

      return response;
    };
  }

  private async getProvider(): Promise<ReturnType<typeof createAnthropic>> {
    if (this.provider) {
      return this.provider;
    }

    if (this.opts.oauth) {
      this.provider = createAnthropic({
        apiKey: 'sk-ant-oauth-placeholder',
        baseURL: this.opts.baseURL || this.opts.apiUrl,
        headers: {
          authorization: `Bearer ${this.opts.oauth.access}`,
          'anthropic-beta':
            'oauth-2025-04-20,claude-code-20250219,interleaved-thinking-2025-05-14,fine-grained-tool-streaming-2025-05-14',
        },
        fetch: this.createFetchWithRetry(),
      });
    } else {
      this.provider = createAnthropic({
        apiKey: this.opts.apiKey,
        baseURL: this.opts.baseURL || this.opts.apiUrl,
      });
    }

    return this.provider;
  }

  private async getModel(modelName: string) {
    const provider = await this.getProvider();
    return provider(modelName);
  }

  private transformMessages(messages: CompletionParams['messages']): CoreMessage[] {
    const transformed: CoreMessage[] = [];

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

    const nonSystemMessages: CoreMessage[] = messages
      .filter((msg) => msg.role !== 'system')
      .map((msg): CoreMessage => {
        if (msg.role === 'tool') {
          return {
            role: 'tool' as const,
            content: [
              {
                type: 'tool-result' as const,
                toolCallId: msg.tool_call_id || '',
                toolName: msg.name || '',
                output: {
                  type: 'text' as const,
                  value: typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content),
                },
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
                input: JSON.parse(toolCall.function.arguments || '{}'),
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

  private handleError(error: unknown): never {
    if (error instanceof LLMError) {
      throw error;
    }

    if (APICallError.isInstance(error)) {
      const statusCode = error.statusCode;
      const message = error.message || 'API call failed';

      if (statusCode === 429) {
        throw new LLMError('Rate limit exceeded. Please try again later.', statusCode, true, error);
      } else if (statusCode === 401 || statusCode === 403) {
        throw new LLMError('Authentication failed. Please check your API key.', statusCode, false, error);
      } else if (statusCode === 400) {
        throw new LLMError(`Invalid request: ${message}`, statusCode, false, error);
      } else if (statusCode && statusCode >= 500) {
        throw new LLMError('Service temporarily unavailable. Please try again later.', statusCode, true, error);
      }

      throw new LLMError(message, statusCode, error.isRetryable, error);
    }

    if (error && typeof error === 'object' && 'statusCode' in error && 'message' in error) {
      const statusCode = typeof error.statusCode === 'number' ? error.statusCode : undefined;
      const message = typeof error.message === 'string' ? error.message : 'Unknown error';
      const isRetryable = 'isRetryable' in error && typeof error.isRetryable === 'boolean' ? error.isRetryable : false;

      if (statusCode === 429) {
        throw new LLMError('Rate limit exceeded. Please try again later.', statusCode, true, error);
      } else if (statusCode === 401 || statusCode === 403) {
        throw new LLMError('Authentication failed. Please check your API key.', statusCode, false, error);
      } else if (statusCode === 400) {
        throw new LLMError(`Invalid request: ${message}`, statusCode, false, error);
      } else if (statusCode && statusCode >= 500) {
        throw new LLMError('Service temporarily unavailable. Please try again later.', statusCode, true, error);
      }

      throw new LLMError(message, statusCode, isRetryable, error);
    }

    if (error instanceof Error) {
      if (error.name === 'AbortError') {
        throw new LLMError('Request was cancelled', undefined, false, error);
      }

      if (error.message.includes('rate limit')) {
        throw new LLMError('Rate limit exceeded. Please try again later.', 429, true, error);
      }

      throw new LLMError(error.message, undefined, false, error);
    }

    throw new LLMError('An unknown error occurred', undefined, false, error);
  }

  async generateCompletion(params: CompletionParams, signal?: AbortSignal): Promise<CompletionResult> {
    try {
      const model = await this.getModel(params.model);
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

      const rawUsage = result.usage;
      const usage: UsageData = rawUsage
        ? {
            prompt_tokens: rawUsage.inputTokens || 0,
            completion_tokens: rawUsage.outputTokens || 0,
            total_tokens: rawUsage.totalTokens || 0,
            prompt_tokens_details: {
              cached_tokens: rawUsage.cachedInputTokens || 0,
            },
          }
        : {
            prompt_tokens: 0,
            completion_tokens: 0,
            total_tokens: 0,
          };

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
      onChunk?: (delta: string, usage?: UsageData) => void;
      onToolCallDelta?: (tc: ToolCall) => void;
      onStreamFinish?: (finishReason?: string, usage?: UsageData) => void;
    } = {},
    signal?: AbortSignal,
  ): Promise<CompletionResult> {
    let streamError: unknown = null;

    const model = await this.getModel(params.model);
    const messages = this.transformMessages(params.messages);
    const tools = this.transformTools(params.tools);
    const toolChoice = tools ? this.transformToolChoice(params.tool_choice) : undefined;

    const result = streamText({
      model,
      messages,
      tools,
      toolChoice,
      maxOutputTokens: params.maxTokens ?? 10240,
      temperature: params.temperature,
      abortSignal: signal,
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
        handlers.onChunk?.(chunk);
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

      const rawUsage = await result.usage;
      const usage: UsageData = rawUsage
        ? {
            prompt_tokens: rawUsage.inputTokens || 0,
            completion_tokens: rawUsage.outputTokens || 0,
            total_tokens: rawUsage.totalTokens || 0,
            prompt_tokens_details: {
              cached_tokens: rawUsage.cachedInputTokens || 0,
            },
          }
        : {
            prompt_tokens: 0,
            completion_tokens: 0,
            total_tokens: 0,
          };

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
}
