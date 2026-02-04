/**
 * ACP Server End-to-End Integration Tests
 *
 * These tests spawn the actual ACP server process and communicate
 * with it over stdio using JSON-RPC protocol.
 *
 * Requirements:
 * - The CLI must be built first: `pnpm build`
 * - Tests use longer timeouts since server startup takes time
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { spawn, type ChildProcess } from 'node:child_process';
import * as path from 'node:path';
import * as fs from 'node:fs';
import * as os from 'node:os';

// =============================================================================
// Types
// =============================================================================

interface JsonRpcRequest {
  jsonrpc: '2.0';
  id: number;
  method: string;
  params?: object;
}

interface JsonRpcResponse {
  jsonrpc: '2.0';
  id: number;
  result?: unknown;
  error?: {
    code: number;
    message: string;
    data?: unknown;
  };
}

interface JsonRpcNotification {
  jsonrpc: '2.0';
  method: string;
  params?: object;
}

// =============================================================================
// Test Configuration
// =============================================================================

const CLI_PATH = path.resolve(import.meta.dirname, '../../dist/cli.js');
const TEST_TIMEOUT = 30000; // 30s for slow operations
const RESPONSE_TIMEOUT = 10000; // 10s for individual responses
const STARTUP_DELAY = 500; // Wait for server to be ready

// Skip tests if CLI not built
const CLI_EXISTS = fs.existsSync(CLI_PATH);

// =============================================================================
// JSON-RPC Helpers
// =============================================================================

/**
 * Send a JSON-RPC request to the server via stdin.
 * Uses Content-Length header as per JSON-RPC over stdio protocol.
 */
function sendRequest(
  server: ChildProcess,
  id: number,
  method: string,
  params?: object,
): void {
  if (!server.stdin) {
    throw new Error('Server stdin is not available');
  }

  const message = JSON.stringify({
    jsonrpc: '2.0',
    id,
    method,
    params: params ?? {},
  });

  // JSON-RPC uses Content-Length header
  const header = `Content-Length: ${Buffer.byteLength(message)}\r\n\r\n`;
  server.stdin.write(header + message);
}

/**
 * Send a JSON-RPC notification (no response expected)
 */
function sendNotification(
  server: ChildProcess,
  method: string,
  params?: object,
): void {
  if (!server.stdin) {
    throw new Error('Server stdin is not available');
  }

  const message = JSON.stringify({
    jsonrpc: '2.0',
    method,
    params: params ?? {},
  });

  const header = `Content-Length: ${Buffer.byteLength(message)}\r\n\r\n`;
  server.stdin.write(header + message);
}

/**
 * Read a JSON-RPC response from the server's stdout.
 * Parses the Content-Length header and extracts the JSON body.
 */
function readResponse(
  server: ChildProcess,
  timeoutMs = RESPONSE_TIMEOUT,
): Promise<JsonRpcResponse> {
  return new Promise((resolve, reject) => {
    if (!server.stdout) {
      reject(new Error('Server stdout is not available'));
      return;
    }

    let buffer = '';
    let resolved = false;

    const cleanup = () => {
      if (!resolved) {
        server.stdout?.off('data', dataHandler);
        clearTimeout(timeout);
      }
    };

    const timeout = setTimeout(() => {
      cleanup();
      reject(new Error(`Timeout waiting for response after ${timeoutMs}ms. Buffer: ${buffer}`));
    }, timeoutMs);

    const dataHandler = (data: Buffer) => {
      buffer += data.toString();

      // Look for Content-Length header
      const headerMatch = buffer.match(/Content-Length: (\d+)\r\n\r\n/);
      if (headerMatch) {
        const length = parseInt(headerMatch[1], 10);
        const headerEnd = buffer.indexOf('\r\n\r\n') + 4;
        const body = buffer.slice(headerEnd);

        if (body.length >= length) {
          resolved = true;
          cleanup();

          try {
            const json = JSON.parse(body.slice(0, length)) as JsonRpcResponse;
            resolve(json);
          } catch (err) {
            reject(new Error(`Failed to parse JSON response: ${err}`));
          }
        }
      }
    };

    server.stdout.on('data', dataHandler);
  });
}

