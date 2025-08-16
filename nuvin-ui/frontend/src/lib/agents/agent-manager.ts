import type { AgentSettings, ProviderConfig, Message } from '@/types';
import { useTodoStore } from '@/store/useTodoStore';
import { generateUUID } from '../utils';
import {
  a2aService,
  type A2AAuthConfig,
  A2AError,
  type A2AErrorType,
  type Task,
} from '../a2a';
import { type BaseAgent, LocalAgent, A2AAgent } from '.';
import { PROVIDER_TYPES } from '../providers/provider-utils';
import { reminderGenerator } from './reminder-generator';

export interface SendMessageOptions {
  conversationId?: string;
  contextId?: string;
  taskId?: string;
  userId?: string; // Added for tool context
  stream?: boolean;
  onChunk?: (chunk: string) => void;
  onComplete?: (response: string) => void;
  onError?: (error: Error) => void;
  onAdditionalMessage?: (message: MessageResponse) => void; // For multi-message flows
  timeout?: number;
  enableRetry?: boolean;
  maxRetries?: number;
  // System reminder options
  includeSystemReminders?: boolean; // Default true
  skipReminderTypes?: (
    | 'instruction'
    | 'todo-status'
    | 'security'
    | 'behavioral'
  )[];
}

export interface MessageResponse {
  id: string;
  content: string;
  role: 'assistant' | 'tool';
  timestamp: string;
  toolCall?: {
    name: string;
    id: string;
    arguments: any;
    result?: {
      success: boolean;
      data?: any;
      error?: string;
      metadata?: Record<string, any>;
    };
    isExecuting?: boolean;
  };
  metadata?: {
    model?: string;
    provider?: string;
    agentType: 'local' | 'remote';
    agentId: string;
    tokensUsed?: number;
    promptTokens?: number;
    completionTokens?: number;
    totalTokens?: number;
    estimatedCost?: number;
    responseTime?: number;
    taskId?: string;
    toolCalls?: number; // Added to track tool usage
  };
}

export interface AgentStatus {
  id: string;
  name: string;
  type: 'local' | 'remote';
  status: 'available' | 'busy' | 'error' | 'offline';
  lastUsed?: string;
  capabilities?: string[];
  url?: string;
  lastSuccess?: Date;
  failureCount?: number;
  error?: string;
  totalTokensUsed?: number;
  totalCost?: number;
  messagesProcessed?: number;
  averageResponseTime?: number;
}

export class AgentManager {
  private static instance: AgentManager;
  private activeAgent: AgentSettings | null = null;
  private activeProvider: ProviderConfig | null = null;
  private conversationHistory: Map<string, Message[]> = new Map();

  // Agent metrics tracking
  private agentMetrics: Map<
    string,
    {
      totalTokensUsed: number;
      totalCost: number;
      messagesProcessed: number;
      totalResponseTime: number;
    }
  > = new Map();

  private agentInstance: BaseAgent | null = null;
  private constructor() { }

  static getInstance(): AgentManager {
    if (!AgentManager.instance) {
      AgentManager.instance = new AgentManager();
    }
    return AgentManager.instance;
  }

  setActiveAgent(agent: AgentSettings): void {
    this.activeAgent = agent;
    this.updateAgentInstance();
  }

  setActiveProvider(provider: ProviderConfig): void {
    this.activeProvider = provider;
    this.updateAgentInstance();
  }

  getActiveAgent(): AgentSettings | null {
    return this.activeAgent;
  }

  getActiveProvider(): ProviderConfig | null {
    return this.activeProvider;
  }

  private updateAgentInstance(): void {
    if (!this.activeAgent) {
      this.agentInstance = null;
      return;
    }
    if (this.activeAgent.agentType === 'local') {
      if (!this.activeProvider || !this.activeProvider.activeModel) {
        this.agentInstance = null;
        return;
      }
      this.agentInstance = new LocalAgent(
        this.activeAgent,
        this.activeProvider,
        this.conversationHistory,
      );
    } else if (this.activeAgent.agentType === 'remote') {
      this.agentInstance = new A2AAgent(
        this.activeAgent,
        this.conversationHistory,
      );
    } else {
      this.agentInstance = null;
    }
  }

  private createA2AAuthConfig(agent: AgentSettings): A2AAuthConfig | undefined {
    if (!agent.auth || agent.agentType !== 'remote') {
      return undefined;
    }

    return {
      type: agent.auth.type,
      token: agent.auth.token,
      username: agent.auth.username,
      password: agent.auth.password,
      headerName: agent.auth.headerName,
    };
  }

