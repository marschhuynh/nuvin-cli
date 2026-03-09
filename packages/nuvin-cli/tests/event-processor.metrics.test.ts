import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  processAgentEvent,
  resetEventProcessorState,
  type EventProcessorCallbacks,
  type EventProcessorState,
} from '../source/utils/eventProcessor.js';
import { AgentEventTypes, type AgentEvent } from '@nuvin/nuvin-core';

describe('eventProcessor - SubAgent Metrics', () => {
  let callbacks: EventProcessorCallbacks;
  let updateLineMetadataSpy: ReturnType<typeof vi.fn>;
  let state: EventProcessorState;

  beforeEach(() => {
    updateLineMetadataSpy = vi.fn();

    callbacks = {
      appendLine: vi.fn(),
      updateLine: vi.fn(),
      updateLineMetadata: updateLineMetadataSpy,
      streamingEnabled: true,
    };

    state = resetEventProcessorState();
  });

  it('should update state and trigger metadata update on SubAgentMetrics event', () => {
    // 1. Setup - Message with Tool Call
    const toolCallId = 'call-123';

    // Process tool call to establish message mapping
    // Note: processAgentEvent is async for ToolCalls
    // We assume the test helper handles the async nature or we mock enrichToolCallsWithLineNumbers?
    // Looking at existing tests, they just await or the function is synchronous enough for tests?
    // processAgentEvent returns Promise<EventProcessorState> for ToolCalls.

    // Wait, processAgentEvent for ToolCalls IS async.
    // But for this test, I need to manually populate the state or properly await.
    // Let's manually convert the state:

    const messageId = 'msg-tool-call';
    state.toolCallToMessageMap.set(toolCallId, messageId);

    // 2. Setup - SubAgentStarted
    const agentId = 'agent-1';
    const startedEvent: AgentEvent = {
      type: AgentEventTypes.SubAgentStarted,
      conversationId: 'test',
      messageId: 'msg-1',
      agentId: agentId,
      agentName: 'Test Agent',
      toolCallId: toolCallId,
    };

    state = processAgentEvent(startedEvent, state, callbacks) as EventProcessorState;

    // Verify sub-agent initialized
    expect(state.subAgents.has(agentId)).toBe(true);

    // 3. Test - SubAgentMetrics
    const metrics = {
      totalTokens: 100,
      totalPromptTokens: 50,
      totalCompletionTokens: 50,
      totalCost: 0.05,
      llmCallCount: 1,
      // ... other required fields
      totalCachedTokens: 0,
      totalReasoningTokens: 0,
      requestCount: 0,
      toolCallCount: 0,
      totalTimeMs: 0,
      currentTokens: 100,
      currentPromptTokens: 50,
      currentCompletionTokens: 50,
      currentCachedTokens: 0,
      currentCost: 0.05,
    };

    const metricsEvent: AgentEvent = {
      type: AgentEventTypes.SubAgentMetrics,
      conversationId: 'test',
      messageId: 'msg-1',
      agentId: agentId,
      metrics: metrics,
      toolCallId: toolCallId,
    };

    state = processAgentEvent(metricsEvent, state, callbacks) as EventProcessorState;

    // Verify state update
    expect(state.subAgents.get(agentId)?.metrics).toEqual(metrics);

    // Verify callback trigger
    // Callbacks might be called multiple times (e.g. by Started event)
    expect(updateLineMetadataSpy).toHaveBeenCalledWith(
      messageId,
      expect.objectContaining({
        [`subAgentState_${toolCallId}`]: expect.objectContaining({
          metrics: metrics,
        }),
      }),
    );
  });
});
