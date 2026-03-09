import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  processAgentEvent,
  resetEventProcessorState,
  type EventProcessorCallbacks,
  type EventProcessorState,
} from '../source/utils/eventProcessor.js';
import { AgentEventTypes, type AgentEvent } from '@nuvin/nuvin-core';

describe('eventProcessor', () => {
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

  describe('reasoning chunk handling', () => {
    it('should create thinking message on first reasoning chunk', () => {
      const reasoningChunkEvent: AgentEvent = {
        type: AgentEventTypes.ReasoningChunk,
        conversationId: 'test',
        messageId: 'msg-1',
        delta: 'Let me think...',
      };

      state = processAgentEvent(reasoningChunkEvent, state, callbacks);

      expect(appendLineSpy).toHaveBeenCalledTimes(1);
      expect(appendLineSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'thinking',
          content: 'Let me think...',
          metadata: expect.objectContaining({ isStreaming: true }),
        }),
      );
      expect(state.reasoningMessageId).toBeTruthy();
      expect(state.reasoningContent).toBe('Let me think...');
    });

    it('should update existing thinking message on subsequent reasoning chunks', () => {
      const chunk1Event: AgentEvent = {
        type: AgentEventTypes.ReasoningChunk,
        conversationId: 'test',
        messageId: 'msg-1',
        delta: 'Let me ',
      };

      state = processAgentEvent(chunk1Event, state, callbacks);
      const reasoningMsgId = state.reasoningMessageId;

      const chunk2Event: AgentEvent = {
        type: AgentEventTypes.ReasoningChunk,
        conversationId: 'test',
        messageId: 'msg-1',
        delta: 'think about this.',
      };

      state = processAgentEvent(chunk2Event, state, callbacks);

      expect(appendLineSpy).toHaveBeenCalledTimes(1);
      expect(updateLineSpy).toHaveBeenCalledWith(reasoningMsgId, 'Let me think about this.');
      expect(state.reasoningContent).toBe('Let me think about this.');
    });

    it('should handle reasoning and assistant chunks independently', () => {
      const reasoningChunk: AgentEvent = {
        type: AgentEventTypes.ReasoningChunk,
        conversationId: 'test',
        messageId: 'msg-1',
        delta: 'Thinking...',
      };
      state = processAgentEvent(reasoningChunk, state, callbacks);

      const assistantChunk: AgentEvent = {
        type: AgentEventTypes.AssistantChunk,
        conversationId: 'test',
        messageId: 'msg-1',
        delta: 'Hello!',
      };
      state = processAgentEvent(assistantChunk, state, callbacks);

      expect(appendLineSpy).toHaveBeenCalledTimes(2);
      expect(state.reasoningMessageId).toBeTruthy();
      expect(state.streamingMessageId).toBeTruthy();
      expect(state.reasoningMessageId).not.toBe(state.streamingMessageId);
    });

    it('should reset reasoning state on MessageStarted', () => {
      state.reasoningMessageId = 'prev-reasoning';
      state.reasoningContent = 'previous reasoning';

      const messageStartedEvent: AgentEvent = {
        type: AgentEventTypes.MessageStarted,
        conversationId: 'test',
        messageId: 'msg-2',
        userContent: 'new prompt',
        enhanced: ['new prompt'],
        toolNames: [],
      };

      state = processAgentEvent(messageStartedEvent, state, callbacks);

      expect(state.reasoningMessageId).toBeNull();
      expect(state.reasoningContent).toBe('');
    });

    it('should finalize reasoning on AssistantMessage', () => {
      const reasoningChunk: AgentEvent = {
        type: AgentEventTypes.ReasoningChunk,
        conversationId: 'test',
        messageId: 'msg-1',
        delta: 'Thinking...',
      };
      state = processAgentEvent(reasoningChunk, state, callbacks);
      const reasoningMsgId = state.reasoningMessageId;

      const assistantMessage: AgentEvent = {
        type: AgentEventTypes.AssistantMessage,
        conversationId: 'test',
        messageId: 'msg-1',
        content: 'Final answer',
      };
      state = processAgentEvent(assistantMessage, state, callbacks);

      expect(updateLineMetadataSpy).toHaveBeenCalledWith(reasoningMsgId, { isStreaming: false });
      expect(state.reasoningMessageId).toBeNull();
    });

    it('should finalize reasoning on Error', () => {
      const reasoningChunk: AgentEvent = {
        type: AgentEventTypes.ReasoningChunk,
        conversationId: 'test',
        messageId: 'msg-1',
        delta: 'Thinking...',
      };
      state = processAgentEvent(reasoningChunk, state, callbacks);
      const reasoningMsgId = state.reasoningMessageId;

      const errorEvent: AgentEvent = {
        type: AgentEventTypes.Error,
        conversationId: 'test',
        messageId: 'msg-1',
        error: 'Something went wrong',
      };
      state = processAgentEvent(errorEvent, state, callbacks);

      expect(updateLineMetadataSpy).toHaveBeenCalledWith(reasoningMsgId, { isStreaming: false });
      expect(state.reasoningMessageId).toBeNull();
    });

    it('should not process reasoning chunks when streaming disabled', () => {
      callbacks.streamingEnabled = false;

      const reasoningChunk: AgentEvent = {
        type: AgentEventTypes.ReasoningChunk,
        conversationId: 'test',
        messageId: 'msg-1',
        delta: 'Thinking...',
      };
      state = processAgentEvent(reasoningChunk, state, callbacks);

      expect(appendLineSpy).not.toHaveBeenCalled();
      expect(state.reasoningMessageId).toBeNull();
    });
  });

  describe('streaming with leading newlines stripped', () => {
    it('should handle case where all chunks are empty after stripping leading newlines', () => {
      const messageStartedEvent: AgentEvent = {
        type: AgentEventTypes.MessageStarted,
        conversationId: 'test',
        messageId: 'msg-1',
        userContent: 'test prompt',
        enhanced: ['test prompt'],
        toolNames: [],
      };

      state = processAgentEvent(messageStartedEvent, state, callbacks);

      const chunk1Event: AgentEvent = {
        type: AgentEventTypes.AssistantChunk,
        conversationId: 'test',
        messageId: 'msg-1',
        delta: '',
      };

      state = processAgentEvent(chunk1Event, state, callbacks);

      const chunk2Event: AgentEvent = {
        type: AgentEventTypes.AssistantChunk,
        conversationId: 'test',
        messageId: 'msg-1',
        delta: '',
      };

      state = processAgentEvent(chunk2Event, state, callbacks);

      // Empty chunks create a message with empty content
      // This is the current behavior - first empty chunk creates empty message
      expect(appendLineSpy).toHaveBeenCalledTimes(1);
      expect(state.streamingMessageId).toBeTruthy();
      expect(state.streamingContent).toBe('');

      const streamingMsgId = state.streamingMessageId;
      expect(streamingMsgId).toBeTruthy();
      appendLineSpy.mockClear();

      const assistantMessageEvent: AgentEvent = {
        type: AgentEventTypes.AssistantMessage,
        conversationId: 'test',
        messageId: 'msg-1',
        content: 'Final content after stripping newlines',
      };

      state = processAgentEvent(assistantMessageEvent, state, callbacks);

      // ✅ FIX: The empty streaming message is now updated with final content
      expect(updateLineSpy).toHaveBeenCalledWith(streamingMsgId, 'Final content after stripping newlines');
      expect(appendLineSpy).not.toHaveBeenCalled(); // No new message created
      expect(state.streamingContent).toBe('Final content after stripping newlines');
    });

    it('should not duplicate content when streaming has content and AssistantMessage arrives', () => {
      const messageStartedEvent: AgentEvent = {
        type: AgentEventTypes.MessageStarted,
        conversationId: 'test',
        messageId: 'msg-1',
        userContent: 'test prompt',
        enhanced: ['test prompt'],
        toolNames: [],
      };

      state = processAgentEvent(messageStartedEvent, state, callbacks);

      const chunk1Event: AgentEvent = {
        type: AgentEventTypes.AssistantChunk,
        conversationId: 'test',
        messageId: 'msg-1',
        delta: 'Hello',
      };

      state = processAgentEvent(chunk1Event, state, callbacks);

      expect(appendLineSpy).toHaveBeenCalledTimes(1);
      expect(state.streamingMessageId).not.toBeNull();

      const chunk2Event: AgentEvent = {
        type: AgentEventTypes.AssistantChunk,
        conversationId: 'test',
        messageId: 'msg-1',
        delta: ' world',
      };

      state = processAgentEvent(chunk2Event, state, callbacks);

      expect(updateLineSpy).toHaveBeenCalledTimes(1);
      expect(updateLineSpy).toHaveBeenCalledWith(state.streamingMessageId, 'Hello world');

      const assistantMessageEvent: AgentEvent = {
        type: AgentEventTypes.AssistantMessage,
        conversationId: 'test',
        messageId: 'msg-1',
        content: 'Hello world',
      };

      state = processAgentEvent(assistantMessageEvent, state, callbacks);

      expect(appendLineSpy).toHaveBeenCalledTimes(1);
    });

    it('should show final message when streaming disabled regardless of chunks', () => {
      callbacks.streamingEnabled = false;

      const messageStartedEvent: AgentEvent = {
        type: AgentEventTypes.MessageStarted,
        conversationId: 'test',
        messageId: 'msg-1',
        userContent: 'test prompt',
        enhanced: ['test prompt'],
        toolNames: [],
      };

      state = processAgentEvent(messageStartedEvent, state, callbacks);

      const chunk1Event: AgentEvent = {
        type: AgentEventTypes.AssistantChunk,
        conversationId: 'test',
        messageId: 'msg-1',
        delta: 'Hello',
      };

      state = processAgentEvent(chunk1Event, state, callbacks);

      expect(appendLineSpy).toHaveBeenCalledTimes(0);

      const assistantMessageEvent: AgentEvent = {
        type: AgentEventTypes.AssistantMessage,
        conversationId: 'test',
        messageId: 'msg-1',
        content: 'Hello world',
      };

      state = processAgentEvent(assistantMessageEvent, state, callbacks);

      expect(appendLineSpy).toHaveBeenCalledTimes(1);
      expect(appendLineSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'assistant',
          content: 'Hello world',
        }),
      );
    });

    it('should update final message when streaming content differs from AssistantMessage', () => {
      const messageStartedEvent: AgentEvent = {
        type: AgentEventTypes.MessageStarted,
        conversationId: 'test',
        messageId: 'msg-1',
        userContent: 'test prompt',
        enhanced: ['test prompt'],
        toolNames: [],
      };

      state = processAgentEvent(messageStartedEvent, state, callbacks);

      const chunk1Event: AgentEvent = {
        type: AgentEventTypes.AssistantChunk,
        conversationId: 'test',
        messageId: 'msg-1',
        delta: 'ello',
      };

      state = processAgentEvent(chunk1Event, state, callbacks);

      expect(appendLineSpy).toHaveBeenCalledTimes(1);
      const messageId = state.streamingMessageId;

      const assistantMessageEvent: AgentEvent = {
        type: AgentEventTypes.AssistantMessage,
        conversationId: 'test',
        messageId: 'msg-1',
        content: 'Hello world',
      };

      state = processAgentEvent(assistantMessageEvent, state, callbacks);

      expect(updateLineSpy).toHaveBeenCalledWith(messageId, 'Hello world');
    });
  });

  describe('edge cases', () => {
    it('should handle empty AssistantMessage event', () => {
      const assistantMessageEvent: AgentEvent = {
        type: AgentEventTypes.AssistantMessage,
        conversationId: 'test',
        messageId: 'msg-1',
        content: '',
      };

      state = processAgentEvent(assistantMessageEvent, state, callbacks);

      expect(appendLineSpy).toHaveBeenCalledTimes(0);
    });

    it('should handle AssistantMessage with undefined content', () => {
      const assistantMessageEvent: AgentEvent = {
        type: AgentEventTypes.AssistantMessage,
        conversationId: 'test',
        messageId: 'msg-1',
        content: undefined,
      };

      state = processAgentEvent(assistantMessageEvent, state, callbacks);

      expect(appendLineSpy).toHaveBeenCalledTimes(0);
    });

    it('should reset streaming state on MessageStarted', () => {
      state.streamingMessageId = 'prev-msg';
      state.streamingContent = 'previous content';
      state.toolCallCount = 5;

      const messageStartedEvent: AgentEvent = {
        type: AgentEventTypes.MessageStarted,
        conversationId: 'test',
        messageId: 'msg-2',
        userContent: 'new prompt',
        enhanced: ['new prompt'],
        toolNames: [],
      };

      state = processAgentEvent(messageStartedEvent, state, callbacks);

      expect(state.streamingMessageId).toBeNull();
      expect(state.streamingContent).toBe('');
      expect(state.toolCallCount).toBe(0);
    });

    it('should handle empty chunks followed by non-empty chunk', () => {
      const messageStartedEvent: AgentEvent = {
        type: AgentEventTypes.MessageStarted,
        conversationId: 'test',
        messageId: 'msg-1',
        userContent: 'test',
        enhanced: ['test'],
        toolNames: [],
      };

      state = processAgentEvent(messageStartedEvent, state, callbacks);

      const emptyChunk1: AgentEvent = {
        type: AgentEventTypes.AssistantChunk,
        conversationId: 'test',
        messageId: 'msg-1',
        delta: '',
      };
      state = processAgentEvent(emptyChunk1, state, callbacks);

      const emptyChunk2: AgentEvent = {
        type: AgentEventTypes.AssistantChunk,
        conversationId: 'test',
        messageId: 'msg-1',
        delta: '',
      };
      state = processAgentEvent(emptyChunk2, state, callbacks);

      // First empty chunk creates a message with empty content
      expect(appendLineSpy).toHaveBeenCalledTimes(1);
      expect(state.streamingMessageId).toBeTruthy();
      expect(state.streamingContent).toBe('');

      const streamingMsgId = state.streamingMessageId;
      expect(streamingMsgId).toBeTruthy();
      appendLineSpy.mockClear();

      const contentChunk: AgentEvent = {
        type: AgentEventTypes.AssistantChunk,
        conversationId: 'test',
        messageId: 'msg-1',
        delta: 'Hello',
      };
      state = processAgentEvent(contentChunk, state, callbacks);

      // Content chunk updates the existing empty message
      expect(appendLineSpy).not.toHaveBeenCalled();
      expect(updateLineSpy).toHaveBeenCalledWith(streamingMsgId, 'Hello');
      expect(state.streamingMessageId).toBe(streamingMsgId);
      expect(state.streamingContent).toBe('Hello');
    });

    it('should handle mixed empty and non-empty chunks correctly', () => {
      const messageStartedEvent: AgentEvent = {
        type: AgentEventTypes.MessageStarted,
        conversationId: 'test',
        messageId: 'msg-1',
        userContent: 'test',
        enhanced: ['test'],
        toolNames: [],
      };

      state = processAgentEvent(messageStartedEvent, state, callbacks);

      const chunk1: AgentEvent = {
        type: AgentEventTypes.AssistantChunk,
        conversationId: 'test',
        messageId: 'msg-1',
        delta: 'Hello',
      };
      state = processAgentEvent(chunk1, state, callbacks);
      const messageId = state.streamingMessageId;

      const emptyChunk: AgentEvent = {
        type: AgentEventTypes.AssistantChunk,
        conversationId: 'test',
        messageId: 'msg-1',
        delta: '',
      };
      state = processAgentEvent(emptyChunk, state, callbacks);

      const chunk2: AgentEvent = {
        type: AgentEventTypes.AssistantChunk,
        conversationId: 'test',
        messageId: 'msg-1',
        delta: ' World',
      };
      state = processAgentEvent(chunk2, state, callbacks);

      expect(appendLineSpy).toHaveBeenCalledTimes(1);
      expect(updateLineSpy).toHaveBeenCalledTimes(2);
      expect(updateLineSpy).toHaveBeenNthCalledWith(1, messageId, 'Hello');
      expect(updateLineSpy).toHaveBeenNthCalledWith(2, messageId, 'Hello World');
      expect(state.streamingContent).toBe('Hello World');
    });

    it('should ignore chunks when streaming disabled and show final message', () => {
      const callbacksNoStreaming: EventProcessorCallbacks = {
        appendLine: appendLineSpy,
        updateLine: updateLineSpy,
        streamingEnabled: false,
      };

      const messageStartedEvent: AgentEvent = {
        type: AgentEventTypes.MessageStarted,
        conversationId: 'test',
        messageId: 'msg-1',
        userContent: 'test',
        enhanced: ['test'],
        toolNames: [],
      };

      state = processAgentEvent(messageStartedEvent, state, callbacksNoStreaming);

      const chunk1: AgentEvent = {
        type: AgentEventTypes.AssistantChunk,
        conversationId: 'test',
        messageId: 'msg-1',
        delta: 'Hello',
      };
      state = processAgentEvent(chunk1, state, callbacksNoStreaming);

      const chunk2: AgentEvent = {
        type: AgentEventTypes.AssistantChunk,
        conversationId: 'test',
        messageId: 'msg-1',
        delta: ' World',
      };
      state = processAgentEvent(chunk2, state, callbacksNoStreaming);

      expect(appendLineSpy).toHaveBeenCalledTimes(0);
      expect(state.streamingMessageId).toBeNull();

      const assistantMessageEvent: AgentEvent = {
        type: AgentEventTypes.AssistantMessage,
        conversationId: 'test',
        messageId: 'msg-1',
        content: 'Hello World',
      };
      state = processAgentEvent(assistantMessageEvent, state, callbacksNoStreaming);

      expect(appendLineSpy).toHaveBeenCalledTimes(1);
      expect(appendLineSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'assistant',
          content: 'Hello World',
        }),
      );
    });
  });
});
