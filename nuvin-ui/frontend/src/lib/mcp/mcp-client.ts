import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import type { Transport } from '@modelcontextprotocol/sdk/shared/transport.js';
import type {
  CallToolRequest,
  ListToolsRequest,
  ListResourcesRequest,
  ListResourceTemplatesRequest,
  ReadResourceRequest,
} from '@modelcontextprotocol/sdk/types.js';
import {
  CallToolResultSchema,
  ListToolsResultSchema,
  ListResourcesResultSchema,
  ListResourceTemplatesResultSchema,
  ReadResourceResultSchema,
} from '@modelcontextprotocol/sdk/types.js';
import type {
  MCPTransportOptions,
  MCPToolSchema,
  MCPToolCall,
  MCPToolResult,
  MCPResource,
  MCPResourceTemplate,
  MCPResourceContents,
  MCPClientEvent,
  MCPClientEventHandler,
} from '@/types/mcp';
import { StreamableHTTPClientTransportWithProxy } from './transport/streamable-http';
import { StdioBrowserTransport } from './transport/stdio-browser';
import { StdioWailsTransport } from './transport/stdio-wails';
import { isWailsEnvironment } from '@/lib/browser-runtime';

// Type for MCP transport instances
type MCPTransportInstance =
  | StreamableHTTPClientTransportWithProxy
  | StdioBrowserTransport
  | StdioWailsTransport;

// Lightweight debug toggle: set localStorage.MCP_DEBUG = '1' to enable
function mcpDebugEnabled(): boolean {
  try {
    if (typeof window !== 'undefined' && (window as any).__MCP_DEBUG__) return true;
    return typeof localStorage !== 'undefined' && localStorage.getItem('MCP_DEBUG') === '1';
  } catch {
    return false;
  }
}
function mcpDebug(...args: any[]) {
  if (mcpDebugEnabled()) console.debug('[MCP]', ...args);
}

export class MCPClient {
  private client: Client | null = null;
  private transport: MCPTransportInstance | null = null;
  private serverId: string;
  private transportOptions: MCPTransportOptions;
  private eventHandlers: MCPClientEventHandler[] = [];

  // Cached data
  private tools: Map<string, MCPToolSchema> = new Map();
  private resources: Map<string, MCPResource> = new Map();
  private resourceTemplates: Map<string, MCPResourceTemplate> = new Map();
  private initialized = false;
  private serverInfo: any = null;

  constructor(
    serverId: string,
    transportOptions: MCPTransportOptions,
    private timeoutMs: number = 30000,
  ) {
    this.serverId = serverId;
    this.transportOptions = transportOptions;
    mcpDebug('MCPClient constructed', { serverId, transport: transportOptions.type });
  }

  /**
   * Connect to the MCP server using streamable HTTP
   */
  async connect(): Promise<void> {
    if (this.client || this.transport) {
      throw new Error('Already connected');
    }

    // Support HTTP and stdio transports
    if (this.transportOptions.type !== 'http' && this.transportOptions.type !== 'stdio') {
      throw new Error('Only HTTP and stdio transports are supported. Use type: "http" or "stdio"');
    }

    try {
      switch (this.transportOptions.type) {
        case 'http': {
          mcpDebug('MCPClient.connect: creating streamable HTTP transport');

          const { url, headers = {} } = this.transportOptions;
          if (!url) {
            throw new Error('URL is required for HTTP transport');
          }

          // Create streamable HTTP transport with built-in proxy support
          const urlObj = new URL(url);
          this.transport = new StreamableHTTPClientTransportWithProxy(urlObj, {
            requestInit: {
              headers,
            },
          });
          break;
        }

        case 'stdio': {
          const { command, args, env } = this.transportOptions;
          if (!command) {
            throw new Error('Command is required for stdio transport');
          }

          if (isWailsEnvironment()) {
            mcpDebug('MCPClient.connect: creating stdio Wails transport');
            this.transport = new StdioWailsTransport({
              command,
              args: args || [],
              env: env || {},
              serverId: this.serverId,
            });
          } else {
            mcpDebug('MCPClient.connect: creating stdio browser transport');
            // Create stdio browser transport that uses nuvin-srv proxy
            this.transport = new StdioBrowserTransport({
              command,
              args: args || [],
              env: env || {},
            });
          }

          mcpDebug('MCPClient.connect: stdio transport created successfully');
          break;
        }

        default:
          throw new Error(`Unsupported transport type: ${this.transportOptions.type}`);
      }

      // Create the official SDK client
      this.client = new Client(
        {
          name: 'nuvin-agent',
          version: '1.0.0',
        },
        {
          capabilities: {
            tools: {},
            resources: { subscribe: true },
            prompts: {},
            logging: {},
          },
        },
      );

      // Connect using the official SDK client
      mcpDebug('MCPClient.connect: about to call client.connect with transport:', this.transport);

      if (!this.transport) {
        throw new Error('Transport is null or undefined');
      }

      // Connect with transport - our custom transports implement the official Transport interface
      await this.client.connect(this.transport as Transport);

      // Log connection info based on transport type
      if (this.transportOptions.type === 'http' && 'sessionId' in this.transport) {
        mcpDebug(
          `HTTP transport connected with sessionId: ${(this.transport as StreamableHTTPClientTransportWithProxy).sessionId}`,
        );
      } else {
        mcpDebug(`${this.transportOptions.type} transport connected`);
      }

      this.initialized = true;

      // Get server capabilities
      this.serverInfo = this.client.getServerCapabilities();

      // Discover tools and resources
      await this.discoverTools();
      await this.discoverResources();

      this.emitEvent({
        type: 'connected',
        serverId: this.serverId,
        serverInfo: this.serverInfo,
      });

      switch (this.transportOptions.type) {
        case 'http':
          mcpDebug('MCPClient.connect: connected via HTTP transport');
          break;
        case 'stdio':
          mcpDebug('MCPClient.connect: connected via stdio transport');
          break;
      }
    } catch (error) {
      mcpDebug('MCPClient.connect error:', error);
      this.emitEvent({
        type: 'error',
        serverId: this.serverId,
        error: error instanceof Error ? error : new Error(String(error)),
      });
      throw error;
    }
  }