  async sendMessage(
    content: string,
    options: SendMessageOptions = {},
  ): Promise<MessageResponse> {
    if (!this.activeAgent) {
      throw new Error('No active agent selected');
    }

    try {
      if (!this.agentInstance) {
        this.updateAgentInstance();
      }

      if (!this.agentInstance) {
        throw new Error('Agent instance not configured');
      }

      // Enhance message with system reminders if enabled (default true)
      let _content = [content];
      if (options.includeSystemReminders !== false) {
        const enhancedString = this.enhanceMessageWithReminders(
          content,
          options,
        );
        _content = enhancedString;
        console.log(`Enhanced content with reminders:`, _content);
      }

      const response = await this.agentInstance.sendMessage(
        _content,
        options,
      );

      return response;
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error occurred';

      console.error('AgentManager sendMessage error:', error);

      // Always call onError if provided to ensure UI gets notified
      if (options.onError) {
        try {
          options.onError(
            error instanceof Error ? error : new Error(errorMessage),
          );
        } catch (callbackError) {
          console.error('Error in onError callback:', callbackError);
        }
      }

      // Still throw the error so upstream handlers know an error occurred
      throw error;
    }
  }

  /**
   * Enhance message content with system reminders
   */
  private enhanceMessageWithReminders(
    content: string,
    options: SendMessageOptions,
  ): string[] {
    try {
      // Get current todo state
      const todoStore = useTodoStore.getState();
      const todoState = todoStore.getTodoStateForReminders(
        options.conversationId,
      );

      // Get conversation history
      const messageHistory = options.conversationId
        ? this.getConversationHistory(options.conversationId)
        : [];

      return reminderGenerator.enhanceMessageWithReminders(content, {
        messageType: 'user',
        conversationId: options.conversationId,
        messageHistory,
        includeReminders: true,
        todoState,
      });
    } catch (error) {
      console.warn('Failed to enhance message with reminders:', error);
      return [content];
    }
  }

  /**
   * Cancel the current active request
   */
  async cancelCurrentRequest(): Promise<boolean> {
    if (!this.agentInstance) {
      return false;
    }

    // For remote agents, cancel the active task
    if (this.activeAgent?.agentType === 'remote' && this.activeAgent.url) {
      const tasks = a2aService.getTasksForAgent(this.activeAgent.url);
      const activeTask = tasks.find((task) => task.status.state === 'running');

      if (activeTask) {
        return await this.cancelTask(this.activeAgent.url, activeTask.id);
      }
    }

    // For local agents, use the cancel method
    if (this.activeAgent?.agentType === 'local') {
      this.agentInstance.cancel();
      return true;
    }

    return false;
  }

  /**
   * Get conversation history for a conversation ID
   */
  getConversationHistory(conversationId: string): Message[] {
    return this.conversationHistory.get(conversationId) || [];
  }

  /**
   * Add messages to conversation history (for testing)
   */
  addToConversationHistory(conversationId: string, messages: Message[]): void {
    const existing = this.conversationHistory.get(conversationId) || [];
    this.conversationHistory.set(conversationId, [...existing, ...messages]);
  }

  /**
   * Clear conversation history
   */
  clearConversationHistory(conversationId?: string): void {
    if (conversationId) {
      this.conversationHistory.delete(conversationId);
    } else {
      this.conversationHistory.clear();
    }
  }

  async getTask(
    agentUrl: string,
    taskId: string,
    options?: {
      timeout?: number;
      enableRetry?: boolean;
      maxRetries?: number;
    },
  ): Promise<Task | null> {
    try {
      // Find agent settings for the URL to get auth config
      let authConfig: A2AAuthConfig | undefined;
      if (this.activeAgent?.url === agentUrl) {
        authConfig = this.createA2AAuthConfig(this.activeAgent);
      }

      return await a2aService.getTask(
        agentUrl,
        taskId,
        authConfig,
        undefined,
        options,
      );
    } catch (error) {
      if (error instanceof A2AError) {
        console.error('Failed to get task:', error.getUserMessage());
      } else {
        console.error('Failed to get task:', error);
      }
      return null;
    }
  }

