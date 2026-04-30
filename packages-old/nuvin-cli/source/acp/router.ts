export type JsonRpcRequest = {
  jsonrpc: "2.0";
  id?: number | string;
  method: string;
  params?: unknown;
};

export type JsonRpcResponse = {
  jsonrpc: "2.0";
  id?: number | string;
  result?: unknown;
  error?: { code: number; message: string; data?: unknown };
};

export type AcpRequestHandler = {
  handleInitialize(params: Record<string, unknown>): Promise<unknown>;
  handleSessionNew(params: Record<string, unknown>): Promise<unknown>;
  handleSessionList(params: Record<string, unknown>): Promise<unknown>;
  handleSessionLoad(params: Record<string, unknown>): Promise<unknown>;
  handleSessionPrompt(params: Record<string, unknown>): Promise<unknown>;
  handleSessionCancel(params: Record<string, unknown>): Promise<unknown>;
  handleSessionSetConfigOption(
    params: Record<string, unknown>
  ): Promise<unknown>;
  handleSessionSetModel(params: Record<string, unknown>): Promise<unknown>;
  handleSessionSetMode(params: Record<string, unknown>): Promise<unknown>;
  handleSessionResponsePermission(
    params: Record<string, unknown>
  ): Promise<unknown>;
};

export async function routeAcpRequest(
  server: AcpRequestHandler,
  message: JsonRpcRequest
): Promise<JsonRpcResponse | null> {
  const isNotification = message.id === undefined || message.id === null;

  try {
    let result: unknown;

    switch (message.method) {
      case "initialize": {
        result = await server.handleInitialize(
          (message.params ?? {}) as Record<string, unknown>
        );
        break;
      }
      case "session/new": {
        result = await server.handleSessionNew(
          (message.params ?? {}) as Record<string, unknown>
        );
        break;
      }
      case "session/list": {
        result = await server.handleSessionList(
          (message.params ?? {}) as Record<string, unknown>
        );
        break;
      }
      case "session/load": {
        result = await server.handleSessionLoad(
          (message.params ?? {}) as Record<string, unknown>
        );
        break;
      }
      case "session/prompt": {
        result = await server.handleSessionPrompt(
          (message.params ?? {}) as Record<string, unknown>
        );
        break;
      }
      case "session/cancel": {
        result = await server.handleSessionCancel(
          (message.params ?? {}) as Record<string, unknown>
        );
        break;
      }
      case "session/set_config_option": {
        result = await server.handleSessionSetConfigOption(
          (message.params ?? {}) as Record<string, unknown>
        );
        break;
      }
      case "session/set_model": {
        // Compatibility for clients still using pre-config-options model API.
        result = await server.handleSessionSetModel(
          (message.params ?? {}) as Record<string, unknown>
        );
        break;
      }
      case "session/set_mode": {
        // Compatibility and spec support for dedicated mode switching.
        result = await server.handleSessionSetMode(
          (message.params ?? {}) as Record<string, unknown>
        );
        break;
      }
      case "session/response_permission": {
        // Legacy compatibility with earlier internal ACP implementation.
        result = await server.handleSessionResponsePermission(
          (message.params ?? {}) as Record<string, unknown>
        );
        break;
      }
      default: {
        if (isNotification) {
          return null;
        }

        return {
          jsonrpc: "2.0",
          id: message.id,
          error: { code: -32601, message: "Method not found" },
        };
      }
    }

    if (isNotification) {
      return null;
    }

    return {
      jsonrpc: "2.0",
      id: message.id,
      result,
    };
  } catch (error) {
    if (isNotification) {
      return null;
    }

    return {
      jsonrpc: "2.0",
      id: message.id,
      error: {
        code: -32000,
        message: error instanceof Error ? error.message : String(error),
      },
    };
  }
}
