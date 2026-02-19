import type { AgentEvent, Message, MetricsSnapshot } from './ports.js';
import type { ErrorReason } from './ports.js';

export type AgentFrontmatter = {
  name?: string;
  description?: string;
  allowed_tools?: string[];
  model?: string;
  temperature?: number;
  top_p?: number;
  max_tokens?: number;
  timeout_ms?: number;
  provider?: string;
  disable_model_invocation?: boolean;
  user_invocable?: boolean;
  context?: 'fork';
  agent?: string;
  hooks?: Record<string, unknown>;
  argument_hint?: string;
};

export type ClaudeAgentSkill = {
  frontmatter: AgentFrontmatter;
  instructions: string;
};

export type AgentTemplate = {
  instructions: string;
  name?: string;
  description?: string;
  allowed_tools?: string[];
  model?: string;
  disable_model_invocation?: boolean;
  user_invocable?: boolean;
  context?: 'fork';
  agent?: string;
  hooks?: Record<string, unknown>;
  argument_hint?: string;
  provider?: string;
  temperature?: number;
  max_tokens?: number;
  top_p?: number;
  timeout_ms?: number;
  share_context?: boolean;
  stream?: boolean;
  metadata?: Record<string, unknown>;
  location?: 'built-in' | 'global' | 'profile' | 'local';
};

export type CompleteAgent = Required<Pick<AgentTemplate, 'instructions' | 'name' | 'description' | 'allowed_tools'>> &
  Pick<
    AgentTemplate,
    | 'model'
    | 'disable_model_invocation'
    | 'user_invocable'
    | 'context'
    | 'agent'
    | 'provider'
    | 'temperature'
    | 'top_p'
    | 'max_tokens'
    | 'timeout_ms'
    | 'share_context'
    | 'metadata'
  > & {
    location?: 'built-in' | 'global' | 'profile' | 'local';
  };

/**
 * Specialist Agent Configuration (Internal - used by AgentManager)
 */
export type SpecialistAgentConfig = {
  agentId: string;
  agentName: string;
  agentType?: string;
  taskDescription: string;
  instructions: string;
  allowed_tools: string[];
  provider?: string;
  model?: string;
  temperature?: number;
  max_tokens?: number;
  top_p?: number;
  timeout_ms?: number;
  share_context?: boolean;
  stream?: boolean;
  delegatingMemory?: Message[];
  delegationDepth: number;
  conversationId?: string;
  messageId?: string;
  toolCallId?: string;
  resumeSessionId?: string;
  previousMessages?: Message[];
  disable_model_invocation?: boolean;
  user_invocable?: boolean;
  context?: 'fork';
  agent?: string;
};

/**
 * Specialist Agent Result
 */
export type SpecialistAgentResult = {
  status: 'success' | 'error' | 'timeout';
  result: string;
  metadata: {
    agentId: string;
    agentName: string;
    tokensUsed?: number;
    toolCallsExecuted: number;
    executionTimeMs: number;
    conversationHistory?: Message[];
    events?: AgentEvent[];
    errorMessage?: string;
    errorReason?: ErrorReason;
    metrics?: MetricsSnapshot;
    sessionId?: string;
  };
};

/**
 * AssignTool Parameters (what LLM provides)
 */
export type AssignParams = {
  agent: string;
  task: string;
  description?: string;
  run_in_background?: boolean;
  resume?: string;
};
