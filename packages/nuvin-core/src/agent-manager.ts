import type {
  AgentConfig,
  LLMPort,
  ToolPort,
  Message,
  MessageResponse,
  AgentEvent,
  LLMFactory,
  MemoryPort,
} from './ports.js';
import { AgentEventTypes, ErrorReason } from './ports.js';
import { LLMResolver } from './delegation/llm-resolver.js';
import { DefaultAgentStateManager, type AgentStateManager } from './delegation/agent-manager.js';
import type { SpecialistAgentConfig, SpecialistAgentResult } from './agent-types.js';
import { AgentOrchestrator } from './orchestrator.js';
import { SimpleContextBuilder } from './context.js';
import { InMemoryMemory } from './persistent/index.js';
import { ConversationStore, type ConversationMetadata } from './conversation-store.js';
import { SimpleId } from './id.js';
import { SystemClock } from './clock.js';
import { SimpleCost } from './cost.js';
import { NoopReminders } from './reminders.js';
import { InMemoryMetricsPort } from './metrics.js';
import type { MetricsPort } from './ports.js';

const DEFAULT_TIMEOUT_MS = 3000000; // 50 minutes
const MAX_DELEGATION_DEPTH = 3;

/**
 * AgentManager - coordinates specialist agent execution for task delegation
 */
export class AgentManager {
  private llmResolver: LLMResolver | null = null;
  private activeAgents = new Map<string, AgentOrchestrator>();
  private eventCollectors = new Map<string, AgentEvent[]>();
  private stateManager: AgentStateManager;
  private createMemoryForAgent?: (agentKey: string) => MemoryPort<Message>;

  constructor(
    private delegatingConfig: AgentConfig,
    private delegatingTools: ToolPort,
    private llmFactory?: LLMFactory,
    private eventCallback?: (event: AgentEvent) => void,
    private configResolver?: () => Partial<AgentConfig>,
    createMemoryForAgent?: (agentKey: string) => MemoryPort<Message>,
    private metricsPort?: MetricsPort,
  ) {
    if (this.llmFactory) {
      this.llmResolver = new LLMResolver(this.llmFactory);
    }
    this.stateManager = new DefaultAgentStateManager();
    this.createMemoryForAgent = createMemoryForAgent;
  }

