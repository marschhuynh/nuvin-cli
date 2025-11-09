import {
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
  timestamp?: string;
  toolName?: string;
  status?: 'success' | 'error';
  duration?: number;
  toolCallCount?: number;
  toolCalls?: ToolCall[];
  toolResult?: ToolExecutionResult;
  toolCall?: ToolCall;
  toolResultsByCallId?: Map<string, MessageLine>;
  isStreaming?: boolean;
  subAgentState?: SubAgentState;
} & Partial<Record<`subAgentState_${string}`, SubAgentState>>;

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

  constructor(
    private appendLine: (line: MessageLine) => void,
    private updateLine: (id: string, content: string) => void,
    private updateLineMetadata: (id: string, metadata: Partial<LineMetadata>) => void,
    private setLastMetadata: (metadata: MessageMetadata) => void,
    opts?: { filename?: string; streamingEnabled?: boolean },
  ) {
    super(opts?.filename ? { filename: opts.filename } : { memory: new InMemoryMemory<AgentEvent>() });
    this.streamingEnabled = opts?.streamingEnabled ?? false;
  }

  async emit(event: AgentEvent): Promise<void> {
    super.emit(event);

    const callbacks: EventProcessorCallbacks = {
      appendLine: this.appendLine,
      updateLine: this.updateLine,
      updateLineMetadata: this.updateLineMetadata,
      setLastMetadata: this.setLastMetadata,
      streamingEnabled: this.streamingEnabled,
      onToolApprovalRequired: (event) => {
        eventBus.emit('ui:toolApprovalRequired', event);
      },
    };

    const result = processAgentEvent(event, this.state, callbacks);
    if (result instanceof Promise) {
      this.state = await result;
    } else {
      this.state = result;
    }
  }

  setStreamingEnabled(enabled: boolean) {
    this.streamingEnabled = enabled;
  }
}
