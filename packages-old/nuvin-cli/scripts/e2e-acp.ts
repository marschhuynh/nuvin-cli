#!/usr/bin/env node
import { existsSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

type JsonRpcRequest = {
  jsonrpc: '2.0';
  id: number;
  method: string;
  params?: unknown;
};

type JsonRpcSuccess = {
  jsonrpc: '2.0';
  id: number;
  result: unknown;
};

type JsonRpcError = {
  jsonrpc: '2.0';
  id: number;
  error: { code: number; message: string; data?: unknown };
};

type JsonRpcNotification = {
  jsonrpc: '2.0';
  method: string;
  params?: unknown;
};

type JsonRpcMessage = JsonRpcSuccess | JsonRpcError | JsonRpcNotification;

type PendingRequest = {
  resolve: (result: unknown) => void;
  reject: (error: Error) => void;
  timer: NodeJS.Timeout;
};

type ParsedArgs = {
  prompt: string;
  timeoutMs: number;
  cwd: string;
  cliArgs: string[];
};

const DEFAULT_PROMPT = 'Reply with a short acknowledgement for ACP e2e validation.';
const DEFAULT_TIMEOUT_MS = 45_000;

function parseArgs(argv: string[]): ParsedArgs {
  let prompt = DEFAULT_PROMPT;
  let timeoutMs = DEFAULT_TIMEOUT_MS;
  let cwd = process.cwd();

  const separatorIndex = argv.indexOf('--');
  const ownArgs = separatorIndex === -1 ? argv : argv.slice(0, separatorIndex);
  const cliArgs = separatorIndex === -1 ? [] : argv.slice(separatorIndex + 1);

  for (let i = 0; i < ownArgs.length; i++) {
    const arg = ownArgs[i];
    if (arg === '--prompt') {
      prompt = ownArgs[i + 1] ?? DEFAULT_PROMPT;
      i++;
      continue;
    }
    if (arg === '--timeout-ms') {
      const value = Number(ownArgs[i + 1] ?? String(DEFAULT_TIMEOUT_MS));
      if (!Number.isFinite(value) || value <= 0) {
        throw new Error(`Invalid --timeout-ms value: ${ownArgs[i + 1]}`);
      }
      timeoutMs = Math.floor(value);
      i++;
      continue;
    }
    if (arg === '--cwd') {
      cwd = path.resolve(ownArgs[i + 1] ?? process.cwd());
      i++;
      continue;
    }
    throw new Error(`Unknown argument: ${arg}`);
  }

  return { prompt, timeoutMs, cwd, cliArgs };
}

class AcpJsonRpcClient {
  private nextId = 1;
  private buffer = '';
  private pending = new Map<number, PendingRequest>();
  readonly notifications: JsonRpcNotification[] = [];

  constructor(
    private readonly child: ReturnType<typeof spawn>,
    private readonly timeoutMs: number,
  ) {
    child.stdout.setEncoding('utf8');
    child.stdout.on('data', (chunk: string) => this.onStdout(chunk));
    child.on('exit', (code, signal) => {
      const reason = `ACP process exited (code=${code ?? 'null'}, signal=${signal ?? 'null'})`;
      for (const [id, pending] of this.pending) {
        clearTimeout(pending.timer);
        pending.reject(new Error(`${reason}. Pending request id=${id}`));
      }
      this.pending.clear();
    });
  }

  request(method: string, params?: unknown): Promise<unknown> {
    const id = this.nextId++;
    const payload: JsonRpcRequest = { jsonrpc: '2.0', id, method, params };

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`Timed out waiting for response to ${method} (id=${id})`));
      }, this.timeoutMs);

      this.pending.set(id, { resolve, reject, timer });
      this.child.stdin.write(`${JSON.stringify(payload)}\n`);
    });
  }

  private onStdout(chunk: string) {
    this.buffer += chunk;
    const lines = this.buffer.split('\n');
    this.buffer = lines.pop() ?? '';

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;

      let message: JsonRpcMessage;
      try {
        message = JSON.parse(trimmed) as JsonRpcMessage;
      } catch {
        continue;
      }

      if ('id' in message && typeof message.id === 'number') {
        const pending = this.pending.get(message.id);
        if (!pending) continue;

        clearTimeout(pending.timer);
        this.pending.delete(message.id);

        if ('error' in message) {
          pending.reject(new Error(`JSON-RPC ${message.error.code}: ${message.error.message}`));
        } else {
          pending.resolve(message.result);
        }
        continue;
      }

      if ('method' in message) {
        const notification = message as JsonRpcNotification;
        this.notifications.push(notification);

        // Auto-approve permission requests so the E2E flow doesn't hang.
        if (
          notification.method === 'session/request_permission' &&
          'id' in message &&
          typeof (message as { id?: unknown }).id === 'number'
        ) {
          const permId = (message as { id: number }).id;
          this.child.stdin.write(
            `${JSON.stringify({
              jsonrpc: '2.0',
              id: permId,
              result: { outcome: { outcome: 'selected', optionId: 'allow_once' } },
            })}\n`,
          );
        }
      }
    }
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  const cliPath = path.resolve(__dirname, '../dist/cli.js');

  if (!existsSync(cliPath)) {
    throw new Error(`Build output not found at ${cliPath}. Run: pnpm --filter @nuvin/nuvin-cli build`);
  }

  const child = spawn('node', [cliPath, '--acp', ...args.cliArgs], {
    cwd: args.cwd,
    env: process.env,
    stdio: ['pipe', 'pipe', 'pipe'],
  });

  child.stderr.setEncoding('utf8');
  child.stderr.on('data', (chunk: string) => process.stderr.write(chunk));

  const client = new AcpJsonRpcClient(child, args.timeoutMs);

  try {
    await client.request('initialize', {
      protocolVersion: 1,
      clientCapabilities: {
        fs: { readTextFile: true, writeTextFile: true },
        terminal: true,
      },
      clientInfo: { name: 'nuvin-e2e', title: 'Nuvin E2E', version: '1.0.0' },
    });

    const sessionNew = (await client.request('session/new', {
      cwd: args.cwd,
      mcpServers: [],
    })) as { sessionId?: string };

    const sessionId = sessionNew.sessionId;
    if (!sessionId) {
      throw new Error('session/new did not return sessionId');
    }

    const promptResult = (await client.request('session/prompt', {
      sessionId,
      prompt: [{ type: 'text', text: args.prompt }],
    })) as { stopReason?: string };

    const updateCount = client.notifications.filter((n) => n.method === 'session/update').length;
    if (!promptResult.stopReason) {
      throw new Error('session/prompt response missing stopReason');
    }
    if (!['end_turn', 'cancelled', 'max_tokens', 'max_turn_requests', 'refusal'].includes(promptResult.stopReason)) {
      throw new Error(`Unexpected stopReason: ${promptResult.stopReason}`);
    }
    if (updateCount === 0) {
      throw new Error('No session/update notifications observed');
    }

    // Validate that all session/update notifications contain the required sessionUpdate field.
    const invalidUpdates = client.notifications.filter(
      (n) =>
        n.method === 'session/update' &&
        (!n.params ||
          typeof n.params !== 'object' ||
          !('update' in (n.params as Record<string, unknown>)) ||
          typeof ((n.params as Record<string, unknown>).update as Record<string, unknown>)?.sessionUpdate !== 'string'),
    );
    if (invalidUpdates.length > 0) {
      throw new Error(
        `${invalidUpdates.length} session/update notification(s) missing a valid sessionUpdate field`,
      );
    }

    process.stdout.write(
      `ACP e2e passed\nsessionId: ${sessionId}\nstopReason: ${promptResult.stopReason}\nupdates: ${updateCount}\n`,
    );
  } finally {
    child.kill();
  }
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`ACP e2e failed: ${message}\n`);
  process.exit(1);
});
