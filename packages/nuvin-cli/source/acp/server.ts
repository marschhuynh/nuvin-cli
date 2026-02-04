/**
 * ACP Server - JSON-RPC server for Agent Client Protocol
 *
 * Handles bidirectional communication between editors (Zed, JetBrains, etc.)
 * and the Nuvin AI agent over stdio using JSON-RPC 2.0.
 */

import {
  createMessageConnection,
  StreamMessageReader,
  StreamMessageWriter,
  type MessageConnection,
} from 'vscode-jsonrpc/node.js';

import type {
  InitializeRequest,
  InitializeResponse,
  NewSessionRequest,
  NewSessionResponse,
  PromptRequest,
  PromptResponse,
  CancelNotification,
  SessionUpdate,
  SessionId,
  RequestPermissionRequest,
  RequestPermissionResponse,
  AgentCapabilities,
  AgentInfo,
} from './types.js';
import { PROTOCOL_VERSION, AcpMethod } from './types.js';
import type { ACPHandler } from './handler.js';
import { logRequest, logResponse, logNotification, logError, logServer } from './logger.js';

// =============================================================================
// Server Configuration
// =============================================================================

/**
 * Configuration options for the ACP server
 */
export interface ACPServerConfig {
  /** Agent name to report in initialize response */
  agentName?: string;
  /** Agent version to report in initialize response */
  agentVersion?: string;
  /** Custom agent capabilities */
  capabilities?: Partial<AgentCapabilities>;
}

const DEFAULT_CONFIG: Required<ACPServerConfig> = {
  agentName: 'Nuvin',
  agentVersion: '1.0.0',
  capabilities: {
    promptCapabilities: {
      streaming: true,
      cancellation: true,
    },
    sessionCapabilities: {
      multipleSessions: false,
      persistence: false,
    },
  },
};

// =============================================================================
// ACPServer Class
// =============================================================================

/**
 * ACP Server that handles JSON-RPC communication over stdio.
 *
 * The server delegates actual agent logic to an ACPHandler instance,
 * allowing separation between protocol handling and business logic.
 *
 * @example
 * ```typescript
 * const server = createACPServer();
 * server.setHandler(new MyACPHandler());
 * await server.start();
 * ```
 */
export class ACPServer {
  private connection: MessageConnection;
  private handler: ACPHandler | null = null;
  private initialized = false;
  private config: Required<ACPServerConfig>;
  private disposed = false;

  constructor(config: ACPServerConfig = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };

    // Create JSON-RPC connection over stdio
    this.connection = createMessageConnection(
      new StreamMessageReader(process.stdin),
      new StreamMessageWriter(process.stdout),
    );

