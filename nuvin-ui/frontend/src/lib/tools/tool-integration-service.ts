import type {
  CompletionParams,
  CompletionResult,
  ChatMessage,
  ToolDefinition,
  ToolCall as LLMToolCall,
} from "@/lib/providers/llm-provider";
import type {
  ToolCall,
  ToolCallResult,
  AgentToolConfig,
  ToolContext,
} from "@/types/tools";
import { toolRegistry } from "./tool-registry";

export class ToolIntegrationService {
  /**
   * Enhance completion parameters with available tools
   */
  enhanceCompletionParams(
    params: CompletionParams,
    agentToolConfig?: AgentToolConfig
  ): CompletionParams {
    // Always include MCP tools + any explicitly enabled tools
    const enabledToolNames = new Set(agentToolConfig?.enabledTools || []);

    // Get all MCP tools (they should always be available)
    const mcpTools = toolRegistry.getAllMCPTools();
    // console.log(
    //   `[MCP] Found ${mcpTools.length} MCP tools, adding available ones to agent`
    // );

    for (const mcpTool of mcpTools) {
      if (mcpTool.isAvailable()) {
        enabledToolNames.add(mcpTool.definition.name);
        // console.log(
        //   `[MCP] Added tool '${
        //     mcpTool.definition.name
        //   }' from server '${mcpTool.getServerId()}'`
        // );
      } else {
        console.log(
          `[MCP] Skipped unavailable tool '${
            mcpTool.definition.name
          }' from server '${mcpTool.getServerId()}'`
        );
      }
    }

    // If no tools are enabled (including MCP), return params as-is
    if (enabledToolNames.size === 0) {
      return params;
    }

    // Get tool definitions for all enabled tools
    const toolDefinitions = toolRegistry.getToolDefinitions(
      Array.from(enabledToolNames)
    );

    // Convert to LLM provider format
    const tools: ToolDefinition[] = toolDefinitions.map((tool) => ({
      type: "function",
      function: {
        name: tool.name,
        description: tool.description,
        parameters: tool.parameters,
      },
    }));

    return {
      ...params,
      tools,
      tool_choice: "auto", // Let the LLM decide when to use tools
    };
  }

  /**
   * Process completion result and handle tool calls
   */
  async processCompletionResult(
    result: CompletionResult,
    context: ToolContext,
    agentToolConfig?: AgentToolConfig
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

    // Check if tools are enabled for this agent (including MCP tools)
    const enabledToolNames = new Set(agentToolConfig?.enabledTools || []);

    // Add available MCP tools to the enabled set
    const mcpTools = toolRegistry.getAllMCPTools();
    for (const mcpTool of mcpTools) {
      if (mcpTool.isAvailable()) {
        enabledToolNames.add(mcpTool.definition.name);
      }
    }

    if (enabledToolNames.size === 0) {
      return {
        result: {
          content:
            result.content ||
            "The assistant attempted to use tools, but no tools are available.",
        },
        requiresFollowUp: false,
      };
    }

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
          error
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
      toolCalls.map((c) => c.name)
    );

    // Execute tool calls
    const maxConcurrent = agentToolConfig?.maxConcurrentCalls || 3;
    const toolResults = await toolRegistry.executeToolCalls(
      toolCalls,
      context,
      maxConcurrent
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
    toolResults: ToolCallResult[]
  ): ChatMessage[] {
    const messages: ChatMessage[] = [];

    // Add the assistant message with tool calls
    messages.push({
      role: "assistant",
      content: null,
      tool_calls: originalToolCalls,
    });

    // Add tool result messages
    toolResults.forEach((result) => {
      const toolCall = originalToolCalls.find((call) => call.id === result.id);
      if (toolCall) {
        messages.push({
          role: "tool",
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
    agentToolConfig?: AgentToolConfig
  ): Promise<CompletionResult> {
    if (!firstResult.tool_calls) {
      return firstResult;
    }

    // Create messages with tool results
    const toolMessages = this.createToolResultMessages(
      firstResult.tool_calls,
      toolResults
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
    agentToolConfig?: AgentToolConfig
  ): ToolDefinition[] {
    // Include both explicitly enabled tools and available MCP tools
    const enabledToolNames = new Set(agentToolConfig?.enabledTools || []);

    // Always include available MCP tools
    const mcpTools = toolRegistry.getAllMCPTools();
    for (const mcpTool of mcpTools) {
      if (mcpTool.isAvailable()) {
        enabledToolNames.add(mcpTool.definition.name);
      }
    }

    if (enabledToolNames.size === 0) {
      return [];
    }

    return toolRegistry
      .getToolDefinitions(Array.from(enabledToolNames))
      .map((tool) => ({
        type: "function" as const,
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
      (toolName) => !toolRegistry.hasTool(toolName)
    );

    if (missingTools.length > 0) {
      errors.push(`Missing tools: ${missingTools.join(", ")}`);
    }

    // Validate concurrent calls limit
    if (agentToolConfig.maxConcurrentCalls !== undefined) {
      if (
        agentToolConfig.maxConcurrentCalls < 1 ||
        agentToolConfig.maxConcurrentCalls > 10
      ) {
        errors.push("maxConcurrentCalls must be between 1 and 10");
      }
    }

    // Validate timeout
    if (agentToolConfig.timeoutMs !== undefined) {
      if (
        agentToolConfig.timeoutMs < 1000 ||
        agentToolConfig.timeoutMs > 300000
      ) {
        errors.push("timeoutMs must be between 1000 and 300000 (5 minutes)");
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