  async cancelTask(
    agentUrl: string,
    taskId: string,
    options?: {
      timeout?: number;
      enableRetry?: boolean;
      maxRetries?: number;
    },
  ): Promise<boolean> {
    try {
      // Find agent settings for the URL to get auth config
      let authConfig: A2AAuthConfig | undefined;
      if (this.activeAgent?.url === agentUrl) {
        authConfig = this.createA2AAuthConfig(this.activeAgent);
      }

      const task = await a2aService.cancelTask(
        agentUrl,
        taskId,
        authConfig,
        options,
      );
      return task.status.state === 'cancelled';
    } catch (error) {
      if (error instanceof A2AError) {
        console.error('Failed to cancel task:', error.getUserMessage());
      } else {
        console.error('Failed to cancel task:', error);
      }
      return false;
    }
  }

  getTasks() {
    return a2aService.getTasks();
  }

  getActiveAgentTasks() {
    if (this.activeAgent?.agentType === 'remote' && this.activeAgent.url) {
      return a2aService.getTasksForAgent(this.activeAgent.url);
    }
    return [];
  }

  /**
   * Update agent metrics after a message response
   */
  updateAgentMetrics(
    agentId: string,
    responseMetadata: MessageResponse['metadata'],
  ): void {
    if (!responseMetadata) return;

    const metrics = this.agentMetrics.get(agentId) || {
      totalTokensUsed: 0,
      totalCost: 0,
      messagesProcessed: 0,
      totalResponseTime: 0,
    };

    metrics.totalTokensUsed += responseMetadata.totalTokens || 0;
    metrics.totalCost += responseMetadata.estimatedCost || 0;
    metrics.messagesProcessed += 1;
    metrics.totalResponseTime += responseMetadata.responseTime || 0;

    this.agentMetrics.set(agentId, metrics);
  }

  /**
   * Get agent status with current metrics
   */
  getAgentStatus(agent: AgentSettings): AgentStatus {
    const metrics = this.agentMetrics.get(agent.id) || {
      totalTokensUsed: 0,
      totalCost: 0,
      messagesProcessed: 0,
      totalResponseTime: 0,
    };

    const averageResponseTime =
      metrics.messagesProcessed > 0
        ? metrics.totalResponseTime / metrics.messagesProcessed
        : 0;

    return {
      id: agent.id,
      name: agent.name,
      type: agent.agentType,
      status: 'available', // TODO: Implement proper status tracking
      totalTokensUsed: metrics.totalTokensUsed,
      totalCost: metrics.totalCost,
      messagesProcessed: metrics.messagesProcessed,
      averageResponseTime,
    };
  }

  /**
   * Get conversation-level metrics
   */
  getConversationMetrics(conversationId: string): {
    totalTokens: number;
    totalCost: number;
    messageCount: number;
  } {
    const messages = this.conversationHistory.get(conversationId) || [];
    let totalTokens = 0;
    let totalCost = 0;
    let messageCount = 0;

    messages.forEach((message) => {
      if (message.role === 'assistant' && message.metadata) {
        const metadata = message.metadata;
        totalTokens += metadata.totalTokens || 0;
        totalCost += metadata.estimatedCost || 0;
        messageCount++; // Only count assistant messages with metadata
      }
    });

    return { totalTokens, totalCost, messageCount };
  }

  getAvailableModels(): string[] {
    if (!this.activeProvider) {
      return [];
    }

    // TODO: Implement dynamic model listing based on provider
    switch (this.activeProvider.type) {
      case PROVIDER_TYPES.OpenAI:
        return ['gpt-4', 'gpt-4-turbo', 'gpt-3.5-turbo', 'gpt-3.5-turbo-16k'];
      case PROVIDER_TYPES.Anthropic:
        return [
          'claude-3-opus',
          'claude-3-sonnet',
          'claude-3-haiku',
          'claude-2',
        ];
      case PROVIDER_TYPES.GitHub:
        return ['gpt-4', 'gpt-3.5-turbo'];
      case PROVIDER_TYPES.OpenRouter:
        return [
          'openai/gpt-4',
          'openai/gpt-4-turbo',
          'openai/gpt-3.5-turbo',
          'anthropic/claude-3-opus',
          'anthropic/claude-3-sonnet',
          'anthropic/claude-3-haiku',
          'meta-llama/llama-2-70b-chat',
          'mistralai/mistral-7b-instruct',
        ];
      default:
        return [];
    }
  }

  /**
   * Reset the manager state
   */
  reset(): void {
    this.activeAgent = null;
    this.activeProvider = null;
    this.conversationHistory.clear();
    // Clear A2A service state
    a2aService.clear();
  }

