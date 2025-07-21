import {
  Tool,
  ToolDefinition,
  ToolExecutionResult,
  ToolContext,
} from '@/types/tools';
import {
  MCPToolSchema,
  MCPToolCall,
  MCPToolResult,
  MCPContent,
} from '@/types/mcp';
import { MCPClient } from './mcp-client';

/**
 * Wrapper class that adapts MCP tools to the internal Tool interface
 */
export class MCPTool implements Tool {
  public readonly definition: ToolDefinition;
  public readonly category = 'mcp';
  public readonly version = '1.0.0';
  public readonly author: string;

  private mcpClient: MCPClient;
  private mcpSchema: MCPToolSchema;
  private serverId: string;

  constructor(
    mcpClient: MCPClient,
    mcpSchema: MCPToolSchema,
    serverId: string,
  ) {
    this.mcpClient = mcpClient;
    this.mcpSchema = mcpSchema;
    this.serverId = serverId;
    this.author = `MCP Server: ${serverId}`;

    // Convert MCP tool schema to internal ToolDefinition format
    this.definition = this.convertMCPSchemaToToolDefinition(mcpSchema);
  }

  /**
   * Execute the MCP tool
   */
  async execute(
    parameters: Record<string, any>,
    context?: ToolContext,
  ): Promise<ToolExecutionResult> {
    try {
      // Validate that the MCP client is connected
      if (!this.mcpClient.isConnected()) {
        return {
          success: false,
          error: `MCP server '${this.serverId}' is not connected`,
        };
      }

      // Create MCP tool call
      const toolCall: MCPToolCall = {
        name: this.mcpSchema.name,
        arguments: parameters,
      };

      // Execute the tool via MCP client
      const mcpResult: MCPToolResult =
        await this.mcpClient.executeTool(toolCall);

      // Convert MCP result to internal format
      const result = this.convertMCPResultToToolResult(mcpResult);

      return {
        success: !mcpResult.isError,
        data: result,
        metadata: {
          serverId: this.serverId,
          mcpToolName: this.mcpSchema.name,
          executionTime: Date.now(), // Could be enhanced with actual timing
        },
      };
    } catch (error) {
      return {
        success: false,
        error: `MCP tool execution failed: ${error instanceof Error ? error.message : String(error)}`,
        metadata: {
          serverId: this.serverId,
          mcpToolName: this.mcpSchema.name,
        },
      };
    }
  }

  /**
   * Validate tool parameters against MCP schema
   */
  validate(parameters: Record<string, any>): boolean {
    try {
      return this.validateParameters(parameters, this.mcpSchema.inputSchema);
    } catch (error) {
      console.warn(
        `Parameter validation failed for MCP tool '${this.mcpSchema.name}':`,
        error,
      );
      return false;
    }
  }

  /**
   * Get the MCP server ID this tool belongs to
   */
  getServerId(): string {
    return this.serverId;
  }

  /**
   * Get the original MCP schema
   */
  getMCPSchema(): MCPToolSchema {
    return this.mcpSchema;
  }

  /**
   * Check if the underlying MCP client is connected
   */
  isAvailable(): boolean {
    return this.mcpClient.isConnected();
  }

  /**
   * Convert MCP tool schema to internal ToolDefinition format
   */
  private convertMCPSchemaToToolDefinition(
    mcpSchema: MCPToolSchema,
  ): ToolDefinition {
    return {
      name: `mcp_${this.serverId}_${mcpSchema.name}`, // Prefix to avoid naming conflicts
      description: `${mcpSchema.description} (from MCP server: ${this.serverId})`,
      parameters: {
        type: 'object',
        properties: this.convertMCPProperties(
          mcpSchema.inputSchema.properties || {},
        ),
        required: mcpSchema.inputSchema.required || [],
      },
    };
  }

  /**
   * Convert MCP schema properties to internal format
   */
  private convertMCPProperties(
    mcpProperties: Record<string, any>,
  ): Record<string, any> {
    const converted: Record<string, any> = {};

    for (const [name, prop] of Object.entries(mcpProperties)) {
      converted[name] = this.convertMCPProperty(prop);
    }

    return converted;
  }

