import * as crypto from 'node:crypto';
import { AgentEventTypes, type AgentEvent, type ToolCall } from '@nuvin/nuvin-core';
import type { MessageLine, MessageMetadata, LineMetadata } from '@/adapters/index.js';
import { renderToolCall, flattenError } from './messageProcessor.js';
import { enrichToolCallsWithLineNumbers } from './enrichToolCalls.js';

const now = () => new Date().toISOString();

export interface EventProcessorCallbacks {
  appendLine: (line: MessageLine) => void;
  updateLine?: (id: string, content: string) => void;
  updateLineMetadata?: (id: string, metadata: Partial<LineMetadata>) => void;
  setLastMetadata?: (metadata: MessageMetadata | null) => void;
  onToolApprovalRequired?: (event: {
    toolCalls: ToolCall[];
    approvalId: string;
    conversationId: string;
    messageId: string;
  }) => void;
  renderUserMessages?: boolean;
  streamingEnabled?: boolean;
}

export type SubAgentState = {
  agentId: string;
  agentName: string;
  status: 'starting' | 'running' | 'completed';
  toolCalls: Array<{
    id: string;
    name: string;
    arguments?: string; // JSON string of tool call arguments
    durationMs?: number;
    status?: 'success' | 'error';
  }>;
  resultMessage?: string;
  totalDurationMs?: number;
  finalStatus?: 'success' | 'error' | 'timeout';
  // Track which tool call message this state belongs to
  toolCallMessageId?: string;
  // Track which specific tool call (assign_task) triggered this agent
  toolCallId?: string;
};

export type EventProcessorState = {
  toolCallCount: number;
  metadata: MessageMetadata | null;
  recentToolCalls: Map<string, ToolCall>;
  streamingMessageId: string | null;
  streamingContent: string;
  subAgents: Map<string, SubAgentState>;
  lastToolCallMessageId: string | null; // Track most recent tool call message
  agentToMessageMap: Map<string, string>; // Map agent ID to tool call message ID
  toolCallToMessageMap: Map<string, string>; // Map tool call ID to message ID
};

export const initialEventProcessorState: EventProcessorState = {
  toolCallCount: 0,
  metadata: null,
  recentToolCalls: new Map(),
  streamingMessageId: null,
  streamingContent: '',
  subAgents: new Map(),
  lastToolCallMessageId: null,
  agentToMessageMap: new Map(),
  toolCallToMessageMap: new Map(),
};

export const resetEventProcessorState = (): EventProcessorState => ({
  ...initialEventProcessorState,
  recentToolCalls: new Map(),
  subAgents: new Map(),
  lastToolCallMessageId: null,
  agentToMessageMap: new Map(),
  toolCallToMessageMap: new Map(),
});

