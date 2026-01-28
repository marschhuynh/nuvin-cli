// packages/nuvin-acp/tests/transport.test.ts
import { describe, it, expect, vi } from 'vitest';
import { Readable, Writable } from 'node:stream';
import { StdioTransport } from '../source/transport/stdio.js';

describe('StdioTransport', () => {
  it('should parse incoming JSON-RPC messages', async () => {
    const input = new Readable({ read() {} });
    const output = new Writable({ write(chunk, enc, cb) { cb(); } });

    const transport = new StdioTransport(input, output);
    const messages: unknown[] = [];

    transport.onMessage((msg) => messages.push(msg));
    transport.start();

    input.push('{"jsonrpc":"2.0","id":1,"method":"test"}\n');

    await new Promise(r => setTimeout(r, 10));

    expect(messages).toHaveLength(1);
    expect(messages[0]).toEqual({ jsonrpc: '2.0', id: 1, method: 'test' });
  });

  it('should send JSON-RPC messages', async () => {
    const input = new Readable({ read() {} });
    const chunks: string[] = [];
    const output = new Writable({
      write(chunk, enc, cb) {
        chunks.push(chunk.toString());
        cb();
      }
    });

    const transport = new StdioTransport(input, output);

    await transport.send({ jsonrpc: '2.0', id: 1, result: 'ok' });

    expect(chunks).toHaveLength(1);
    expect(JSON.parse(chunks[0].trim())).toEqual({ jsonrpc: '2.0', id: 1, result: 'ok' });
  });
});
