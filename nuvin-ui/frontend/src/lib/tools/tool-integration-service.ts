import {
  CompletionParams,
  CompletionResult,
  ChatMessage,
  ToolDefinition,
  ToolCall as LLMToolCall,
} from '@/lib/providers/llm-provider';
import {
  ToolCall,
  ToolCallResult,
  AgentToolConfig,
  ToolContext,
} from '@/types/tools';
import { toolRegistry } from './tool-registry';

export class ToolIntegrationService {
  /**
   * Enhance completion parameters with available tools
   */
  enhanceCompletionParams(
    params: CompletionParams,
    agentToolConfig?: AgentToolConfig,
  ): CompletionParams {
    if (!agentToolConfig || !agentToolConfig.enabledTools.length) {
      return params;
    }

    // Get tool definitions for enabled tools
    const toolDefinitions = toolRegistry.getToolDefinitions(
      agentToolConfig.enabledTools,
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
    toolCalls?: ToolCallResult[];
    requiresFollowUp: boolean;
  }> {
    // If no tool calls, return as-is
    if (!result.tool_calls || result.tool_calls.length === 0) {
      return {
        result,
        requiresFollowUp: false,
      };
    }

    // Check if tools are enabled for this agent
    if (!agentToolConfig || !agentToolConfig.enabledTools.length) {
      return {
        result: {
          content:
            result.content ||
            'The assistant attempted to use tools, but tools are not enabled for this agent.',
        },
        requiresFollowUp: false,
      };
    }

    // Convert LLM tool calls to our format
    const toolCalls: ToolCall[] = result.tool_calls.map((call) => ({
      id: call.id,
      name: call.function.name,
      parameters: JSON.parse(call.function.arguments),
    }));

    // Execute tool calls
    const maxConcurrent = agentToolConfig.maxConcurrentCalls || 3;
    const toolResults = await toolRegistry.executeToolCalls(
      toolCalls,
      context,
      maxConcurrent,
    );

    return {
      result,
      toolCalls: toolResults,
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
        messages.push({
          role: 'tool',
          content: JSON.stringify({
            success: result.result.success,
            data: result.result.data,
            error: result.result.error,
          }),
          tool_call_id: result.id,
          name: result.name,
        });
      }
    });

    return messages;
  }

  /**
   * Complete tool calling flow - execute tools and get final response
   */
  async completeToolCallingFlow(
    originalParams: CompletionParams,
    firstResult: CompletionResult,
    toolResults: ToolCallResult[],
    llmProvider: any, // LLMProvider instance
    context: ToolContext,
    agentToolConfig?: AgentToolConfig,
  ): Promise<CompletionResult> {
    if (!firstResult.tool_calls) {
      return firstResult;
    }

    // Create messages with tool results
    const toolMessages = this.createToolResultMessages(
      firstResult.tool_calls,
      toolResults,
    );

    // Create follow-up completion with tool results
    const followUpParams: CompletionParams = {
      ...originalParams,
      messages: [...originalParams.messages, ...toolMessages],
      // Don't include tools in follow-up to prevent infinite loops
      tools: undefined,
      tool_choice: undefined,
    };

    // Get final response from LLM
    const finalResult = await llmProvider.generateCompletion(followUpParams);

    return finalResult;
  }

  /**
   * Get available tools for an agent
   */
  getAvailableToolsForAgent(
    agentToolConfig?: AgentToolConfig,
  ): ToolDefinition[] {
    if (!agentToolConfig || !agentToolConfig.enabledTools.length) {
      return [];
    }

    return toolRegistry
      .getToolDefinitions(agentToolConfig.enabledTools)
      .map((tool) => ({
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
