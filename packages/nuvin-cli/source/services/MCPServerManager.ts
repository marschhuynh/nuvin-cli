import { MCPToolPort, CoreMCPClient, loadMCPConfig } from '@nuvin/nuvin-core';
import type { MCPConfig, MCPServerConfig } from '@nuvin/nuvin-core';
import * as crypto from 'node:crypto';
import * as path from 'node:path';
import * as os from 'node:os';
import type { MessageLine } from '@/adapters/index.js';
import { theme, type ColorToken } from '@/theme.js';

// Default MCP config path
const DEFAULT_MCP_CONFIG_PATH = path.join(os.homedir(), '.nuvin-cli', '.nuvin_mcp.json');

export interface MCPServerInfo {
  id: string;
  client: CoreMCPClient | null;
  port: MCPToolPort | null;
  exposedTools: string[]; // All available tools (unfiltered)
  allowedTools: string[]; // Currently allowed/enabled tools (filtered)
  prefix: string;
  status: 'connected' | 'failed' | 'pending';
  error?: string;
}

export interface MCPServerManagerOptions {
  configPath?: string;
  config?: MCPConfig | null;
  appendLine: (line: MessageLine) => void;
  handleError: (message: string) => void;
  silentInit?: boolean;
}

export class MCPServerManager {
  private servers: Map<string, MCPServerInfo> = new Map();
  private failedServers: Map<string, MCPServerInfo> = new Map();
  private options: MCPServerManagerOptions;
  private allowedToolsConfig: Record<string, Record<string, boolean>> = {};

  constructor(options: MCPServerManagerOptions) {
    this.options = options;
  }

  async initializeServers(): Promise<{
    mcpPorts: MCPToolPort[];
    mcpClients: CoreMCPClient[];
    enabledTools: string[];
  }> {
    const mcpPorts: MCPToolPort[] = [];
    const mcpClients: CoreMCPClient[] = [];
    const enabledTools: string[] = [];

    const inlineConfig = this.options.config ?? null;
    const shouldUseInline = Boolean(inlineConfig?.mcpServers && Object.keys(inlineConfig.mcpServers).length > 0);
    const configPath = this.options.configPath || DEFAULT_MCP_CONFIG_PATH;
    let cfg: MCPConfig | null = null;

    try {
      cfg = shouldUseInline ? inlineConfig : await loadMCPConfig(configPath);
      if (!cfg?.mcpServers) {
        return { mcpPorts, mcpClients, enabledTools };
      }

      for (const [serverId, serverCfg] of Object.entries(cfg.mcpServers)) {
        try {
          const serverInfo = await this.initializeServer(serverId, serverCfg);
          if (serverInfo) {
            if (serverInfo.status === 'connected') {
              this.servers.set(serverId, serverInfo);
              if (serverInfo.port !== null) {
                mcpPorts.push(serverInfo.port);
              }
              if (serverInfo.client !== null) {
                mcpClients.push(serverInfo.client);
              }
              enabledTools.push(...serverInfo.allowedTools);
            } else {
              // Store failed servers to show in UI
              this.failedServers.set(serverId, serverInfo);
            }
          }
        } catch (err: unknown) {
          // Create failed server entry
          const errorMessage = err instanceof Error ? err.message : String(err);
          const prefix = (serverCfg.prefix as string) || `mcp_${serverId}_`;
          this.failedServers.set(serverId, {
            id: serverId,
            client: null,
            port: null,
            exposedTools: [],
            allowedTools: [],
            prefix,
            status: 'failed',
            error: errorMessage,
          });

          if (!this.options.silentInit) {
            this.handleServerError(serverId, err, 'initialize');
          }
        }
      }
    } catch (err: unknown) {
      this.handleConfigError(shouldUseInline ? 'inline-config' : configPath, err);
    }

    return { mcpPorts, mcpClients, enabledTools };
  }

