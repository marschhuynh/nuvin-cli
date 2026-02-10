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

export async function routeAcpRequest(server: any, message: JsonRpcRequest): Promise<JsonRpcResponse> {
  if (message.method === 'initialize') {
    const result = await server.handleInitialize(message.params ?? {});
    return { jsonrpc: '2.0', id: message.id, result };
  }

  return {
    jsonrpc: '2.0',
    id: message.id,
    error: { code: -32601, message: 'Method not found' },
  };
}
