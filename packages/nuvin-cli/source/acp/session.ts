/**
 * ACP Session Manager
 *
 * Manages individual ACP sessions and integrates with Nuvin's OrchestratorManager.
 * Each session maintains its own conversation context, tool state, and event handling.
 *
 * @module acp/session
 */

import type { AgentEvent } from '@nuvin/nuvin-core';
import { OrchestratorManager, type UIHandlers } from '../services/OrchestratorManager.js';
import { eventBus } from '../services/EventBus.js';
import type { ACPServer } from './server.js';
import { EventTranslator } from './event-translator.js';
import type {
  SessionId,
  ContentBlock,
  TextContent,
  ImageContent,
  StopReason,
  McpServer,
  ClientCapabilities,
} from './types.js';

// =============================================================================
// Types
// =============================================================================

/**
 * Options for initializing an ACP session
 */
export interface ACPSessionInitOptions {
  /** Working directory for the session */
  cwd: string;
  /** MCP servers to connect to */
  mcpServers?: McpServer[];
  /** Client capabilities */
  clientCapabilities?: ClientCapabilities;
}

/**
 * Result from handling a prompt
 */
export interface PromptResult {
  /** Reason why generation stopped */
  stopReason: StopReason;
}

/**
 * Image attachment extracted from content blocks
 */
interface ImageAttachment {
  mediaType: string;
  data: string;
}

// =============================================================================
// ACPSession Class
// =============================================================================

/**
 * Manages a single ACP session.
 *
 * Each session corresponds to a conversation with the agent, maintaining:
 * - Its own OrchestratorManager instance
 * - Working directory context
 * - MCP server connections
 * - Event translation and forwarding
 *
 * @example
 * ```typescript
 * const session = new ACPSession('session_123', server);
 * await session.initialize({ cwd: '/project', mcpServers: [] });
 * const result = await session.handlePrompt('Hello');
 * session.dispose();
 * ```
 */
export class ACPSession {
  /** Session identifier */
  public readonly id: SessionId;

  /** Reference to ACP server for sending notifications */
  private server: ACPServer;

  /** Orchestrator manager instance for this session */
  private orchestrator: OrchestratorManager;

  /** Working directory for the session */
  private cwd: string = '';

  /** MCP server configurations */
  private mcpServers: McpServer[] = [];

  /** Client capabilities */
  private clientCapabilities?: ClientCapabilities;

  /** Event translator for converting AgentEvents to ACP updates */
  private eventTranslator: EventTranslator | null = null;

  /** Event handler reference for cleanup */
  private eventHandler: ((event: AgentEvent) => void) | null = null;

  /** Abort controller for cancelling ongoing operations */
  private abortController: AbortController | null = null;

  /** Promise resolver for pending prompt completion */
  private pendingPromptResolver: ((result: PromptResult) => void) | null = null;

  /** Whether the session has been initialized */
  private initialized: boolean = false;

  // ---------------------------------------------------------------------------
  // Constructor
  // ---------------------------------------------------------------------------

  /**
   * Create a new ACP session.
   *
   * @param id - Unique session identifier
   * @param server - Reference to the ACP server for sending notifications
   */
  constructor(id: SessionId, server: ACPServer) {
    this.id = id;
    this.server = server;
    this.orchestrator = new OrchestratorManager();
  }

  // ---------------------------------------------------------------------------
  // Initialization
  // ---------------------------------------------------------------------------

