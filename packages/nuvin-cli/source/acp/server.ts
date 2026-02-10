import * as fs from 'node:fs';
import * as path from 'node:path';
import type { AgentEvent, ToolExecutionResult } from '@nuvin/nuvin-core';
import { AgentEventTypes } from '@nuvin/nuvin-core';
import { ConfigManager } from '../config/manager.js';
import { getSessionDir } from '../hooks/useSessionManagement.js';
import type { TypedEventBus } from '../services/EventBus.js';
import { eventBus } from '../services/EventBus.js';
import type { OrchestratorManager } from '../services/OrchestratorManager.js';
import { toUserMessagePayload, toTextContentBlock } from './content.js';
import { loadSessionHistoryUpdates } from './history.js';

export type AcpInitializeParams = {
  protocolVersion: number;
  clientCapabilities: unknown;
};

export type AcpInitializeResult = {
  protocolVersion: number;
  agentCapabilities: {
    loadSession: boolean;
    promptCapabilities: {
      image: boolean;
      embeddedContext: boolean;
    };
  };
  agentInfo: { name: string; title: string; version: string };
  authMethods: unknown[];
};

export type AcpTransport = {
  send: (msg: unknown) => void;
};

type SessionUpdate = {
  sessionUpdate:
    | 'user_message_chunk'
    | 'agent_message_chunk'
    | 'tool_call'
    | 'tool_call_update'
    | 'error';
  [key: string]: unknown;
};

type AcpSessionNewParams = {
  cwd?: string;
  mcpServers?: unknown[];
};

type AcpSessionPromptParams = {
  sessionId: string;
  prompt: {
    content: Array<{ type: string; [key: string]: unknown }>;
  };
};

type AcpSessionLoadParams = {
  sessionId: string;
};

type AcpSetConfigOptionParams = {
  option?: string;
  name?: string;
  value: unknown;
};

type AcpPermissionResponseParams = {
  approvalId: string;
  decision: 'approve' | 'deny' | 'approve_all' | 'edit';
  editInstruction?: string;
};

export class AcpServer {
  private eventBus: TypedEventBus;
  private configManager: ConfigManager;
  private sessionId: string | null = null;
  private sessionDir: string | null = null;
  private streamingMessageIds = new Set<string>();
  private cancelController: AbortController | null = null;
  private streamingEnabled = true;
  private orchestratorReady = false;

  constructor(
    private deps: {
      transport: AcpTransport;
      orchestratorManager: OrchestratorManager;
      eventBus?: TypedEventBus;
      configManager?: ConfigManager;
    },
  ) {
    this.eventBus = deps.eventBus ?? eventBus;
    this.configManager = deps.configManager ?? ConfigManager.getInstance();
    this.eventBus.on('agent:event', (event) => this.handleAgentEvent(event));
  }

  async handleInitialize(params: AcpInitializeParams): Promise<AcpInitializeResult> {
    const config = this.configManager.getConfig();
    const memPersist = config.session?.memPersist ?? true;

    return {
      protocolVersion: params.protocolVersion,
      agentCapabilities: {
        loadSession: memPersist,
        promptCapabilities: { image: true, embeddedContext: true },
      },
      agentInfo: { name: 'nuvin', title: 'Nuvin', version: '0.0.0' },
      authMethods: [],
    };
  }

  async handleSessionNew(params: AcpSessionNewParams) {
    await this.ensureOrchestrator();

    const cwd = this.resolveCwd(params.cwd);
    const result = await this.deps.orchestratorManager.createNewConversation({ memPersist: true });

    this.sessionId = result.sessionId ?? String(Date.now());
    this.sessionDir = result.sessionDir ?? getSessionDir(this.sessionId, this.getCurrentProfile());

    return {
      sessionId: this.sessionId,
      cwd,
    };
  }

  async handleSessionLoad(params: AcpSessionLoadParams) {
    const sessionId = params.sessionId;
    if (!sessionId) {
      throw new Error('sessionId is required');
    }

    await this.ensureOrchestrator();

    const sessionDir = getSessionDir(sessionId, this.getCurrentProfile());
    if (!fs.existsSync(sessionDir)) {
      throw new Error(`Session directory not found: ${sessionDir}`);
    }

    await this.deps.orchestratorManager.switchToSession({ sessionId, sessionDir });
    this.sessionId = sessionId;
    this.sessionDir = sessionDir;

    const historyFile = path.join(sessionDir, 'history.cli.json');
    if (fs.existsSync(historyFile)) {
      const updates = await loadSessionHistoryUpdates(historyFile);
      for (const update of updates) {
        this.emitUpdate(update.update as SessionUpdate);
      }
    }

    return {
      sessionId: this.sessionId,
      cwd: process.cwd(),
    };
  }

