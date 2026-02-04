/**
 * ACP EventTranslator Tests
 *
 * Tests for the EventTranslator class that translates Nuvin's AgentEvent stream
 * to ACP SessionUpdate notifications.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { AgentEvent, ToolCall, ToolExecutionResult } from '@nuvin/nuvin-core';

// =============================================================================
// Mock Setup
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

// =============================================================================
// Tests
// =============================================================================

describe('EventTranslator', () => {
  let mockServer: {
    sendSessionUpdate: ReturnType<typeof vi.fn>;
    isInitialized: ReturnType<typeof vi.fn>;
    isDisposed: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockServer = {
      sendSessionUpdate: vi.fn(),
      isInitialized: vi.fn(() => true),
      isDisposed: vi.fn(() => false),
    };
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ---------------------------------------------------------------------------
  // Assistant Chunk Translation
  // ---------------------------------------------------------------------------

  describe('translate AssistantChunk', () => {
    it('should translate AssistantChunk to agent_message_chunk', async () => {
      const { EventTranslator } = await import('../../source/acp/event-translator.js');

      const translator = new EventTranslator('session_123', mockServer as any);

      const event: AgentEvent = {
        type: 'assistant_chunk',
        delta: 'Hello, world!',
      };

      translator.translate(event);

      expect(mockServer.sendSessionUpdate).toHaveBeenCalledWith('session_123', {
        type: 'agent_message_chunk',
        chunk: { text: 'Hello, world!' },
      });
    });

    it('should handle empty delta', async () => {
      const { EventTranslator } = await import('../../source/acp/event-translator.js');

      const translator = new EventTranslator('session_123', mockServer as any);

      const event: AgentEvent = {
        type: 'assistant_chunk',
        delta: '',
      };

      translator.translate(event);

      expect(mockServer.sendSessionUpdate).toHaveBeenCalledWith('session_123', {
        type: 'agent_message_chunk',
        chunk: { text: '' },
      });
    });
  });

  // ---------------------------------------------------------------------------
  // Reasoning Chunk Translation
  // ---------------------------------------------------------------------------

  describe('translate ReasoningChunk', () => {
    it('should translate ReasoningChunk to agent_thought_chunk', async () => {
      const { EventTranslator } = await import('../../source/acp/event-translator.js');

      const translator = new EventTranslator('session_123', mockServer as any);

      const event: AgentEvent = {
        type: 'reasoning_chunk',
        delta: 'Thinking about the problem...',
      };

      translator.translate(event);

      expect(mockServer.sendSessionUpdate).toHaveBeenCalledWith('session_123', {
        type: 'agent_thought_chunk',
        chunk: { text: 'Thinking about the problem...' },
      });
    });
  });

  // ---------------------------------------------------------------------------
  // Tool Calls Translation
  // ---------------------------------------------------------------------------

  describe('translate ToolCalls', () => {
    it('should translate ToolCalls to tool_call updates', async () => {
      const { EventTranslator } = await import('../../source/acp/event-translator.js');

      const translator = new EventTranslator('session_123', mockServer as any);

      const toolCall: ToolCall = {
        id: 'call_123',
        type: 'function',
        function: {
          name: 'file_read',
          arguments: JSON.stringify({ path: '/test/file.txt' }),
        },
      };

      const event: AgentEvent = {
        type: 'tool_calls',
        toolCalls: [toolCall],
      };

      translator.translate(event);

      expect(mockServer.sendSessionUpdate).toHaveBeenCalledWith(
        'session_123',
        expect.objectContaining({
          type: 'tool_call',
          toolCallId: 'tc_call_123',
          kind: 'file_read',
          name: 'file_read',
        }),
      );
    });

    it('should translate multiple tool calls', async () => {
      const { EventTranslator } = await import('../../source/acp/event-translator.js');

      const translator = new EventTranslator('session_123', mockServer as any);

      const event: AgentEvent = {
        type: 'tool_calls',
        toolCalls: [
          {
            id: 'call_1',
            type: 'function',
            function: {
              name: 'file_read',
              arguments: JSON.stringify({ path: '/file1.txt' }),
            },
          },
          {
            id: 'call_2',
            type: 'function',
            function: {
              name: 'file_edit',
              arguments: JSON.stringify({ file_path: '/file2.txt', old_text: 'a', new_text: 'b' }),
            },
          },
        ],
      };

      translator.translate(event);

      expect(mockServer.sendSessionUpdate).toHaveBeenCalledTimes(2);
      expect(mockServer.sendSessionUpdate).toHaveBeenCalledWith(
        'session_123',
        expect.objectContaining({ toolCallId: 'tc_call_1', kind: 'file_read' }),
      );
      expect(mockServer.sendSessionUpdate).toHaveBeenCalledWith(
        'session_123',
        expect.objectContaining({ toolCallId: 'tc_call_2', kind: 'file_edit' }),
      );
    });

    it('should map tool names to correct ToolKind', async () => {
      const { EventTranslator } = await import('../../source/acp/event-translator.js');

      const testCases: Array<{ name: string; expectedKind: string }> = [
        { name: 'file_read', expectedKind: 'file_read' },
        { name: 'file_edit', expectedKind: 'file_edit' },
        { name: 'file_new', expectedKind: 'file_write' },
        { name: 'bash_tool', expectedKind: 'command' },
        { name: 'web_search', expectedKind: 'web' },
        { name: 'web_fetch', expectedKind: 'web' },
        { name: 'grep_tool', expectedKind: 'search' },
        { name: 'glob_tool', expectedKind: 'search' },
        { name: 'ls_tool', expectedKind: 'file_read' },
        { name: 'lsp', expectedKind: 'other' },
        { name: 'todo_write', expectedKind: 'other' },
        { name: 'unknown_tool', expectedKind: 'other' },
      ];

      for (const { name, expectedKind } of testCases) {
        vi.clearAllMocks();
        const translator = new EventTranslator('session_123', mockServer as any);

        const event: AgentEvent = {
          type: 'tool_calls',
          toolCalls: [
            {
              id: `call_${name}`,
              type: 'function',
              function: { name, arguments: '{}' },
            },
          ],
        };

        translator.translate(event);

        expect(mockServer.sendSessionUpdate).toHaveBeenCalledWith(
          'session_123',
          expect.objectContaining({ kind: expectedKind }),
        );
      }
    });

    it('should map MCP tools to mcp kind', async () => {
      const { EventTranslator } = await import('../../source/acp/event-translator.js');

      const translator = new EventTranslator('session_123', mockServer as any);

      const event: AgentEvent = {
        type: 'tool_calls',
        toolCalls: [
          {
            id: 'call_mcp',
            type: 'function',
            function: { name: 'mcp_github_create_issue', arguments: '{}' },
          },
        ],
      };

      translator.translate(event);

      expect(mockServer.sendSessionUpdate).toHaveBeenCalledWith(
        'session_123',
        expect.objectContaining({ kind: 'mcp' }),
      );
    });

    it('should include location for file operations', async () => {
      const { EventTranslator } = await import('../../source/acp/event-translator.js');

      const translator = new EventTranslator('session_123', mockServer as any);

      const event: AgentEvent = {
        type: 'tool_calls',
        toolCalls: [
          {
            id: 'call_read',
            type: 'function',
            function: {
              name: 'file_read',
              arguments: JSON.stringify({ path: '/test/file.ts', lineStart: 10, lineEnd: 20 }),
            },
          },
        ],
      };

      translator.translate(event);

      expect(mockServer.sendSessionUpdate).toHaveBeenCalledWith(
        'session_123',
        expect.objectContaining({
          location: {
            path: '/test/file.ts',
            startLine: 10,
            endLine: 20,
          },
        }),
      );
    });
  });

  // ---------------------------------------------------------------------------
  // Tool Approval Required Translation
  // ---------------------------------------------------------------------------

  describe('translate ToolApprovalRequired', () => {
    it('should update tool call status to waiting_permission', async () => {
      const { EventTranslator } = await import('../../source/acp/event-translator.js');

      const translator = new EventTranslator('session_123', mockServer as any);

      // First, send a tool call to establish the mapping
      translator.translate({
        type: 'tool_calls',
        toolCalls: [
          {
            id: 'call_123',
            type: 'function',
            function: { name: 'bash_tool', arguments: '{"cmd":"rm -rf /"}' },
          },
        ],
      });

      vi.clearAllMocks();

      // Then send approval required
      const event: AgentEvent = {
        type: 'tool_approval_required',
        toolCalls: [
          {
            id: 'call_123',
            type: 'function',
            function: { name: 'bash_tool', arguments: '{"cmd":"rm -rf /"}' },
          },
        ],
      };

      translator.translate(event);

      expect(mockServer.sendSessionUpdate).toHaveBeenCalledWith('session_123', {
        type: 'tool_call_update',
        toolCallId: 'tc_call_123',
        status: 'waiting_permission',
      });
    });
  });

  // ---------------------------------------------------------------------------
  // Tool Result Translation
  // ---------------------------------------------------------------------------

  describe('translate ToolResult', () => {
    it('should translate successful tool result to completed status', async () => {
      const { EventTranslator } = await import('../../source/acp/event-translator.js');

      const translator = new EventTranslator('session_123', mockServer as any);

      // First, send a tool call to establish the mapping
      translator.translate({
        type: 'tool_calls',
        toolCalls: [
          {
            id: 'call_123',
            type: 'function',
            function: { name: 'file_read', arguments: '{"path":"/test.txt"}' },
          },
        ],
      });

      vi.clearAllMocks();

      const result: ToolExecutionResult = {
        id: 'call_123',
        type: 'text',
        status: 'success',
        toolName: 'file_read',
        result: 'File contents here',
      };

      const event: AgentEvent = {
        type: 'tool_result',
        result,
      };

      translator.translate(event);

      expect(mockServer.sendSessionUpdate).toHaveBeenCalledWith(
        'session_123',
        expect.objectContaining({
          type: 'tool_call_update',
          toolCallId: 'tc_call_123',
          status: 'completed',
          result: expect.objectContaining({
            success: true,
            output: 'File contents here',
          }),
        }),
      );
    });

    it('should translate failed tool result to failed status', async () => {
      const { EventTranslator } = await import('../../source/acp/event-translator.js');

      const translator = new EventTranslator('session_123', mockServer as any);

      // First, send a tool call to establish the mapping
      translator.translate({
        type: 'tool_calls',
        toolCalls: [
          {
            id: 'call_456',
            type: 'function',
            function: { name: 'bash_tool', arguments: '{"cmd":"invalid"}' },
          },
        ],
      });

      vi.clearAllMocks();

      const result: ToolExecutionResult = {
        id: 'call_456',
        type: 'text',
        status: 'error',
        toolName: 'bash_tool',
        result: 'Command not found',
      };

      const event: AgentEvent = {
        type: 'tool_result',
        result,
      };

      translator.translate(event);

      expect(mockServer.sendSessionUpdate).toHaveBeenCalledWith(
        'session_123',
        expect.objectContaining({
          type: 'tool_call_update',
          toolCallId: 'tc_call_456',
          status: 'failed',
          result: expect.objectContaining({
            success: false,
            error: 'Command not found',
          }),
        }),
      );
    });

    it('should handle JSON result type', async () => {
      const { EventTranslator } = await import('../../source/acp/event-translator.js');

      const translator = new EventTranslator('session_123', mockServer as any);

      // First, send a tool call to establish the mapping
      translator.translate({
        type: 'tool_calls',
        toolCalls: [
          {
            id: 'call_json',
            type: 'function',
            function: { name: 'ls_tool', arguments: '{}' },
          },
        ],
      });

      vi.clearAllMocks();

      const result: ToolExecutionResult = {
        id: 'call_json',
        type: 'json',
        status: 'success',
        toolName: 'ls_tool',
        result: { files: ['a.txt', 'b.txt'] },
      };

      const event: AgentEvent = {
        type: 'tool_result',
        result,
      };

      translator.translate(event);

      expect(mockServer.sendSessionUpdate).toHaveBeenCalledWith(
        'session_123',
        expect.objectContaining({
          result: expect.objectContaining({
            success: true,
            output: JSON.stringify({ files: ['a.txt', 'b.txt'] }, null, 2),
          }),
        }),
      );
    });
  });

  // ---------------------------------------------------------------------------
  // Sub-Agent Translation
  // ---------------------------------------------------------------------------

  describe('translate SubAgent events', () => {
    it('should translate SubAgentStarted to tool_call with running status', async () => {
      const { EventTranslator } = await import('../../source/acp/event-translator.js');

      const translator = new EventTranslator('session_123', mockServer as any);

      const event: AgentEvent = {
        type: 'sub_agent_started',
        agentId: 'agent_1',
        agentName: 'TestAgent',
        toolCallId: 'tc_sub_1',
      };

      translator.translate(event);

      // Should receive tool_call and then tool_call_update for running
      expect(mockServer.sendSessionUpdate).toHaveBeenCalledTimes(2);
      expect(mockServer.sendSessionUpdate).toHaveBeenCalledWith(
        'session_123',
        expect.objectContaining({
          type: 'tool_call',
          kind: 'other',
          name: 'sub_agent',
          content: expect.objectContaining({
            input: { agentId: 'agent_1', agentName: 'TestAgent' },
          }),
        }),
      );
      expect(mockServer.sendSessionUpdate).toHaveBeenCalledWith(
        'session_123',
        expect.objectContaining({
          type: 'tool_call_update',
          status: 'running',
        }),
      );
    });

    it('should translate SubAgentCompleted with success', async () => {
      const { EventTranslator } = await import('../../source/acp/event-translator.js');

      const translator = new EventTranslator('session_123', mockServer as any);

      // Start the sub-agent first
      translator.translate({
        type: 'sub_agent_started',
        agentId: 'agent_2',
        agentName: 'TestAgent',
        toolCallId: 'tc_sub_2',
      });

      vi.clearAllMocks();

      const event: AgentEvent = {
        type: 'sub_agent_completed',
        agentId: 'agent_2',
        agentName: 'TestAgent',
        status: 'success',
        resultMessage: 'Task completed successfully',
      };

      translator.translate(event);

      expect(mockServer.sendSessionUpdate).toHaveBeenCalledWith(
        'session_123',
        expect.objectContaining({
          type: 'tool_call_update',
          status: 'completed',
          result: expect.objectContaining({
            success: true,
            output: 'Task completed successfully',
          }),
        }),
      );
    });

    it('should translate SubAgentCompleted with failure', async () => {
      const { EventTranslator } = await import('../../source/acp/event-translator.js');

      const translator = new EventTranslator('session_123', mockServer as any);

      // Start the sub-agent first
      translator.translate({
        type: 'sub_agent_started',
        agentId: 'agent_3',
        agentName: 'TestAgent',
        toolCallId: 'tc_sub_3',
      });

      vi.clearAllMocks();

      const event: AgentEvent = {
        type: 'sub_agent_completed',
        agentId: 'agent_3',
        agentName: 'TestAgent',
        status: 'error',
        resultMessage: 'Task failed',
      };

      translator.translate(event);

      expect(mockServer.sendSessionUpdate).toHaveBeenCalledWith(
        'session_123',
        expect.objectContaining({
          type: 'tool_call_update',
          status: 'failed',
          result: expect.objectContaining({
            success: false,
            error: 'Task failed',
          }),
        }),
      );
    });
  });

  // ---------------------------------------------------------------------------
  // Error Translation
  // ---------------------------------------------------------------------------

  describe('translate Error', () => {
    it('should translate Error to agent_message_chunk', async () => {
      const { EventTranslator } = await import('../../source/acp/event-translator.js');

      const translator = new EventTranslator('session_123', mockServer as any);

      const event: AgentEvent = {
        type: 'error',
        error: 'Something went wrong',
      };

      translator.translate(event);

      expect(mockServer.sendSessionUpdate).toHaveBeenCalledWith('session_123', {
        type: 'agent_message_chunk',
        chunk: { text: 'Error: Something went wrong' },
      });
    });
  });

  // ---------------------------------------------------------------------------
  // Non-mapped Events
  // ---------------------------------------------------------------------------

  describe('non-mapped events', () => {
    it('should not send updates for message_started', async () => {
      const { EventTranslator } = await import('../../source/acp/event-translator.js');

      const translator = new EventTranslator('session_123', mockServer as any);

      translator.translate({ type: 'message_started' });

      expect(mockServer.sendSessionUpdate).not.toHaveBeenCalled();
    });

    it('should not send updates for stream_finish', async () => {
      const { EventTranslator } = await import('../../source/acp/event-translator.js');

      const translator = new EventTranslator('session_123', mockServer as any);

      translator.translate({ type: 'stream_finish', stopReason: 'end_turn' });

      expect(mockServer.sendSessionUpdate).not.toHaveBeenCalled();
    });

    it('should not send updates for done', async () => {
      const { EventTranslator } = await import('../../source/acp/event-translator.js');

      const translator = new EventTranslator('session_123', mockServer as any);

      translator.translate({ type: 'done' });

      expect(mockServer.sendSessionUpdate).not.toHaveBeenCalled();
    });
  });

  // ---------------------------------------------------------------------------
  // Error Handling
  // ---------------------------------------------------------------------------

  describe('error handling', () => {
    it('should not throw when sendSessionUpdate fails', async () => {
      const { EventTranslator } = await import('../../source/acp/event-translator.js');

      const errorServer = {
        sendSessionUpdate: vi.fn(() => {
          throw new Error('Connection lost');
        }),
      };

      const translator = new EventTranslator('session_123', errorServer as any);

      // Should not throw
      expect(() =>
        translator.translate({
          type: 'assistant_chunk',
          delta: 'test',
        }),
      ).not.toThrow();
    });
  });
});
