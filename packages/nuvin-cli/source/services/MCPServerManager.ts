import { MCPToolPort, CoreMCPClient, MCPOAuthClient, type MCPAuthOptions } from '@nuvin/nuvin-core';
import * as crypto from 'node:crypto';
import type { MessageLine } from '@/adapters/index.js';
import { theme, type ColorToken } from '@/theme.js';
import type { MCPServerConfig, MCPSettings } from '@/config/types.js';
import type { TypedEventBus } from './EventBus.js';
import { FileTokenStorage } from './TokenStorage.js';

export interface MCPAuthStatus {
  type: 'none' | 'bearer' | 'oauth';
  authenticated?: boolean;
  expiresAt?: number;
  scope?: string;
}

export interface MCPServerInfo {
  id: string;
  client: CoreMCPClient | null;
  port: MCPToolPort | null;
  exposedTools: string[];
  allowedTools: string[];
  prefix: string;
  status: 'connected' | 'failed' | 'pending';
  error?: string;
  disabled?: boolean;
  authStatus?: MCPAuthStatus;
}

export interface MCPServerManagerOptions {
  getConfig: () => MCPSettings | undefined;
  appendLine: (line: MessageLine) => void;
  handleError: (message: string) => void;
  silentInit?: boolean;
  eventBus?: TypedEventBus;
}

export class MCPServerManager {
  private servers: Map<string, MCPServerInfo> = new Map();
  private failedServers: Map<string, MCPServerInfo> = new Map();
  private options: MCPServerManagerOptions;
  private allowedToolsConfig: Record<string, Record<string, boolean>> = {};

  constructor(options: MCPServerManagerOptions) {
    this.options = options;
  }

  private emitServersChanged(): void {
    this.options.eventBus?.emit('mcp:serversChanged');
  }

  private get config(): MCPSettings | undefined {
    return this.options.getConfig();
  }

