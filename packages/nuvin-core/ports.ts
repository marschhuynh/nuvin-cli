// Core ports and types for the agent orchestrator. Self-contained.
import type { AgentRegistry } from './agent-registry.js';

// Provider-side types
export type ToolCall = {
  id: string;
  type: 'function';
  function: {
    name: string;
    arguments: string; // JSON string per OpenAI-style schema
  };
};

export type TextContentPart = {
  type: 'text';
  text: string;
};

export type ImageContentPart = {
  type: 'image';
  mimeType: string;
  data: string;
  altText?: string;
  source?: string;
  name?: string;
};

export type MessageContentPart = TextContentPart | ImageContentPart;

export type MessageContent =
  | string
  | null
  | {
      type: 'parts';
      parts: MessageContentPart[];
    };

export type ProviderContentPart =
  | {
      type: 'text';
      text: string;
      cache_control?: {
        type: 'ephemeral';
      };
    }
  | {
      type: 'image_url';
      image_url: {
        url: string;
        detail?: 'auto' | 'low' | 'high';
      };
    };
export type ChatMessage = {
  role:
    | typeof MessageRoles.System
    | typeof MessageRoles.User
    | typeof MessageRoles.Assistant
    | typeof MessageRoles.Tool;
  content: string | null | ProviderContentPart[];
  tool_calls?: ToolCall[];
  tool_call_id?: string;
  name?: string;
};

export type CompletionParams = {
  messages: ChatMessage[];
  model: string;
  temperature: number;
  topP: number;
  maxTokens?: number;
  tools?: Array<{
    type: 'function';
    function: {
      name: string;
      description: string;
      parameters: object; // JSON Schema
    };
  }>;
  tool_choice?: 'auto' | 'none' | { type: 'function'; function: { name: string } };
  reasoning?: {
    effort: string;
  };
  usage?: {
    include?: boolean;
  };
};

export type UsageData = {
  prompt_tokens?: number;
  completion_tokens?: number;
  total_tokens?: number;
  reasoning_tokens?: number;
  prompt_tokens_details?: {
    cached_tokens?: number;
    audio_tokens?: number;
  };
  completion_tokens_details?: {
    reasoning_tokens?: number;
  };
  cost?: number;
  cost_details?: {
    upstream_inference_cost?: number;
  };
};

export type CompletionResult = {
  content: string;
  tool_calls?: ToolCall[];
  usage?: UsageData;
};

// Internal domain types
export type Message = {
  id: string;
  role: typeof MessageRoles.User | typeof MessageRoles.Assistant | typeof MessageRoles.Tool;
  content: MessageContent;
  timestamp?: string;
  // When role is 'assistant' and it invoked tools
  tool_calls?: ToolCall[];
  // When role is 'tool'
  tool_call_id?: string;
  name?: string;
  // Usage data for assistant messages
  usage?: UsageData;
};

export type MessageResponse = {
  id: string;
  content: string;
  role: typeof MessageRoles.Assistant | typeof MessageRoles.Tool;
  timestamp: string;
  metadata?: {
    model?: string;
    provider?: string;
    agentId?: string;
    promptTokens?: number;
    completionTokens?: number;
    totalTokens?: number;
    estimatedCost?: number;
    responseTime?: number;
    toolCalls?: number;
  };
};

export type SendMessageOptions = {
  conversationId?: string;
  stream?: boolean;
  signal?: AbortSignal;
  retry?: boolean;
};

export type UserAttachment = ImageContentPart & {
  token?: string;
};

export type UserMessagePayload =
  | string
  | {
      text: string;
      displayText?: string;
      attachments?: UserAttachment[];
    };

// Ports (interfaces) the orchestrator depends upon
export interface LLMPort {
  generateCompletion(params: CompletionParams, signal?: AbortSignal): Promise<CompletionResult>;
  streamCompletion?(
    params: CompletionParams,
    handlers?: {
      onChunk?: (delta: string, usage?: UsageData) => void;
      onToolCallDelta?: (tc: ToolCall) => void;
      onStreamFinish?: (finishReason?: string, usage?: UsageData) => void;
    },
    signal?: AbortSignal,
  ): Promise<CompletionResult>;
}

export type LLMConfig = {
  provider?: string;
  model?: string;
};

export interface LLMFactory {
  createLLM(config: LLMConfig): LLMPort;
}

export type ToolDefinition = {
  type: 'function';
  function: { name: string; description: string; parameters: object };
};

export type ToolInvocation = { id: string; name: string; parameters: Record<string, any> };

export type ToolExecutionResult = {
  id: string;
  name: string;
  status: 'success' | 'error';
  type: 'text' | 'json';
  result: string | object;
  metadata?: Record<string, unknown>;
  durationMs?: number;
};

export interface ToolPort {
  getToolDefinitions(enabledTools: string[]): ToolDefinition[];
  executeToolCalls(
    calls: ToolInvocation[],
    context?: Record<string, unknown>,
    maxConcurrent?: number,
    signal?: AbortSignal,
  ): Promise<ToolExecutionResult[]>;
}

export interface AgentAwareToolPort {
  setEnabledAgents(enabledAgents: Record<string, boolean>): void;
  getAgentRegistry(): AgentRegistry | undefined;
}

export interface OrchestratorAwareToolPort {
  setOrchestrator(
    config: AgentConfig,
    tools: ToolPort,
    llmFactory?: LLMFactory,
    configResolver?: () => Partial<AgentConfig>,
  ): void;
}

export type MemorySnapshot<T = unknown> = Record<string, T[]>;

export interface MemoryPersistence<T = unknown> {
  load(): Promise<MemorySnapshot<T>>;
  save(snapshot: MemorySnapshot<T>): Promise<void>;
}

