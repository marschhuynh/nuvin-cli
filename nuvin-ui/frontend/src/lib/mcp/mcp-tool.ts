import type { Tool, ToolDefinition, ToolExecutionResult, ToolContext } from '@/types/tools';
import type { MCPToolSchema, MCPToolCall, MCPToolResult, MCPContent } from '@/types/mcp';
import type { MCPClient } from './mcp-client';

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
  private injectedParameters: Set<string> = new Set();

  constructor(mcpClient: MCPClient, mcpSchema: MCPToolSchema, serverId: string) {
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
  async execute(parameters: Record<string, any>, context?: ToolContext): Promise<ToolExecutionResult> {
    try {
      // Validate that the MCP client is connected
      if (!this.mcpClient.isConnected()) {
        return {
          status: 'error',
          type: 'text',
          result: `MCP server '${this.serverId}' is not connected`,
        };
      }

      // Filter out only the parameters that we injected (not originally part of the MCP tool schema)
      const filteredParameters = { ...parameters };
      for (const injectedParam of this.injectedParameters) {
        delete filteredParameters[injectedParam];
      }

      // Create MCP tool call
      const toolCall: MCPToolCall = {
        name: this.mcpSchema.name,
        arguments: filteredParameters,
      };

      // Execute the tool via MCP client with timeout from context
      const timeoutMs = context?.agentToolConfig?.timeoutMs;
      const mcpResult: MCPToolResult = await this.mcpClient.executeTool(toolCall, timeoutMs);

      // Convert MCP result to internal format
      const result = this.convertMCPResultToToolResult(mcpResult);

      if (mcpResult.isError) {
        return {
          status: 'error',
          type: 'text',
          result: typeof result === 'string' ? result : JSON.stringify(result),
          metadata: {
            serverId: this.serverId,
            mcpToolName: this.mcpSchema.name,
            executionTime: Date.now(),
          },
        };
      }

      return {
        status: 'success',
        type: typeof result === 'string' ? 'text' : 'json',
        result: result,
        metadata: {
          serverId: this.serverId,
          mcpToolName: this.mcpSchema.name,
          executionTime: Date.now(),
        },
      };
    } catch (error) {
      return {
        status: 'error',
        type: 'text',
        result: `MCP tool execution failed: ${error instanceof Error ? error.message : String(error)}`,
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
      console.warn(`Parameter validation failed for MCP tool '${this.mcpSchema.name}':`, error);
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
  private convertMCPSchemaToToolDefinition(mcpSchema: MCPToolSchema): ToolDefinition {
    const convertedProperties = this.convertMCPProperties(
      mcpSchema.inputSchema.properties || {},
      mcpSchema.inputSchema,
    );

    // Inject description parameter for ALL MCP tools if it doesn't already exist
    if (!convertedProperties.description) {
      convertedProperties.description = {
        type: 'string',
        description:
          "Clear, concise description of what this command does in 5-10 words. Examples:\nInput: ls\nOutput: Lists files in current directory\n\nInput: git status\nOutput: Shows working tree status\n\nInput: npm install\nOutput: Installs package dependencies\n\nInput: mkdir foo\nOutput: Creates directory 'foo'",
      };
      // Track that we injected this parameter so we can filter it out during execution
      this.injectedParameters.add('description');
    }

    // Validate the converted schema
    for (const [key, prop] of Object.entries(convertedProperties)) {
      this.validateToolParameter(prop, `${mcpSchema.name}.${key}`);
    }

    return {
      name: this.buildShortUniqueName(mcpSchema.name),
      description: `${mcpSchema.description} (from MCP server: ${this.serverId})`,
      parameters: {
        type: 'object',
        properties: convertedProperties,
        required: mcpSchema.inputSchema.required || [],
      },
    };
  }

  /**
   * Build a short but unique tool name for MCP tools.
   * Format: m_<srv>_<tool> where
   *  - <srv> is a 5-6 char base36 hash of the serverId
   *  - <tool> is a truncated, sanitized original tool name with a 4-char hash suffix
   * This keeps names short, readable, and collision-resistant while satisfying
   * the registry's name character constraints.
   */
  private buildShortUniqueName(originalToolName: string): string {
    const srv = this.shortHashBase36(this.serverId).slice(0, 6);
    const sanitized = this.sanitizeName(originalToolName);
    const shortPart = sanitized.slice(0, 16) || 'tool';
    const uniq = this.shortHashBase36(originalToolName).slice(0, 4);
    return `m_${srv}_${shortPart}_${uniq}`;
  }

  /**
   * Sanitize a name to [a-zA-Z0-9_]+, replacing other chars with underscores.
   */
  private sanitizeName(name: string): string {
    // Replace non-alphanumeric characters with underscore and collapse repeats
    return name
      .replace(/[^a-zA-Z0-9_]+/g, '_')
      .replace(/^_+|_+$/g, '')
      .replace(/_{2,}/g, '_');
  }

  /**
   * Deterministic short hash using djb2, returned as lowercase base36 string.
   */
  private shortHashBase36(str: string): string {
    let hash = 5381 >>> 0; // ensure uint32
    for (let i = 0; i < str.length; i++) {
      hash = (((hash << 5) + hash) ^ str.charCodeAt(i)) >>> 0; // djb2 xor variant
    }
    // Convert to base36 for compactness, pad to at least 6 chars
    const base = hash.toString(36);
    return base.padStart(6, '0');
  }

  /**
   * Convert MCP schema properties to internal format
   */
  private convertMCPProperties(mcpProperties: Record<string, any>, rootSchema?: any): Record<string, any> {
    const converted: Record<string, any> = {};

    for (const [name, prop] of Object.entries(mcpProperties)) {
      converted[name] = this.convertMCPProperty(prop, rootSchema);
    }

    return converted;
  }

  /**
   * Validate that a tool parameter schema is valid
   */
  private validateToolParameter(param: any, path: string = ''): void {
    if (param.type === 'array' && !param.items) {
      console.warn(`Invalid tool schema at ${path}: Array type missing 'items' property. Adding fallback.`);
    }

    if (param.type === 'object' && param.properties) {
      for (const [key, prop] of Object.entries(param.properties)) {
        this.validateToolParameter(prop, path ? `${path}.${key}` : key);
      }
    }

    if (param.type === 'array' && param.items) {
      this.validateToolParameter(param.items, `${path}[]`);
    }
  }

  /**
   * Convert individual MCP property to internal format
   */
  private convertMCPProperty(mcpProp: any, rootSchema?: any): any {
    // Handle $ref references first
    if (mcpProp.$ref && rootSchema && rootSchema.$defs) {
      const refPath = mcpProp.$ref.replace('#/', '').split('/');
      let resolved = rootSchema;

      for (const segment of refPath) {
        if (resolved && typeof resolved === 'object' && segment in resolved) {
          resolved = resolved[segment];
        } else {
          console.warn(`Failed to resolve $ref: ${mcpProp.$ref}`);
          resolved = null;
          break;
        }
      }

      if (resolved && typeof resolved === 'object') {
        // Recursively convert the resolved schema
        return this.convertMCPProperty(resolved, rootSchema);
      }
    }

    // Handle anyOf unions (pick first non-null type)
    if (mcpProp.anyOf && Array.isArray(mcpProp.anyOf)) {
      const nonNullType = mcpProp.anyOf.find((option: any) => option.type && option.type !== 'null');
      if (nonNullType) {
        return this.convertMCPProperty(nonNullType, rootSchema);
      }
    }

    // Determine the type, preserving number types
    let propType = mcpProp.type;
    if (!propType) {
      // If no type specified, try to infer from other properties
      if (mcpProp.properties) {
        propType = 'object';
      } else if (mcpProp.items) {
        propType = 'array';
      } else if (mcpProp.enum) {
        propType = typeof mcpProp.enum[0] === 'number' ? 'number' : 'string';
      } else {
        propType = 'string'; // fallback
      }
    }

    // Handle different MCP property formats and convert to internal format
    const converted: any = {
      type: propType,
      description: mcpProp.description || '',
    };

    // Copy over additional constraints
    if (mcpProp.enum) converted.enum = mcpProp.enum;
    if (mcpProp.minimum !== undefined) converted.minimum = mcpProp.minimum;
    if (mcpProp.maximum !== undefined) converted.maximum = mcpProp.maximum;
    if (mcpProp.minLength !== undefined) converted.minLength = mcpProp.minLength;
    if (mcpProp.maxLength !== undefined) converted.maxLength = mcpProp.maxLength;
    if (mcpProp.items) converted.items = mcpProp.items;
    if (mcpProp.additionalProperties !== undefined) converted.additionalProperties = mcpProp.additionalProperties;
    if (mcpProp.required) converted.required = mcpProp.required;

    // Handle nested objects and arrays
    if (mcpProp.type === 'object' && mcpProp.properties) {
      converted.properties = this.convertMCPProperties(mcpProp.properties, rootSchema);
    }
    if (mcpProp.type === 'array') {
      // JSON Schema requires 'items' property for arrays
      if (mcpProp.items) {
        converted.items = this.convertMCPProperty(mcpProp.items, rootSchema);
      } else {
        // Fallback to generic schema if items not specified
        converted.items = {
          type: 'string',
          description: 'Array item',
        };
      }
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
  private validateParameters(parameters: Record<string, any>, schema: any): boolean {
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
        if (propSchema.minLength && value.length < propSchema.minLength) return false;
        if (propSchema.maxLength && value.length > propSchema.maxLength) return false;
        if (propSchema.enum && !propSchema.enum.includes(value)) return false;
        break;

      case 'number':
      case 'integer':
        if (typeof value !== 'number') return false;
        if (type === 'integer' && !Number.isInteger(value)) return false;
        if (propSchema.minimum !== undefined && value < propSchema.minimum) return false;
        if (propSchema.maximum !== undefined && value > propSchema.maximum) return false;
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
        if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
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
export function createMCPTools(mcpClient: MCPClient, mcpSchemas: MCPToolSchema[], serverId: string): MCPTool[] {
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
export function extractServerIdFromMCPToolName(toolName: string): string | null {
  // Legacy pattern: mcp_<serverId>_<toolName>
  const legacy = toolName.match(/^mcp_([^_]+)_/);
  if (legacy) return legacy[1];

  // New short pattern: m_<srvHash>_<shortName>_<toolHash>
  // Server ID is no longer recoverable from the tool name; return null.
  return null;
}
