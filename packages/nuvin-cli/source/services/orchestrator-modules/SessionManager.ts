import * as path from 'node:path';

import {
  PersistedMemory,
  JsonFileMemoryPersistence,
  ConversationStore,
  type MemoryPort,
  type Message,
  type ConversationMetadata,
  type ToolRegistry,
  ConversationContext,
} from '@nuvin/nuvin-core';
import type { OrchestratorRuntime } from '../OrchestratorRuntime.js';
import { UIEventAdapter } from '@/adapters/index.js';
import { SessionBoundMetricsPort } from './utils.js';
import { sessionMetricsService } from '../SessionMetricsService.js';
import type { UIHandlers } from './types.js';

// ─── Types ─────────────────────────────────────────────────────────────────────

export type SessionManagerDeps = {
  getRuntime: () => OrchestratorRuntime | null;
  patchRuntime: (updates: Partial<OrchestratorRuntime>) => OrchestratorRuntime;
  getHandlers: () => UIHandlers | null;
  getProfilePaths: () => { sessionsDir: string; agentsDir: string };
  getCurrentConfig: () => { config: { session?: { persistEventLog?: boolean }; memory?: unknown } };
  getConversationContext: () => ConversationContext;
  getToolRegistry: () => ToolRegistry | null;
  getStreamingChunks: () => boolean;
};

// ─── SessionManager ────────────────────────────────────────────────────────────

/**
 * Owns session lifecycle: creation, resolution, switching, and
 * conversation metadata operations. Extracted from OrchestratorManager
 * to isolate session state management from orchestration concerns.
 */
export class SessionManager {
  private sessionId: string | null = null;
  private sessionDir: string | null = null;
  private sessionInitialized: boolean = false;
  private memPersist: boolean = false;

  constructor(private deps: SessionManagerDeps) {}

  // ─── State accessors ───────────────────────────────────────────────────────

  getSessionId(): string | null {
    return this.sessionId;
  }

  getSessionDir(): string | null {
    return this.sessionDir;
  }

  getSession(): Readonly<{ sessionId: string | null; sessionDir: string | null }> {
    return { sessionId: this.sessionId, sessionDir: this.sessionDir } as const;
  }

  isSessionInitialized(): boolean {
    return this.sessionInitialized;
  }

  getMemPersist(): boolean {
    return this.memPersist;
  }

  setMemPersist(value: boolean): void {
    this.memPersist = value;
  }

  /**
   * Bulk-set session state. Used by OrchestratorManager during init()
   * to set state that was resolved externally (e.g. explicit session from CLI flags).
   */
  setSessionState(state: {
    sessionId: string | null;
    sessionDir: string | null;
    sessionInitialized: boolean;
  }): void {
    this.sessionId = state.sessionId;
    this.sessionDir = state.sessionDir;
    this.sessionInitialized = state.sessionInitialized;
  }

  reset(): void {
    this.sessionId = null;
    this.sessionDir = null;
    this.sessionInitialized = false;
  }

  // ─── Pure helpers ──────────────────────────────────────────────────────────

  /**
   * Resolve session ID and directory from config.
   * Pure function: derives values from config + profile paths, no side effects.
   */
  resolveSession(config: { sessionId?: string; sessionDir?: string }): {
    sessionId: string;
    sessionDir: string;
  } {
    const sessionId = config.sessionId ?? String(Date.now());
    const { sessionsDir } = this.deps.getProfilePaths();
    const sessionDir = config.sessionDir ?? path.join(sessionsDir, sessionId);
    return { sessionId, sessionDir };
  }

  /**
   * Create a persisted memory for the given session directory and agent ID.
   * @param sessionDir - The session directory path
   * @param agentId - Agent identifier: 'cli' for main CLI, or 'agent:{type}:{id}' for sub-agents
   */
  createMemory(sessionDir: string, agentId: string): MemoryPort<Message> {
    const filename = `history.${agentId}.json`;
    return new PersistedMemory<Message>(new JsonFileMemoryPersistence(path.join(sessionDir, filename)));
  }

  /**
   * Create a new UIEventAdapter for the given session directory.
   */
  createEventAdapter(
    sessionDir: string,
    handlers: UIHandlers,
    persistEventLog: boolean,
    streamingChunks: boolean,
  ): UIEventAdapter {
    return new UIEventAdapter(
      handlers.appendLine,
      handlers.updateLine,
      handlers.updateLineMetadata,
      persistEventLog
        ? {
            filename: path.join(sessionDir, 'events.json'),
            streamingEnabled: streamingChunks,
          }
        : {
            streamingEnabled: streamingChunks,
          },
    );
  }