  /**
   * Initialize the session with the provided options.
   *
   * Sets up the working directory, MCP servers, and event handling.
   * Must be called before processing any prompts.
   *
   * @param options - Session initialization options
   */
  async initialize(options: ACPSessionInitOptions): Promise<void> {
    if (this.initialized) {
      throw new Error('Session already initialized');
    }

    this.cwd = options.cwd;
    this.mcpServers = options.mcpServers ?? [];
    this.clientCapabilities = options.clientCapabilities;

    // Change working directory
    try {
      process.chdir(this.cwd);
    } catch (error) {
      throw new Error(`Failed to change directory to ${this.cwd}: ${error}`);
    }

    // Create dummy UI handlers for ACP mode (we don't use the UI system)
    const dummyHandlers: UIHandlers = {
      appendLine: () => {},
      updateLine: () => {},
      updateLineMetadata: () => {},
      handleError: (message) => {
        // Log errors but don't crash
        console.error('[ACP Session Error]', message);
      },
    };

    // Initialize orchestrator
    await this.orchestrator.init(
      {
        memPersist: true,
        sessionId: this.id,
        streamingChunks: true,
      },
      dummyHandlers,
    );

    // Create event translator for converting AgentEvents to ACP updates
    this.eventTranslator = new EventTranslator(this.id, this.server);

    // Subscribe to agent events
    this.eventHandler = (event: AgentEvent) => {
      this.handleAgentEvent(event);
    };
    eventBus.on('agent:event', this.eventHandler);

    // TODO: Initialize MCP servers from mcpServers config
    // This will be handled by the orchestrator's MCP manager

    this.initialized = true;
  }

  // ---------------------------------------------------------------------------
  // Prompt Handling
  // ---------------------------------------------------------------------------

  /**
   * Handle a prompt from the client.
   *
   * Converts the prompt to text (if content blocks are provided),
   * sends it to the orchestrator, and returns when processing completes.
   *
   * @param prompt - Either a string prompt or array of content blocks
   * @returns Promise resolving to the stop reason
   */
  async handlePrompt(prompt: string | ContentBlock[]): Promise<PromptResult> {
    if (!this.initialized) {
      throw new Error('Session not initialized');
    }

    // Convert content blocks to message payload
    let messagePayload: string | { text: string; attachments?: Array<{ type: 'image'; mimeType: string; data: string }> };

    if (typeof prompt === 'string') {
      messagePayload = prompt;
    } else {
      const textPrompt = this.contentBlocksToText(prompt);
      const attachments = this.extractImageAttachments(prompt);

      if (attachments.length > 0) {
        messagePayload = {
          text: textPrompt,
          attachments: attachments.map((att) => ({
            type: 'image' as const,
            mimeType: att.mediaType,
            data: att.data,
          })),
        };
      } else {
        messagePayload = textPrompt;
      }
    }

    // Create abort controller for cancellation
    this.abortController = new AbortController();

    // Create promise that resolves when Done event is received
    const completionPromise = new Promise<PromptResult>((resolve) => {
      this.pendingPromptResolver = resolve;
    });

    try {
      // Send message to orchestrator
      await this.orchestrator.send(
        messagePayload,
        {
          signal: this.abortController.signal,
        },
      );

      // Wait for Done event (handled by event listener)
      return await completionPromise;
    } catch (error) {
      // If cancelled, return cancelled stop reason
      if (this.abortController?.signal.aborted) {
        return { stopReason: 'cancelled' };
      }

      // Re-throw other errors
      throw error;
    } finally {
      this.abortController = null;
      this.pendingPromptResolver = null;
    }
  }

  // ---------------------------------------------------------------------------
  // Cancellation
  // ---------------------------------------------------------------------------

  /**
   * Cancel an ongoing operation.
   *
   * @param _operationId - Optional specific operation to cancel (reserved for future use)
   */
  cancel(_operationId?: string): void {
    // Abort the current operation
    if (this.abortController) {
      this.abortController.abort();
    }

    // Resolve pending prompt with cancelled reason
    if (this.pendingPromptResolver) {
      this.pendingPromptResolver({ stopReason: 'cancelled' });
      this.pendingPromptResolver = null;
    }
  }

  // ---------------------------------------------------------------------------
  // Session Lifecycle
  // ---------------------------------------------------------------------------

  /**
   * Close and clean up the session.
   *
   * Unsubscribes from events and releases resources.
   */
  async close(): Promise<void> {
    this.dispose();

    // Clean up orchestrator resources
    await this.orchestrator.cleanup();
  }

