/**
 * A2A (Agent-to-Agent) service following the official A2A specification v0.2.5
 * Uses the official @a2a-js/sdk for proper protocol compliance
 */

// Import the A2A SDK client and types
import { A2AClient } from '@a2a-js/sdk/build/src/client/client.js';
import type {
  AgentCard,
  MessageSendParams,
  Message,
  Task,
  TaskQueryParams,
  TaskIdParams,
  TaskStatusUpdateEvent,
  TaskArtifactUpdateEvent,
  Part,
  TextPart,
  FilePart,
  DataPart,
  SendMessageResponse,
  GetTaskResponse,
  CancelTaskResponse,
} from '@a2a-js/sdk/build/src/types.js';
import { LogError, LogInfo } from '@wails/runtime';
import { fetchProxy, smartFetch } from './fetch-proxy';

// Re-export types that may be needed by other modules
export type {
  AgentCard,
  MessageSendParams,
  Message,
  Task,
  TaskQueryParams,
  TaskIdParams,
  TaskStatusUpdateEvent,
  TaskArtifactUpdateEvent,
  Part,
  TextPart,
  FilePart,
  DataPart,
  SendMessageResponse,
  GetTaskResponse,
  CancelTaskResponse
};

/**
 * Authentication configuration for A2A clients
 */
export interface A2AAuthConfig {
  type: 'bearer' | 'apikey' | 'basic' | 'none';
  token?: string;
  username?: string;
  password?: string;
  headerName?: string;
}

/**
 * Configuration for sending A2A messages
 */
export interface A2AMessageOptions {
  /** Task ID to continue an existing task */
  taskId?: string;
  /** Context ID for conversation grouping */
  contextId?: string;
  /** Whether to block until completion */
  blocking?: boolean;
  /** History length to include in response */
  historyLength?: number;
  /** Accepted output modes */
  acceptedOutputModes?: string[];
  /** Push notification configuration */
  pushNotificationConfig?: {
    url: string;
    token?: string;
    authentication?: {
      schemes: string[];
      credentials?: string;
    };
  };
  /** Timeout in milliseconds (default: 30000) */
  timeout?: number;
  /** Enable retry logic (default: true) */
  enableRetry?: boolean;
  /** Maximum retry attempts (default: 3) */
  maxRetries?: number;
}

/**
 * A2A Task with extended information
 */
export interface A2ATaskInfo extends Task {
  /** Agent URL this task belongs to */
  agentUrl: string;
  /** Agent name for display */
  agentName: string;
  /** Created timestamp */
  createdAt: Date;
  /** Last updated timestamp */
  lastUpdated: Date;
}

/**
 * Streaming event data from A2A agents
 */
export type A2AStreamEvent = Message | Task | TaskStatusUpdateEvent | TaskArtifactUpdateEvent;

/**
 * Error types for better error handling
 */
export enum A2AErrorType {
  NETWORK_ERROR = 'NETWORK_ERROR',
  TIMEOUT_ERROR = 'TIMEOUT_ERROR',
  AUTHENTICATION_ERROR = 'AUTHENTICATION_ERROR',
  AGENT_ERROR = 'AGENT_ERROR',
  PROTOCOL_ERROR = 'PROTOCOL_ERROR',
  UNKNOWN_ERROR = 'UNKNOWN_ERROR'
}

/**
 * Enhanced A2A Error class
 */
export class A2AError extends Error {
  constructor(
    message: string,
    public type: A2AErrorType,
    public code?: number,
    public agentUrl?: string,
    public taskId?: string,
    public originalError?: Error
  ) {
    super(message);
    this.name = 'A2AError';
  }

  /**
   * Create user-friendly error message
   */
  getUserMessage(): string {
    switch (this.type) {
      case A2AErrorType.NETWORK_ERROR:
        return `Unable to connect to the agent${this.agentUrl ? ` at ${this.agentUrl}` : ''}. Please check your internet connection and verify the agent URL is correct.`;

      case A2AErrorType.TIMEOUT_ERROR:
        return `The agent${this.agentUrl ? ` at ${this.agentUrl}` : ''} took too long to respond. Please try again or check if the agent is experiencing issues.`;

      case A2AErrorType.AUTHENTICATION_ERROR:
        return `Authentication failed${this.agentUrl ? ` for ${this.agentUrl}` : ''}. Please verify your credentials and try again.`;

      case A2AErrorType.AGENT_ERROR:
        return `The agent${this.agentUrl ? ` at ${this.agentUrl}` : ''} encountered an error while processing your request. ${this.message}`;

      case A2AErrorType.PROTOCOL_ERROR:
        return `There was a communication issue with the agent${this.agentUrl ? ` at ${this.agentUrl}` : ''}. The agent may not be compatible with the A2A protocol.`;

      default:
        return `An unexpected error occurred${this.agentUrl ? ` with ${this.agentUrl}` : ''}. Please try again.`;
    }
  }

