import type {
  AgentConfig,
  AgentEvent,
  ChatMessage,
  Clock,
  CompletionParams,
  CompletionResult,
  ContextBuilder,
  CostCalculator,
  IdGenerator,
  LLMPort,
  MemoryPort,
  Message,
  MessageContent,
  MessageContentPart,
  MessageResponse,
  RemindersPort,
  SendMessageOptions,
  ToolExecutionResult,
  ToolInvocation,
  ToolPort,
  ToolCall,
  UserAttachment,
  UserMessagePayload,
  ToolApprovalDecision,
  EventPort,
  UsageData,
} from './ports.js';
import { AgentEventTypes, MessageRoles } from './ports.js';

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

export class AgentOrchestrator {
  private pendingApprovals = new Map<
    string,
    { resolve: (calls: ToolCall[]) => void; reject: (error: Error) => void }
  >();

  constructor(
    private cfg: AgentConfig,
    private deps: {
      memory: MemoryPort<Message>;
      llm: LLMPort;
      tools: ToolPort;
      context: ContextBuilder;
      ids: IdGenerator;
      clock: Clock;
      cost: CostCalculator;
      reminders: RemindersPort;
      events?: EventPort;
    },
  ) {}

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
    this.deps.llm = newLLM;
  }

  /**
   * Updates the tool port without reinitializing the entire orchestrator.
   * This preserves conversation history and other state while adding/removing tools.
   */
  public setTools(newTools: ToolPort): void {
    this.deps.tools = newTools;
  }

  /**
   * Gets the current tool port.
   */
  public getTools(): ToolPort {
    return this.deps.tools;
  }

  /**
   * Gets the current LLM port.
   */
  public getLLM(): LLMPort {
    return this.deps.llm;
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
    this.deps.memory = newMemory;
  }

  /**
   * Updates the event port without reinitializing the entire orchestrator.
   * This is useful when switching to a new session with a different event log file.
   */
  public setEvents(newEvents: import('./ports.js').EventPort): void {
    this.deps.events = newEvents;
  }

  /**
   * Determines if a tool should bypass approval requirements.
   * Read-only tools and todo management tools are auto-approved.
   */
  private shouldBypassApproval(toolName: string): boolean {
    const readOnlyTools = ['file_read', 'dir_ls', 'web_search', 'web_fetch'];

    const todoTools = ['todo_write', 'todo_read'];

    return readOnlyTools.includes(toolName) || todoTools.includes(toolName);
  }

  private async handleToolDenial(
    denialMessage: string,
    conversationId: string,
    messageId: string,
    accumulatedMessages: ChatMessage[],
    turnHistory: Message[],
    originalToolCalls: ToolCall[],
    assistantContent: string | null,
    usage?: UsageData,
  ): Promise<void> {
    const assistantMsg: Message = {
      id: this.deps.ids.uuid(),
      role: 'assistant',
      content: assistantContent ?? null,
      timestamp: this.deps.clock.iso(),
      tool_calls: originalToolCalls,
      usage,
    };

    accumulatedMessages.push({
      role: 'assistant',
      content: assistantContent ?? null,
      tool_calls: originalToolCalls,
    });
    turnHistory.push(assistantMsg);

    const toolResultMsgs: Message[] = [];
    for (const toolCall of originalToolCalls) {
      const toolDenialResult = 'Tool execution denied by user';

      accumulatedMessages.push({
        role: 'tool',
        content: toolDenialResult,
        tool_call_id: toolCall.id,
        name: toolCall.function.name,
      });

      const toolMsg: Message = {
        id: toolCall.id,
        role: 'tool',
        content: toolDenialResult,
        timestamp: this.deps.clock.iso(),
        tool_call_id: toolCall.id,
        name: toolCall.function.name,
      };
      turnHistory.push(toolMsg);
      toolResultMsgs.push(toolMsg);
    }

    await this.deps.memory.append(conversationId, [assistantMsg, ...toolResultMsgs]);

    await this.deps.events?.emit({
      type: AgentEventTypes.AssistantMessage,
      conversationId,
      messageId,
      content: denialMessage,
      usage: undefined,
    });
  }

  private async processToolApproval(
    toolCalls: ToolCall[],
    conversationId: string,
    messageId: string,
    accumulatedMessages: ChatMessage[],
    turnHistory: Message[],
    assistantContent: string | null,
    usage?: UsageData,
  ): Promise<{ approvedCalls: ToolCall[]; wasDenied: boolean; denialMessage?: string }> {
    if (this.cfg.requireToolApproval === false) {
      return { approvedCalls: toolCalls, wasDenied: false };
    }

    const callsNeedingApproval = toolCalls.filter((call) => !this.shouldBypassApproval(call.function.name));
    const callsToAutoApprove = toolCalls.filter((call) => this.shouldBypassApproval(call.function.name));

    if (callsNeedingApproval.length === 0) {
      return { approvedCalls: callsToAutoApprove, wasDenied: false };
    }

    try {
      const manuallyApproved = await this.waitForToolApproval(callsNeedingApproval, conversationId, messageId);
      return { approvedCalls: [...manuallyApproved, ...callsToAutoApprove], wasDenied: false };
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Tool approval failed';
      const denialMessage = `Tool execution was not approved: ${errorMsg}`;

      await this.handleToolDenial(
        denialMessage,
        conversationId,
        messageId,
        accumulatedMessages,
        turnHistory,
        toolCalls,
        assistantContent,
        usage,
      );

      return { approvedCalls: [], wasDenied: true, denialMessage };
    }
  }
  async send(content: UserMessagePayload, opts: SendMessageOptions = {}): Promise<MessageResponse> {
    const convo = opts.conversationId ?? 'default';
    const t0 = this.deps.clock.now();
    const msgId = this.deps.ids.uuid();

    const history = await this.deps.memory.get(convo);
    let providerMsgs: ChatMessage[];
    let userMessages: Message[];
    let userDisplay: string;
    let enhanced: string[];

    if (opts.retry) {
      providerMsgs = this.deps.context.toProviderMessages(history, this.cfg.systemPrompt, []);
      userMessages = [];
      userDisplay = '[Retry]';
      enhanced = [];
    } else {
      const normalized =
        typeof content === 'string'
          ? { text: content, displayText: content, attachments: [] as UserAttachment[] }
          : {
              text: content.text ?? '',
              displayText: content.displayText,
              attachments: Array.isArray(content.attachments) ? content.attachments : [],
            };

      const attachments = normalized.attachments;
      enhanced = this.deps.reminders.enhance(normalized.text, { conversationId: convo });
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

      providerMsgs = this.deps.context.toProviderMessages(history, this.cfg.systemPrompt, [userContent]);

      userDisplay = resolveDisplayText(normalized.text, attachments, normalized.displayText);
      const userTimestamp = this.deps.clock.iso();
      userMessages = [{ id: this.deps.ids.uuid(), role: 'user', content: userContent, timestamp: userTimestamp }];

      await this.deps.memory.append(convo, userMessages);
    }

    if (opts.signal?.aborted) throw new Error('Aborted');

    const toolDefs = this.deps.tools.getToolDefinitions(this.cfg.enabledTools ?? []);
    const toolNames = toolDefs.map((t) => t.function.name);

    await this.deps.events?.emit({
      type: AgentEventTypes.MessageStarted,
      conversationId: convo,
      messageId: msgId,
      userContent: userDisplay,
      enhanced,
      toolNames,
    });

    const reasoningParam = this.cfg.reasoningEffort ? { effort: this.cfg.reasoningEffort } : undefined;

    const params: CompletionParams = {
      messages: providerMsgs,
      model: this.cfg.model,
      temperature: this.cfg.temperature,
      maxTokens: this.cfg.maxTokens,
      topP: this.cfg.topP,
      tools: toolDefs.length ? toolDefs : undefined,
      tool_choice: toolDefs.length ? 'auto' : 'none',
      reasoning: reasoningParam,
    };

    let streamedAssistantContent = '';
    const allToolResults: ToolExecutionResult[] = [];
    const accumulatedMessages: ChatMessage[] = [...providerMsgs];
    const turnHistory: Message[] = [];
    let result: CompletionResult;
    let toolApprovalDenied = false;
    let denialMessage = '';
    let finalResponseSaved = false;

    try {
      if (opts.stream && typeof this.deps.llm.streamCompletion === 'function') {
        let isFirstChunk = true;
        result = await this.deps.llm.streamCompletion(
          params,
          {
            onChunk: async (delta: string, usage?: UsageData) => {
              try {
                streamedAssistantContent += delta;
              } catch {}
              // Only strip leading newlines from the very first chunk
              const cleanDelta = isFirstChunk ? delta.replace(/^\n+/, '') : delta;
              isFirstChunk = false;
              const chunkEvent: AssistantChunkEvent = {
                type: AgentEventTypes.AssistantChunk,
                conversationId: convo,
                messageId: msgId,
                delta: cleanDelta,
                ...(usage && { usage }),
              };
              await this.deps.events?.emit(chunkEvent);
            },
            onStreamFinish: async (finishReason?: string, usage?: UsageData) => {
              const finishEvent: StreamFinishEvent = {
                type: AgentEventTypes.StreamFinish,
                conversationId: convo,
                messageId: msgId,
                ...(finishReason && { finishReason }),
                ...(usage && { usage }),
              };
              await this.deps.events?.emit(finishEvent);
            },
          },
          opts.signal,
        );
      } else {
        result = await this.deps.llm.generateCompletion(params, opts.signal);
      }

      if (!result.tool_calls?.length && result.content && !finalResponseSaved) {
        const content = opts.stream ? streamedAssistantContent : result.content;
        const assistantMsg: Message = {
          id: msgId,
          role: 'assistant',
          content,
          timestamp: this.deps.clock.iso(),
          usage: result.usage,
        };
        await this.deps.memory.append(convo, [assistantMsg]);
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
          await this.deps.events?.emit(messageEvent);
        }
      }

      while (result.tool_calls?.length) {
        if (result.content?.trim()) {
          const messageEvent: AssistantMessageEvent = {
            type: AgentEventTypes.AssistantMessage,
            conversationId: convo,
            messageId: msgId,
            content: result.content,
            ...(result.usage && { usage: result.usage }),
          };
          await this.deps.events?.emit(messageEvent);
        }

        if (opts.signal?.aborted) throw new Error('Aborted');
        await this.deps.events?.emit({
          type: AgentEventTypes.ToolCalls,
          conversationId: convo,
          messageId: msgId,
          toolCalls: result.tool_calls,
          usage: result.usage,
        });

        const approvalResult = await this.processToolApproval(
          result.tool_calls,
          convo,
          msgId,
          accumulatedMessages,
          turnHistory,
          result.content,
          result.usage,
        );

        if (approvalResult.wasDenied) {
          denialMessage = approvalResult.denialMessage || '';
          toolApprovalDenied = true;
          break;
        }

        const approvedCalls = approvalResult.approvedCalls;

        const invocations = this.toInvocations(approvedCalls);
        if (opts.signal?.aborted) throw new Error('Aborted');
        const toolResults = await this.deps.tools.executeToolCalls(
          invocations,
          {
            conversationId: convo,
            agentId: this.cfg.id,
            messageId: msgId,
            eventPort: this.deps.events,
          },
          this.cfg.maxToolConcurrency ?? 3,
          opts.signal,
        );
        allToolResults.push(...toolResults);

        const assistantMsg: Message = {
          id: this.deps.ids.uuid(),
          role: 'assistant',
          content: result.content ?? null,
          timestamp: this.deps.clock.iso(),
          tool_calls: approvedCalls,
          usage: result.usage,
        };

        const toolResultMsgs: Message[] = [];
        for (const tr of toolResults) {
          const contentStr =
            tr.status === 'error'
              ? String(tr.result)
              : typeof tr.result === 'string'
                ? tr.result
                : JSON.stringify(tr.result);

          toolResultMsgs.push({
            id: tr.id,
            role: 'tool',
            content: contentStr,
            timestamp: this.deps.clock.iso(),
            tool_call_id: tr.id,
            name: tr.name,
          });

          await this.deps.events?.emit({
            type: AgentEventTypes.ToolResult,
            conversationId: convo,
            messageId: msgId,
            result: tr,
          });
        }

        await this.deps.memory.append(convo, [assistantMsg, ...toolResultMsgs]);

        accumulatedMessages.push({ role: 'assistant', content: result.content ?? null, tool_calls: approvedCalls });
        for (const tr of toolResults) {
          const contentStr =
            tr.status === 'error'
              ? String(tr.result)
              : typeof tr.result === 'string'
                ? tr.result
                : JSON.stringify(tr.result);
          accumulatedMessages.push({ role: 'tool', content: contentStr, tool_call_id: tr.id, name: tr.name });
        }

        if (opts.signal?.aborted) throw new Error('Aborted');

        streamedAssistantContent = '';

        if (opts.stream && typeof this.deps.llm.streamCompletion === 'function') {
          let isFirstChunk = true;
          result = await this.deps.llm.streamCompletion(
            { ...params, messages: accumulatedMessages },
            {
              onChunk: async (delta: string, usage?: UsageData) => {
                try {
                  streamedAssistantContent += delta;
                } catch {}
                // Only strip leading newlines from the very first chunk
                const cleanDelta = isFirstChunk ? delta.replace(/^\n+/, '') : delta;
                isFirstChunk = false;
                const chunkEvent: AssistantChunkEvent = {
                  type: AgentEventTypes.AssistantChunk,
                  conversationId: convo,
                  messageId: msgId,
                  delta: cleanDelta,
                  ...(usage && { usage }),
                };
                await this.deps.events?.emit(chunkEvent);
              },
              onStreamFinish: async (finishReason?: string, usage?: UsageData) => {
                const finishEvent: StreamFinishEvent = {
                  type: AgentEventTypes.StreamFinish,
                  conversationId: convo,
                  messageId: msgId,
                  ...(finishReason && { finishReason }),
                  ...(usage && { usage }),
                };
                await this.deps.events?.emit(finishEvent);
              },
            },
            opts.signal,
          );
        } else {
          result = await this.deps.llm.generateCompletion({ ...params, messages: accumulatedMessages }, opts.signal);
        }

        if (!result.tool_calls?.length && result.content && !finalResponseSaved) {
          const content = opts.stream ? streamedAssistantContent : result.content;
          const assistantMsg: Message = {
            id: msgId,
            role: 'assistant',
            content,
            timestamp: this.deps.clock.iso(),
            usage: result.usage,
          };
          await this.deps.memory.append(convo, [assistantMsg]);
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
            await this.deps.events?.emit(messageEvent);
          }
        }
      }

      const t1 = this.deps.clock.now();
      const timestamp = this.deps.clock.iso();

      const shouldEmitFinalMessage = result.content?.trim() && !toolApprovalDenied && !finalResponseSaved;

      if (shouldEmitFinalMessage) {
        const messageEvent: AssistantMessageEvent = {
          type: AgentEventTypes.AssistantMessage,
          conversationId: convo,
          messageId: msgId,
          content: result.content,
          ...(result.usage && { usage: result.usage }),
        };
        await this.deps.events?.emit(messageEvent);
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
          estimatedCost: this.deps.cost.estimate(this.cfg.model, result.usage),
          toolCalls: allToolResults.length,
        },
      };

      await this.deps.events?.emit({
        type: AgentEventTypes.Done,
        conversationId: convo,
        messageId: msgId,
        responseTimeMs: t1 - t0,
        usage: result.usage,
      });

      return resp;
    } catch (err) {
      throw err;
    }
  }

  private async waitForToolApproval(
    toolCalls: ToolCall[],
    conversationId: string,
    messageId: string,
  ): Promise<ToolCall[]> {
    const approvalId = this.deps.ids.uuid();

    return new Promise((resolve, reject) => {
      this.pendingApprovals.set(approvalId, { resolve, reject });

      this.deps.events?.emit({
        type: AgentEventTypes.ToolApprovalRequired,
        conversationId,
        messageId,
        toolCalls,
        approvalId,
      });
    });
  }

  public handleToolApproval(approvalId: string, decision: ToolApprovalDecision, approvedCalls?: ToolCall[]): void {
    const approval = this.pendingApprovals.get(approvalId);
    if (!approval) {
      console.warn(`[Orchestrator] Received approval for unknown or already processed ID: ${approvalId}`);
      return;
    }

    this.pendingApprovals.delete(approvalId);

    if (decision === 'deny') {
      approval.reject(new Error('Tool execution denied by user'));
    } else if (decision === 'approve_all' || decision === 'approve') {
      approval.resolve(approvedCalls || []);
    } else {
      approval.reject(new Error(`Invalid approval decision: ${decision}`));
    }
  }

  private toInvocations(toolCalls: ToolCall[]): ToolInvocation[] {
    return toolCalls.map((tc) => {
      let parameters: Record<string, any> = {};
      try {
        parameters = JSON.parse(tc.function.arguments || '{}') as Record<string, any>;
      } catch {
        parameters = {};
      }
      return { id: tc.id, name: tc.function.name, parameters };
    });
  }
}
