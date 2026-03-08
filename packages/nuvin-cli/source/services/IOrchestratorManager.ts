import type {
  AgentOrchestrator,
  AgentConfig,
  Message,
  MemoryPort,
  UserMessagePayload,
  SendMessageOptions,
  ConversationContext,
  ConversationStore,
  ConversationMetadata,
  ToolApprovalDecision,
} from '@nuvin/nuvin-core';
import type { ProviderKey } from '@/config/providers.js';
import type { MCPServerInfo } from './MCPServerManager.js';
import type { LLMFactory } from './LLMFactory.js';
import type { MemoryService } from './MemoryService.js';
import type { OrchestratorStatus } from '@/types/orchestrator.js';
import type { MCPServerManager } from './MCPServerManager.js';
import type { UIHandlers } from './orchestrator-modules/types.js';

export type OrchestratorConfig = {
  memPersist?: boolean;
  sessionId?: string;
  sessionDir?: string;
  streamingChunks?: boolean;
};

export interface IOrchestratorManager {
  // ── Lifecycle ────────────────────────────────────────────────────────

  init(options: OrchestratorConfig, handlers: UIHandlers): Promise<{
    readonly model: string;
    readonly sessionId: string | null;
    readonly sessionDir: string | null;
  }>;

  cleanup(): Promise<void>;

  reset(): void;

  // ── Message sending ──────────────────────────────────────────────────

  send(
    content: UserMessagePayload,
    opts?: SendMessageOptions,
    agentConfigOverrides?: Partial<AgentConfig>,
  ): Promise<unknown>;

  // ── Orchestrator access ──────────────────────────────────────────────

  /** @deprecated Use explicit methods (handleToolApproval, handleUserQuestionResponse) instead. */
  getOrchestrator(): AgentOrchestrator | null;

  getStatus(): OrchestratorStatus;

  getConfig(): AgentConfig | undefined;

  updateConfig(agentConfigUpdates: Partial<AgentConfig>): void;

  // ── Model & Provider ─────────────────────────────────────────────────

  getModel(): string;

  getAvailableProviders(): string[];

  getAvailableModels(provider?: ProviderKey): Promise<string[]>;

  getLLMFactory(): LLMFactory;

  getLLM(): unknown;

  // ── Memory ───────────────────────────────────────────────────────────

  getMemory(): MemoryPort<Message> | null;

  getMemoryService(): MemoryService | null;

  // ── Tools ────────────────────────────────────────────────────────────

  getTools(): unknown;

  // ── MCP ──────────────────────────────────────────────────────────────

  getMCPServers(): MCPServerInfo[];

  getMcpManager(): MCPServerManager | null;

  setMcpManager(mcpManager: MCPServerManager | null): void;

  updateMCPAllowedTools(allowedToolsConfig: Record<string, Record<string, boolean>>): Promise<void>;

  reconnectMCPServer(serverId: string): Promise<MCPServerInfo | null>;

  disconnectMCPServer(serverId: string): Promise<boolean>;

  // ── Session ──────────────────────────────────────────────────────────

  getSession(): Readonly<{ sessionId: string | null; sessionDir: string | null }>;

  createNewConversation(config?: { memPersist?: boolean }): Promise<{
    sessionId: string | null;
    sessionDir: string | null;
    memory: MemoryPort<Message>;
  }>;

  switchToSession(config: { sessionId: string; sessionDir: string }): Promise<{
    sessionId: string;
    sessionDir: string;
    memory: MemoryPort<Message>;
  }>;

  listConversations(): Promise<Array<{ id: string; metadata: ConversationMetadata }>>;

  getConversationMetadata(conversationId: string): Promise<ConversationMetadata>;

  // ── Conversation ─────────────────────────────────────────────────────

  getConversationContext(): ConversationContext;

  getConversationStore(): ConversationStore | null;

  // ── Context window ───────────────────────────────────────────────────

  summarize(): Promise<string>;

  summarizeAndCreateNewSession(options?: { skipEvents?: boolean }): Promise<{
    summary: string;
    summaryPrompt: string;
    previousSessionId: string;
    newSessionId: string;
    newSessionDir: string;
  }>;

  compressAndCreateNewSession<TStats>(
    compressFn: (messages: Message[]) => { compressed: Message[]; stats: TStats },
  ): Promise<{
    previousSessionId: string;
    newSessionId: string;
    newSessionDir: string;
    stats: TStats;
  }>;

  getModelContextLimit(): Promise<number | null>;

  // ── Agent swap ───────────────────────────────────────────────────────

  getAvailableAgents(): Array<{ agentId: string; name: string; description?: string }>;

  getActiveAgentId(): string;

  swapToAgent(agentId: string): Promise<void>;

  swapToMain(): Promise<void>;

  // ── Interaction (replaces getOrchestrator() for UI consumers) ────────

  /**
   * Respond to a tool approval request.
   * UI consumers should call this instead of `getOrchestrator()?.handleToolApproval()`.
   */
  handleToolApproval(approvalId: string, decision: ToolApprovalDecision, editInstruction?: string): void;

  /**
   * Respond to a user-question prompt.
   * UI consumers should call this instead of `getOrchestrator()?.handleUserQuestionResponse()`.
   */
  handleUserQuestionResponse(questionId: string, answers: Record<string, string | string[]>): void;

  // ── Topic analysis ───────────────────────────────────────────────────

  analyzeTopic(userMessage: string, conversationId?: string): Promise<string>;

  updateConversationTopic(conversationId: string, topic: string): Promise<void>;

  analyzeAndUpdateTopic(
    userMessage: string,
    conversationId?: string,
    options?: { waitFor?: Promise<unknown> },
  ): Promise<string>;
}
