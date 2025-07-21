import {
  MCPConfig,
  ExtendedMCPConfig,
  MCPClientEvent,
  MCPClientEventHandler,
} from '@/types/mcp';
import { MCPClient } from './mcp-client';
import { MCPTool, createMCPTools } from './mcp-tool';
import { toolRegistry } from '@/lib/tools/tool-registry';

/**
 * Central manager for MCP server lifecycle and tool integration
 */
export class MCPManager {
  private clients: Map<string, MCPClient> = new Map();
  private configs: Map<string, ExtendedMCPConfig> = new Map();
  private eventHandlers: MCPClientEventHandler[] = [];

  /**
   * Initialize MCP servers from configurations
   */
  async initializeServers(mcpConfigs: MCPConfig[]): Promise<void> {
    console.log(`Initializing ${mcpConfigs.length} MCP servers`);

    // Initialize each enabled server
    for (const config of mcpConfigs) {
      if (config.enabled) {
        await this.startServer(config);
      } else {
        // Add disabled servers to configs with disconnected status
        this.configs.set(config.id, {
          ...config,
          status: 'disconnected',
          toolCount: 0,
          resourceCount: 0,
        });
      }
    }
  }

  /**
   * Start a single MCP server
   */
  async startServer(config: MCPConfig): Promise<void> {
    const serverId = config.id;

    // Check if server is already running
    if (this.clients.has(serverId)) {
      console.warn(`MCP server '${serverId}' is already running`);
      return;
    }

    // Create extended config with starting status
    const extendedConfig: ExtendedMCPConfig = {
      ...config,
      status: 'starting',
      toolCount: 0,
      resourceCount: 0,
    };
    this.configs.set(serverId, extendedConfig);

    try {
      // Create MCP client
      const client = new MCPClient(serverId, {
        type: 'stdio', // For now, only stdio is implemented
        command: config.command,
        args: config.args,
        env: config.env,
      });

      // Set up event handling
      client.onEvent(this.handleClientEvent.bind(this));

      // Store client
      this.clients.set(serverId, client);

      // Attempt connection
      await client.connect();

      // Update config with connected status
      extendedConfig.status = 'connected';
      extendedConfig.lastConnected = new Date();
      extendedConfig.toolCount = client.getTools().length;
      extendedConfig.resourceCount = client.getResources().length;

      // Register tools with the tool registry
      const mcpTools = createMCPTools(client, client.getTools(), serverId);
      toolRegistry.registerMCPTools(serverId, mcpTools);

      console.log(
        `MCP server '${serverId}' started successfully with ${extendedConfig.toolCount} tools`,
      );
    } catch (error) {
      console.error(`Failed to start MCP server '${serverId}':`, error);

      // Update config with error status
      extendedConfig.status = 'error';
      extendedConfig.lastError =
        error instanceof Error ? error.message : String(error);

      // Remove client if it was created
      this.clients.delete(serverId);
    }
  }

  /**
   * Stop a single MCP server
   */
  async stopServer(serverId: string): Promise<void> {
    const client = this.clients.get(serverId);
    const config = this.configs.get(serverId);

    if (!client || !config) {
      console.warn(`MCP server '${serverId}' not found or not running`);
      return;
    }

    try {
      // Update status to stopping
      config.status = 'stopping';

      // Unregister tools from tool registry
      toolRegistry.unregisterMCPServer(serverId);

      // Disconnect client
      await client.disconnect();

      // Remove client
      this.clients.delete(serverId);

      // Update config
      config.status = 'disconnected';
      config.toolCount = 0;
      config.resourceCount = 0;

      console.log(`MCP server '${serverId}' stopped successfully`);
    } catch (error) {
      console.error(`Error stopping MCP server '${serverId}':`, error);
      config.status = 'error';
      config.lastError = error instanceof Error ? error.message : String(error);
    }
  }

  /**
   * Restart a MCP server
   */
  async restartServer(serverId: string): Promise<void> {
    const config = this.configs.get(serverId);
    if (!config) {
      throw new Error(`MCP server '${serverId}' not found`);
    }

    console.log(`Restarting MCP server '${serverId}'`);
    await this.stopServer(serverId);

    // Wait a bit before restarting
    await new Promise((resolve) => setTimeout(resolve, 1000));

    await this.startServer(config);
  }

  /**
   * Stop all MCP servers
   */
  async stopAllServers(): Promise<void> {
    try {
      // Stop all backend processes first
      if (window.go?.main?.App?.StopAllMCPServers) {
        await window.go.main.App.StopAllMCPServers();
      }
    } catch (error) {
      console.warn('Failed to stop backend MCP servers:', error);
    }

    // Clean up frontend state
    const serverIds = Array.from(this.clients.keys());
    await Promise.all(serverIds.map((serverId) => this.stopServer(serverId)));
  }

  /**
   * Get server configuration
   */
  getServerConfig(serverId: string): ExtendedMCPConfig | undefined {
    return this.configs.get(serverId);
  }