  // ─── Session lifecycle ─────────────────────────────────────────────────────

  /**
   * Initialize a persisted session lazily (on first message).
   * Migrates from in-memory to persisted storage.
   *
   * @param currentMemory - The current (in-memory) memory to migrate from.
   *   Passed explicitly so the caller owns the reference.
   */
  async initializePersistedSession(currentMemory?: MemoryPort<Message> | null): Promise<void> {
    const orchestrator = this.deps.getRuntime()?.orchestrator ?? null;
    const handlers = this.deps.getHandlers();

    if (!orchestrator || !handlers) {
      throw new Error('Orchestrator or handlers not initialized');
    }

    const { sessionId, sessionDir } = this.resolveSession({});
    const currentConfig = this.deps.getCurrentConfig();
    const persistEventLog = currentConfig.config.session?.persistEventLog ?? false;

    // Capture any messages that were loaded into in-memory storage (e.g. via --history flag)
    // before migrating to persisted storage so they are not lost.
    const conversationId = this.deps.getConversationContext().getActiveConversationId();
    const preloadedMessages = currentMemory ? await currentMemory.get(conversationId) : [];

    const newMemory = this.createMemory(sessionDir, 'cli');
    const newEventAdapter = this.createEventAdapter(
      sessionDir,
      handlers,
      persistEventLog,
      this.deps.getStreamingChunks(),
    );

    orchestrator.setMemory(newMemory);
    orchestrator.setEvents(newEventAdapter);
    orchestrator.setMetrics(new SessionBoundMetricsPort(sessionId, sessionMetricsService));
    orchestrator.setSessionId(sessionId);
    orchestrator.setSessionDir(sessionDir);

    // Also reinitialize sub-agent memory with persisted storage
    const toolRegistry = this.deps.getToolRegistry();
    if (toolRegistry) {
      const createAgentMemory = (agentKey: string) => this.createMemory(sessionDir, agentKey);
      toolRegistry.setSharedMemory(createAgentMemory);
    }

    // Update cross-cutting state via runtime store
    const newConversationStore = new ConversationStore(newMemory);
    this.deps.patchRuntime({ memory: newMemory, conversationStore: newConversationStore, sessionId, sessionDir });

    // Update local state
    this.sessionId = sessionId;
    this.sessionDir = sessionDir;
    this.sessionInitialized = true;

    await this.initializeDefaultConversation(newConversationStore);

    // Restore preloaded messages (e.g. from --history) into the new persistent memory.
    // Must run after initializeDefaultConversation to avoid being overwritten by it.
    if (preloadedMessages.length > 0) {
      await newMemory.set(conversationId, preloadedMessages);
    }
  }

  /**
   * Creates default conversation with initial metadata.
   * Idempotent: will not overwrite existing conversation metadata.
   */
  async initializeDefaultConversation(conversationStore: ConversationStore | null): Promise<void> {
    if (!conversationStore) {
      return;
    }

    const conversationId = this.deps.getConversationContext().getActiveConversationId();
    const conversation = await conversationStore.getConversation(conversationId);

    if (!conversation.metadata.createdAt) {
      await conversationStore.setConversation(conversationId, {
        messages: [],
        metadata: {
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          messageCount: 0,
        },
      });
    }
  }

