import { AgentSettings, ProviderConfig, Message } from '@/types';
import { LogError } from '@wails/runtime';
import { generateUUID } from './utils';

import { a2aService, A2AAuthConfig, A2AMessageOptions, A2AError, A2AErrorType } from './a2a';
import type { Task, Message as A2AMessage, Part } from './a2a';
import { BaseAgent, LocalAgent, A2AAgent } from './agents';

/**
 * Message sending options
 */
export interface SendMessageOptions {
  conversationId?: string;
  contextId?: string;
  taskId?: string;
  stream?: boolean;
  onChunk?: (chunk: string) => void;
  onComplete?: (response: string) => void;
  onError?: (error: Error) => void;
  timeout?: number;
  enableRetry?: boolean;
  maxRetries?: number;
}

/**
 * Response from sending a message
 */
export interface MessageResponse {
  id: string;
  content: string;
  role: 'assistant';
  timestamp: string;
  metadata?: {
    model?: string;
    provider?: string;
    agentType: 'local' | 'remote';
    agentId: string;
    tokensUsed?: number;
    responseTime?: number;
    taskId?: string;
  };
}

/**
 * Agent status information
 */
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
}

/**
 * Central service for managing agents and message communication
 * Handles both local LLM providers and remote A2A agents
 */
export class AgentManager {
  private static instance: AgentManager;
  private activeAgent: AgentSettings | null = null;
  private activeProvider: ProviderConfig | null = null;
  private conversationHistory: Map<string, Message[]> = new Map();
  // Use centralized UUID generator for message IDs
  private generateMessageId = generateUUID;

  private agentInstance: BaseAgent | null = null;
  private constructor() {}

  static getInstance(): AgentManager {
    if (!AgentManager.instance) {
      AgentManager.instance = new AgentManager();
    }
    return AgentManager.instance;
  }

  setActiveAgent(agent: AgentSettings): void {
    this.activeAgent = agent;
    console.log(`Active agent set to: ${agent.name} (${agent.agentType})`);
    this.updateAgentInstance();
  }

  setActiveProvider(provider: ProviderConfig): void {
    this.activeProvider = provider;
    console.log(`Active provider set to: ${provider.name} (${provider.type})`);
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
    if (this.activeAgent.agentType === "local") {
      if (!this.activeProvider) {
        this.agentInstance = null;
        return;
      }
      this.agentInstance = new LocalAgent(this.activeAgent, this.activeProvider, this.conversationHistory);
    } else if (this.activeAgent.agentType === "remote") {
      this.agentInstance = new A2AAgent(this.activeAgent, this.conversationHistory);
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
      headerName: agent.auth.headerName
    };
  }

  async sendMessage(
    content: string,
    options: SendMessageOptions = {}
  ): Promise<MessageResponse> {
    if (!this.activeAgent) {
      throw new Error('No active agent selected');
    }

    const startTime = Date.now();
    const messageId = this.generateMessageId();
    const timestamp = new Date().toISOString();

    try {
      if (!this.agentInstance) {
        this.updateAgentInstance();
      }

      if (!this.agentInstance) {
        throw new Error('Agent instance not configured');
      }

      const response = await this.agentInstance.sendMessage(content, options);
      return response;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';

      if (options.onError) {
        options.onError(error instanceof Error ? error : new Error(errorMessage));
      }

      throw error;
    }
  }

  /**
   * Get conversation history for a conversation ID
   */
  getConversationHistory(conversationId: string): Message[] {
    return this.conversationHistory.get(conversationId) || [];
  }

