import {
  type AgentConfig,
  type AgentEvent,
  type ChatMessage,
  type Clock,
  type CompletionParams,
  type CompletionResult,
  type ContextBuilder,
  type CostCalculator,
  type IdGenerator,
  type LLMPort,
  type MemoryPort,
  type Message,
  type MessageContent,
  type MessageContentPart,
  type MessageResponse,
  type MetricsPort,
  type RemindersPort,
  type SendMessageOptions,
  type ToolExecutionResult,
  type ToolPort,
  type ToolCall,
  type UserAttachment,
  type UserMessagePayload,
  type ToolApprovalDecision,
  type EventPort,
  type UsageData,
  AgentEventTypes,
  MessageRoles,
  ErrorReason,
} from './ports.js';
import type { HookPort, HookEventType, HookContext } from './hooks/types.js';
import { HookEventTypes } from './hooks/types.js';
import { NoopMetricsPort } from './metrics.js';
import { SystemClock } from './clock.js';
import { SimpleId } from './id.js';
import { SimpleCost } from './cost.js';
import { NoopReminders } from './reminders.js';
import { SimpleContextBuilder } from './context.js';
import { NoopEventPort } from './events.js';
import { convertToolCallsWithErrorHandling } from './tools/tool-call-converter.js';

type AssistantChunkEvent = Extract<AgentEvent, { type: typeof AgentEventTypes.AssistantChunk }>;
type AssistantMessageEvent = Extract<AgentEvent, { type: typeof AgentEventTypes.AssistantMessage }>;
type StreamFinishEvent = Extract<AgentEvent, { type: typeof AgentEventTypes.StreamFinish }>;

const removeAttachmentTokens = (value: string, attachments: UserAttachment[]): string => {
  return attachments.reduce((acc, attachment) => {
    if (!attachment.token) return acc;
    return acc.split(attachment.token).join('');
  }, value);
};

const makeImagePart = (attachment: UserAttachment): MessageContentPart => {
  const altText = attachment.altText ?? (attachment.name ? `Image attachment: ${attachment.name}` : undefined);
  return {
    type: 'image',
    data: attachment.data,
    mimeType: attachment.mimeType,
    altText,
    source: attachment.source,
    name: attachment.name,
  };
};

const buildMessageParts = (text: string, attachments: UserAttachment[]): MessageContentPart[] => {
  if (attachments.length === 0) {
    return text ? [{ type: 'text', text }] : [];
  }

  let remainder = text;
  const parts: MessageContentPart[] = [];
  const deferred: UserAttachment[] = [];

  for (const attachment of attachments) {
    const token = attachment.token;
    if (!token) {
      deferred.push(attachment);
      continue;
    }

    const idx = remainder.indexOf(token);
    if (idx === -1) {
      deferred.push(attachment);
      continue;
    }

    const before = removeAttachmentTokens(remainder.slice(0, idx), attachments);
    if (before.length > 0) {
      parts.push({ type: 'text', text: before });
    }

    parts.push(makeImagePart(attachment));
    remainder = remainder.slice(idx + token.length);
  }

  const tail = removeAttachmentTokens(remainder, attachments);
  if (tail.length > 0) {
    parts.push({ type: 'text', text: tail });
  }

  for (const attachment of deferred) {
    parts.push(makeImagePart(attachment));
  }

  return parts;
};

const resolveDisplayText = (text: string, attachments: UserAttachment[], provided?: string): string => {
  if (provided && provided.trim().length > 0) {
    return provided;
  }

  let result = text;
  attachments.forEach((attachment, index) => {
    const label = attachment.name ?? attachment.altText ?? `image-${index + 1}`;
    const marker = `[image:${label}]`;
    if (attachment.token && result.includes(attachment.token)) {
      result = result.split(attachment.token).join(marker);
    } else {
      result = result.length > 0 ? `${result} ${marker}` : marker;
    }
  });
  return result;
};

// Per-tool approval: each tool gets its own Promise
type PerToolApprovalResult = {
  approved: boolean;
  editInstruction?: string;
};

export class AgentOrchestrator {
  // Per-tool approval map: approvalId -> { resolve, toolCall }
  private pendingApprovals = new Map<
    string,
    {
      resolve: (result: PerToolApprovalResult) => void;
      reject: (error: Error) => void;
      toolCall: ToolCall;
    }
  >();

