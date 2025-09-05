import type { ProviderConfig, AgentSettings, Message } from '@/types';
import type { ToolContext } from '@/types/tools';

import { createProvider, type ToolCall, type ChatMessage } from '../providers';
import { generateUUID } from '../utils';
import { calculateCost } from '../utils/cost-calculator';
import { toolIntegrationService } from '../tools';
import type { UsageData } from '../providers/types/base';
import type { CompletionParams, CompletionResult, LLMProvider } from '../providers/types/base';
import type { ToolCallResult } from '@/types/tools';

import { BaseAgent } from './base-agent';
import type { SendMessageOptions, MessageResponse } from './agent-manager';

interface ExecutionContext {
  messageId: string;
  convoId: string;
  content: string[];
  options: SendMessageOptions;
  params: CompletionParams;
  startTime: number;
  toolContext: ToolContext;
  providerConfig: ProviderConfig;
}

export class LocalAgent extends BaseAgent {
  private abortController: AbortController | null = null;
  private messageBuilder: MessageBuilder;
  private streamingHandler: StreamingHandler;
  private toolExecutor: ToolExecutor;

  constructor(
    agentSettings: AgentSettings,
    private providerConfig: ProviderConfig,
    history: Map<string, Message[]>,
  ) {
    super(agentSettings, history);
    this.messageBuilder = new MessageBuilder();
    this.toolExecutor = new ToolExecutor(agentSettings.toolConfig);
    this.streamingHandler = new StreamingHandler(this.addToHistory.bind(this), this.toolExecutor);
  }

  async sendMessage(content: string[], options: SendMessageOptions = {}): Promise<MessageResponse> {
    this.abortController = new AbortController();

    const context = this.createExecutionContext(content, options);
    const provider = createProvider(this.providerConfig);

    try {
      if (options.stream) {
        return await this.handleStreamingMessage(context, provider);
      } else {
        return await this.handleRegularMessage(context, provider);
      }
    } catch (error) {
      this.handleError(error, options);
      throw error;
    }
  }

  private async handleRegularMessage(context: ExecutionContext, provider: LLMProvider): Promise<MessageResponse> {
    // 1. Get initial completion
    let currentResult = await provider.generateCompletion(context.params, this.abortController?.signal);
    const allToolResults: ToolCallResult[] = [];
    let recursionDepth = 0;
    const maxRecursionDepth = 50;
    const currentMessages = [...context.params.messages]; // Track message history properly

    // 2. Handle recursive tool calls at agent level
    while (currentResult.tool_calls && currentResult.tool_calls.length > 0 && recursionDepth < maxRecursionDepth) {
      console.log(`[LocalAgent] Processing ${currentResult.tool_calls.length} tool calls (depth: ${recursionDepth})`);

      // Execute tools for this round
      const toolResults = await this.toolExecutor.executeTools(currentResult, context, (toolMessage) =>
        context.options.onAdditionalMessage?.(toolMessage),
      );

      // Accumulate all tool results for history
      allToolResults.push(...toolResults);

      // Create follow-up messages with tool results
      const toolMessages = this.createToolResultMessages(currentResult.tool_calls, toolResults);

      // Add assistant message with tool calls to conversation
      currentMessages.push({
        role: 'assistant' as const,
        content: currentResult.content || null,
        tool_calls: currentResult.tool_calls,
      });

      // Add tool result messages to conversation
      currentMessages.push(...toolMessages);

      // Update params for next round with accumulated messages
      const followUpParams = {
        ...context.params,
        messages: currentMessages,
      };

      // Get next completion
      recursionDepth++;
      currentResult = await provider.generateCompletion(followUpParams, this.abortController?.signal);
    }

    // 3. Handle case where recursion limit reached
    if (currentResult.tool_calls && currentResult.tool_calls.length > 0 && recursionDepth >= maxRecursionDepth) {
      console.warn(`[LocalAgent] Maximum recursion depth (${maxRecursionDepth}) reached, stopping tool calling flow`);
      currentResult.content =
        (currentResult.content || '') +
        `\n\n[Tool calling stopped due to maximum recursion depth. ${currentResult.tool_calls.length} tool call(s) not executed]`;
    }

    // 4. Build response and update history
    const response = this.messageBuilder.buildFinalResponse(currentResult, context);

    // 5. Add messages to history (including all tool results from all rounds)
    const historyMessages = this.messageBuilder.buildMessagesForHistory(context.content, currentResult, allToolResults);
    this.addToHistory(context.convoId, historyMessages);

    // 6. Call completion callback
    context.options.onComplete?.(currentResult.content);

    return response;
  }

