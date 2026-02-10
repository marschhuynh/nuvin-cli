export type JsonRpcRequest = {
  jsonrpc: '2.0';
  id?: number | string;
  method: string;
  params?: unknown;
};

export type JsonRpcResponse = {
  jsonrpc: '2.0';
  id?: number | string;
  result?: unknown;
  error?: { code: number; message: string; data?: unknown };
};

export async function routeAcpRequest(server: any, message: JsonRpcRequest): Promise<JsonRpcResponse | null> {
  try {
    switch (message.method) {
      case 'initialize': {
        const result = await server.handleInitialize(message.params ?? {});
        return { jsonrpc: '2.0', id: message.id, result };
      }
      case 'session/new': {
        const result = await server.handleSessionNew(message.params ?? {});
        return { jsonrpc: '2.0', id: message.id, result };
      }
      case 'session/load': {
        const result = await server.handleSessionLoad(message.params ?? {});
        return { jsonrpc: '2.0', id: message.id, result };
      }
      case 'session/prompt': {
        const result = await server.handleSessionPrompt(message.params ?? {});
        return { jsonrpc: '2.0', id: message.id, result };
      }
      case 'session/cancel': {
        const result = await server.handleSessionCancel(message.params ?? {});
        return { jsonrpc: '2.0', id: message.id, result };
      }
      case 'session/set_config_option': {
        const result = await server.handleSessionSetConfigOption(message.params ?? {});
        return { jsonrpc: '2.0', id: message.id, result };
      }
      case 'session/response_permission': {
        const result = await server.handleSessionResponsePermission(message.params ?? {});
        return { jsonrpc: '2.0', id: message.id, result };
      }
      default: {
        return {
          jsonrpc: '2.0',
          id: message.id,
          error: { code: -32601, message: 'Method not found' },
        };
      }
    }
  } catch (error) {
    return {
      jsonrpc: '2.0',
      id: message.id,
      error: {
        code: -32000,
        message: error instanceof Error ? error.message : String(error),
      },
    };
  }
}