  async initializeServers(): Promise<{
    mcpPorts: MCPToolPort[];
    mcpClients: CoreMCPClient[];
    enabledTools: string[];
  }> {
    const mcpPorts: MCPToolPort[] = [];
    const mcpClients: CoreMCPClient[] = [];
    const enabledTools: string[] = [];

    const servers = this.config?.servers;
    if (!servers || Object.keys(servers).length === 0) {
      return { mcpPorts, mcpClients, enabledTools };
    }

    if (this.config?.allowedTools) {
      this.allowedToolsConfig = this.config.allowedTools;
    }

    const serverEntries = Object.entries(servers).filter(([, cfg]) => cfg.enabled !== false);

    const initPromises = serverEntries.map(async ([serverId, serverCfg]) => {
      try {
        const serverInfo = await this.initializeServer(serverId, serverCfg);
        return { serverId, serverCfg, serverInfo, error: null };
      } catch (err) {
        return { serverId, serverCfg, serverInfo: null, error: err };
      }
    });

    const results = await Promise.allSettled(initPromises);

    for (const result of results) {
      if (result.status === 'rejected') continue;

      const { serverId, serverCfg, serverInfo, error } = result.value;

      if (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        const prefix = serverCfg.prefix || `mcp_${serverId}_`;
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
          this.handleServerError(serverId, error, 'initialize');
        }
        continue;
      }

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
          this.emitServersChanged();
        } else {
          this.failedServers.set(serverId, serverInfo);
          this.emitServersChanged();
        }
      }
    }

    return { mcpPorts, mcpClients, enabledTools };
  }

  private async initializeServer(serverId: string, serverCfg: MCPServerConfig): Promise<MCPServerInfo | null> {
    let client: CoreMCPClient | null = null;
    const timeoutMs = serverCfg.timeoutMs || this.config?.defaultTimeoutMs || 120_000;

    if (serverCfg.transport === 'http' && serverCfg.url) {
      // Build auth config for HTTP transport
      let auth: MCPAuthOptions | undefined;

      if (serverCfg.auth?.type === 'oauth') {
        const tokenStorage = new FileTokenStorage();
        const oauthClient = new MCPOAuthClient(serverCfg.url, serverCfg.auth.oauth || {}, tokenStorage);

        auth = {
          type: 'oauth' as const,
          getToken: async () => oauthClient.getAccessToken(),
          onAuthRequired: async () => {
            this.logInfo(
              `MCP server '${serverId}' requires authentication. Run: nuvin mcp login ${serverId}`,
              'yellow',
            );
            return null;
          },
        };
      } else if (serverCfg.auth?.type === 'bearer' && serverCfg.auth.token) {
        auth = {
          type: 'bearer' as const,
          token: serverCfg.auth.token,
        };
      }

      client = new CoreMCPClient(
        {
          type: 'http',
          url: serverCfg.url,
          headers: serverCfg.headers,
          auth,
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
      const errorMsg = 'Missing or invalid transport configuration';
      if (!this.options.silentInit) {
        this.logInfo(`MCP server '${serverId}' missing transport info; skipping`, 'yellow');
      }
      const prefix = serverCfg.prefix || `mcp_${serverId}_`;
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

    const prefix = serverCfg.prefix || `mcp_${serverId}_`;
    const port = new MCPToolPort(client, { prefix });
    await port.init();
    const allTools = port.getExposedToolNames();
    let allowedTools = [...allTools];

    if (this.allowedToolsConfig?.[serverId]) {
      const serverAllowedConfig = this.allowedToolsConfig[serverId];
      const originalCount = allowedTools.length;

      allowedTools = allowedTools.filter((toolName) => {
        return serverAllowedConfig[toolName] !== false;
      });

      if (!this.options.silentInit && allowedTools.length !== originalCount) {
        this.logInfo(
          `MCP server '${serverId}' filtered from ${originalCount} to ${allowedTools.length} tools based on config.`,
          'yellow',
        );
      }
    }

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
        if (serverInfo.client) {
          await serverInfo.client.disconnect();
        }
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
    if (!serverInfo || !serverInfo.client) return false;

    try {
      await serverInfo.client.disconnect();
      this.servers.delete(serverId);
      this.emitServersChanged();
      return true;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logError(`Error disconnecting MCP server '${serverId}': ${message}`);
      return false;
    }
  }

  async reconnectServer(serverId: string): Promise<MCPServerInfo | null> {
    const serverCfg = this.config?.servers?.[serverId];
    if (!serverCfg) {
      this.logError(`MCP server '${serverId}' not found in config`);
      return null;
    }

    if (serverCfg.enabled === false) {
      this.logInfo(`MCP server '${serverId}' is disabled`, 'yellow');
      return null;
    }

    const existingServer = this.servers.get(serverId);
    if (existingServer?.client) {
      try {
        await existingServer.client.disconnect();
      } catch {}
    }

    const failedServer = this.failedServers.get(serverId);
    if (failedServer?.client) {
      try {
        await failedServer.client.disconnect();
      } catch {}
    }

    this.servers.delete(serverId);
    this.failedServers.delete(serverId);

    await new Promise((resolve) => setTimeout(resolve, 100));

    try {
      const serverInfo = await this.initializeServer(serverId, serverCfg);
      if (serverInfo) {
        if (serverInfo.status === 'connected') {
          this.servers.set(serverId, serverInfo);
          this.logInfo(`MCP server '${serverId}' reconnected successfully`, 'green');
        } else {
          this.failedServers.set(serverId, serverInfo);
        }
        this.emitServersChanged();
        return serverInfo;
      }
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      const prefix = serverCfg.prefix || `mcp_${serverId}_`;
      const failedInfo: MCPServerInfo = {
        id: serverId,
        client: null,
        port: null,
        exposedTools: [],
        allowedTools: [],
        prefix,
        status: 'failed',
        error: errorMessage,
      };
      this.failedServers.set(serverId, failedInfo);
      this.emitServersChanged();
      this.handleServerError(serverId, err, 'reconnect');
      return failedInfo;
    }

    return null;
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
      color: (theme.colors as unknown as Record<string, string>)[color] ?? theme.tokens.green,
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