  /**
   * Initialize conversation history from conversation store
   * This should be called when the app initializes or when conversation changes
   */
  initializeHistoryFromStore(conversationStore: {
    getConversationMessages: (conversationId: string) => Message[];
    activeConversationId: string | null;
  }): void {
    this.conversationHistory.clear();

    if (!conversationStore.activeConversationId) {
      return;
    }

    const messages = conversationStore.getConversationMessages(
      conversationStore.activeConversationId,
    );
    if (messages && messages.length > 0) {
      this.conversationHistory.set(conversationStore.activeConversationId, [
        ...messages,
      ]);
    }
  }

  /**
   * Refresh conversation history for a specific conversation
   * Useful for manual refresh scenarios
   */
  refreshHistoryForConversation(
    conversationStore: {
      getConversationMessages: (conversationId: string) => Message[];
    },
    conversationId: string,
  ): void {
    const messages = conversationStore.getConversationMessages(conversationId);
    if (messages && messages.length > 0) {
      this.conversationHistory.set(conversationId, [...messages]);
    } else {
      this.conversationHistory.delete(conversationId);
    }
  }

  /**
   * Get connection health for an agent
   */
  getConnectionHealth(agentUrl: string) {
    return a2aService.getConnectionHealth(agentUrl);
  }

  /**
   * Test agent connectivity with enhanced error reporting
   */
  async testAgentConnectivity(agentSettings: AgentSettings): Promise<{
    connected: boolean;
    error?: string;
    userMessage?: string;
    errorType?: A2AErrorType;
  }> {
    if (agentSettings.agentType !== 'remote' || !agentSettings.url) {
      return {
        connected: false,
        error: 'Invalid agent configuration for connectivity test',
      };
    }

    try {
      const authConfig = this.createA2AAuthConfig(agentSettings);
      const connected = await a2aService.testConnection(
        agentSettings.url,
        authConfig,
      );

      if (connected) {
        return { connected: true };
      } else {
        return {
          connected: false,
          error: 'Connection test failed',
          userMessage:
            'Unable to connect to the agent. Please verify the URL and authentication settings.',
        };
      }
    } catch (error) {
      if (error instanceof A2AError) {
        return {
          connected: false,
          error: error.message,
          userMessage: error.getUserMessage(),
          errorType: error.type,
        };
      }

      return {
        connected: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        userMessage:
          'An unexpected error occurred while testing the connection. Please try again.',
      };
    }
  }

  /**
   * Test active agent connectivity
   */
  async testActiveAgentConnectivity(): Promise<{
    connected: boolean;
    error?: string;
    userMessage?: string;
    errorType?: A2AErrorType;
  }> {
    if (!this.activeAgent) {
      return { connected: false, error: 'No active agent selected' };
    }

    return this.testAgentConnectivity(this.activeAgent);
  }

  /**
   * Get comprehensive agent status including connection health
   */
  async getAgentConnectionStatus(
    agentSettings: AgentSettings,
  ): Promise<AgentStatus> {
    if (agentSettings.agentType === 'local') {
      // For local agents, check if provider is configured
      const hasProvider =
        this.activeProvider !== null && this.activeProvider.apiKey !== '';
      return {
        id: agentSettings.id,
        name: agentSettings.name,
        type: agentSettings.agentType,
        status: hasProvider ? 'available' : 'offline',
        capabilities: ['completion'],
      };
    } else if (agentSettings.agentType === 'remote' && agentSettings.url) {
      // For remote agents, test connectivity and get capabilities
      try {
        const authConfig = this.createA2AAuthConfig(agentSettings);
        const health = a2aService.getConnectionHealth(agentSettings.url);

        // Get agent info and capabilities
        const agentInfo = await a2aService.getAgentInfo(
          agentSettings.url,
          authConfig,
        );

        return {
          id: agentSettings.id,
          name: agentSettings.name,
          type: agentSettings.agentType,
          status: health.isHealthy ? 'available' : 'error',
          url: agentSettings.url,
          capabilities: agentInfo?.capabilities || [],
          lastSuccess: health.lastSuccess,
          failureCount: health.failureCount,
        };
      } catch (error) {
        return {
          id: agentSettings.id,
          name: agentSettings.name,
          type: agentSettings.agentType,
          status: 'error',
          url: agentSettings.url,
          capabilities: [],
          error:
            error instanceof A2AError
              ? error.getUserMessage()
              : error instanceof Error
                ? error.message
                : 'Unknown error',
        };
      }
    }

    return {
      id: agentSettings.id,
      name: agentSettings.name,
      type: agentSettings.agentType,
      status: 'offline',
      capabilities: [],
    };
  }
}

// Export singleton instance
export const agentManager = AgentManager.getInstance();
