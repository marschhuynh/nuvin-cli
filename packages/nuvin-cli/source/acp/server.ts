import * as fs from "node:fs";
import * as path from "node:path";
import type { AgentEvent, ToolExecutionResult } from "@nuvin/nuvin-core";
import { AgentEventTypes } from "@nuvin/nuvin-core";
import { ConfigManager } from "../config/manager.js";
import { THINKING_LEVELS, type ThinkingLevel } from "../config/types.js";
import { getSessionDir } from "../hooks/useSessionManagement.js";
import { commandRegistry } from "../modules/commands/registry.js";
import type { CommandDefinition } from "../modules/commands/types.js";
import type { TypedEventBus } from "../services/EventBus.js";
import { eventBus } from "../services/EventBus.js";
import type { IOrchestratorManager } from "../services/IOrchestratorManager.js";
import { getVersion } from "../utils/version.js";
import {
  toUserMessagePayload,
  toTextContentBlock,
  type AcpContentBlock,
} from "./content.js";
import { loadSessionHistoryUpdates } from "./history.js";
import { AcpModelResolver } from "./model-resolver.js";
import {
  inferToolKind,
  formatToolCallTitle,
  safeParseArgs,
} from "./tool-formatter.js";

const ACP_PROTOCOL_VERSION = 1;
const ACP_DISABLED_TOOLS = new Set(["ask_user_tool"]);

type ToolApprovalDecision = "approve" | "deny" | "approve_all" | "edit";

type RequestPermissionResponse = {
  outcome?: {
    outcome?: "cancelled" | "selected";
    optionId?: string;
  };
};

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
      audio: boolean;
    };
    sessionCapabilities: {
      loadSession: boolean;
      list?: Record<string, never>;
      configureSession: {
        userConfigurable: {
          model: boolean;
          modes: boolean;
          modelReasoningEffort: boolean;
          configOptions: boolean;
        };
      };
      auth: {
        supportsAuthChange: boolean;
      };
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
    | "user_message_chunk"
    | "agent_message_chunk"
    | "agent_thought_chunk"
    | "tool_call"
    | "tool_call_update"
    | "config_option_update"
    | "available_commands_update";
  [key: string]: unknown;
};

type AcpSessionNewParams = {
  cwd?: string;
  mcpServers?: unknown[];
};

type AcpSessionListParams = {
  cwd?: string;
  cursor?: string;
};

type AcpSessionPromptParams = {
  sessionId: string;
  prompt?: unknown;
};

type AcpSessionLoadParams = {
  sessionId: string;
  cwd?: string;
  mcpServers?: unknown[];
};

type AcpSetConfigOptionParams = {
  sessionId?: string;
  configId?: string;
  option?: string;
  name?: string;
  value: unknown;
};

type AcpSetModelParams = {
  sessionId?: string;
  modelId?: string;
};

type AcpSetModeParams = {
  sessionId?: string;
  modeId?: string;
};

type LegacyPermissionResponseParams = {
  approvalId: string;
  decision: ToolApprovalDecision;
  editInstruction?: string;
};

type JsonRpcResponseMessage = {
  id?: number | string;
  result?: unknown;
  error?: unknown;
};

type PermissionRequestState = {
  approvalId: string;
};

type SessionModeState = {
  currentModeId: string;
  availableModes: Array<{
    id: string;
    name: string;
    description: string;
  }>;
};

type SessionConfigSelectOption = {
  value: string;
  name: string;
};

type SessionConfigOption = {
  type: "select";
  id: string;
  name: string;
  category: "mode" | "model" | "thought_level" | "other";
  currentValue: string;
  options: SessionConfigSelectOption[];
};

type AvailableCommand = {
  name: string;
  description: string;
  input?: {
    hint: string;
  };
};

export class AcpServer {
  private eventBus: TypedEventBus;
  private configManager: ConfigManager;
  private modelResolver: AcpModelResolver;
  private sessionId: string | null = null;
  private workingDirectory: string = process.cwd();
  private streamingMessageIds = new Set<string>();
  private toolCallTitles = new Map<string, string>();
  private cancelController: AbortController | null = null;
  private streamingEnabled = true;
  private orchestratorReady = false;
  private nextClientRequestId = 1;
  private pendingPermissionRequests = new Map<string, PermissionRequestState>();
  private deferredSessionUpdates: SessionUpdate[] = [];
  private readonly boundHandleAgentEvent = (event: AgentEvent) => this.handleAgentEvent(event);

