import { CompositeToolPort } from '@nuvin/nuvin-core';
import type { OrchestratorRuntime } from '../OrchestratorRuntime.js';
import { MCPServerManager, type MCPServerInfo } from '../MCPServerManager.js';
import { getEnabledTools } from './constants.js';
import type { MemorySettings } from '@/config/types.js';

// ─── Types ─────────────────────────────────────────────────────────────────────

export type MCPToolsManagerDeps = {
  getRuntime: () => OrchestratorRuntime | null;
  getMemoryConfig: () => MemorySettings | undefined;
};

type MCPBackgroundHandlers = {
  handleError: (message: string) => void;
};

// ─── MCPToolsManager ───────────────────────────────────────────────────────────

/**
 * Owns the MCPServerManager lifecycle and MCP-related tool operations.
 * Consolidates the duplicated pattern of recalculating enabled tools
 * (base tools + MCP allowed tools) into a single `recalculateEnabledTools()`.
 */
export class MCPToolsManager {
  private mcpManager: MCPServerManager | null = null;

  constructor(private deps: MCPToolsManagerDeps) {}

  // ─── State accessors ───────────────────────────────────────────────────────

  getMcpManager(): MCPServerManager | null {
    return this.mcpManager;
  }

  setMcpManager(mcpManager: MCPServerManager | null): void {
    this.mcpManager = mcpManager;
  }

  getMCPServers(): MCPServerInfo[] {
    return this.mcpManager?.getAllServers() ?? [];
  }

  // ─── Core: recalculate enabled tools ───────────────────────────────────────

  /**
   * Collects allowed tools from all connected MCP servers and prepends the
   * base enabled tools. Updates the orchestrator config with the combined list.
   *
   * This consolidates a pattern that was previously duplicated 4× across
   * updateMCPAllowedTools, reconnectMCPServer, disconnectMCPServer, and
   * initializeMCPServersInBackground.
   */
  recalculateEnabledTools(): void {
    const orchestrator = this.deps.getRuntime()?.orchestrator ?? null;
    if (!orchestrator) return;

    const mcpEnabledTools: string[] = [];

    if (this.mcpManager) {
      const allServers = this.mcpManager.getConnectedServers();
      for (const server of allServers) {
        mcpEnabledTools.push(...server.allowedTools);
      }
    }

    const baseTools = getEnabledTools(this.deps.getMemoryConfig());
    const updatedEnabledTools = [...baseTools, ...mcpEnabledTools];

    orchestrator.updateConfig({ enabledTools: updatedEnabledTools });
  }

  // ─── MCP tool operations ──────────────────────────────────────────────────

  async updateMCPAllowedTools(allowedToolsConfig: Record<string, Record<string, boolean>>): Promise<void> {
    if (!this.mcpManager || !this.deps.getRuntime()?.orchestrator) return;

    await this.mcpManager.updateAllowedToolsConfig(allowedToolsConfig);
    this.recalculateEnabledTools();
  }

  async reconnectMCPServer(serverId: string): Promise<MCPServerInfo | null> {
    if (!this.mcpManager) return null;

    const serverInfo = await this.mcpManager.reconnectServer(serverId);

    if (serverInfo && serverInfo.status === 'connected' && this.deps.getRuntime()?.orchestrator) {
      this.recalculateEnabledTools();
    }

    return serverInfo;
  }

  async disconnectMCPServer(serverId: string): Promise<boolean> {
    if (!this.mcpManager) return false;

    const success = await this.mcpManager.disconnectServer(serverId);

    if (success && this.deps.getRuntime()?.orchestrator) {
      this.recalculateEnabledTools();
    }

    return success;
  }

  // ─── Background initialization ─────────────────────────────────────────────

  /**
   * Runs MCP server initialization in background (fire-and-forget).
   * Creates a CompositeToolPort from current tools + MCP ports, then
   * updates the orchestrator with the combined tools and enabled list.
   */
  initializeMCPServersInBackground(handlers: MCPBackgroundHandlers): void {
    if (!this.mcpManager) return;

    const mcpManager = this.mcpManager;

    (async () => {
      try {
        const { mcpPorts, enabledTools: mcpEnabledTools } = await mcpManager.initializeServers();

        const orchestrator = this.deps.getRuntime()?.orchestrator ?? null;
        if (mcpPorts.length > 0 && orchestrator) {
          const currentTools = orchestrator.getTools();
          const compositeTools = new CompositeToolPort([currentTools, ...mcpPorts]);

          orchestrator.setTools(compositeTools);

          const baseTools = getEnabledTools(this.deps.getMemoryConfig());
          const updatedEnabledTools = [...baseTools, ...mcpEnabledTools];
          orchestrator.updateConfig({ enabledTools: updatedEnabledTools });
        }
      } catch (err) {
        console.error('[MCP Init] Failed to initialize MCP servers:', err);
        handlers.handleError(
          `Failed to initialize MCP servers: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    })();
  }

  // ─── Cleanup ──────────────────────────────────────────────────────────────

  async cleanup(): Promise<void> {
    await this.mcpManager?.disconnectAllServers?.();
  }
}
