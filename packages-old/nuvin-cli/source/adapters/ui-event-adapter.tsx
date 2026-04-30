import {
  AgentEventTypes,
  PersistingConsoleEventPort,
  InMemoryMemory,
  type AgentEvent,
  type ToolCall,
  type ToolExecutionResult,
} from '@nuvin/nuvin-core';
import {
  processAgentEvent,
  type EventProcessorCallbacks,
  type EventProcessorState,
  resetEventProcessorState,
  type SubAgentState,
} from '@/utils/eventProcessor.js';
import { eventBus } from '@/services/EventBus.js';
import type { ComputedToolState } from '@/components/ToolCallViewer/types.js';

export type MessageMetadata = {
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
  responseTime?: number;
  toolCalls?: number;
  estimatedCost?: number | null;
  cost?: number;
  cachedTokens?: number;
};

export type LineMetadata = {
  messageId?: string; // Reference to original Message.id
  timestamp?: string;
  toolName?: string;
  status?: 'success' | 'error';
  duration?: number;
  toolCallCount?: number;
  toolCalls?: ToolCall[];
  toolResult?: ToolExecutionResult;
  toolCall?: ToolCall;
  toolResultsByCallId?: Map<string, MessageLine>;
  toolStates?: Map<string, ComputedToolState>;
  isStreaming?: boolean;
  isTransient?: boolean;
  subAgentState?: SubAgentState;
} & Partial<
  Record<
    `subAgentState_${string}` | `streamingOutput_${string}` | `streamingTotalLines_${string}`,
    SubAgentState | string | number
  >
>;

export type MessageLine = {
  id: string;
  type: 'user' | 'assistant' | 'tool' | 'tool_result' | 'system' | 'error' | 'warning' | 'info' | 'thinking';
  content: string;
  metadata?: LineMetadata;
  color?: string;
};

export class UIEventAdapter extends PersistingConsoleEventPort {
  private state: EventProcessorState = resetEventProcessorState();
  private streamingEnabled: boolean;
  private readonly callbacks: EventProcessorCallbacks;

  constructor(
    private appendLine: (line: MessageLine) => void,
    private updateLine: (id: string, content: string) => void,
    private updateLineMetadata: (id: string, metadata: Partial<LineMetadata>) => void,
    opts?: { filename?: string; streamingEnabled?: boolean },
  ) {
    super(opts?.filename ? { filename: opts.filename } : { memory: new InMemoryMemory<AgentEvent>() });
    this.streamingEnabled = opts?.streamingEnabled ?? false;
    this.callbacks = {
      appendLine: this.appendLine,
      updateLine: this.updateLine,
      updateLineMetadata: this.updateLineMetadata,
      streamingEnabled: this.streamingEnabled,
      onToolCalls: (event) => {
        eventBus.emit('ui:toolCalls', event);
      },
    };
  }

  async emit(event: AgentEvent): Promise<void> {
    try {
      const shouldPersist = event.type !== AgentEventTypes.ToolOutputChunk;
      if (shouldPersist) {
        await super.emit(event);
      }
      this.state = await this.processEventSafely(event);
      if (shouldPersist) {
        eventBus.emit('agent:event', event);
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      eventBus.emit('ui:error', `[EventAdapter] Failed to process ${event.type}: ${errorMsg}`);
    }
  }

  private async processEventSafely(event: AgentEvent): Promise<EventProcessorState> {
    this.callbacks.streamingEnabled = this.streamingEnabled;
    const result = processAgentEvent(event, this.state, this.callbacks);
    return result instanceof Promise ? await result : result;
  }

  setStreamingEnabled(enabled: boolean) {
    this.streamingEnabled = enabled;
  }
}
