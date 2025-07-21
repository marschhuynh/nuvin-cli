import { useState, useEffect } from 'react';
import { mcpIntegration } from '../mcp-integration';
import { ExtendedMCPConfig, MCPClientEvent } from '@/types/mcp';

/**
 * React hook for MCP status monitoring
 */
export function useMCPStatus() {
  const [isInitialized, setIsInitialized] = useState(false);
  const [servers, setServers] = useState<ExtendedMCPConfig[]>([]);
  const [stats, setStats] = useState({
    totalServers: 0,
    runningServers: 0,
    totalTools: 0,
    totalResources: 0,
  });

  // Update stats and server status
  const updateStatus = () => {
    if (!mcpIntegration.isInitialized()) {
      return;
    }

    const manager = mcpIntegration.getManager();
    setServers([...manager.getAllServerConfigs()]);
    setStats(manager.getStats());
  };

  useEffect(() => {
    // Initial status check
    setIsInitialized(mcpIntegration.isInitialized());
    updateStatus();

    // Set up event listener for MCP events
    const handleMCPEvent = (event: MCPClientEvent) => {
      updateStatus();
    };

    const manager = mcpIntegration.getManager();
    manager.onEvent(handleMCPEvent);

    // Poll for initialization status
    const checkInitialization = setInterval(() => {
      const initialized = mcpIntegration.isInitialized();
      if (initialized !== isInitialized) {
        setIsInitialized(initialized);
        updateStatus();
      }
    }, 1000);

    // Cleanup
    return () => {
      clearInterval(checkInitialization);
      manager.offEvent(handleMCPEvent);
    };
  }, [isInitialized]);

  return {
    isInitialized,
    servers,
    stats,
    refreshStatus: updateStatus,
  };
}