  private async handleStreamingMessage(context: ExecutionContext, provider: LLMProvider): Promise<MessageResponse> {
    if (provider.generateCompletionStreamWithTools) {
      return await this.streamingHandler.handleWithTools(context, provider, this.abortController?.signal);
    } else if (provider.generateCompletionStream) {
      return await this.streamingHandler.handleBasic(context, provider, this.abortController?.signal);
    } else {
      // Fallback to regular message if streaming not supported
      return await this.handleRegularMessage(context, provider);
    }
  }

  private createExecutionContext(content: string[], options: SendMessageOptions): ExecutionContext {
    const messageId = generateUUID();
    const convoId = options.conversationId || 'default';
    const messages = this.buildContext(convoId, content);

    const baseParams = {
      messages,
      model: this.providerConfig.activeModel.model,
      temperature: this.agentSettings.temperature,
      maxTokens: this.providerConfig.activeModel.maxTokens,
      topP: this.agentSettings.topP,
    };

    const enhancedParams = toolIntegrationService.enhanceCompletionParams(baseParams, this.agentSettings.toolConfig);

    return {
      messageId,
      convoId,
      content,
      options,
      params: enhancedParams,
      startTime: Date.now(),
      providerConfig: this.providerConfig,
      toolContext: {
        userId: options.userId,
        sessionId: convoId,
        metadata: {
          agentId: this.agentSettings.id,
          provider: this.providerConfig.type,
          model: this.providerConfig.activeModel.model,
        },
      },
    };
  }

  private handleError(error: any, options: SendMessageOptions): void {
    if (this.abortController?.signal.aborted) {
      const cancelError = new Error('Request cancelled by user');
      options.onError?.(cancelError);
    } else {
      options.onError?.(error instanceof Error ? error : new Error('Unknown error'));
    }
  }

  private createToolResultMessages(toolCalls: ToolCall[], toolResults: ToolCallResult[]): ChatMessage[] {
    const messages: ChatMessage[] = [];

    // Iterate through ALL tool calls to ensure each gets a response
    toolCalls.forEach((toolCall) => {
      const result = toolResults.find((r) => r.id === toolCall.id);

      let content: string;
      if (result) {
        // Handle standardized format
        if (result.result.status === 'error') {
          content = result.result.result as string;
        } else if (result.result.type === 'text') {
          content = result.result.result as string;
        } else {
          content = JSON.stringify(result.result.result);
        }
      } else {
        // No result found for this tool call - create error response
        content = `Error: Tool "${toolCall.function.name}" did not return a result.`;
      }

      messages.push({
        role: 'tool',
        content: content,
        tool_call_id: toolCall.id,
        name: toolCall.function.name,
      });
    });

    return messages;
  }

  cancel(): void {
    this.abortController?.abort();
  }
}

// Separate classes for different concerns

class MessageBuilder {
  buildFinalResponse(result: CompletionResult, context: ExecutionContext): MessageResponse {
    const timestamp = new Date().toISOString();
    const model = context.providerConfig.activeModel.model;
    const promptTokens = result.usage?.prompt_tokens || 0;
    const completionTokens = result.usage?.completion_tokens || 0;
    const totalTokens = result.usage?.total_tokens || 0;
    const estimatedCost = calculateCost(model, promptTokens, completionTokens);

    return {
      id: context.messageId,
      content: result.content,
      role: 'assistant',
      timestamp,
      metadata: {
        agentType: 'local',
        agentId: context.toolContext.metadata?.agentId || 'unknown',
        provider: context.toolContext.metadata?.provider || 'unknown',
        model,
        responseTime: Date.now() - context.startTime,
        promptTokens,
        completionTokens,
        totalTokens,
        estimatedCost,
      },
    };
  }

