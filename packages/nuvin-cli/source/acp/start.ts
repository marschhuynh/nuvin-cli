import { AcpServer } from './server.js';
import { decodeJsonRpcLines, encodeJsonRpcMessage, type JsonRpcMessage } from './jsonrpc.js';
import { routeAcpRequest, type JsonRpcRequest } from './router.js';
import { OrchestratorManager } from '../services/OrchestratorManager.js';

const isJsonRpcRequest = (message: JsonRpcMessage): message is JsonRpcRequest => {
  return typeof message.method === 'string';
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

  const orchestratorManager = new OrchestratorManager();
  const server = new AcpServer({ transport, orchestratorManager });

  stderr.write('ACP server starting\n');

  let buffer = '';
  stdin.on('data', async (chunk) => {
    buffer += chunk.toString();

    let parsed;
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
        continue;
      }
      const response = await routeAcpRequest(server, message);
      if (response) {
        transport.send(response);
      }
    }
  });
}
