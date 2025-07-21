import { MCPConfig } from '@/types/mcp';
import { mcpManager } from './mcp-manager';
import { useUserPreferenceStore } from '@/store/useUserPreferenceStore';

/**
 * Integration service to connect MCP manager with user preferences
 */
export class MCPIntegrationService {
  private initialized = false;
  private unsubscribe: (() => void) | null = null;

  /**
   * Initialize MCP integration after store hydration
   */
  async initialize(): Promise<void> {
    if (this.initialized) {
      console.warn('MCP integration already initialized');
      return;
    }

    // Wait for store hydration
    await this.waitForStoreHydration();

    // Get current MCP configurations
    const mcpConfigs =
      useUserPreferenceStore.getState().preferences.mcpServers || [];

    console.log(
      `Initializing MCP integration with ${mcpConfigs.length} servers`,
    );

    // Initialize MCP servers
    try {
      // Stop any existing servers first to prevent "already running" conflicts
      await mcpManager.stopAllServers();

      await mcpManager.initializeServers(mcpConfigs);
      console.log('MCP servers initialized successfully');
    } catch (error) {
      console.error('Failed to initialize MCP servers:', error);
    }

    // Subscribe to preference changes
    this.subscribeToPreferenceChanges();

    this.initialized = true;
  }

  /**
   * Cleanup MCP integration
   */
  async cleanup(): Promise<void> {
    if (!this.initialized) {
      return;
    }

    // Unsubscribe from store changes
    if (this.unsubscribe) {
      this.unsubscribe();
      this.unsubscribe = null;
    }

    // Stop all MCP servers
    await mcpManager.stopAllServers();

    this.initialized = false;
    console.log('MCP integration cleaned up');
  }

  /**
   * Check if MCP integration is initialized
   */
  isInitialized(): boolean {
    return this.initialized;
  }

  /**
   * Get MCP manager instance
   */
  getManager() {
    return mcpManager;
  }

  /**
   * Wait for store hydration to complete
   */
  private async waitForStoreHydration(): Promise<void> {
    return new Promise((resolve) => {
      const checkHydration = () => {
        const state = useUserPreferenceStore.getState();
        if (state.hasHydrated) {
          resolve();
        } else {
          // Check again in 100ms
          setTimeout(checkHydration, 100);
        }
      };

      checkHydration();
    });
  }

  /**
   * Subscribe to preference changes and sync with MCP manager
   */
  private subscribeToPreferenceChanges(): void {
    let previousMCPServers: MCPConfig[] = [];

    this.unsubscribe = useUserPreferenceStore.subscribe(async (state) => {
      if (!this.initialized) {
        return;
      }

      const currentMCPServers = state.preferences.mcpServers || [];

      // Check if MCP servers have changed
      if (
        JSON.stringify(previousMCPServers) !== JSON.stringify(currentMCPServers)
      ) {
        try {
          await this.handleMCPServerChanges(
            previousMCPServers,
            currentMCPServers,
          );
          previousMCPServers = [...currentMCPServers];
        } catch (error) {
          console.error('Failed to handle MCP server changes:', error);
        }
      }
    });

    // Store initial state
    previousMCPServers = [
      ...(useUserPreferenceStore.getState().preferences.mcpServers || []),
    ];
  }

  /**
   * Handle changes to MCP server configurations
   */
  private async handleMCPServerChanges(
    previous: MCPConfig[],
    current: MCPConfig[],
  ): Promise<void> {
    const prevMap = new Map(previous.map((config) => [config.id, config]));
    const currentMap = new Map(current.map((config) => [config.id, config]));

    // Find added servers
    const added = current.filter((config) => !prevMap.has(config.id));

    // Find removed servers
    const removed = previous.filter((config) => !currentMap.has(config.id));

    // Find modified servers
    const modified = current.filter((config) => {
      const prev = prevMap.get(config.id);
      return (
        prev &&
        (prev.enabled !== config.enabled ||
          prev.command !== config.command ||
          JSON.stringify(prev.args) !== JSON.stringify(config.args) ||
          JSON.stringify(prev.env) !== JSON.stringify(config.env) ||
          prev.name !== config.name ||
          prev.description !== config.description)
      );
    });

    console.log(
      `MCP server changes detected: ${added.length} added, ${removed.length} removed, ${modified.length} modified`,
    );

    // Handle removed servers
    for (const config of removed) {
      await mcpManager.removeServer(config.id);
    }

    // Handle added servers
    for (const config of added) {
      await mcpManager.updateServerConfig(config.id, config);
    }

    // Handle modified servers
    for (const config of modified) {
      await mcpManager.updateServerConfig(config.id, config);
    }
  }

  /**
   * Add a new MCP server configuration
   */
  async addMCPServer(config: MCPConfig): Promise<void> {
    const store = useUserPreferenceStore.getState();
    const currentServers = store.preferences.mcpServers || [];

    // Check for duplicate IDs
    if (currentServers.some((server) => server.id === config.id)) {
      throw new Error(`MCP server with ID '${config.id}' already exists`);
    }

    // Update store
    store.updatePreferences({
      mcpServers: [...currentServers, config],
    });
  }

  /**
   * Update an existing MCP server configuration
   */
  async updateMCPServer(
    serverId: string,
    updates: Partial<MCPConfig>,
  ): Promise<void> {
    const store = useUserPreferenceStore.getState();
    const currentServers = store.preferences.mcpServers || [];

    const serverIndex = currentServers.findIndex(
      (server) => server.id === serverId,
    );
    if (serverIndex === -1) {
      throw new Error(`MCP server with ID '${serverId}' not found`);
    }

    const updatedServers = [...currentServers];
    updatedServers[serverIndex] = {
      ...updatedServers[serverIndex],
      ...updates,
    };

    // Update store
    store.updatePreferences({
      mcpServers: updatedServers,
    });
  }

  /**
   * Remove an MCP server configuration
   */
  async removeMCPServer(serverId: string): Promise<void> {
    const store = useUserPreferenceStore.getState();
    const currentServers = store.preferences.mcpServers || [];

    const filteredServers = currentServers.filter(
      (server) => server.id !== serverId,
    );

    // Update store
    store.updatePreferences({
      mcpServers: filteredServers,
    });
  }

  /**
   * Get MCP server status summary
   */
  getMCPStatus(): {
    totalServers: number;
    runningServers: number;
    totalTools: number;
    errors: string[];
  } {
    const stats = mcpManager.getStats();
    const configs = mcpManager.getAllServerConfigs();
    const errors = configs
      .filter((config) => config.status === 'error' && config.lastError)
      .map((config) => `${config.name}: ${config.lastError}`);

    return {
      totalServers: stats.totalServers,
      runningServers: stats.runningServers,
      totalTools: stats.totalTools,
      errors,
    };
  }

  /**
   * Restart all MCP servers
   */
  async restartAllMCPServers(): Promise<void> {
    const configs =
      useUserPreferenceStore.getState().preferences.mcpServers || [];
    const enabledConfigs = configs.filter((config) => config.enabled);

    console.log(`Restarting ${enabledConfigs.length} MCP servers`);

    for (const config of enabledConfigs) {
      try {
        await mcpManager.restartServer(config.id);
      } catch (error) {
        console.error(`Failed to restart MCP server '${config.id}':`, error);
      }
    }
  }
}

// Singleton instance
export const mcpIntegration = new MCPIntegrationService();
