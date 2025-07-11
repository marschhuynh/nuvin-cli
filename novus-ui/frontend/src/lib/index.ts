// Agent Manager
export { agentManager, AgentManager } from './agent-manager';
export type {
  SendMessageOptions,
  MessageResponse,
  AgentStatus
} from './agent-manager';

// A2A Service
export { a2aService, A2AService, A2AError, A2AErrorType } from './a2a';
export type {
  A2AAuthConfig,
  A2AMessageOptions,
  A2ATaskInfo,
  A2AStreamEvent
} from './a2a';

// Re-export A2A SDK types
export type {
  AgentCard,
  Message,
  Task,
  Part,
  MessageSendParams,
  SendMessageResponse,
  GetTaskResponse,
  CancelTaskResponse
} from './a2a';

// Utils
export * from './utils';

export { fetchGithubCopilotKey } from './github';

// Providers
export type { LLMProvider, CompletionParams, CompletionResult, ChatMessage } from './providers';
export { createProvider, OpenAIProvider, GithubCopilotProvider } from './providers';
export { BaseAgent, LocalAgent, A2AAgent } from './agents';

// Export fetch proxy utilities
export {
  fetchProxy,
  enableGlobalFetchProxy,
  disableGlobalFetchProxy,
  smartFetch,
  isWailsEnvironment
} from './fetch-proxy';
