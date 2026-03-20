// Core ports and types for the agent orchestrator. Self-contained.
import type { AgentRegistry } from './agent-registry.js';
import type {
  BashToolArgs,
  FileReadArgs,
  FileEditArgs,
  FileNewArgs,
  LsArgs,
  WebSearchArgs,
  WebFetchArgs,
  TodoWriteArgs,
  AssignTaskArgs,
  GrepArgs,
  GlobArgs,
  LspArgs,
  SkillArgs,
  AskUserArgs,
} from './tools/tool-params.js';
import type {
  BashToolMetadata,
  FileReadMetadata,
  FileEditMetadata,
  FileNewMetadata,
  LsMetadata,
  WebSearchMetadata,
  WebFetchMetadata,
  TodoWriteMetadata,
  AssignTaskMetadata,
  GrepToolMetadata,
  GlobToolMetadata,
  AskUserMetadata,
  ToolErrorMetadata,
} from './tools/tool-result-metadata.js';

// Provider-side types
export type ToolCall = {
  id: string;
  type: 'function';
  function: {
    name: string;
    arguments: string; // JSON string per OpenAI-style schema
  };
  editInstruction?: string;
  // Per-tool approval tracking
  approvalId?: string; // Unique ID for this tool's approval (if needs approval)
  requiresApproval?: boolean; // true if this tool needs user approval before execution
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
  [key: string]: unknown;
};

export type CompletionParams = {
  messages: ChatMessage[];
  model: string;
  temperature?: number;
  topP?: number;
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
  // Configuration for reasoning effort (common across some models like o1, deepseek-reasoner)
  reasoning?: {
    effort: string;
  };
  // Claude-style thinking config (Anthropic API extended thinking)
  thinking?:
    | {
        type: 'enabled';
        budget_tokens: number;
      }
    | {
        type: 'disabled';
      };
  usage?: {
    include?: boolean;
  };
  [key: string]: unknown;
};

export type ResponseParams = CompletionParams & {
  store?: boolean;
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
  cache_creation_input_tokens?: number;
  cache_read_input_tokens?: number;
};

export type CompletionResult = {
  content: string;
  tool_calls?: ToolCall[];
  usage?: UsageData;
  [key: string]: unknown;
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
  [key: string]: unknown;
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
  skipAutoSummaryCheck?: boolean;
  userMessageId?: string;
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
      onReasoningChunk?: (delta: string) => void;
      onToolCallDelta?: (tc: ToolCall) => void;
      onStreamFinish?: (finishReason?: string, usage?: UsageData) => void;
      onUsage?: (usage: UsageData) => void;
    },
    signal?: AbortSignal,
  ): Promise<CompletionResult>;
  getModels?(
    signal?: AbortSignal,
  ): Promise<Array<{ id: string; limits?: { contextWindow: number; maxOutput?: number }; [key: string]: unknown }>>;
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

export type ToolInvocation =
  | { id: string; name: 'bash_tool'; parameters: BashToolArgs; editInstruction?: string }
  | { id: string; name: 'file_read'; parameters: FileReadArgs; editInstruction?: string }
  | { id: string; name: 'file_edit'; parameters: FileEditArgs; editInstruction?: string }
  | { id: string; name: 'file_new'; parameters: FileNewArgs; editInstruction?: string }
  | { id: string; name: 'ls_tool'; parameters: LsArgs; editInstruction?: string }
  | { id: string; name: 'web_search'; parameters: WebSearchArgs; editInstruction?: string }
  | { id: string; name: 'web_fetch'; parameters: WebFetchArgs; editInstruction?: string }
  | { id: string; name: 'todo_write'; parameters: TodoWriteArgs; editInstruction?: string }
  | { id: string; name: 'assign_task'; parameters: AssignTaskArgs; editInstruction?: string }
  | { id: string; name: 'grep_tool'; parameters: GrepArgs; editInstruction?: string }
  | { id: string; name: 'glob_tool'; parameters: GlobArgs; editInstruction?: string }
  | { id: string; name: 'lsp'; parameters: LspArgs; editInstruction?: string }
  | { id: string; name: 'skill'; parameters: SkillArgs; editInstruction?: string }
  | { id: string; name: 'ask_user_tool'; parameters: AskUserArgs; editInstruction?: string }
  | { id: string; name: string; parameters: Record<string, unknown>; editInstruction?: string };

export enum ErrorReason {
  Aborted = 'aborted',
  Denied = 'denied',
  Edited = 'edited',
  Timeout = 'timeout',
  NotFound = 'not_found',
  PermissionDenied = 'permission_denied',
  InvalidInput = 'invalid_input',
  NetworkError = 'network_error',
  RateLimit = 'rate_limit',
  ToolNotFound = 'tool_not_found',
  ValidationFailed = 'validation_failed',
  Unknown = 'unknown',
}

