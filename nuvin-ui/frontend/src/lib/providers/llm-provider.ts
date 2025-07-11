export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface CompletionParams {
  messages: ChatMessage[];
  model: string;
  temperature: number;
  maxTokens: number;
  topP: number;
}

export interface CompletionResult {
  content: string;
}

export interface ModelInfo {
  id: string;
  name: string;
  description?: string;
  contextLength?: number;
  inputCost?: number; // Cost per 1M tokens
  outputCost?: number; // Cost per 1M tokens
}

export interface LLMProvider {
  readonly type: string;
  generateCompletion(params: CompletionParams): Promise<CompletionResult>;
  generateCompletionStream?(params: CompletionParams): AsyncGenerator<string>;
  getModels(): Promise<ModelInfo[]>;
}
