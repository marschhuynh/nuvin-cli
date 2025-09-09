import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { StdioClientTransport, StdioServerParameters } from '@modelcontextprotocol/sdk/client/stdio.js';
import type { Transport } from '@modelcontextprotocol/sdk/shared/transport.js';
import type {
  ListToolsRequest,
  CallToolRequest,
} from '@modelcontextprotocol/sdk/types.js';
import { ListToolsResultSchema, CallToolResultSchema } from '@modelcontextprotocol/sdk/types.js';

export type MCPHttpOptions = { type: 'http'; url: string; headers?: Record<string, string> };
export type MCPStdioOptions = {
  type: 'stdio'; command: string; args?: string[]; env?: Record<string, string>;
  stderr?: StdioServerParameters['stderr'];
  cwd?: string;
};
export type MCPOptions = MCPHttpOptions | MCPStdioOptions;

export type MCPToolSchema = {
  name: string;
  description?: string;
  inputSchema: Record<string, unknown>;
};

export type MCPToolCall = { name: string; arguments?: Record<string, any> };

export type MCPCallResult = {
  content?: Array<unknown>;
  isError?: boolean;
};

export class CoreMCPClient {
  private client: Client | null = null;
  private transport: Transport | null = null;
  private connected = false;
  private tools: MCPToolSchema[] = [];

  constructor(private opts: MCPOptions, private timeoutMs = 30000) {}

  async connect(): Promise<void> {
    if (this.connected) return;
    if (this.client || this.transport) throw new Error('MCP already initialized');

    // Build transport
    if (this.opts.type === 'http') {
      const url = new URL(this.opts.url);
      this.transport = new StreamableHTTPClientTransport(url, {
        requestInit: { headers: this.opts.headers ?? {} },
      });
    } else {
      // Check if stderr is a custom stream
      const isCustomStream = this.opts.stderr &&
        typeof this.opts.stderr === 'object' &&
        typeof this.opts.stderr.pipe === 'function';

      // Use 'pipe' if custom stream is provided, otherwise use the original value
      const stderrOption = isCustomStream ? 'pipe' : (this.opts.stderr ?? 'inherit');

      this.transport = new StdioClientTransport({
        command: this.opts.command,
        args: this.opts.args ?? [],
        env: this.opts.env ?? {},
        stderr: stderrOption,
        cwd: this.opts.cwd,
      });

      // If custom stream was provided, pipe the transport's stderr to it
      if (isCustomStream) {
        // Access the transport's stderr stream after creation
        const transportStderr = (this.transport as StdioClientTransport).stderr;
        if (transportStderr && this.opts.stderr) {
          transportStderr.pipe(this.opts.stderr as unknown as NodeJS.WritableStream);
        }
      }
    }

    // Create SDK client and connect
    this.client = new Client(
      { name: 'nuvin-core-cli', version: '1.0.0' },
      { capabilities: { tools: {}, resources: { subscribe: true }, prompts: {}, logging: {} } },
    );
    await this.client.connect(this.transport);
    this.connected = true;

    await this.refreshTools();
  }

  isConnected(): boolean {
    return this.connected && this.client !== null;
  }

  async disconnect(): Promise<void> {
    try {
      // Use timeout for disconnect operations to prevent hanging
      const disconnectPromise = Promise.all([
        this.client?.close(),
        this.transport?.close?.()
      ]);

      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error('MCP disconnect timed out after 5000ms')), 5000);
      });

      await Promise.race([disconnectPromise, timeoutPromise]);
    } catch (err) {
      // Log but don't throw - we still want to clean up state
      console.warn('MCP disconnect error:', err);
    } finally {
      this.connected = false;
      this.client = null;
      this.transport = null;
      this.tools = [];
    }
  }

  async refreshTools(): Promise<MCPToolSchema[]> {
    if (!this.client) throw new Error('MCP client not connected');
    const req: ListToolsRequest = { method: 'tools/list', params: {} };

    // Use configured timeout with Promise.race
    const requestPromise = this.client.request(req, ListToolsResultSchema);
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error(`MCP tools list request timed out after ${this.timeoutMs}ms`)), this.timeoutMs);
    });

    const res = await Promise.race([requestPromise, timeoutPromise]);
    const tools = (res.tools ?? []).map((t: { name: string; description?: string; inputSchema?: Record<string, unknown> }) => ({
      name: String(t.name),
      description: t.description,
      inputSchema: t.inputSchema ?? { type: 'object', properties: {}, required: [] },
    }));
    this.tools = tools;
    return tools;
  }

  getTools(): MCPToolSchema[] {
    return this.tools.slice();
  }

  async callTool(call: MCPToolCall): Promise<MCPCallResult> {
    if (!this.client) throw new Error('MCP client not connected');
    const req: CallToolRequest = {
      method: 'tools/call',
      params: { name: call.name, arguments: call.arguments ?? {} },
    };

    // Use configured timeout with Promise.race
    const requestPromise = this.client.request(req, CallToolResultSchema);
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error(`MCP tool call timed out after ${this.timeoutMs}ms`)), this.timeoutMs);
    });

    const result = await Promise.race([requestPromise, timeoutPromise]);
    
    // Show tool result if it exists and has content
    if (result.content && Array.isArray(result.content) && result.content.length > 0) {
      console.log(`[MCP Tool Result] ${call.name}:`);
      result.content.forEach((item, index) => {
        if (typeof item === 'object' && item !== null) {
          if ('text' in item) {
            console.log(`  ${index + 1}. ${item.text}`);
          } else {
            console.log(`  ${index + 1}. ${JSON.stringify(item, null, 2)}`);
          }
        } else {
          console.log(`  ${index + 1}. ${String(item)}`);
        }
      });
    }

    return result;
  }
}

