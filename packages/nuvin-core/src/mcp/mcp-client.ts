import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { StdioClientTransport, type StdioServerParameters } from '@modelcontextprotocol/sdk/client/stdio.js';
import type { Transport } from '@modelcontextprotocol/sdk/shared/transport.js';
import type { ListToolsRequest, CallToolRequest } from '@modelcontextprotocol/sdk/types.js';
import { ListToolsResultSchema, CallToolResultSchema } from '@modelcontextprotocol/sdk/types.js';

export interface MCPAuthOptions {
  type: 'none' | 'bearer' | 'oauth';
  token?: string;
  getToken?: () => Promise<string | null>;
  onAuthRequired?: () => Promise<string | null>;
  onInsufficientScope?: (requiredScopes: string[]) => Promise<string | null>;
}

export type MCPHttpOptions = {
  type: 'http';
  url: string;
  headers?: Record<string, string>;
  auth?: MCPAuthOptions;
};
export type MCPStdioOptions = {
  type: 'stdio';
  command: string;
  args?: string[];
  env?: Record<string, string>;
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
  private currentToken: string | null = null;

  constructor(
    private opts: MCPOptions,
    private timeoutMs = 30000,
  ) {}

  private async getAuthHeaders(): Promise<Record<string, string>> {
    if (this.opts.type !== 'http') return {};

    const auth = this.opts.auth;
    if (!auth || auth.type === 'none') return {};

    if (auth.type === 'bearer' && auth.token) {
      return { Authorization: `Bearer ${auth.token}` };
    }

    if (auth.type === 'oauth' && auth.getToken) {
      const token = await auth.getToken();
      if (token) {
        this.currentToken = token;
        return { Authorization: `Bearer ${token}` };
      }

      if (auth.onAuthRequired) {
        const newToken = await auth.onAuthRequired();
        if (newToken) {
          this.currentToken = newToken;
          return { Authorization: `Bearer ${newToken}` };
        }
      }
    }

    return {};
  }

  async connect(): Promise<void> {
    if (this.connected) return;
    if (this.client || this.transport) throw new Error('MCP already initialized');

    if (this.opts.type === 'http') {
      const url = new URL(this.opts.url);
      const authHeaders = await this.getAuthHeaders();
      const headers = { ...this.opts.headers, ...authHeaders };

      this.transport = new StreamableHTTPClientTransport(url, {
        requestInit: { headers },
      });
    } else {
      const isCustomStream =
        this.opts.stderr && typeof this.opts.stderr === 'object' && typeof this.opts.stderr.pipe === 'function';

      const stderrOption = isCustomStream ? 'pipe' : (this.opts.stderr ?? 'inherit');

      this.transport = new StdioClientTransport({
        command: this.opts.command,
        args: this.opts.args ?? [],
        env: this.opts.env ?? {},
        stderr: stderrOption,
        cwd: this.opts.cwd,
      });

      if (isCustomStream && this.transport instanceof StdioClientTransport) {
        const transportStderr = this.transport.stderr;
        const targetStderr = this.opts.stderr;
        if (transportStderr && targetStderr && typeof transportStderr.pipe === 'function') {
          transportStderr.pipe(targetStderr as any);
        }
      }
    }

    this.client = new Client(
      { name: 'nuvin-core-cli', version: '1.0.0' },
      { capabilities: { roots: { listChanged: true } } },
    );
    await this.client.connect(this.transport);
    this.connected = true;

    await this.refreshTools();
  }

  async reconnectWithNewToken(): Promise<void> {
    if (this.opts.type !== 'http') return;

    await this.disconnect();
    await this.connect();
  }

  isConnected(): boolean {
    return this.connected && this.client !== null;
  }

  getCurrentToken(): string | null {
    return this.currentToken;
  }

  async disconnect(): Promise<void> {
    try {
      const disconnectPromise = Promise.all([this.client?.close(), this.transport?.close?.()]);

      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error('MCP disconnect timed out after 5000ms')), 5000);
      });

      await Promise.race([disconnectPromise, timeoutPromise]);
    } catch (err) {
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

    const requestPromise = this.client.request(req, ListToolsResultSchema);
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error(`MCP tools list request timed out after ${this.timeoutMs}ms`)), this.timeoutMs);
    });

    const res = await Promise.race([requestPromise, timeoutPromise]);
    const tools = (res.tools ?? []).map(
      (t: { name: string; description?: string; inputSchema?: Record<string, unknown> }) => ({
        name: String(t.name),
        description: t.description,
        inputSchema: t.inputSchema ?? { type: 'object', properties: {}, required: [] },
      }),
    );
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

    const requestPromise = this.client.request(req, CallToolResultSchema);
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error(`MCP tool call timed out after ${this.timeoutMs}ms`)), this.timeoutMs);
    });

    return await Promise.race([requestPromise, timeoutPromise]);
  }
}
