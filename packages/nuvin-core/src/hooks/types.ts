/**
 * Hook System Types and Interfaces
 *
 * This module defines the type system for Nuvin's hook infrastructure.
 * Hooks intercept agent behavior at lifecycle points (pre-tool, post-tool,
 * session start/end, etc.) and can allow, deny, block, or modify operations.
 */

/**
 * Hook event types - lifecycle points where hooks can intercept behavior.
 * Follows Claude Code's hook patterns for consistency.
 */
export const HookEventTypes = {
  /** Before processing user input */
  PreUserPrompt: 'pre_user_prompt',
  /** Before tool execution - can prevent or modify tool calls */
  PreToolUse: 'pre_tool_use',
  /** When permission is requested for an operation */
  PermissionRequest: 'permission_request',
  /** After tool execution - can observe or modify results */
  PostToolUse: 'post_tool_use',
  /** Before spawning a sub-agent */
  PreSubAgent: 'pre_sub_agent',
  /** After sub-agent completes */
  PostSubAgent: 'post_sub_agent',
  /** Before agent stops/completes */
  PreStop: 'pre_stop',
  /** When a new session starts */
  SessionStart: 'session_start',
  /** When a session ends */
  SessionEnd: 'session_end',
} as const;

/** Union type of all hook event type values */
export type HookEventType = (typeof HookEventTypes)[keyof typeof HookEventTypes];

/**
 * Hook decision types - what action to take based on hook result.
 */
export const HookDecision = {
  /** Allow the operation to proceed */
  Allow: 'allow',
  /** Deny the operation (with optional reason) */
  Deny: 'deny',
  /** Ask the user for permission */
  Ask: 'ask',
  /** Block the operation entirely */
  Block: 'block',
} as const;

/** Union type of all hook decision values */
export type HookDecisionType = (typeof HookDecision)[keyof typeof HookDecision];

/**
 * Result returned from hook execution.
 * Contains the decision, any modifications, and execution metadata.
 */
export interface HookResult {
  /** The permission decision (allow/deny/ask/block) */
  decision?: HookDecisionType;
  /** Reason for the decision */
  decisionReason?: string;
  /** Modified input to use instead of original (for pre-hooks) */
  updatedInput?: Record<string, unknown>;
  /** Additional context to inject into the conversation */
  additionalContext?: string;
  /** Whether to continue execution (false = stop/abort) */
  continue: boolean;
  /** Reason for stopping if continue is false */
  stopReason?: string;
  /** Whether to suppress output from this operation */
  suppressOutput?: boolean;
  /** System message to inject */
  systemMessage?: string;
  /** Raw output from hook command/prompt */
  rawOutput?: string;
  /** Exit code from hook command (0 = success) */
  exitCode: number;
  /** Error message if hook failed */
  error?: string;
  /** How long the hook took to execute in milliseconds */
  durationMs?: number;
}

/**
 * Context passed to hooks during execution.
 * Contains information about the current operation being intercepted.
 */
export interface HookContext {
  /** Current session identifier */
  sessionId: string;
  /** Current conversation identifier */
  conversationId: string;
  /** Current message identifier */
  messageId: string;
  /** Which hook event is being triggered */
  hookEvent: HookEventType;
  /** Current working directory */
  cwd: string;
  /** Name of tool being used (for tool hooks) */
  toolName?: string;
  /** Input parameters for the tool */
  toolInput?: Record<string, unknown>;
  /** Unique identifier for this tool use */
  toolUseId?: string;
  /** Response from tool execution (for post-tool hooks) */
  toolResponse?: Record<string, unknown>;
  /** User prompt (for pre-user-prompt hooks) */
  prompt?: string;
  /** Sub-agent identifier (for sub-agent hooks) */
  agentId?: string;
  /** Type of agent being spawned */
  agentType?: string;
  /** Type of permission being requested */
  permissionType?: string;
}

/**
 * Definition of a single hook.
 * Can be a command (bash script) or a prompt (LLM evaluation).
 */
export interface HookDefinition {
  /** Pattern to match (regex for tool names, etc.) - if not specified, matches all */
  matcher?: string;
  /** Command to execute (bash script, etc.) */
  command?: {
    /** The command to run */
    command: string;
    /** Timeout in seconds (default: 60) */
    timeout?: number;
  };
  /** LLM prompt to evaluate */
  prompt?: {
    /** The prompt to send to LLM */
    prompt: string;
    /** Timeout in seconds (default: 60) */
    timeout?: number;
  };
  /** Whether this hook is enabled (default: true) */
  enabled?: boolean;
  /** Whether to run this hook only once per session */
  once?: boolean;
}

/**
 * Configuration for hooks on a specific event type.
 */
export interface HookEventConfig {
  /** List of hooks to run for this event */
  hooks: HookDefinition[];
}

/**
 * Complete hooks configuration for an agent.
 * Maps event types to their hook configurations.
 */
export interface HooksConfig {
  pre_user_prompt?: HookEventConfig;
  pre_tool_use?: HookEventConfig;
  permission_request?: HookEventConfig;
  post_tool_use?: HookEventConfig;
  pre_sub_agent?: HookEventConfig;
  post_sub_agent?: HookEventConfig;
  pre_stop?: HookEventConfig;
  session_start?: HookEventConfig;
  session_end?: HookEventConfig;
}

/**
 * Port interface for hook execution.
 * Implementations handle the actual execution of hooks (commands, prompts, etc.)
 */
export interface HookPort {
  /**
   * Execute all matching hooks for the given context.
   * @param context - The hook context with operation details
   * @returns The combined result from all executed hooks
   */
  executeHook(context: HookContext): Promise<HookResult>;

  /**
   * Check if there are any hooks registered for an event.
   * @param event - The hook event type
   * @param matcher - Optional matcher pattern (e.g., tool name)
   * @returns True if hooks exist for this event
   */
  hasHooks(event: HookEventType | string, matcher?: string): boolean;
}
