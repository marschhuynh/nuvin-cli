import type {
  MCPConnection,
  MCPTransportOptions,
  JSONRPCRequest,
  JSONRPCResponse,
  JSONRPCNotification,
  MCPInitializeParams,
  MCPInitializeResult,
  MCPToolSchema,
  MCPToolCall,
  MCPToolResult,
  MCPResource,
  MCPResourceTemplate,
  MCPResourceContents,
  MCPClientEvent,
  MCPClientEventHandler,
  MCPCapabilities,
  MCPClientInfo,
} from '@/types/mcp';

/**
 * HTTP-based MCP connection implementation following Streamable HTTP transport spec
 */
class HttpMCPConnection implements MCPConnection {
  private url: string;
  private headers: Record<string, string>;
  private messageHandler?: (message: JSONRPCResponse | JSONRPCNotification) => void;
  private errorHandler?: (error: Error) => void;
  private closeHandler?: () => void;
  private eventSource?: EventSource;
  private isConnected = false;
  private sessionId?: string;
  private requestQueue: Array<{
    request: JSONRPCRequest | JSONRPCNotification;
    resolve: () => void;
    reject: (error: Error) => void;
  }> = [];

  constructor(url: string, headers: Record<string, string> = {}) {
    this.url = url;
    this.headers = {
      'Content-Type': 'application/json',
      Accept: 'application/json, text/event-stream',
      'MCP-Protocol-Version': '2025-06-18',
      ...headers,
    };
  }

  async connect(): Promise<void> {
    if (this.isConnected) {
      return;
    }

    return new Promise((resolve, reject) => {
      try {
        // Streamable HTTP transport: Use the MCP endpoint directly for SSE
        // First, try to open a GET SSE stream for server-initiated messages
        this.setupEventSource();

        const timeout = setTimeout(() => {
          this.eventSource?.close();
          reject(new Error('Connection timeout'));
        }, 10000);

        if (this.eventSource) {
          this.eventSource.onopen = () => {
            clearTimeout(timeout);
            this.isConnected = true;
            // Process any queued requests
            this.processRequestQueue();
            resolve();
          };

          this.eventSource.onerror = (error) => {
            console.error('SSE connection error:', error);
            if (!this.isConnected) {
              clearTimeout(timeout);
              // Fallback: connection without SSE stream
              this.isConnected = true;
              this.processRequestQueue();
              resolve();
            } else {
              this.isConnected = false;
              if (this.errorHandler) {
                this.errorHandler(new Error('SSE connection error'));
              }
            }
          };
        } else {
          // No SSE support, but we can still use POST-only mode
          clearTimeout(timeout);
          this.isConnected = true;
          this.processRequestQueue();
          resolve();
        }
      } catch (error) {
        reject(error);
      }
    });
  }