  /**
   * Check if error is retryable
   */
  isRetryable(): boolean {
    return this.type === A2AErrorType.NETWORK_ERROR ||
           this.type === A2AErrorType.TIMEOUT_ERROR ||
           (this.type === A2AErrorType.AGENT_ERROR && this.code !== -32001); // Not retryable for parse errors
  }
}

/**
 * Retry configuration
 */
interface RetryConfig {
  maxRetries: number;
  initialDelay: number;
  maxDelay: number;
  backoffFactor: number;
}

/**
 * Default retry configuration
 */
const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxRetries: 3,
  initialDelay: 1000,
  maxDelay: 10000,
  backoffFactor: 2
};

/**
 * Service for managing A2A (Agent-to-Agent) communication
 * Follows the official A2A specification v0.2.5
 */

export class A2AService {

  private static instance: A2AService;
  private clients: Map<string, A2AClient> = new Map();
  private authConfigs: Map<string, A2AAuthConfig> = new Map();
  private tasks: Map<string, A2ATaskInfo> = new Map();
  private connectionHealth: Map<string, { lastSuccess: Date; failureCount: number }> = new Map();

  private constructor() {}

  static getInstance(): A2AService {
    if (!A2AService.instance) {
      A2AService.instance = new A2AService();
    }
    return A2AService.instance;
  }

  /**
   * Sleep utility for retry delays
   */
  private async sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Calculate retry delay with exponential backoff
   */
  private calculateRetryDelay(attempt: number, config: RetryConfig): number {
    const delay = config.initialDelay * Math.pow(config.backoffFactor, attempt - 1);
    return Math.min(delay, config.maxDelay);
  }

  /**
   * Execute operation with retry logic
   */
  private async withRetry<T>(
    operation: () => Promise<T>,
    agentUrl: string,
    options?: { timeout?: number; enableRetry?: boolean; maxRetries?: number }
  ): Promise<T> {
    const config = { ...DEFAULT_RETRY_CONFIG, maxRetries: options?.maxRetries || 3 };
    const enableRetry = options?.enableRetry ?? true;
    const timeout = options?.timeout || 30000;

    if (!enableRetry) {
      return this.withTimeout(operation, timeout, agentUrl);
    }

    let lastError: Error;

    for (let attempt = 1; attempt <= config.maxRetries + 1; attempt++) {
      try {
        const result = await this.withTimeout(operation, timeout, agentUrl);

        // Success - update connection health
        this.connectionHealth.set(agentUrl, {
          lastSuccess: new Date(),
          failureCount: 0
        });

        return result;
      } catch (error) {
        LogError(`Error: ${error}`);
        lastError = error as Error;

        // Update failure count
        const health = this.connectionHealth.get(agentUrl) || { lastSuccess: new Date(0), failureCount: 0 };
        health.failureCount++;
        this.connectionHealth.set(agentUrl, health);

        // Check if error is retryable and we have attempts left
        const a2aError = this.classifyError(error as Error, agentUrl);

        if (!a2aError.isRetryable() || attempt > config.maxRetries) {
          throw a2aError;
        }

        // Calculate and wait for retry delay
        const delay = this.calculateRetryDelay(attempt, config);
        console.warn(`A2A operation failed (attempt ${attempt}/${config.maxRetries + 1}), retrying in ${delay}ms:`, error);
        await this.sleep(delay);
      }
    }

    throw this.classifyError(lastError!, agentUrl);
  }