  /**
   * Disconnect from the MCP server
   */
  async disconnect(): Promise<void> {
    if (!this.client && !this.transport) {
      return;
    }

    try {
      if (this.client) {
        await this.client.close();
        this.client = null;
      }

      if (this.transport) {
        await this.transport.close();
        this.transport = null;
      }

      this.initialized = false;
      this.tools.clear();
      this.resources.clear();
      this.resourceTemplates.clear();

      this.emitEvent({
        type: 'disconnected',
        serverId: this.serverId,
      });
    } catch (error) {
      // Log connection close errors but don't emit as error events or throw
      // since disconnection is often intentional
      console.debug(`Disconnect error for server ${this.serverId}:`, error);
    }
  }

  /**
   * Check if the client is connected and initialized
   */
  isConnected(): boolean {
    return this.client !== null && this.initialized;
  }

  /**
   * Get all available tools
   */
  getTools(): MCPToolSchema[] {
    return Array.from(this.tools.values());
  }

  /**
   * Get a specific tool by name
   */
  getTool(name: string): MCPToolSchema | undefined {
    return this.tools.get(name);
  }

  /**
   * Execute a tool call
   */
  async executeTool(toolCall: MCPToolCall): Promise<MCPToolResult> {
    if (!this.isConnected() || !this.client) {
      throw new Error('Not connected to MCP server');
    }

    if (!this.tools.has(toolCall.name)) {
      throw new Error(`Tool '${toolCall.name}' not found`);
    }

    try {
      // Debug logging to see what arguments are being passed
      console.log(`[DEBUG] MCP tool call: ${toolCall.name}`, toolCall.arguments);

      // Check for wcgw tools and fix parameter format if needed
      const processedArguments = this.processToolArguments(toolCall.name, toolCall.arguments || {});
      console.log(`[DEBUG] Processed arguments:`, processedArguments);

      const request: CallToolRequest = {
        method: 'tools/call',
        params: {
          name: toolCall.name,
          arguments: processedArguments,
        },
      };

      const response = await this.client.request(request, CallToolResultSchema);
      return response as any; // Type compatibility with internal types
    } catch (error) {
      throw new Error(`Tool execution failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Process and normalize tool arguments - converts JSON strings to objects based on schema
   */
  private processToolArguments(toolName: string, args: Record<string, any>): Record<string, any> {
    const tool = this.tools.get(toolName);
    if (!tool || !tool.inputSchema || !tool.inputSchema.properties) {
      return args;
    }

    const processed = { ...args };
    const schema = tool.inputSchema;

    // Recursively process arguments based on their expected types
    this.processArgumentsRecursively(processed, schema.properties);

    return processed;
  }

  /**
   * Recursively process arguments, converting JSON strings to objects where schema expects objects
   */
  private processArgumentsRecursively(args: Record<string, any>, schemaProperties: Record<string, any>): void {
    for (const [key, propSchema] of Object.entries(schemaProperties)) {
      if (key in args) {
        const value = args[key];

        // If schema expects an object but we have a string, try to parse it
        if (propSchema.type === 'object' && typeof value === 'string') {
          try {
            const parsed = JSON.parse(value);
            if (typeof parsed === 'object' && parsed !== null) {
              args[key] = parsed;
              console.log(`[DEBUG] Converted JSON string parameter '${key}' to object:`, parsed);
            }
          } catch (error) {
            console.warn(`Failed to parse JSON string parameter '${key}':`, error);
          }
        }

        // If we have an object and schema has nested properties, recurse
        else if (propSchema.type === 'object' && typeof value === 'object' && value !== null && propSchema.properties) {
          this.processArgumentsRecursively(value, propSchema.properties);
        }

        // Handle arrays of objects
        else if (
          propSchema.type === 'array' &&
          Array.isArray(value) &&
          propSchema.items?.type === 'object' &&
          propSchema.items.properties
        ) {
          for (let item of value) {
            if (typeof item === 'object' && item !== null) {
              this.processArgumentsRecursively(item, propSchema.items.properties);
            }
          }
        }
      }
    }
  }

  /**
   * Get all available resources
   */
  getResources(): MCPResource[] {
    return Array.from(this.resources.values());
  }

  /**
   * Get resource content
   */
  async getResource(uri: string): Promise<MCPResourceContents> {
    if (!this.isConnected() || !this.client) {
      throw new Error('Not connected to MCP server');
    }

    try {
      const request: ReadResourceRequest = {
        method: 'resources/read',
        params: { uri },
      };
      const response = await this.client.request(request, ReadResourceResultSchema);
      return response as any; // Type compatibility with internal types
    } catch (error) {
      throw new Error(`Resource access failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Get all resource templates
   */
  getResourceTemplates(): MCPResourceTemplate[] {
    return Array.from(this.resourceTemplates.values());
  }

  /**
   * Add event handler
   */
  onEvent(handler: MCPClientEventHandler): void {
    this.eventHandlers.push(handler);
  }

  /**
   * Remove event handler
   */
  offEvent(handler: MCPClientEventHandler): void {
    const index = this.eventHandlers.indexOf(handler);
    if (index > -1) {
      this.eventHandlers.splice(index, 1);
    }
  }

  /**
   * Discover available tools
   */
  private async discoverTools(): Promise<void> {
    try {
      mcpDebug('tools/list ->');

      if (!this.client) {
        throw new Error('Client not initialized');
      }

      const request: ListToolsRequest = {
        method: 'tools/list',
        params: {},
      };

      const response = await this.client.request(request, ListToolsResultSchema);
      const tools = response.tools || [];

      this.tools.clear();
      for (const tool of tools) {
        this.tools.set(tool.name, tool as MCPToolSchema);
      }

      this.emitEvent({
        type: 'toolsChanged',
        serverId: this.serverId,
        tools: Array.from(this.tools.values()),
      });
    } catch (error: any) {
      if (error.message?.includes('Method not found') || error.message?.includes('-32601')) {
        console.debug(`Server ${this.serverId} does not support tools`);
      } else {
        console.warn(`Failed to discover tools for server ${this.serverId}:`, error);
      }
    }
  }

  /**
   * Discover available resources
   */
  private async discoverResources(): Promise<void> {
    try {
      if (!this.client) {
        throw new Error('Client not initialized');
      }

      // Get resource templates (optional method - not all servers support)
      if (this.serverInfo?.capabilities?.resources?.templates || this.serverInfo?.resources?.templates) {
        try {
          mcpDebug('resources/templates/list ->');

          const templatesRequest: ListResourceTemplatesRequest = {
            method: 'resources/templates/list',
            params: {},
          };

          const templatesResponse = await this.client.request(templatesRequest, ListResourceTemplatesResultSchema);
          const templates = templatesResponse.resourceTemplates || [];

          this.resourceTemplates.clear();
          for (const template of templates) {
            this.resourceTemplates.set(template.uriTemplate, template as MCPResourceTemplate);
          }
        } catch (error: any) {
          // Ignore method not found errors for optional endpoints
          if (error.message?.includes('Method not found') || error.message?.includes('-32601')) {
            console.debug(`Server ${this.serverId} does not support resource templates`);
          } else {
            console.warn(`Failed to discover resource templates for server ${this.serverId}:`, error);
          }
        }
      } else {
        console.debug(`Server ${this.serverId} does not advertise resource template support`);
      }

      // Get resources
      try {
        mcpDebug('resources/list ->');

        const resourcesRequest: ListResourcesRequest = {
          method: 'resources/list',
          params: {},
        };

        const resourcesResponse = await this.client.request(resourcesRequest, ListResourcesResultSchema);
        const resources = resourcesResponse.resources || [];

        this.resources.clear();
        for (const resource of resources) {
          this.resources.set(resource.uri, resource as MCPResource);
        }

        mcpDebug(`Found ${resources.length} resources`);
      } catch (error: any) {
        if (error.message?.includes('Method not found') || error.message?.includes('-32601')) {
          mcpDebug(`Server ${this.serverId} does not support resources (this is normal)`);
        } else {
          console.warn(`Failed to discover resources for server ${this.serverId}:`, error);
        }
      }

      this.emitEvent({
        type: 'resourcesChanged',
        serverId: this.serverId,
        resources: Array.from(this.resources.values()),
      });
    } catch (error) {
      console.warn(`Failed to discover resources for server ${this.serverId}:`, error);
    }
  }

  /**
   * Emit event to all handlers
   */
  private emitEvent(event: MCPClientEvent): void {
    for (const handler of this.eventHandlers) {
      try {
        handler(event);
      } catch (error) {
        console.error('Error in MCP event handler:', error);
      }
    }
  }
}