  // Per-question response map: questionId -> { resolve, reject, questions, conversationId, messageId }
  private pendingQuestions = new Map<
    string,
    {
      resolve: (result: Record<string, string | string[]>) => void;
      reject: (error: Error) => void;
      questions: Array<{
        id: string;
        question: string;
        header: string;
        options: Array<{ label: string; description: string }>;
        multiSelect: boolean;
      }>;
      conversationId: string;
      messageId: string;
    }
  >();


  private context: ContextBuilder = new SimpleContextBuilder();
  private ids: IdGenerator = new SimpleId();
  private clock: Clock = new SystemClock();
  private cost: CostCalculator = new SimpleCost();
  private reminders: RemindersPort = new NoopReminders();
  // private llm: LLMPort;
  private metrics: MetricsPort = new NoopMetricsPort();
  private events?: EventPort = new NoopEventPort();
  private llm?: LLMPort;
  private tools: ToolPort;
  private memory: MemoryPort<Message>;
  private hookPort?: HookPort;
  private sessionId: string = 'default';

  constructor(
    private cfg: AgentConfig,
    deps: {
      memory: MemoryPort<Message>;
      tools: ToolPort;
      context?: ContextBuilder;
      ids?: IdGenerator;
      clock?: Clock;
      cost?: CostCalculator;
      reminders?: RemindersPort;
      llm?: LLMPort;
      metrics?: MetricsPort;
      events?: EventPort;
      hookPort?: HookPort;
    },
  ) {
    this.memory = deps.memory;
    this.tools = deps.tools;
    this.llm = deps.llm;
    this.context = deps.context ?? this.context;
    this.ids = deps.ids ?? this.ids;
    this.clock = deps.clock ?? this.clock;
    this.cost = deps.cost ?? this.cost;
    this.reminders = deps.reminders ?? this.reminders;
    this.metrics = deps.metrics ?? this.metrics;
    this.events = deps.events ?? this.events;
    this.hookPort = deps.hookPort;
  }

  /**
   * Updates the agent configuration dynamically after initialization.
   * This allows for runtime changes to model, provider, and other settings.
   */
  public updateConfig(newConfig: Partial<AgentConfig>): void {
    this.cfg = { ...this.cfg, ...newConfig };
  }

  /**
   * Updates the LLM provider without reinitializing the entire orchestrator.
   * This preserves conversation history, MCP connections, and other state.
   */
  public setLLM(newLLM: LLMPort): void {
    this.llm = newLLM;
  }

  /**
   * Updates the tool port without reinitializing the entire orchestrator.
   * This preserves conversation history and other state while adding/removing tools.
   */
  public setTools(newTools: ToolPort): void {
    this.tools = newTools;
  }

  /**
   * Gets the current tool port.
   */
  public getTools(): ToolPort {
    return this.tools;
  }

  /**
   * Gets the current LLM port.
   */
  public getLLM(): LLMPort | undefined {
    return this.llm;
  }

  /**
   * Gets the current agent configuration.
   */
  public getConfig(): AgentConfig {
    return this.cfg;
  }

  /**
   * Updates the memory port without reinitializing the entire orchestrator.
   * This allows starting a new conversation session while preserving LLM connections,
   * MCP servers, and other state.
   */
  public setMemory(newMemory: MemoryPort<Message>): void {
    this.memory = newMemory;
  }

  /**
   * Updates the event port without reinitializing the entire orchestrator.
   * This is useful when switching to a new session with a different event log file.
   */
  public setEvents(newEvents: import('./ports.js').EventPort): void {
    this.events = newEvents;
  }

  /**
   * Updates the metrics port without reinitializing the entire orchestrator.
   */
  public setMetrics(newMetrics: MetricsPort): void {
    this.metrics = newMetrics;
  }

  /**
   * Gets the current metrics port.
   */
  public getMetrics(): MetricsPort | undefined {
    return this.metrics;
  }

  /**
   * Updates the hook port without reinitializing the entire orchestrator.
   */
  public setHookPort(newHookPort: HookPort): void {
    this.hookPort = newHookPort;
  }

  /**
   * Gets the current hook port.
   */
  public getHookPort(): HookPort | undefined {
    return this.hookPort;
  }

  /**
   * Updates the session ID for hook context.
   */
  public setSessionId(newSessionId: string): void {
    this.sessionId = newSessionId;
  }

  /**
   * Gets the current session ID.
   */
  public getSessionId(): string {
    return this.sessionId;
  }

