// packages/nuvin-acp/source/server.ts
import type { AgentEvent, ToolCall, ToolApprovalDecision } from '@nuvin/nuvin-core';
import { AgentEventTypes } from '@nuvin/nuvin-core';
import { StdioTransport } from './transport/stdio.js';
import { RequestHandler } from './jsonrpc/handler.js';
import { SessionManager, type Session } from './session-manager.js';
import { EventAdapter } from './adapters/event-adapter.js';
import { PermissionBridge } from './adapters/permission-bridge.js';
import { isRequest, isResponse, isNotification } from './jsonrpc/types.js';
import type {
  InitializeParams,
  InitializeResult,
  NewSessionParams,
  NewSessionResult,
  PromptParams,
  PromptResult,
  CancelParams,
  ContentBlock,
} from './protocol/types.js';

// Factory type for creating orchestrator instances
export type OrchestratorFactory = (session: Session) => Promise<{
  sendMessage: (text: string, options: { stream: boolean; signal?: AbortSignal }) => Promise<void>;
  onEvent: (handler: (event: AgentEvent) => void) => void;
  handleToolApproval: (approvalId: string, decision: ToolApprovalDecision) => void;
}>;

export class ACPServer {
  private transport: StdioTransport;
  private handler: RequestHandler;
  private sessionManager: SessionManager;
  private permissionBridge: PermissionBridge;
  private eventAdapters = new Map<string, EventAdapter>();
  private orchestratorFactory: OrchestratorFactory;
  private orchestrators = new Map<string, Awaited<ReturnType<OrchestratorFactory>>>();
  private sessionApprovedTools = new Map<string, Set<string>>();

  constructor(orchestratorFactory: OrchestratorFactory) {
    this.transport = new StdioTransport();
    this.handler = new RequestHandler();
    this.sessionManager = new SessionManager();
    this.permissionBridge = new PermissionBridge(this.transport);
    this.orchestratorFactory = orchestratorFactory;

    this.registerMethods();
  }

  private registerMethods(): void {
    this.handler.register<InitializeParams, InitializeResult>('initialize', this.handleInitialize.bind(this));

    this.handler.register<NewSessionParams, NewSessionResult>('session/new', this.handleNewSession.bind(this));

    this.handler.register<PromptParams, PromptResult>('session/prompt', this.handlePrompt.bind(this));

    this.handler.registerNotification<CancelParams>('session/cancel', this.handleCancel.bind(this));
  }

  async start(): Promise<void> {
    // Log to stderr so it doesn't interfere with JSON-RPC on stdout
    console.error('[ACP] Server starting - listening for JSON-RPC messages on stdin');

    this.transport.onMessage(async (message) => {
      if (isResponse(message)) {
        this.permissionBridge.handleResponse(message);
        return;
      }

      if (isRequest(message) || isNotification(message)) {
        const response = await this.handler.handle(message);
        if (response) {
          await this.transport.send(response);
        }
      }
    });

    this.transport.start();
    console.error('[ACP] Server ready');
  }

  private async handleInitialize(params: InitializeParams): Promise<InitializeResult> {
    return {
      protocolVersion: 1,
      agentCapabilities: {
        loadSession: false,
        promptCapabilities: {
          image: true,
          embeddedContext: true,
        },
        mcpCapabilities: {
          http: false,
          sse: false,
        },
      },
      agentInfo: {
        name: 'nuvin',
        title: 'Nuvin CLI',
        version: '1.0.0',
      },
    };
  }

  private async handleNewSession(params: NewSessionParams): Promise<NewSessionResult> {
    const session = this.sessionManager.create({
      cwd: params.cwd,
      mcpServers: params.mcpServers,
    });

    // Create orchestrator for this session
    const orchestrator = await this.orchestratorFactory(session);
    this.orchestrators.set(session.id, orchestrator);

    // Create event adapter
    const eventAdapter = new EventAdapter(this.transport, session.id);
    this.eventAdapters.set(session.id, eventAdapter);

    // Initialize session approved tools set
    this.sessionApprovedTools.set(session.id, new Set());

    // Wire up event handling - event handler should NOT block
    orchestrator.onEvent((event) => {
      try {
        // Send event update to client first (e.g. show tool call in chat)
        // Don't await - let it run in background
        eventAdapter.handleEvent(event).catch(() => {});

        // Handle tool calls asynchronously - don't block the event handler
        if (event.type === AgentEventTypes.ToolCalls) {
          // Handle approval in background - don't block event handler
          this.handleToolCallsAsync(session.id, event.toolCalls, orchestrator).catch(() => {});
        }

        // Handle legacy ToolApprovalRequired (deprecated but kept for compatibility/safety)
        if (event.type === AgentEventTypes.ToolApprovalRequired) {
          this.handleLegacyToolApprovalAsync(session.id, event, orchestrator).catch(() => {});
        }
      } catch (error) {
        // Don't throw - event handlers should not throw
      }
    });

    return { sessionId: session.id };
  }

