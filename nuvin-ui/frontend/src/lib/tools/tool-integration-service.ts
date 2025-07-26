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

    // Check if tools are enabled for this agent (only explicitly enabled tools)
    const enabledToolNames = new Set(agentToolConfig?.enabledTools || []);

    // Only include MCP tools that are explicitly enabled
    const mcpTools = toolRegistry.getAllMCPTools();
    const explicitlyEnabledMCPTools = mcpTools.filter(
      (mcpTool) =>
        enabledToolNames.has(mcpTool.definition.name) && mcpTool.isAvailable(),
    );

    // Filter tool calls to only include enabled tools
    const allowedToolCalls = result.tool_calls.filter((call) =>
      enabledToolNames.has(call.function.name),
    );

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

    console.log(
      `[MCP] Processing ${toolCalls.length} tool calls:`,
      toolCalls.map((c) => c.name),
    );

    // Execute tool calls
    const maxConcurrent = agentToolConfig?.maxConcurrentCalls || 3;
    const toolResults = await toolRegistry.executeToolCalls(
      toolCalls,
      context,
      maxConcurrent,
    );

    console.log(`[MCP] Tool execution results:`, toolResults);

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
   * Embed tool results directly into message content
   */
  embedToolResultsInContent(
    originalContent: string,
    originalToolCalls: LLMToolCall[],
    toolResults: ToolCallResult[],
  ): string {
    // If no tool calls, return original content
    if (!originalToolCalls || originalToolCalls.length === 0) {
      return originalContent;
    }

    // Build tool calls markup with results
    let toolCallsMarkup = '<|tool_calls_section_begin|>';

    originalToolCalls.forEach((toolCall) => {
      const result = toolResults.find((r) => r.id === toolCall.id);

      toolCallsMarkup += `<|tool_call_begin|>${toolCall.function.name}:${toolCall.id}<|tool_call_argument_begin|>${toolCall.function.arguments}`;

      if (result) {
        const resultJson = JSON.stringify({
          success: result.result.success,
          data: result.result.data,
          error: result.result.error,
          metadata: result.result.metadata,
        });
        toolCallsMarkup += `<|tool_call_result_begin|>${resultJson}`;
      }

      toolCallsMarkup += '<|tool_call_end|>';
    });

    toolCallsMarkup += '<|tool_calls_section_end|>';

    // Combine tool calls markup with original content
    return toolCallsMarkup + (originalContent ? '\n\n' + originalContent : '');
  }

  /**
   * Complete tool calling flow - execute tools and get final response
   */
  async completeToolCallingFlow(
    originalParams: CompletionParams,
    firstResult: CompletionResult,
    toolResults: ToolCallResult[],
    llmProvider: LLMProvider, // LLMProvider instance
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

    const finalResult = await llmProvider.generateCompletion(followUpParams);

    // Embed tool results in the content so they're preserved in the UI
    const contentWithToolResults = this.embedToolResultsInContent(
      finalResult.content || '',
      firstResult.tool_calls,
      toolResults,
    );

    return {
      ...finalResult,
      content: contentWithToolResults,
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