  constructor(
    private deps: {
      transport: AcpTransport;
      orchestratorManager: IOrchestratorManager;
      eventBus?: TypedEventBus;
      configManager?: ConfigManager;
    }
  ) {
    this.eventBus = deps.eventBus ?? eventBus;
    this.configManager = deps.configManager ?? ConfigManager.getInstance();
    this.modelResolver = new AcpModelResolver(
      deps.orchestratorManager,
      this.configManager
    );
    this.eventBus.on("agent:event", this.boundHandleAgentEvent);
  }

  dispose(): void {
    this.eventBus.off("agent:event", this.boundHandleAgentEvent);
  }

  async handleInitialize(
    _params: AcpInitializeParams
  ): Promise<AcpInitializeResult> {
    const config = this.configManager.getConfig();
    const memPersist = config.session?.memPersist ?? true;

    this.streamingEnabled = config.streamingChunks ?? true;

    return {
      protocolVersion: ACP_PROTOCOL_VERSION,
      agentCapabilities: {
        loadSession: memPersist,
        promptCapabilities: {
          image: true,
          audio: false,
        },
        sessionCapabilities: {
          loadSession: memPersist,
          ...(memPersist ? { list: {} } : {}),
          configureSession: {
            userConfigurable: {
              model: true,
              modes: true,
              modelReasoningEffort: false,
              configOptions: true,
            },
          },
          auth: {
            supportsAuthChange: false,
          },
        },
      },
      agentInfo: { name: "nuvin", title: "Nuvin", version: getVersion() },
      authMethods: [],
    };
  }

  async handleSessionNew(params: AcpSessionNewParams) {
    await this.ensureOrchestrator();
    this.streamingMessageIds.clear();
    this.toolCallTitles.clear();    this.applyAcpToolRestrictions();
    this.streamingMessageIds.clear();
    this.toolCallTitles.clear();

    this.resolveCwd(params.cwd);

    const memPersist = this.isMemPersistEnabled();
    const result = await this.deps.orchestratorManager.createNewConversation({
      memPersist,
    });

    this.sessionId = result.sessionId ?? String(Date.now());
    this.scheduleAvailableCommandsUpdate();

    // Compute shared model IDs once for both config options and models state.
    const providers = this.deps.orchestratorManager.getAvailableProviders();
    const precomputedModels =
      await this.modelResolver.getAllModelIdsAcrossProviders(providers);

    return {
      sessionId: this.sessionId,
      configOptions: await this.buildSessionConfigOptions(precomputedModels),
      models: await this.modelResolver.buildModelsState(precomputedModels),
      modes: this.buildModesState(),
    };
  }

  async handleSessionLoad(params: AcpSessionLoadParams) {
    const sessionId = params.sessionId;
    if (!sessionId) {
      throw new Error("sessionId is required");
    }

    if (!this.isMemPersistEnabled()) {
      throw new Error(
        "session/load is unavailable because session.memPersist is disabled"
      );
    }

    await this.ensureOrchestrator();

    this.resolveCwd(params.cwd);

    const sessionDir = getSessionDir(sessionId, this.getCurrentProfile());
    if (!fs.existsSync(sessionDir)) {
      throw new Error(`Session directory not found: ${sessionDir}`);
    }

    await this.deps.orchestratorManager.switchToSession({
      sessionId,
      sessionDir,
    });
    this.sessionId = sessionId;
    this.scheduleAvailableCommandsUpdate();

    const historyFiles = [
      path.join(sessionDir, "history.cli.json"),
      path.join(sessionDir, "history.json"),
    ];
    const historyFile = historyFiles.find((file) => fs.existsSync(file));
    if (historyFile) {
      const updates = await loadSessionHistoryUpdates(historyFile);
      for (const update of updates) {
        this.deferUpdate(update.update as SessionUpdate);
      }
    }

    // Compute shared model IDs once for both config options and models state.
    const providers = this.deps.orchestratorManager.getAvailableProviders();
    const precomputedModels =
      await this.modelResolver.getAllModelIdsAcrossProviders(providers);

    return {
      configOptions: await this.buildSessionConfigOptions(precomputedModels),
      models: await this.modelResolver.buildModelsState(precomputedModels),
      modes: this.buildModesState(),
    };
  }

