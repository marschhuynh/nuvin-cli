import type { StdioServerParameters } from '@modelcontextprotocol/sdk/client/stdio.js';
import type { Transport } from '@modelcontextprotocol/sdk/shared/transport.js';
import type { JSONRPCMessage, MessageExtraInfo } from '@modelcontextprotocol/sdk/types.js';
import { smartFetch } from '@/lib/fetch-proxy';

/**
 * Browser-compatible stdio transport that uses nuvin-srv proxy
 *
 * This transport implements the MCP stdio transport interface for browser environments
 * by proxying process spawning and stdin/stdout communication through nuvin-srv.
 * It maintains full compatibility with the MCP stdio transport protocol while working
 * around browser limitations for process spawning.
 *
 * Usage:
 * ```typescript
 * import { StdioBrowserTransport } from '@/lib/mcp/transport/stdio-browser';
 * import { Client } from '@modelcontextprotocol/sdk/client/index.js';
 *
 * const transport = new StdioBrowserTransport({
 *   command: "node",
 *   args: ["mcp-server.js"]
 * });
 *
 * const client = new Client({
 *   name: "my-client",
 *   version: "1.0.0"
 * });
 *
 * await client.connect(transport);
 * ```
 */
export class StdioBrowserTransport implements Transport {
  private processId: string | null = null;
  private messageHandlers: Array<(message: unknown) => void> = [];
  private errorHandlers: Array<(error: Error) => void> = [];
  private closeHandlers: Array<() => void> = [];
  private isConnected = false;
  private eventSource: EventSource | null = null;
  private serverBaseUrl: string;

  // MCP SDK transport interface compatibility
  public onmessage?: (message: JSONRPCMessage, extra?: MessageExtraInfo) => void;
  public onerror?: (error: Error) => void;
  public onclose?: () => void;

