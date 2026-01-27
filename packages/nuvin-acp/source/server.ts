// packages/nuvin-acp/source/server.ts
import type { AgentEvent } from '@nuvin/nuvin-core';
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
  sendMessage: (text: string, options: { stream: boolean; signal: AbortSignal }) => Promise<void>;
  onEvent: (handler: (event: AgentEvent) => void) => void;
  handleToolApproval: (approvalId: string, decision: 'approve' | 'deny') => void;
}>;

export class ACPServer {
  private transport: StdioTransport;
  private handler: RequestHandler;
  private sessionManager: SessionManager;
  private permissionBridge: PermissionBridge;
  private eventAdapters = new Map<string, EventAdapter>();
  private orchestratorFactory: OrchestratorFactory;
  private orchestrators = new Map<string, Awaited<ReturnType<OrchestratorFactory>>>();

  constructor(orchestratorFactory: OrchestratorFactory) {
    this.transport = new StdioTransport();
    this.handler = new RequestHandler();
    this.sessionManager = new SessionManager();
    this.permissionBridge = new PermissionBridge(this.transport);
    this.orchestratorFactory = orchestratorFactory;

    this.registerMethods();
  }

  private registerMethods(): void {
    this.handler.register<InitializeParams, InitializeResult>(
      'initialize',
      this.handleInitialize.bind(this)
    );

    this.handler.register<NewSessionParams, NewSessionResult>(
      'session/new',
      this.handleNewSession.bind(this)
    );

    this.handler.register<PromptParams, PromptResult>(
      'session/prompt',
      this.handlePrompt.bind(this)
    );

    this.handler.registerNotification<CancelParams>(
      'session/cancel',
      this.handleCancel.bind(this)
    );
  }

  async start(): Promise<void> {
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

    // Wire up event handling
    orchestrator.onEvent(async (event) => {
      // Handle tool approval events specially
      if (event.type === AgentEventTypes.ToolApprovalRequired) {
        const decision = await this.permissionBridge.requestPermission(
          session.id,
          event.toolCalls[0]
        );
        orchestrator.handleToolApproval(event.approvalId, decision);
        return;
      }

      await eventAdapter.handleEvent(event);
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
}
