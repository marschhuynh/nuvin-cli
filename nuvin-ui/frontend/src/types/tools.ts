// Tool parameter schema following JSON Schema specification
export interface ToolParameter {
  type: 'string' | 'number' | 'boolean' | 'object' | 'array';
  description: string;
  required?: boolean | string[];
  enum?: string[] | number[];
  items?: ToolParameter; // For array types
  properties?: Record<string, ToolParameter>; // For object types
  minimum?: number;
  maximum?: number;
  minLength?: number;
  maxLength?: number;
}

// Tool definition following OpenAI function calling format
export interface ToolDefinition {
  name: string;
  description: string;
  parameters: {
    type: 'object';
    properties: Record<string, ToolParameter>;
    required?: string[];
  };
}

// Tool execution context and result
export interface ToolContext {
  userId?: string;
  sessionId?: string;
  metadata?: Record<string, any>;
}

export interface ToolExecutionResult {
  success: boolean;
  data?: any;
  error?: string;
  metadata?: Record<string, any>;
}

// Tool implementation interface
export interface Tool {
  definition: ToolDefinition;
  execute: (
    parameters: Record<string, any>,
    context?: ToolContext,
  ) => Promise<ToolExecutionResult>;
  validate?: (parameters: Record<string, any>) => boolean;
  category?: string;
  version?: string;
  author?: string;
}

// Tool call from LLM
export interface ToolCall {
  id: string;
  name: string;
  parameters: Record<string, any>;
}

// Tool call result
export interface ToolCallResult {
  id: string;
  name: string;
  result: ToolExecutionResult;
}

// Agent tool configuration
export interface AgentToolConfig {
  enabledTools: string[]; // Tool names that are enabled for this agent
  toolSettings?: Record<string, any>; // Per-tool configuration
  maxConcurrentCalls?: number;
  timeoutMs?: number;
}
