import { useState, useEffect } from 'react';
import { MCPConfig, ExtendedMCPConfig } from '@/types/mcp';
import { mcpIntegration } from '../mcp-integration';
import { useUserPreferenceStore } from '@/store/useUserPreferenceStore';

/**
 * React hook for MCP server management
 */
export function useMCPServers() {
  const { preferences, updatePreferences } = useUserPreferenceStore();
  const [serverStatuses, setServerStatuses] = useState<
    Map<string, ExtendedMCPConfig>
  >(new Map());

  // Update server statuses from MCP manager
  const updateServerStatuses = () => {
    if (!mcpIntegration.isInitialized()) {
      return;
    }

    const manager = mcpIntegration.getManager();
    const configs = manager.getAllServerConfigs();
    const statusMap = new Map(configs.map((config) => [config.id, config]));
    setServerStatuses(statusMap);
  };

  useEffect(() => {
    updateServerStatuses();

    // Set up periodic status updates
    const interval = setInterval(updateServerStatuses, 2000);

    return () => clearInterval(interval);
  }, []);

  // Merge configuration with runtime status
  const getServersWithStatus = (): ExtendedMCPConfig[] => {
    const configs = preferences.mcpServers || [];

    return configs.map((config) => {
      const status = serverStatuses.get(config.id);
      return (
        status || {
          ...config,
          status: 'disconnected' as const,
          toolCount: 0,
          resourceCount: 0,
        }
      );
    });
  };

  // Server management functions
  const addServer = async (config: MCPConfig) => {
    try {
      await mcpIntegration.addMCPServer(config);
    } catch (error) {
      console.error('Failed to add MCP server:', error);
      throw error;
    }
  };

  const updateServer = async (
    serverId: string,
    updates: Partial<MCPConfig>,
  ) => {
    try {
      await mcpIntegration.updateMCPServer(serverId, updates);
    } catch (error) {
      console.error('Failed to update MCP server:', error);
      throw error;
    }
  };

  const removeServer = async (serverId: string) => {
    try {
      await mcpIntegration.removeMCPServer(serverId);
    } catch (error) {
      console.error('Failed to remove MCP server:', error);
      throw error;
    }
  };

  const startServer = async (serverId: string) => {
    const manager = mcpIntegration.getManager();
    const config = (preferences.mcpServers || []).find(
      (s) => s.id === serverId,
    );
    if (config) {
      await manager.startServer(config);
    }
  };

  const stopServer = async (serverId: string) => {
    const manager = mcpIntegration.getManager();
    await manager.stopServer(serverId);
  };

  const restartServer = async (serverId: string) => {
    const manager = mcpIntegration.getManager();
    await manager.restartServer(serverId);
  };

  const toggleServer = async (serverId: string, enabled: boolean) => {
    await updateServer(serverId, { enabled });
  };

  return {
    servers: getServersWithStatus(),
    addServer,
    updateServer,
    removeServer,
    startServer,
    stopServer,
    restartServer,
    toggleServer,
    refreshStatus: updateServerStatuses,
  };
}