  async handleSessionList(params: AcpSessionListParams) {
    if (!this.isMemPersistEnabled()) {
      return {
        sessions: [],
        nextCursor: null,
      };
    }

    await this.ensureOrchestrator();

    const resolvedCwd = this.resolveCwd(params.cwd);
    const sessions = this.listPersistedSessions(resolvedCwd);
    const pageSize = 50;
    const startOffset = this.decodeSessionListCursor(params.cursor);
    const page = sessions.slice(startOffset, startOffset + pageSize);
    const nextOffset = startOffset + page.length;

    return {
      sessions: page,
      nextCursor:
        nextOffset < sessions.length
          ? this.encodeSessionListCursor(nextOffset)
          : null,
    };
  }

  async handleSessionPrompt(params: AcpSessionPromptParams) {
    if (!this.sessionId || this.sessionId !== params.sessionId) {
      throw new Error("No active session");
    }

    // Re-apply ACP restrictions in case background MCP updates refreshed enabled tools.
    this.applyAcpToolRestrictions();

    const contentBlocks = this.normalizePromptContent(params.prompt);
    const slashCommand = this.extractSlashCommand(contentBlocks);
    if (slashCommand) {
      const handled = await this.tryHandleSlashCommand(slashCommand);
      if (handled) {
        return {
          stopReason: "end_turn",
        };
      }
    }

    const payload = toUserMessagePayload(contentBlocks);

    this.cancelController?.abort();
    this.cancelController = new AbortController();

    try {
      await this.deps.orchestratorManager.send(payload, {
        stream: this.streamingEnabled,
        signal: this.cancelController.signal,
      });

      return {
        stopReason: "end_turn",
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const cancelled = message.toLowerCase().includes("aborted");

      if (cancelled) {
        return {
          stopReason: "cancelled",
        };
      }

      throw new Error(message);
    } finally {
      this.cancelController = null;
    }
  }

  async handleSessionCancel(_params?: { sessionId?: string }) {
    if (this.cancelController) {
      this.cancelController.abort();
    }

    const orchestrator = this.deps.orchestratorManager.getOrchestrator?.();
    if (orchestrator?.handleToolApproval) {
      for (const pending of this.pendingPermissionRequests.values()) {
        orchestrator.handleToolApproval(pending.approvalId, "deny");
      }
    }
    this.pendingPermissionRequests.clear();

    return {};
  }

  async handleSessionSetConfigOption(params: AcpSetConfigOptionParams) {
    if (
      params.sessionId &&
      this.sessionId &&
      params.sessionId !== this.sessionId
    ) {
      throw new Error("sessionId does not match active session");
    }

    const configId = params.configId ?? params.option ?? params.name;
    if (!configId) {
      throw new Error("configId is required");
    }

    await this.applyConfigOption(configId, params.value);

    // Compute shared model IDs once for both config options and models state.
    const providers = this.deps.orchestratorManager.getAvailableProviders();
    const precomputedModels =
      await this.modelResolver.getAllModelIdsAcrossProviders(providers);

    const configOptions = await this.buildSessionConfigOptions(
      precomputedModels
    );
    this.emitConfigOptionsUpdate(configOptions);

    return {
      configOptions,
      models: await this.modelResolver.buildModelsState(precomputedModels),
      modes: this.buildModesState(),
    };
  }

  async handleSessionSetModel(params: AcpSetModelParams) {
    const modelId = params.modelId;
    if (!modelId) {
      throw new Error("modelId is required");
    }

    return this.handleSessionSetConfigOption({
      sessionId: params.sessionId,
      configId: "model",
      value: modelId,
    });
  }

  async handleSessionSetMode(params: AcpSetModeParams) {
    const modeId = params.modeId;
    if (!modeId) {
      throw new Error("modeId is required");
    }

    return this.handleSessionSetConfigOption({
      sessionId: params.sessionId,
      configId: "mode",
      value: modeId,
    });
  }

  async handleSessionResponsePermission(
    params: LegacyPermissionResponseParams
  ) {
    const orchestrator = this.deps.orchestratorManager.getOrchestrator?.();
    if (orchestrator?.handleToolApproval) {
      orchestrator.handleToolApproval(
        params.approvalId,
        params.decision,
        params.editInstruction
      );
    }

    return {};
  }

  handleClientResponse(message: JsonRpcResponseMessage) {
    if (message.id === undefined || message.id === null) {
      return;
    }

    const key = String(message.id);
    const pending = this.pendingPermissionRequests.get(key);
    if (!pending) {
      console.warn(
        `[ACP] Received permission response for unknown request id=${key} (may have been cancelled)`
      );
      return;
    }

    const orchestrator = this.deps.orchestratorManager.getOrchestrator?.();
    if (!orchestrator?.handleToolApproval) {
      this.pendingPermissionRequests.delete(key);
      return;
    }

    const decision = this.getPermissionDecision(message.result);
    orchestrator.handleToolApproval(pending.approvalId, decision);
    this.pendingPermissionRequests.delete(key);
  }

  // ── Outbound events ──────────────────────────────────────────────────

  private emitUpdate(update: SessionUpdate) {
    if (!this.sessionId) return;

    this.deps.transport.send({
      jsonrpc: "2.0",
      method: "session/update",
      params: {
        sessionId: this.sessionId,
        update,
      },
    });
  }

  private emitPermissionRequest(toolCall: {
    id: string;
    function: { name: string; arguments: string };
    approvalId?: string;
  }) {
    if (!this.sessionId || !toolCall.approvalId) return;

    const toolKind = inferToolKind(toolCall.function.name);

    const requestId = this.nextClientRequestId++;
    this.pendingPermissionRequests.set(String(requestId), {
      approvalId: toolCall.approvalId,
    });
    const rawInput = safeParseArgs(toolCall.function.arguments);
    const toolTitle = formatToolCallTitle(toolCall.function.name, rawInput);

    this.deps.transport.send({
      jsonrpc: "2.0",
      id: requestId,
      method: "session/request_permission",
      params: {
        sessionId: this.sessionId,
        toolCall: {
          toolCallId: toolCall.id,
          title: `Permission required: ${toolTitle}`,
          kind: toolKind,
          status: "pending",
          rawInput,
        },
        options: [
          { optionId: "allow_once", name: "Allow once", kind: "allow_once" },
          {
            optionId: "allow_always",
            name: "Allow always",
            kind: "allow_always",
          },
          { optionId: "reject_once", name: "Reject once", kind: "reject_once" },
          {
            optionId: "reject_always",
            name: "Reject always",
            kind: "reject_always",
          },
        ],
      },
    });
  }

  private emitConfigOptionsUpdate(configOptions: SessionConfigOption[]) {
    this.emitUpdate({
      sessionUpdate: "config_option_update",
      configOptions,
    });
  }

  private scheduleAvailableCommandsUpdate() {
    const availableCommands = this.getAvailableCommands();
    this.deferUpdate({
      sessionUpdate: "available_commands_update",
      availableCommands,
    });
  }

  private deferUpdate(update: SessionUpdate) {
    this.deferredSessionUpdates.push(update);
  }

  flushDeferredUpdates() {
    if (this.deferredSessionUpdates.length === 0) {
      return;
    }

    const queued = this.deferredSessionUpdates.splice(0);
    for (const update of queued) {
      this.emitUpdate(update);
    }
  }

  private getAvailableCommands(): AvailableCommand[] {
    const commands = commandRegistry.list({ includeHidden: true });
    return commands
      .filter((command) => command.id.startsWith("/"))
      .map((command) => this.toAvailableCommand(command));
  }

  private toAvailableCommand(command: CommandDefinition): AvailableCommand {
    const base: AvailableCommand = {
      name: command.id.replace(/^\//, ""),
      description: command.description,
    };

    if (command.type === "component" && command.handler) {
      return {
        ...base,
        input: {
          hint: "arguments",
        },
      };
    }

    return base;
  }

  // ── Config management ──────────────────────────────────────────────────

  private async applyConfigOption(configId: string, value: unknown) {
    switch (configId) {
      case "model": {
        const nextModel = this.modelResolver.normalizeConfiguredModel(
          String(value)
        );
        if (!nextModel) {
          throw new Error(`Invalid modelId: ${String(value)}`);
        }
        const matchingProvider = await this.modelResolver.findProviderForModel(
          nextModel
        );
        this.configManager.loadConfig(
          {
            model: nextModel,
            ...(matchingProvider ? { activeProvider: matchingProvider } : {}),
          },
          "direct"
        );
        return;
      }
      case "provider":
        this.configManager.loadConfig(
          { activeProvider: String(value) },
          "direct"
        );
        return;
      case "mode":
      case "agent": {
        const modeId = String(value);
        if (modeId === "main" || modeId === "default") {
          await this.deps.orchestratorManager.swapToMain();
          return;
        }
        await this.deps.orchestratorManager.swapToAgent(modeId);
        return;
      }
      case "thought_level":
      case "thinking":
      case "reasoningEffort": {
        const normalized = String(value).toUpperCase();
        if (
          !Object.values(THINKING_LEVELS).includes(normalized as ThinkingLevel)
        ) {
          throw new Error(`Unsupported thinking value: ${value}`);
        }

        this.configManager.loadConfig(
          { thinking: normalized as ThinkingLevel },
          "direct"
        );
        return;
      }
      case "require_tool_approval":
      case "requireToolApproval": {
        this.configManager.loadConfig(
          { requireToolApproval: this.toBoolean(value) },
          "direct"
        );
        return;
      }
      case "stream":
      case "streaming": {
        this.streamingEnabled = this.toBoolean(value);
        return;
      }
      default:
        throw new Error(`Unsupported configId: ${configId}`);
    }
  }

  private async buildSessionConfigOptions(
    precomputedModels?: string[]
  ): Promise<SessionConfigOption[]> {
    const config = this.configManager.getConfig();
    const provider = String(config.activeProvider ?? "openrouter");
    const model = this.modelResolver.normalizeConfiguredModel(
      String(config.model ?? "")
    );
    const thinking = String(
      config.thinking ?? THINKING_LEVELS.OFF
    ).toUpperCase();
    const requireToolApproval = config.requireToolApproval ?? true;
    const availableProviders =
      this.deps.orchestratorManager.getAvailableProviders();
    const availableModels =
      precomputedModels ??
      (await this.modelResolver.getAllModelIdsAcrossProviders(
        availableProviders
      ));
    const modes = this.buildModesState();

    const providerOptions = this.modelResolver.toSelectOptions(
      availableProviders,
      provider,
      "Current Provider"
    );
    const modelOptions = this.modelResolver.toSelectOptions(
      availableModels,
      model,
      "Current Model"
    );

    return [
      {
        type: "select",
        id: "provider",
        name: "Provider",
        category: "model",
        currentValue: providerOptions.currentValue,
        options: providerOptions.options,
      },
      {
        type: "select",
        id: "model",
        name: "Model",
        category: "model",
        currentValue: modelOptions.currentValue,
        options: modelOptions.options,
      },
      {
        type: "select",
        id: "mode",
        name: "Mode",
        category: "mode",
        currentValue: modes.currentModeId,
        options: modes.availableModes.map((mode) => ({
          value: mode.id,
          name: mode.name,
        })),
      },
      {
        type: "select",
        id: "thought_level",
        name: "Thought Level",
        category: "thought_level",
        currentValue: thinking,
        options: Object.values(THINKING_LEVELS).map((level) => ({
          value: level,
          name: level,
        })),
      },
      {
        type: "select",
        id: "streaming",
        name: "Streaming",
        category: "other",
        currentValue: this.streamingEnabled ? "on" : "off",
        options: [
          { value: "on", name: "On" },
          { value: "off", name: "Off" },
        ],
      },
      {
        type: "select",
        id: "require_tool_approval",
        name: "Require Tool Approval",
        category: "other",
        currentValue: requireToolApproval ? "on" : "off",
        options: [
          { value: "on", name: "On" },
          { value: "off", name: "Off" },
        ],
      },
    ];
  }

  private buildModesState(): SessionModeState {
    const availableAgents = this.deps.orchestratorManager.getAvailableAgents();
    const dedupedModes = Array.from(
      new Map(
        availableAgents
          .filter((agent) => agent.agentId && agent.name)
          .map((agent) => [
            agent.agentId,
            {
              id: agent.agentId,
              name: agent.name,
              description: agent.description ?? "",
            },
          ])
      ).values()
    );

    const activeAgentId = this.deps.orchestratorManager.getActiveAgentId();
    const currentModeId = dedupedModes.some((mode) => mode.id === activeAgentId)
      ? activeAgentId
      : dedupedModes[0]?.id ?? "main";

    return {
      currentModeId,
      availableModes: dedupedModes,
    };
  }

  // ── Working directory ────────────────────────────────────────────────

  private resolveCwd(cwd?: string): string {
    if (!cwd) {
      this.workingDirectory = process.cwd();
      return this.workingDirectory;
    }

    const resolved = path.resolve(cwd);
    if (fs.existsSync(resolved)) {
      process.chdir(resolved);
      this.workingDirectory = resolved;
      return resolved;
    }

    this.workingDirectory = process.cwd();
    return this.workingDirectory;
  }

  // ── Orchestrator lifecycle ───────────────────────────────────────────

  private async ensureOrchestrator() {
    if (this.orchestratorReady) return;

    await this.deps.orchestratorManager.init(
      { memPersist: this.isMemPersistEnabled() },
      {
        appendLine: () => {},
        updateLine: () => {},
        updateLineMetadata: () => {},
        handleError: () => {},
      }
    );

    this.orchestratorReady = true;
    this.applyAcpToolRestrictions();
  }

  // ── Agent event handling ─────────────────────────────────────────────

  private handleAgentEvent(event: AgentEvent) {
    switch (event.type) {
      case AgentEventTypes.ReasoningChunk: {
        this.emitUpdate({
          sessionUpdate: "agent_thought_chunk",
          content: toTextContentBlock(event.delta),
        });
        return;
      }
      case AgentEventTypes.AssistantChunk: {
        this.streamingMessageIds.add(event.messageId);
        this.emitUpdate({
          sessionUpdate: "agent_message_chunk",
          content: toTextContentBlock(event.delta),
        });
        return;
      }
      case AgentEventTypes.AssistantMessage: {
        if (this.streamingMessageIds.has(event.messageId)) return;
        if (event.content) {
          this.emitUpdate({
            sessionUpdate: "agent_message_chunk",
            content: toTextContentBlock(event.content),
          });
        }
        return;
      }
      case AgentEventTypes.ToolCalls: {
        for (const call of event.toolCalls) {
          const rawInput = safeParseArgs(call.function.arguments);
          const title = formatToolCallTitle(call.function.name, rawInput);
          this.toolCallTitles.set(call.id, title);

          this.emitUpdate({
            sessionUpdate: "tool_call",
            toolCallId: call.id,
            title,
            kind: inferToolKind(call.function.name),
            status: call.requiresApproval ? "pending" : "in_progress",
            rawInput,
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
          typeof tool.result === "string"
            ? tool.result
            : JSON.stringify(tool.result ?? "", null, 2);
        const title =
          this.toolCallTitles.get(tool.id) ?? formatToolCallTitle(tool.name);

        this.emitUpdate({
          sessionUpdate: "tool_call_update",
          toolCallId: tool.id,
          title,
          kind: inferToolKind(tool.name),
          status: this.mapToolStatus(tool.status),
          rawOutput: tool.result,
          content: [
            { type: "content", content: toTextContentBlock(contentText) },
          ],
        });
        this.toolCallTitles.delete(tool.id);
        return;
      }
      case AgentEventTypes.Error: {
        this.emitUpdate({
          sessionUpdate: "agent_message_chunk",
          content: toTextContentBlock(`Error: ${event.error}`),
        });
        return;
      }
      default:
        return;
    }
  }

  // ── Utilities ────────────────────────────────────────────────────────

  private normalizePromptContent(prompt: unknown): AcpContentBlock[] {
    if (Array.isArray(prompt)) {
      return prompt as AcpContentBlock[];
    }

    if (
      prompt &&
      typeof prompt === "object" &&
      Array.isArray((prompt as { content?: unknown[] }).content)
    ) {
      // Backward compatibility with our previous internal prompt wrapper shape.
      return (prompt as { content: AcpContentBlock[] }).content;
    }

    if (prompt !== undefined && prompt !== null) {
      console.warn(
        "[ACP] Unexpected prompt shape — expected array or { content: [...] }, got:",
        typeof prompt
      );
    }

    return [];
  }

  private extractSlashCommand(blocks: AcpContentBlock[]): string | null {
    const textBlock = blocks.find(
      (block) =>
        block?.type === "text" &&
        typeof (block as { text?: unknown }).text === "string"
    );
    if (!textBlock) {
      return null;
    }

    const text = String((textBlock as { text: string }).text).trim();
    if (!text.startsWith("/")) {
      return null;
    }
    return text;
  }

  private async tryHandleSlashCommand(input: string): Promise<boolean> {
    const commandId = input.split(/\s+/)[0] ?? "";
    const command = commandRegistry.get(commandId);
    if (!command) {
      const available = this.getAvailableCommands().map((item) => `/${item.name}`);
      const availableText = available.length > 0 ? available.join(", ") : "none";
      this.emitUpdate({
        sessionUpdate: "agent_message_chunk",
        content: toTextContentBlock(
          `Command ${commandId} is not supported by Nuvin.\n\nAvailable commands: ${availableText}`
        ),
      });
      return true;
    }

    const hasArgs = input.trim().split(/\s+/).length > 1;
    if (command.type === "component" && (!command.handler || !hasArgs)) {
      this.emitUpdate({
        sessionUpdate: "agent_message_chunk",
        content: toTextContentBlock(
          `Command ${commandId} requires interactive terminal UI and is not available in ACP mode.`
        ),
      });
      return true;
    }

    const captured: string[] = [];
    const onLine = (line: { content: string }) => {
      if (line.content) {
        captured.push(line.content);
      }
    };
    const onError = (message: string) => {
      if (message) {
        captured.push(`Error: ${message}`);
      }
    };

    this.eventBus.on("ui:line", onLine as never);
    this.eventBus.on("ui:error", onError as never);

    try {
      const result = await commandRegistry.execute(input);
      if (!result.success && result.error) {
        captured.push(`Error: ${result.error.message}`);
      }
    } finally {
      this.eventBus.off("ui:line", onLine as never);
      this.eventBus.off("ui:error", onError as never);
    }

    const isCustomCommand =
      typeof command === "object" &&
      command !== null &&
      Boolean((command as unknown as { isCustomCommand?: boolean }).isCustomCommand);

    if (captured.length === 0 && !isCustomCommand) {
      captured.push(`Command ${commandId} executed.`);
    }

    for (const text of captured) {
      this.emitUpdate({
        sessionUpdate: "agent_message_chunk",
        content: toTextContentBlock(text),
      });
    }

    return true;
  }

  private getPermissionDecision(result: unknown): ToolApprovalDecision {
    const payload = result as
      | RequestPermissionResponse
      | LegacyPermissionResponseParams
      | undefined;

    if (payload && typeof payload === "object") {
      if ("decision" in payload && typeof payload.decision === "string") {
        if (
          payload.decision === "approve" ||
          payload.decision === "deny" ||
          payload.decision === "approve_all" ||
          payload.decision === "edit"
        ) {
          return payload.decision;
        }
      }

      const outcome = (payload as RequestPermissionResponse).outcome;
      if (outcome?.outcome === "selected") {
        switch (outcome.optionId) {
          case "allow_once":
            return "approve";
          case "allow_always":
            return "approve_all";
          case "reject_once":
          case "reject_always":
            return "deny";
          default:
            return "deny";
        }
      }

      if (outcome?.outcome === "cancelled") {
        return "deny";
      }
    }

    return "deny";
  }

  private mapToolStatus(status: ToolExecutionResult["status"]) {
    return status === "success" ? "completed" : "failed";
  }

  private toBoolean(value: unknown): boolean {
    if (typeof value === "boolean") {
      return value;
    }

    const normalized = String(value).toLowerCase();
    return (
      normalized === "1" ||
      normalized === "true" ||
      normalized === "yes" ||
      normalized === "on"
    );
  }

  private isMemPersistEnabled(): boolean {
    const config = this.configManager.getConfig();
    return config.session?.memPersist ?? true;
  }

  private applyAcpToolRestrictions() {
    const currentConfig = this.deps.orchestratorManager.getConfig?.();
    const enabledTools = Array.isArray(currentConfig?.enabledTools)
      ? currentConfig.enabledTools
      : null;
    if (!enabledTools || enabledTools.length === 0) {
      return;
    }

    const filteredTools = enabledTools.filter(
      (toolName) => !ACP_DISABLED_TOOLS.has(toolName)
    );
    if (filteredTools.length === enabledTools.length) {
      return;
    }

    this.deps.orchestratorManager.updateConfig({
      enabledTools: filteredTools,
    });
  }

  private listPersistedSessions(defaultCwd: string): Array<{
    sessionId: string;
    cwd: string;
    title: string;
    updatedAt: string;
  }> {
    const sessionsRoot = path.dirname(
      getSessionDir("__acp_probe__", this.getCurrentProfile())
    );
    if (!fs.existsSync(sessionsRoot)) {
      return [];
    }

    const entries = fs
      .readdirSync(sessionsRoot, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name);

    entries.sort((a, b) => {
      const aNum = Number(a);
      const bNum = Number(b);
      if (Number.isFinite(aNum) && Number.isFinite(bNum)) {
        return bNum - aNum;
      }
      return b.localeCompare(a);
    });

    return entries.map((sessionId) => {
      const sessionDir = path.join(sessionsRoot, sessionId);
      const parsedHistory = this.readSessionHistory(sessionDir);
      const history = parsedHistory?.messages ?? [];
      const title =
        parsedHistory?.topic ||
        this.extractLastUserText(history) ||
        `Session ${sessionId}`;
      const updatedAt =
        parsedHistory?.updatedAt || this.getSessionUpdatedAt(sessionDir);

      return {
        sessionId,
        cwd: defaultCwd,
        title,
        updatedAt,
      };
    });
  }

  private readSessionHistory(sessionDir: string): {
    messages: Array<{ role?: string; content?: unknown }>;
    topic?: string;
    updatedAt?: string;
  } | null {
    const historyFile = [
      path.join(sessionDir, "history.cli.json"),
      path.join(sessionDir, "history.json"),
    ].find((file) => fs.existsSync(file));
    if (!historyFile) {
      return null;
    }

    try {
      const raw = fs.readFileSync(historyFile, "utf-8");
      const parsed = JSON.parse(raw) as {
        default?: Array<{ role?: string; content?: unknown }>;
        cli?: Array<{ role?: string; content?: unknown }>;
        __metadata__default?: Array<{ topic?: string; updatedAt?: string }>;
        __metadata__cli?: Array<{ topic?: string; updatedAt?: string }>;
      };

      const messages = parsed.default ?? parsed.cli ?? [];
      const metadata =
        parsed.__metadata__default?.[0] ?? parsed.__metadata__cli?.[0];

      return {
        messages,
        topic:
          typeof metadata?.topic === "string" ? metadata.topic : undefined,
        updatedAt:
          typeof metadata?.updatedAt === "string"
            ? metadata.updatedAt
            : undefined,
      };
    } catch {
      return null;
    }
  }

  private extractLastUserText(
    messages: Array<{ role?: string; content?: unknown }>
  ): string | undefined {
    for (let i = messages.length - 1; i >= 0; i--) {
      const message = messages[i];
      if (message?.role !== "user") {
        continue;
      }

      const text = typeof message.content === "string" ? message.content : "";
      if (!text.trim()) {
        continue;
      }

      const singleLine = text.replace(/\s+/g, " ").trim();
      return singleLine.length > 80
        ? `${singleLine.slice(0, 77)}...`
        : singleLine;
    }

    return undefined;
  }

  private getSessionUpdatedAt(sessionDir: string): string {
    try {
      return fs.statSync(sessionDir).mtime.toISOString();
    } catch {
      return new Date().toISOString();
    }
  }

  private encodeSessionListCursor(offset: number): string {
    return Buffer.from(JSON.stringify({ offset }), "utf-8").toString(
      "base64url"
    );
  }

  private decodeSessionListCursor(cursor?: string): number {
    if (!cursor) {
      return 0;
    }

    try {
      const decoded = Buffer.from(cursor, "base64url").toString("utf-8");
      const parsed = JSON.parse(decoded) as { offset?: unknown };
      const offset = Number(parsed.offset);
      if (Number.isFinite(offset) && offset >= 0) {
        return Math.floor(offset);
      }
    } catch {
      // ignore malformed cursors and default to first page
    }

    return 0;
  }

  private getCurrentProfile(): string | undefined {
    if (typeof this.configManager.getCurrentProfile === "function") {
      return this.configManager.getCurrentProfile();
    }
    return undefined;
  }
}