  buildMessagesForHistory(content: string[], result: CompletionResult, allToolResults?: ToolCallResult[]): Message[] {
    const timestamp = new Date().toISOString();
    const messages: Message[] = [];

    // Add user messages
    content.forEach((msg) => {
      messages.push({
        id: generateUUID(),
        role: 'user',
        content: msg,
        timestamp,
      });
    });

    // Add tool messages from all rounds if present
    if (allToolResults && allToolResults.length > 0) {
      allToolResults.forEach((toolResult) => {
        messages.push({
          id: generateUUID(),
          role: 'tool',
          content: `Executed tool: ${toolResult.name}`,
          timestamp,
          toolCall: {
            name: toolResult.name,
            id: toolResult.id,
            arguments: {}, // Arguments would need to be tracked separately
            result: toolResult.result,
            isExecuting: false,
          },
        });
      });
    }

    // Add final assistant response
    messages.push({
      id: generateUUID(),
      role: 'assistant',
      content: result.content,
      timestamp,
    });

    return messages;
  }
}

class StreamingHandler {
  constructor(
    private addToHistory: (convoId: string, messages: Message[]) => void,
    private toolExecutor: ToolExecutor,
  ) {}

  async handleWithTools(
    context: ExecutionContext,
    provider: LLMProvider,
    signal?: AbortSignal,
  ): Promise<MessageResponse> {
    if (!provider.generateCompletionStreamWithTools) {
      throw new Error('Provider does not support streaming with tools');
    }

    const messageBuilder = new MessageBuilder();
    const allToolResults: ToolCallResult[] = [];
    const currentMessages = [...context.params.messages]; // Track message history properly
    let recursionDepth = 0;
    const maxRecursionDepth = 50;

    // 1. Get initial streaming completion
    let streamedContent = '';
    let currentToolCalls: ToolCall[] = [];
    let usage: UsageData = {
      prompt_tokens: 0,
      completion_tokens: 0,
      total_tokens: 0,
    };

    const stream = provider.generateCompletionStreamWithTools(context.params, signal);

    try {
      // Stream the initial response
      for await (const chunk of stream) {
        if (signal?.aborted) {
          throw new Error('Request cancelled');
        }

        if (chunk.content !== null && chunk.content !== undefined) {
          streamedContent += chunk.content;
          context.options.onChunk?.(chunk.content);
        }

        if (chunk.usage) {
          usage = chunk.usage;
        }

        if (chunk.tool_calls) {
          currentToolCalls = chunk.tool_calls;
        }
      }
    } catch (error) {
      if (signal?.aborted) {
        throw new Error('Request cancelled by user');
      }
      throw error;
    }

    // 2. Build initial result object
    let currentResult: CompletionResult = {
      content: streamedContent,
      tool_calls: currentToolCalls.length > 0 ? currentToolCalls : undefined,
      usage: usage,
    };

    // 3. Handle recursive tool calls (similar to handleRegularMessage)
    while (currentResult.tool_calls && currentResult.tool_calls.length > 0 && recursionDepth < maxRecursionDepth) {
      console.log(
        `[StreamingHandler] Processing ${currentResult.tool_calls.length} tool calls (depth: ${recursionDepth})`,
      );

      // Execute tools for this round - use the same toolExecutor as regular message handler
      const toolResults = await this.toolExecutor.executeTools(currentResult, context, (toolMessage) =>
        context.options.onAdditionalMessage?.(toolMessage),
      );

      // Accumulate all tool results for history
      allToolResults.push(...toolResults);

      // Create follow-up messages with tool results - using the helper method
      const toolMessages = this.createToolResultMessages(currentResult.tool_calls, toolResults);

      // Add assistant message with tool calls to conversation
      currentMessages.push({
        role: 'assistant' as const,
        content: currentResult.content || null,
        tool_calls: currentResult.tool_calls,
      });

      // Add tool result messages to conversation
      currentMessages.push(...toolMessages);

      // Update params for next round with accumulated messages
      const followUpParams = {
        ...context.params,
        messages: currentMessages,
      };

      // Get next completion with STREAMING to maintain consistency
      recursionDepth++;
      let followUpContent = '';
      let followUpToolCalls: ToolCall[] = [];
      let followUpUsage: UsageData = {
        prompt_tokens: 0,
        completion_tokens: 0,
        total_tokens: 0,
      };

      // Stream the follow-up response as well
      const followUpStream = provider.generateCompletionStreamWithTools(followUpParams, signal);

      try {
        for await (const chunk of followUpStream) {
          if (signal?.aborted) {
            throw new Error('Request cancelled');
          }

          if (chunk.content !== null && chunk.content !== undefined) {
            followUpContent += chunk.content;
            // Emit streaming content if there is any
            if (chunk.content.trim()) {
              context.options.onChunk?.(chunk.content);
            }
          }

          if (chunk.usage) {
            followUpUsage = chunk.usage;
          }

          if (chunk.tool_calls) {
            followUpToolCalls = chunk.tool_calls;
          }
        }
      } catch (error) {
        if (signal?.aborted) {
          throw new Error('Request cancelled by user');
        }
        throw error;
      }

      // Build the follow-up result
      const followUpResult: CompletionResult = {
        content: followUpContent,
        tool_calls: followUpToolCalls.length > 0 ? followUpToolCalls : undefined,
        usage: followUpUsage,
      };

      // If this follow-up has content, emit it as an additional message
      if (followUpResult.content.trim() && context.options.onAdditionalMessage) {
        const followUpMessage: MessageResponse = {
          id: generateUUID(),
          content: followUpResult.content,
          role: 'assistant',
          timestamp: new Date().toISOString(),
          metadata: {
            agentType: 'local',
            agentId: context.toolContext.metadata?.agentId || 'unknown',
            provider: context.toolContext.metadata?.provider || 'unknown',
            model: context.toolContext.metadata?.model || 'unknown',
            responseTime: Date.now() - context.startTime,
          },
        };
        context.options.onAdditionalMessage(followUpMessage);
      }

      // Update accumulated usage
      usage.prompt_tokens = (usage.prompt_tokens || 0) + (followUpUsage.prompt_tokens || 0);
      usage.completion_tokens = (usage.completion_tokens || 0) + (followUpUsage.completion_tokens || 0);
      usage.total_tokens = (usage.total_tokens || 0) + (followUpUsage.total_tokens || 0);

      currentResult = followUpResult;
    }

    // 4. Handle case where recursion limit reached
    if (currentResult.tool_calls && currentResult.tool_calls.length > 0 && recursionDepth >= maxRecursionDepth) {
      console.warn(
        `[StreamingHandler] Maximum recursion depth (${maxRecursionDepth}) reached, stopping tool calling flow`,
      );
      currentResult.content =
        (currentResult.content || '') +
        `\n\n[Tool calling stopped due to maximum recursion depth. ${currentResult.tool_calls.length} tool call(s) not executed]`;
    }

    // 5. Build final response
    const response = this.buildStreamingResponse(
      streamedContent, // Use original streamed content for the main response
      usage,
      context,
      allToolResults.length, // Total tool calls across all rounds
    );

    // 6. Add messages to history (including all tool results from all rounds)
    const historyMessages = messageBuilder.buildMessagesForHistory(
      context.content,
      { content: streamedContent, usage }, // Use original streamed content
      allToolResults,
    );
    this.addToHistory(context.convoId, historyMessages);

    // 7. Call completion callback
    context.options.onComplete?.(streamedContent);

    return response;
  }