  constructor(
    private options: StdioServerParameters & {
      serverUrl?: string;
    },
  ) {
    // Generate a unique process ID for this transport instance
    this.processId = `stdio-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;
    // Get the server base URL from options or environment
    this.serverBaseUrl = options.serverUrl || import.meta.env.VITE_SERVER_URL || 'http://localhost:8080';
  }

  // MCP SDK transport interface methods
  async start(): Promise<void> {
    console.debug('[StdioBrowserTransport] start() called');
    return this.connect();
  }

  async connect(): Promise<void> {
    console.debug('[StdioBrowserTransport] connect() called');
    if (this.isConnected) {
      return;
    }

    try {
      // Start the MCP server process via nuvin-srv
      const startResponse = await smartFetch(`${this.serverBaseUrl}/api/mcp/stdio/start`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          processId: this.processId,
          command: this.options.command,
          args: this.options.args || [],
          env: this.options.env || {},
        }),
      });

      if (!startResponse.ok) {
        const error = await startResponse.text();
        throw new Error(`Failed to start stdio process: ${error}`);
      }

      // Set up Server-Sent Events to listen for stdout messages
      this.setupSSEConnection();
      this.isConnected = true;
    } catch (error) {
      throw new Error(`Failed to connect stdio transport: ${error}`);
    }
  }

  async close(): Promise<void> {
    console.debug('[StdioBrowserTransport] close() called');
    if (!this.isConnected || !this.processId) {
      return Promise.resolve();
    }

    try {
      // Close SSE connection
      if (this.eventSource) {
        this.eventSource.close();
        this.eventSource = null;
      }

      // Stop the process via nuvin-srv
      await smartFetch(`${this.serverBaseUrl}/api/mcp/stdio/stop`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          processId: this.processId,
        }),
      });

      this.isConnected = false;
      this.processId = null;

      // Notify close handlers
      for (const handler of this.closeHandlers) {
        try {
          handler();
        } catch (error) {
          console.error('Error in close handler:', error);
        }
      }
    } catch (error) {
      throw new Error(`Failed to close stdio transport: ${error}`);
    }
  }

  // MCP SDK compatible send method - return Promise for SDK compatibility
  send(message: string | unknown): Promise<void> {
    if (!this.isConnected || !this.processId) {
      return Promise.reject(new Error('Transport not connected'));
    }

    try {
      // Convert message to string if it's not already
      let messageStr: string;
      if (typeof message === 'string') {
        messageStr = message;
      } else {
        // If it's an object, serialize it to JSON
        console.debug('[StdioBrowserTransport] Converting object message to JSON:', message);
        messageStr = JSON.stringify(message);
      }

      // Add newline for the stdio protocol if not present
      if (!messageStr.endsWith('\n')) {
        messageStr += '\n';
      }

      console.debug('[StdioBrowserTransport] Sending message:', `${messageStr.substring(0, 200)}...`);

      // Send to stdin via nuvin-srv and return the promise
      return smartFetch(`${this.serverBaseUrl}/api/mcp/stdio/send`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          processId: this.processId,
          data: messageStr,
        }),
      })
        .then((response) => {
          if (!response.ok) {
            throw new Error(`Failed to send message: ${response.status} ${response.statusText}`);
          }
          return Promise.resolve();
        })
        .catch((error) => {
          if (this.onerror) {
            this.onerror(new Error(`Failed to send message: ${error}`));
          }
          throw error;
        });
    } catch (error) {
      if (this.onerror) {
        this.onerror(new Error(`Failed to send message via stdio transport: ${error}`));
      }
      return Promise.reject(error);
    }
  }

  // Keep the async version for internal use
  async sendAsync(message: unknown): Promise<void> {
    if (!this.isConnected || !this.processId) {
      throw new Error('Transport not connected');
    }

    try {
      // Convert message to newline-delimited JSON as per stdio spec
      const messageStr = `${JSON.stringify(message)}\n`;

      // Send to stdin via nuvin-srv
      const response = await smartFetch(`${this.serverBaseUrl}/api/mcp/stdio/send`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          processId: this.processId,
          data: messageStr,
        }),
      });

      if (!response.ok) {
        const error = await response.text();
        throw new Error(`Failed to send message: ${error}`);
      }
    } catch (error) {
      throw new Error(`Failed to send message via stdio transport: ${error}`);
    }
  }

  onMessage(handler: (message: unknown) => void): void {
    this.messageHandlers.push(handler);
  }

  onError(handler: (error: Error) => void): void {
    this.errorHandlers.push(handler);
  }

  onClose(handler: () => void): void {
    this.closeHandlers.push(handler);
  }

  private setupSSEConnection(): void {
    if (!this.processId) return;

    // Create SSE connection to listen for stdout/stderr messages
    const sseUrl = `${this.serverBaseUrl}/api/mcp/stdio/events/${this.processId}`;
    this.eventSource = new EventSource(sseUrl);

    this.eventSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);

        switch (data.type) {
          case 'stdout':
            // Parse newline-delimited JSON messages from stdout
            this.handleStdoutData(data.content);
            break;

          case 'stderr':
            // Log stderr for debugging (as per stdio spec)
            console.warn('[MCP-Stdio-Browser]', data.content);
            break;

          case 'error': {
            // Handle process errors
            const error = new Error(data.content ?? 'Process error');

            // Emit for MCP SDK
            if (this.onerror) {
              this.onerror(error);
            }

            // Also call internal handlers
            for (const handler of this.errorHandlers) {
              try {
                handler(error);
              } catch (err) {
                console.error('Error in error handler:', err);
              }
            }
            break;
          }

          case 'exit':
            // Process exited
            this.isConnected = false;
            if (this.eventSource) {
              this.eventSource.close();
              this.eventSource = null;
            }

            // Emit for MCP SDK
            if (this.onclose) {
              this.onclose();
            }

            // Also call internal handlers
            for (const handler of this.closeHandlers) {
              try {
                handler();
              } catch (err) {
                console.error('Error in close handler:', err);
              }
            }
            break;
        }
      } catch (error) {
        console.error('[MCP-Stdio-Browser] Failed to parse SSE event:', error);
      }
    };

    this.eventSource.onerror = (_event) => {
      const error = new Error('SSE connection error');

      // Emit for MCP SDK
      if (this.onerror) {
        this.onerror(error);
      }

      // Also call internal handlers
      for (const handler of this.errorHandlers) {
        try {
          handler(error);
        } catch (err) {
          console.error('Error in error handler:', err);
        }
      }
    };
  }

  private handleStdoutData(data: string): void {
    // Split by newlines and process each line as a separate JSON-RPC message
    const lines = data.split('\n').filter((line) => line.trim());

    for (const line of lines) {
      // Skip lines that clearly aren't JSON-RPC messages
      const trimmed = line.trim();
      if (!trimmed.startsWith('{') || !trimmed.endsWith('}')) {
        // Log non-JSON output for debugging but don't try to parse it
        console.debug('[MCP-Stdio-Browser] Non-JSON stdout:', trimmed);
        continue;
      }

      try {
        const message = JSON.parse(trimmed);

        // Validate it's a proper JSON-RPC message
        if (this.isValidJSONRPCMessage(message)) {
          console.debug('[MCP-Stdio-Browser] Received JSON-RPC message:', message);

          // Emit event compatible with MCP SDK
          if (this.onmessage) {
            // Call with the actual JSONRPCMessage as expected by Transport interface
            this.onmessage(message as JSONRPCMessage);
          }

          // Also call our internal handlers for backward compatibility
          for (const handler of this.messageHandlers) {
            try {
              handler(message);
            } catch (error) {
              console.error('Error in message handler:', error);
            }
          }
        } else {
          console.debug('[MCP-Stdio-Browser] JSON object is not valid JSON-RPC message:', message);
        }
      } catch {
        // Only log parsing errors for lines that looked like they should be JSON
        console.debug('[MCP-Stdio-Browser] Failed to parse potential JSON message:', trimmed);
      }
    }
  }

  private isValidJSONRPCMessage(obj: unknown): boolean {
    if (!obj || typeof obj !== 'object') return false;

    // Must have jsonrpc: "2.0"
    if ((obj as Record<string, unknown>).jsonrpc !== '2.0') return false;

    // Response must have id and result or error
    if ('id' in obj) {
      return 'result' in obj || 'error' in obj;
    }

    // Notification must have method
    if ('method' in obj && typeof (obj as Record<string, unknown>).method === 'string') {
      return true;
    }

    return false;
  }
}

/**
 * Factory function to create stdio browser transport
 */
export function createStdioBrowserTransport(options: StdioServerParameters & { serverUrl?: string }): Transport {
  return new StdioBrowserTransport(options);
}
