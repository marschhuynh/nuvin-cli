import type { ProviderConfig, AgentSettings, Message } from '@/types';
import type { ToolContext } from '@/types/tools';

import { createProvider, type ToolCall, type ChatMessage } from '../providers';
import { generateUUID } from '../utils';
import { calculateCost } from '../utils/cost-calculator';
import { toolIntegrationService } from '../tools';
import type { UsageData } from '../providers/types/base';

import { BaseAgent } from './base-agent';
import type { SendMessageOptions, MessageResponse } from './agent-manager';

export class LocalAgent extends BaseAgent {
  private abortController: AbortController | null = null;

  constructor(
    agentSettings: AgentSettings,
    private providerConfig: ProviderConfig,
    history: Map<string, Message[]>,
  ) {
    super(agentSettings, history);
  }

  async sendMessage(
    content: string[],
    options: SendMessageOptions = {},
  ): Promise<MessageResponse> {
    this.abortController = new AbortController();
    const signal = this.abortController.signal;

    const startTime = Date.now();
    const messageId = generateUUID();
    const provider = createProvider(this.providerConfig);
    const convoId = options.conversationId || 'default';
    const messages: ChatMessage[] = this.buildContext(convoId, content);

    const baseParams = {
      messages,
      model: this.providerConfig.activeModel.model,
      temperature: this.agentSettings.temperature,
      maxTokens: this.providerConfig.activeModel.maxTokens,
      topP: this.agentSettings.topP,
    };

    const paramsWithTools = toolIntegrationService.enhanceCompletionParams(
      baseParams,
      this.agentSettings.toolConfig,
    );

    console.log('DEBUG:paramsWithTools', paramsWithTools);

    if (options.stream) {
      if (provider.generateCompletionStreamWithTools) {
        return this.handleStreamingWithTools(
          paramsWithTools,
          signal,
          options,
          messageId,
          convoId,
          content,
          startTime,
        );
      }

      if (provider.generateCompletionStream) {
        let accumulated = '';
        const stream = provider.generateCompletionStream(
          paramsWithTools,
          signal,
        );

        try {
          for await (const chunk of stream) {
            // Check for cancellation
            if (signal.aborted) {
              throw new Error('Request cancelled');
            }
            accumulated += chunk;
            options.onChunk?.(chunk);
          }
        } catch (error) {
          if (signal.aborted) {
            throw new Error('Request cancelled by user');
          }
          throw error;
        }

        const timestamp = new Date().toISOString();
        const model = this.providerConfig.activeModel.model;

        const response: MessageResponse = {
          id: messageId,
          content: accumulated,
          role: 'assistant',
          timestamp,
          metadata: {
            agentType: 'local',
            agentId: this.agentSettings.id,
            provider: this.providerConfig.type,
            model,
            responseTime: Date.now() - startTime,
            // Note: Regular streaming doesn't provide token counts from most providers
            promptTokens: 0,
            completionTokens: 0,
            totalTokens: 0,
            estimatedCost: 0,
          },
        };

        const userMessage: Message[] = Array.isArray(content)
          ? content.map((msg) => ({
            id: generateUUID(),
            role: 'user',
            content: msg,
            timestamp,
          }))
          : [
            {
              id: generateUUID(),
              role: 'user',
              content,
              timestamp,
            },
          ];

        this.addToHistory(convoId, [
          ...userMessage,
          {
            id: generateUUID(),
            role: 'assistant',
            content: accumulated,
            timestamp,
          },
        ]);

        options.onComplete?.(accumulated);
        return response;
      }
    }

    // Get initial completion (potentially with tool calls)
    const result = await provider.generateCompletion(paramsWithTools, signal);
    console.log('DEBUG:generateCompletion:result', result);

    const toolContext: ToolContext = {
      userId: options.userId,
      sessionId: convoId,
      metadata: {
        agentId: this.agentSettings.id,
        provider: this.providerConfig.type,
        model: this.providerConfig.activeModel.model,
      },
    };

    const processed = await toolIntegrationService.processCompletionResult(
      result,
      toolContext,
      this.agentSettings.toolConfig,
    );

    console.log('DEBUG:tool_call:processed', processed);

    let resultWithToolResult = result;

    // If tools were called, emit tool messages first, then get the final response
    if (processed.requiresFollowUp && processed.tool_results) {
      // Emit tool call messages immediately via onAdditionalMessage callback
      if (options.onAdditionalMessage && result.tool_calls) {
        const timestamp = new Date().toISOString();
        const model = this.providerConfig.activeModel.model;

        for (const toolCallResult of processed.tool_results) {
          // Find the original tool call to get parameters
          const originalToolCall = result.tool_calls.find(
            (tc) => tc.id === toolCallResult.id,
          );
          const parameters = originalToolCall
            ? JSON.parse(originalToolCall.function.arguments || '{}')
            : {};

          const toolMessageResponse: MessageResponse = {
            id: generateUUID(),
            content: `Executed tool: ${toolCallResult.name}`,
            role: 'tool',
            timestamp,
            toolCall: {
              name: toolCallResult.name,
              id: toolCallResult.id,
              arguments: parameters,
              result: toolCallResult.result,
              isExecuting: false,
            },
            metadata: {
              agentType: 'local',
              agentId: this.agentSettings.id,
              provider: this.providerConfig.type,
              model,
            },
          };

          if (processed.result.content) {
            options.onAdditionalMessage({
              id: generateUUID(),
              content: processed.result.content,
              role: 'assistant',
              timestamp: new Date().toISOString(),
            });
          }
          options.onAdditionalMessage(toolMessageResponse);
        }
      }

      // Execute tools and get follow-up response
      resultWithToolResult =
        await toolIntegrationService.completeToolCallingFlow(
          paramsWithTools,
          result,
          processed.tool_results,
          provider,
          toolContext,
        );
      console.log('DEBUG:completeToolCallingFlow:result', resultWithToolResult);
    } else {
      console.log(`[LocalAgent] No follow-up required, using original result`);
    }

    const timestamp = new Date().toISOString();
    const model = this.providerConfig.activeModel.model;
    const promptTokens = resultWithToolResult.usage?.prompt_tokens || 0;
    const completionTokens = resultWithToolResult.usage?.completion_tokens || 0;
    const totalTokens = resultWithToolResult.usage?.total_tokens || 0;
    const estimatedCost = calculateCost(model, promptTokens, completionTokens);

    const response: MessageResponse = {
      id: messageId,
      content: resultWithToolResult.content,
      role: 'assistant',
      timestamp,
      metadata: {
        agentType: 'local',
        agentId: this.agentSettings.id,
        provider: this.providerConfig.type,
        model,
        responseTime: Date.now() - startTime,
        toolCalls: processed.tool_results?.length || 0,
        promptTokens,
        completionTokens,
        totalTokens,
        estimatedCost,
      },
    };

    // Build messages to add to history
    const messagesToAdd: Message[] = Array.isArray(content)
      ? content.map((msg) => ({
        id: generateUUID(),
        role: 'user',
        content: msg,
        timestamp,
      }))
      : [
        {
          id: generateUUID(),
          role: 'user',
          content,
          timestamp,
        },
      ];

    // Add tool call messages if tools were executed (for internal history)
    if (
      processed.requiresFollowUp &&
      processed.tool_results &&
      result.tool_calls
    ) {
      for (const toolCallResult of processed.tool_results) {
        // Find the original tool call to get parameters
        const originalToolCall = result.tool_calls.find(
          (tc) => tc.id === toolCallResult.id,
        );
        const parameters = originalToolCall
          ? JSON.parse(originalToolCall.function.arguments || '{}')
          : {};

        const toolMessage: Message = {
          id: generateUUID(),
          role: 'tool',
          content: `Executed tool: ${toolCallResult.name}`,
          timestamp,
          toolCall: {
            name: toolCallResult.name,
            id: toolCallResult.id,
            arguments: parameters,
            result: toolCallResult.result,
            isExecuting: false,
          },
        };

        if (processed.result.content) {
          messagesToAdd.push({
            id: generateUUID(),
            content: processed.result.content,
            role: 'assistant',
            timestamp: new Date().toISOString(),
          });
        }
        messagesToAdd.push(toolMessage);
      }
    }

    // Add final assistant response
    messagesToAdd.push({
      id: generateUUID(),
      role: 'assistant',
      content: resultWithToolResult.content,
      timestamp,
    });

    this.addToHistory(convoId, messagesToAdd);

    options.onComplete?.(resultWithToolResult.content);
    return response;
  }