  async send(message: JSONRPCRequest | JSONRPCNotification): Promise<void> {
    if (!this.isConnected) {
      // Queue the request until connected
      return new Promise((resolve, reject) => {
        this.requestQueue.push({ request: message, resolve, reject });
      });
    }

    try {
      const headers = { ...this.headers };

      // Add session ID header if we have one
      if (this.sessionId) {
        headers['Mcp-Session-Id'] = this.sessionId;
      }

      const response = await fetch(this.url, {
        method: 'POST',
        headers,
        body: JSON.stringify(message),
      });

      // Handle session management
      if (response.status === 404 && this.sessionId) {
        // Session expired, clear it to trigger re-initialization
        this.sessionId = undefined;
        throw new Error('Session expired - server responded with 404');
      }

      if (!response.ok) {
        if (response.status === 400) {
          const errorText = await response.text();
          throw new Error(`HTTP 400 Bad Request: ${errorText}`);
        }
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      // Extract session ID from initialize response
      if ('method' in message && message.method === 'initialize') {
        const sessionIdHeader = response.headers.get('Mcp-Session-Id');
        if (sessionIdHeader) {
          this.sessionId = sessionIdHeader;
        }
      }

      // Handle different response types based on content-type
      const contentType = response.headers.get('content-type');
      if (contentType?.includes('text/event-stream')) {
        // Server initiated SSE stream for this request
        this.handleResponseStream(response);
      } else if (contentType?.includes('application/json')) {
        // Single JSON response
        const jsonResponse = await response.json();
        if (this.messageHandler) {
          this.messageHandler(jsonResponse);
        }
      } else if (response.status === 202) {
        // Notification accepted - no response expected
        return;
      }
    } catch (error) {
      throw error instanceof Error ? error : new Error(String(error));
    }
  }

  async close(): Promise<void> {
    this.isConnected = false;

    // Terminate session if we have one
    if (this.sessionId) {
      try {
        const headers = { ...this.headers };
        headers['Mcp-Session-Id'] = this.sessionId;

        await fetch(this.url, {
          method: 'DELETE',
          headers,
        });
      } catch (error) {
        // Ignore errors during session termination
        console.debug('Error terminating MCP session:', error);
      }
      this.sessionId = undefined;
    }

    if (this.eventSource) {
      this.eventSource.close();
      this.eventSource = undefined;
    }

    // Reject any queued requests
    for (const item of this.requestQueue) {
      item.reject(new Error('Connection closed'));
    }
    this.requestQueue = [];

    if (this.closeHandler) {
      this.closeHandler();
    }
  }

  onMessage(handler: (message: JSONRPCResponse | JSONRPCNotification) => void): void {
    this.messageHandler = handler;
  }

  onError(handler: (error: Error) => void): void {
    this.errorHandler = handler;
  }

  onClose(handler: () => void): void {
    this.closeHandler = handler;
  }

  /**
   * Set up EventSource for server-initiated messages (optional GET SSE stream)
   */
  private setupEventSource(): void {
    try {
      const headers: Record<string, string> = {};
      if (this.sessionId) {
        headers['Mcp-Session-Id'] = this.sessionId;
      }

      // Note: EventSource doesn't support custom headers in standard browsers
      // This is a limitation for session management in SSE streams
      this.eventSource = new EventSource(this.url);

      this.eventSource.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data);
          if (this.messageHandler) {
            this.messageHandler(message);
          }
        } catch (error) {
          console.error('Failed to parse SSE message:', error);
          if (this.errorHandler) {
            this.errorHandler(error instanceof Error ? error : new Error(String(error)));
          }
        }
      };
    } catch (error) {
      console.debug('EventSource not supported or failed to initialize:', error);
      this.eventSource = undefined;
    }
  }

  /**
   * Handle streaming response from POST request
   */
  private handleResponseStream(response: Response): void {
    if (!response.body) {
      console.error('No response body for streaming response');
      return;
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();

    const processStream = async () => {
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          const chunk = decoder.decode(value, { stream: true });
          const lines = chunk.split('\n');

          for (const line of lines) {
            if (line.trim() === '') continue;

            // Parse SSE format: "data: {json}"
            if (line.startsWith('data: ')) {
              try {
                const jsonData = line.substring(6);
                const message = JSON.parse(jsonData);
                if (this.messageHandler) {
                  this.messageHandler(message);
                }
              } catch (error) {
                console.error('Failed to parse streaming message:', error);
              }
            }
          }
        }
      } catch (error) {
        console.error('Error reading stream:', error);
        if (this.errorHandler) {
          this.errorHandler(error instanceof Error ? error : new Error(String(error)));
        }
      }
    };

    processStream();
  }

  private async processRequestQueue(): Promise<void> {
    while (this.requestQueue.length > 0 && this.isConnected) {
      const item = this.requestQueue.shift();
      if (item) {
        try {
          await this.send(item.request);
          item.resolve();
        } catch (error) {
          item.reject(error instanceof Error ? error : new Error(String(error)));
        }
      }
    }
  }
}