export interface MemoryPort<T = unknown> {
  get(key: string): Promise<T[]>;
  set(key: string, items: T[]): Promise<void>;
  append(key: string, items: T[]): Promise<void>;
  delete(key: string): Promise<void>;
  keys(): Promise<string[]>;
  clear(): Promise<void>;
  exportSnapshot(): Promise<MemorySnapshot<T>>;
  importSnapshot(snapshot: MemorySnapshot<T>): Promise<void>;
}

export interface MetadataPort<T> {
  get(key: string): Promise<T | null>;
  set(key: string, metadata: T): Promise<void>;
  delete(key: string): Promise<void>;
  keys(): Promise<string[]>;
  clear(): Promise<void>;
  exportSnapshot(): Promise<Record<string, T>>;
  importSnapshot(snapshot: Record<string, T>): Promise<void>;
}

export interface ContextBuilder {
  toProviderMessages(history: Message[], systemPrompt: string, newUserContent: MessageContent[]): ChatMessage[];
}

export interface RemindersPort {
  enhance(content: string, opts: { conversationId?: string }): string[]; // returns 1+ strings
}

export interface IdGenerator {
  uuid(): string;
}

export interface Clock {
  now(): number; // ms
  iso(dateMs?: number): string; // ISO string
}

export interface CostCalculator {
  estimate(model: string, usage?: UsageData): number | undefined;
}

// Configuration for the orchestrator
export type AgentConfig = {
  id: string;
  systemPrompt: string;
  topP: number;
  model: string;
  temperature: number;
  maxTokens?: number;
  enabledTools?: string[]; // names
  maxToolConcurrency?: number;
  requireToolApproval?: boolean;
  reasoningEffort?: string;
};

// Eventing for orchestrator external communication
export const MessageRoles = {
  System: 'system',
  User: 'user',
  Assistant: 'assistant',
  Tool: 'tool',
} as const;

export const AgentEventTypes = {
  MessageStarted: 'message_started',
  ToolCalls: 'tool_calls',
  ToolApprovalRequired: 'tool_approval_required',
  ToolApprovalResponse: 'tool_approval_response',
  ToolResult: 'tool_result',
  AssistantChunk: 'assistant_chunk',
  AssistantMessage: 'assistant_message',
  StreamFinish: 'stream_finish',
  Done: 'done',
  Error: 'error',
  MCPStderr: 'mcp_stderr',
  SubAgentStarted: 'sub_agent_started',
  SubAgentToolCall: 'sub_agent_tool_call',
  SubAgentToolResult: 'sub_agent_tool_result',
  SubAgentCompleted: 'sub_agent_completed',
} as const;

export type ToolApprovalDecision = 'approve' | 'deny' | 'approve_all';

export type AgentEvent =
  | {
      type: typeof AgentEventTypes.MessageStarted;
      conversationId: string;
      messageId: string;
      userContent: string;
      enhanced: string[];
      toolNames: string[];
    }
  | {
      type: typeof AgentEventTypes.ToolCalls;
      conversationId: string;
      messageId: string;
      toolCalls: ToolCall[];
      usage?: UsageData;
    }
  | {
      type: typeof AgentEventTypes.ToolApprovalRequired;
      conversationId: string;
      messageId: string;
      toolCalls: ToolCall[];
      approvalId: string;
    }
  | {
      type: typeof AgentEventTypes.ToolApprovalResponse;
      conversationId: string;
      messageId: string;
      approvalId: string;
      decision: ToolApprovalDecision;
      approvedCalls?: ToolCall[];
    }
  | {
      type: typeof AgentEventTypes.ToolResult;
      conversationId: string;
      messageId: string;
      result: ToolExecutionResult;
    }
  | {
      type: typeof AgentEventTypes.AssistantChunk;
      conversationId: string;
      messageId: string;
      delta: string;
      usage?: UsageData;
    }
  | {
      type: typeof AgentEventTypes.AssistantMessage;
      conversationId: string;
      messageId: string;
      content: string | null;
      usage?: UsageData;
    }
  | {
      type: typeof AgentEventTypes.StreamFinish;
      conversationId: string;
      messageId: string;
      finishReason?: string;
      usage?: UsageData;
    }
  | {
      type: typeof AgentEventTypes.Done;
      conversationId: string;
      messageId: string;
      responseTimeMs: number;
      usage?: UsageData;
    }
  | {
      type: typeof AgentEventTypes.Error;
      conversationId: string;
      messageId?: string;
      error: string;
    }
  | {
      type: typeof AgentEventTypes.MCPStderr;
      conversationId: string;
      serverId: string;
      serverName?: string;
      data: string;
      timestamp: string;
    }
  | {
      type: typeof AgentEventTypes.SubAgentStarted;
      conversationId: string;
      messageId: string;
      agentId: string;
      agentName: string;
      toolCallId: string; // Links this agent to the specific assign_task tool call
    }
  | {
      type: typeof AgentEventTypes.SubAgentToolCall;
      conversationId: string;
      messageId: string;
      agentId: string;
      toolCallId: string;
      toolName: string;
      toolArguments?: string; // JSON string of tool call arguments
    }
  | {
      type: typeof AgentEventTypes.SubAgentToolResult;
      conversationId: string;
      messageId: string;
      agentId: string;
      toolCallId: string;
      toolName: string;
      durationMs: number;
      status: 'success' | 'error';
    }
  | {
      type: typeof AgentEventTypes.SubAgentCompleted;
      conversationId: string;
      messageId: string;
      agentId: string;
      agentName: string;
      status: 'success' | 'error' | 'timeout';
      resultMessage: string;
      totalDurationMs: number;
    };

export interface EventPort {
  emit(event: AgentEvent): void | Promise<void>;
}