  /**
   * Get all server configurations
   */
  getAllServerConfigs(): ExtendedMCPConfig[] {
    return Array.from(this.configs.values());
  }

  /**
   * Get MCP client for a server
   */
  getClient(serverId: string): MCPClient | undefined {
    return this.clients.get(serverId);
  }

  /**
   * Check if a server is running
   */
  isServerRunning(serverId: string): boolean {
    const client = this.clients.get(serverId);
    return client ? client.isConnected() : false;
  }

  /**
   * Get server status
   */
  getServerStatus(serverId: string): ExtendedMCPConfig['status'] {
    const config = this.configs.get(serverId);
    return config ? config.status : 'disconnected';
  }

  /**
   * Update server configuration
   */
  async updateServerConfig(
    serverId: string,
    newConfig: MCPConfig,
  ): Promise<void> {
    const currentConfig = this.configs.get(serverId);

    if (currentConfig) {
      // Check if server needs restart
      const needsRestart =
        this.isServerRunning(serverId) &&
        (currentConfig.command !== newConfig.command ||
          JSON.stringify(currentConfig.args) !==
            JSON.stringify(newConfig.args) ||
          JSON.stringify(currentConfig.env) !== JSON.stringify(newConfig.env));

      // Update config
      const updatedConfig: ExtendedMCPConfig = {
        ...currentConfig,
        ...newConfig,
      };
      this.configs.set(serverId, updatedConfig);

      // Handle enable/disable
      if (newConfig.enabled && !this.isServerRunning(serverId)) {
        await this.startServer(newConfig);
      } else if (!newConfig.enabled && this.isServerRunning(serverId)) {
        await this.stopServer(serverId);
      } else if (needsRestart) {
        await this.restartServer(serverId);
      }
    } else {
      // New server
      const extendedConfig: ExtendedMCPConfig = {
        ...newConfig,
        status: 'disconnected',
        toolCount: 0,
        resourceCount: 0,
      };
      this.configs.set(serverId, extendedConfig);

      if (newConfig.enabled) {
        await this.startServer(newConfig);
      }
    }
  }

  /**
   * Remove server configuration
   */
  async removeServer(serverId: string): Promise<void> {
    if (this.isServerRunning(serverId)) {
      await this.stopServer(serverId);
    }
    this.configs.delete(serverId);
  }

  /**
   * Get tools for a specific server
   */
  getServerTools(serverId: string): MCPTool[] {
    return toolRegistry.getMCPToolsForServer(serverId);
  }

  /**
   * Get all MCP tools from all servers
   */
  getAllMCPTools(): MCPTool[] {
    return toolRegistry.getAllMCPTools();
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
   * Handle events from MCP clients
   */
  private handleClientEvent(event: MCPClientEvent): void {
    const serverId = event.serverId;
    const config = this.configs.get(serverId);

    if (!config) {
      console.warn(`Received event for unknown server: ${serverId}`);
      return;
    }

    switch (event.type) {
      case 'connected':
        config.status = 'connected';
        config.lastConnected = new Date();
        config.serverInfo = event.serverInfo;
        config.lastError = undefined;
        console.log(`MCP server '${serverId}' connected`);
        break;

      case 'disconnected':
        config.status = 'disconnected';
        config.toolCount = 0;
        config.resourceCount = 0;
        toolRegistry.unregisterMCPServer(serverId);
        console.log(
          `MCP server '${serverId}' disconnected: ${event.reason || 'Unknown reason'}`,
        );
        break;

      case 'error':
        config.status = 'error';
        config.lastError = event.error.message;
        console.error(`MCP server '${serverId}' error:`, event.error);
        break;

      case 'toolsChanged':
        config.toolCount = event.tools.length;
        const client = this.clients.get(serverId);
        if (client) {
          const mcpTools = createMCPTools(client, event.tools, serverId);
          toolRegistry.registerMCPTools(serverId, mcpTools);
        }
        console.log(
          `MCP server '${serverId}' tools updated: ${config.toolCount} tools`,
        );
        break;

      case 'resourcesChanged':
        config.resourceCount = event.resources.length;
        console.log(
          `MCP server '${serverId}' resources updated: ${config.resourceCount} resources`,
        );
        break;
    }

    // Forward event to external handlers
    for (const handler of this.eventHandlers) {
      try {
        handler(event);
      } catch (error) {
        console.error('Error in MCP event handler:', error);
      }
    }
  }

  /**
   * Get summary statistics
   */
  getStats(): {
    totalServers: number;
    runningServers: number;
    totalTools: number;
    totalResources: number;
  } {
    const configs = Array.from(this.configs.values());

    return {
      totalServers: configs.length,
      runningServers: configs.filter((c) => c.status === 'connected').length,
      totalTools: configs.reduce((sum, c) => sum + c.toolCount, 0),
      totalResources: configs.reduce((sum, c) => sum + c.resourceCount, 0),
    };
  }
}

// Singleton instance
export const mcpManager = new MCPManager();
