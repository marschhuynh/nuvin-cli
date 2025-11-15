import type { AgentConfig, LLMPort, ToolPort, Message, MessageResponse, AgentEvent, LLMFactory } from './ports.js';
import { AgentEventTypes } from './ports.js';
import { LLMResolver } from './delegation/LLMResolver.js';
import type { SpecialistAgentConfig, SpecialistAgentResult } from './agent-types.js';
import { AgentOrchestrator } from './orchestrator.js';
import { SimpleContextBuilder } from './context.js';
import { InMemoryMemory } from './persistent/index.js';
import { SimpleId } from './id.js';
import { SystemClock } from './clock.js';
import { SimpleCost } from './cost.js';
import { NoopReminders } from './reminders.js';

const DEFAULT_TIMEOUT_MS = 300000; // 5 minutes
const MAX_DELEGATION_DEPTH = 3;

/**
 * AgentManager - coordinates specialist agent execution for task delegation
 */
export class AgentManager {
  private llmResolver: LLMResolver | null = null;
  private activeAgents = new Map<string, AgentOrchestrator>();
  private eventCollectors = new Map<string, AgentEvent[]>();

  constructor(
    private delegatingConfig: AgentConfig,
    private delegatingTools: ToolPort,
    private llmFactory?: LLMFactory,
    private eventCallback?: (event: AgentEvent) => void,
    private configResolver?: () => Partial<AgentConfig>,
  ) {
    if (this.llmFactory) {
      this.llmResolver = new LLMResolver(this.llmFactory);
    }
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
          toolCallsExecuted: 0,
          executionTimeMs: 0,
          errorMessage: 'Aborted before execution',
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
          toolCallsExecuted: 0,
          executionTimeMs: Date.now() - startTime,
          errorMessage: 'Max delegation depth exceeded',
        },
      };
    }

    // Emit SubAgentStarted event
    this.eventCallback?.({
      type: AgentEventTypes.SubAgentStarted,
      conversationId: config.conversationId ?? 'default',
      messageId: config.messageId ?? '',
      agentId: config.agentId,
      agentName: config.agentName,
      toolCallId: config.toolCallId ?? '',
    });

    // Create specialist agent memory
    const memory = new InMemoryMemory<Message>();

    // If context sharing is enabled, seed with delegating agent's context
    if (config.shareContext && config.delegatingMemory && config.delegatingMemory.length > 0) {
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
            this.eventCallback?.({
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
          this.eventCallback?.({
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

    // Create specialist agent config
    const specialistConfig: AgentConfig = {
      id: agentId,
      systemPrompt: config.systemPrompt,
      temperature: config.temperature ?? this.delegatingConfig.temperature,
      topP: config.topP ?? this.delegatingConfig.topP,
      model: config.model ?? freshConfig.model ?? this.delegatingConfig.model,
      maxTokens: config.maxTokens ?? this.delegatingConfig.maxTokens,
      enabledTools: config.tools,
      maxToolConcurrency: this.delegatingConfig.maxToolConcurrency,
      requireToolApproval: false, // Specialists run autonomously
      reasoningEffort: freshConfig.reasoningEffort ?? this.delegatingConfig.reasoningEffort,
    };

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
    });

    this.activeAgents.set(agentId, specialistOrchestrator);

    try {
      // Execute the task with timeout
      const timeoutMs = config.timeoutMs ?? DEFAULT_TIMEOUT_MS;
      const response = await this.executeWithTimeout(specialistOrchestrator, config.taskDescription, timeoutMs, signal);

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

      // Emit SubAgentCompleted event
      this.eventCallback?.({
        type: AgentEventTypes.SubAgentCompleted,
        conversationId: config.conversationId ?? 'default',
        messageId: config.messageId ?? '',
        agentId: config.agentId,
        agentName: config.agentName,
        status: 'success',
        resultMessage: response.content || '',
        totalDurationMs: executionTimeMs,
      });

      return {
        status: 'success',
        result: response.content || '',
        metadata: {
          agentId,
          tokensUsed: totalTokens || response.metadata?.totalTokens,
          toolCallsExecuted,
          executionTimeMs,
          conversationHistory,
          events,
        },
      };
    } catch (error) {
      const executionTimeMs = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : String(error);
      const isTimeout = error instanceof Error && error.message.includes('timeout');
      const isAborted = error instanceof Error && (error.message.includes('aborted') || error.name === 'AbortError');
      const status = isTimeout ? 'timeout' : isAborted ? 'error' : 'error';

      // Emit SubAgentCompleted event
      this.eventCallback?.({
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
          toolCallsExecuted: events.filter((e) => e.type === 'tool_calls').length,
          executionTimeMs,
          errorMessage,
          events,
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
    timeoutMs: number,
    signal?: AbortSignal,
  ): Promise<MessageResponse> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error(`Task execution timeout after ${timeoutMs}ms`));
      }, timeoutMs);

      const abortHandler = () => {
        clearTimeout(timer);
        reject(new Error('Sub-agent execution aborted by user'));
      };

      signal?.addEventListener('abort', abortHandler);

      orchestrator
        .send(taskDescription, { conversationId: 'default', signal })
        .then((response) => {
          clearTimeout(timer);
          signal?.removeEventListener('abort', abortHandler);
          resolve(response);
        })
        .catch((error) => {
          clearTimeout(timer);
          signal?.removeEventListener('abort', abortHandler);
          reject(error);
        });
    });
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
}
