import type {
  CompletionParams,
  CompletionResult,
  ChatMessage,
  ToolDefinition,
  ToolCall as LLMToolCall,
  LLMProvider,
} from '@/lib/providers/types/base';
import type {
  ToolCall,
  ToolCallResult,
  AgentToolConfig,
  ToolContext,
} from '@/types/tools';
import { toolRegistry } from './tool-registry';
import { reminderGenerator } from '../agents/reminder-generator';
import { useToolPermissionStore } from '@/store';

export class ToolIntegrationService {
  /**
   * Enhance completion parameters with available tools
   */
  enhanceCompletionParams(
    params: CompletionParams,
    agentToolConfig?: AgentToolConfig,
  ): CompletionParams {
    // Only include explicitly enabled tools
    const enabledToolNames = new Set(agentToolConfig?.enabledTools || []);

    // Only add MCP tools if they are explicitly listed in enabledTools
    const mcpTools = toolRegistry.getAllMCPTools();
    const explicitlyEnabledMCPTools = mcpTools.filter(
      (mcpTool) =>
        enabledToolNames.has(mcpTool.definition.name) && mcpTool.isAvailable(),
    );

    // Filter to only include tools that are explicitly enabled
    const finalEnabledTools = Array.from(enabledToolNames).filter(
      (toolName) => {
        // Check if it's an MCP tool that should be included
        const isMCPTool = mcpTools.some(
          (mcp) => mcp.definition.name === toolName,
        );
        if (isMCPTool) {
          return explicitlyEnabledMCPTools.some(
            (mcp) => mcp.definition.name === toolName,
          );
        }
        // Include non-MCP tools if they exist
        return toolRegistry.hasTool(toolName);
      },
    );

    // If no tools are enabled, return params as-is
    if (finalEnabledTools.length === 0) {
      return params;
    }

    // Get tool definitions for all enabled tools
    const toolDefinitions = toolRegistry.getToolDefinitions(
      Array.from(enabledToolNames),
    );

    // Convert to LLM provider format
    const tools: ToolDefinition[] = toolDefinitions.map((tool) => ({
      type: 'function',
      function: {
        name: tool.name,
        description: tool.description,
        parameters: tool.parameters,
      },
    }));

    return {
      ...params,
      tools,
      tool_choice: 'auto', // Let the LLM decide when to use tools
    };
  }

  /**
   * Process completion result and handle tool calls
   */
  async processCompletionResult(
    result: CompletionResult,
    context: ToolContext,
    agentToolConfig?: AgentToolConfig,
  ): Promise<{
    result: CompletionResult;
    tool_results?: ToolCallResult[];
    requiresFollowUp: boolean;
  }> {
    // If no tool calls, return as-is
    if (!result.tool_calls || result.tool_calls.length === 0) {
      return {
        result,
        requiresFollowUp: false,
      };
    }

    // Check if tools are enabled for this agent (only explicitly enabled tools)
    const enabledToolNames = new Set(agentToolConfig?.enabledTools || []);

    // Filter tool calls to only include enabled tools
    const allowedToolCalls = result.tool_calls.filter((call) => {
      return enabledToolNames.has(call.function.name);
    });

    if (allowedToolCalls.length === 0) {
      return {
        result: {
          content:
            result.content ||
            'The assistant attempted to use tools, but no tools are available.',
        },
        requiresFollowUp: false,
      };
    }

    // Update result to only include allowed tool calls
    result.tool_calls = allowedToolCalls;

    // Convert LLM tool calls to our format
    const toolCalls: ToolCall[] = result.tool_calls.map((call) => {
      try {
        return {
          id: call.id,
          name: call.function.name,
          parameters: JSON.parse(call.function.arguments),
        };
      } catch (error) {
        console.error(
          `[MCP] Failed to parse tool call arguments for ${call.function.name}:`,
          error,
        );
        console.error(`[MCP] Raw arguments:`, call.function.arguments);
        return {
          id: call.id,
          name: call.function.name,
          parameters: {},
        };
      }
    });

    const store = useToolPermissionStore.getState();
    const convoId = context.sessionId || 'default';
    const allowedCalls: ToolCall[] = [];
    const deniedResults: ToolCallResult[] = [];

    for (const call of toolCalls) {
      if (store.isToolAllowed(convoId, call.name)) {
        allowedCalls.push(call);
        continue;
      }

      const decision = await store.askPermission(convoId, call.name);
      if (decision === 'conversation') {
        store.allowForConversation(convoId, call.name);
        allowedCalls.push(call);
      } else if (decision === 'once') {
        allowedCalls.push(call);
      } else {
        deniedResults.push({
          id: call.id,
          name: call.name,
          result: {
            status: 'error',
            type: 'text',
            result: 'Tool execution denied by user',
          },
        });
      }
    }

    // Execute allowed tool calls
    const maxConcurrent = agentToolConfig?.maxConcurrentCalls || 3;
    const executedResults =
      allowedCalls.length > 0
        ? await toolRegistry.executeToolCalls(
            allowedCalls,
            context,
            maxConcurrent,
          )
        : [];

    const toolResults = [...executedResults, ...deniedResults];

    console.log('DEBUG:processCompletionResult', toolResults);

    return {
      result,
      tool_results: toolResults,
      requiresFollowUp: true,
    };
  }

