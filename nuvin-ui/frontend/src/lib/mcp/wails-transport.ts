import {
  MCPConnection,
  JSONRPCRequest,
  JSONRPCResponse,
  JSONRPCNotification,
  MCPTransportOptions,
} from '@/types/mcp';
// Wails runtime is injected globally in Wails v2
declare global {
  interface Window {
    runtime?: {
      EventsOn: (eventName: string, callback: (data: any) => void) => void;
      EventsOff: (eventName: string) => void;
    };
  }
}

// Note: Wails Go functions are declared in src/lib/github.ts

/**
 * Wails-based MCP transport that uses Go backend for process spawning
 */
export class WailsMCPConnection implements MCPConnection {
  private serverId: string;
  private messageHandlers: Array<
    (message: JSONRPCResponse | JSONRPCNotification) => void
  > = [];
  private errorHandlers: Array<(error: Error) => void> = [];
  private closeHandlers: Array<() => void> = [];
  private isConnected = false;

  constructor(
    serverId: string,
    private options: MCPTransportOptions,
  ) {
    this.serverId = serverId;
    this.setupEventListeners();
  }

  async connect(): Promise<void> {
    if (!window.go?.main?.App) {
      throw new Error('Wails Go backend not available');
    }

    try {
      const request = {
        id: this.serverId,
        command: this.options.command!,
        args: this.options.args || [],
        env: this.options.env || {},
      };

      await window.go.main.App.StartMCPServer(request);
      this.isConnected = true;
      console.log(`MCP server ${this.serverId} started successfully`);
    } catch (error) {
      throw new Error(`Failed to start MCP server: ${error}`);
    }
  }

  async close(): Promise<void> {
    if (!this.isConnected) {
      return;
    }

    try {
      if (window.go?.main?.App) {
        await window.go.main.App.StopMCPServer(this.serverId);
      }
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

    if (!window.go?.main?.App) {
      throw new Error('Wails Go backend not available');
    }

    try {
      await window.go.main.App.SendMCPMessage(this.serverId, message);
    } catch (error) {
      throw new Error(`Failed to send message: ${error}`);
    }
  }

  onMessage(
    handler: (message: JSONRPCResponse | JSONRPCNotification) => void,
  ): void {
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
    if (!window.runtime) {
      console.warn('Wails runtime not available, event listening disabled');
      return;
    }

    // Listen for MCP messages from the Go backend
    window.runtime.EventsOn('mcp-message', (data: any) => {
      if (data.serverId === this.serverId) {
        for (const handler of this.messageHandlers) {
          try {
            handler(data.message);
          } catch (error) {
            console.error('Error in message handler:', error);
          }
        }
      }
    });

    // Listen for MCP server errors
    window.runtime.EventsOn('mcp-server-error', (data: any) => {
      if (data.serverId === this.serverId) {
        const error = new Error(data.error || 'MCP server error');
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
    window.runtime.EventsOn('mcp-server-stopped', (data: any) => {
      if (data.serverId === this.serverId) {
        this.isConnected = false;
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
    window.runtime.EventsOn('mcp-stdout', (data: any) => {
      if (data.serverId === this.serverId) {
        console.log(`MCP ${this.serverId} stdout:`, data.data);
      }
    });

    window.runtime.EventsOn('mcp-stderr', (data: any) => {
      if (data.serverId === this.serverId) {
        console.warn(`MCP ${this.serverId} stderr:`, data.data);
      }
    });
  }

  private cleanupEventListeners(): void {
    if (!window.runtime) {
      return;
    }

    // Clean up event listeners
    window.runtime.EventsOff('mcp-message');
    window.runtime.EventsOff('mcp-server-error');
    window.runtime.EventsOff('mcp-server-stopped');
    window.runtime.EventsOff('mcp-stdout');
    window.runtime.EventsOff('mcp-stderr');
  }
}

/**
 * Factory function to create Wails MCP connections
 */
export function createWailsMCPConnection(
  serverId: string,
  options: MCPTransportOptions,
): WailsMCPConnection {
  return new WailsMCPConnection(serverId, options);
}