  /**
   * Creates a new conversation session without reinitializing MCP servers.
   * This is more efficient than full reinit when you just want to start fresh conversation.
   */
  async createNewConversation(config: { memPersist?: boolean } = {}): Promise<{
    sessionId: string | null;
    sessionDir: string | null;
    memory: MemoryPort<Message>;
  }> {
    const orchestrator = this.deps.getRuntime()?.orchestrator ?? null;
    if (!orchestrator) {
      throw new Error('Orchestrator not initialized, wait a moment');
    }

    const handlers = this.deps.getHandlers();
    if (!handlers) {
      throw new Error('Handlers not initialized, wait a moment');
    }

    const memPersist = config.memPersist ?? this.memPersist;
    const { sessionId, sessionDir } = this.resolveSession({});

    const currentConfig = this.deps.getCurrentConfig();
    const persistEventLog = currentConfig.config.session?.persistEventLog ?? false;

    const newMemory = this.createMemory(sessionDir, 'cli');
    const newEventAdapter = this.createEventAdapter(
      sessionDir,
      handlers,
      persistEventLog,
      this.deps.getStreamingChunks(),
    );

    orchestrator.setMemory(newMemory);
    orchestrator.setEvents(newEventAdapter);
    orchestrator.setMetrics(new SessionBoundMetricsPort(sessionId, sessionMetricsService));
    if (memPersist) {
      orchestrator.setSessionId(sessionId);
      orchestrator.setSessionDir(sessionDir);
    }

    // Update cross-cutting state via runtime store
    const newSessionId = memPersist ? sessionId : null;
    const newSessionDir = memPersist ? sessionDir : null;
    this.deps.patchRuntime({
      memory: newMemory,
      conversationStore: new ConversationStore(newMemory),
      sessionId: newSessionId,
      sessionDir: newSessionDir,
    });

    // Update local state
    this.memPersist = memPersist;
    this.sessionId = newSessionId;
    this.sessionDir = newSessionDir;
    this.sessionInitialized = memPersist;

    return {
      sessionId: this.sessionId,
      sessionDir: this.sessionDir,
      memory: newMemory,
    };
  }

  /**
   * Switch to an existing session. Unlike createNewConversation, this assumes
   * the session directory already exists and won't create new directories.
   */
  async switchToSession(config: { sessionId: string; sessionDir: string }): Promise<{
    sessionId: string;
    sessionDir: string;
    memory: MemoryPort<Message>;
  }> {
    const orchestrator = this.deps.getRuntime()?.orchestrator ?? null;
    if (!orchestrator) {
      throw new Error('Orchestrator not initialized, wait a moment');
    }

    const handlers = this.deps.getHandlers();
    if (!handlers) {
      throw new Error('Handlers not initialized, wait a moment');
    }

    const { sessionId, sessionDir } = config;

    const currentConfig = this.deps.getCurrentConfig();
    const persistEventLog = currentConfig.config.session?.persistEventLog ?? false;

    const newMemory = this.createMemory(sessionDir, 'cli');
    const newEventAdapter = this.createEventAdapter(
      sessionDir,
      handlers,
      persistEventLog,
      this.deps.getStreamingChunks(),
    );

    orchestrator.setMemory(newMemory);
    orchestrator.setEvents(newEventAdapter);
    orchestrator.setMetrics(new SessionBoundMetricsPort(sessionId, sessionMetricsService));
    orchestrator.setSessionId(sessionId);
    orchestrator.setSessionDir(sessionDir);

    // Update cross-cutting state via runtime store
    this.deps.patchRuntime({
      memory: newMemory,
      conversationStore: new ConversationStore(newMemory),
      sessionId,
      sessionDir,
    });

    // Update local state
    this.memPersist = true;
    this.sessionId = sessionId;
    this.sessionDir = sessionDir;
    this.sessionInitialized = true;

    return {
      sessionId: this.sessionId,
      sessionDir: this.sessionDir,
      memory: newMemory,
    };
  }

  // ─── Conversation metadata ─────────────────────────────────────────────────

  /**
   * Updates metadata after sending a message.
   * Accepts store and memory as parameters to avoid coupling to OM state.
   */
  async updateConversationMetadataAfterSend(
    conversationStore: ConversationStore | null,
    memory: MemoryPort<Message> | null,
    conversationId: string,
    metrics?: {
      promptTokens?: number;
      completionTokens?: number;
      totalTokens?: number;
      toolCalls?: number;
      responseTimeMs?: number;
      cost?: number;
    },
  ): Promise<void> {
    if (!conversationStore || !memory) {
      return;
    }

    const messages = await memory.get(conversationId);
    await conversationStore.updateMetadata(conversationId, {
      messageCount: messages.length,
    });

    if (metrics) {
      await conversationStore.recordRequestMetrics(conversationId, metrics);
    }
  }

  /**
   * Gets conversation metadata.
   */
  async getConversationMetadata(
    conversationStore: ConversationStore | null,
    conversationId: string,
  ): Promise<ConversationMetadata> {
    if (!conversationStore) {
      throw new Error('ConversationStore not initialized');
    }

    const conversation = await conversationStore.getConversation(conversationId);
    return conversation.metadata;
  }

  /**
   * Lists all conversations.
   */
  async listConversations(
    conversationStore: ConversationStore | null,
  ): Promise<Array<{ id: string; metadata: ConversationMetadata }>> {
    if (!conversationStore) {
      throw new Error('ConversationStore not initialized');
    }

    return conversationStore.listConversations();
  }
}