export class MCPClient {
  private connection: MCPConnection | null = null;
  private serverId: string;
  private transportOptions: MCPTransportOptions;
  private eventHandlers: MCPClientEventHandler[] = [];
  private requestId = 0;
  private pendingRequests = new Map<
    string | number,
    {
      resolve: (value: any) => void;
      reject: (error: Error) => void;
      timeout: NodeJS.Timeout;
    }
  >();

  // Cached data
  private tools: Map<string, MCPToolSchema> = new Map();
  private resources: Map<string, MCPResource> = new Map();
  private resourceTemplates: Map<string, MCPResourceTemplate> = new Map();
  private initialized = false;
  private serverInfo: any = null;

  constructor(serverId: string, transportOptions: MCPTransportOptions) {
    this.serverId = serverId;
    this.transportOptions = transportOptions;
  }

  /**
   * Connect to the MCP server and initialize the protocol
   */
  async connect(): Promise<void> {
    if (this.connection) {
      throw new Error('Already connected');
    }

    try {
      this.connection = await this.createConnection();
      this.setupEventHandlers();
      await this.initialize();
      this.initialized = true;

      // Discover tools and resources
      await this.discoverTools();
      await this.discoverResources();

      this.emitEvent({
        type: 'connected',
        serverId: this.serverId,
        serverInfo: this.serverInfo,
      });
    } catch (error) {
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
    if (!this.connection) {
      return;
    }

    try {
      // Cancel all pending requests
      for (const [_id, { reject, timeout }] of this.pendingRequests) {
        clearTimeout(timeout);
        reject(new Error('Connection closed'));
      }
      this.pendingRequests.clear();

      await this.connection.close();
      this.connection = null;
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
    return this.connection !== null && this.initialized;
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
    if (!this.isConnected()) {
      throw new Error('Not connected to MCP server');
    }

    if (!this.tools.has(toolCall.name)) {
      throw new Error(`Tool '${toolCall.name}' not found`);
    }

    try {
      const response = await this.sendRequest('tools/call', {
        name: toolCall.name,
        arguments: toolCall.arguments || {},
      });

      return response as MCPToolResult;
    } catch (error) {
      throw new Error(`Tool execution failed: ${error instanceof Error ? error.message : String(error)}`);
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
    if (!this.isConnected()) {
      throw new Error('Not connected to MCP server');
    }

    try {
      const response = await this.sendRequest('resources/read', { uri });
      return response as MCPResourceContents;
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
   * Create connection based on transport options
   */
  private async createConnection(): Promise<MCPConnection> {
    if (this.transportOptions.type === 'stdio') {
      return this.createStdioConnection();
    } else if (this.transportOptions.type === 'http') {
      return this.createHttpConnection();
    } else {
      throw new Error(`Unsupported transport type: ${this.transportOptions.type}`);
    }
  }

  /**
   * Create stdio connection (spawns process via Wails)
   */
  private async createStdioConnection(): Promise<MCPConnection> {
    const { command, args = [], env = {} } = this.transportOptions;

    if (!command) {
      throw new Error('Command is required for stdio transport');
    }

    // Import Wails transport dynamically to avoid issues if not available
    try {
      const { createWailsMCPConnection } = await import('./wails-transport');
      const connection = createWailsMCPConnection(this.serverId, this.transportOptions);
      await connection.connect();
      return connection;
    } catch (error) {
      throw new Error(
        `Failed to create Wails stdio connection: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /**
   * Create HTTP connection
   */
  private async createHttpConnection(): Promise<MCPConnection> {
    const { url, headers = {} } = this.transportOptions;

    if (!url) {
      throw new Error('URL is required for HTTP transport');
    }

    const connection = new HttpMCPConnection(url, headers);
    await connection.connect();
    return connection;
  }

  /**
   * Setup connection event handlers
   */
  private setupEventHandlers(): void {
    if (!this.connection) return;

    this.connection.onMessage((message) => {
      if ('id' in message) {
        // This is a response
        this.handleResponse(message as JSONRPCResponse);
      } else {
        // This is a notification
        this.handleNotification(message as JSONRPCNotification);
      }
    });

    this.connection.onError((error) => {
      this.emitEvent({
        type: 'error',
        serverId: this.serverId,
        error,
      });
    });

    this.connection.onClose(() => {
      this.emitEvent({
        type: 'disconnected',
        serverId: this.serverId,
        reason: 'Connection closed',
      });
    });
  }

  /**
   * Initialize the MCP protocol
   */
  private async initialize(): Promise<void> {
    const capabilities: MCPCapabilities = {
      tools: { listChanged: true },
      resources: { subscribe: true, listChanged: true },
      prompts: { listChanged: true },
      logging: {},
    };

    const clientInfo: MCPClientInfo = {
      name: 'nuvin-agent',
      version: '1.0.0',
    };

    const params: MCPInitializeParams = {
      protocolVersion: '2025-06-18',
      capabilities,
      clientInfo,
    };

    const result = await this.sendRequest('initialize', params);
    this.serverInfo = (result as MCPInitializeResult).serverInfo;
  }

  /**
   * Discover available tools
   */
  private async discoverTools(): Promise<void> {
    try {
      const response = await this.sendRequest('tools/list');
      const tools = response.tools || [];

      this.tools.clear();
      for (const tool of tools) {
        this.tools.set(tool.name, tool);
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
      // Get resource templates (optional method - not all servers support)
      if (this.serverInfo?.capabilities?.resources?.templates) {
        try {
          const templatesResponse = await this.sendRequest('resources/templates/list');
          const templates = templatesResponse.resourceTemplates || [];

          this.resourceTemplates.clear();
          for (const template of templates) {
            this.resourceTemplates.set(template.uriTemplate, template);
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
        const resourcesResponse = await this.sendRequest('resources/list');
        const resources = resourcesResponse.resources || [];

        this.resources.clear();
        for (const resource of resources) {
          this.resources.set(resource.uri, resource);
        }
      } catch (error: any) {
        if (error.message?.includes('Method not found') || error.message?.includes('-32601')) {
          console.debug(`Server ${this.serverId} does not support resources`);
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
   * Send a JSON-RPC request
   */
  private async sendRequest(method: string, params?: any): Promise<any> {
    if (!this.connection) {
      throw new Error('Not connected');
    }

    const id = ++this.requestId;
    const request: JSONRPCRequest = {
      jsonrpc: '2.0',
      id,
      method,
      params,
    };

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pendingRequests.delete(id);
        reject(new Error(`Request timeout for method: ${method}`));
      }, 30000); // 30 second timeout

      this.pendingRequests.set(id, { resolve, reject, timeout });

      this.connection?.send(request).catch((error) => {
        this.pendingRequests.delete(id);
        clearTimeout(timeout);
        reject(error);
      });
    });
  }

  /**
   * Handle JSON-RPC response
   */
  private handleResponse(response: JSONRPCResponse): void {
    const pending = this.pendingRequests.get(response.id);
    if (!pending) {
      console.warn(`Received response for unknown request ID: ${response.id}`);
      return;
    }

    this.pendingRequests.delete(response.id);
    clearTimeout(pending.timeout);

    if (response.error) {
      pending.reject(new Error(`${response.error.message} (${response.error.code})`));
    } else {
      pending.resolve(response.result);
    }
  }

  /**
   * Handle JSON-RPC notification
   */
  private handleNotification(notification: JSONRPCNotification): void {
    switch (notification.method) {
      case 'notifications/tools/list_changed':
        this.discoverTools();
        break;
      case 'notifications/resources/list_changed':
      case 'notifications/resources/updated':
        this.discoverResources();
        break;
      default:
        console.log(`Received notification: ${notification.method}`, notification.params);
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
