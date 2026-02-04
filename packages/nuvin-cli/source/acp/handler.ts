/**
 * ACP Handler - Request handler for Agent Client Protocol
 *
 * Implements the business logic for handling ACP requests,
 * delegating session management to ACPSession instances.
 */

import type { ACPServer } from './server.js';
import type { ACPSession } from './session.js';
import type {
  InitializeRequest,
  InitializeResponse,
  NewSessionRequest,
  NewSessionResponse,
  PromptRequest,
  PromptResponse,
  CancelNotification,
  ClientCapabilities,
  SessionId,
  AgentCapabilities,
} from './types.js';
import { PROTOCOL_VERSION } from './types.js';
import { getVersionInfo } from '../utils/version.js';

// =============================================================================
// ACPHandler Interface
// =============================================================================

/**
 * Interface that defines handlers for ACP protocol requests.
 *
 * This interface is implemented by NuvinACPHandler and can be used
 * to create alternative handler implementations.
 */
export interface ACPHandler {
  /**
   * Handle the initialize request from the client.
   * Stores client capabilities and returns agent information.
   */
  handleInitialize(params: InitializeRequest): Promise<InitializeResponse>;

  /**
   * Handle a request to create a new session.
   * Creates and initializes a new ACPSession.
   */
  handleNewSession(params: NewSessionRequest): Promise<NewSessionResponse>;

  /**
   * Handle a prompt request within an existing session.
   * Delegates to the appropriate session for processing.
   */
  handlePrompt(params: PromptRequest): Promise<PromptResponse>;

  /**
   * Handle a cancellation notification.
   * Cancels ongoing operations in the specified session.
   */
  handleCancel(params: CancelNotification): void;

  /**
   * Set the server reference for sending notifications.
   * Called by ACPServer.setHandler().
   */
  setServer?(server: ACPServer): void;

  /**
   * Called when the server receives an initialize request.
   * This is a hook for the server's internal initialization handling.
   */
  onInitialize?(params: InitializeRequest): Promise<void>;

  /**
   * Called by the server when a new session request is received.
   */
  onNewSession(params: NewSessionRequest): Promise<NewSessionResponse>;

  /**
   * Called by the server when a prompt request is received.
   */
  onPrompt(params: PromptRequest): Promise<PromptResponse>;

  /**
   * Called by the server when a cancel notification is received.
   */
  onCancel?(params: CancelNotification): void;
}

// =============================================================================
// Error Codes
// =============================================================================

/**
 * ACP-specific error codes for JSON-RPC responses
 */
export const ACPErrorCode = {
  /** Session not found */
  SessionNotFound: -32002,
  /** Session already exists */
  SessionExists: -32003,
  /** Operation cancelled */
  Cancelled: -32004,
} as const;

export type ACPErrorCode = (typeof ACPErrorCode)[keyof typeof ACPErrorCode];

/**
 * Custom error class for ACP-specific errors
 */
export class ACPError extends Error {
  constructor(
    public readonly code: number,
    message: string,
    public readonly data?: unknown,
  ) {
    super(message);
    this.name = 'ACPError';
  }
}

// =============================================================================
// NuvinACPHandler Class
// =============================================================================

/**
 * Nuvin's implementation of the ACPHandler interface.
 *
 * Manages ACP sessions and delegates prompt processing to individual
 * ACPSession instances. Each session maintains its own conversation
 * context and tool state.
 *
 * @example
 * ```typescript
 * const server = createACPServer();
 * const handler = new NuvinACPHandler();
 * server.setHandler(handler);
 * await server.start();
 * ```
 */
export class NuvinACPHandler implements ACPHandler {
  /** Reference to the ACP server for sending notifications */
  private server: ACPServer | null = null;

  /** Active sessions indexed by session ID */
  private sessions: Map<SessionId, ACPSession> = new Map();

  /** Client capabilities stored from initialize request */
  private clientCapabilities: ClientCapabilities | undefined;

  // ---------------------------------------------------------------------------
  // Server Integration
  // ---------------------------------------------------------------------------

  /**
   * Set the server reference for sending notifications.
   * Called by ACPServer when this handler is set.
   */
  setServer(server: ACPServer): void {
    this.server = server;
  }

  /**
   * Get the current server reference.
   * Throws if no server has been set.
   */
  getServer(): ACPServer {
    if (!this.server) {
      throw new Error('Server not set. Handler must be registered with a server.');
    }
    return this.server;
  }

  // ---------------------------------------------------------------------------
  // ACPHandler Interface - Main Implementation
  // ---------------------------------------------------------------------------

