import { useCallback, useEffect, useState } from 'react';
import { Text } from 'ink';
import { useInput } from '@/contexts/InputContext/index.js';
import { AppModal } from '@/components/AppModal.js';
import MCPModal from '@/components/MCPModal.js';
import type { CommandRegistry, CommandComponentProps } from '@/modules/commands/types.js';
import { useTheme } from '@/contexts/ThemeContext.js';
import type { MCPServerInfo } from '@/services/MCPServerManager.js';
import type { MCPServerConfig } from '@/config/types.js';

const MCPCommandComponent = ({ context, deactivate }: CommandComponentProps) => {
  const { theme } = useTheme();
  const [servers, setServers] = useState<MCPServerInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reconnecting, setReconnecting] = useState<string | null>(null);

  const loadMCPServers = useCallback(() => {
    try {
      const mcpServers = context.orchestratorManager?.getMCPServers() || [];
      const mcpConfig = context.config.get('mcp.servers') as Record<string, MCPServerConfig> | undefined;

      const combinedServers: MCPServerInfo[] = [];
      const seenIds = new Set<string>();

      for (const server of mcpServers) {
        const serverConfig = mcpConfig?.[server.id];
        combinedServers.push({
          ...server,
          disabled: serverConfig?.enabled === false,
        });
        seenIds.add(server.id);
      }

      if (mcpConfig) {
        for (const [serverId, serverConfig] of Object.entries(mcpConfig)) {
          if (!seenIds.has(serverId)) {
            combinedServers.push({
              id: serverId,
              client: null,
              port: null,
              exposedTools: [],
              allowedTools: [],
              prefix: serverConfig.prefix || `mcp_${serverId}_`,
              status: 'pending' as const,
              disabled: serverConfig.enabled === false,
            });
          }
        }
      }

      setServers(combinedServers);
      setLoading(false);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setError(`Failed to load MCP servers: ${message}`);
      setLoading(false);
    }
  }, [context.orchestratorManager, context.config]);

  useInput(
    (_input, key) => {
      if (key.escape) {
        deactivate();
      }
    },
    { isActive: true },
  );

  const handleServerToggle = useCallback(
    async (serverId: string, enabled: boolean) => {
      const mcpConfig = context.config.get('mcp.servers') as Record<string, MCPServerConfig> | undefined;
      if (!mcpConfig || !mcpConfig[serverId]) return;

      await context.config.set(`mcp.servers.${serverId}.enabled`, enabled);

      if (!enabled) {
        await context.orchestratorManager?.disconnectMCPServer(serverId);
      }

      setServers((prev) =>
        prev.map((s) =>
          s.id === serverId ? { ...s, disabled: !enabled, status: !enabled ? 'pending' : s.status } : s,
        ),
      );
    },
    [context.config, context.orchestratorManager],
  );

  const handleServerReconnect = useCallback(
    async (serverId: string) => {
      if (reconnecting) return;

      setReconnecting(serverId);
      try {
        const result = await context.orchestratorManager?.reconnectMCPServer(serverId);
        if (result) {
          loadMCPServers();
        }
      } catch (err) {
        console.error('Failed to reconnect MCP server:', err);
      } finally {
        setReconnecting(null);
      }
    },
    [context.orchestratorManager, loadMCPServers, reconnecting],
  );

  useEffect(() => {
    const handleToolPermissionChanged = async (data: { serverId: string; toolName: string; allowed: boolean }) => {
      try {
        const currentConfig: Record<string, Record<string, boolean>> = (context.config.get(
          'mcp.allowedTools',
        ) as Record<string, Record<string, boolean>>) || {};
        const serverKey = data.serverId;

        if (!currentConfig[serverKey]) {
          currentConfig[serverKey] = {};
        }

        currentConfig[serverKey][data.toolName] = data.allowed;

        await context.config.set('mcp.allowedTools', currentConfig);

        await context.orchestratorManager?.updateMCPAllowedTools(currentConfig);
      } catch (err) {
        console.error('Failed to save MCP tool permission:', err);
      }
    };

    const handleBatchToolPermissionChanged = async (data: {
      serverId: string;
      config: Record<string, Record<string, boolean>>;
    }) => {
      try {
        await context.config.set('mcp.allowedTools', data.config);

        await context.orchestratorManager?.updateMCPAllowedTools?.(data.config);
      } catch (err) {
        console.error('Failed to save MCP batch tool permissions:', err);
      }
    };

    const handleServersChanged = () => {
      loadMCPServers();
    };

    context.eventBus.on('ui:mcp:toolPermissionChanged', handleToolPermissionChanged);
    context.eventBus.on('ui:mcp:batchToolPermissionChanged', handleBatchToolPermissionChanged);
    context.eventBus.on('mcp:serversChanged', handleServersChanged);

    loadMCPServers();

    let intervalId: ReturnType<typeof setInterval> | null = null;
    const checkAndPoll = () => {
      const mcpServers = context.orchestratorManager?.getMCPServers() || [];
      const hasPending = mcpServers.some((s) => s.status === 'pending');
      if (hasPending && !intervalId) {
        intervalId = setInterval(() => {
          loadMCPServers();
          const currentServers = context.orchestratorManager?.getMCPServers() || [];
          const stillPending = currentServers.some((s) => s.status === 'pending');
          if (!stillPending && intervalId) {
            clearInterval(intervalId);
            intervalId = null;
          }
        }, 2000);
      }
    };
    checkAndPoll();

    return () => {
      context.eventBus.off('ui:mcp:toolPermissionChanged', handleToolPermissionChanged);
      context.eventBus.off('ui:mcp:batchToolPermissionChanged', handleBatchToolPermissionChanged);
      context.eventBus.off('mcp:serversChanged', handleServersChanged);
      if (intervalId) {
        clearInterval(intervalId);
      }
    };
  }, [context.eventBus, context.config, context.orchestratorManager, loadMCPServers]);

  if (loading) {
    return (
      <AppModal visible={true} title="MCP Server Configuration" onClose={deactivate} closeOnEscape={true}>
        <Text color={theme.colors.warning}>Loading MCP servers...</Text>
      </AppModal>
    );
  }

  if (error) {
    return (
      <AppModal
        visible={true}
        title="MCP Server Configuration"
        titleColor={theme.colors.error}
        type="error"
        onClose={deactivate}
        closeOnEscape={true}
      >
        <Text color={theme.colors.error}>{error}</Text>
      </AppModal>
    );
  }

  return (
    <MCPModal
      visible={true}
      servers={servers}
      allowedToolsConfig={
        (context.config.get('mcp.allowedTools') as Record<string, Record<string, boolean>> | undefined) || {}
      }
      onClose={deactivate}
      onServerToggle={handleServerToggle}
      onServerReconnect={handleServerReconnect}
      reconnectingServerId={reconnecting}
    />
  );
};

export function registerMCPCommand(registry: CommandRegistry) {
  registry.register({
    id: '/mcp',
    type: 'component',
    description: 'Configure MCP server tool permissions.',
    category: 'config',
    component: MCPCommandComponent,
  });
}
