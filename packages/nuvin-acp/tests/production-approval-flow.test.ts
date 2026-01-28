import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ACPServer } from '../source/server.js';
import { AgentEventTypes } from '@nuvin/nuvin-core';
import { Readable } from 'stream';
import type { 
  InitializeParams, 
  NewSessionParams, 
  PromptParams,
  NewSessionResult
} from '../source/protocol/types.js';
import type { OrchestratorFactory } from '../source/server.js';

describe('ACP Production Tool Approval Flow', () => {
  let inputStream: Readable;
  let outputStream: Buffer[];
  let receivedMessages: any[] = [];
  let eventHandlers: ((event: any) => void)[] = [];

  function sendMessage(message: any) {
    inputStream.emit('data', JSON.stringify(message) + '\n');
  }

  beforeEach(() => {
    receivedMessages = [];
    eventHandlers = [];
    outputStream = [];
    inputStream = new Readable();
  });

  it('should send session/request_permission for ToolCalls event with approval required', async () => {
    // Create a real orchestrator that emits ToolCalls (like production)
    const realOrchestrator = {
      sendMessage: vi.fn(),
      onEvent: (handler: (event: any) => void) => {
        eventHandlers.push(handler);
      },
      handleToolApproval: vi.fn(),
    };

    const factory: OrchestratorFactory = vi.fn(async () => realOrchestrator);
    const server = new ACPServer(factory);
    
    // Mock transport to capture sent messages
    const mockTransport = {
      send: vi.fn(async (msg: any) => {
        receivedMessages.push(msg);
      }),
      onMessage: vi.fn(),
      start: vi.fn(),
    };
    (server as any).transport = mockTransport;
    
    // Don't call server.start() - just create session directly
    const newSessionParams: NewSessionParams = { cwd: '/tmp' };
    const sessionResult = await server['handleNewSession'](newSessionParams);
    const sessionId = sessionResult.sessionId;

    // Clear messages from session creation
    receivedMessages = [];

    // Simulate what REAL orchestrator emits: ToolCalls event
    // This is what actually happens in production!
    const toolCallsEvent = {
      type: AgentEventTypes.ToolCalls,
      conversationId: 'conv_1',
      messageId: 'msg_1',
      toolCalls: [
        {
          id: 'call_001',
          type: 'function' as const,
          function: {
            name: 'file_edit',  // ← Requires approval (not bypassed)
            arguments: JSON.stringify({
              file_path: '/tmp/test.txt',
              old_text: 'old',
              new_text: 'new',
            }),
          },
          requiresApproval: true,  // ← KEY: This is set by orchestrator
          approvalId: 'approval_abc123',  // ← KEY: This is set by orchestrator
        } as any,  // Cast to any to allow requiresApproval/approvalId
      ],
    };

    console.log('\n=== EMITTING TOOL CALLS EVENT ===');
    console.log('Tool call:', JSON.stringify(toolCallsEvent.toolCalls[0], null, 2));

    // Emit the event (simulating orchestrator)
    const handler = eventHandlers[0];
    handler(toolCallsEvent);

    // Wait for async handler to process (longer wait)
    await new Promise(resolve => setTimeout(resolve, 500));

    // Check what messages were sent
    console.log('\n=== MESSAGES SENT (Requires Approval) ===');
    console.log(JSON.stringify(receivedMessages, null, 2));

    // Find the session/request_permission message
    const permissionRequest = receivedMessages.find(
      msg => msg.method === 'session/request_permission'
    );

    console.log('\n=== PERMISSION REQUEST ===');
    console.log(JSON.stringify(permissionRequest, null, 2));

    // ASSERT: Should have sent session/request_permission
    expect(permissionRequest).toBeDefined();
    expect(permissionRequest).toMatchObject({
      jsonrpc: '2.0',
      method: 'session/request_permission',
      params: {
        sessionId,
        toolCall: {
          toolCallId: 'call_001',
          title: 'file_edit',
          kind: 'edit',
          rawInput: {
            file_path: '/tmp/test.txt',
            old_text: 'old',
            new_text: 'new',
          },
        },
        options: expect.arrayContaining([
          expect.objectContaining({ kind: 'allow_once' }),
          expect.objectContaining({ kind: 'allow_always' }),
          expect.objectContaining({ kind: 'reject_once' }),
        ]),
      },
    });
  });

  it('should NOT send session/request_permission for bypassed tools', async () => {
    const realOrchestrator = {
      sendMessage: vi.fn(),
      onEvent: (handler: (event: any) => void) => {
        eventHandlers.push(handler);
      },
      handleToolApproval: vi.fn(),
    };

    const factory: OrchestratorFactory = vi.fn(async () => realOrchestrator);
    const server = new ACPServer(factory);
    
    const mockTransport = {
      send: vi.fn(async (msg: any) => {
        receivedMessages.push(msg);
      }),
      onMessage: vi.fn(),
      start: vi.fn(),
    };
    (server as any).transport = mockTransport;
    
    const newSessionParams: NewSessionParams = { cwd: '/tmp' };
    await server['handleNewSession'](newSessionParams);
    receivedMessages = [];

    // Emit ToolCalls event with bypassed tool (file_read)
    const toolCallsEvent = {
      type: AgentEventTypes.ToolCalls,
      conversationId: 'conv_1',
      messageId: 'msg_1',
      toolCalls: [
        {
          id: 'call_002',
          type: 'function' as const,
          function: {
            name: 'file_read',  // ← Bypassed tool
            arguments: JSON.stringify({ path: '/tmp/test.txt' }),
          },
          requiresApproval: false,  // ← KEY: Bypassed by orchestrator
          approvalId: undefined,    // ← No approval ID when bypassed
        },
      ],
    };

    const handler = eventHandlers[0];
    handler(toolCallsEvent);

    await new Promise(resolve => setTimeout(resolve, 100));

    // Find session/request_permission messages
    const permissionRequests = receivedMessages.filter(
      msg => msg.method === 'session/request_permission'
    );

    console.log('\n=== MESSAGES SENT (Bypassed Tool) ===');
    console.log(JSON.stringify(receivedMessages, null, 2));

    // ASSERT: Should NOT have sent session/request_permission
    expect(permissionRequests).toHaveLength(0);

    // But SHOULD have sent session/update (tool_call)
    const toolCallUpdate = receivedMessages.find(
      msg => msg.method === 'session/update' && 
             msg.params.update.sessionUpdate === 'tool_call'
    );
    expect(toolCallUpdate).toBeDefined();
  });
});