  /**
   * Dispose of session resources.
   *
   * Called during close() or when the session needs to be cleaned up.
   */
  dispose(): void {
    // Cancel any pending operations
    this.cancel();

    // Unsubscribe from events
    if (this.eventHandler) {
      eventBus.off('agent:event', this.eventHandler);
      this.eventHandler = null;
    }

    this.eventTranslator = null;
    this.initialized = false;
  }

  // ---------------------------------------------------------------------------
  // Event Handling
  // ---------------------------------------------------------------------------

  /**
   * Handle an agent event from the orchestrator.
   *
   * Translates the event to ACP format and sends it to the client.
   * Also handles completion detection via the Done event.
   */
  private handleAgentEvent(event: AgentEvent): void {
    // Translate and send the event
    if (this.eventTranslator) {
      this.eventTranslator.translate(event);
    }

    // Check for completion events
    if (event.type === 'done') {
      // Resolve pending prompt with success
      if (this.pendingPromptResolver) {
        this.pendingPromptResolver({
          stopReason: this.mapFinishReasonToStopReason(undefined),
        });
        this.pendingPromptResolver = null;
      }
    } else if (event.type === 'error') {
      // Resolve pending prompt with error (refusal)
      if (this.pendingPromptResolver) {
        this.pendingPromptResolver({ stopReason: 'refusal' });
        this.pendingPromptResolver = null;
      }
    } else if (event.type === 'stream_finish') {
      // Check finish reason
      if (this.pendingPromptResolver && event.finishReason) {
        const stopReason = this.mapFinishReasonToStopReason(event.finishReason);
        if (stopReason !== 'end_turn') {
          // Only resolve early for non-normal completions
          this.pendingPromptResolver({ stopReason });
          this.pendingPromptResolver = null;
        }
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Helper Methods
  // ---------------------------------------------------------------------------

  /**
   * Convert content blocks to plain text.
   *
   * Extracts text content from TextContent blocks and concatenates them.
   * Other content types (images, resources) are ignored for the text representation.
   */
  private contentBlocksToText(blocks: ContentBlock[]): string {
    return blocks
      .filter((block): block is TextContent => block.type === 'text')
      .map((block) => block.text)
      .join('\n');
  }

  /**
   * Extract image attachments from content blocks.
   *
   * Returns an array of image data that can be passed to the orchestrator.
   */
  private extractImageAttachments(blocks: ContentBlock[]): ImageAttachment[] {
    return blocks
      .filter((block): block is ImageContent => block.type === 'image')
      .map((block) => ({
        mediaType: block.source.mediaType,
        data: block.source.data,
      }));
  }

  /**
   * Map LLM finish reason to ACP stop reason.
   */
  private mapFinishReasonToStopReason(finishReason?: string): StopReason {
    switch (finishReason) {
      case 'stop':
      case 'end_turn':
        return 'end_turn';
      case 'length':
      case 'max_tokens':
        return 'max_tokens';
      case 'content_filter':
      case 'refusal':
        return 'refusal';
      case 'tool_use':
        // Tool use is not a final stop reason, continue processing
        return 'end_turn';
      default:
        return 'end_turn';
    }
  }

  // ---------------------------------------------------------------------------
  // Getters
  // ---------------------------------------------------------------------------

  /**
   * Get the session's working directory.
   */
  getCwd(): string {
    return this.cwd;
  }

  /**
   * Get the session's MCP server configurations.
   */
  getMcpServers(): McpServer[] {
    return this.mcpServers;
  }

  /**
   * Get the client capabilities for this session.
   */
  getClientCapabilities(): ClientCapabilities | undefined {
    return this.clientCapabilities;
  }

  /**
   * Check if the session is initialized.
   */
  isInitialized(): boolean {
    return this.initialized;
  }

  /**
   * Get the orchestrator manager for this session.
   */
  getOrchestrator(): OrchestratorManager {
    return this.orchestrator;
  }
}
