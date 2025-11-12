import { useEffect, useState } from 'react';
import { Text, useInput } from 'ink';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { readFileSync, existsSync } from 'node:fs';
import { AppModal } from '@/components/AppModal.js';
import MCPModal from '@/components/MCPModal.js';
import type { CommandRegistry, CommandComponentProps } from '@/modules/commands/types.js';
import { useTheme } from '@/contexts/ThemeContext.js';
import type { MCPServerInfo } from '@/services/MCPServerManager.js';

const MCPCommandComponent = ({ context, deactivate }: CommandComponentProps) => {
  const { theme } = useTheme();
  const [servers, setServers] = useState<MCPServerInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useInput(
    (_input, key) => {
      if (key.escape) {
        deactivate();
      }
    },
    { isActive: true },
  );

  useEffect(() => {
    const handleToolPermissionChanged = async (data: { serverId: string; toolName: string; allowed: boolean }) => {
      // Save to config
      try {
        const currentConfig: Record<string, Record<string, boolean>> = context.config.get('mcpAllowedTools') || {};
        const serverKey = data.serverId;

        if (!currentConfig[serverKey]) {
          currentConfig[serverKey] = {};
        }

        currentConfig[serverKey][data.toolName] = data.allowed;

        context.config.set('mcpAllowedTools', currentConfig, 'global');

        // Update the MCP manager with the new config
        await context.orchestrator?.updateMCPAllowedTools?.(currentConfig);
      } catch (error) {
        console.error('Failed to save MCP tool permission:', error);
      }
    };

    const handleBatchToolPermissionChanged = async (data: {
      serverId: string;
      config: Record<string, Record<string, boolean>>;
    }) => {
      // Save batch config update
      try {
        context.config.set('mcpAllowedTools', data.config, 'global');

        // Update the MCP manager with the new config
        await context.orchestrator?.updateMCPAllowedTools?.(data.config);
      } catch (error) {
        console.error('Failed to save MCP batch tool permissions:', error);
      }
    };

    context.eventBus.on('ui:mcp:toolPermissionChanged', handleToolPermissionChanged);
    context.eventBus.on('ui:mcp:batchToolPermissionChanged', handleBatchToolPermissionChanged);

    // Load MCP servers
    const loadMCPServers = async () => {
      try {
        setLoading(true);
        setError(null);

        // Try to get MCP servers from the orchestrator first
        const mcpServers = context.orchestrator?.getMCPServers?.() || [];

        if (mcpServers.length === 0) {
          // If no servers are loaded yet (background init still in progress),
          // try to load from config directly to show placeholder info
          const mcpConfigPath =
            (context.config.get('mcpConfigPath') as string | undefined) ||
            join(homedir(), '.nuvin-cli', '.nuvin_mcp.json');

          try {
            if (existsSync(mcpConfigPath)) {
              const configContent = readFileSync(mcpConfigPath, 'utf8');
              const config = JSON.parse(configContent);
              if (config.mcpServers) {
                const placeholderServers: MCPServerInfo[] = Object.entries(config.mcpServers).map(
                  ([serverId, serverConfig]: [string, { prefix?: string }]) => ({
                    id: serverId,
                    client: null,
                    port: null,
                    exposedTools: [],
                    allowedTools: [],
                    prefix: serverConfig.prefix || `mcp_${serverId}_`,
                    status: 'pending' as const,
                  }),
                );
                setServers(placeholderServers);
                return;
              }
            }
          } catch (_configErr) {
            // Ignore config loading errors, show empty server list
          }
        }

        setServers(mcpServers);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        setError(`Failed to load MCP servers: ${message}`);
      } finally {
        setLoading(false);
      }
    };

    loadMCPServers();

    return () => {
      context.eventBus.off('ui:mcp:toolPermissionChanged', handleToolPermissionChanged);
      context.eventBus.off('ui:mcp:batchToolPermissionChanged', handleBatchToolPermissionChanged);
    };
  }, [context.eventBus, context.config, context.orchestrator]);

  if (loading) {
    return (
      <AppModal
        visible={true}
        title="MCP Server Configuration"
        titleColor={theme.colors.primary}
        type="default"
        onClose={deactivate}
        closeOnEscape={true}
      >
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
        (context.config.get('mcpAllowedTools') as Record<string, Record<string, boolean>> | undefined) || {}
      }
      onClose={deactivate}
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