  /**
   * Checks if hooks are registered for an event type.
   */
  public hasHooks(event: HookEventType, matcher?: string): boolean {
    return this.hookPort?.hasHooks(event, matcher) ?? false;
  }

  /**
   * Determines if a tool should bypass approval requirements.
   * Read-only tools and todo management tools are auto-approved.
   */
  private shouldBypassApproval(toolName: string): boolean {
    const readOnlyTools = ['file_read', 'ls_tool', 'web_search', 'web_fetch', 'glob_tool', 'grep_tool'];
    const todoTools = ['todo_write', 'todo_read'];
    const interactiveTools = ['ask_user_tool'];
    return readOnlyTools.includes(toolName) || todoTools.includes(toolName) || interactiveTools.includes(toolName);
  }


  /**
   * Process tool approval with per-tool granularity.
   * - Bypass tools (requiresApproval=false) execute immediately
   * - Non-bypass tools wait for their individual approval
   * - All tools run in parallel, each waiting only for its own approval
   * - ToolResult events emitted immediately when each tool completes
   *
   * @param enrichedToolCalls - Tool calls already enriched with approvalId and requiresApproval
   */
  private async processToolApproval(
    enrichedToolCalls: ToolCall[],
    approvalPromises: Map<string, {
      promise: Promise<PerToolApprovalResult>;
      resolve: (result: PerToolApprovalResult) => void;
      reject: (err: Error) => void;
    }>,
    conversationId: string,
    messageId: string,
    _accumulatedMessages: ChatMessage[],
    _turnHistory: Message[],
    _assistantContent: string | null,
    _usage?: UsageData,
    signal?: AbortSignal,
  ): Promise<{ results: ToolExecutionResult[] }> {

    // Setup abort handlers for all approval promises
    if (signal) {
      const abortHandler = () => {
        for (const [approvalId, { reject }] of approvalPromises) {
          if (this.pendingApprovals.has(approvalId)) {
            this.pendingApprovals.delete(approvalId);
            reject(new Error('Aborted'));
          }
        }
      };
      signal.addEventListener('abort', abortHandler, { once: true });
    }

    // Execute a single tool, waiting for approval if needed
    // Emits ToolResult immediately when this tool completes
    const executeToolWithApproval = async (toolCall: ToolCall): Promise<ToolExecutionResult> => {
      let result: ToolExecutionResult;

      // If needs approval, wait for the pre-created approval promise
      if (toolCall.requiresApproval && toolCall.approvalId) {
        const approvalEntry = approvalPromises.get(toolCall.approvalId);
        if (!approvalEntry) {
          throw new Error(`No approval promise found for ${toolCall.approvalId}`);
        }

        let approvalResult: PerToolApprovalResult;
        try {
          approvalResult = await approvalEntry.promise;
        } catch (err) {
          // Aborted
          result = {
            id: toolCall.id,
            name: toolCall.function.name,
            status: 'error',
            type: 'text',
            result: 'Aborted',
            metadata: { errorReason: ErrorReason.Aborted },
            durationMs: 0,
          };

          await this.events?.emit({
            type: AgentEventTypes.ToolResult,
            conversationId,
            messageId,
            result,
          });

          return result;
        }

        // Check abort immediately after approval received
        if (signal?.aborted) {
          result = {
            id: toolCall.id,
            name: toolCall.function.name,
            status: 'error',
            type: 'text',
            result: 'Aborted',
            metadata: { errorReason: ErrorReason.Aborted },
            durationMs: 0,
          };

          await this.events?.emit({
            type: AgentEventTypes.ToolResult,
            conversationId,
            messageId,
            result,
          });

          return result;
        }

        if (!approvalResult.approved) {
          // Tool was denied - emit result immediately
          result = {
            id: toolCall.id,
            name: toolCall.function.name,
            status: 'error',
            type: 'text',
            result: 'Tool execution denied by user',
            metadata: { errorReason: ErrorReason.Denied },
            durationMs: 0,
          };

          await this.events?.emit({
            type: AgentEventTypes.ToolResult,
            conversationId,
            messageId,
            result,
          });

          return result;
        }

        // Apply edit instruction if provided
        if (approvalResult.editInstruction) {
          toolCall.editInstruction = approvalResult.editInstruction;
        }
      }

      // Execute pre_tool_use hook if configured
      if (this.hookPort?.hasHooks(HookEventTypes.PreToolUse, toolCall.function.name)) {
        const hookContext: HookContext = {
          sessionId: this.sessionId,
          conversationId,
          messageId,
          hookEvent: HookEventTypes.PreToolUse,
          cwd: process.cwd(),
          toolName: toolCall.function.name,
          toolInput: typeof toolCall.function.arguments === 'string'
            ? JSON.parse(toolCall.function.arguments)
            : toolCall.function.arguments as Record<string, unknown>,
          toolUseId: toolCall.id,
        };

        try {
          const hookResult = await this.hookPort.executeHook(hookContext);

          if (!hookResult.continue) {
            // Hook blocked the tool
            result = {
              id: toolCall.id,
              name: toolCall.function.name,
              status: 'error',
              type: 'text',
              result: hookResult.stopReason ?? 'Blocked by pre_tool_use hook',
              metadata: { errorReason: ErrorReason.Denied },
              durationMs: hookResult.durationMs ?? 0,
            };

            await this.events?.emit({
              type: AgentEventTypes.ToolResult,
              conversationId,
              messageId,
              result,
            });

            return result;
          }

          // Apply updated input if hook modified it
          if (hookResult.updatedInput) {
            toolCall.function.arguments = JSON.stringify(hookResult.updatedInput);
          }
        } catch (hookError) {
          // Log hook execution error but don't block tool execution
          console.warn(`[Orchestrator] pre_tool_use hook error for ${toolCall.function.name}:`, hookError);
        }
      }

      // Execute the tool (bypass or approved)
      const availableTools = this.getAvailableToolNames();
      const conversionResult = convertToolCallsWithErrorHandling([toolCall], {
        strict: this.cfg.strictToolValidation ?? true,
        availableTools,
      });

      if (conversionResult.errors && conversionResult.errors.length > 0) {
        const err = conversionResult.errors[0];
        const errorReason =
          err.errorType === 'tool_not_found'
            ? ErrorReason.ToolNotFound
            : err.errorType === 'parse'
              ? ErrorReason.InvalidInput
              : ErrorReason.ValidationFailed;
        result = {
          id: err.id,
          name: err.name,
          status: 'error',
          type: 'text',
          result: `Tool call validation failed: ${err.error}`,
          metadata: { errorReason },
          durationMs: 0,
        };

        await this.events?.emit({
          type: AgentEventTypes.ToolResult,
          conversationId,
          messageId,
          result,
        });

        return result;
      }

      const results = await this.tools.executeToolCalls(
        conversionResult.invocations,
        {
          conversationId,
          agentId: this.cfg.id,
          messageId,
          eventPort: this.events,
          waitForUserQuestion: async (
            questionId: string,
            questions: Array<{
              id: string;
              question: string;
              header: string;
              options: Array<{ label: string; description: string }>;
              multiSelect: boolean;
            }>
          ) => {
            return new Promise<Record<string, string | string[]>>((resolve, reject) => {
              this.pendingQuestions.set(questionId, {
                resolve,
                reject,
                questions,
                conversationId,
                messageId,
              });
            });
          },
        },
        1, // Execute single tool
        signal,
      );

      result = results[0] || {
        id: toolCall.id,
        name: toolCall.function.name,
        status: 'error',
        type: 'text',
        result: 'Unknown execution error',
        durationMs: 0,
      };

      // Emit result immediately when this tool completes
      await this.events?.emit({
        type: AgentEventTypes.ToolResult,
        conversationId,
        messageId,
        result,
      });

      return result;
    };

    // Run all tools in parallel - bypass tools start immediately,
    // tools needing approval start when their approval comes in.
    // Each tool emits its ToolResult immediately upon completion.
    const results = await Promise.all(enrichedToolCalls.map(executeToolWithApproval));

    return { results };
  }