  /**
   * Create and execute a specialist agent for a specific task
   */
  async executeTask(config: SpecialistAgentConfig, signal?: AbortSignal): Promise<SpecialistAgentResult> {
    const startTime = Date.now();
    const agentId = config.agentId;

    if (signal?.aborted) {
      return {
        status: 'error',
        result: 'Sub-agent execution aborted by user',
        metadata: {
          agentId,
          agentName: config.agentName,
          toolCallsExecuted: 0,
          executionTimeMs: 0,
          errorMessage: 'Aborted before execution',
          errorReason: ErrorReason.Aborted,
        },
      };
    }

    // Check delegation depth
    const depth = config.delegationDepth ?? 0;
    if (depth >= MAX_DELEGATION_DEPTH) {
      return {
        status: 'error',
        result: `Maximum delegation depth (${MAX_DELEGATION_DEPTH}) exceeded`,
        metadata: {
          agentId,
          agentName: config.agentName,
          toolCallsExecuted: 0,
          executionTimeMs: Date.now() - startTime,
          errorMessage: 'Max delegation depth exceeded',
        },
      };
    }

    // Register session in state manager
    const agentType = config.agentType ?? 'unknown';
    this.stateManager.create(agentType, config.conversationId ?? 'default', config.taskDescription);
    this.stateManager.update(agentId, { state: 'running' });

    // Emit SubAgentStarted event
    await this.eventCallback?.({
      type: AgentEventTypes.SubAgentStarted,
      conversationId: config.conversationId ?? 'default',
      messageId: config.messageId ?? '',
      agentId: config.agentId,
      agentName: config.agentName,
      toolCallId: config.toolCallId ?? '',
    });

    // Create memory for this specific agent using the factory
    // Each agent gets its own file: history.agent:{type}:{id}.json with {"default": [...]} format
    const agentKey = `agent:${agentType}:${agentId}`;
    const memory: MemoryPort<Message> = this.createMemoryForAgent
      ? this.createMemoryForAgent(agentKey)
      : new InMemoryMemory<Message>();

    // Wrap memory in ConversationStore to track metadata
    const conversationStore = new ConversationStore(memory);

    // Initialize default metadata for the sub-agent conversation
    const initialMetadata: ConversationMetadata = {
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      messageCount: 0,
      topic: `${config.agentName}: ${config.taskDescription.substring(0, 50)}...`,
    };
    await conversationStore.updateMetadata('default', initialMetadata);

    // Priority: resumeMessages > delegatingMemory
    // Note: With per-agent files, previous messages are loaded from the agent's own file
    if (config.previousMessages && config.previousMessages.length > 0) {
      await memory.set('default', config.previousMessages);
    } else if (config.share_context && config.delegatingMemory && config.delegatingMemory.length > 0) {
      await memory.set('default', config.delegatingMemory);
    }

    // Create event collector for this specialist agent
    const events: AgentEvent[] = [];
    this.eventCollectors.set(agentId, events);

    const eventPort = {
      emit: async (event: AgentEvent) => {
        events.push(event);

        // Forward specific events to the callback
        if (event.type === AgentEventTypes.ToolCalls) {
          for (const toolCall of event.toolCalls) {
            await this.eventCallback?.({
              type: AgentEventTypes.SubAgentToolCall,
              conversationId: config.conversationId ?? 'default',
              messageId: config.messageId ?? '',
              agentId: config.agentId,
              toolCallId: toolCall.id,
              toolName: toolCall.function.name,
              toolArguments: toolCall.function.arguments,
            });
          }
        } else if (event.type === AgentEventTypes.ToolResult) {
          await this.eventCallback?.({
            type: AgentEventTypes.SubAgentToolResult,
            conversationId: config.conversationId ?? 'default',
            messageId: config.messageId ?? '',
            agentId: config.agentId,
            toolCallId: event.result.id,
            toolName: event.result.name,
            durationMs: event.result.durationMs ?? 0,
            status: event.result.status,
          });
        }
      },
    };

    // Get fresh config values if resolver is available
    const freshConfig = this.configResolver?.() ?? {};

    const specialistConfig: AgentConfig = {
      id: agentId,
      systemPrompt: config.instructions,
      ...(config.temperature !== undefined || this.delegatingConfig.temperature !== undefined
        ? { temperature: config.temperature ?? this.delegatingConfig.temperature }
        : {}),
      ...(config.top_p !== undefined || this.delegatingConfig.topP !== undefined
        ? { topP: config.top_p ?? this.delegatingConfig.topP }
        : {}),
      model: config.model ?? freshConfig.model ?? this.delegatingConfig.model,
      maxTokens: config.max_tokens ?? this.delegatingConfig.maxTokens,
      enabledTools: config.allowed_tools,
      maxToolConcurrency: this.delegatingConfig.maxToolConcurrency,
      requireToolApproval: false,
      reasoningEffort: freshConfig.reasoningEffort ?? this.delegatingConfig.reasoningEffort,
      thinking: freshConfig.thinking ?? this.delegatingConfig.thinking,
    };

    // Create metrics port for this specialist agent
    // If a metricsPort is passed, use it; otherwise create one for events
    const metrics =
      this.metricsPort ??
      new InMemoryMetricsPort((snapshot) => {
        this.eventCallback?.({
          type: AgentEventTypes.SubAgentMetrics,
          conversationId: config.conversationId ?? 'default',
          messageId: config.messageId ?? '',
          agentId: config.agentId,
          toolCallId: config.toolCallId ?? '',
          metrics: snapshot,
        });
      });

    // Determine which LLM to use
    const llm = this.resolveLLM(config);

    // Create specialist orchestrator
    const specialistOrchestrator = new AgentOrchestrator(specialistConfig, {
      memory,
      llm,
      tools: this.delegatingTools,
      context: new SimpleContextBuilder(),
      ids: new SimpleId(),
      clock: new SystemClock(),
      cost: new SimpleCost(),
      reminders: new NoopReminders(),
      events: eventPort,
      metrics,
    });

    this.activeAgents.set(agentId, specialistOrchestrator);

    try {
      // Execute the task with timeout - use 'default' as conversation key since each agent has its own memory
      const timeoutMs = config.timeout_ms ?? DEFAULT_TIMEOUT_MS;
      const response = await this.executeWithTimeout(
        specialistOrchestrator,
        config.taskDescription,
        'default',
        timeoutMs,
        signal,
        config.stream,
      );

      const executionTimeMs = Date.now() - startTime;
      const conversationHistory = await memory.get('default');

      // Count tool calls from events
      const toolCallsExecuted = events.filter((e) => e.type === 'tool_calls').length;

      // Collect usage data from events
      let totalTokens = 0;
      for (const event of events) {
        if (event.type === 'done' && event.usage?.total_tokens) {
          totalTokens += event.usage.total_tokens;
        }
      }

      // Capture final metrics snapshot
      const snapshot = metrics.getSnapshot();

      // Emit SubAgentCompleted event
      await this.eventCallback?.({
        type: AgentEventTypes.SubAgentCompleted,
        conversationId: config.conversationId ?? 'default',
        messageId: config.messageId ?? '',
        agentId: config.agentId,
        agentName: config.agentName,
        status: 'success',
        resultMessage: response.content || '',
        totalDurationMs: executionTimeMs,
      });

      // Update conversation metadata with execution results
      await conversationStore.updateMetadata('default', {
        updatedAt: new Date().toISOString(),
        messageCount: conversationHistory.length,
        totalTokens: totalTokens || response.metadata?.totalTokens,
        promptTokens: response.metadata?.promptTokens,
        completionTokens: response.metadata?.completionTokens,
        toolCallCount: toolCallsExecuted,
        totalTimeMs: executionTimeMs,
      });

      // Note: Messages are already saved incrementally via sharedMemory (no batch save needed)
      // Update state manager for session tracking
      this.stateManager.update(agentId, {
        state: 'completed',
        endTime: Date.now(),
        result: response.content || '',
        metrics: {
          tokensUsed: totalTokens || response.metadata?.totalTokens,
          toolCallsExecuted,
          executionTimeMs,
        },
      });

      return {
        status: 'success',
        result: response.content || '',
        metadata: {
          agentId,
          agentName: config.agentName,
          tokensUsed: totalTokens || response.metadata?.totalTokens,
          toolCallsExecuted,
          executionTimeMs,
          conversationHistory,
          events,
          metrics: snapshot,
          sessionId: agentId,
        },
      };
    } catch (error) {
      const executionTimeMs = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : String(error);
      const isTimeout = error instanceof Error && error.message.includes('timeout');
      const isAborted = error instanceof Error && (error.message.includes('aborted') || error.name === 'AbortError');
      const status = isTimeout ? 'timeout' : isAborted ? 'error' : 'error';

      // Determine error reason for metadata
      let errorReason: ErrorReason | undefined;
      if (isAborted) {
        errorReason = ErrorReason.Aborted;
      } else if (isTimeout) {
        errorReason = ErrorReason.Timeout;
      }

      // Update state manager on failure
      this.stateManager.update(agentId, {
        state: 'failed',
        endTime: Date.now(),
        error: errorMessage,
      });

      // Emit SubAgentCompleted event
      await this.eventCallback?.({
        type: AgentEventTypes.SubAgentCompleted,
        conversationId: config.conversationId ?? 'default',
        messageId: config.messageId ?? '',
        agentId: config.agentId,
        agentName: config.agentName,
        status,
        resultMessage: errorMessage,
        totalDurationMs: executionTimeMs,
      });

      return {
        status,
        result: errorMessage,
        metadata: {
          agentId,
          agentName: config.agentName,
          toolCallsExecuted: events.filter((e) => e.type === 'tool_calls').length,
          executionTimeMs,
          errorMessage,
          errorReason,
          events,
          sessionId: agentId,
        },
      };
    } finally {
      // Cleanup
      this.activeAgents.delete(agentId);
      this.eventCollectors.delete(agentId);
    }
  }

