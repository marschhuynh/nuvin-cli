import {
  Tool,
  ToolDefinition,
  ToolCall,
  ToolCallResult,
  ToolContext,
} from '@/types/tools';
import { MCPTool, isMCPTool } from '@/lib/mcp/mcp-tool';

export class ToolRegistry {
  private tools: Map<string, Tool> = new Map();
  private categories: Map<string, string[]> = new Map();
  private mcpTools: Map<string, Map<string, MCPTool>> = new Map(); // serverId -> toolName -> MCPTool

  /**
   * Register a new tool in the registry
   */
  registerTool(tool: Tool): void {
    if (this.tools.has(tool.definition.name)) {
      throw new Error(
        `Tool with name '${tool.definition.name}' is already registered`,
      );
    }

    // Validate tool definition
    this.validateToolDefinition(tool.definition);

    this.tools.set(tool.definition.name, tool);

    // Add to category
    if (tool.category) {
      if (!this.categories.has(tool.category)) {
        this.categories.set(tool.category, []);
      }
      this.categories.get(tool.category)!.push(tool.definition.name);
    }
  }

  /**
   * Unregister a tool from the registry
   */
  unregisterTool(toolName: string): boolean {
    const tool = this.tools.get(toolName);
    if (!tool) {
      return false;
    }

    // Remove from category
    if (tool.category) {
      const categoryTools = this.categories.get(tool.category);
      if (categoryTools) {
        const index = categoryTools.indexOf(toolName);
        if (index > -1) {
          categoryTools.splice(index, 1);
        }
        if (categoryTools.length === 0) {
          this.categories.delete(tool.category);
        }
      }
    }

    return this.tools.delete(toolName);
  }

  /**
   * Get a tool by name
   */
  getTool(toolName: string): Tool | undefined {
    return this.tools.get(toolName);
  }

  /**
   * Get all registered tools
   */
  getAllTools(): Tool[] {
    return Array.from(this.tools.values());
  }

  /**
   * Get tool definitions for LLM function calling
   */
  getToolDefinitions(enabledTools?: string[]): ToolDefinition[] {
    if (enabledTools) {
      return enabledTools
        .map((name) => this.tools.get(name))
        .filter((tool) => tool !== undefined)
        .map((tool) => tool!.definition);
    }
    return Array.from(this.tools.values()).map((tool) => tool.definition);
  }

  /**
   * Get tools by category
   */
  getToolsByCategory(category: string): Tool[] {
    const toolNames = this.categories.get(category) || [];
    return toolNames
      .map((name) => this.tools.get(name))
      .filter((tool) => tool !== undefined) as Tool[];
  }

  /**
   * Get all categories
   */
  getCategories(): string[] {
    return Array.from(this.categories.keys());
  }

  /**
   * Execute a tool call
   */
  async executeTool(
    toolCall: ToolCall,
    context?: ToolContext,
  ): Promise<ToolCallResult> {
    const tool = this.tools.get(toolCall.name);

    if (!tool) {
      return {
        id: toolCall.id,
        name: toolCall.name,
        result: {
          success: false,
          error: `Tool '${toolCall.name}' not found`,
        },
      };
    }

    try {
      // Validate parameters if validator exists
      if (tool.validate && !tool.validate(toolCall.parameters)) {
        return {
          id: toolCall.id,
          name: toolCall.name,
          result: {
            success: false,
            error: 'Invalid parameters',
          },
        };
      }

      // Execute the tool
      const result = await tool.execute(toolCall.parameters, context);

      return {
        id: toolCall.id,
        name: toolCall.name,
        result,
      };
    } catch (error) {
      return {
        id: toolCall.id,
        name: toolCall.name,
        result: {
          success: false,
          error:
            error instanceof Error ? error.message : 'Unknown error occurred',
        },
      };
    }
  }

  /**
   * Execute multiple tool calls concurrently
   */
  async executeToolCalls(
    toolCalls: ToolCall[],
    context?: ToolContext,
    maxConcurrent: number = 5,
  ): Promise<ToolCallResult[]> {
    const results: ToolCallResult[] = [];

    // Process in batches to limit concurrency
    for (let i = 0; i < toolCalls.length; i += maxConcurrent) {
      const batch = toolCalls.slice(i, i + maxConcurrent);
      const batchPromises = batch.map((toolCall) =>
        this.executeTool(toolCall, context),
      );
      const batchResults = await Promise.all(batchPromises);
      results.push(...batchResults);
    }

    return results;
  }

  /**
   * Check if a tool is registered
   */
  hasTool(toolName: string): boolean {
    return this.tools.has(toolName);
  }

  /**
   * Get tool count
   */
  getToolCount(): number {
    return this.tools.size;
  }

  /**
   * Clear all tools
   */
  clear(): void {
    this.tools.clear();
    this.categories.clear();
    this.mcpTools.clear();
  }