  /**
   * Add messages to conversation history
   */
  private addToConversationHistory(conversationId: string, messages: Message[]): void {
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

  async getTask(agentUrl: string, taskId: string, options?: {
    timeout?: number;
    enableRetry?: boolean;
    maxRetries?: number;
  }): Promise<Task | null> {
    try {
      // Find agent settings for the URL to get auth config
      let authConfig: A2AAuthConfig | undefined;
      if (this.activeAgent?.url === agentUrl) {
        authConfig = this.createA2AAuthConfig(this.activeAgent);
      }

      return await a2aService.getTask(agentUrl, taskId, authConfig, undefined, options);
    } catch (error) {
      if (error instanceof A2AError) {
        console.error('Failed to get task:', error.getUserMessage());
      } else {
        console.error('Failed to get task:', error);
      }
      return null;
    }
  }

  async cancelTask(agentUrl: string, taskId: string, options?: {
    timeout?: number;
    enableRetry?: boolean;
    maxRetries?: number;
  }): Promise<boolean> {
    try {
      // Find agent settings for the URL to get auth config
      let authConfig: A2AAuthConfig | undefined;
      if (this.activeAgent?.url === agentUrl) {
        authConfig = this.createA2AAuthConfig(this.activeAgent);
      }

      const task = await a2aService.cancelTask(agentUrl, taskId, authConfig, options);
      return task.status.state === 'canceled';
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

  getAvailableModels(): string[] {
    if (!this.activeProvider) {
      return [];
    }

    // TODO: Implement dynamic model listing based on provider
    switch (this.activeProvider.type) {
      case 'OpenAI':
        return ['gpt-4', 'gpt-4-turbo', 'gpt-3.5-turbo', 'gpt-3.5-turbo-16k'];
      case 'Anthropic':
        return ['claude-3-opus', 'claude-3-sonnet', 'claude-3-haiku', 'claude-2'];
      case 'GitHub':
        return ['gpt-4', 'gpt-3.5-turbo'];
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
      return { connected: false, error: 'Invalid agent configuration for connectivity test' };
    }

    try {
      const authConfig = this.createA2AAuthConfig(agentSettings);
      const connected = await a2aService.testConnection(agentSettings.url, authConfig);

      if (connected) {
        return { connected: true };
      } else {
        return {
          connected: false,
          error: 'Connection test failed',
          userMessage: 'Unable to connect to the agent. Please verify the URL and authentication settings.'
        };
      }
    } catch (error) {
      if (error instanceof A2AError) {
        return {
          connected: false,
          error: error.message,
          userMessage: error.getUserMessage(),
          errorType: error.type
        };
      }

      return {
        connected: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        userMessage: 'An unexpected error occurred while testing the connection. Please try again.'
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
  async getAgentStatus(agentSettings: AgentSettings): Promise<AgentStatus> {
    if (agentSettings.agentType === 'local') {
      // For local agents, check if provider is configured
      const hasProvider = this.activeProvider !== null && this.activeProvider.apiKey !== '';
      return {
        id: agentSettings.id,
        name: agentSettings.name,
        type: agentSettings.agentType,
        status: hasProvider ? 'available' : 'offline',
        capabilities: ['completion']
      };
    } else if (agentSettings.agentType === 'remote' && agentSettings.url) {
      // For remote agents, test connectivity and get capabilities
      try {
        const authConfig = this.createA2AAuthConfig(agentSettings);
        const health = a2aService.getConnectionHealth(agentSettings.url);

        // Get agent info and capabilities
        const agentInfo = await a2aService.getAgentInfo(agentSettings.url, authConfig);

        return {
          id: agentSettings.id,
          name: agentSettings.name,
          type: agentSettings.agentType,
          status: health.isHealthy ? 'available' : 'error',
          url: agentSettings.url,
          capabilities: agentInfo?.capabilities || [],
          lastSuccess: health.lastSuccess,
          failureCount: health.failureCount
        };
      } catch (error) {
        return {
          id: agentSettings.id,
          name: agentSettings.name,
          type: agentSettings.agentType,
          status: 'error',
          url: agentSettings.url,
          capabilities: [],
          error: error instanceof A2AError ? error.getUserMessage() :
                 (error instanceof Error ? error.message : 'Unknown error')
        };
      }
    }

    return {
      id: agentSettings.id,
      name: agentSettings.name,
      type: agentSettings.agentType,
      status: 'offline',
      capabilities: []
    };
  }
}

// Export singleton instance
export const agentManager = AgentManager.getInstance();