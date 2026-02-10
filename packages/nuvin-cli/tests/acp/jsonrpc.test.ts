import { describe, it, expect } from 'vitest';
import { decodeJsonRpcLines, encodeJsonRpcMessage } from '../../source/acp/jsonrpc.js';

describe('ACP JSON-RPC newline framing', () => {
  it('decodes newline-delimited JSON-RPC messages with partial chunks', () => {
    const { messages, remainder } = decodeJsonRpcLines(
      '{"jsonrpc":"2.0","id":1,"method":"ping"}\n{"jsonrpc":"2.0",',
    );
    expect(messages).toHaveLength(1);
    expect(messages[0].method).toBe('ping');
    expect(remainder).toBe('{"jsonrpc":"2.0",');
  });

  it('encodes JSON-RPC messages without embedded newlines', () => {
    const msg = encodeJsonRpcMessage({ jsonrpc: '2.0', id: 1, method: 'ping' });
    expect(msg.endsWith('\n')).toBe(true);
    expect(msg.includes('\n\n')).toBe(false);
  });
});
