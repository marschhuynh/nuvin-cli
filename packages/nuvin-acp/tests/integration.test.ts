import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Readable, Writable } from 'node:stream';
import { ACPServer, type OrchestratorFactory } from '../source/server.js';
import { AgentEventTypes, type AgentEvent } from '@nuvin/nuvin-core';
import type { JsonRpcMessage, JsonRpcRequest, JsonRpcResponse, JsonRpcNotification } from '../source/jsonrpc/types.js';
import type {
  InitializeParams,
  InitializeResult,
  NewSessionParams,
  NewSessionResult,
  PromptParams,
  PromptResult,
  CancelParams,
  SessionUpdateParams,
  RequestPermissionParams,
  RequestPermissionResult,
} from '../source/protocol/types.js';

/**
 * Integration test suite for ACP Server
 * Tests complete JSON-RPC protocol flow over stdio transport
 */

describe('ACP Server Integration Tests', () => {
  let inputStream: Readable;
  let outputStream: Writable;
  let receivedMessages: JsonRpcMessage[];
  let mockOrchestrator: ReturnType<OrchestratorFactory> extends Promise<infer T> ? T : never;
  let mockOrchestratorFactory: OrchestratorFactory;
  let eventHandlers: ((event: AgentEvent) => void)[];
  let approvalHandlers: Map<string, { decision: 'approve' | 'deny'; resolved: boolean }>;

  beforeEach(() => {
    // Create fresh streams for each test
    inputStream = new Readable({ read() {} });
    outputStream = new Writable({
      write(chunk, enc, cb) {
        try {
          const message = JSON.parse(chunk.toString()) as JsonRpcMessage;
          receivedMessages.push(message);
          cb();
        } catch (error) {
          cb(error as Error);
        }
      },
    });

    receivedMessages = [];
    eventHandlers = [];
    approvalHandlers = new Map();

    // Mock orchestrator
    mockOrchestrator = {
      sendMessage: vi.fn(async (text, options) => {
        // Simulate streaming behavior - emit events to registered handlers
        for (const handler of eventHandlers) {
          // Simulate message started
          handler({
            type: AgentEventTypes.MessageStarted,
            conversationId: 'conv_1',
            messageId: 'msg_1',
            userContent: text,
            enhanced: [],
            toolNames: [],
          });

          // Check if cancelled before continuing
          if (options.signal.aborted) {
            return;
          }

          // Simulate assistant chunk
          handler({
            type: AgentEventTypes.AssistantChunk,
            conversationId: 'conv_1',
            messageId: 'msg_1',
            delta: 'Hello',
          });

          // Check if cancelled again
          if (options.signal.aborted) {
            return;
          }

          handler({
            type: AgentEventTypes.AssistantChunk,
            conversationId: 'conv_1',
            messageId: 'msg_1',
            delta: ' World',
          });

          handler({
            type: AgentEventTypes.Done,
            conversationId: 'conv_1',
            messageId: 'msg_1',
            responseTimeMs: 100,
          });
        }
      }),
      onEvent: vi.fn((handler) => {
        eventHandlers.push(handler);
      }),
      handleToolApproval: vi.fn((approvalId, decision) => {
        const entry = approvalHandlers.get(approvalId);
        if (entry) {
          entry.decision = decision;
          entry.resolved = true;
        }
      }),
    };

    mockOrchestratorFactory = vi.fn(async () => mockOrchestrator);
  });

  /**
   * Helper to send JSON-RPC message to server
   */
  function sendMessage(message: JsonRpcMessage): void {
    inputStream.push(JSON.stringify(message) + '\n');
  }

  /**
   * Helper to wait for specific message type
   */
  async function waitForMessage(
    predicate: (msg: JsonRpcMessage) => boolean,
    timeoutMs = 1000,
  ): Promise<JsonRpcMessage> {
    const startTime = Date.now();
    while (Date.now() - startTime < timeoutMs) {
      const found = receivedMessages.find(predicate);
      if (found) return found;
      await new Promise((r) => setTimeout(r, 10));
    }
    throw new Error('Timeout waiting for message');
  }

  /**
   * Helper to wait for multiple messages
   */
  async function waitForMessages(
    predicate: (msg: JsonRpcMessage) => boolean,
    count: number,
    timeoutMs = 1000,
  ): Promise<JsonRpcMessage[]> {
    const startTime = Date.now();
    while (Date.now() - startTime < timeoutMs) {
      const found = receivedMessages.filter(predicate);
      if (found.length >= count) return found.slice(0, count);
      await new Promise((r) => setTimeout(r, 10));
    }
    throw new Error(`Timeout waiting for ${count} messages`);
  }

  /**
   * Helper to get response by request ID
   */
  function getResponse(id: string | number): JsonRpcResponse | undefined {
    return receivedMessages.find(
      (msg): msg is JsonRpcResponse => 'id' in msg && msg.id === id && ('result' in msg || 'error' in msg),
    );
  }

  /**
   * Helper to get notifications by method
   */
  function getNotifications(method: string): JsonRpcNotification[] {
    return receivedMessages.filter(
      (msg): msg is JsonRpcNotification =>
        'method' in msg && msg.method === method && !('id' in msg && msg.id !== undefined),
    );
  }

  describe('Protocol Initialization', () => {
    it('should handle initialize handshake correctly', async () => {
      const server = new ACPServer(mockOrchestratorFactory);

      // Inject custom streams via internal transport
      (server as any).transport.input = inputStream;
      (server as any).transport.output = outputStream;

      await server.start();

      const initRequest: JsonRpcRequest = {
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: {
          protocolVersion: 1,
          clientCapabilities: {
            fs: { readTextFile: true, writeTextFile: true },
            terminal: true,
          },
          clientInfo: {
            name: 'test-client',
            version: '1.0.0',
          },
        } as InitializeParams,
      };

      sendMessage(initRequest);

      const response = await waitForMessage((msg): msg is JsonRpcResponse => 'id' in msg && msg.id === 1);

      expect(response).toMatchObject({
        jsonrpc: '2.0',
        id: 1,
        result: {
          protocolVersion: 1,
          agentCapabilities: {
            loadSession: false,
            promptCapabilities: {
              image: true,
              embeddedContext: true,
            },
            mcpCapabilities: {
              http: false,
              sse: false,
            },
          },
          agentInfo: {
            name: 'nuvin',
            title: 'Nuvin CLI',
            version: '1.0.0',
          },
        } as InitializeResult,
      });
    });

    it('should return error for unknown method', async () => {
      const server = new ACPServer(mockOrchestratorFactory);
      (server as any).transport.input = inputStream;
      (server as any).transport.output = outputStream;
      await server.start();

      const unknownRequest: JsonRpcRequest = {
        jsonrpc: '2.0',
        id: 2,
        method: 'unknown/method',
        params: {},
      };

      sendMessage(unknownRequest);

      const response = await waitForMessage((msg): msg is JsonRpcResponse => 'id' in msg && msg.id === 2);

      expect(response).toMatchObject({
        jsonrpc: '2.0',
        id: 2,
        error: {
          code: -32601, // MethodNotFound
          message: expect.stringContaining('Method not found'),
        },
      });
    });
  });

  describe('Session Management', () => {
    it('should create new session with valid cwd', async () => {
      const server = new ACPServer(mockOrchestratorFactory);
      (server as any).transport.input = inputStream;
      (server as any).transport.output = outputStream;
      await server.start();

      const newSessionRequest: JsonRpcRequest = {
        jsonrpc: '2.0',
        id: 10,
        method: 'session/new',
        params: {
          cwd: '/tmp/test',
          mcpServers: [],
        } as NewSessionParams,
      };

      sendMessage(newSessionRequest);

      const response = await waitForMessage((msg): msg is JsonRpcResponse => 'id' in msg && msg.id === 10);

      expect(response).toMatchObject({
        jsonrpc: '2.0',
        id: 10,
      });

      expect('result' in response && response.result).toBeTruthy();
      const result = response.result as NewSessionResult;
      expect(result.sessionId).toMatch(/^sess_/);

      // Verify orchestrator factory was called
      expect(mockOrchestratorFactory).toHaveBeenCalledWith(
        expect.objectContaining({
          id: result.sessionId,
          cwd: '/tmp/test',
        }),
      );
    });

    it('should handle multiple concurrent sessions', async () => {
      const server = new ACPServer(mockOrchestratorFactory);
      (server as any).transport.input = inputStream;
      (server as any).transport.output = outputStream;
      await server.start();

      // Create first session
      sendMessage({
        jsonrpc: '2.0',
        id: 20,
        method: 'session/new',
        params: { cwd: '/tmp/session1' } as NewSessionParams,
      });

      // Create second session
      sendMessage({
        jsonrpc: '2.0',
        id: 21,
        method: 'session/new',
        params: { cwd: '/tmp/session2' } as NewSessionParams,
      });

      const response1 = await waitForMessage((msg): msg is JsonRpcResponse => 'id' in msg && msg.id === 20);
      const response2 = await waitForMessage((msg): msg is JsonRpcResponse => 'id' in msg && msg.id === 21);

      const sessionId1 = ('result' in response1 && (response1.result as NewSessionResult).sessionId) || '';
      const sessionId2 = ('result' in response2 && (response2.result as NewSessionResult).sessionId) || '';

      expect(sessionId1).toMatch(/^sess_/);
      expect(sessionId2).toMatch(/^sess_/);
      expect(sessionId1).not.toBe(sessionId2);
    });
  });

  describe('Prompt Handling and Event Streaming', () => {
    it('should handle prompt and stream session updates', async () => {
      const server = new ACPServer(mockOrchestratorFactory);
      (server as any).transport.input = inputStream;
      (server as any).transport.output = outputStream;
      await server.start();

      // Create session first
      sendMessage({
        jsonrpc: '2.0',
        id: 30,
        method: 'session/new',
        params: { cwd: '/tmp' } as NewSessionParams,
      });

      const sessionResponse = await waitForMessage((msg): msg is JsonRpcResponse => 'id' in msg && msg.id === 30);
      const sessionId = ('result' in sessionResponse && (sessionResponse.result as NewSessionResult).sessionId) || '';

      // Clear received messages to focus on prompt flow
      receivedMessages = [];

      // Send prompt
      sendMessage({
        jsonrpc: '2.0',
        id: 31,
        method: 'session/prompt',
        params: {
          sessionId,
          prompt: [{ type: 'text', text: 'Hello AI' }],
        } as PromptParams,
      });

      // Wait for prompt result
      const promptResponse = await waitForMessage((msg): msg is JsonRpcResponse => 'id' in msg && msg.id === 31, 2000);

      expect(promptResponse).toMatchObject({
        jsonrpc: '2.0',
        id: 31,
        result: {
          stopReason: 'end_turn',
        } as PromptResult,
      });

      // Verify session/update notifications were sent
      const updates = getNotifications('session/update');
      expect(updates.length).toBeGreaterThan(0);

      // Check for assistant chunks
      const chunkUpdates = updates.filter((u) => {
        const params = u.params as SessionUpdateParams;
        return params.update.sessionUpdate === 'agent_message_chunk';
      });

      expect(chunkUpdates.length).toBeGreaterThanOrEqual(2);

      // Verify content of chunks
      const firstChunk = chunkUpdates[0].params as SessionUpdateParams;
      expect(firstChunk.sessionId).toBe(sessionId);
      expect(firstChunk.update).toMatchObject({
        sessionUpdate: 'agent_message_chunk',
        content: { type: 'text', text: 'Hello' },
      });
    });

    it('should return error for invalid session ID', async () => {
      const server = new ACPServer(mockOrchestratorFactory);
      (server as any).transport.input = inputStream;
      (server as any).transport.output = outputStream;
      await server.start();

      sendMessage({
        jsonrpc: '2.0',
        id: 40,
        method: 'session/prompt',
        params: {
          sessionId: 'sess_nonexistent',
          prompt: [{ type: 'text', text: 'Hello' }],
        } as PromptParams,
      });

      const response = await waitForMessage((msg): msg is JsonRpcResponse => 'id' in msg && msg.id === 40);

      expect(response).toMatchObject({
        jsonrpc: '2.0',
        id: 40,
        error: {
          code: -32603, // InternalError
          message: expect.stringContaining('Session not found'),
        },
      });
    });
  });

  describe('Tool Call Event Streaming', () => {
    it('should stream tool call events', async () => {
      // Custom orchestrator that emits tool events
      const toolOrchestrator = {
        ...mockOrchestrator,
        sendMessage: vi.fn(async (text, options) => {
          for (const handler of eventHandlers) {
            // Emit tool call event
            handler({
              type: AgentEventTypes.ToolCalls,
              conversationId: 'conv_1',
              messageId: 'msg_1',
              toolCalls: [
                {
                  id: 'call_123',
                  type: 'function',
                  function: {
                    name: 'file_read',
                    arguments: JSON.stringify({ path: '/tmp/test.txt' }),
                  },
                },
              ],
            });

            if (options.signal.aborted) return;

            // Emit tool result
            handler({
              type: AgentEventTypes.ToolResult,
              conversationId: 'conv_1',
              messageId: 'msg_1',
              result: {
                id: 'call_123',
                status: 'success',
                result: 'File contents here',
              },
            });

            handler({
              type: AgentEventTypes.Done,
              conversationId: 'conv_1',
              messageId: 'msg_1',
              responseTimeMs: 100,
            });
          }
        }),
      };

      const toolFactory: OrchestratorFactory = vi.fn(async () => toolOrchestrator);

      const server = new ACPServer(toolFactory);
      (server as any).transport.input = inputStream;
      (server as any).transport.output = outputStream;
      await server.start();

      // Create session and send prompt
      sendMessage({
        jsonrpc: '2.0',
        id: 50,
        method: 'session/new',
        params: { cwd: '/tmp' } as NewSessionParams,
      });

      const sessionResponse = await waitForMessage((msg): msg is JsonRpcResponse => 'id' in msg && msg.id === 50);
      const sessionId = ('result' in sessionResponse && (sessionResponse.result as NewSessionResult).sessionId) || '';

      receivedMessages = [];

      sendMessage({
        jsonrpc: '2.0',
        id: 51,
        method: 'session/prompt',
        params: {
          sessionId,
          prompt: [{ type: 'text', text: 'Read file' }],
        } as PromptParams,
      });

      await waitForMessage((msg): msg is JsonRpcResponse => 'id' in msg && msg.id === 51, 2000);

      const updates = getNotifications('session/update');

      // Find tool_call update
      const toolCallUpdate = updates.find((u) => {
        const params = u.params as SessionUpdateParams;
        return params.update.sessionUpdate === 'tool_call';
      });

      expect(toolCallUpdate).toBeDefined();
      const toolCallParams = toolCallUpdate!.params as SessionUpdateParams;
      expect(toolCallParams.update).toMatchObject({
        sessionUpdate: 'tool_call',
        toolCallId: 'call_123',
        title: 'file_read',
        kind: 'read',
        status: 'pending',
        rawInput: { path: '/tmp/test.txt' },
      });

      // Find tool_call_update
      const toolResultUpdate = updates.find((u) => {
        const params = u.params as SessionUpdateParams;
        return params.update.sessionUpdate === 'tool_call_update';
      });

      expect(toolResultUpdate).toBeDefined();
      const toolResultParams = toolResultUpdate!.params as SessionUpdateParams;
      expect(toolResultParams.update).toMatchObject({
        sessionUpdate: 'tool_call_update',
        toolCallId: 'call_123',
        status: 'completed',
      });
    });
  });

  describe('Permission Flow', () => {
    it('should handle tool approval request and response', async () => {
      // Orchestrator that requires approval
      const approvalOrchestrator = {
        ...mockOrchestrator,
        sendMessage: vi.fn(async (text, options) => {
          for (const handler of eventHandlers) {
            // Emit approval required event
            const approvalId = 'approval_123';
            approvalHandlers.set(approvalId, { decision: 'deny', resolved: false });

            handler({
              type: AgentEventTypes.ToolApprovalRequired,
              conversationId: 'conv_1',
              messageId: 'msg_1',
              toolCalls: [
                {
                  id: 'call_456',
                  type: 'function',
                  function: {
                    name: 'bash_tool',
                    arguments: JSON.stringify({ cmd: 'rm -rf /' }),
                  },
                },
              ],
              approvalId,
            });

            // Wait for approval decision
            const startTime = Date.now();
            while (!approvalHandlers.get(approvalId)?.resolved && Date.now() - startTime < 2000) {
              await new Promise((r) => setTimeout(r, 10));
            }

            if (options.signal.aborted) return;

            handler({
              type: AgentEventTypes.Done,
              conversationId: 'conv_1',
              messageId: 'msg_1',
              responseTimeMs: 100,
            });
          }
        }),
      };

      const approvalFactory: OrchestratorFactory = vi.fn(async () => approvalOrchestrator);

      const server = new ACPServer(approvalFactory);
      (server as any).transport.input = inputStream;
      (server as any).transport.output = outputStream;
      await server.start();

      // Create session
      sendMessage({
        jsonrpc: '2.0',
        id: 60,
        method: 'session/new',
        params: { cwd: '/tmp' } as NewSessionParams,
      });

      const sessionResponse = await waitForMessage((msg): msg is JsonRpcResponse => 'id' in msg && msg.id === 60);
      const sessionId = ('result' in sessionResponse && (sessionResponse.result as NewSessionResult).sessionId) || '';

      receivedMessages = [];

      // Send prompt that triggers approval
      sendMessage({
        jsonrpc: '2.0',
        id: 61,
        method: 'session/prompt',
        params: {
          sessionId,
          prompt: [{ type: 'text', text: 'Run dangerous command' }],
        } as PromptParams,
      });

      // Wait for permission request from server
      const permissionRequest = await waitForMessage(
        (msg): msg is JsonRpcRequest => 'method' in msg && msg.method === 'session/request_permission' && 'id' in msg,
        2000,
      );

      expect(permissionRequest).toMatchObject({
        jsonrpc: '2.0',
        method: 'session/request_permission',
        params: {
          sessionId,
          toolCall: {
            toolCallId: 'call_456',
            title: 'bash_tool',
            kind: 'execute',
            rawInput: { cmd: 'rm -rf /' },
          },
          options: expect.arrayContaining([
            expect.objectContaining({ kind: 'allow_once' }),
            expect.objectContaining({ kind: 'reject_once' }),
          ]),
        } as RequestPermissionParams,
      });

      const requestId = permissionRequest.id;

      // Send permission response (approve)
      sendMessage({
        jsonrpc: '2.0',
        id: requestId,
        result: {
          outcome: {
            outcome: 'selected',
            optionId: 'allow-once',
          },
        } as RequestPermissionResult,
      });

      // Wait a bit for processing
      await new Promise((r) => setTimeout(r, 50));

      // Verify handleToolApproval was called with 'approve'
      expect(approvalOrchestrator.handleToolApproval).toHaveBeenCalledWith('approval_123', 'approve');
    });

    it('should handle permission denial', async () => {
      const approvalOrchestrator = {
        ...mockOrchestrator,
        sendMessage: vi.fn(async (text, options) => {
          for (const handler of eventHandlers) {
            const approvalId = 'approval_456';
            approvalHandlers.set(approvalId, { decision: 'deny', resolved: false });

            handler({
              type: AgentEventTypes.ToolApprovalRequired,
              conversationId: 'conv_1',
              messageId: 'msg_1',
              toolCalls: [
                {
                  id: 'call_789',
                  type: 'function',
                  function: {
                    name: 'file_edit',
                    arguments: JSON.stringify({ path: '/etc/passwd' }),
                  },
                },
              ],
              approvalId,
            });

            const startTime = Date.now();
            while (!approvalHandlers.get(approvalId)?.resolved && Date.now() - startTime < 2000) {
              await new Promise((r) => setTimeout(r, 10));
            }

            handler({
              type: AgentEventTypes.Done,
              conversationId: 'conv_1',
              messageId: 'msg_1',
              responseTimeMs: 100,
            });
          }
        }),
      };

      const approvalFactory: OrchestratorFactory = vi.fn(async () => approvalOrchestrator);

      const server = new ACPServer(approvalFactory);
      (server as any).transport.input = inputStream;
      (server as any).transport.output = outputStream;
      await server.start();

      sendMessage({
        jsonrpc: '2.0',
        id: 70,
        method: 'session/new',
        params: { cwd: '/tmp' } as NewSessionParams,
      });

      const sessionResponse = await waitForMessage((msg): msg is JsonRpcResponse => 'id' in msg && msg.id === 70);
      const sessionId = ('result' in sessionResponse && (sessionResponse.result as NewSessionResult).sessionId) || '';

      receivedMessages = [];

      sendMessage({
        jsonrpc: '2.0',
        id: 71,
        method: 'session/prompt',
        params: {
          sessionId,
          prompt: [{ type: 'text', text: 'Edit system file' }],
        } as PromptParams,
      });

      const permissionRequest = await waitForMessage(
        (msg): msg is JsonRpcRequest => 'method' in msg && msg.method === 'session/request_permission',
        2000,
      );

      const requestId = permissionRequest.id;

      // Send permission response (deny)
      sendMessage({
        jsonrpc: '2.0',
        id: requestId,
        result: {
          outcome: {
            outcome: 'selected',
            optionId: 'reject',
          },
        } as RequestPermissionResult,
      });

      await new Promise((r) => setTimeout(r, 50));

      expect(approvalOrchestrator.handleToolApproval).toHaveBeenCalledWith('approval_456', 'deny');
    });
  });

  describe('Cancellation', () => {
    it('should handle session/cancel notification', async () => {
      let wasCancelled = false;

      // Orchestrator with longer running operation that tracks cancellation
      const longOrchestrator = {
        ...mockOrchestrator,
        sendMessage: vi.fn(async (text, options) => {
          for (const handler of eventHandlers) {
            handler({
              type: AgentEventTypes.AssistantChunk,
              conversationId: 'conv_1',
              messageId: 'msg_1',
              delta: 'Start',
            });

            // Simulate long operation with checks
            for (let i = 0; i < 20; i++) {
              if (options.signal.aborted) {
                wasCancelled = true;
                // Throw to simulate abort behavior (as real orchestrator would)
                throw new Error('Aborted');
              }
              await new Promise((r) => setTimeout(r, 50));
            }

            handler({
              type: AgentEventTypes.AssistantChunk,
              conversationId: 'conv_1',
              messageId: 'msg_1',
              delta: 'End',
            });

            handler({
              type: AgentEventTypes.Done,
              conversationId: 'conv_1',
              messageId: 'msg_1',
              responseTimeMs: 100,
            });
          }
        }),
      };

      const longFactory: OrchestratorFactory = vi.fn(async () => longOrchestrator);

      const server = new ACPServer(longFactory);
      (server as any).transport.input = inputStream;
      (server as any).transport.output = outputStream;
      await server.start();

      sendMessage({
        jsonrpc: '2.0',
        id: 80,
        method: 'session/new',
        params: { cwd: '/tmp' } as NewSessionParams,
      });

      const sessionResponse = await waitForMessage((msg): msg is JsonRpcResponse => 'id' in msg && msg.id === 80);
      const sessionId = ('result' in sessionResponse && (sessionResponse.result as NewSessionResult).sessionId) || '';

      receivedMessages = [];

      // Start prompt
      sendMessage({
        jsonrpc: '2.0',
        id: 81,
        method: 'session/prompt',
        params: {
          sessionId,
          prompt: [{ type: 'text', text: 'Long task' }],
        } as PromptParams,
      });

      // Wait for Start chunk to be received (confirms processing started)
      await waitForMessage((msg): msg is JsonRpcNotification => {
        if ('method' in msg && msg.method === 'session/update') {
          const params = msg.params as SessionUpdateParams;
          return params.update.sessionUpdate === 'agent_message_chunk' && params.update.content.text === 'Start';
        }
        return false;
      }, 1000);

      // Send cancel notification immediately after seeing Start
      sendMessage({
        jsonrpc: '2.0',
        method: 'session/cancel',
        params: {
          sessionId,
        } as CancelParams,
      });

      // Wait for prompt response (either success or error)
      const promptResponse = await waitForMessage((msg): msg is JsonRpcResponse => 'id' in msg && msg.id === 81, 2000);

      // Should get some response
      expect(promptResponse).toMatchObject({
        jsonrpc: '2.0',
        id: 81,
      });

      // Verify the orchestrator detected cancellation via abort signal
      expect(wasCancelled).toBe(true);

      // Verify "End" chunk was never sent (this proves cancellation worked)
      const updates = getNotifications('session/update');
      const chunks = updates.filter((u) => {
        const params = u.params as SessionUpdateParams;
        return params.update.sessionUpdate === 'agent_message_chunk' && params.update.content.text === 'End';
      });

      expect(chunks).toHaveLength(0);
    });
  });

  describe('Error Handling', () => {
    it('should handle malformed JSON gracefully', async () => {
      const server = new ACPServer(mockOrchestratorFactory);
      (server as any).transport.input = inputStream;
      (server as any).transport.output = outputStream;
      await server.start();

      // Send malformed JSON
      inputStream.push('{"jsonrpc":"2.0",invalid json\n');

      // Wait to ensure server doesn't crash
      await new Promise((r) => setTimeout(r, 100));

      // Server should still be responsive
      sendMessage({
        jsonrpc: '2.0',
        id: 90,
        method: 'initialize',
        params: { protocolVersion: 1 } as InitializeParams,
      });

      const response = await waitForMessage((msg): msg is JsonRpcResponse => 'id' in msg && msg.id === 90);

      expect(response).toMatchObject({
        jsonrpc: '2.0',
        id: 90,
        result: expect.any(Object),
      });
    });

    it('should handle orchestrator errors', async () => {
      const errorOrchestrator = {
        ...mockOrchestrator,
        sendMessage: vi.fn(async () => {
          throw new Error('Orchestrator internal error');
        }),
      };

      const errorFactory: OrchestratorFactory = vi.fn(async () => errorOrchestrator);

      const server = new ACPServer(errorFactory);
      (server as any).transport.input = inputStream;
      (server as any).transport.output = outputStream;
      await server.start();

      sendMessage({
        jsonrpc: '2.0',
        id: 100,
        method: 'session/new',
        params: { cwd: '/tmp' } as NewSessionParams,
      });

      const sessionResponse = await waitForMessage((msg): msg is JsonRpcResponse => 'id' in msg && msg.id === 100);
      const sessionId = ('result' in sessionResponse && (sessionResponse.result as NewSessionResult).sessionId) || '';

      sendMessage({
        jsonrpc: '2.0',
        id: 101,
        method: 'session/prompt',
        params: {
          sessionId,
          prompt: [{ type: 'text', text: 'Cause error' }],
        } as PromptParams,
      });

      const errorResponse = await waitForMessage((msg): msg is JsonRpcResponse => 'id' in msg && msg.id === 101);

      expect(errorResponse).toMatchObject({
        jsonrpc: '2.0',
        id: 101,
        error: {
          code: -32603, // InternalError
          message: expect.stringContaining('Orchestrator internal error'),
        },
      });
    });
  });

  describe('Reasoning Chunk Streaming', () => {
    it('should stream reasoning chunks as thought updates', async () => {
      const reasoningOrchestrator = {
        ...mockOrchestrator,
        sendMessage: vi.fn(async (text, options) => {
          for (const handler of eventHandlers) {
            handler({
              type: AgentEventTypes.ReasoningChunk,
              conversationId: 'conv_1',
              messageId: 'msg_1',
              delta: 'Let me think...',
            });

            if (options.signal.aborted) return;

            handler({
              type: AgentEventTypes.ReasoningChunk,
              conversationId: 'conv_1',
              messageId: 'msg_1',
              delta: ' about this problem.',
            });

            handler({
              type: AgentEventTypes.AssistantChunk,
              conversationId: 'conv_1',
              messageId: 'msg_1',
              delta: 'Answer',
            });

            handler({
              type: AgentEventTypes.Done,
              conversationId: 'conv_1',
              messageId: 'msg_1',
              responseTimeMs: 100,
            });
          }
        }),
      };

      const reasoningFactory: OrchestratorFactory = vi.fn(async () => reasoningOrchestrator);

      const server = new ACPServer(reasoningFactory);
      (server as any).transport.input = inputStream;
      (server as any).transport.output = outputStream;
      await server.start();

      sendMessage({
        jsonrpc: '2.0',
        id: 110,
        method: 'session/new',
        params: { cwd: '/tmp' } as NewSessionParams,
      });

      const sessionResponse = await waitForMessage((msg): msg is JsonRpcResponse => 'id' in msg && msg.id === 110);
      const sessionId = ('result' in sessionResponse && (sessionResponse.result as NewSessionResult).sessionId) || '';

      receivedMessages = [];

      sendMessage({
        jsonrpc: '2.0',
        id: 111,
        method: 'session/prompt',
        params: {
          sessionId,
          prompt: [{ type: 'text', text: 'Think about this' }],
        } as PromptParams,
      });

      await waitForMessage((msg): msg is JsonRpcResponse => 'id' in msg && msg.id === 111, 2000);

      const updates = getNotifications('session/update');

      const thoughtUpdates = updates.filter((u) => {
        const params = u.params as SessionUpdateParams;
        return params.update.sessionUpdate === 'agent_thought_chunk';
      });

      expect(thoughtUpdates.length).toBe(2);

      const firstThought = thoughtUpdates[0].params as SessionUpdateParams;
      expect(firstThought.update).toMatchObject({
        sessionUpdate: 'agent_thought_chunk',
        content: { type: 'text', text: 'Let me think...' },
      });

      const secondThought = thoughtUpdates[1].params as SessionUpdateParams;
      expect(secondThought.update).toMatchObject({
        sessionUpdate: 'agent_thought_chunk',
        content: { type: 'text', text: ' about this problem.' },
      });
    });
  });
});
