// packages/nuvin-acp/source/transport/stdio.ts
import * as readline from 'node:readline';
import type { Readable, Writable } from 'node:stream';
import type { JsonRpcMessage } from '../jsonrpc/types.js';

export type MessageHandler = (message: JsonRpcMessage) => void;

export class StdioTransport {
  private rl: readline.Interface | null = null;
  private handlers: MessageHandler[] = [];

  constructor(
    private input: Readable = process.stdin,
    private output: Writable = process.stdout,
  ) {}

  onMessage(handler: MessageHandler): void {
    this.handlers.push(handler);
  }

  start(): void {
    this.rl = readline.createInterface({
      input: this.input,
      terminal: false,
    });

    this.rl.on('line', (line) => {
      if (!line.trim()) return;

      try {
        const message = JSON.parse(line) as JsonRpcMessage;
        for (const handler of this.handlers) {
          handler(message);
        }
      } catch (error) {
        // Invalid JSON - log to stderr only
        console.error('[ACP Transport] Failed to parse JSON:', error);
      }
    });

    this.rl.on('close', () => {
      // Cleanup - process will exit naturally when stdin closes
    });

    this.rl.on('error', (error) => {
      console.error('[ACP Transport] Readline error:', error);
    });
  }

  async send(message: JsonRpcMessage): Promise<void> {
    const line = JSON.stringify(message) + '\n';
    return new Promise((resolve, reject) => {
      this.output.write(line, (error) => {
        if (error) {
          reject(error);
        } else {
          resolve();
        }
      });
    });
  }

  close(): void {
    this.rl?.close();
  }
}
