import { AcpServer } from './server.js';
import { decodeJsonRpcLines, encodeJsonRpcMessage, type JsonRpcMessage } from './jsonrpc.js';
import { routeAcpRequest, type JsonRpcRequest } from './router.js';
import { ConfigManager } from '../config/manager.js';
import type { ConfigScope } from '../config/types.js';
import { registerCommands } from '../modules/commands/definitions/index.js';
import { commandRegistry } from '../modules/commands/registry.js';
import { eventBus } from '../services/EventBus.js';
import { OrchestratorManager } from '../services/OrchestratorManager.js';
import { toUserMessagePayload } from './content.js';

const isJsonRpcRequest = (message: JsonRpcMessage): message is JsonRpcRequest => {
  return typeof message.method === 'string';
};

const isJsonRpcResponse = (
  message: JsonRpcMessage,
): message is JsonRpcMessage & {
  id: number | string;
  result?: unknown;
  error?: unknown;
} => {
  return (
    message.id !== undefined &&
    typeof message.method !== 'string' &&
    (Object.prototype.hasOwnProperty.call(message, 'result') || Object.prototype.hasOwnProperty.call(message, 'error'))
  );
};

export async function startAcpServer({
  stdin,
  stdout,
  stderr,
}: {
  stdin: NodeJS.ReadableStream;
  stdout: NodeJS.WritableStream;
  stderr: NodeJS.WritableStream;
}) {
  const transport = {
    send: (msg: unknown) => {
      stdout.write(encodeJsonRpcMessage(msg as never));
    },
  };

  const configManager = ConfigManager.getInstance();
  const orchestratorManager = new OrchestratorManager();
  commandRegistry.setOrchestrator(orchestratorManager);
  commandRegistry.setConfigFunctions({
    get: <T>(key: string, scope?: ConfigScope) => configManager.get(key, scope) as T | undefined,
    set: (key: string, value: unknown, scope?: ConfigScope) => configManager.set(key, value, scope ?? 'auto'),
    delete: (key: string, scope?: ConfigScope) => configManager.delete(key, scope ?? 'global'),
  });
  if (commandRegistry.list({ includeHidden: true }).length === 0) {
    await registerCommands(orchestratorManager);
  }

  // In ACP mode there is no Ink UI listener for custom-command execution.
  // Bridge custom commands to orchestrator sends so commands like /init work.
  eventBus.on('custom-command:execute', async (payload) => {
    try {
      if (payload.renderedPrompt) {
        const userPayload = toUserMessagePayload([{ type: 'text', text: payload.renderedPrompt }]);
        await orchestratorManager.send(userPayload, {
          stream: configManager.getConfig().streamingChunks ?? true,
        });
      }
      payload.onComplete?.();
    } catch (error) {
      payload.onError?.(error instanceof Error ? error : new Error(String(error)));
    }
  });

  const server = new AcpServer({ transport, orchestratorManager });

  stderr.write('ACP server starting\n');

  let buffer = '';
  stdin.on('data', async (chunk) => {
    buffer += chunk.toString();

    let parsed: { messages: JsonRpcMessage[]; remainder: string } | undefined;
    try {
      parsed = decodeJsonRpcLines(buffer);
    } catch (error) {
      stderr.write(`ACP parse error: ${error instanceof Error ? error.message : String(error)}\n`);
      buffer = '';
      return;
    }

    buffer = parsed.remainder;

    for (const message of parsed.messages) {
      if (!isJsonRpcRequest(message)) {
        if (isJsonRpcResponse(message)) {
          server.handleClientResponse(message);
        }
        continue;
      }
      const response = await routeAcpRequest(server, message);
      if (response) {
        transport.send(response);
      }
      server.flushDeferredUpdates();
    }
  });
}