  async handleBasic(context: ExecutionContext, provider: LLMProvider, signal?: AbortSignal): Promise<MessageResponse> {
    if (!provider.generateCompletionStream) {
      throw new Error('Provider does not support basic streaming');
    }

    let accumulated = '';
    const stream = provider.generateCompletionStream(context.params, signal);

    try {
      for await (const chunk of stream) {
        if (signal?.aborted) {
          throw new Error('Request cancelled');
        }
        accumulated += chunk;
        context.options.onChunk?.(chunk);
      }
    } catch (error) {
      if (signal?.aborted) {
        throw new Error('Request cancelled by user');
      }
      throw error;
    }

    const response = this.buildStreamingResponse(accumulated, undefined, context, 0);

    // Add to history and call completion
    const messageBuilder = new MessageBuilder();
    const historyMessages = messageBuilder.buildMessagesForHistory(context.content, {
      content: accumulated,
    });
    this.addToHistory(context.convoId, historyMessages);

    context.options.onComplete?.(accumulated);
    return response;
  }

  private buildStreamingResponse(
    content: string,
    usage: UsageData | undefined,
    context: ExecutionContext,
    toolCallCount: number,
  ): MessageResponse {
    const timestamp = new Date().toISOString();
    const model = context.providerConfig.activeModel.model;
    const promptTokens = usage?.prompt_tokens || 0;
    const completionTokens = usage?.completion_tokens || 0;
    const totalTokens = usage?.total_tokens || 0;
    const estimatedCost = calculateCost(model, promptTokens, completionTokens);

    return {
      id: context.messageId,
      content,
      role: 'assistant',
      timestamp,
      metadata: {
        agentType: 'local',
        agentId: context.toolContext.metadata?.agentId || 'unknown',
        provider: context.toolContext.metadata?.provider || 'unknown',
        model,
        responseTime: Date.now() - context.startTime,
        toolCalls: toolCallCount,
        promptTokens,
        completionTokens,
        totalTokens,
        estimatedCost,
      },
    };
  }

