import * as crypto from 'node:crypto';
import * as path from 'node:path';
import { AgentEventTypes, ErrorReason, type AgentEvent, type ToolCall, type SubAgentState } from '@nuvin/nuvin-core';
import type { MessageLine, LineMetadata } from '@/adapters/index.js';
import { renderToolCall, flattenError } from './messageProcessor.js';
import { enrichToolCallsWithLineNumbers } from './enrichToolCalls.js';
import { theme } from '@/theme.js';
import { LSP } from '@/services/lsp/index.js';

const now = () => new Date().toISOString();

export interface EventProcessorCallbacks {
  appendLine: (line: MessageLine) => void;
  updateLine?: (id: string, content: string) => void;
  updateLineMetadata?: (id: string, metadata: Partial<LineMetadata>) => void;
  onToolCalls?: (event: { toolCalls: ToolCall[] }) => void;
  renderUserMessages?: boolean;
  streamingEnabled?: boolean;
}

export type { SubAgentState };

export type EventProcessorState = {
  toolCallCount: number;
  recentToolCalls: Map<string, ToolCall>;
  streamingMessageId: string | null;
  streamingContent: string;
  reasoningMessageId: string | null;
  reasoningContent: string;
  subAgents: Map<string, SubAgentState>;
  lastToolCallMessageId: string | null; // Track most recent tool call message
  agentToMessageMap: Map<string, string>; // Map agent ID to tool call message ID
  toolCallToMessageMap: Map<string, string>; // Map tool call ID to message ID
};

