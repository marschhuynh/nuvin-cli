import type {
  MCPConnection,
  JSONRPCRequest,
  JSONRPCResponse,
  JSONRPCNotification,
  MCPTransportOptions,
} from '@/types/mcp';
import { EventsOn, EventsOff, isWailsEnvironment } from '../browser-runtime';
import * as MCPToolsService from '@wails/services/mcptoolsservice';
declare global {
  interface Window {
    runtime?: {
      EventsOn: (eventName: string, callback: (data: any) => void) => void;
      EventsOff: (eventName: string) => void;
    };
  }
}

// Note: Wails Go functions are declared in src/lib/github.ts

// Debug toggle: localStorage.MCP_DEBUG = '1' or window.__MCP_DEBUG__ = true
function mcpDebugEnabled(): boolean {
  try {
    if (typeof window !== 'undefined' && (window as any).__MCP_DEBUG__) return true;
    return typeof localStorage !== 'undefined' && localStorage.getItem('MCP_DEBUG') === '1';
  } catch {
    return false;
  }
}
function mcpDebug(...args: any[]) {
  if (mcpDebugEnabled()) console.debug('[MCP-Wails]', ...args);
}

/**
 * Wails-based MCP transport that uses Go backend for process spawning
 */
export class WailsMCPConnection implements MCPConnection {
  private serverId: string;
  private messageHandlers: Array<(message: JSONRPCResponse | JSONRPCNotification) => void> = [];
  private errorHandlers: Array<(error: Error) => void> = [];
  private closeHandlers: Array<() => void> = [];
  private isConnected = false;

  constructor(
    serverId: string,
    private options: MCPTransportOptions,
  ) {
    this.serverId = serverId;
    this.setupEventListeners();
    mcpDebug('WailsMCPConnection constructed', { serverId });
  }

  async connect(): Promise<void> {
    if (!isWailsEnvironment()) {
      throw new Error('Wails Go backend not available');
    }

    try {
      // If a process with this serverId is already running (e.g., after hot reload), attach instead of starting.
      try {
        const status = await MCPToolsService.GetMCPServerStatus();
        if (status && status[this.serverId] === 'running') {
          mcpDebug('connect: server already running, attaching', this.serverId);
          this.isConnected = true;
          return;
        }
      } catch {
        // ignore status probe failures
      }

      mcpDebug('connect -> StartMCPServer', {
        serverId: this.serverId,
        command: this.options.command,
        args: this.options.args,
      });
      const request = {
        id: this.serverId,
        command: this.options.command,
        args: this.options.args || [],
        env: this.options.env || {},
      } as any;

      await MCPToolsService.StartMCPServer(request);
      this.isConnected = true;
      mcpDebug('connect <- started');
    } catch (error) {
      const message = String(error);
      if (message.includes('already running')) {
        mcpDebug('connect: StartMCPServer reports already running, attaching');
        this.isConnected = true;
        return;
      }
      throw new Error(`Failed to start MCP server: ${error}`);
    }
  }

  async close(): Promise<void> {
    if (!this.isConnected) {
      return;
    }

    try {
      mcpDebug('close -> StopMCPServer', this.serverId);
      await MCPToolsService.StopMCPServer(this.serverId);
      this.isConnected = false;
      this.cleanupEventListeners();

      // Notify close handlers
      for (const handler of this.closeHandlers) {
        try {
          handler();
        } catch (error) {
          console.error('Error in close handler:', error);
        }
      }
    } catch (error) {
      throw new Error(`Failed to stop MCP server: ${error}`);
    }
  }

  async send(message: JSONRPCRequest | JSONRPCNotification): Promise<void> {
    if (!this.isConnected) {
      throw new Error('Connection not established');
    }

    try {
      mcpDebug('send ->', 'id' in message ? (message as any).id : (message as any).method);
      await MCPToolsService.SendMCPMessage(this.serverId, message as any);
    } catch (error) {
      throw new Error(`Failed to send message: ${error}`);
    }
  }

  onMessage(handler: (message: JSONRPCResponse | JSONRPCNotification) => void): void {
    this.messageHandlers.push(handler);
  }

  onError(handler: (error: Error) => void): void {
    this.errorHandlers.push(handler);
  }

  onClose(handler: () => void): void {
    this.closeHandlers.push(handler);
  }

  isConnectedState(): boolean {
    return this.isConnected;
  }

  private setupEventListeners(): void {
    // Test event listener to verify Wails3 event system is working
    EventsOn('test-event', (data: any) => {
      console.log('[DEBUG] Received test-event:', data);
    });

    // Listen for MCP messages from the Go backend
    EventsOn('mcp-message', (data: any) => {
      console.log('[DEBUG] Raw mcp-message event received:', data);

      // Handle array-wrapped data from Wails3
      const eventData = Array.isArray(data) ? data[0] : data;

      if (eventData.serverId === this.serverId) {
        mcpDebug('event <- mcp-message', eventData?.message?.id ?? '(notify)');
        for (const handler of this.messageHandlers) {
          try {
            handler(eventData.message);
          } catch (error) {
            console.error('Error in message handler:', error);
          }
        }
      } else {
        console.log('[DEBUG] mcp-message ignored - serverId mismatch:', {
          eventServerId: eventData.serverId,
          thisServerId: this.serverId,
        });
      }
    });

    // Listen for MCP server errors
    EventsOn('mcp-server-error', (data: any) => {
      const eventData = Array.isArray(data) ? data[0] : data;
      if (eventData.serverId === this.serverId) {
        const error = new Error(eventData.error || 'MCP server error');
        mcpDebug('event <- mcp-server-error', error.message);
        for (const handler of this.errorHandlers) {
          try {
            handler(error);
          } catch (err) {
            console.error('Error in error handler:', err);
          }
        }
      }
    });

    // Listen for MCP server stopped events
    EventsOn('mcp-server-stopped', (data: any) => {
      const eventData = Array.isArray(data) ? data[0] : data;
      if (eventData.serverId === this.serverId) {
        this.isConnected = false;
        mcpDebug('event <- mcp-server-stopped');
        for (const handler of this.closeHandlers) {
          try {
            handler();
          } catch (error) {
            console.error('Error in close handler:', error);
          }
        }
      }
    });

    // Listen for stdout/stderr for debugging
    EventsOn('mcp-stdout', (data: any) => {
      const eventData = Array.isArray(data) ? data[0] : data;
      if (eventData.serverId === this.serverId) {
        mcpDebug('stdout <-', eventData.data);
      }
    });

    EventsOn('mcp-stderr', (data: any) => {
      const eventData = Array.isArray(data) ? data[0] : data;
      if (eventData.serverId === this.serverId) {
        mcpDebug('stderr <-', eventData.data);
      }
    });
  }

  private cleanupEventListeners(): void {
    // Clean up event listeners
    EventsOff('mcp-message');
    EventsOff('mcp-server-error');
    EventsOff('mcp-server-stopped');
    EventsOff('mcp-stdout');
    EventsOff('mcp-stderr');
  }
}

/**
 * Factory function to create Wails MCP connections
 */
export function createWailsMCPConnection(serverId: string, options: MCPTransportOptions): WailsMCPConnection {
  return new WailsMCPConnection(serverId, options);
}
