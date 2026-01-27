// packages/nuvin-acp/source/jsonrpc/handler.ts
import type {
  JsonRpcRequest,
  JsonRpcResponse,
  JsonRpcId,
  JsonRpcError,
} from './types.js';
import { ErrorCodes } from './types.js';

export type MethodHandler<P = unknown, R = unknown> = (params: P) => Promise<R>;

export class RequestHandler {
  private methods = new Map<string, MethodHandler>();
  private notificationHandlers = new Map<string, MethodHandler>();

  register<P, R>(method: string, handler: MethodHandler<P, R>): void {
    this.methods.set(method, handler as MethodHandler);
  }

  registerNotification<P>(method: string, handler: MethodHandler<P, void>): void {
    this.notificationHandlers.set(method, handler as MethodHandler);
  }

  async handle(request: JsonRpcRequest): Promise<JsonRpcResponse | null> {
    const isNotification = request.id === undefined;

    if (isNotification) {
      const handler = this.notificationHandlers.get(request.method);
      if (handler) {
        try {
          await handler(request.params);
        } catch (error) {
          // Notifications don't send responses
        }
      }
      return null;
    }

    const handler = this.methods.get(request.method);

    if (!handler) {
      return this.errorResponse(request.id, {
        code: ErrorCodes.MethodNotFound,
        message: `Method not found: ${request.method}`,
      });
    }

    try {
      const result = await handler(request.params);
      return {
        jsonrpc: '2.0',
        id: request.id,
        result,
      };
    } catch (error) {
      return this.errorResponse(request.id, {
        code: ErrorCodes.InternalError,
        message: error instanceof Error ? error.message : 'Internal error',
      });
    }
  }

  private errorResponse(id: JsonRpcId, error: JsonRpcError): JsonRpcResponse {
    return {
      jsonrpc: '2.0',
      id,
      error,
    };
  }
}
