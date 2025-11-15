import type { AgentEvent, Message } from './ports.js';

/**
 * Agent Template - defines a pre-configured specialist agent
 * Only systemPrompt is required; all other fields have sensible defaults
 */
export type AgentTemplate = {
  systemPrompt: string; // REQUIRED: Custom system prompt for the agent

  // Optional fields with defaults applied at runtime
  id?: string; // Unique identifier (auto-generated if not provided)
  name?: string; // Human-readable name (defaults to "Custom Agent")
  description?: string; // What this agent does (defaults to generic description)
  tools?: string[]; // Allowed tools (defaults to ['file_read', 'web_search'])

  // LLM Configuration (optional - inherits from delegating agent if not specified)
  provider?: string; // LLM provider (e.g., "openrouter", "github")
  model?: string; // Model name (e.g., "gpt-4", "claude-3-sonnet")

  // Sampling parameters (optional - inherits if not specified)
  temperature?: number; // Default temperature (defaults to 0.7)
  maxTokens?: number; // Default token limit (defaults to 4000)
  topP?: number;
  timeoutMs?: number;
  shareContext?: boolean;
  metadata?: Record<string, unknown>;
};

/**
 * CompleteAgent is an AgentTemplate with all required fields populated
 * Used for registered agents that have gone through applyDefaults()
 */
export type CompleteAgent = Required<
  Pick<AgentTemplate, 'id' | 'name' | 'description' | 'systemPrompt' | 'tools' | 'temperature' | 'maxTokens'>
> &
  Pick<AgentTemplate, 'provider' | 'model' | 'topP' | 'timeoutMs' | 'shareContext' | 'metadata'>;

/**
 * Specialist Agent Configuration (Internal - used by AgentManager)
 */
export type SpecialistAgentConfig = {
  // From AssignTool parameters
  agentId: string; // Agent ID from tool call
  agentName: string; // Agent human-readable name
  taskDescription: string; // Task from tool call

  // From AgentTemplate (merged)
  systemPrompt: string; // From template
  tools: string[]; // From template
  provider?: string; // From template or delegating agent
  model?: string; // From template or delegating agent
  temperature?: number; // From template or delegating agent
  maxTokens?: number; // From template or delegating agent
  topP?: number; // From template or delegating agent
  timeoutMs?: number; // From template or default

  // Runtime context
  shareContext?: boolean; // From template or default (false)
  delegatingMemory?: Message[]; // If shareContext is true
  delegationDepth: number; // Current delegation level (tracked internally)
  conversationId?: string; // For event tracking
  messageId?: string; // For event tracking
  toolCallId?: string; // For event tracking - links to specific assign_task tool call
};

/**
 * Specialist Agent Result
 */
export type SpecialistAgentResult = {
  status: 'success' | 'error' | 'timeout';
  result: string;
  metadata: {
    agentId: string;
    tokensUsed?: number;
    toolCallsExecuted: number;
    executionTimeMs: number;
    conversationHistory?: Message[];
    events?: AgentEvent[];
    errorMessage?: string;
  };
};

/**
 * AssignTool Parameters (what LLM provides)
 */
export type AssignParams = {
  agent: string; // Required: Agent ID from registry (e.g., "code-reviewer", "researcher")
  task: string; // Required: Task description (3-4 sentences explaining what to do)
};