  /**
   * Register MCP tools from a server
   */
  registerMCPTools(serverId: string, mcpTools: MCPTool[]): void {
    // Create server map if it doesn't exist
    if (!this.mcpTools.has(serverId)) {
      this.mcpTools.set(serverId, new Map());
    }

    const serverTools = this.mcpTools.get(serverId)!;

    // Remove existing tools for this server from main registry
    for (const [toolName] of serverTools) {
      this.tools.delete(toolName);
      // Remove from category
      for (const [category, toolNames] of this.categories) {
        const index = toolNames.indexOf(toolName);
        if (index > -1) {
          toolNames.splice(index, 1);
          if (toolNames.length === 0) {
            this.categories.delete(category);
          }
        }
      }
    }

    // Clear server tools map
    serverTools.clear();

    // Register new tools
    for (const mcpTool of mcpTools) {
      const toolName = mcpTool.definition.name;

      // Add to main registry
      this.tools.set(toolName, mcpTool);

      // Add to server-specific map
      serverTools.set(toolName, mcpTool);

      // Add to category
      if (mcpTool.category) {
        if (!this.categories.has(mcpTool.category)) {
          this.categories.set(mcpTool.category, []);
        }
        this.categories.get(mcpTool.category)!.push(toolName);
      }
    }
  }

  /**
   * Unregister all MCP tools from a server
   */
  unregisterMCPServer(serverId: string): boolean {
    const serverTools = this.mcpTools.get(serverId);
    if (!serverTools) {
      return false;
    }

    // Remove all tools for this server from main registry
    for (const [toolName] of serverTools) {
      this.tools.delete(toolName);

      // Remove from categories
      for (const [category, toolNames] of this.categories) {
        const index = toolNames.indexOf(toolName);
        if (index > -1) {
          toolNames.splice(index, 1);
          if (toolNames.length === 0) {
            this.categories.delete(category);
          }
        }
      }
    }

    // Remove server from MCP tools map
    return this.mcpTools.delete(serverId);
  }

  /**
   * Get MCP tools for a specific server
   */
  getMCPToolsForServer(serverId: string): MCPTool[] {
    const serverTools = this.mcpTools.get(serverId);
    return serverTools ? Array.from(serverTools.values()) : [];
  }

  /**
   * Get all MCP tools
   */
  getAllMCPTools(): MCPTool[] {
    const allMCPTools: MCPTool[] = [];
    for (const serverTools of this.mcpTools.values()) {
      allMCPTools.push(...serverTools.values());
    }
    return allMCPTools;
  }

  /**
   * Get all built-in (non-MCP) tools
   */
  getBuiltInTools(): Tool[] {
    return Array.from(this.tools.values()).filter((tool) => !isMCPTool(tool));
  }

  /**
   * Check if a tool is from MCP
   */
  isMCPTool(toolName: string): boolean {
    const tool = this.tools.get(toolName);
    return tool ? isMCPTool(tool) : false;
  }

  /**
   * Get MCP server ID for a tool
   */
  getMCPServerIdForTool(toolName: string): string | null {
    for (const [serverId, serverTools] of this.mcpTools) {
      if (serverTools.has(toolName)) {
        return serverId;
      }
    }
    return null;
  }

  /**
   * Get available MCP servers
   */
  getMCPServerIds(): string[] {
    return Array.from(this.mcpTools.keys());
  }

  /**
   * Check if MCP server has tools registered
   */
  hasMCPServer(serverId: string): boolean {
    return this.mcpTools.has(serverId);
  }

  /**
   * Get tool count for MCP server
   */
  getMCPServerToolCount(serverId: string): number {
    const serverTools = this.mcpTools.get(serverId);
    return serverTools ? serverTools.size : 0;
  }

  /**
   * Validate tool definition
   */
  private validateToolDefinition(definition: ToolDefinition): void {
    if (!definition.name || typeof definition.name !== 'string') {
      throw new Error('Tool name is required and must be a string');
    }

    if (!definition.description || typeof definition.description !== 'string') {
      throw new Error('Tool description is required and must be a string');
    }

    if (!definition.parameters || definition.parameters.type !== 'object') {
      throw new Error('Tool parameters must be an object schema');
    }

    // Validate parameter names
    const nameRegex = /^[a-zA-Z][a-zA-Z0-9_]*$/;
    if (!nameRegex.test(definition.name)) {
      throw new Error(
        'Tool name must start with a letter and contain only letters, numbers, and underscores',
      );
    }
  }

  /**
   * Export registry state for persistence
   */
  export(): { tools: string[]; categories: Record<string, string[]> } {
    return {
      tools: Array.from(this.tools.keys()),
      categories: Object.fromEntries(this.categories.entries()),
    };
  }
}

// Singleton instance
export const toolRegistry = new ToolRegistry();