  /**
   * Create follow-up messages with tool results
   */
  createToolResultMessages(
    originalToolCalls: LLMToolCall[],
    toolResults: ToolCallResult[],
  ): ChatMessage[] {
    const messages: ChatMessage[] = [];

    // Add the assistant message with tool calls
    messages.push({
      role: 'assistant',
      content: null,
      tool_calls: originalToolCalls,
    });

    // Add tool result messages
    toolResults.forEach((result) => {
      const toolCall = originalToolCalls.find((call) => call.id === result.id);
      if (toolCall) {
        // Handle new standardized format
        let content: string;
        if (result.result.status === 'error') {
          content = result.result.result as string;
        } else if (result.result.type === 'text') {
          content = result.result.result as string;
        } else {
          content = JSON.stringify(result.result.result);
        }

        messages.push({
          role: 'tool',
          content: content,
          tool_call_id: result.id,
          name: result.name,
        });
      }
    });

    return messages;
  }

  /**
   * Enhance tool result messages with system reminders for LLM
   */
  private enhanceToolMessagesWithReminders(
    toolMessages: ChatMessage[],
    toolResults: ToolCallResult[],
    conversationId?: string,
  ): ChatMessage[] {
    try {
      const hasRecentChangesOnTodoList = toolResults.some(
        (result) =>
          result.result.status === 'success' && result.name === 'todo_write',
      );

      console.log(
        'DEBUG:hasRecentChangesOnTodoList',
        hasRecentChangesOnTodoList,
      );

      // Generate reminders based on tool execution context
      const enhancedContent = reminderGenerator.enhanceMessageWithReminders(
        'Tool execution completed',
        {
          messageType: 'tool',
          conversationId,
          messageHistory: [], // Tool context doesn't need full history
          includeReminders: true,
          todoState: {
            recentChanges: hasRecentChangesOnTodoList,
          },
        },
      );

      console.log('DEBUG:enhancedContent', enhancedContent);

      // If reminders were generated, inject them as a system message
      if (enhancedContent.length > 1) {
        const reminderContent = enhancedContent
          .filter((content) => content !== 'Tool execution completed')
          .join('\n');

        // Insert reminder as first message after tool results
        const systemReminderMessage: ChatMessage = {
          role: 'user',
          content: reminderContent,
        };

        return [...toolMessages, systemReminderMessage];
      }

      return toolMessages;
    } catch (error) {
      console.warn('Failed to enhance tool messages with reminders:', error);
      return toolMessages;
    }
  }

