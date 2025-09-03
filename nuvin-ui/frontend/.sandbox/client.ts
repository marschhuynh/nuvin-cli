// src/client.ts

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import {
  StreamableHTTPClientTransport,
  StreamableHTTPClientTransportOptions,
} from '@modelcontextprotocol/sdk/client/streamableHttp.d.ts';
import { SSEClientTransport, SSEClientTransportOptions } from '@modelcontextprotocol/sdk/client/sse.d.ts';
import { StdioClientTransport, StdioServerParameters } from '@modelcontextprotocol/sdk/client/stdio.d.ts';

type WithUrl<T> = T & { url: URL };

type TransportOptions = {
  http: WithUrl<StreamableHTTPClientTransportOptions>;
  sse: WithUrl<SSEClientTransportOptions>;
  stdio: StdioServerParameters;
};

class MCPCLient {
  transport: StreamableHTTPClientTransport | SSEClientTransport | StdioClientTransport;

  constructor(option: TransportOptions) {
    // Initialize the client with the provided options
    if (option.http) {
      this.transport = new StreamableHTTPClientTransport(new URL(option.http.url));
    } else if (option.sse) {
      this.transport = new SSEClientTransport(new URL(option.sse.url));
    } else if (option.stdio) {
      this.transport = new StdioClientTransport(option.stdio);
    }
  }

  // Other methods for interacting with the client
}

async function runClient() {
  // 1. Instantiate client
  const client = new Client({
    name: 'example-client',
    version: '0.1.0',
  });

  // 2. Choose transport (HTTP). Replace with your actual server URL.
  const transport = new StreamableHTTPClientTransport(new URL('http://127.0.0.1:12306/mcp'));

  // 3. Connect to server
  await client.connect(transport);

  console.log('transport', transport.sessionId);

  // 4. List available tools
  const list = await client.listTools();
  console.log(
    'Tools available:',
    list.tools?.map((t) => t.name),
  );
}

runClient();