  async send(content: UserMessagePayload, opts: SendMessageOptions = {}): Promise<MessageResponse> {
    const convo = opts.conversationId ?? 'default';
    const t0 = this.clock.now();
    const msgId = this.ids.uuid();

    const history = await this.memory.get(convo);
    let providerMsgs: ChatMessage[];
    let userMessages: Message[];
    let userDisplay: string;
    let enhanced: string[];

    const _llm = this.getLLM();
    if (!_llm) {
      throw new Error('LLM provider not set');
    }

    const normalized =
      typeof content === 'string'
        ? { text: content, displayText: content, attachments: [] as UserAttachment[] }
        : {
            text: content.text ?? '',
            displayText: content.displayText,
            attachments: Array.isArray(content.attachments) ? content.attachments : [],
          };

    const attachments = normalized.attachments;
    enhanced = this.reminders.enhance(normalized.text, { conversationId: convo });
    const enhancedCombined = enhanced.join('\n');
    const messageParts = buildMessageParts(enhancedCombined, attachments);

    let userContent: MessageContent;
    if (attachments.length > 0 || messageParts.some((part) => part.type === 'image')) {
      userContent = { type: 'parts', parts: messageParts };
    } else if (messageParts.length === 1 && messageParts[0]?.type === 'text') {
      userContent = messageParts[0].text;
    } else if (messageParts.length > 0) {
      userContent = { type: 'parts', parts: messageParts };
    } else {
      userContent = enhancedCombined;
    }

    providerMsgs = this.context.toProviderMessages(history, this.cfg.systemPrompt, [userContent]);

    userDisplay = resolveDisplayText(normalized.text, attachments, normalized.displayText);
    const userTimestamp = this.clock.iso();
    userMessages = [{ id: this.ids.uuid(), role: 'user', content: userContent, timestamp: userTimestamp }];

    await this.memory.append(convo, userMessages);

    if (opts.signal?.aborted) throw new Error('Aborted');

    const toolDefs = this.tools.getToolDefinitions(this.cfg.enabledTools ?? []);
    const toolNames = toolDefs.map((t) => t.function.name);

    await this.events?.emit({
      type: AgentEventTypes.MessageStarted,
      conversationId: convo,
      messageId: msgId,
      userContent: userDisplay,
      enhanced,
      toolNames,
    });

    const reasoningParam = this.cfg.reasoningEffort ? { effort: this.cfg.reasoningEffort } : undefined;

    const THINKING_BUDGET_TOKENS: Record<string, number> = {
      LOW: 1024,
      MEDIUM: 4096,
      HIGH: 16384,
    };

    let thinkingParam: CompletionParams['thinking'] | undefined;
    if (this.cfg.thinking && this.cfg.thinking !== 'OFF') {
      const budgetTokens = THINKING_BUDGET_TOKENS[this.cfg.thinking] ?? 4096;
      thinkingParam = { type: 'enabled', budget_tokens: budgetTokens };
    } else if (this.cfg.thinking === 'OFF') {
      thinkingParam = { type: 'disabled' };
    }

    const params: CompletionParams = {
      messages: providerMsgs,
      model: this.cfg.model,
      temperature: this.cfg.temperature,
      maxTokens: this.cfg.maxTokens,
      topP: this.cfg.topP,
      tools: toolDefs.length ? toolDefs : undefined,
      tool_choice: toolDefs.length ? 'auto' : 'none',
      reasoning: reasoningParam,
      thinking: thinkingParam,
    };

    let streamedAssistantContent = '';
    const allToolResults: ToolExecutionResult[] = [];
    const accumulatedMessages: ChatMessage[] = [...providerMsgs];
    const turnHistory: Message[] = [];
    let result: CompletionResult;
    let toolApprovalDenied = false;
    let denialMessage = '';
    let finalResponseSaved = false;

    if (opts.stream && typeof _llm.streamCompletion === 'function') {
      let isFirstChunk = true;
      result = await _llm.streamCompletion(
        params,
        {
          onChunk: async (delta: string, usage?: UsageData) => {
            streamedAssistantContent += delta;
            const cleanDelta = isFirstChunk ? delta.replace(/^\n+/, '') : delta;
            isFirstChunk = false;
            const chunkEvent: AssistantChunkEvent = {
              type: AgentEventTypes.AssistantChunk,
              conversationId: convo,
              messageId: msgId,
              delta: cleanDelta,
              ...(usage && { usage }),
            };
            await this.events?.emit(chunkEvent);
          },
          onReasoningChunk: async (delta: string) => {
            await this.events?.emit({
              type: AgentEventTypes.ReasoningChunk,
              conversationId: convo,
              messageId: msgId,
              delta,
            });
          },
          onStreamFinish: async (finishReason?: string, usage?: UsageData) => {
            if (usage) {
              const cost = this.cost.estimate(this.cfg.model, usage);
              this.metrics?.recordLLMCall?.(usage, cost);
            }
            const finishEvent: StreamFinishEvent = {
              type: AgentEventTypes.StreamFinish,
              conversationId: convo,
              messageId: msgId,
              ...(finishReason && { finishReason }),
              ...(usage && { usage }),
            };
            await this.events?.emit(finishEvent);
          },
          onUsage: async (usage: UsageData) => {
            const cost = this.cost.estimate(this.cfg.model, usage);
            this.metrics?.recordLLMCall?.(usage, cost);
          },
        },
        opts.signal,
      );
    } else {
      result = await _llm.generateCompletion(params, opts.signal);
      if (result.usage) {
        const cost = this.cost.estimate(this.cfg.model, result.usage);
        this.metrics?.recordLLMCall?.(result.usage, cost);
      }
    }

    if (!result.tool_calls?.length && result.content && !finalResponseSaved) {
      const content = opts.stream ? streamedAssistantContent : result.content;

      const assistantMsg: Message = {
        id: msgId,
        role: 'assistant',
        content,
        timestamp: this.clock.iso(),
        usage: result.usage,
      };
      if (result.reasoning) assistantMsg.reasoning = result.reasoning;
      if (result.thinking_blocks) assistantMsg.thinking_blocks = result.thinking_blocks;
      await this.memory.append(convo, [assistantMsg]);
      finalResponseSaved = true;

      // Emit AssistantMessage for both streaming and non-streaming
      // This signals the UI to finalize rendering and enable markdown
      if (content.trim()) {
        const messageEvent: AssistantMessageEvent = {
          type: AgentEventTypes.AssistantMessage,
          conversationId: convo,
          messageId: msgId,
          content,
          ...(result.usage && { usage: result.usage }),
        };
        await this.events?.emit(messageEvent);
      }
    }

    while (result.tool_calls?.length) {
      // Emit the assistant message along with the tool call
      if (result.content?.trim()) {
        const messageEvent: AssistantMessageEvent = {
          type: AgentEventTypes.AssistantMessage,
          conversationId: convo,
          messageId: msgId,
          content: result.content,
          ...(result.usage && { usage: result.usage }),
        };
        await this.events?.emit(messageEvent);
      }

      if (opts.signal?.aborted) throw new Error('Aborted');

      // 1. Enrich tool calls with per-tool approval info
      const enrichedToolCalls = result.tool_calls.map((tc) => {
        const requiresApproval = this.cfg.requireToolApproval !== false &&
                                  !this.shouldBypassApproval(tc.function.name);
        return {
          ...tc,
          requiresApproval,
          approvalId: requiresApproval ? this.ids.uuid() : undefined,
        };
      });

      // 2. Pre-register pending approvals BEFORE emitting event
      // This prevents race condition where UI tries to approve before orchestrator is ready
      const approvalPromises = new Map<string, {
        promise: Promise<PerToolApprovalResult>;
        resolve: (result: PerToolApprovalResult) => void;
        reject: (err: Error) => void;
      }>();

      for (const tc of enrichedToolCalls) {
        if (tc.requiresApproval && tc.approvalId) {
          let resolveApproval: (result: PerToolApprovalResult) => void;
          let rejectApproval: (err: Error) => void;
          const promise = new Promise<PerToolApprovalResult>((resolve, reject) => {
            resolveApproval = resolve;
            rejectApproval = reject;
          });
          approvalPromises.set(tc.approvalId, {
            promise,
            resolve: resolveApproval!,
            reject: rejectApproval!
          });
          this.pendingApprovals.set(tc.approvalId, {
            resolve: resolveApproval!,
            reject: rejectApproval!,
            toolCall: tc,
          });
        }
      }

      // 3. Emit ToolCalls event - UI can now safely call handleToolApproval
      await this.events?.emit({
        type: AgentEventTypes.ToolCalls,
        conversationId: convo,
        messageId: msgId,
        toolCalls: enrichedToolCalls,
        usage: result.usage,
      });

      // 4. Process tools - each executes when approved (or immediately if bypass)
      const { results: toolResults } = await this.processToolApproval(
        enrichedToolCalls,
        approvalPromises,
        convo,
        msgId,
        accumulatedMessages,
        turnHistory,
        result.content,
        result.usage,
        opts.signal,
      );

      allToolResults.push(...toolResults);

      // Check if all tools were denied
      const allDenied = toolResults.every(
        (tr) => tr.status === 'error' && tr.metadata?.errorReason === ErrorReason.Denied
      );
      if (allDenied) {
        toolApprovalDenied = true;
        denialMessage = 'All tools were denied by user';
        break;
      }

      // Build assistant message with enriched tool calls
      const assistantMsg: Message = {
        id: this.ids.uuid(),
        role: 'assistant',
        content: result.content ?? null,
        timestamp: this.clock.iso(),
        tool_calls: enrichedToolCalls,
        usage: result.usage,
      };
      if (result.reasoning) assistantMsg.reasoning = result.reasoning;
      if (result.thinking_blocks) assistantMsg.thinking_blocks = result.thinking_blocks;

      // Build tool result messages
      const toolResultMsgs: Message[] = [];
      for (const tr of toolResults) {
        let contentStr: string;
        if (tr.status === 'error') {
          contentStr = tr.result as string;
        } else if (tr.type === 'text') {
          contentStr = tr.result as string;
        } else {
          contentStr = JSON.stringify(tr.result, null, 2);
        }

        toolResultMsgs.push({
          id: tr.id,
          role: 'tool',
          content: contentStr,
          timestamp: this.clock.iso(),
          tool_call_id: tr.id,
          name: tr.name,
          status: tr.status,
          durationMs: tr.durationMs,
          metadata: tr.metadata,
        });

        this.metrics?.recordToolCall?.();
      }

      await this.memory.append(convo, [assistantMsg, ...toolResultMsgs]);

      // Update accumulated messages for next LLM call
      const { usage: _usage, ...extraField } = result;
      accumulatedMessages.push({
        ...extraField,
        role: 'assistant',
        content: result.content ?? null,
        tool_calls: enrichedToolCalls,
      });
      for (const tr of toolResults) {
        let contentStr: string;
        if (tr.status === 'error') {
          contentStr = tr.result as string;
        } else if (tr.type === 'text') {
          contentStr = tr.result as string;
        } else {
          contentStr = JSON.stringify(tr.result, null, 2);
        }
        accumulatedMessages.push({ role: 'tool', content: contentStr, tool_call_id: tr.id, name: tr.name });
      }

      if (opts.signal?.aborted) throw new Error('Aborted');

      streamedAssistantContent = '';

      if (opts.stream && typeof _llm.streamCompletion === 'function') {
        let isFirstChunk = true;
        result = await _llm.streamCompletion(
          { ...params, messages: accumulatedMessages },
          {
            onChunk: async (delta: string, usage?: UsageData) => {
              streamedAssistantContent += delta;
              const cleanDelta = isFirstChunk ? delta.replace(/^\n+/, '') : delta;
              isFirstChunk = false;
              const chunkEvent: AssistantChunkEvent = {
                type: AgentEventTypes.AssistantChunk,
                conversationId: convo,
                messageId: msgId,
                delta: cleanDelta,
                ...(usage && { usage }),
              };
              await this.events?.emit(chunkEvent);
            },
            onReasoningChunk: async (delta: string) => {
              await this.events?.emit({
                type: AgentEventTypes.ReasoningChunk,
                conversationId: convo,
                messageId: msgId,
                delta,
              });
            },
            onStreamFinish: async (finishReason?: string, usage?: UsageData) => {
              if (usage) {
                const cost = this.cost.estimate(this.cfg.model, usage);
                this.metrics?.recordLLMCall?.(usage, cost);
              }
              const finishEvent: StreamFinishEvent = {
                type: AgentEventTypes.StreamFinish,
                conversationId: convo,
                messageId: msgId,
                ...(finishReason && { finishReason }),
                ...(usage && { usage }),
              };
              await this.events?.emit(finishEvent);
            },
            onUsage: async (usage: UsageData) => {
              const cost = this.cost.estimate(this.cfg.model, usage);
              this.metrics?.recordLLMCall?.(usage, cost);
            },
          },
          opts.signal,
        );
      } else {
        result = await _llm.generateCompletion({ ...params, messages: accumulatedMessages }, opts.signal);
        if (result.usage) {
          const cost = this.cost.estimate(this.cfg.model, result.usage);
          this.metrics?.recordLLMCall?.(result.usage, cost);
        }
      }

      if (!result.tool_calls?.length && result.content && !finalResponseSaved) {
        const content = opts.stream ? streamedAssistantContent : result.content;
        const assistantMsg: Message = {
          id: msgId,
          role: 'assistant',
          content,
          timestamp: this.clock.iso(),
          usage: result.usage,
        };
        if (result.reasoning) assistantMsg.reasoning = result.reasoning;
        if (result.thinking_blocks) assistantMsg.thinking_blocks = result.thinking_blocks;
        await this.memory.append(convo, [assistantMsg]);
        finalResponseSaved = true;

        // Emit AssistantMessage for both streaming and non-streaming
        // This signals the UI to finalize rendering and enable markdown
        if (content.trim()) {
          const messageEvent: AssistantMessageEvent = {
            type: AgentEventTypes.AssistantMessage,
            conversationId: convo,
            messageId: msgId,
            content,
            ...(result.usage && { usage: result.usage }),
          };
          await this.events?.emit(messageEvent);
        }
      }
    }

    const t1 = this.clock.now();
    const timestamp = this.clock.iso();

    this.metrics?.recordRequestComplete?.(t1 - t0);

    const shouldEmitFinalMessage = result.content?.trim() && !toolApprovalDenied && !finalResponseSaved;

    if (shouldEmitFinalMessage) {
      const messageEvent: AssistantMessageEvent = {
        type: AgentEventTypes.AssistantMessage,
        conversationId: convo,
        messageId: msgId,
        content: result.content,
        ...(result.usage && { usage: result.usage }),
      };
      await this.events?.emit(messageEvent);
    }

    const responseContent = toolApprovalDenied ? denialMessage : result.content;

    const resp: MessageResponse = {
      id: msgId,
      content: responseContent,
      role: MessageRoles.Assistant,
      timestamp,
      metadata: {
        model: this.cfg.model,
        provider: 'echo',
        agentId: this.cfg.id,
        responseTime: t1 - t0,
        promptTokens: result.usage?.prompt_tokens,
        completionTokens: result.usage?.completion_tokens,
        totalTokens: result.usage?.total_tokens,
        estimatedCost: this.cost.estimate(this.cfg.model, result.usage),
        toolCalls: allToolResults.length,
      },
    };

    // Execute pre_stop hook if configured
    if (this.hookPort?.hasHooks(HookEventTypes.PreStop)) {
      const hookContext: HookContext = {
        sessionId: this.sessionId,
        conversationId: convo,
        messageId: msgId,
        hookEvent: HookEventTypes.PreStop,
        cwd: process.cwd(),
      };

      try {
        await this.hookPort.executeHook(hookContext);
        // pre_stop hooks are informational - we don't block completion
      } catch (hookError) {
        console.warn('[Orchestrator] pre_stop hook error:', hookError);
      }
    }

    await this.events?.emit({
      type: AgentEventTypes.Done,
      conversationId: convo,
      messageId: msgId,
      responseTimeMs: t1 - t0,
      usage: result.usage,
    });

    return resp;
  }