  private emitToolMessages(
    toolCalls: ToolCall[],
    toolResults: ToolCallResult[],
    onAdditionalMessage?: (message: MessageResponse) => void,
  ): void {
    if (!onAdditionalMessage) return;

    for (let i = 0; i < toolCalls.length; i++) {
      const toolCall = toolCalls[i];
      const result = toolResults.find((r) => r.id === toolCall.id);

      const toolMessage: MessageResponse = {
        id: generateUUID(),
        content: `Executed tool: ${toolCall.function.name}`,
        role: 'tool',
        timestamp: new Date().toISOString(),
        toolCall: {
          name: toolCall.function.name,
          id: toolCall.id,
          arguments: JSON.parse(toolCall.function.arguments),
          result: result?.result,
          isExecuting: false,
        },
        metadata: {
          agentType: 'local',
          agentId: 'local', // Will be filled properly in real implementation
          provider: 'local',
          model: 'local',
        },
      };
      onAdditionalMessage(toolMessage);
    }
  }

  private createToolResultMessages(toolCalls: ToolCall[], toolResults: ToolCallResult[]): ChatMessage[] {
    const messages: ChatMessage[] = [];

    // Iterate through ALL tool calls to ensure each gets a response
    toolCalls.forEach((toolCall) => {
      const result = toolResults.find((r) => r.id === toolCall.id);

      let content: string;
      if (result) {
        // Handle standardized format
        if (result.result.status === 'error') {
          content = result.result.result as string;
        } else if (result.result.type === 'text') {
          content = result.result.result as string;
        } else {
          content = JSON.stringify(result.result.result);
        }
      } else {
        // No result found for this tool call - create error response
        content = `Error: Tool "${toolCall.function.name}" did not return a result.`;
      }

      messages.push({
        role: 'tool',
        content: content,
        tool_call_id: toolCall.id,
        name: toolCall.function.name,
      });
    });

    return messages;
  }
}