    this.setupHandlers();
  }

  // ---------------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------------

  /**
   * Set the handler that will process ACP requests
   */
  setHandler(handler: ACPHandler): void {
    this.handler = handler;
    // Give handler reference to server for sending notifications
    if (handler.setServer) {
      handler.setServer(this);
    }
  }

  /**
   * Start listening for incoming JSON-RPC messages
   */
  start(): void {
    if (this.disposed) {
      throw new Error('Cannot start disposed server');
    }
    logServer('Starting ACP server');
    this.connection.listen();
  }

  /**
   * Send a session update notification to the client
   */
  sendSessionUpdate(sessionId: SessionId, update: SessionUpdate): void {
    if (this.disposed || !this.initialized) {
      return;
    }

    logNotification(AcpMethod.SessionUpdate, { sessionId, updateType: update.type });
    this.connection.sendNotification(AcpMethod.SessionUpdate, {
      sessionId,
      update,
    });
  }

  /**
   * Request permission from the client (agent -> client request)
   */
  async requestPermission(
    params: RequestPermissionRequest,
  ): Promise<RequestPermissionResponse> {
    if (this.disposed) {
      throw new Error('Server is disposed');
    }

    if (!this.initialized) {
      throw new Error('Server not initialized');
    }

    logRequest(AcpMethod.RequestPermission, params);
    const response = await this.connection.sendRequest<RequestPermissionResponse>(
      AcpMethod.RequestPermission,
      params,
    );
    logResponse(AcpMethod.RequestPermission, response);
    return response;
  }

  /**
   * Clean up resources and close the connection
   */
  dispose(): void {
    if (this.disposed) {
      return;
    }

    logServer('Disposing ACP server');
    this.disposed = true;
    this.connection.dispose();
  }

  /**
   * Check if the server has been initialized
   */
  isInitialized(): boolean {
    return this.initialized;
  }

  /**
   * Check if the server has been disposed
   */
  isDisposed(): boolean {
    return this.disposed;
  }

  // ---------------------------------------------------------------------------
  // Handler Setup
  // ---------------------------------------------------------------------------

  private setupHandlers(): void {
    // Initialize request - must be called first
    this.connection.onRequest(
      AcpMethod.Initialize,
      async (params: InitializeRequest): Promise<InitializeResponse> => {
        logRequest(AcpMethod.Initialize, params);
        const response = await this.handleInitialize(params);
        logResponse(AcpMethod.Initialize, response);
        return response;
      },
    );

    // Session management
    this.connection.onRequest(
      AcpMethod.NewSession,
      async (params: NewSessionRequest): Promise<NewSessionResponse> => {
        logRequest(AcpMethod.NewSession, params);
        this.ensureInitialized();
        const response = await this.handleNewSession(params);
        logResponse(AcpMethod.NewSession, response);
        return response;
      },
    );

    // Prompt handling
    this.connection.onRequest(
      AcpMethod.Prompt,
      async (params: PromptRequest): Promise<PromptResponse> => {
        const promptInfo = typeof params.prompt === 'string'
          ? { type: 'string', length: params.prompt.length }
          : { type: 'blocks', count: (params.prompt as unknown[]).length };
        logRequest(AcpMethod.Prompt, { sessionId: params.sessionId, prompt: promptInfo });
        this.ensureInitialized();
        const response = await this.handlePrompt(params);
        logResponse(AcpMethod.Prompt, response);
        return response;
      },
    );

    // Cancel notification (no response expected)
    this.connection.onNotification(
      AcpMethod.Cancel,
      (params: CancelNotification): void => {
        logRequest(AcpMethod.Cancel, params);
        if (this.initialized) {
          this.handleCancel(params);
        }
      },
    );

    // Shutdown request
    this.connection.onRequest(
      AcpMethod.Shutdown,
      async (): Promise<void> => {
        logRequest(AcpMethod.Shutdown, {});
        this.dispose();
      },
    );

    // Handle connection errors
    this.connection.onError((error) => {
      logError('Connection error', error);
    });

    // Handle connection close
    this.connection.onClose(() => {
      logServer('Connection closed');
      this.dispose();
    });
  }

  // ---------------------------------------------------------------------------
  // Request Handlers
  // ---------------------------------------------------------------------------

  private async handleInitialize(
    params: InitializeRequest,
  ): Promise<InitializeResponse> {
    if (this.initialized) {
      throw new Error('Server already initialized');
    }

    // Validate protocol version
    if (params.protocolVersion !== PROTOCOL_VERSION) {
      throw new Error(
        `Protocol version mismatch: client=${params.protocolVersion}, server=${PROTOCOL_VERSION}`,
      );
    }

    // Notify handler of initialization if set
    if (this.handler?.onInitialize) {
      await this.handler.onInitialize(params);
    }

    this.initialized = true;

    const agentInfo: AgentInfo = {
      name: this.config.agentName,
      version: this.config.agentVersion,
    };

    const agentCapabilities: AgentCapabilities = {
      ...DEFAULT_CONFIG.capabilities,
      ...this.config.capabilities,
    };

    return {
      protocolVersion: PROTOCOL_VERSION,
      agentInfo,
      agentCapabilities,
    };
  }

  private async handleNewSession(
    params: NewSessionRequest,
  ): Promise<NewSessionResponse> {
    this.ensureHandler();
    return this.handler!.onNewSession(params);
  }

  private async handlePrompt(params: PromptRequest): Promise<PromptResponse> {
    this.ensureHandler();
    return this.handler!.onPrompt(params);
  }

  private handleCancel(params: CancelNotification): void {
    if (this.handler?.onCancel) {
      this.handler.onCancel(params);
    }
  }

  // ---------------------------------------------------------------------------
  // Validation Helpers
  // ---------------------------------------------------------------------------

  private ensureInitialized(): void {
    if (!this.initialized) {
      throw new Error(
        'Server not initialized. Call initialize() first.',
      );
    }
  }

  private ensureHandler(): void {
    if (!this.handler) {
      throw new Error(
        'No handler set. Call setHandler() before processing requests.',
      );
    }
  }
}

// =============================================================================
// Factory Function
// =============================================================================

/**
 * Create a new ACP server instance
 *
 * @param config - Optional configuration for the server
 * @returns A new ACPServer instance
 *
 * @example
 * ```typescript
 * const server = createACPServer({
 *   agentName: 'MyAgent',
 *   agentVersion: '2.0.0',
 * });
 * server.setHandler(new MyHandler());
 * server.start();
 * ```
 */
export function createACPServer(config?: ACPServerConfig): ACPServer {
  return new ACPServer(config);
}
