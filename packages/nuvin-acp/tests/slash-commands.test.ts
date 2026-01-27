import { describe, it, expect } from 'vitest';
import { AgentEventTypes } from '@nuvin/nuvin-core';
import { EventAdapter } from '../source/adapters/event-adapter.js';
import { Readable, Writable } from 'node:stream';
import { StdioTransport } from '../source/transport/stdio.js';

describe('Slash Commands', () => {
  it('should convert CommandsAvailable event to available_commands_update', async () => {
    const input = new Readable({ read() {} });
    const chunks: string[] = [];
    const output = new Writable({
      write(chunk, enc, cb) {
        chunks.push(chunk.toString());
        cb();
      }
    });

    const transport = new StdioTransport(input, output);
    const adapter = new EventAdapter(transport, 'sess_test');

    const event = {
      type: AgentEventTypes.CommandsAvailable,
      commands: [
        { id: 'test', description: 'Run tests', requiresInput: false },
        { id: 'plan', description: 'Create a plan', requiresInput: true },
      ],
    };

    await adapter.handleEvent(event);

    // Wait for async processing
    await new Promise(r => setTimeout(r, 10));

    expect(chunks).toHaveLength(1);
    const message = JSON.parse(chunks[0].trim());
    
    expect(message).toEqual({
      jsonrpc: '2.0',
      method: 'session/update',
      params: {
        sessionId: 'sess_test',
        update: {
          sessionUpdate: 'available_commands_update',
          availableCommands: [
            { name: 'test', description: 'Run tests' },
            { name: 'plan', description: 'Create a plan', input: { hint: 'Enter input for this command' } },
          ],
        },
      },
    });
  });
});