class ToolExecutor {
  constructor(public toolConfig?: any) {}

  async executeTools(
    result: CompletionResult,
    context: ExecutionContext,
    onToolMessage: (message: MessageResponse) => void,
  ): Promise<ToolCallResult[]> {
    if (!result.tool_calls || result.tool_calls.length === 0) {
      return [];
    }

    // 1) Emit initial tool call messages as 'running' so the UI can show them immediately
    const timestamp = new Date().toISOString();
    const model = context.providerConfig.activeModel.model;

    for (const toolCall of result.tool_calls) {
      let args: Record<string, unknown> = {};
      try {
        args = JSON.parse(toolCall.function.arguments || '{}');
      } catch {
        args = {};
      }
      // Use the tool call id as the message id so we can update the same entry later
      const runningMessage: MessageResponse = {
        id: toolCall.id,
        content: `Running tool: ${toolCall.function.name}`,
        role: 'tool',
        timestamp,
        toolCall: {
          name: toolCall.function.name,
          id: toolCall.id,
          arguments: args,
          isExecuting: true,
        },
        metadata: {
          agentType: 'local',
          agentId: context.toolContext.metadata?.agentId || 'unknown',
          provider: context.toolContext.metadata?.provider || 'unknown',
          model,
          // Individual tool messages don't track tokens/cost; main assistant message does
          promptTokens: 0,
          completionTokens: 0,
          totalTokens: 0,
          estimatedCost: 0,
          responseTime: Date.now() - context.startTime,
        },
      };
      onToolMessage(runningMessage);
    }

    // 2) Execute the tools using the tool integration service
    const processed = await toolIntegrationService.processCompletionResult(
      result,
      context.toolContext,
      this.toolConfig,
    );

    if (processed.requiresFollowUp && processed.tool_results) {
      // 3) Emit completion messages, updating the existing entries using the same IDs
      this.emitToolMessages(result.tool_calls, processed.tool_results, context, onToolMessage);
      return processed.tool_results;
    }

    return [];
  }

  private emitToolMessages(
    toolCalls: ToolCall[],
    toolResults: ToolCallResult[],
    context: ExecutionContext,
    onToolMessage: (message: MessageResponse) => void,
  ): void {
    const timestamp = new Date().toISOString();
    const model = context.providerConfig.activeModel.model;

    for (const toolCallResult of toolResults) {
      const originalToolCall = toolCalls.find((tc) => tc.id === toolCallResult.id);
      const parameters = originalToolCall ? JSON.parse(originalToolCall.function.arguments || '{}') : {};

      // Read timing from tool result metadata (measured at execution level)
      const timingMeta = (toolCallResult.result && toolCallResult.result.metadata) || {} as any;
      const startedAt: string | undefined = timingMeta.startedAt;
      const completedAt: string | undefined = timingMeta.completedAt;
      const durationMs: number | undefined = timingMeta.durationMs;

      const toolMessageResponse: MessageResponse = {
        // Use the same id as the tool call so the UI updates the existing message
        id: toolCallResult.id,
        content: `Executed tool: ${toolCallResult.name}`,
        role: 'tool',
        timestamp,
        toolCall: {
          name: toolCallResult.name,
          id: toolCallResult.id,
          arguments: parameters,
          result: toolCallResult.result,
          isExecuting: false,
          startedAt,
          completedAt,
          durationMs,
        },
        metadata: {
          agentType: 'local',
          agentId: context.toolContext.metadata?.agentId || 'unknown',
          provider: context.toolContext.metadata?.provider || 'unknown',
          model,
          // Add token usage information - these individual tool messages don't consume tokens themselves
          // but we'll show 0 to be explicit (tokens are tracked in the main assistant response)
          promptTokens: 0,
          completionTokens: 0,
          totalTokens: 0,
          estimatedCost: 0,
          responseTime: Date.now() - context.startTime,
        },
      };
      onToolMessage(toolMessageResponse);
    }
  }
}