  private async handleStreamingWithTools(
    enhancedParams: any,
    signal: AbortSignal,
    options: SendMessageOptions,
    messageId: string,
    convoId: string,
    content: string[],
    startTime: number,
  ): Promise<MessageResponse> {
    const provider = createProvider(this.providerConfig);
    if (!provider.generateCompletionStreamWithTools) {
      throw new Error('Provider does not support streaming with tools');
    }

    const toolContext: ToolContext = {
      userId: options.userId,
      sessionId: convoId,
      metadata: {
        agentId: this.agentSettings.id,
        provider: this.providerConfig.type,
        model: this.providerConfig.activeModel.model,
      },
    };

    let accumulated = '';
    let currentToolCalls: ToolCall[] = [];
    let processedToolResults: any[] = [];
    let usage: UsageData = {
      prompt_tokens: 0,
      completion_tokens: 0,
      total_tokens: 0,
    };
    let finalMetadata = null;

    const stream = provider.generateCompletionStreamWithTools(
      enhancedParams,
      signal,
    );

    try {
      for await (const chunk of stream) {
        if (signal.aborted) {
          throw new Error('Request cancelled');
        }

        if (chunk.content) {
          accumulated += chunk.content;
          options.onChunk?.(chunk.content);
        }

        if (chunk.usage) {
          usage = chunk.usage;
        }

        if (chunk._metadata) {
          finalMetadata = chunk._metadata;
        }

        if (chunk.tool_calls) {
          currentToolCalls = chunk.tool_calls;

          // If this is the final tool call chunk, execute tools
          if (chunk.finished && currentToolCalls.length > 0) {
            // Process tool calls
            const processed =
              await toolIntegrationService.processCompletionResult(
                { content: accumulated, tool_calls: currentToolCalls },
                toolContext,
                this.agentSettings.toolConfig,
              );

            if (processed.requiresFollowUp && processed.tool_results) {
              // Store processed tool results for history
              processedToolResults = processed.tool_results;

              // Emit separate messages for each tool call
              if (options.onAdditionalMessage) {
                for (let i = 0; i < currentToolCalls.length; i++) {
                  const toolCall = currentToolCalls[i];
                  const result = processed.tool_results.find(
                    (r) => r.id === toolCall.id,
                  );

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
                      agentId: this.agentSettings.id,
                      provider: this.providerConfig.type,
                      model: this.providerConfig.activeModel.model,
                    },
                  };
                  options.onAdditionalMessage(toolMessage);
                }
              }

              // Execute tools and get follow-up response
              const finalResult =
                await toolIntegrationService.completeToolCallingFlow(
                  enhancedParams,
                  { content: accumulated, tool_calls: currentToolCalls },
                  processed.tool_results,
                  provider,
                );

              // Emit Message 3: Final response
              if (finalResult.content.trim() && options.onAdditionalMessage) {
                const finalMessage: MessageResponse = {
                  id: generateUUID(),
                  content: finalResult.content,
                  role: 'assistant',
                  timestamp: new Date().toISOString(),
                  metadata: {
                    agentType: 'local',
                    agentId: this.agentSettings.id,
                    provider: this.providerConfig.type,
                    model: this.providerConfig.activeModel.model,
                    responseTime: Date.now() - startTime,
                  },
                };
                options.onAdditionalMessage(finalMessage);
              }
            }
          }
        }
      }
    } catch (error) {
      if (signal.aborted) {
        throw new Error('Request cancelled by user');
      }
      throw error;
    }

    const timestamp = new Date().toISOString();
    const model = this.providerConfig.activeModel.model;

    // Use metadata from final chunk if available, otherwise fallback to usage data
    const promptTokens = usage?.prompt_tokens || 0;
    const completionTokens = usage?.completion_tokens || 0;
    const totalTokens = usage?.total_tokens || 0;
    const estimatedCost =
      finalMetadata?.estimatedCost ||
      calculateCost(model, promptTokens, completionTokens);

    const response: MessageResponse = {
      id: messageId,
      content: accumulated,
      role: 'assistant',
      timestamp,
      metadata: {
        agentType: 'local',
        agentId: this.agentSettings.id,
        provider: this.providerConfig.type,
        model,
        responseTime: Date.now() - startTime,
        toolCalls: currentToolCalls.length,
        promptTokens,
        completionTokens,
        totalTokens,
        estimatedCost,
      },
    };

    // Build messages to add to history
    const messagesToAddStreaming: Message[] = Array.isArray(content)
      ? content.map((msg) => ({
        id: generateUUID(),
        role: 'user',
        content: msg,
        timestamp,
      }))
      : [];

    // Add tool call messages if tools were executed during streaming
    if (processedToolResults.length > 0) {
      for (const toolCallResult of processedToolResults) {
        // Find the original tool call to get parameters
        const originalToolCall = currentToolCalls.find(
          (tc) => tc.id === toolCallResult.id,
        );
        const parameters = originalToolCall
          ? JSON.parse(originalToolCall.function.arguments || '{}')
          : {};

        messagesToAddStreaming.push({
          id: generateUUID(),
          role: 'tool',
          content: `Executed tool: ${toolCallResult.name}`,
          timestamp,
          toolCall: {
            name: toolCallResult.name,
            id: toolCallResult.id,
            arguments: parameters,
            result: toolCallResult.result,
            isExecuting: false,
          },
        });
      }
    }

    // Add final assistant response
    messagesToAddStreaming.push({
      id: generateUUID(),
      role: 'assistant',
      content: accumulated,
      timestamp,
      metadata: {
        agentType: 'local',
        agentId: this.agentSettings.id,
        provider: this.providerConfig.type,
        model,
        responseTime: Date.now() - startTime,
        promptTokens,
        completionTokens,
        totalTokens,
        estimatedCost,
      },
    });

    this.addToHistory(convoId, messagesToAddStreaming);

    options.onComplete?.(accumulated);
    return response;
  }

  /**
   * Cancel the current request
   */
  cancel(): void {
    if (this.abortController) {
      this.abortController.abort();
    }
  }
}
