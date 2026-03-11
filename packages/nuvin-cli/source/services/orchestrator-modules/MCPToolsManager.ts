import { CompositeToolPort, type ToolPort } from '@nuvin/nuvin-core';
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
  private baseToolPort: ToolPort | null = null;

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
   * Rebuilds the CompositeToolPort from the base tool port + all currently
   * connected MCP server ports, then updates both the orchestrator's tools
   * and the enabled tools list.
   *
   * This must be called whenever the set of connected MCP servers changes
   * (reconnect, disconnect, permission update) so the orchestrator's tool
   * port reflects the current state.
   */
  recalculateEnabledTools(): void {
    const orchestrator = this.deps.getRuntime()?.orchestrator ?? null;
    if (!orchestrator) return;

    const mcpEnabledTools: string[] = [];
    const mcpPorts: ToolPort[] = [];

    if (this.mcpManager) {
      const allServers = this.mcpManager.getConnectedServers();
      for (const server of allServers) {
        mcpEnabledTools.push(...server.allowedTools);
        if (server.port) {
          mcpPorts.push(server.port);
        }
      }
    }

    // Rebuild the composite tool port so newly connected/disconnected
    // server ports are reflected in the orchestrator's tool set.
    // Lazily capture the base tool port if background init hasn't run yet.
    if (!this.baseToolPort) {
      const currentTools = orchestrator.getTools();
      // Only capture if not already a CompositeToolPort (i.e., still the original base port)
      if (!(currentTools instanceof CompositeToolPort)) {
        this.baseToolPort = currentTools;
      }
    }

    if (this.baseToolPort) {
      const compositeTools = mcpPorts.length > 0
        ? new CompositeToolPort([this.baseToolPort, ...mcpPorts])
        : this.baseToolPort;
      orchestrator.setTools(compositeTools);
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
        if (orchestrator) {
          // Always capture the base tool port before any composite wrapping.
          // This is needed for later reconnect/disconnect to rebuild the composite.
          if (!this.baseToolPort) {
            this.baseToolPort = orchestrator.getTools();
          }

          if (mcpPorts.length > 0) {
            const compositeTools = new CompositeToolPort([this.baseToolPort, ...mcpPorts]);
            orchestrator.setTools(compositeTools);

            const baseTools = getEnabledTools(this.deps.getMemoryConfig());
            const updatedEnabledTools = [...baseTools, ...mcpEnabledTools];
            orchestrator.updateConfig({ enabledTools: updatedEnabledTools });
          }
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
