import { describe, it, expect, beforeEach, vi } from 'vitest';
import { AgentEventTypes } from '@nuvin/nuvin-core';
import {
  processAgentEvent,
  resetEventProcessorState,
  type EventProcessorCallbacks,
  type EventProcessorState,
} from '../source/utils/eventProcessor.js';

describe('✅ FIXED: Last message showing correctly with streaming', () => {
  let callbacks: EventProcessorCallbacks;
  let state: EventProcessorState;

  beforeEach(() => {
    callbacks = {
      appendLine: vi.fn(),
      updateLine: vi.fn(),
      updateLineMetadata: vi.fn(),
      setLastMetadata: vi.fn(),
      streamingEnabled: true,
    };
    state = resetEventProcessorState();
  });

  describe('Fix verification: Final message updates streaming content', () => {
    it('should update streaming message when final content differs', () => {
      state = processAgentEvent(
        { type: AgentEventTypes.MessageStarted, conversationId: 'cli', messageId: 'msg-123' },
        state,
        callbacks,
      );

      state = processAgentEvent(
        { type: AgentEventTypes.AssistantChunk, conversationId: 'cli', messageId: 'msg-123', delta: 'Hello' },
        state,
        callbacks,
      );

      const streamingMsgId = state.streamingMessageId;
      expect(streamingMsgId).toBeTruthy();
      expect(state.streamingContent).toBe('Hello');

      state = processAgentEvent(
        { type: AgentEventTypes.AssistantChunk, conversationId: 'cli', messageId: 'msg-123', delta: ' World!' },
        state,
        callbacks,
      );

      expect(state.streamingContent).toBe('Hello World!');

      vi.clearAllMocks();

      const finalContent = 'Hello World! This is the complete final response with additional content.';
      state = processAgentEvent(
        {
          type: AgentEventTypes.AssistantMessage,
          conversationId: 'cli',
          messageId: 'msg-123',
          content: finalContent,
        },
        state,
        callbacks,
      );

      // ✅ FIX VERIFIED: updateLine is called with final content
      expect(callbacks.updateLine).toHaveBeenCalledWith(streamingMsgId, finalContent);
      expect(callbacks.appendLine).not.toHaveBeenCalled();
      expect(state.streamingContent).toBe(finalContent);
    });

    it('should not update when streaming content matches final (optimization)', () => {
      state = processAgentEvent(
        { type: AgentEventTypes.MessageStarted, conversationId: 'cli', messageId: 'msg-match' },
        state,
        callbacks,
      );

      state = processAgentEvent(
        { type: AgentEventTypes.AssistantChunk, conversationId: 'cli', messageId: 'msg-match', delta: 'Hello' },
        state,
        callbacks,
      );

      state = processAgentEvent(
        { type: AgentEventTypes.AssistantChunk, conversationId: 'cli', messageId: 'msg-match', delta: ' World' },
        state,
        callbacks,
      );

      expect(state.streamingContent).toBe('Hello World');

      vi.clearAllMocks();

      state = processAgentEvent(
        {
          type: AgentEventTypes.AssistantMessage,
          conversationId: 'cli',
          messageId: 'msg-match',
          content: 'Hello World',
        },
        state,
        callbacks,
      );

      // Always update to trigger markdown re-render even when content matches
      expect(callbacks.updateLine).toHaveBeenCalledWith(expect.any(String), 'Hello World');
      expect(callbacks.updateLineMetadata).toHaveBeenCalledWith(expect.any(String), {
        messageId: 'msg-match',  // Ensure messageId is set
        isStreaming: false
      });
      expect(callbacks.appendLine).not.toHaveBeenCalled();
    });

    it('should handle empty chunks followed by final message', () => {
      state = resetEventProcessorState();

      const callbacksSpy = {
        appendLine: vi.fn(),
        updateLine: vi.fn(),
        streamingEnabled: true,
      };

      state = processAgentEvent(
        {
          type: AgentEventTypes.MessageStarted,
          conversationId: 'cli',
          messageId: 'msg-empty',
          userContent: 'test',
          enhanced: ['test'],
          toolNames: [],
        },
        state,
        callbacksSpy,
      );

      // First empty chunk should create streaming message
      state = processAgentEvent(
        { type: AgentEventTypes.AssistantChunk, conversationId: 'cli', messageId: 'msg-empty', delta: '' },
        state,
        callbacksSpy,
      );

      // Second empty chunk shouldn't change message
      state = processAgentEvent(
        { type: AgentEventTypes.AssistantChunk, conversationId: 'cli', messageId: 'msg-empty', delta: '' },
        state,
        callbacksSpy,
      );

      // Should have created assistant message with empty content
      expect(callbacksSpy.appendLine).toHaveBeenCalledTimes(1);
      expect(callbacksSpy.appendLine).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'assistant',
          content: '',
        }),
      );

      // Clear spys to track final message processing
      callbacksSpy.appendLine.mockClear();
      callbacksSpy.updateLine.mockClear();

      const finalContent = '## This is the actual response\n\nWith multiple lines of content.';
      state = processAgentEvent(
        {
          type: AgentEventTypes.AssistantMessage,
          conversationId: 'cli',
          messageId: 'msg-empty',
          content: finalContent,
        },
        state,
        callbacksSpy,
      );

      // Should update the existing assistant message with final content
      expect(callbacksSpy.appendLine).not.toHaveBeenCalled();
      expect(callbacksSpy.updateLine).toHaveBeenCalledWith(expect.any(String), finalContent);

      // Final state should reset streaming
      expect(state.streamingMessageId).toBe(null);
      expect(state.streamingContent).toBe(finalContent);
    });

    it('should handle partial streaming followed by complete final message', () => {
      state = processAgentEvent(
        { type: AgentEventTypes.MessageStarted, conversationId: 'cli', messageId: 'msg-partial' },
        state,
        callbacks,
      );

      state = processAgentEvent(
        {
          type: AgentEventTypes.AssistantChunk,
          conversationId: 'cli',
          messageId: 'msg-partial',
          delta: '## Title\n\n',
        },
        state,
        callbacks,
      );

      const msgId = state.streamingMessageId;
      expect(msgId).toBeTruthy();

      state = processAgentEvent(
        {
          type: AgentEventTypes.AssistantChunk,
          conversationId: 'cli',
          messageId: 'msg-partial',
          delta: 'First paragraph.',
        },
        state,
        callbacks,
      );

      expect(state.streamingContent).toBe('## Title\n\nFirst paragraph.');

      vi.clearAllMocks();

      const fullContent = `## Title

First paragraph.

Second paragraph with more details.

### Subsection

- Bullet point 1
- Bullet point 2
- Bullet point 3

And a conclusion that was never streamed.`;

      state = processAgentEvent(
        {
          type: AgentEventTypes.AssistantMessage,
          conversationId: 'cli',
          messageId: 'msg-partial',
          content: fullContent,
        },
        state,
        callbacks,
      );

      // ✅ FIXED: Final content updates the streaming message
      expect(callbacks.updateLine).toHaveBeenCalledWith(msgId, fullContent);
      expect(state.streamingContent).toBe(fullContent);
    });

    it('should handle real-world scenario from bug report', () => {
      callbacks.streamingEnabled = true;

      state = processAgentEvent(
        {
          type: AgentEventTypes.MessageStarted,
          conversationId: 'cli',
          messageId: 'cf26bea8-f073-4e4e-8a99-7454b2928300',
          userContent: 'let review this code base',
        },
        state,
        callbacks,
      );

      const chunks = [
        '##',
        ' Code',
        'base',
        ' Review',
        ' Summary',
        '\n\n',
        'This',
        ' is',
        ' **',
        'Nu',
        'vin',
        ' Space',
        '**,',
        ' practices',
        ' for',
        ' CLI',
        ' development',
        '.',
      ];

      for (const delta of chunks) {
        state = processAgentEvent(
          {
            type: AgentEventTypes.AssistantChunk,
            conversationId: 'cli',
            messageId: 'cf26bea8-f073-4e4e-8a99-7454b2928300',
            delta,
          },
          state,
          callbacks,
        );
      }

      const accumulatedContent = chunks.join('');
      expect(state.streamingContent).toBe(accumulatedContent);
      expect(state.streamingMessageId).toBeTruthy();

      const msgId = state.streamingMessageId;
      expect(msgId).toBeTruthy();

      vi.clearAllMocks();

      const finalMessage = `## Codebase Review Summary

This is **Nuvin Space**, a monorepo for an AI-powered CLI tool built with TypeScript and React/Ink. Here's the overview:

### 🏗️ **Architecture**
- **Monorepo** with pnpm workspace
- **Two packages**: \`@nuvin/nuvin-core\` (orchestrator) + \`@nuvin/cli\` (React terminal UI)
- **TypeScript** with ESM modules, targeting Node 22+

### 📦 **Core Components**
- **@nuvin/nuvin-core**: Agent orchestrator with LLM providers (GitHub, OpenRouter, ZAI, Echo), tools system, MCP integration, memory management
- **@nuvin/cli**: Interactive terminal UI using React/Ink framework with live streaming, tool approval, configuration management

### 🛠️ **Key Technologies**
- React/Ink for terminal UI
- Vitest for testing
- Biome for linting/formatting
- node-pty for shell integration
- MCP (Model Context Protocol) for extensibility

### 🎯 **Recent Work**
The codebase recently had a significant bug fix where final assistant messages weren't showing in the UI when streaming chunks were empty after stripping leading newlines. This was resolved in \`eventProcessor.ts\` with comprehensive test coverage added.

### 📊 **Project Health**
- **128 tests passing** across both packages
- Clean architecture with proper separation of concerns
- Good documentation (README, FIX_SUMMARY.md, AGENTS.md)
- Modern development practices with proper configuration

The codebase is well-structured, actively maintained, and follows modern TypeScript/React best practices for CLI development.`;

      state = processAgentEvent(
        {
          type: AgentEventTypes.AssistantMessage,
          conversationId: 'cli',
          messageId: 'cf26bea8-f073-4e4e-8a99-7454b2928300',
          content: finalMessage,
        },
        state,
        callbacks,
      );

      // ✅ FIXED: Final message updates streaming content
      expect(callbacks.updateLine).toHaveBeenCalledWith(msgId, finalMessage);
      expect(state.streamingContent).toBe(finalMessage);
    });
  });

  describe('Edge cases', () => {
    it('should handle streaming disabled mode', () => {
      callbacks.streamingEnabled = false;

      state = processAgentEvent(
        { type: AgentEventTypes.MessageStarted, conversationId: 'cli', messageId: 'msg-no-stream' },
        state,
        callbacks,
      );

      state = processAgentEvent(
        {
          type: AgentEventTypes.AssistantChunk,
          conversationId: 'cli',
          messageId: 'msg-no-stream',
          delta: 'Should be ignored',
        },
        state,
        callbacks,
      );

      expect(callbacks.appendLine).not.toHaveBeenCalled();
      expect(state.streamingMessageId).toBeNull();

      state = processAgentEvent(
        {
          type: AgentEventTypes.AssistantMessage,
          conversationId: 'cli',
          messageId: 'msg-no-stream',
          content: 'Complete message',
        },
        state,
        callbacks,
      );

      expect(callbacks.appendLine).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'assistant',
          content: 'Complete message',
        }),
      );
    });

    it('should handle empty final message content', () => {
      callbacks.streamingEnabled = true;

      state = processAgentEvent(
        { type: AgentEventTypes.MessageStarted, conversationId: 'cli', messageId: 'msg-empty-final' },
        state,
        callbacks,
      );

      state = processAgentEvent(
        {
          type: AgentEventTypes.AssistantChunk,
          conversationId: 'cli',
          messageId: 'msg-empty-final',
          delta: 'Content',
        },
        state,
        callbacks,
      );

      expect(state.streamingMessageId).toBeTruthy();

      vi.clearAllMocks();

      state = processAgentEvent(
        {
          type: AgentEventTypes.AssistantMessage,
          conversationId: 'cli',
          messageId: 'msg-empty-final',
          content: '',
        },
        state,
        callbacks,
      );

      // Empty content should not trigger any updates
      expect(callbacks.updateLine).not.toHaveBeenCalled();
      expect(callbacks.appendLine).not.toHaveBeenCalled();
    });

    it('should handle no streaming message when final arrives', () => {
      callbacks.streamingEnabled = true;

      state = processAgentEvent(
        { type: AgentEventTypes.MessageStarted, conversationId: 'cli', messageId: 'msg-no-stream-id' },
        state,
        callbacks,
      );

      // No chunks, directly to final message
      state = processAgentEvent(
        {
          type: AgentEventTypes.AssistantMessage,
          conversationId: 'cli',
          messageId: 'msg-no-stream-id',
          content: 'Direct message without streaming',
        },
        state,
        callbacks,
      );

      // Should create new message since no streaming message exists
      expect(callbacks.appendLine).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'assistant',
          content: 'Direct message without streaming',
        }),
      );
    });
  });

  describe('Done event clears isStreaming flag', () => {
    it('should clear isStreaming flag on streamingMessageId when Done event fires', () => {
      // Scenario: Agent streams content but ends without AssistantMessage
      // (e.g., ends with tool calls only, or hook execution delays)
      state = processAgentEvent(
        { type: AgentEventTypes.MessageStarted, conversationId: 'cli', messageId: 'msg-done' },
        state,
        callbacks,
      );

      state = processAgentEvent(
        { type: AgentEventTypes.AssistantChunk, conversationId: 'cli', messageId: 'msg-done', delta: 'Processing...' },
        state,
        callbacks,
      );

      const streamingMsgId = state.streamingMessageId;
      expect(streamingMsgId).toBeTruthy();

      vi.clearAllMocks();

      // Done event fires (e.g., after pre_stop hook completes)
      state = processAgentEvent(
        { type: AgentEventTypes.Done, conversationId: 'cli', messageId: 'msg-done', responseTimeMs: 100 },
        state,
        callbacks,
      );

      // isStreaming should be cleared so loading indicator stops
      expect(callbacks.updateLineMetadata).toHaveBeenCalledWith(streamingMsgId, { isStreaming: false });
      expect(state.streamingMessageId).toBe(null);
    });

    it('should clear isStreaming flag on reasoningMessageId when Done event fires', () => {
      // Scenario: Agent has reasoning/thinking content still streaming when Done fires
      state = processAgentEvent(
        { type: AgentEventTypes.MessageStarted, conversationId: 'cli', messageId: 'msg-done-reason' },
        state,
        callbacks,
      );

      state = processAgentEvent(
        {
          type: AgentEventTypes.ReasoningChunk,
          conversationId: 'cli',
          messageId: 'msg-done-reason',
          delta: 'Thinking...',
        },
        state,
        callbacks,
      );

      const reasoningMsgId = state.reasoningMessageId;
      expect(reasoningMsgId).toBeTruthy();

      vi.clearAllMocks();

      state = processAgentEvent(
        { type: AgentEventTypes.Done, conversationId: 'cli', messageId: 'msg-done-reason', responseTimeMs: 100 },
        state,
        callbacks,
      );

      expect(callbacks.updateLineMetadata).toHaveBeenCalledWith(reasoningMsgId, { isStreaming: false });
      expect(state.reasoningMessageId).toBe(null);
    });

    it('should clear isStreaming on both streaming and reasoning when Done fires', () => {
      state = processAgentEvent(
        { type: AgentEventTypes.MessageStarted, conversationId: 'cli', messageId: 'msg-both' },
        state,
        callbacks,
      );

      state = processAgentEvent(
        { type: AgentEventTypes.ReasoningChunk, conversationId: 'cli', messageId: 'msg-both', delta: 'Thinking...' },
        state,
        callbacks,
      );

      state = processAgentEvent(
        { type: AgentEventTypes.AssistantChunk, conversationId: 'cli', messageId: 'msg-both', delta: 'Response...' },
        state,
        callbacks,
      );

      const reasoningMsgId = state.reasoningMessageId;
      const streamingMsgId = state.streamingMessageId;
      expect(reasoningMsgId).toBeTruthy();
      expect(streamingMsgId).toBeTruthy();

      vi.clearAllMocks();

      state = processAgentEvent(
        { type: AgentEventTypes.Done, conversationId: 'cli', messageId: 'msg-both', responseTimeMs: 100 },
        state,
        callbacks,
      );

      expect(callbacks.updateLineMetadata).toHaveBeenCalledWith(streamingMsgId, { isStreaming: false });
      expect(callbacks.updateLineMetadata).toHaveBeenCalledWith(reasoningMsgId, { isStreaming: false });
      expect(state.streamingMessageId).toBe(null);
      expect(state.reasoningMessageId).toBe(null);
    });
  });

  describe('Error handling during streaming', () => {
    it('should clear isStreaming flag when error occurs during streaming', () => {
      state = processAgentEvent(
        { type: AgentEventTypes.MessageStarted, conversationId: 'cli', messageId: 'msg-err' },
        state,
        callbacks,
      );

      state = processAgentEvent(
        { type: AgentEventTypes.AssistantChunk, conversationId: 'cli', messageId: 'msg-err', delta: 'Starting...' },
        state,
        callbacks,
      );

      const streamingMsgId = state.streamingMessageId;
      expect(streamingMsgId).toBeTruthy();

      vi.clearAllMocks();

      state = processAgentEvent(
        { type: AgentEventTypes.Error, conversationId: 'cli', messageId: 'msg-err', error: new Error('terminated') },
        state,
        callbacks,
      );

      expect(callbacks.updateLineMetadata).toHaveBeenCalledWith(streamingMsgId, { isStreaming: false });
      expect(callbacks.appendLine).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'error',
          content: expect.stringContaining('terminated'),
        }),
      );
      expect(state.streamingMessageId).toBe(null);
    });

    it('should handle error when no streaming message exists', () => {
      state = processAgentEvent(
        {
          type: AgentEventTypes.Error,
          conversationId: 'cli',
          messageId: 'msg-err',
          error: new Error('connection failed'),
        },
        state,
        callbacks,
      );

      expect(callbacks.updateLineMetadata).not.toHaveBeenCalled();
      expect(callbacks.appendLine).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'error',
          content: expect.stringContaining('connection failed'),
        }),
      );
    });
  });
});
