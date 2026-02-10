export type JsonRpcMessage = {
  jsonrpc: '2.0';
  id?: number | string;
  method?: string;
  params?: unknown;
  result?: unknown;
  error?: unknown;
};

export function decodeJsonRpcLines(input: string): { messages: JsonRpcMessage[]; remainder: string } {
  const lines = input.split('\n');
  const remainder = lines.pop() ?? '';
  const messages = lines
    .filter((line) => line.trim().length > 0)
    .map((line) => JSON.parse(line) as JsonRpcMessage);
  return { messages, remainder };
}

export function encodeJsonRpcMessage(message: JsonRpcMessage): string {
  return `${JSON.stringify(message)}\n`;
}