  async handleSessionPrompt(params: AcpSessionPromptParams) {
    if (!this.sessionId || this.sessionId !== params.sessionId) {
      throw new Error('No active session');
    }

    const contentBlocks = params.prompt?.content ?? [];
    const payload = toUserMessagePayload(contentBlocks as never);

    this.cancelController?.abort();
    this.cancelController = new AbortController();

    try {
      const response = await this.deps.orchestratorManager.send(payload, {
        stream: this.streamingEnabled,
        signal: this.cancelController.signal,
      });

      return {
        stopReason: 'stop',
        message: response.content,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const cancelled = message.toLowerCase().includes('aborted');
      this.emitUpdate({ sessionUpdate: 'error', message, isError: true });
      return {
        stopReason: cancelled ? 'cancelled' : 'error',
      };
    }
  }

  async handleSessionCancel() {
    if (this.cancelController) {
      this.cancelController.abort();
      return { cancelled: true };
    }
    return { cancelled: false };
  }

  async handleSessionSetConfigOption(params: AcpSetConfigOptionParams) {
    const name = params.option ?? params.name;
    if (!name) {
      throw new Error('option is required');
    }

    this.applyConfigOption(name, params.value);
    this.emitConfigOptionsUpdate();

    return { ok: true };
  }

  async handleSessionResponsePermission(params: AcpPermissionResponseParams) {
    const orchestrator = this.deps.orchestratorManager.getOrchestrator?.();
    if (orchestrator?.handleToolApproval) {
      orchestrator.handleToolApproval(params.approvalId, params.decision, params.editInstruction);
    }

    return { ok: true };
  }

  private emitUpdate(update: SessionUpdate) {
    if (!this.sessionId) return;

    this.deps.transport.send({
      jsonrpc: '2.0',
      method: 'session/update',
      params: {
        sessionId: this.sessionId,
        update,
      },
    });
  }

  private emitPermissionRequest(toolCall: { id: string; function: { name: string; arguments: string }; approvalId?: string }) {
    if (!this.sessionId || !toolCall.approvalId) return;

    this.deps.transport.send({
      jsonrpc: '2.0',
      method: 'session/request_permission',
      params: {
        sessionId: this.sessionId,
        approvalId: toolCall.approvalId,
        toolCallId: toolCall.id,
        toolName: toolCall.function.name,
        toolArguments: toolCall.function.arguments,
      },
    });
  }

  private emitConfigOptionsUpdate() {
    this.deps.transport.send({
      jsonrpc: '2.0',
      method: 'config_options_update',
      params: {
        options: {
          streaming: this.streamingEnabled,
        },
      },
    });
  }

  private applyConfigOption(option: string, value: unknown) {
    switch (option) {
      case 'model':
        this.configManager.loadConfig({ model: String(value) }, 'direct');
        return;
      case 'provider':
        this.configManager.loadConfig({ activeProvider: String(value) }, 'direct');
        return;
      case 'thinking': {
        const normalized = String(value).toUpperCase();
        this.configManager.loadConfig({ thinking: normalized }, 'direct');
        return;
      }
      case 'reasoningEffort': {
        const normalized = String(value).toUpperCase();
        this.configManager.loadConfig({ thinking: normalized }, 'direct');
        return;
      }
      case 'requireToolApproval':
        this.configManager.loadConfig({ requireToolApproval: Boolean(value) }, 'direct');
        return;
      case 'stream':
      case 'streaming':
        this.streamingEnabled = Boolean(value);
        return;
      default:
        return;
    }
  }

  private resolveCwd(cwd?: string): string {
    if (!cwd) return process.cwd();
    const resolved = path.resolve(cwd);
    if (fs.existsSync(resolved)) {
      process.chdir(resolved);
      return resolved;
    }
    return process.cwd();
  }

  private async ensureOrchestrator() {
    if (this.orchestratorReady) return;

    await this.deps.orchestratorManager.init(
      { memPersist: true },
      {
        appendLine: () => {},
        updateLine: () => {},
        updateLineMetadata: () => {},
        handleError: () => {},
      },
    );

    this.orchestratorReady = true;
  }

  private handleAgentEvent(event: AgentEvent) {
    switch (event.type) {
      case AgentEventTypes.MessageStarted: {
        this.emitUpdate({
          sessionUpdate: 'user_message_chunk',
          content: toTextContentBlock(event.userContent),
        });
        return;
      }
      case AgentEventTypes.AssistantChunk: {
        this.streamingMessageIds.add(event.messageId);
        this.emitUpdate({
          sessionUpdate: 'agent_message_chunk',
          content: toTextContentBlock(event.delta),
        });
        return;
      }
      case AgentEventTypes.AssistantMessage: {
        if (this.streamingMessageIds.has(event.messageId)) return;
        if (event.content) {
          this.emitUpdate({
            sessionUpdate: 'agent_message_chunk',
            content: toTextContentBlock(event.content),
          });
        }
        return;
      }
      case AgentEventTypes.ToolCalls: {
        for (const call of event.toolCalls) {
          this.emitUpdate({
            sessionUpdate: 'tool_call',
            toolCallId: call.id,
            toolName: call.function.name,
            args: this.safeParseArgs(call.function.arguments),
          });
          if (call.requiresApproval && call.approvalId) {
            this.emitPermissionRequest(call);
          }
        }
        return;
      }
      case AgentEventTypes.ToolResult: {
        const tool = event.result as ToolExecutionResult;
        const contentText =
          typeof tool.result === 'string'
            ? tool.result
            : JSON.stringify(tool.result ?? '', null, 2);

        this.emitUpdate({
          sessionUpdate: 'tool_call_update',
          toolCallId: tool.id,
          status: tool.status,
          durationMs: tool.durationMs,
          content: toTextContentBlock(contentText),
        });
        return;
      }
      case AgentEventTypes.Error: {
        this.emitUpdate({ sessionUpdate: 'error', message: event.error, isError: true });
        return;
      }
      default:
        return;
    }
  }

  private safeParseArgs(raw: string) {
    try {
      return JSON.parse(raw);
    } catch {
      return raw;
    }
  }

  private getCurrentProfile(): string | undefined {
    if (typeof this.configManager.getCurrentProfile === 'function') {
      return this.configManager.getCurrentProfile();
    }
    return undefined;
  }
}
