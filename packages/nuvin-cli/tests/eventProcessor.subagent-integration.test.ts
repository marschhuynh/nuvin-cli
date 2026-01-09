import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  processAgentEvent,
  resetEventProcessorState,
  type EventProcessorCallbacks,
  type EventProcessorState,
} from '../source/utils/eventProcessor.js';
import { AgentEventTypes, type AgentEvent } from '@nuvin/nuvin-core';

// Mock the enrichToolCallsWithLineNumbers to avoid file system access
vi.mock('../source/utils/enrichToolCalls.js', () => ({
  enrichToolCallsWithLineNumbers: vi.fn((toolCalls) => Promise.resolve(toolCalls)),
}));

describe('eventProcessor - SubAgent Integration Flow', () => {
  let callbacks: EventProcessorCallbacks;
  let updateLineMetadataSpy: ReturnType<typeof vi.fn>;
  let appendLineSpy: ReturnType<typeof vi.fn>;
  let state: EventProcessorState;

  beforeEach(() => {
    updateLineMetadataSpy = vi.fn();
    appendLineSpy = vi.fn();

    callbacks = {
      appendLine: appendLineSpy,
      updateLine: vi.fn(),
      updateLineMetadata: updateLineMetadataSpy,
      streamingEnabled: true,
    };

    state = resetEventProcessorState();
  });

  it('should properly link SubAgentStarted to ToolCalls via toolCallId', async () => {
    const toolCallId = 'call-123';
    
    // 1. Process ToolCalls event (async because of enrichToolCallsWithLineNumbers)
    const toolCallsEvent: AgentEvent = {
      type: AgentEventTypes.ToolCalls,
      conversationId: 'test',
      messageId: 'msg-1',
      toolCalls: [{
        id: toolCallId,
        type: 'function',
        function: {
          name: 'assign_task',
          arguments: JSON.stringify({ agent: 'test-agent', task: 'do something', description: 'test' })
        }
      }],
    };
    
    const toolCallsResult = processAgentEvent(toolCallsEvent, state, callbacks);
    state = toolCallsResult instanceof Promise ? await toolCallsResult : toolCallsResult;
    
    // Verify ToolCalls populated the map
    expect(state.toolCallToMessageMap.has(toolCallId)).toBe(true);
    const messageId = state.toolCallToMessageMap.get(toolCallId);
    expect(messageId).toBeDefined();
    
    // 2. Process SubAgentStarted - should find the message
    const startedEvent: AgentEvent = {
      type: AgentEventTypes.SubAgentStarted,
      conversationId: 'test',
      messageId: 'msg-1',
      agentId: 'agent-1',
      agentName: 'Test Agent',
      toolCallId: toolCallId,
    };
    
    state = processAgentEvent(startedEvent, state, callbacks) as EventProcessorState;
    
    // Verify sub-agent was created
    expect(state.subAgents.has('agent-1')).toBe(true);
    
    // Verify metadata update was called with the correct message ID
    expect(updateLineMetadataSpy).toHaveBeenCalledWith(
      messageId,
      expect.objectContaining({
        [`subAgentState_${toolCallId}`]: expect.objectContaining({
          agentId: 'agent-1',
          agentName: 'Test Agent',
          status: 'starting',
        }),
      }),
    );
  });

  it('should update sub-agent state when SubAgentToolCall is received', async () => {
    const toolCallId = 'call-456';
    
    // 1. Process ToolCalls event
    const toolCallsEvent: AgentEvent = {
      type: AgentEventTypes.ToolCalls,
      conversationId: 'test',
      messageId: 'msg-1',
      toolCalls: [{
        id: toolCallId,
        type: 'function',
        function: {
          name: 'assign_task',
          arguments: JSON.stringify({ agent: 'code-reviewer', task: 'review code', description: 'test' })
        }
      }],
    };
    
    let result = processAgentEvent(toolCallsEvent, state, callbacks);
    state = result instanceof Promise ? await result : result;
    
    const messageId = state.toolCallToMessageMap.get(toolCallId);
    
    // 2. Process SubAgentStarted
    const startedEvent: AgentEvent = {
      type: AgentEventTypes.SubAgentStarted,
      conversationId: 'test',
      messageId: 'msg-1',
      agentId: 'agent-reviewer',
      agentName: 'Code Reviewer',
      toolCallId: toolCallId,
    };
    
    state = processAgentEvent(startedEvent, state, callbacks) as EventProcessorState;
    
    // 3. Process SubAgentToolCall
    const toolCallEvent: AgentEvent = {
      type: AgentEventTypes.SubAgentToolCall,
      conversationId: 'test',
      messageId: 'msg-1',
      agentId: 'agent-reviewer',
      toolCallId: 'nested-call-1',
      toolName: 'file_read',
      toolArguments: JSON.stringify({ path: 'src/file.ts' }),
    };
    
    state = processAgentEvent(toolCallEvent, state, callbacks) as EventProcessorState;
    
    // Verify sub-agent has the tool call
    const subAgent = state.subAgents.get('agent-reviewer');
    expect(subAgent).toBeDefined();
    expect(subAgent?.status).toBe('running');
    expect(subAgent?.toolCalls).toHaveLength(1);
    expect(subAgent?.toolCalls[0]?.name).toBe('file_read');
    
    // Verify metadata update was called
    expect(updateLineMetadataSpy).toHaveBeenLastCalledWith(
      messageId,
      expect.objectContaining({
        [`subAgentState_${toolCallId}`]: expect.objectContaining({
          status: 'running',
          toolCalls: expect.arrayContaining([
            expect.objectContaining({ name: 'file_read' })
          ]),
        }),
      }),
    );
  });
});
