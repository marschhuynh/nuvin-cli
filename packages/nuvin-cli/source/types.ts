import type { ToolCall, ToolExecutionResult } from '@nuvin/nuvin-core';

export type MessageLine = {
  id: string;
  type: 'user' | 'assistant' | 'tool' | 'tool_result' | 'system' | 'error' | 'info' | 'thinking';
  content: string;
  metadata?: {
    timestamp?: string;
    toolName?: string;
    status?: 'success' | 'error';
    duration?: number;
    toolCallCount?: number;
    toolCalls?: ToolCall[];
    toolResult?: ToolExecutionResult;
  };
  color?: string;
};

export type SessionInfo = {
  sessionId: string;
  timestamp: string;
  lastMessage: string;
  messageCount: number;
  topic?: string;
};
