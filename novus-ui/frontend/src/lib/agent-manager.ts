import { AgentSettings, ProviderConfig, Message } from '@/types';
import { LogError } from '@wails/runtime';
import { generateUUID } from './utils';

import { a2aService, A2AAuthConfig, A2AMessageOptions, A2AError, A2AErrorType } from './a2a';
import type { Task, Message as A2AMessage, Part } from './a2a';

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
  }

  setActiveProvider(provider: ProviderConfig): void {
    this.activeProvider = provider;
    console.log(`Active provider set to: ${provider.name} (${provider.type})`);
  }

  getActiveAgent(): AgentSettings | null {
    return this.activeAgent;
  }

  getActiveProvider(): ProviderConfig | null {
    return this.activeProvider;
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
      let response: MessageResponse;

      if (this.activeAgent.agentType === 'remote' && this.activeAgent.url) {
        response = await this.sendA2AMessage(content, options, messageId, timestamp, startTime);
      } else {
        throw new Error('Not supported');
      }

              // Store in conversation history
        if (options.conversationId) {
          this.addToConversationHistory(options.conversationId, [
            {
              id: this.generateMessageId(),
              role: 'user',
              content,
              timestamp
            },
            {
              id: this.generateMessageId(),
              role: 'assistant',
              content: response.content,
              timestamp: response.timestamp
            }
          ]);
        }

      return response;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';

      if (options.onError) {
        options.onError(error instanceof Error ? error : new Error(errorMessage));
      }

      throw error;
    }
  }

  private async sendA2AMessage(
    content: string,
    options: SendMessageOptions,
    messageId: string,
    timestamp: string,
    startTime: number
  ): Promise<MessageResponse> {
    if (!this.activeAgent?.url) {
      throw new Error('No URL configured for remote agent');
    }

    try {
      const authConfig = this.createA2AAuthConfig(this.activeAgent);

      // Prepare A2A message options
      const a2aOptions: A2AMessageOptions = {
        contextId: options.contextId,
        taskId: options.taskId,
        blocking: !options.stream,
        acceptedOutputModes: ['text'],
        timeout: options.timeout,
        enableRetry: options.enableRetry,
        maxRetries: options.maxRetries
      };

      // Handle streaming vs non-streaming
      if (options.stream && options.onChunk) {
        return await this.sendA2AStreamingMessage(
          content,
          options,
          messageId,
          timestamp,
          startTime,
          authConfig,
          a2aOptions
        );
      } else {
        const response = await a2aService.sendMessage(
          this.activeAgent.url,
          content,
          authConfig,
          a2aOptions
        );

        // If task is still working, poll for completion
        let finalResponse = response;
        if (response.kind === 'task' && response.status.state === 'working') {
          finalResponse = await this.pollForTaskCompletion(
            this.activeAgent.url,
            response.id,
            authConfig,
            options.timeout || 60000
          );
        }

        const responseTime = Date.now() - startTime;
        const responseContent = this.extractA2AResponseContent(finalResponse);

        if (options.onComplete) {
          options.onComplete(responseContent);
        }

        return {
          id: messageId,
          content: responseContent,
          role: 'assistant',
          timestamp: new Date().toISOString(),
          metadata: {
            agentType: 'remote',
            agentId: this.activeAgent.id,
            responseTime,
            model: 'A2A Agent',
            taskId: finalResponse.kind === 'task' ? finalResponse.id : undefined
          }
        };
      }
    } catch (error) {
      LogError(`Error sending A2A message: ${error}`);
      // Enhanced error handling with user-friendly messages
      if (error instanceof A2AError) {
        throw new Error(error.getUserMessage());
      }

      throw new Error(`A2A communication failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Poll for task completion with exponential backoff
   */
  private async pollForTaskCompletion(
    agentUrl: string,
    taskId: string,
    authConfig?: A2AAuthConfig,
    totalTimeout: number = 60000
  ): Promise<Task> {
    const startTime = Date.now();
    let pollInterval = 1000; // Start with 1 second
    const maxPollInterval = 5000; // Max 5 seconds between polls

    console.log(`Polling for task completion: ${taskId}`);

    while (Date.now() - startTime < totalTimeout) {
      try {
        const task = await a2aService.getTask(agentUrl, taskId, authConfig);

        if (!task) {
          throw new Error(`Task ${taskId} not found`);
        }

        // Check if task is completed
        if (task.status.state === 'completed') {
          console.log(`Task completed: ${taskId}`);
          return task;
        }

        // Check for terminal states
        if (['failed', 'canceled'].includes(task.status.state)) {
          console.warn(`Task ended with state: ${task.status.state}`);
          return task;
        }

        // Check for input required
        if (task.status.state === 'input-required') {
          console.log(`Task requires input: ${taskId}`);
          return task;
        }

        console.log(`Task still ${task.status.state}, polling again in ${pollInterval}ms`);

        // Wait before next poll
        await new Promise(resolve => setTimeout(resolve, pollInterval));

        // Exponential backoff
        pollInterval = Math.min(pollInterval * 1.5, maxPollInterval);

      } catch (error) {
        console.error('Error polling for task completion:', error);
        // Continue polling unless it's a critical error
        await new Promise(resolve => setTimeout(resolve, pollInterval));
      }
    }

    // Timeout reached, get final state
    try {
      const finalTask = await a2aService.getTask(agentUrl, taskId, authConfig);
      console.warn(`Task polling timeout reached for ${taskId}, final state: ${finalTask?.status.state}`);
      return finalTask || ({
        id: taskId,
        kind: 'task',
        contextId: undefined,
        status: { state: 'failed', message: { parts: [{ kind: 'text', text: 'Polling timeout' }] } },
        artifacts: []
      } as unknown as Task);
    } catch (error) {
      throw new Error(`Task polling timeout and failed to get final state: ${error}`);
    }
  }

  /**
   * Send A2A streaming message
   */
  private async sendA2AStreamingMessage(
    content: string,
    options: SendMessageOptions,
    messageId: string,
    timestamp: string,
    startTime: number,
    authConfig: A2AAuthConfig | undefined,
    a2aOptions: A2AMessageOptions
  ): Promise<MessageResponse> {
    if (!this.activeAgent?.url) {
      throw new Error('No URL configured for remote agent');
    }

    let accumulatedContent = '';
    let taskId: string | undefined;
    let finalTimestamp = new Date().toISOString();

    try {
      const stream = a2aService.sendMessageStream(
        this.activeAgent.url,
        content,
        authConfig,
        a2aOptions
      );

      for await (const event of stream) {
        if (event.kind === 'task') {
          taskId = event.id;

          // Extract content from task artifacts
          if (event.artifacts) {
            for (const artifact of event.artifacts) {
              for (const part of artifact.parts) {
                if (part.kind === 'text') {
                  const newContent = part.text;
                  if (newContent !== accumulatedContent) {
                    const chunk = newContent.substring(accumulatedContent.length);
                    accumulatedContent = newContent;

                    if (options.onChunk && chunk) {
                      options.onChunk(chunk);
                    }
                  }
                }
              }
            }
          }

          // Check if task is completed
          if (event.status.state === 'completed') {
            finalTimestamp = event.status.timestamp || finalTimestamp;
            break;
          }
        } else if (event.kind === 'message') {
          // Handle direct message responses
          for (const part of event.parts) {
            if (part.kind === 'text') {
              accumulatedContent += part.text;
              if (options.onChunk) {
                options.onChunk(part.text);
              }
            }
          }
        } else if (event.kind === 'artifact-update') {
          // Handle streaming artifact updates
          const artifact = event.artifact;
          for (const part of artifact.parts) {
            if (part.kind === 'text') {
              if (event.append) {
                accumulatedContent += part.text;
                if (options.onChunk) {
                  options.onChunk(part.text);
                }
              } else {
                accumulatedContent = part.text;
                if (options.onChunk) {
                  options.onChunk(part.text);
                }
              }
            }
          }
        }
      }

      const responseTime = Date.now() - startTime;

      if (options.onComplete) {
        options.onComplete(accumulatedContent);
      }

      return {
        id: messageId,
        content: accumulatedContent || 'No response content received',
        role: 'assistant',
        timestamp: finalTimestamp,
        metadata: {
          agentType: 'remote',
          agentId: this.activeAgent.id,
          responseTime,
          model: 'A2A Agent (Streaming)',
          taskId
        }
      };
    } catch (error) {
      // Enhanced error handling for streaming
      if (error instanceof A2AError) {
        throw new Error(error.getUserMessage());
      }

      throw new Error(`A2A streaming failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  private extractA2AResponseContent(response: Task | A2AMessage): string {
    if (response.kind === 'message') {
      // Extract text from message parts
      const textParts = response.parts
        .filter((part: Part) => part.kind === 'text')
        .map((part: any) => part.text)
        .join('\n');

      return textParts || 'No response content';
    } else if (response.kind === 'task') {
      // For tasks, check the status message first
      if (response.status.message?.parts) {
        const statusText = response.status.message.parts
          .filter((part: Part) => part.kind === 'text')
          .map((part: any) => part.text)
          .join('\n');

        if (statusText) {
          console.log('Found status message text:', statusText);
          return statusText;
        }
      }

      // If no status message, check artifacts (main response content)
      if (response.artifacts && response.artifacts.length > 0) {
        const artifactTexts = [];

        for (const artifact of response.artifacts) {
          console.log(`Processing artifact: ${artifact.name || artifact.artifactId}, parts: ${artifact.parts.length}`);
          const textParts = artifact.parts
            .filter((part: Part) => part.kind === 'text')
            .map((part: any) => part.text);

          if (textParts.length > 0) {
            artifactTexts.push(textParts.join('\n'));
          }
        }

        if (artifactTexts.length > 0) {
          const finalContent = artifactTexts.join('\n\n');
          console.log('Extracted artifact content:', finalContent.substring(0, 200) + '...');
          return finalContent;
        }
      }

      // If task is still in progress, return status info
      if (response.status.state === 'working') {
        return `Task is working... (ID: ${response.id})`;
      } else if (response.status.state === 'input-required') {
        return `Agent requires additional input to continue. (ID: ${response.id})`;
      } else if (response.status.state === 'submitted') {
        return `Task submitted and pending processing. (ID: ${response.id})`;
      } else if (response.status.state === 'failed') {
        const firstPart = response.status.message?.parts?.[0];
        const errorMessage = (firstPart?.kind === 'text' ? (firstPart as any).text : 'Unknown error') || 'Unknown error';
        return `Task failed: ${errorMessage} (ID: ${response.id})`;
      } else if (response.status.state === 'canceled') {
        return `Task was canceled. (ID: ${response.id})`;
      } else if (response.status.state === 'completed') {
        // Task completed but no artifacts - this might indicate an issue
        return `Task completed but no content available. (ID: ${response.id})`;
      }

      return `Task ${response.status.state} (ID: ${response.id})`;
    }

    return 'Unknown response format from A2A agent';
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