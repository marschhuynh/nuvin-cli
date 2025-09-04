import type { StdioServerParameters } from '@modelcontextprotocol/sdk/client/stdio.js';
import type { Transport } from '@modelcontextprotocol/sdk/shared/transport.js';
import type { JSONRPCMessage, MessageExtraInfo } from '@modelcontextprotocol/sdk/types.js';
import { EventsOn, EventsOff, isWailsEnvironment } from '@/lib/browser-runtime';
import * as MCPToolsService from '@wails/services/mcptoolsservice';

// Lightweight debug toggle: set localStorage.MCP_DEBUG = '1' to enable
function mcpDebugEnabled(): boolean {
  try {
    if (typeof window !== 'undefined' && (window as any).__MCP_DEBUG__) return true;
    return typeof localStorage !== 'undefined' && localStorage.getItem('MCP_DEBUG') === '1';
  } catch {
    return false;
  }
}
function mcpDebug(...args: any[]) {
  if (mcpDebugEnabled()) console.debug('[MCP-Stdio-Wails]', ...args);
}

/**
 * Wails-backed stdio transport implementing the official MCP Transport interface.
 *
 * Uses the Wails Go backend to spawn and communicate with an MCP server over stdio.
 * Hooks into Wails events to receive JSON-RPC messages and forwards them to the MCP Client.
 */
export class StdioWailsTransport implements Transport {
  // Transport callbacks set by the MCP client
  public onmessage?: (message: JSONRPCMessage, extra?: MessageExtraInfo) => void;
  public onerror?: (error: Error) => void;
  public onclose?: () => void;

  private readonly serverId: string;
  private readonly options: StdioServerParameters;
  private connected = false;

  constructor(options: StdioServerParameters & { serverId?: string }) {
    this.options = options;
    // Use provided id when given (e.g., to tie to UI config); otherwise generate a unique one
    this.serverId = options.serverId || `wails-stdio-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  }

  // Official Transport method. Alias to connect for parity with other transports in this codebase.
  async start(): Promise<void> {
    return this.connect();
  }

  async connect(): Promise<void> {
    if (this.connected) return;

    if (!isWailsEnvironment()) {
      throw new Error('Wails runtime not detected; StdioWailsTransport requires desktop app runtime');
    }

    try {
      // If a process with this id is already running (e.g. after hot reload), don't re-spawn
      try {
        const status = await MCPToolsService.GetMCPServerStatus();
        if (status && status[this.serverId] === 'running') {
          mcpDebug('attach to existing process', this.serverId);
          this.connected = true;
          this.setupEventListeners();
          return;
        }
      } catch {
        // Ignore status probe failures
      }

      mcpDebug('StartMCPServer ->', {
        id: this.serverId,
        command: this.options.command,
        args: this.options.args,
      });

      await MCPToolsService.StartMCPServer({
        id: this.serverId,
        command: this.options.command,
        args: this.options.args || [],
        env: this.options.env || {},
      });

      this.setupEventListeners();
      this.connected = true;
      mcpDebug('StartMCPServer <- ok');
    } catch (error: any) {
      // Tolerate already-running case
      const message = String(error?.message || error);
      if (message.includes('already running')) {
        this.connected = true;
        this.setupEventListeners();
        mcpDebug('already running; attached');
        return;
      }
      throw new Error(`Failed to start Wails stdio transport: ${message}`);
    }
  }

  async close(): Promise<void> {
    if (!this.connected) return;
    try {
      mcpDebug('StopMCPServer ->', this.serverId);
      await MCPToolsService.StopMCPServer(this.serverId);
    } finally {
      this.connected = false;
      this.cleanupEventListeners();
      if (this.onclose) this.onclose();
    }
  }

  // The MCP client calls this with JSON-RPC messages.
  async send(message: string | JSONRPCMessage): Promise<void> {
    if (!this.connected) throw new Error('Transport not connected');

    try {
      let payload: JSONRPCMessage;
      if (typeof message === 'string') {
        payload = JSON.parse(message) as JSONRPCMessage;
      } else {
        payload = message;
      }
      mcpDebug('send ->', 'id' in payload ? (payload as any).id : (payload as any).method);
      await MCPToolsService.SendMCPMessage(this.serverId, payload as any);
    } catch (err: any) {
      const error = new Error(`Failed to send message: ${String(err?.message || err)}`);
      if (this.onerror) this.onerror(error);
      throw error;
    }
  }

  private setupEventListeners(): void {
    // Messages from MCP process routed by serverId
    EventsOn('mcp-message', (data: any) => {
      const eventData = Array.isArray(data) ? data[0] : data;
      if (eventData?.serverId !== this.serverId) return;
      const msg = eventData.message as JSONRPCMessage;
      mcpDebug('event <- message', (msg as any)?.id ?? (msg as any)?.method ?? '(unknown)');
      if (this.onmessage) {
        try {
          this.onmessage(msg);
        } catch (err) {
          console.error('onmessage handler error', err);
        }
      }
    });

    EventsOn('mcp-server-error', (data: any) => {
      const eventData = Array.isArray(data) ? data[0] : data;
      if (eventData?.serverId !== this.serverId) return;
      const error = new Error(eventData?.error || 'MCP server error');
      mcpDebug('event <- error', error.message);
      if (this.onerror) this.onerror(error);
    });

    EventsOn('mcp-server-stopped', (data: any) => {
      const eventData = Array.isArray(data) ? data[0] : data;
      if (eventData?.serverId !== this.serverId) return;
      mcpDebug('event <- stopped');
      this.connected = false;
      if (this.onclose) this.onclose();
    });

    // Optional: surface stdout/stderr for diagnostics
    EventsOn('mcp-stdout', (data: any) => {
      const eventData = Array.isArray(data) ? data[0] : data;
      if (eventData?.serverId !== this.serverId) return;
      mcpDebug('stdout <-', eventData?.data);
    });

    EventsOn('mcp-stderr', (data: any) => {
      const eventData = Array.isArray(data) ? data[0] : data;
      if (eventData?.serverId !== this.serverId) return;
      mcpDebug('stderr <-', eventData?.data);
    });
  }

  private cleanupEventListeners(): void {
    // NOTE: EventsOff removes all handlers for the event. This is fine if a single transport
    // is used at a time. If multiple servers might run concurrently, consider scoping in runtime.
    EventsOff('mcp-message');
    EventsOff('mcp-server-error');
    EventsOff('mcp-server-stopped');
    EventsOff('mcp-stdout');
    EventsOff('mcp-stderr');
  }
}

export function createStdioWailsTransport(options: StdioServerParameters & { serverId?: string }): Transport {
  return new StdioWailsTransport(options);
}