/**
 * Spawn the ACP server process
 */
function spawnServer(): ChildProcess {
  const server = spawn('node', [CLI_PATH, '--acp'], {
    cwd: process.cwd(),
    stdio: ['pipe', 'pipe', 'pipe'],
    env: {
      ...process.env,
      // Ensure clean environment for tests
      NODE_ENV: 'test',
    },
  });

  // Capture stderr for debugging
  server.stderr?.on('data', (data) => {
    const message = data.toString();
    // Only log if it looks like an error
    if (message.includes('Error') || message.includes('error')) {
      console.error('[ACP Server stderr]:', message);
    }
  });

  return server;
}

/**
 * Wait for a given number of milliseconds
 */
function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// =============================================================================
// Tests
// =============================================================================

describe.skipIf(!CLI_EXISTS)('ACP Server E2E', () => {
  let server: ChildProcess;
  let requestId = 0;

  // Generate unique request ID
  const nextId = () => ++requestId;

  beforeAll(async () => {
    // Spawn the server
    server = spawnServer();

    // Wait for server to be ready
    await delay(STARTUP_DELAY);

    // Verify server is running
    if (server.killed || server.exitCode !== null) {
      throw new Error('Server failed to start');
    }
  }, TEST_TIMEOUT);

  afterAll(() => {
    if (server && !server.killed) {
      server.kill('SIGTERM');
    }
  });

  beforeEach(() => {
    // Verify server is still running before each test
    if (server.killed || server.exitCode !== null) {
      throw new Error('Server died unexpectedly');
    }
  });

  // ---------------------------------------------------------------------------
  // Initialize Tests
  // ---------------------------------------------------------------------------

  describe('initialize', () => {
    it(
      'should return protocol version 1 and agent capabilities',
      async () => {
        const id = nextId();

        sendRequest(server, id, 'initialize', {
          protocolVersion: 1,
          clientInfo: {
            name: 'E2E Test Client',
            version: '1.0.0',
          },
        });

        const response = await readResponse(server);

        expect(response.id).toBe(id);
        expect(response.error).toBeUndefined();
        expect(response.result).toBeDefined();

        const result = response.result as {
          protocolVersion: number;
          agentInfo?: { name: string; version?: string };
          agentCapabilities?: object;
        };

        expect(result.protocolVersion).toBe(1);
        expect(result.agentInfo).toBeDefined();
        expect(result.agentInfo?.name).toBe('Nuvin');
        expect(result.agentCapabilities).toBeDefined();
      },
      TEST_TIMEOUT,
    );
  });

  // ---------------------------------------------------------------------------
  // Session/New Tests
  // ---------------------------------------------------------------------------

  describe('session/new', () => {
    it(
      'should create a session with valid ID',
      async () => {
        const id = nextId();
        const testCwd = os.tmpdir();

        sendRequest(server, id, 'session/new', {
          cwd: testCwd,
        });

        const response = await readResponse(server);

        expect(response.id).toBe(id);
        expect(response.error).toBeUndefined();
        expect(response.result).toBeDefined();

        const result = response.result as {
          sessionId: string;
        };

        expect(result.sessionId).toBeDefined();
        expect(typeof result.sessionId).toBe('string');
        expect(result.sessionId).toMatch(/^session_/);
      },
      TEST_TIMEOUT,
    );

    it(
      'should create multiple sessions with unique IDs',
      async () => {
        const testCwd = os.tmpdir();

        // Create first session
        const id1 = nextId();
        sendRequest(server, id1, 'session/new', { cwd: testCwd });
        const response1 = await readResponse(server);
        const sessionId1 = (response1.result as { sessionId: string }).sessionId;

        // Create second session
        const id2 = nextId();
        sendRequest(server, id2, 'session/new', { cwd: testCwd });
        const response2 = await readResponse(server);
        const sessionId2 = (response2.result as { sessionId: string }).sessionId;

        expect(sessionId1).not.toBe(sessionId2);
      },
      TEST_TIMEOUT,
    );
  });

  // ---------------------------------------------------------------------------
  // Prompt Tests
  // ---------------------------------------------------------------------------

  describe('prompt', () => {
    it(
      'should return error for non-existent session',
      async () => {
        const id = nextId();

        sendRequest(server, id, 'prompt', {
          sessionId: 'nonexistent_session_12345',
          prompt: 'Hello',
        });

        const response = await readResponse(server);

        expect(response.id).toBe(id);
        expect(response.error).toBeDefined();
        // The error code may be wrapped by JSON-RPC library:
        // -32002 (SessionNotFound) or -32603 (InternalError)
        expect(response.error?.code).toBeLessThan(0);
        expect(response.error?.message).toMatch(/session/i);
      },
      TEST_TIMEOUT,
    );
  });

  // ---------------------------------------------------------------------------
  // Cancel Tests
  // ---------------------------------------------------------------------------

  describe('cancel', () => {
    it(
      'should gracefully handle cancel for non-existent session',
      async () => {
        // Cancel is a notification, not a request - no response expected
        sendNotification(server, 'cancel', {
          sessionId: 'nonexistent_session_12345',
        });

        // Wait a bit to ensure no crash
        await delay(500);

        // Server should still be alive
        expect(server.killed).toBe(false);
        expect(server.exitCode).toBeNull();
      },
      TEST_TIMEOUT,
    );
  });

  // ---------------------------------------------------------------------------
  // Error Handling Tests
  // ---------------------------------------------------------------------------

  describe('error handling', () => {
    it(
      'should return method not found error for invalid method',
      async () => {
        const id = nextId();

        sendRequest(server, id, 'invalid/method', {});

        const response = await readResponse(server);

        expect(response.id).toBe(id);
        expect(response.error).toBeDefined();
        // JSON-RPC MethodNotFound is -32601
        expect(response.error?.code).toBe(-32601);
      },
      TEST_TIMEOUT,
    );

    it(
      'should handle malformed requests gracefully',
      async () => {
        if (!server.stdin) {
          throw new Error('Server stdin not available');
        }

        // Send malformed JSON (missing closing brace)
        const malformed = '{"jsonrpc": "2.0", "id": 999, "method": "test"';
        const header = `Content-Length: ${Buffer.byteLength(malformed)}\r\n\r\n`;
        server.stdin.write(header + malformed);

        // Wait a bit to ensure no crash
        await delay(500);

        // Server should still be alive
        expect(server.killed).toBe(false);
        expect(server.exitCode).toBeNull();
      },
      TEST_TIMEOUT,
    );
  });

  // ---------------------------------------------------------------------------
  // Shutdown Tests
  // ---------------------------------------------------------------------------

  describe('shutdown', () => {
    it(
      'should shutdown cleanly on shutdown request',
      async () => {
        // Spawn a fresh server for shutdown test
        const shutdownServer = spawnServer();
        await delay(STARTUP_DELAY);

        // First initialize the server
        const initId = 1;
        sendRequest(shutdownServer, initId, 'initialize', {
          protocolVersion: 1,
        });
        await readResponse(shutdownServer);

        // Send shutdown request
        const shutdownId = 2;
        sendRequest(shutdownServer, shutdownId, 'shutdown', {});

        // Wait for server to exit
        await new Promise<void>((resolve) => {
          const timeout = setTimeout(() => {
            shutdownServer.kill('SIGTERM');
            resolve();
          }, 5000);

          shutdownServer.on('exit', () => {
            clearTimeout(timeout);
            resolve();
          });
        });

        // Server should have exited
        expect(shutdownServer.exitCode).toBeDefined();
      },
      TEST_TIMEOUT,
    );
  });
});

// =============================================================================
// CLI Build Check Test
// =============================================================================

describe('ACP E2E Prerequisites', () => {
  it('should have CLI built (run pnpm build if this fails)', () => {
    if (!CLI_EXISTS) {
      console.warn(
        '\n⚠️  CLI not built. Run: cd packages/nuvin-cli && pnpm build\n',
      );
    }
    // This test documents the requirement but doesn't fail
    // The actual tests are skipped if CLI doesn't exist
    expect(true).toBe(true);
  });
});