  /**
   * Execute operation with timeout
   */
  private async withTimeout<T>(
    operation: () => Promise<T>,
    timeoutMs: number,
    agentUrl: string
  ): Promise<T> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new A2AError(
          `Operation timed out after ${timeoutMs}ms`,
          A2AErrorType.TIMEOUT_ERROR,
          undefined,
          agentUrl
        ));
      }, timeoutMs);

      operation()
        .then(result => {
          clearTimeout(timer);
          resolve(result);
        })
        .catch(error => {
          clearTimeout(timer);
          reject(error);
        });
    });
  }

  /**
   * Classify error type for better handling
   */
  private classifyError(error: Error, agentUrl?: string, taskId?: string): A2AError {
    if (error instanceof A2AError) {
      return error;
    }

    // Network errors
    if (error instanceof TypeError && error.message.includes('Failed to fetch')) {
      return new A2AError(
        'Network connection failed',
        A2AErrorType.NETWORK_ERROR,
        undefined,
        agentUrl,
        taskId,
        error
      );
    }

    // Check for A2A protocol errors
    if (error.message.includes('A2A request failed:')) {
      const codeMatch = error.message.match(/code: (-?\d+)/);
      const code = codeMatch ? parseInt(codeMatch[1]) : undefined;

      // Classify by A2A error codes
      if (code === -32001) {
        return new A2AError(error.message, A2AErrorType.PROTOCOL_ERROR, code, agentUrl, taskId, error);
      } else if (code === -32002) {
        return new A2AError(error.message, A2AErrorType.AGENT_ERROR, code, agentUrl, taskId, error);
      } else if (code === -32003) {
        return new A2AError(error.message, A2AErrorType.AUTHENTICATION_ERROR, code, agentUrl, taskId, error);
      }

      return new A2AError(error.message, A2AErrorType.AGENT_ERROR, code, agentUrl, taskId, error);
    }

    // Authentication errors
    if (error.message.includes('authentication') || error.message.includes('401') || error.message.includes('403')) {
      return new A2AError(error.message, A2AErrorType.AUTHENTICATION_ERROR, undefined, agentUrl, taskId, error);
    }

    // Default to unknown error
    return new A2AError(error.message, A2AErrorType.UNKNOWN_ERROR, undefined, agentUrl, taskId, error);
  }

  /**
   * Get or create A2A client for a base URL
   */
  private getClient(agentBaseUrl: string, authConfig?: A2AAuthConfig): A2AClient {
    if (!this.clients.has(agentBaseUrl)) {
      LogInfo(`Creating A2A client for ${agentBaseUrl}`);
      const client = new A2AClient(agentBaseUrl);
      this.clients.set(agentBaseUrl, client);
    }

    // Store auth config for future use
    if (authConfig) {
      this.authConfigs.set(agentBaseUrl, authConfig);
    }

    return this.clients.get(agentBaseUrl)!;
  }

  /**
   * Get global object for current environment
   */
  private getGlobalObject(): any {
    if (typeof window !== 'undefined') {
      return window;
    }
    if (typeof global !== 'undefined') {
      return global;
    }
    if (typeof self !== 'undefined') {
      return self;
    }
    throw new Error('Unable to locate global object');
  }

  /**
   * Create authenticated fetch function
   */
  private createAuthenticatedFetch(authConfig: A2AAuthConfig): typeof fetch {
    return async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      const requestInit = { ...init };
      const headers = { ...requestInit.headers } as Record<string, string>;

      switch (authConfig.type) {
        case 'bearer':
          if (authConfig.token) {
            headers['Authorization'] = `Bearer ${authConfig.token}`;
          }
          break;

        case 'apikey':
          if (authConfig.token && authConfig.headerName) {
            headers[authConfig.headerName] = authConfig.token;
          } else if (authConfig.token) {
            headers['X-API-Key'] = authConfig.token;
          }
          break;

        case 'basic':
          if (authConfig.username && authConfig.password) {
            const credentials = btoa(`${authConfig.username}:${authConfig.password}`);
            headers['Authorization'] = `Basic ${credentials}`;
          }
          break;
      }

      requestInit.headers = headers;
      return fetchProxy(input, requestInit);
    };
  }

  /**
   * Apply authentication by patching the global object temporarily
   */
  private patchClientAuth(authConfig: A2AAuthConfig): () => void {
    const globalObj = this.getGlobalObject();
    const originalFetch = globalObj.fetch;

    // Replace with authenticated fetch
    globalObj.fetch = this.createAuthenticatedFetch(authConfig);

    // Return cleanup function
    return () => {
      globalObj.fetch = originalFetch;
    };
  }

  /**
   * Get connection health for an agent
   */
  getConnectionHealth(agentUrl: string): { isHealthy: boolean; lastSuccess: Date; failureCount: number } {
    const health = this.connectionHealth.get(agentUrl);
    if (!health) {
      return { isHealthy: true, lastSuccess: new Date(0), failureCount: 0 };
    }

    const isHealthy = health.failureCount < 3 &&
                     (Date.now() - health.lastSuccess.getTime()) < 300000; // 5 minutes

    return {
      isHealthy,
      lastSuccess: health.lastSuccess,
      failureCount: health.failureCount
    };
  }

  /**
   * Discover an agent's capabilities by fetching its agent card
   */
  async discoverAgent(agentBaseUrl: string, authConfig?: A2AAuthConfig): Promise<AgentCard> {
    // Validate URL format
    try {
      new URL(agentBaseUrl);
    } catch (urlError) {
      LogInfo(`Invalid agent URL format: ${agentBaseUrl}. Please provide a valid HTTP/HTTPS URL.`);
      throw new A2AError(
        `Invalid agent URL format: ${agentBaseUrl}. Please provide a valid HTTP/HTTPS URL.`,
        A2AErrorType.PROTOCOL_ERROR,
        undefined,
        agentBaseUrl
      );
    }

    return this.withRetry(async () => {
      const client = this.getClient(agentBaseUrl, authConfig);

      // Apply authentication if needed
      let cleanup: (() => void) | undefined;
      if (authConfig && authConfig.type !== 'none') {
        cleanup = this.patchClientAuth(authConfig);
      }

      try {
        LogInfo(`Fetching agent card from: ${agentBaseUrl}`);

        // Try using the SDK client first
        try {
          const agentCard = await client.getAgentCard();
          LogInfo(`Agent card retrieved successfully: ${agentCard.name}`);
          return agentCard;
        } catch (sdkError) {
          LogError(`SDK client failed: ${sdkError}, trying direct fetch...`);

          // Fallback to direct fetch using smart fetch
          const authFetch = authConfig && authConfig.type !== 'none'
            ? this.createAuthenticatedFetch(authConfig)
            : smartFetch;

          const response = await authFetch(`${agentBaseUrl}/.well-known/agent.json`);

          if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
          }

          const agentCard = await response.json() as AgentCard;
          LogInfo(`Agent card retrieved via direct fetch: ${agentCard.name}`);
          return agentCard;
        }
      } catch (error) {
        LogError(`Failed to load agent card: ${error instanceof Error ? error.message : String(error)}`);
        throw error;
      } finally {
        // Restore original fetch if it was patched
        if (cleanup) {
          cleanup();
        }
      }
    }, agentBaseUrl, { timeout: 10000 });
  }

  /**
   * Test connectivity to an A2A agent
   */
  async testConnection(agentBaseUrl: string, authConfig?: A2AAuthConfig): Promise<boolean> {
    LogInfo(`Testing connection to: ${agentBaseUrl}`);
    try {
      await this.discoverAgent(agentBaseUrl, authConfig);
      return true;
    } catch (error) {
      console.error('A2A connection test failed:', error);
      return false;
    }
  }

  /**
   * Create a properly formatted A2A Message object
   */
  private createMessage(
    content: string | Part[],
    role: 'user' | 'agent' = 'user',
    options?: Partial<Pick<Message, 'contextId' | 'taskId' | 'referenceTaskIds'>>
  ): Message {
    const parts: Part[] = Array.isArray(content)
      ? content
      : [{ kind: 'text', text: content } as TextPart];

    return {
      kind: 'message',
      messageId: `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      role,
      parts,
      contextId: options?.contextId,
      taskId: options?.taskId,
      referenceTaskIds: options?.referenceTaskIds
    };
  }

  /**
   * Send a message to an A2A agent
   */
  async sendMessage(
    agentBaseUrl: string,
    content: string | Part[],
    authConfig?: A2AAuthConfig,
    options?: A2AMessageOptions
  ): Promise<Task | Message> {

    const enableRetry = options?.enableRetry ?? true;
    const timeout = options?.timeout || 30000;
    const maxRetries = options?.maxRetries || 3;

    return this.withRetry(async () => {
      const client = this.getClient(agentBaseUrl, authConfig);

      LogInfo(`Sending message to ${agentBaseUrl}: ${JSON.stringify(content, null, 2)}`);

      // Apply authentication if needed
      let cleanup: (() => void) | undefined;
      if (authConfig && authConfig.type !== 'none') {
        cleanup = this.patchClientAuth(authConfig);
      }

      try {
        // Create the message
        const message = this.createMessage(content, 'user', {
          contextId: options?.contextId,
          taskId: options?.taskId
        });

        // Prepare send parameters
        const params: MessageSendParams = {
          message,
          configuration: {
            acceptedOutputModes: options?.acceptedOutputModes || ['text'],
            blocking: options?.blocking ?? true,
            historyLength: options?.historyLength,
            pushNotificationConfig: options?.pushNotificationConfig
          }
        };

        console.log(`Sending A2A message to ${agentBaseUrl}:`, message.parts[0]);

        // Send via SDK client
        const response: SendMessageResponse = await client.sendMessage(params);

        console.log('A2A params:', params);

        // Handle the response
        if (this.isErrorResponse(response)) {
          const error = new A2AError(
            `A2A request failed: ${response.error.message}`,
            this.classifyA2AErrorCode(response.error.code),
            response.error.code,
            agentBaseUrl
          );
          throw error;
        }

        const result = response.result;

        // Store task information if it's a task
        if (result.kind === 'task') {
          const taskInfo: A2ATaskInfo = {
            ...result,
            agentUrl: agentBaseUrl,
            agentName: '', // Will be filled when we get agent card
            createdAt: new Date(),
            lastUpdated: new Date()
          };

          // Try to get agent name from cache or fetch it
          try {
            const agentCard = await this.discoverAgent(agentBaseUrl, authConfig);
            taskInfo.agentName = agentCard.name;
          } catch {
            taskInfo.agentName = new URL(agentBaseUrl).hostname;
          }

          this.tasks.set(result.id, taskInfo);
        }

        return result;
      } finally {
        // Restore original fetch if it was patched
        if (cleanup) {
          cleanup();
        }
      }
    }, agentBaseUrl, { timeout, enableRetry, maxRetries });
  }

  /**
   * Send a message and stream real-time updates
   */
  async *sendMessageStream(
    agentBaseUrl: string,
    content: string | Part[],
    authConfig?: A2AAuthConfig,
    options?: A2AMessageOptions
  ): AsyncGenerator<A2AStreamEvent> {
    const timeout = options?.timeout || 60000; // Longer timeout for streaming

    try {
      const client = this.getClient(agentBaseUrl, authConfig);

      // Apply authentication if needed
      let cleanup: (() => void) | undefined;
      if (authConfig && authConfig.type !== 'none') {
        cleanup = this.patchClientAuth(authConfig);
      }

      try {
        // Create the message
        const message = this.createMessage(content, 'user', {
          contextId: options?.contextId,
          taskId: options?.taskId
        });

        // Prepare send parameters
        const params: MessageSendParams = {
          message,
          configuration: {
            acceptedOutputModes: options?.acceptedOutputModes || ['text'],
            blocking: false, // Streaming implies non-blocking
            historyLength: options?.historyLength,
            pushNotificationConfig: options?.pushNotificationConfig
          }
        };

        console.log(`Starting A2A stream to ${agentBaseUrl}:`, message.parts[0]);

        // Start streaming with timeout
        const streamPromise = client.sendMessageStream(params);
        const timeoutPromise = new Promise<never>((_, reject) => {
          setTimeout(() => {
            reject(new A2AError(
              `Stream timed out after ${timeout}ms`,
              A2AErrorType.TIMEOUT_ERROR,
              undefined,
              agentBaseUrl
            ));
          }, timeout);
        });

        const stream = await Promise.race([streamPromise, timeoutPromise]);

        for await (const event of stream) {
          // Update task info if we get a task event
          if (event.kind === 'task') {
            const taskInfo: A2ATaskInfo = {
              ...event,
              agentUrl: agentBaseUrl,
              agentName: '', // Will be filled when we get agent card
              createdAt: this.tasks.get(event.id)?.createdAt || new Date(),
              lastUpdated: new Date()
            };

            // Try to get agent name
            try {
              const agentCard = await this.discoverAgent(agentBaseUrl, authConfig);
              taskInfo.agentName = agentCard.name;
            } catch {
              taskInfo.agentName = this.tasks.get(event.id)?.agentName || new URL(agentBaseUrl).hostname;
            }

            this.tasks.set(event.id, taskInfo);
          }

          yield event;
        }

        // Update connection health on successful stream completion
        this.connectionHealth.set(agentBaseUrl, {
          lastSuccess: new Date(),
          failureCount: 0
        });

      } finally {
        // Restore original fetch if it was patched
        if (cleanup) {
          cleanup();
        }
      }
    } catch (error) {
      console.error('A2A sendMessageStream failed:', error);

      // Update failure count
      const health = this.connectionHealth.get(agentBaseUrl) || { lastSuccess: new Date(0), failureCount: 0 };
      health.failureCount++;
      this.connectionHealth.set(agentBaseUrl, health);

      const a2aError = this.classifyError(error as Error, agentBaseUrl);
      throw a2aError;
    }
  }

  /**
   * Get a task by ID
   */
  async getTask(
    agentBaseUrl: string,
    taskId: string,
    authConfig?: A2AAuthConfig,
    historyLength?: number,
    options?: { timeout?: number; enableRetry?: boolean; maxRetries?: number }
  ): Promise<Task> {
    const enableRetry = options?.enableRetry ?? true;
    const timeout = options?.timeout || 15000; // Shorter timeout for task queries
    const maxRetries = options?.maxRetries || 2;

    return this.withRetry(async () => {
      const client = this.getClient(agentBaseUrl, authConfig);

      // Apply authentication if needed
      let cleanup: (() => void) | undefined;
      if (authConfig && authConfig.type !== 'none') {
        cleanup = this.patchClientAuth(authConfig);
      }

      try {
        const params: TaskQueryParams = {
          id: taskId,
          historyLength
        };

        const response: GetTaskResponse = await client.getTask(params);

        if (this.isErrorResponse(response)) {
          const error = new A2AError(
            `Failed to get task: ${response.error.message}`,
            this.classifyA2AErrorCode(response.error.code),
            response.error.code,
            agentBaseUrl,
            taskId
          );
          throw error;
        }

        const task = response.result;

        // Update our local task info
        if (this.tasks.has(taskId)) {
          const taskInfo = this.tasks.get(taskId)!;
          taskInfo.status = task.status;
          taskInfo.artifacts = task.artifacts;
          taskInfo.history = task.history;
          taskInfo.lastUpdated = new Date();
        }

        return task;
      } finally {
        // Restore original fetch if it was patched
        if (cleanup) {
          cleanup();
        }
      }
    }, agentBaseUrl, { timeout, enableRetry, maxRetries });
  }

  /**
   * Cancel a task
   */
  async cancelTask(
    agentBaseUrl: string,
    taskId: string,
    authConfig?: A2AAuthConfig,
    options?: { timeout?: number; enableRetry?: boolean; maxRetries?: number }
  ): Promise<Task> {
    const enableRetry = options?.enableRetry ?? true;
    const timeout = options?.timeout || 15000;
    const maxRetries = options?.maxRetries || 2;

    return this.withRetry(async () => {
      const client = this.getClient(agentBaseUrl, authConfig);

      // Apply authentication if needed
      let cleanup: (() => void) | undefined;
      if (authConfig && authConfig.type !== 'none') {
        cleanup = this.patchClientAuth(authConfig);
      }

      try {
        const params: TaskIdParams = { id: taskId };
        const response: CancelTaskResponse = await client.cancelTask(params);

        if (this.isErrorResponse(response)) {
          const error = new A2AError(
            `Failed to cancel task: ${response.error.message}`,
            this.classifyA2AErrorCode(response.error.code),
            response.error.code,
            agentBaseUrl,
            taskId
          );
          throw error;
        }

        const task = response.result;

        // Update our local task info
        if (this.tasks.has(taskId)) {
          const taskInfo = this.tasks.get(taskId)!;
          taskInfo.status = task.status;
          taskInfo.lastUpdated = new Date();
        }

        return task;
      } finally {
        // Restore original fetch if it was patched
        if (cleanup) {
          cleanup();
        }
      }
    }, agentBaseUrl, { timeout, enableRetry, maxRetries });
  }

  /**
   * Classify A2A error codes into error types
   */
  private classifyA2AErrorCode(code: number): A2AErrorType {
    switch (code) {
      case -32001: // Parse error
        return A2AErrorType.PROTOCOL_ERROR;
      case -32002: // Invalid request
        return A2AErrorType.PROTOCOL_ERROR;
      case -32003: // Method not found
        return A2AErrorType.PROTOCOL_ERROR;
      case -32004: // Invalid params
        return A2AErrorType.PROTOCOL_ERROR;
      case -32005: // Internal error
        return A2AErrorType.AGENT_ERROR;
      case -32006: // Agent error
        return A2AErrorType.AGENT_ERROR;
      default:
        return A2AErrorType.AGENT_ERROR;
    }
  }

  /**
   * Get agent capabilities
   */
  async getCapabilities(agentBaseUrl: string, authConfig?: A2AAuthConfig): Promise<string[]> {
    try {
      const agentCard = await this.discoverAgent(agentBaseUrl, authConfig);
      const capabilities: string[] = [];

      if (agentCard.capabilities?.streaming) capabilities.push('streaming');
      if (agentCard.capabilities?.pushNotifications) capabilities.push('pushNotifications');
      if (agentCard.capabilities?.stateTransitionHistory) capabilities.push('stateTransitionHistory');

      return capabilities;
    } catch (error) {
      console.error('Failed to get agent capabilities:', error);
      return [];
    }
  }

  /**
   * Get agent information
   */
  async getAgentInfo(agentBaseUrl: string, authConfig?: A2AAuthConfig): Promise<{
    name: string;
    description: string;
    capabilities: string[];
    skills: { id: string; name: string; description: string }[];
  } | null> {
    try {
      const agentCard = await this.discoverAgent(agentBaseUrl, authConfig);
      return {
        name: agentCard.name,
        description: agentCard.description,
        capabilities: await this.getCapabilities(agentBaseUrl, authConfig),
        skills: agentCard.skills.map(skill => ({
          id: skill.id,
          name: skill.name,
          description: skill.description
        }))
      };
    } catch (error) {
      console.error('Failed to get agent info:', error);
      return null;
    }
  }

  /**
   * Get all tracked tasks
   */
  getTasks(): A2ATaskInfo[] {
    return Array.from(this.tasks.values()).sort((a, b) =>
      b.lastUpdated.getTime() - a.lastUpdated.getTime()
    );
  }

  /**
   * Get tasks for a specific agent
   */
  getTasksForAgent(agentBaseUrl: string): A2ATaskInfo[] {
    return this.getTasks().filter(task => task.agentUrl === agentBaseUrl);
  }

  /**
   * Check if response is an error response
   */
  private isErrorResponse(response: any): response is { error: { message: string; code: number } } {
    return response && typeof response === 'object' && 'error' in response;
  }

  /**
   * Remove a task from tracking
   */
  removeTask(taskId: string): boolean {
    return this.tasks.delete(taskId);
  }

  /**
   * Clear all cached clients and tasks
   */
  clear(): void {
    this.clients.clear();
    this.authConfigs.clear();
    this.tasks.clear();
    this.connectionHealth.clear();
  }

  /**
   * Get all connection health statuses
   */
  getAllConnectionHealth(): Record<string, { isHealthy: boolean; lastSuccess: Date; failureCount: number }> {
    const result: Record<string, { isHealthy: boolean; lastSuccess: Date; failureCount: number }> = {};

    for (const [url, health] of this.connectionHealth.entries()) {
      result[url] = this.getConnectionHealth(url);
    }

    return result;
  }

  /**
   * Reset connection health for an agent
   */
  resetConnectionHealth(agentUrl: string): void {
    this.connectionHealth.delete(agentUrl);
  }

  /**
   * Test multiple agents connectivity concurrently
   */
  async testMultipleConnections(
    agents: Array<{ url: string; authConfig?: A2AAuthConfig }>
  ): Promise<Array<{ url: string; connected: boolean; error?: A2AError }>> {
    const promises = agents.map(async (agent) => {
      try {
        const connected = await this.testConnection(agent.url, agent.authConfig);
        return { url: agent.url, connected };
      } catch (error) {
        const a2aError = this.classifyError(error as Error, agent.url);
        return { url: agent.url, connected: false, error: a2aError };
      }
    });

    return Promise.all(promises);
  }
}

// Export singleton instance
export const a2aService = A2AService.getInstance();