  private async initializeServer(serverId: string, serverCfg: MCPServerConfig): Promise<MCPServerInfo | null> {
    let client: CoreMCPClient | null = null;
    const timeoutMs = serverCfg.timeoutMs || 120_000;

    if (serverCfg.transport === 'http' && serverCfg.url) {
      client = new CoreMCPClient(
        {
          type: 'http',
          url: serverCfg.url,
          headers: serverCfg.headers,
        },
        timeoutMs,
      );
    } else if (serverCfg.command) {
      client = new CoreMCPClient(
        {
          type: 'stdio',
          command: serverCfg.command,
          args: serverCfg.args,
          env: serverCfg.env,
          stderr: 'pipe',
        },
        timeoutMs,
      );
    }

    if (!client) {
      const errorMsg = `Missing or invalid transport configuration`;
      if (!this.options.silentInit) {
        this.logInfo(`MCP server '${serverId}' missing transport info; skipping`, 'yellow');
      }
      // Return failed server info instead of null
      const prefix = (serverCfg.prefix as string) || `mcp_${serverId}_`;
      return {
        id: serverId,
        client: null,
        port: null,
        exposedTools: [],
        allowedTools: [],
        prefix,
        status: 'failed' as const,
        error: errorMsg,
      };
    }

    const prefix: string = serverCfg.prefix || `mcp_${serverId}_`;
    const port = new MCPToolPort(client, { prefix });
    await port.init();
    const allTools = port.getExposedToolNames();
    let allowedTools = [...allTools]; // Start with all tools

    // Filter tools based on allowed config if provided
    if (this.allowedToolsConfig?.[serverId]) {
      const serverAllowedConfig = this.allowedToolsConfig[serverId];
      const originalCount = allowedTools.length;

      allowedTools = allowedTools.filter((toolName) => {
        // Default to true if not explicitly forbidden
        return serverAllowedConfig[toolName] !== false;
      });

      if (!this.options.silentInit && allowedTools.length !== originalCount) {
        this.logInfo(
          `MCP server '${serverId}' filtered from ${originalCount} to ${allowedTools.length} tools based on config.`,
          'yellow',
        );
      }
    }

    // Always return server info even if no allowed tools
    // The modal needs to see all servers to configure them
    if (!this.options.silentInit) {
      this.logInfo(
        `MCP server '${serverId}' loaded with ${allTools.length} tools (${allowedTools.length} allowed, prefix='${prefix}', timeout=${timeoutMs}ms).`,
        'green',
      );
    }

    return {
      id: serverId,
      client,
      port,
      exposedTools: allTools,
      allowedTools,
      prefix,
      status: 'connected' as const,
    };
  }

  async disconnectAllServers(): Promise<void> {
    const servers = Array.from(this.servers.values());
    if (!servers.length) return;

    const promises = servers.map(async (serverInfo, index) => {
      try {
        await serverInfo.client.disconnect();
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        this.logError(`Error disconnecting MCP server ${index + 1}: ${message}`);
      }
    });

    await Promise.allSettled(promises);
    this.servers.clear();
  }

  async disconnectServer(serverId: string): Promise<boolean> {
    const serverInfo = this.servers.get(serverId);
    if (!serverInfo) return false;

    try {
      await serverInfo.client.disconnect();
      this.servers.delete(serverId);
      return true;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logError(`Error disconnecting MCP server '${serverId}': ${message}`);
      return false;
    }
  }

  getServerInfo(serverId: string): MCPServerInfo | undefined {
    return this.servers.get(serverId);
  }

  getAllServers(): MCPServerInfo[] {
    // Return both connected and failed servers
    return [...Array.from(this.servers.values()), ...Array.from(this.failedServers.values())];
  }

  getConnectedServers(): MCPServerInfo[] {
    return Array.from(this.servers.values());
  }

  getFailedServers(): MCPServerInfo[] {
    return Array.from(this.failedServers.values());
  }

  getConnectedServerIds(): string[] {
    return Array.from(this.servers.keys());
  }

  async updateAllowedToolsConfig(allowedToolsConfig: Record<string, Record<string, boolean>>): Promise<void> {
    // Store the new config for future use
    this.allowedToolsConfig = allowedToolsConfig;

    // Update each server's allowed tools based on the new config
    for (const [serverId, serverInfo] of this.servers.entries()) {
      const serverAllowedConfig = allowedToolsConfig[serverId];
      if (!serverAllowedConfig) continue;

      const allTools = serverInfo.exposedTools;
      const filteredTools = allTools.filter((toolName) => {
        // Default to true if not explicitly forbidden
        return serverAllowedConfig[toolName] !== false;
      });

      // Update the server info (silent update, no logging for UI-triggered changes)
      serverInfo.allowedTools = filteredTools;
    }
  }

  setAllowedToolsConfig(allowedToolsConfig: Record<string, Record<string, boolean>>): void {
    this.allowedToolsConfig = allowedToolsConfig;
  }

  private handleServerError(serverId: string, err: unknown, operation: string): void {
    const message = this.extractErrorMessage(err);
    this.options.handleError(`Failed to ${operation} MCP server '${serverId}': ${message}`);
  }

  private handleConfigError(configPath: string, err: unknown): void {
    const message = this.extractErrorMessage(err);
    this.options.handleError(`Failed to load MCP config from ${configPath}: ${message}`);
  }

  private extractErrorMessage(err: unknown): string {
    return typeof err === 'object' && err !== null && 'message' in err
      ? ((err as { message?: string }).message ?? 'Unknown error')
      : String(err);
  }

  private logInfo(content: string, color: ColorToken = 'green'): void {
    this.options.appendLine({
      id: crypto.randomUUID(),
      type: 'info',
      content,
      metadata: { timestamp: new Date().toISOString() },
      color: theme.colors[color] ?? theme.tokens.green,
    });
  }

  private logError(content: string): void {
    this.options.appendLine({
      id: crypto.randomUUID(),
      type: 'warning',
      content,
      metadata: { timestamp: new Date().toISOString() },
      color: theme.colors.warning,
    });
  }
}