  /**
   * Resolve which LLM to use - creates fresh LLM instance via factory
   */
  private resolveLLM(config: SpecialistAgentConfig): LLMPort {
    if (!this.llmResolver) {
      throw new Error(
        'AgentManager requires LLMFactory to create sub-agents. Please provide llmFactory in constructor.',
      );
    }
    return this.llmResolver.resolve(config);
  }

  /**
   * Execute agent task with timeout
   */
  private async executeWithTimeout(
    orchestrator: AgentOrchestrator,
    taskDescription: string,
    conversationId: string,
    timeoutMs: number,
    signal?: AbortSignal,
    stream?: boolean,
  ): Promise<MessageResponse> {
    const timeoutController = new AbortController();
    const combinedSignal = signal ? AbortSignal.any([signal, timeoutController.signal]) : timeoutController.signal;

    let timer: ReturnType<typeof setTimeout> | undefined;

    try {
      return await Promise.race([
        orchestrator.send(taskDescription, {
          conversationId,
          signal: combinedSignal,
          stream,
        }),
        new Promise<never>((_, reject) => {
          if (signal?.aborted) {
            reject(new Error('Sub-agent execution aborted by user'));
            return;
          }
          signal?.addEventListener('abort', () => reject(new Error('Sub-agent execution aborted by user')), {
            once: true,
          });
        }),
        new Promise<never>((_, reject) => {
          timer = setTimeout(() => {
            timeoutController.abort();
            reject(new Error(`Task execution timeout after ${timeoutMs}ms`));
          }, timeoutMs);
        }),
      ]);
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  /**
   * Get active specialist agent count
   */
  getActiveAgentCount(): number {
    return this.activeAgents.size;
  }

  /**
   * Get events for a specific specialist agent
   */
  getAgentEvents(agentId: string): AgentEvent[] | undefined {
    return this.eventCollectors.get(agentId);
  }

  /**
   * Cleanup all active agents (emergency stop)
   */
  cleanup(): void {
    this.activeAgents.clear();
    this.eventCollectors.clear();
  }

  /**
   * Get the state manager for querying sessions
   */
  getStateManager(): AgentStateManager {
    return this.stateManager;
  }
}