  /**
   * Handle the initialize request from the client.
   *
   * Stores client capabilities and returns protocol version and agent information.
   * This method is called via onInitialize hook by the server.
   */
  async handleInitialize(params: InitializeRequest): Promise<InitializeResponse> {
    // Store client capabilities for later use
    this.clientCapabilities = params.clientCapabilities;

    // Get version info for agent identification
    const versionInfo = getVersionInfo();

    const agentCapabilities: AgentCapabilities = {
      promptCapabilities: {
        streaming: true,
        cancellation: true,
      },
      sessionCapabilities: {
        multipleSessions: true,
        persistence: false,
      },
      mcpCapabilities: {
        supported: true,
      },
    };

    return {
      protocolVersion: PROTOCOL_VERSION,
      agentInfo: {
        name: 'Nuvin',
        version: versionInfo.version,
      },
      agentCapabilities,
    };
  }

  /**
   * Handle a request to create a new session.
   *
   * Creates a new ACPSession, initializes it with the provided
   * working directory and MCP server configurations, and stores
   * it in the sessions map.
   */
  async handleNewSession(params: NewSessionRequest): Promise<NewSessionResponse> {
    // Generate unique session ID
    const sessionId = this.generateSessionId();

    // Create new session - ACPSession will be implemented in Task 4
    // Import is at top of file, expects ./session.js to exist
    const { ACPSession } = await import('./session.js');
    const session = new ACPSession(sessionId, this.getServer());

    // Initialize the session with provided parameters
    await session.initialize({
      cwd: params.cwd,
      mcpServers: params.mcpServers,
      clientCapabilities: this.clientCapabilities,
    });

    // Store session for future requests
    this.sessions.set(sessionId, session);

    return {
      sessionId,
      // TODO: Add configOptions and modes in future iterations
    };
  }

  /**
   * Handle a prompt request within an existing session.
   *
   * Looks up the session by ID and delegates prompt processing.
   * Returns the stop reason when processing completes.
   */
  async handlePrompt(params: PromptRequest): Promise<PromptResponse> {
    const session = this.sessions.get(params.sessionId);

    if (!session) {
      throw new ACPError(
        ACPErrorCode.SessionNotFound,
        `Session not found: ${params.sessionId}`,
      );
    }

    // Delegate to session for actual prompt processing
    const result = await session.handlePrompt(params.prompt);

    return {
      stopReason: result.stopReason,
    };
  }

  /**
   * Handle a cancellation notification.
   *
   * Looks up the session and cancels any ongoing operations.
   * This is a notification, so no response is expected.
   */
  handleCancel(params: CancelNotification): void {
    const session = this.sessions.get(params.sessionId);

    if (session) {
      session.cancel(params.operationId);
    }
    // Silently ignore if session not found - it may have been closed
  }

  // ---------------------------------------------------------------------------
  // Server Hooks (called by ACPServer)
  // ---------------------------------------------------------------------------

  /**
   * Hook called by the server during initialization.
   * Stores client capabilities for later use.
   */
  async onInitialize(params: InitializeRequest): Promise<void> {
    this.clientCapabilities = params.clientCapabilities;
  }

  /**
   * Delegates to handleNewSession.
   */
  async onNewSession(params: NewSessionRequest): Promise<NewSessionResponse> {
    return this.handleNewSession(params);
  }

  /**
   * Delegates to handlePrompt.
   */
  async onPrompt(params: PromptRequest): Promise<PromptResponse> {
    return this.handlePrompt(params);
  }

  /**
   * Delegates to handleCancel.
   */
  onCancel(params: CancelNotification): void {
    this.handleCancel(params);
  }

  // ---------------------------------------------------------------------------
  // Session Management
  // ---------------------------------------------------------------------------

  /**
   * Get a session by ID.
   * Returns undefined if the session doesn't exist.
   */
  getSession(sessionId: SessionId): ACPSession | undefined {
    return this.sessions.get(sessionId);
  }

  /**
   * Check if a session exists.
   */
  hasSession(sessionId: SessionId): boolean {
    return this.sessions.has(sessionId);
  }

  /**
   * Get all active session IDs.
   */
  getSessionIds(): SessionId[] {
    return Array.from(this.sessions.keys());
  }

  /**
   * Close and remove a session.
   * Called when a session is explicitly closed or times out.
   */
  async closeSession(sessionId: SessionId): Promise<void> {
    const session = this.sessions.get(sessionId);

    if (session) {
      await session.close();
      this.sessions.delete(sessionId);
    }
  }

  /**
   * Get the stored client capabilities.
   */
  getClientCapabilities(): ClientCapabilities | undefined {
    return this.clientCapabilities;
  }

  // ---------------------------------------------------------------------------
  // Private Helpers
  // ---------------------------------------------------------------------------

  /**
   * Generate a unique session ID.
   * Uses a combination of timestamp and random string for uniqueness.
   */
  private generateSessionId(): SessionId {
    const timestamp = Date.now().toString(36);
    const random = Math.random().toString(36).substring(2, 10);
    return `session_${timestamp}_${random}`;
  }
}