  /**
   * Handles a single tool's approval decision.
   * Called by UI per-tool (not batch).
   */
  public handleToolApproval(
    approvalId: string,
    decision: ToolApprovalDecision,
    editInstruction?: string,
  ): void {
    const approval = this.pendingApprovals.get(approvalId);
    if (!approval) {
      console.warn(`[Orchestrator] Received approval for unknown or already processed ID: ${approvalId}`);
      return;
    }

    this.pendingApprovals.delete(approvalId);

    if (decision === 'deny') {
      approval.resolve({ approved: false });
    } else if (decision === 'edit') {
      if (!editInstruction) {
        console.warn(`[Orchestrator] Edit decision received without editInstruction for ${approvalId}, treating as denied`);
        approval.resolve({ approved: false });
      } else {
        approval.toolCall.editInstruction = editInstruction;
        approval.resolve({ approved: true, editInstruction });
      }
    } else if (decision === 'approve_all' || decision === 'approve') {
      approval.resolve({ approved: true });
    } else {
      approval.reject(new Error(`Invalid approval decision: ${decision}`));
    }
  }

  /**
   * Handles user's response to questions.
   * Called by UI when user submits answers.
   */
  public handleUserQuestionResponse(
    questionId: string,
    answers: Record<string, string | string[]>,
  ): void {
    const pending = this.pendingQuestions.get(questionId);
    if (!pending) {
      console.warn(`[Orchestrator] Received response for unknown or already processed question ID: ${questionId}`);
      return;
    }

    this.pendingQuestions.delete(questionId);

    // Emit response event
    void this.events?.emit({
      type: AgentEventTypes.UserQuestionResponse,
      conversationId: pending.conversationId,
      messageId: pending.messageId,
      questionId,
      answers,
    });

    pending.resolve(answers);
  }

  private getAvailableToolNames(): Set<string> {
    const toolDefs = this.tools.getToolDefinitions(this.cfg.enabledTools ?? []);
    return new Set(toolDefs.map((t) => t.function.name));
  }
}
