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

export interface LLMProvider {
  readonly type: string;
  generateCompletion(params: CompletionParams): Promise<CompletionResult>;
}