  /**
   * Convert individual MCP property to internal format
   */
  private convertMCPProperty(mcpProp: any): any {
    // Handle different MCP property formats and convert to internal format
    const converted: any = {
      type: mcpProp.type || 'string',
      description: mcpProp.description || '',
    };

    // Copy over additional constraints
    if (mcpProp.enum) converted.enum = mcpProp.enum;
    if (mcpProp.minimum !== undefined) converted.minimum = mcpProp.minimum;
    if (mcpProp.maximum !== undefined) converted.maximum = mcpProp.maximum;
    if (mcpProp.minLength !== undefined)
      converted.minLength = mcpProp.minLength;
    if (mcpProp.maxLength !== undefined)
      converted.maxLength = mcpProp.maxLength;

    // Handle nested objects and arrays
    if (mcpProp.type === 'object' && mcpProp.properties) {
      converted.properties = this.convertMCPProperties(mcpProp.properties);
    }
    if (mcpProp.type === 'array' && mcpProp.items) {
      converted.items = this.convertMCPProperty(mcpProp.items);
    }

    return converted;
  }

  /**
   * Convert MCP result to internal tool result format
   */
  private convertMCPResultToToolResult(mcpResult: MCPToolResult): any {
    if (!mcpResult.content || mcpResult.content.length === 0) {
      return null;
    }

    // If single content item, return it directly
    if (mcpResult.content.length === 1) {
      return this.convertMCPContent(mcpResult.content[0]);
    }

    // Multiple content items, return as array
    return mcpResult.content.map((content) => this.convertMCPContent(content));
  }

  /**
   * Convert individual MCP content to appropriate format
   */
  private convertMCPContent(content: MCPContent): any {
    switch (content.type) {
      case 'text':
        return content.text || '';

      case 'image':
        return {
          type: 'image',
          data: content.data,
          mimeType: content.mimeType,
        };

      case 'resource':
        return {
          type: 'resource',
          data: content.data,
          mimeType: content.mimeType,
        };

      default:
        return content;
    }
  }

  /**
   * Validate parameters against MCP schema
   */
  private validateParameters(
    parameters: Record<string, any>,
    schema: any,
  ): boolean {
    // Basic validation - in a production environment, you might want to use a proper JSON schema validator
    if (schema.type !== 'object') {
      return false;
    }

    const properties = schema.properties || {};
    const required = schema.required || [];

    // Check required properties
    for (const requiredProp of required) {
      if (!(requiredProp in parameters)) {
        return false;
      }
    }

    // Validate each provided parameter
    for (const [name, value] of Object.entries(parameters)) {
      const propSchema = properties[name];
      if (propSchema && !this.validateValue(value, propSchema)) {
        return false;
      }
    }

    return true;
  }

  /**
   * Validate a value against a schema property
   */
  private validateValue(value: any, propSchema: any): boolean {
    const type = propSchema.type;

    // Type validation
    switch (type) {
      case 'string':
        if (typeof value !== 'string') return false;
        if (propSchema.minLength && value.length < propSchema.minLength)
          return false;
        if (propSchema.maxLength && value.length > propSchema.maxLength)
          return false;
        if (propSchema.enum && !propSchema.enum.includes(value)) return false;
        break;

      case 'number':
      case 'integer':
        if (typeof value !== 'number') return false;
        if (type === 'integer' && !Number.isInteger(value)) return false;
        if (propSchema.minimum !== undefined && value < propSchema.minimum)
          return false;
        if (propSchema.maximum !== undefined && value > propSchema.maximum)
          return false;
        if (propSchema.enum && !propSchema.enum.includes(value)) return false;
        break;

      case 'boolean':
        if (typeof value !== 'boolean') return false;
        break;

      case 'array':
        if (!Array.isArray(value)) return false;
        if (propSchema.items) {
          for (const item of value) {
            if (!this.validateValue(item, propSchema.items)) return false;
          }
        }
        break;

      case 'object':
        if (typeof value !== 'object' || value === null || Array.isArray(value))
          return false;
        if (propSchema.properties) {
          return this.validateParameters(value, propSchema);
        }
        break;

      default:
        // Unknown type, allow it
        break;
    }

    return true;
  }
}

/**
 * Factory function to create MCP tools from MCP schemas
 */
export function createMCPTools(
  mcpClient: MCPClient,
  mcpSchemas: MCPToolSchema[],
  serverId: string,
): MCPTool[] {
  return mcpSchemas.map((schema) => new MCPTool(mcpClient, schema, serverId));
}

/**
 * Helper function to check if a tool is an MCP tool
 */
export function isMCPTool(tool: Tool): tool is MCPTool {
  return tool instanceof MCPTool;
}

/**
 * Helper function to extract server ID from MCP tool name
 */
export function extractServerIdFromMCPToolName(
  toolName: string,
): string | null {
  const match = toolName.match(/^mcp_([^_]+)_/);
  return match ? match[1] : null;
}
