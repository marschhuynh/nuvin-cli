/**
 * ACP Server Integration Tests
 *
 * Tests for the ACP (Agent Client Protocol) server module.
 * Verifies the core server functionality, handler integration,
 * and event translation.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as os from 'node:os';
import * as path from 'node:path';

// =============================================================================
// Module Imports and Mocks
// =============================================================================

// Mock vscode-jsonrpc before importing server module
vi.mock('vscode-jsonrpc/node.js', () => {
  return {
    createMessageConnection: vi.fn(() => ({
      listen: vi.fn(),
      sendNotification: vi.fn(),
      sendRequest: vi.fn(),
      onRequest: vi.fn(),
      onNotification: vi.fn(),
      onError: vi.fn(),
      onClose: vi.fn(),
      dispose: vi.fn(),
    })),
    StreamMessageReader: vi.fn(),
    StreamMessageWriter: vi.fn(),
  };
});

// Mock OrchestratorManager to avoid full initialization in session tests
vi.mock('../../source/services/OrchestratorManager.js', () => {
  return {
    OrchestratorManager: class MockOrchestratorManager {
      async init() {}
      process() { return { async *[Symbol.asyncIterator]() {} }; }
      cancel() {}
      async cleanup() {}
    },
  };
});

// Get a valid temp directory for tests
const TEST_CWD = os.tmpdir();

// =============================================================================
// Tests
// =============================================================================

describe('ACP Server Module', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ---------------------------------------------------------------------------
  // PROTOCOL_VERSION Tests
  // ---------------------------------------------------------------------------

  describe('PROTOCOL_VERSION', () => {
    it('should export protocol version as 1', async () => {
      const { PROTOCOL_VERSION } = await import('../../source/acp/types.js');

      expect(PROTOCOL_VERSION).toBe(1);
    });

    it('should be a number type', async () => {
      const { PROTOCOL_VERSION } = await import('../../source/acp/types.js');

      expect(typeof PROTOCOL_VERSION).toBe('number');
    });
  });

  // ---------------------------------------------------------------------------
  // createACPServer Factory Tests
  // ---------------------------------------------------------------------------

  describe('createACPServer', () => {
    it('should create a server instance with default config', async () => {
      const { createACPServer } = await import('../../source/acp/server.js');

      const server = createACPServer();

      expect(server).toBeDefined();
      expect(server).toHaveProperty('start');
      expect(server).toHaveProperty('setHandler');
      expect(server).toHaveProperty('sendSessionUpdate');
      expect(server).toHaveProperty('dispose');
    });

    it('should create a server instance with custom config', async () => {
      const { createACPServer } = await import('../../source/acp/server.js');

      const server = createACPServer({
        agentName: 'TestAgent',
        agentVersion: '2.0.0',
      });

      expect(server).toBeDefined();
    });

    it('should return an ACPServer instance', async () => {
      const { createACPServer, ACPServer } = await import('../../source/acp/server.js');

      const server = createACPServer();

      expect(server).toBeInstanceOf(ACPServer);
    });
  });

  // ---------------------------------------------------------------------------
  // ACPServer Class Tests
  // ---------------------------------------------------------------------------

  describe('ACPServer', () => {
    it('should not be initialized before calling initialize', async () => {
      const { createACPServer } = await import('../../source/acp/server.js');

      const server = createACPServer();

      expect(server.isInitialized()).toBe(false);
    });

    it('should not be disposed after creation', async () => {
      const { createACPServer } = await import('../../source/acp/server.js');

      const server = createACPServer();

      expect(server.isDisposed()).toBe(false);
    });

    it('should be disposed after calling dispose', async () => {
      const { createACPServer } = await import('../../source/acp/server.js');

      const server = createACPServer();
      server.dispose();

      expect(server.isDisposed()).toBe(true);
    });

    it('should throw when starting a disposed server', async () => {
      const { createACPServer } = await import('../../source/acp/server.js');

      const server = createACPServer();
      server.dispose();

      expect(() => server.start()).toThrow('Cannot start disposed server');
    });

    it('should set handler and call setServer', async () => {
      const { createACPServer } = await import('../../source/acp/server.js');
      const { NuvinACPHandler } = await import('../../source/acp/handler.js');

      const server = createACPServer();
      const handler = new NuvinACPHandler();
      const setServerSpy = vi.spyOn(handler, 'setServer');

      server.setHandler(handler);

      expect(setServerSpy).toHaveBeenCalledWith(server);
    });

    it('should not send updates when not initialized', async () => {
      const { createACPServer } = await import('../../source/acp/server.js');

      const server = createACPServer();

      // This should not throw, just silently ignore
      expect(() =>
        server.sendSessionUpdate('session_123', {
          type: 'agent_message_chunk',
          chunk: { text: 'test' },
        }),
      ).not.toThrow();
    });

    it('should not send updates when disposed', async () => {
      const { createACPServer } = await import('../../source/acp/server.js');

      const server = createACPServer();
      server.dispose();

      // This should not throw, just silently ignore
      expect(() =>
        server.sendSessionUpdate('session_123', {
          type: 'agent_message_chunk',
          chunk: { text: 'test' },
        }),
      ).not.toThrow();
    });

    it('should throw when requesting permission on disposed server', async () => {
      const { createACPServer } = await import('../../source/acp/server.js');

      const server = createACPServer();
      server.dispose();

      await expect(
        server.requestPermission({
          sessionId: 'session_123',
          toolCallId: 'tc_123',
          title: 'Test Permission',
          options: [],
        }),
      ).rejects.toThrow('Server is disposed');
    });

    it('should be idempotent on dispose', async () => {
      const { createACPServer } = await import('../../source/acp/server.js');

      const server = createACPServer();

      // Calling dispose multiple times should not throw
      server.dispose();
      expect(() => server.dispose()).not.toThrow();
      expect(server.isDisposed()).toBe(true);
    });
  });

  // ---------------------------------------------------------------------------
  // NuvinACPHandler Tests
  // ---------------------------------------------------------------------------

  describe('NuvinACPHandler', () => {
    describe('handleInitialize', () => {
      it('should return protocol version and agent capabilities', async () => {
        const { NuvinACPHandler } = await import('../../source/acp/handler.js');
        const { PROTOCOL_VERSION } = await import('../../source/acp/types.js');

        const handler = new NuvinACPHandler();
        const response = await handler.handleInitialize({
          protocolVersion: PROTOCOL_VERSION,
          clientInfo: { name: 'TestClient', version: '1.0.0' },
        });

        expect(response.protocolVersion).toBe(PROTOCOL_VERSION);
        expect(response.agentInfo).toBeDefined();
        expect(response.agentInfo?.name).toBe('Nuvin');
        expect(response.agentCapabilities).toBeDefined();
      });

      it('should include streaming and cancellation capabilities', async () => {
        const { NuvinACPHandler } = await import('../../source/acp/handler.js');
        const { PROTOCOL_VERSION } = await import('../../source/acp/types.js');

        const handler = new NuvinACPHandler();
        const response = await handler.handleInitialize({
          protocolVersion: PROTOCOL_VERSION,
        });

        expect(response.agentCapabilities?.promptCapabilities?.streaming).toBe(true);
        expect(response.agentCapabilities?.promptCapabilities?.cancellation).toBe(true);
      });

      it('should include MCP capabilities', async () => {
        const { NuvinACPHandler } = await import('../../source/acp/handler.js');
        const { PROTOCOL_VERSION } = await import('../../source/acp/types.js');

        const handler = new NuvinACPHandler();
        const response = await handler.handleInitialize({
          protocolVersion: PROTOCOL_VERSION,
        });

        expect(response.agentCapabilities?.mcpCapabilities?.supported).toBe(true);
      });

      it('should store client capabilities', async () => {
        const { NuvinACPHandler } = await import('../../source/acp/handler.js');
        const { PROTOCOL_VERSION } = await import('../../source/acp/types.js');

        const handler = new NuvinACPHandler();
        const clientCapabilities = {
          fs: { readTextFile: true, writeTextFile: true },
          terminal: { supported: true },
        };

        await handler.handleInitialize({
          protocolVersion: PROTOCOL_VERSION,
          clientCapabilities,
        });

        expect(handler.getClientCapabilities()).toEqual(clientCapabilities);
      });
    });

    describe('handleNewSession', () => {
      it('should create session with unique ID', async () => {
        const { NuvinACPHandler } = await import('../../source/acp/handler.js');
        const { createACPServer } = await import('../../source/acp/server.js');

        const handler = new NuvinACPHandler();
        const server = createACPServer();
        server.setHandler(handler);

        const response = await handler.handleNewSession({
          cwd: TEST_CWD,
        });

        expect(response.sessionId).toBeDefined();
        expect(typeof response.sessionId).toBe('string');
        expect(response.sessionId).toMatch(/^session_/);
      });

      it('should create sessions with different IDs for multiple calls', async () => {
        const { NuvinACPHandler } = await import('../../source/acp/handler.js');
        const { createACPServer } = await import('../../source/acp/server.js');

        const handler = new NuvinACPHandler();
        const server = createACPServer();
        server.setHandler(handler);

        const response1 = await handler.handleNewSession({ cwd: TEST_CWD });
        const response2 = await handler.handleNewSession({ cwd: TEST_CWD });

        expect(response1.sessionId).not.toBe(response2.sessionId);
      });

      it('should store session in handler', async () => {
        const { NuvinACPHandler } = await import('../../source/acp/handler.js');
        const { createACPServer } = await import('../../source/acp/server.js');

        const handler = new NuvinACPHandler();
        const server = createACPServer();
        server.setHandler(handler);

        const response = await handler.handleNewSession({ cwd: TEST_CWD });

        expect(handler.hasSession(response.sessionId)).toBe(true);
        expect(handler.getSession(response.sessionId)).toBeDefined();
      });

      it('should throw when server not set', async () => {
        const { NuvinACPHandler } = await import('../../source/acp/handler.js');

        const handler = new NuvinACPHandler();

        await expect(handler.handleNewSession({ cwd: TEST_CWD })).rejects.toThrow(
          'Server not set',
        );
      });
    });

    describe('handlePrompt', () => {
      it('should throw ACPError for non-existent session', async () => {
        const { NuvinACPHandler, ACPErrorCode, ACPError } = await import(
          '../../source/acp/handler.js'
        );
        const { createACPServer } = await import('../../source/acp/server.js');

        const handler = new NuvinACPHandler();
        const server = createACPServer();
        server.setHandler(handler);

        await expect(
          handler.handlePrompt({
            sessionId: 'nonexistent_session',
            prompt: 'Hello',
          }),
        ).rejects.toMatchObject({
          code: ACPErrorCode.SessionNotFound,
        });
      });
    });

    describe('handleCancel', () => {
      it('should not throw for non-existent session', async () => {
        const { NuvinACPHandler } = await import('../../source/acp/handler.js');

        const handler = new NuvinACPHandler();

        // Should silently ignore
        expect(() =>
          handler.handleCancel({ sessionId: 'nonexistent_session' }),
        ).not.toThrow();
      });
    });

    describe('session management', () => {
      it('should return undefined for non-existent session', async () => {
        const { NuvinACPHandler } = await import('../../source/acp/handler.js');

        const handler = new NuvinACPHandler();

        expect(handler.getSession('nonexistent')).toBeUndefined();
      });

      it('should track multiple sessions', async () => {
        const { NuvinACPHandler } = await import('../../source/acp/handler.js');
        const { createACPServer } = await import('../../source/acp/server.js');

        const handler = new NuvinACPHandler();
        const server = createACPServer();
        server.setHandler(handler);

        await handler.handleNewSession({ cwd: TEST_CWD });
        await handler.handleNewSession({ cwd: TEST_CWD });
        await handler.handleNewSession({ cwd: TEST_CWD });

        const sessionIds = handler.getSessionIds();
        expect(sessionIds).toHaveLength(3);
      });

      it('should close and remove session', async () => {
        const { NuvinACPHandler } = await import('../../source/acp/handler.js');
        const { createACPServer } = await import('../../source/acp/server.js');

        const handler = new NuvinACPHandler();
        const server = createACPServer();
        server.setHandler(handler);

        const { sessionId } = await handler.handleNewSession({ cwd: TEST_CWD });
        expect(handler.hasSession(sessionId)).toBe(true);

        await handler.closeSession(sessionId);
        expect(handler.hasSession(sessionId)).toBe(false);
      });
    });
  });

  // ---------------------------------------------------------------------------
  // ACPError Tests
  // ---------------------------------------------------------------------------

  describe('ACPError', () => {
    it('should create error with code and message', async () => {
      const { ACPError, ACPErrorCode } = await import('../../source/acp/handler.js');

      const error = new ACPError(ACPErrorCode.SessionNotFound, 'Session not found');

      expect(error.code).toBe(ACPErrorCode.SessionNotFound);
      expect(error.message).toBe('Session not found');
      expect(error.name).toBe('ACPError');
    });

    it('should include optional data', async () => {
      const { ACPError, ACPErrorCode } = await import('../../source/acp/handler.js');

      const error = new ACPError(ACPErrorCode.SessionNotFound, 'Session not found', {
        sessionId: 'test_123',
      });

      expect(error.data).toEqual({ sessionId: 'test_123' });
    });
  });

  // ---------------------------------------------------------------------------
  // ACPErrorCode Tests
  // ---------------------------------------------------------------------------

  describe('ACPErrorCode', () => {
    it('should export SessionNotFound code', async () => {
      const { ACPErrorCode } = await import('../../source/acp/handler.js');

      expect(ACPErrorCode.SessionNotFound).toBe(-32002);
    });

    it('should export SessionExists code', async () => {
      const { ACPErrorCode } = await import('../../source/acp/handler.js');

      expect(ACPErrorCode.SessionExists).toBe(-32003);
    });

    it('should export Cancelled code', async () => {
      const { ACPErrorCode } = await import('../../source/acp/handler.js');

      expect(ACPErrorCode.Cancelled).toBe(-32004);
    });
  });
});