export type ToolExecutionResult =
  | {
      id: string;
      name: 'bash_tool';
      status: 'success';
      type: 'text';
      result: string;
      metadata?: BashToolMetadata;
      durationMs?: number;
    }
  | {
      id: string;
      name: 'file_read';
      status: 'success';
      type: 'text';
      result: string;
      metadata?: FileReadMetadata;
      durationMs?: number;
    }
  | {
      id: string;
      name: 'file_edit';
      status: 'success';
      type: 'text';
      result: string;
      metadata?: FileEditMetadata;
      durationMs?: number;
    }
  | {
      id: string;
      name: 'file_new';
      status: 'success';
      type: 'text';
      result: string;
      metadata?: FileNewMetadata;
      durationMs?: number;
    }
  | {
      id: string;
      name: 'ls_tool';
      status: 'success';
      type: 'text';
      result: string;
      metadata?: LsMetadata;
      durationMs?: number;
    }
  | {
      id: string;
      name: 'web_search';
      status: 'success';
      type: 'json';
      result: Record<string, unknown> | unknown[];
      metadata?: WebSearchMetadata;
      durationMs?: number;
    }
  | {
      id: string;
      name: 'web_fetch';
      status: 'success';
      type: 'text';
      result: string;
      metadata?: WebFetchMetadata;
      durationMs?: number;
    }
  | {
      id: string;
      name: 'todo_write';
      status: 'success';
      type: 'text';
      result: string;
      metadata?: TodoWriteMetadata;
      durationMs?: number;
    }
  | {
      id: string;
      name: 'assign_task';
      status: 'success';
      type: 'text';
      result: string;
      metadata: AssignTaskMetadata;
      durationMs?: number;
    }
  | {
      id: string;
      name: 'grep_tool';
      status: 'success';
      type: 'text';
      result: string;
      metadata?: GrepToolMetadata;
      durationMs?: number;
    }
  | {
      id: string;
      name: 'glob_tool';
      status: 'success';
      type: 'text';
      result: string;
      metadata?: GlobToolMetadata;
      durationMs?: number;
    }
  | {
      id: string;
      name: 'lsp';
      status: 'success';
      type: 'text';
      result: string;
      metadata?: {
        operation: string;
        filePath: string;
        line: number;
        character: number;
        resultCount?: number;
      };
      durationMs?: number;
    }
  | {
      id: string;
      name: 'skill';
      status: 'success';
      type: 'text';
      result: string;
      metadata?: {
        name: string;
      };
      durationMs?: number;
    }
  | {
      id: string;
      name: 'ask_user_tool';
      status: 'success';
      type: 'text';
      result: string;
      metadata: AskUserMetadata;
      durationMs?: number;
    }
  | {
      id: string;
      name: string;
      status: 'success';
      type: 'mixed';
      result: Array<TextContentPart | ImageContentPart>;
      metadata?: Record<string, unknown>;
      durationMs?: number;
    }
  | {
      id: string;
      name: string;
      status: 'success';
      type: 'text' | 'json' | 'mixed';
      result: string | Record<string, unknown> | unknown[] | Array<TextContentPart | ImageContentPart>;
      metadata?: Record<string, unknown>;
      durationMs?: number;
    }
  | {
      id: string;
      name: string;
      status: 'error';
      type: 'text';
      result: string;
      metadata?: ToolErrorMetadata;
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
    createMemoryForAgent?: (agentKey: string) => MemoryPort<Message>,
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

export type MetricsSnapshot = {
  totalTokens: number;
  totalPromptTokens: number;
  totalCompletionTokens: number;
  totalCachedTokens: number;
  totalReasoningTokens: number;
  requestCount: number;
  llmCallCount: number;
  toolCallCount: number;
  totalTimeMs: number;
  totalCost: number;
  currentTokens: number;
  currentPromptTokens: number;
  currentCompletionTokens: number;
  currentCachedTokens: number;
  currentCost: number;
  contextWindowLimit?: number;
  contextWindowUsage?: number;
};

export interface MetricsPort {
  recordLLMCall(usage: UsageData, cost?: number): void;
  recordToolCall(): void;
  recordRequestComplete(responseTimeMs: number): void;
  setContextWindow(limit: number, usage: number): void;
  reset(): void;
  getSnapshot(): MetricsSnapshot;
}

// Configuration for the orchestrator
export type AgentConfig = {
  id: string;
  systemPrompt: string;
  topP?: number;
  model: string;
  temperature?: number;
  maxTokens?: number;
  enabledTools?: string[]; // names
  maxToolConcurrency?: number;
  requireToolApproval?: boolean;
  reasoningEffort?: string;
  thinking?: string; // OFF | LOW | MEDIUM | HIGH
  strictToolValidation?: boolean;
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
  ReasoningChunk: 'reasoning_chunk',
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
  SubAgentMetrics: 'sub_agent_metrics',
  UserQuestionRequired: 'user_question_required',
  UserQuestionResponse: 'user_question_response',
  ToolOutputChunk: 'tool_output_chunk',
} as const;

export type ToolApprovalDecision = 'approve' | 'deny' | 'approve_all' | 'edit';

export type AgentEvent =
  | {
      type: typeof AgentEventTypes.MessageStarted;
      conversationId: string;
      messageId: string;
      userMessageId?: string;
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
      editInstruction?: string;
    }
  | {
      type: typeof AgentEventTypes.ToolResult;
      conversationId: string;
      messageId: string;
      result: ToolExecutionResult;
    }
  | {
      type: typeof AgentEventTypes.ReasoningChunk;
      conversationId: string;
      messageId: string;
      delta: string;
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
    }
  | {
      type: typeof AgentEventTypes.SubAgentMetrics;
      conversationId: string;
      messageId: string;
      agentId: string;
      toolCallId: string;
      metrics: MetricsSnapshot;
    }
  | {
      type: typeof AgentEventTypes.UserQuestionRequired;
      conversationId: string;
      messageId: string;
      questionId: string;
      questions: Array<{
        id: string;
        question: string;
        header: string;
        options: Array<{
          label: string;
          description: string;
        }>;
        multiSelect: boolean;
      }>;
    }
  | {
      type: typeof AgentEventTypes.UserQuestionResponse;
      conversationId: string;
      messageId: string;
      questionId: string;
      answers: Record<string, string | string[]>;
    }
  | {
      type: typeof AgentEventTypes.ToolOutputChunk;
      conversationId: string;
      messageId: string;
      toolCallId: string;
      content: string;
      totalLines: number;
    };

export interface EventPort {
  emit(event: AgentEvent): void | Promise<void>;
}
