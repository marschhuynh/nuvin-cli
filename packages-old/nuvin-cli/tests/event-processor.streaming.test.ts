import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  processAgentEvent,
  resetEventProcessorState,
  type EventProcessorCallbacks,
  type EventProcessorState,
} from '../source/utils/eventProcessor.js';
import { AgentEventTypes, type AgentEvent } from '@nuvin/nuvin-core';

describe('eventProcessor — ToolOutputChunk', () => {
  let callbacks: EventProcessorCallbacks;
  let appendLineSpy: ReturnType<typeof vi.fn>;
  let updateLineSpy: ReturnType<typeof vi.fn>;
  let updateLineMetadataSpy: ReturnType<typeof vi.fn>;
  let setLastMetadataSpy: ReturnType<typeof vi.fn>;
  let state: EventProcessorState;

  beforeEach(() => {
    appendLineSpy = vi.fn();
    updateLineSpy = vi.fn();
    updateLineMetadataSpy = vi.fn();
    setLastMetadataSpy = vi.fn();

    callbacks = {
      appendLine: appendLineSpy,
      updateLine: updateLineSpy,
      updateLineMetadata: updateLineMetadataSpy,
      setLastMetadata: setLastMetadataSpy,
      streamingEnabled: true,
    };

    state = resetEventProcessorState();
  });

  async function emitToolCalls(toolCallIds: string[] = ['tc-1']): Promise<EventProcessorState> {
    const toolCallsEvent: AgentEvent = {
      type: AgentEventTypes.ToolCalls,
      conversationId: 'conv-1',
      messageId: 'msg-1',
      toolCalls: toolCallIds.map((id) => ({
        id,
        type: 'function',
        function: { name: 'bash_tool', arguments: '{"cmd":"echo hi"}' },
      })),
    };
    const result = processAgentEvent(toolCallsEvent, state, callbacks);
    return result instanceof Promise ? await result : result;
  }

  it('updates metadata on the tool call message with per-tool streaming output', async () => {
    state = await emitToolCalls();

    const chunkEvent: AgentEvent = {
      type: AgentEventTypes.ToolOutputChunk,
      conversationId: 'conv-1',
      messageId: 'msg-1',
      toolCallId: 'tc-1',
      content: 'line1\nline2',
      totalLines: 5,
    };

    state = processAgentEvent(chunkEvent, state, callbacks) as EventProcessorState;

    expect(updateLineMetadataSpy).toHaveBeenCalledWith(
      expect.any(String), // the tool call message ID
      expect.objectContaining({
        'streamingOutput_tc-1': 'line1\nline2',
        'streamingTotalLines_tc-1': 5,
      }),
    );
  });

  it('ignores chunks for unknown tool call IDs', async () => {
    state = await emitToolCalls();
    updateLineMetadataSpy.mockClear();

    const chunkEvent: AgentEvent = {
      type: AgentEventTypes.ToolOutputChunk,
      conversationId: 'conv-1',
      messageId: 'msg-1',
      toolCallId: 'unknown-tc',
      content: 'data',
      totalLines: 1,
    };

    const newState = processAgentEvent(chunkEvent, state, callbacks) as EventProcessorState;

    expect(updateLineMetadataSpy).not.toHaveBeenCalled();
    expect(newState).toBe(state); // state unchanged
  });

  it('handles multiple sequential chunks', async () => {
    state = await emitToolCalls();

    const chunk1: AgentEvent = {
      type: AgentEventTypes.ToolOutputChunk,
      conversationId: 'conv-1',
      messageId: 'msg-1',
      toolCallId: 'tc-1',
      content: 'line1',
      totalLines: 1,
    };
    state = processAgentEvent(chunk1, state, callbacks) as EventProcessorState;

    const chunk2: AgentEvent = {
      type: AgentEventTypes.ToolOutputChunk,
      conversationId: 'conv-1',
      messageId: 'msg-1',
      toolCallId: 'tc-1',
      content: 'line4\nline5',
      totalLines: 5,
    };
    state = processAgentEvent(chunk2, state, callbacks) as EventProcessorState;

    // Second call should update with the latest content
    expect(updateLineMetadataSpy).toHaveBeenLastCalledWith(
      expect.any(String),
      expect.objectContaining({
        'streamingOutput_tc-1': 'line4\nline5',
        'streamingTotalLines_tc-1': 5,
      }),
    );
  });

  it('chunks for tool calls without prior ToolCalls event are ignored', () => {
    const chunkEvent: AgentEvent = {
      type: AgentEventTypes.ToolOutputChunk,
      conversationId: 'conv-1',
      messageId: 'msg-1',
      toolCallId: 'tc-1',
      content: 'data',
      totalLines: 1,
    };

    const newState = processAgentEvent(chunkEvent, state, callbacks) as EventProcessorState;

    expect(updateLineMetadataSpy).not.toHaveBeenCalled();
    expect(newState).toBe(state);
  });

  it('ignores ToolOutputChunk when streaming is disabled', async () => {
    callbacks.streamingEnabled = false;
    state = await emitToolCalls();

    const chunkEvent: AgentEvent = {
      type: AgentEventTypes.ToolOutputChunk,
      conversationId: 'conv-1',
      messageId: 'msg-1',
      toolCallId: 'tc-1',
      content: 'data',
      totalLines: 1,
    };

    const newState = processAgentEvent(chunkEvent, state, callbacks) as EventProcessorState;

    expect(updateLineMetadataSpy).not.toHaveBeenCalled();
    expect(newState).toBe(state);
  });

  it('keeps streaming metadata isolated per tool call when multiple tools run concurrently', async () => {
    state = await emitToolCalls(['tc-1', 'tc-2']);

    const chunk1: AgentEvent = {
      type: AgentEventTypes.ToolOutputChunk,
      conversationId: 'conv-1',
      messageId: 'msg-1',
      toolCallId: 'tc-1',
      content: 'first-output',
      totalLines: 1,
    };
    state = processAgentEvent(chunk1, state, callbacks) as EventProcessorState;

    const chunk2: AgentEvent = {
      type: AgentEventTypes.ToolOutputChunk,
      conversationId: 'conv-1',
      messageId: 'msg-1',
      toolCallId: 'tc-2',
      content: 'second-output',
      totalLines: 2,
    };
    state = processAgentEvent(chunk2, state, callbacks) as EventProcessorState;

    expect(updateLineMetadataSpy).toHaveBeenCalledTimes(2);

    const firstCallMetadata = updateLineMetadataSpy.mock.calls[0][1];
    const secondCallMetadata = updateLineMetadataSpy.mock.calls[1][1];

    expect(firstCallMetadata).toMatchObject({
      'streamingOutput_tc-1': 'first-output',
      'streamingTotalLines_tc-1': 1,
    });
    expect(firstCallMetadata).not.toHaveProperty('streamingOutput');
    expect(firstCallMetadata).not.toHaveProperty('streamingOutput_tc-2');

    expect(secondCallMetadata).toMatchObject({
      'streamingOutput_tc-2': 'second-output',
      'streamingTotalLines_tc-2': 2,
    });
    expect(secondCallMetadata).not.toHaveProperty('streamingOutput');
    expect(secondCallMetadata).not.toHaveProperty('streamingOutput_tc-1');
  });

  it('cleans up streaming metadata and tool mappings after ToolResult', async () => {
    state = await emitToolCalls(['tc-1']);

    const chunk: AgentEvent = {
      type: AgentEventTypes.ToolOutputChunk,
      conversationId: 'conv-1',
      messageId: 'msg-1',
      toolCallId: 'tc-1',
      content: 'line1\nline2',
      totalLines: 2,
    };
    state = processAgentEvent(chunk, state, callbacks) as EventProcessorState;
    updateLineMetadataSpy.mockClear();

    const toolResultEvent: AgentEvent = {
      type: AgentEventTypes.ToolResult,
      conversationId: 'conv-1',
      result: {
        id: 'tc-1',
        name: 'bash_tool',
        status: 'success',
        type: 'text',
        result: 'ok',
        durationMs: 10,
      },
    };
    state = processAgentEvent(toolResultEvent, state, callbacks) as EventProcessorState;

    expect(updateLineMetadataSpy).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        'streamingOutput_tc-1': undefined,
        'streamingTotalLines_tc-1': undefined,
      }),
    );
    expect(state.toolCallToMessageMap.has('tc-1')).toBe(false);
    expect(state.recentToolCalls.has('tc-1')).toBe(false);
  });
});