export function processAgentEvent(
  event: AgentEvent,
  state: EventProcessorState,
  callbacks: EventProcessorCallbacks,
): EventProcessorState | Promise<EventProcessorState> {
  switch (event.type) {
    case AgentEventTypes.MessageStarted: {
      if ('userContent' in event && callbacks.renderUserMessages && event.userContent) {
        callbacks.appendLine({
          id: crypto.randomUUID(),
          type: 'user',
          content: `${event.userContent}`,
          metadata: { timestamp: now() },
          color: 'cyan',
        });
      }
      return {
        toolCallCount: 0,
        metadata: null,
        recentToolCalls: state.recentToolCalls,
        streamingMessageId: null,
        streamingContent: '',
        subAgents: state.subAgents,
        lastToolCallMessageId: state.lastToolCallMessageId,
        agentToMessageMap: state.agentToMessageMap,
        toolCallToMessageMap: state.toolCallToMessageMap,
      };
    }

    case AgentEventTypes.ToolCalls: {
      return (async () => {
        const messageId = crypto.randomUUID();
        const enrichedToolCalls = await enrichToolCallsWithLineNumbers(event.toolCalls);

        callbacks.appendLine({
          id: messageId,
          type: 'tool',
          content: `${enrichedToolCalls.map(renderToolCall).join(', ')}`,
          metadata: {
            toolCallCount: enrichedToolCalls.length,
            timestamp: now(),
            toolCalls: enrichedToolCalls,
          },
          color: 'blue',
        });

        // Store tool calls by ID for later correlation with results
        const newToolCalls = new Map(state.recentToolCalls);
        const newToolCallToMessageMap = new Map(state.toolCallToMessageMap);
        for (const call of enrichedToolCalls) {
          newToolCalls.set(call.id, call);
          newToolCallToMessageMap.set(call.id, messageId); // Map tool call ID to message ID
        }

        return {
          ...state,
          toolCallCount: state.toolCallCount + enrichedToolCalls.length,
          recentToolCalls: newToolCalls,
          streamingMessageId: null,
          streamingContent: '',
          lastToolCallMessageId: messageId,
          toolCallToMessageMap: newToolCallToMessageMap,
        };
      })();
    }

    case AgentEventTypes.ToolResult: {
      const tool = event.result;
      const isAborted =
        tool.status === 'error' &&
        typeof tool.result === 'string' &&
        tool.result.toLowerCase().includes('aborted by user');

      const statusIcon = tool.status === 'success' ? '[+]' : isAborted ? '[⊗]' : '[!]';

      const statusText = isAborted ? 'aborted' : tool.status;

      const durationText =
        typeof tool.durationMs === 'number' && Number.isFinite(tool.durationMs) ? ` (${tool.durationMs}ms)` : '';

      const content =
        tool.status === 'success'
          ? `${tool.name}: ${statusIcon} ${statusText}${durationText}`
          : isAborted
            ? `${tool.name}: ${statusIcon} ${statusText}${durationText}`
            : `error: ${flattenError(tool).slice(0, 1000)}`;

      const color = tool.status === 'success' ? 'green' : isAborted ? 'yellow' : 'red';

      const toolCall = state.recentToolCalls.get(tool.id);

      callbacks.appendLine({
        id: crypto.randomUUID(),
        type: 'tool_result',
        content,
        metadata: {
          toolName: tool.name,
          status: tool.status,
          duration: tool.durationMs,
          timestamp: now(),
          toolResult: tool,
          toolCall: toolCall,
        },
        color,
      });

      return state;
    }

    case AgentEventTypes.AssistantChunk: {
      // Check if streaming is enabled
      if (!callbacks.streamingEnabled) {
        // In the simplified flow we ignore streaming deltas and wait for the final assistant message.
        return state;
      }

      const chunk = event.delta || '';

      // First chunk: create a new assistant message
      if (!state.streamingMessageId) {
        const messageId = crypto.randomUUID();
        callbacks.appendLine({
          id: messageId,
          type: 'assistant',
          content: chunk,
          metadata: { timestamp: now(), isStreaming: true },
        });

        return {
          ...state,
          streamingMessageId: messageId,
          streamingContent: chunk,
        };
      }

      // Subsequent chunks: update the existing message
      const newContent = state.streamingContent + chunk;
      callbacks.updateLine?.(state.streamingMessageId, newContent);

      return {
        ...state,
        streamingContent: newContent,
      };
    }

    case AgentEventTypes.AssistantMessage: {
      if (!event.content) {
        return state;
      }

      // Handle usage/cost for non-streaming mode
      if (!callbacks.streamingEnabled && event.usage) {
        const metadata: MessageMetadata = {
          promptTokens: event.usage.prompt_tokens,
          completionTokens: event.usage.completion_tokens,
          totalTokens: event.usage.total_tokens,
          toolCalls: state.toolCallCount,
          estimatedCost: null,
          cost: event.usage.cost,
          cachedTokens: event.usage.prompt_tokens_details?.cached_tokens,
        };
        callbacks.setLastMetadata?.(metadata);
      }

      // If streaming is enabled and we have a streaming message, update it with final content
      if (callbacks.streamingEnabled && state.streamingMessageId) {
        // Only update if content differs (optimization to avoid unnecessary re-renders)
        if (state.streamingContent !== event.content) {
          callbacks.updateLine?.(state.streamingMessageId, event.content);
        }
        // Mark streaming as complete
        callbacks.updateLineMetadata?.(state.streamingMessageId, { isStreaming: false });
        // Reset streaming state after finalizing the message
        return {
          ...state,
          streamingContent: event.content,
          streamingMessageId: null,
        };
      }

      // No streaming or no streaming message exists, create a new one
      callbacks.appendLine({
        id: crypto.randomUUID(),
        type: 'assistant',
        content: event.content,
        metadata: { timestamp: now() },
      });

      return state;
    }

    case AgentEventTypes.StreamFinish: {
      const usage = event.usage;
      if (usage) {
        const metadata: MessageMetadata = {
          promptTokens: usage.prompt_tokens,
          completionTokens: usage.completion_tokens,
          totalTokens: usage.total_tokens,
          toolCalls: state.toolCallCount,
          estimatedCost: null,
          cost: usage.cost,
          cachedTokens: usage.prompt_tokens_details?.cached_tokens,
        };

        callbacks.setLastMetadata?.(metadata);
        return {
          ...state,
          metadata,
        };
      }
      return state;
    }

    case AgentEventTypes.Done: {
      const usage = event.usage;
      if (usage) {
        const metadata: MessageMetadata = {
          promptTokens: usage.prompt_tokens,
          completionTokens: usage.completion_tokens,
          totalTokens: usage.total_tokens,
          toolCalls: state.toolCallCount,
          estimatedCost: null,
          cost: callbacks.streamingEnabled ? undefined : usage.cost,
          cachedTokens: usage.prompt_tokens_details?.cached_tokens,
        };

        callbacks.setLastMetadata?.(metadata);
        return {
          ...state,
          metadata,
        };
      }
      return state;
    }

    case AgentEventTypes.Error: {
      callbacks.appendLine({
        id: crypto.randomUUID(),
        type: 'error',
        content: `error: ${flattenError(event.error)}`,
        metadata: { timestamp: now() },
        color: 'red',
      });
      return state;
    }

    case AgentEventTypes.ToolApprovalRequired: {
      callbacks.onToolApprovalRequired?.({
        toolCalls: event.toolCalls,
        approvalId: event.approvalId,
        conversationId: event.conversationId,
        messageId: event.messageId,
      });
      return state;
    }

    case AgentEventTypes.SubAgentStarted: {
      // Find the message that contains this tool call
      const toolCallMessageId = state.toolCallToMessageMap.get(event.toolCallId);

      if (!toolCallMessageId) {
        // No tool call message to attach to, skip
        console.warn(`SubAgentStarted: Could not find message for toolCallId ${event.toolCallId}`);
        return state;
      }

      // Create initial sub-agent state
      const subAgentState: SubAgentState = {
        agentId: event.agentId,
        agentName: event.agentName,
        status: 'starting',
        toolCalls: [],
        toolCallMessageId,
      };

      // Store in state map (keyed by agentId for easy lookup)
      const subAgents = new Map(state.subAgents);
      subAgents.set(event.agentId, subAgentState);

      // Map agent ID to message ID and store the toolCallId for this agent
      const agentToMessageMap = new Map(state.agentToMessageMap);
      agentToMessageMap.set(event.agentId, toolCallMessageId);

      // Store the toolCallId in the subAgentState for later use
      subAgentState.toolCallId = event.toolCallId;

      // We'll use a helper to update the subAgentStates map in the message metadata
      // For now, just emit an update - the metadata spread will handle it
      callbacks.updateLineMetadata?.(toolCallMessageId, {
        [`subAgentState_${event.toolCallId}`]: subAgentState,
      });

      return { ...state, subAgents, agentToMessageMap };
    }

    case AgentEventTypes.SubAgentToolCall: {
      const subAgent = state.subAgents.get(event.agentId);
      if (!subAgent) return state;

      // Update status to running and add tool call
      subAgent.status = 'running';
      subAgent.toolCalls.push({
        id: event.toolCallId,
        name: event.toolName,
        arguments: event.toolArguments,
      });

      // Update the tool call message metadata using the dynamic key
      if (subAgent.toolCallMessageId && subAgent.toolCallId) {
        callbacks.updateLineMetadata?.(subAgent.toolCallMessageId, {
          [`subAgentState_${subAgent.toolCallId}`]: subAgent,
        });
      }

      return state;
    }

    case AgentEventTypes.SubAgentToolResult: {
      const subAgent = state.subAgents.get(event.agentId);
      if (!subAgent) return state;

      // Find and update the tool call with duration and status
      const toolCall = subAgent.toolCalls.find((tc) => tc.id === event.toolCallId);
      if (toolCall) {
        toolCall.durationMs = event.durationMs;
        toolCall.status = event.status;
      }

      // Update the tool call message metadata using the dynamic key
      if (subAgent.toolCallMessageId && subAgent.toolCallId) {
        callbacks.updateLineMetadata?.(subAgent.toolCallMessageId, {
          [`subAgentState_${subAgent.toolCallId}`]: subAgent,
        });
      }

      return state;
    }

    case AgentEventTypes.SubAgentCompleted: {
      const subAgent = state.subAgents.get(event.agentId);
      if (!subAgent) return state;

      // Update sub-agent state with final results
      subAgent.status = 'completed';
      subAgent.finalStatus = event.status;
      subAgent.resultMessage = event.resultMessage;
      subAgent.totalDurationMs = event.totalDurationMs;

      // Update the tool call message metadata using the dynamic key
      if (subAgent.toolCallMessageId && subAgent.toolCallId) {
        callbacks.updateLineMetadata?.(subAgent.toolCallMessageId, {
          [`subAgentState_${subAgent.toolCallId}`]: subAgent,
        });
      }

      return state;
    }

    default:
      return state;
  }
}
