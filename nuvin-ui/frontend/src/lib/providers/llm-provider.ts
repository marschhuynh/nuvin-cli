export interface ToolCall {
  id: string;
  type: 'function';
  function: {
    name: string;
    arguments: string; // JSON string
  };
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string | null;
  tool_calls?: ToolCall[];
  tool_call_id?: string;
  name?: string; // For tool role messages
}

export interface FunctionDefinition {
  name: string;
  description: string;
  parameters: any; // JSON Schema
}

export interface ToolDefinition {
  type: 'function';
  function: FunctionDefinition;
}

export interface CompletionParams {
  messages: ChatMessage[];
  model: string;
  temperature: number;
  maxTokens: number;
  topP: number;
  tools?: ToolDefinition[];
  tool_choice?:
    | 'auto'
    | 'none'
    | { type: 'function'; function: { name: string } };
}

export interface CompletionResult {
  content: string;
  tool_calls?: ToolCall[];
}

export interface ModelInfo {
  id: string;
  name: string;
  description?: string;
  contextLength?: number;
  inputCost?: number; // Cost per 1M tokens
  outputCost?: number; // Cost per 1M tokens
  modality?: string; // Model modality type (e.g., "text", "multimodal", "vision")
  inputModalities?: string[]; // Supported input modalities (e.g., ["text", "image", "audio"])
  outputModalities?: string[]; // Supported output modalities (e.g., ["text", "image", "audio"])
  supportedParameters?: string[]; // Supported parameters (e.g., ["temperature", "top_p", "max_tokens"])
}

export interface LLMProvider {
  readonly type: string;
  generateCompletion(params: CompletionParams): Promise<CompletionResult>;
  generateCompletionStream?(params: CompletionParams): AsyncGenerator<string>;
  getModels(): Promise<ModelInfo[]>;
}