  private async handlePrompt(params: PromptParams): Promise<PromptResult> {
    const session = this.sessionManager.get(params.sessionId);
    if (!session) {
      throw new Error(`Session not found: ${params.sessionId}`);
    }

    const orchestrator = this.orchestrators.get(params.sessionId);
    if (!orchestrator) {
      throw new Error(`Orchestrator not found for session: ${params.sessionId}`);
    }

    const text = this.extractText(params.prompt);

    try {
      await orchestrator.sendMessage(text, {
        stream: true,
        signal: session.abortController.signal,
      });

      return { stopReason: 'end_turn' };
    } catch (error) {
      if (session.abortController.signal.aborted) {
        return { stopReason: 'cancelled' };
      }
      throw error;
    }
  }

  private async handleCancel(params: CancelParams): Promise<void> {
    this.sessionManager.cancel(params.sessionId);
  }

  /**
   * Handle tool approval asynchronously in the background.
   * This method is called from the event handler but runs independently.
   *
   * Note: The ACP protocol processes tools sequentially (one request_permission per tool).
   * This is by design - editors show approval prompts one at a time.
   */
  private async handleToolCallsAsync(
    sessionId: string,
    toolCalls: ToolCall[],
    orchestrator: {
      handleToolApproval: (approvalId: string, decision: ToolApprovalDecision) => void;
    },
  ): Promise<void> {
    // Filter tools that require approval
    const toolsNeedingApproval = toolCalls.filter((tc) => tc.requiresApproval && tc.approvalId);

    if (toolsNeedingApproval.length === 0) {
      return;
    }

    const sessionApproved = this.sessionApprovedTools.get(sessionId);
    if (!sessionApproved) {
      // Deny all tools if session is not found
      for (const toolCall of toolsNeedingApproval) {
        orchestrator.handleToolApproval(toolCall.approvalId!, 'deny');
      }
      return;
    }

    // Process tools in sequence
    // Note: ACP protocol is designed for sequential approval (one prompt at a time)
    for (const toolCall of toolsNeedingApproval) {
      const toolName = toolCall.function.name;

      // Check if tool is already approved for this session
      if (sessionApproved.has(toolName)) {
        orchestrator.handleToolApproval(toolCall.approvalId!, 'approve');
        continue;
      }

      // Request permission from user
      try {
        const decision = await this.permissionBridge.requestPermission(sessionId, toolCall);

        // Handle the decision
        if (decision === 'approve_always') {
          // Add to session-approved tools for future auto-approval
          sessionApproved.add(toolName);
          orchestrator.handleToolApproval(toolCall.approvalId!, 'approve');
        } else if (decision === 'approve') {
          orchestrator.handleToolApproval(toolCall.approvalId!, 'approve');
        } else {
          // Deny
          orchestrator.handleToolApproval(toolCall.approvalId!, 'deny');
        }
      } catch (_error) {
        // Default to deny on error to prevent hang
        orchestrator.handleToolApproval(toolCall.approvalId!, 'deny');
      }
    }
  }

  /**
   * Handle legacy ToolApprovalRequired event asynchronously.
   * This is deprecated but kept for backward compatibility.
   */
  private async handleLegacyToolApprovalAsync(
    sessionId: string,
    event: AgentEvent,
    orchestrator: {
      handleToolApproval: (approvalId: string, decision: ToolApprovalDecision) => void;
    },
  ): Promise<void> {
    if (event.type !== AgentEventTypes.ToolApprovalRequired) {
      return;
    }

    const toolCall = event.toolCalls[0];
    const toolName = toolCall.function.name;
    const sessionApproved = this.sessionApprovedTools.get(sessionId);

    if (!sessionApproved) {
      orchestrator.handleToolApproval(event.approvalId, 'deny');
      return;
    }

    if (sessionApproved.has(toolName)) {
      orchestrator.handleToolApproval(event.approvalId, 'approve');
      return;
    }

    try {
      const decision = await this.permissionBridge.requestPermission(sessionId, toolCall);

      if (decision === 'approve_always') {
        sessionApproved.add(toolName);
        orchestrator.handleToolApproval(event.approvalId, 'approve');
      } else {
        orchestrator.handleToolApproval(event.approvalId, decision);
      }
    } catch (_error) {
      orchestrator.handleToolApproval(event.approvalId, 'deny');
    }
  }

  private extractText(blocks: ContentBlock[]): string {
    return blocks
      .filter((b): b is { type: 'text'; text: string } => b.type === 'text')
      .map((b) => b.text)
      .join('\n');
  }
}

export async function startACPServer(factory: OrchestratorFactory): Promise<void> {
  const server = new ACPServer(factory);
  await server.start();

  // Keep the server running indefinitely
  // The server will only exit when stdin is closed or the process is killed
  await new Promise<void>(() => {
    // Never resolves - server runs until process is terminated
  });
}