export const initialEventProcessorState: EventProcessorState = {
  toolCallCount: 0,
  recentToolCalls: new Map(),
  streamingMessageId: null,
  streamingContent: '',
  reasoningMessageId: null,
  reasoningContent: '',
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
  reasoningMessageId: null,
  reasoningContent: '',
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
          color: theme.tokens.cyan,
        });
      }
      return {
        toolCallCount: 0,
        recentToolCalls: state.recentToolCalls,
        streamingMessageId: null,
        streamingContent: '',
        reasoningMessageId: null,
        reasoningContent: '',
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

        const displayableToolCalls = enrichedToolCalls.filter((tc) => tc.function.name !== 'ask_user_tool');

        if (displayableToolCalls.length > 0) {
          callbacks.appendLine({
            id: messageId,
            type: 'tool',
            content: `${displayableToolCalls.map(renderToolCall).join(', ')}`,
            metadata: {
              toolCallCount: displayableToolCalls.length,
              timestamp: now(),
              toolCalls: displayableToolCalls,
            },
            color: theme.tokens.blue,
          });
        }

        // Emit event for ToolApprovalContext to handle per-tool approvals
        // Note: enrichedToolCalls may have requiresApproval and approvalId from orchestrator
        callbacks.onToolCalls?.({ toolCalls: enrichedToolCalls });

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
      const errorReason = tool.status === 'error' ? tool.metadata?.errorReason : undefined;

      if (tool.status === 'success' && (tool.name === 'file_edit' || tool.name === 'file_new')) {
        const filePath =
          tool.name === 'file_edit'
            ? tool.metadata?.path
            : tool.name === 'file_new'
              ? tool.metadata?.file_path
              : undefined;
        if (typeof filePath === 'string' && LSP.isEnabled()) {
          const resolvedPath = path.resolve(process.cwd(), filePath);
          void LSP.diagnosticsForFile(resolvedPath);
        }
      }

      // Use metadata to determine tool execution state
      const isAborted = errorReason === ErrorReason.Aborted;
      const isDenied = errorReason === ErrorReason.Denied;
      const isTimeout = errorReason === ErrorReason.Timeout;
      const isWarning = isAborted || isDenied || isTimeout || errorReason === ErrorReason.RateLimit;

      const statusIcon = tool.status === 'success' ? '[+]' : isWarning ? '[⊗]' : '[!]';

      // Map error reasons to readable status text
      const statusText = errorReason || tool.status;

      const durationText =
        typeof tool.durationMs === 'number' && Number.isFinite(tool.durationMs) ? ` (${tool.durationMs}ms)` : '';

      const content =
        tool.status === 'success'
          ? `${tool.name}: ${statusIcon} ${statusText}${durationText}`
          : isWarning
            ? `${tool.name}: ${statusIcon} ${statusText}${durationText}`
            : `error: ${flattenError(tool).slice(0, 1000)}`;

      const color = tool.status === 'success' ? theme.tokens.green : isWarning ? theme.tokens.yellow : theme.tokens.red;

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

    case AgentEventTypes.ReasoningChunk: {
      if (!callbacks.streamingEnabled) {
        return state;
      }

      const chunk = event.delta || '';

      if (!state.reasoningMessageId) {
        const messageId = crypto.randomUUID();
        callbacks.appendLine({
          id: messageId,
          type: 'thinking',
          content: chunk,
          metadata: { timestamp: now(), isStreaming: true },
          color: theme.tokens.yellow,
        });

        return {
          ...state,
          reasoningMessageId: messageId,
          reasoningContent: chunk,
        };
      }

      const newContent = state.reasoningContent + chunk;
      callbacks.updateLine?.(state.reasoningMessageId, newContent);

      return {
        ...state,
        reasoningContent: newContent,
      };
    }

    case AgentEventTypes.AssistantChunk: {
      if (!callbacks.streamingEnabled) {
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

      if (state.reasoningMessageId) {
        callbacks.updateLineMetadata?.(state.reasoningMessageId, { isStreaming: false });
      }

      if (callbacks.streamingEnabled && state.streamingMessageId) {
        callbacks.updateLine?.(state.streamingMessageId, event.content);
        callbacks.updateLineMetadata?.(state.streamingMessageId, { isStreaming: false });
        return {
          ...state,
          streamingContent: event.content,
          streamingMessageId: null,
          reasoningMessageId: null,
        };
      }

      callbacks.appendLine({
        id: crypto.randomUUID(),
        type: 'assistant',
        content: event.content,
        metadata: { timestamp: now(), isStreaming: false },
      });

      return {
        ...state,
        reasoningMessageId: null,
      };
    }

    case AgentEventTypes.StreamFinish: {
      if (state.reasoningMessageId) {
        callbacks.updateLineMetadata?.(state.reasoningMessageId, { isStreaming: false });
      }
      return {
        ...state,
        reasoningMessageId: null,
        reasoningContent: '',
      };
    }

    case AgentEventTypes.Done: {
      return state;
    }

    case AgentEventTypes.Error: {
      if (state.streamingMessageId) {
        callbacks.updateLineMetadata?.(state.streamingMessageId, { isStreaming: false });
      }
      if (state.reasoningMessageId) {
        callbacks.updateLineMetadata?.(state.reasoningMessageId, { isStreaming: false });
      }
      callbacks.appendLine({
        id: crypto.randomUUID(),
        type: 'error',
        content: `error: ${flattenError(event.error)}`,
        metadata: { timestamp: now() },
        color: theme.tokens.red,
      });
      return {
        ...state,
        streamingMessageId: null,
        reasoningMessageId: null,
      };
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

      // Create new sub-agent state with updated tool calls (immutable update)
      const updatedSubAgent = {
        ...subAgent,
        status: 'running' as const,
        toolCalls: [
          ...subAgent.toolCalls,
          {
            id: event.toolCallId,
            name: event.toolName,
            arguments: event.toolArguments,
          },
        ],
      };

      // Update state map with new object
      const newSubAgents = new Map(state.subAgents);
      newSubAgents.set(event.agentId, updatedSubAgent);

      // Update the tool call message metadata using the dynamic key
      if (updatedSubAgent.toolCallMessageId && updatedSubAgent.toolCallId) {
        callbacks.updateLineMetadata?.(updatedSubAgent.toolCallMessageId, {
          [`subAgentState_${updatedSubAgent.toolCallId}`]: updatedSubAgent,
        });
      }

      return { ...state, subAgents: newSubAgents };
    }

    case AgentEventTypes.SubAgentToolResult: {
      const subAgent = state.subAgents.get(event.agentId);
      if (!subAgent) return state;

      // Create new tool calls array with updated tool call (immutable update)
      const updatedToolCalls = subAgent.toolCalls.map((tc) =>
        tc.id === event.toolCallId
          ? { ...tc, durationMs: event.durationMs, status: event.status }
          : tc
      );

      const updatedSubAgent = {
        ...subAgent,
        toolCalls: updatedToolCalls,
      };

      // Update state map with new object
      const newSubAgents = new Map(state.subAgents);
      newSubAgents.set(event.agentId, updatedSubAgent);

      // Update the tool call message metadata using the dynamic key
      if (updatedSubAgent.toolCallMessageId && updatedSubAgent.toolCallId) {
        callbacks.updateLineMetadata?.(updatedSubAgent.toolCallMessageId, {
          [`subAgentState_${updatedSubAgent.toolCallId}`]: updatedSubAgent,
        });
      }

      return { ...state, subAgents: newSubAgents };
    }

    case AgentEventTypes.SubAgentCompleted: {
      const subAgent = state.subAgents.get(event.agentId);
      if (!subAgent) return state;

      // Create new sub-agent state with final results (immutable update)
      const updatedSubAgent = {
        ...subAgent,
        status: 'completed' as const,
        finalStatus: event.status,
        resultMessage: event.resultMessage,
        totalDurationMs: event.totalDurationMs,
      };

      // Update state map with new object
      const newSubAgents = new Map(state.subAgents);
      newSubAgents.set(event.agentId, updatedSubAgent);

      // Update the tool call message metadata using the dynamic key
      if (updatedSubAgent.toolCallMessageId && updatedSubAgent.toolCallId) {
        callbacks.updateLineMetadata?.(updatedSubAgent.toolCallMessageId, {
          [`subAgentState_${updatedSubAgent.toolCallId}`]: updatedSubAgent,
        });
      }

      return { ...state, subAgents: newSubAgents };
    }

    case AgentEventTypes.SubAgentMetrics: {
      const subAgent = state.subAgents.get(event.agentId);
      if (!subAgent) return state;

      // Create new sub-agent state with metrics (immutable update)
      const updatedSubAgent = {
        ...subAgent,
        metrics: event.metrics,
      };

      // Update state map with new object
      const newSubAgents = new Map(state.subAgents);
      newSubAgents.set(event.agentId, updatedSubAgent);

      // Update the tool call message metadata using the dynamic key
      if (updatedSubAgent.toolCallMessageId && updatedSubAgent.toolCallId) {
        callbacks.updateLineMetadata?.(updatedSubAgent.toolCallMessageId, {
          [`subAgentState_${updatedSubAgent.toolCallId}`]: updatedSubAgent,
        });
      }

      return { ...state, subAgents: newSubAgents };
    }

    default:
      return state;
  }
}