  /**
   * Complete tool calling flow - execute tools and get final response
   */
  async completeToolCallingFlow(
    originalParams: CompletionParams,
    firstResult: CompletionResult,
    toolResults: ToolCallResult[],
    llmProvider: LLMProvider, // LLMProvider instance
    context?: ToolContext,
    agentToolConfig?: AgentToolConfig,
    maxRecursionDepth: number = 5, // Prevent infinite recursion
    currentDepth: number = 0,
  ): Promise<CompletionResult> {
    if (!firstResult.tool_calls) {
      return firstResult;
    }

    if (currentDepth >= maxRecursionDepth) {
      console.warn(`[ToolIntegration] Maximum recursion depth (${maxRecursionDepth}) reached, stopping tool calling flow`);
      return {
        ...firstResult,
        content: firstResult.content + '\n\n[Tool calling stopped due to maximum recursion depth]',
      };
    }

    // Create messages with tool results
    const toolMessages = this.createToolResultMessages(
      firstResult.tool_calls,
      toolResults,
    );

    console.log('DEBUG:toolMessages', { toolMessages, toolResults });

    // Enhance tool result messages with reminders for the LLM
    const enhancedToolMessages = this.enhanceToolMessagesWithReminders(
      toolMessages,
      toolResults,
      context?.sessionId,
    );

    console.log('DEBUG:enhancedToolMessages', enhancedToolMessages);

    // Create follow-up completion with tool results
    const followUpParams: CompletionParams = {
      ...originalParams,
      messages: [...originalParams.messages, ...enhancedToolMessages],
    };

    console.log('DEBUG:followUpParams', followUpParams);
    const finalResult = await llmProvider.generateCompletion(followUpParams);

    console.log('DEBUG:finalResult', finalResult);

    // Check if the final result contains more tool calls
    if (finalResult.tool_calls && finalResult.tool_calls.length > 0) {
      console.log(`[ToolIntegration] Follow-up response contains ${finalResult.tool_calls.length} tool calls, processing recursively (depth: ${currentDepth + 1})`);

      // Process the new tool calls
      const processed = await this.processCompletionResult(
        finalResult,
        context!,
        agentToolConfig,
      );

      if (processed.requiresFollowUp && processed.tool_results) {
        // For the recursive call, we need to build new params that include the assistant message
        // with the new tool calls, so the context is correct
        const assistantMessageWithToolCalls = {
          role: 'assistant' as const,
          content: finalResult.content || '',
          tool_calls: finalResult.tool_calls,
        };

        const newParams: CompletionParams = {
          ...originalParams,
          messages: [...followUpParams.messages, assistantMessageWithToolCalls],
        };

        // Recursively call completeToolCallingFlow with the new context
        return await this.completeToolCallingFlow(
          newParams,
          finalResult,
          processed.tool_results,
          llmProvider,
          context,
          agentToolConfig,
          maxRecursionDepth,
          currentDepth + 1,
        );
      }
    }

    return {
      ...finalResult,
      content: finalResult.content || '',
    };
  }

  /**
   * Get available tools for an agent
   */
  getAvailableToolsForAgent(
    agentToolConfig?: AgentToolConfig,
  ): ToolDefinition[] {
    // Only include explicitly enabled tools
    const enabledToolNames = new Set(agentToolConfig?.enabledTools || []);

    // Only include MCP tools that are explicitly enabled and available
    const mcpTools = toolRegistry.getAllMCPTools();
    const explicitlyEnabledMCPTools = mcpTools.filter(
      (mcpTool) =>
        enabledToolNames.has(mcpTool.definition.name) && mcpTool.isAvailable(),
    );

    if (enabledToolNames.size === 0) {
      return [];
    }

    // Filter to only include tools that are explicitly enabled
    const finalEnabledTools = Array.from(enabledToolNames).filter(
      (toolName) => {
        // Check if it's an MCP tool that should be included
        const isMCPTool = mcpTools.some(
          (mcp) => mcp.definition.name === toolName,
        );
        if (isMCPTool) {
          return explicitlyEnabledMCPTools.some(
            (mcp) => mcp.definition.name === toolName,
          );
        }
        // Include non-MCP tools if they exist
        return toolRegistry.hasTool(toolName);
      },
    );

    if (finalEnabledTools.length === 0) {
      return [];
    }

    return toolRegistry.getToolDefinitions(finalEnabledTools).map((tool) => ({
      type: 'function' as const,
      function: {
        name: tool.name,
        description: tool.description,
        parameters: tool.parameters,
      },
    }));
  }

  /**
   * Validate tool configuration
   */
  validateToolConfig(agentToolConfig: AgentToolConfig): {
    valid: boolean;
    errors: string[];
  } {
    const errors: string[] = [];

    // Check if enabled tools exist
    const missingTools = agentToolConfig.enabledTools.filter(
      (toolName) => !toolRegistry.hasTool(toolName),
    );

    if (missingTools.length > 0) {
      errors.push(`Missing tools: ${missingTools.join(', ')}`);
    }

    // Validate concurrent calls limit
    if (agentToolConfig.maxConcurrentCalls !== undefined) {
      if (
        agentToolConfig.maxConcurrentCalls < 1 ||
        agentToolConfig.maxConcurrentCalls > 10
      ) {
        errors.push('maxConcurrentCalls must be between 1 and 10');
      }
    }

    // Validate timeout
    if (agentToolConfig.timeoutMs !== undefined) {
      if (
        agentToolConfig.timeoutMs < 1000 ||
        agentToolConfig.timeoutMs > 300000
      ) {
        errors.push('timeoutMs must be between 1000 and 300000 (5 minutes)');
      }
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }
}

// Singleton instance
export const toolIntegrationService = new ToolIntegrationService();
