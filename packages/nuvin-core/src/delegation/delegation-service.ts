import type { AssignParams, SpecialistAgentResult, AgentTemplate } from '../agent-types.js';
import type { ToolExecutionContext } from '../tools/types.js';
import type {
  AgentCatalog,
  AgentCommandRunner,
  DelegationResult,
  DelegationService,
  SpecialistAgentFactory,
  BackgroundDelegationResult,
} from './types.js';

const DEFAULT_DELEGATION_DEPTH = 0;

/**
 * Inline policy: checks whether the agent is enabled (if explicitly configured).
 */
function evaluatePolicy(
  agent: AgentTemplate,
  enabledAgents: Record<string, boolean>,
): { allowed: boolean; reason?: string } {
  const agentName = agent.name;
  if (!agentName) {
    return { allowed: false, reason: 'Agent is missing identifier.' };
  }

  const enabled = enabledAgents[agentName];
  if (enabled === false) {
    return {
      allowed: false,
      reason: `Agent "${agentName}" is currently disabled. Please enable it in the agent configuration.`,
    };
  }

  return { allowed: true };
}

/**
 * Inline formatter: formats success and error results.
 */
function formatSuccess(agentId: string, result: SpecialistAgentResult) {
  return {
    summary: result.result,
    metadata: {
      agentId: agentId,
      agentName: result.metadata.agentName,
      status: result.status,
      executionTimeMs: result.metadata.executionTimeMs,
      toolCallsExecuted: result.metadata.toolCallsExecuted,
      tokensUsed: result.metadata.tokensUsed,
      metrics: result.metadata.metrics,
    },
  };
}

function formatError(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}

export class DefaultDelegationService implements DelegationService {
  private enabledAgents: Record<string, boolean> = {};
  private backgroundAgents = new Map<string, Promise<DelegationResult>>();

  constructor(
    private readonly catalog: AgentCatalog,
    private readonly factory: SpecialistAgentFactory,
    private readonly runner: AgentCommandRunner,
  ) {}

  setEnabledAgents(enabledAgents: Record<string, boolean>): void {
    this.enabledAgents = enabledAgents;
  }

  listEnabledAgents() {
    return this.catalog.list().filter((agent) => !agent.name || this.enabledAgents[agent.name] !== false);
  }

  async delegate(params: AssignParams, context?: ToolExecutionContext): Promise<DelegationResult> {
    const template = this.catalog.get(params.agent);
    if (!template) {
      const availableAgents = this.catalog
        .list()
        .map((a) => a.name)
        .filter(Boolean)
        .join(', ');
      return {
        success: false,
        error: `Agent "${params.agent}" not found in registry. Available agents: ${availableAgents}`,
      };
    }

    const decision = evaluatePolicy(template, this.enabledAgents);

    if (!decision.allowed) {
      return {
        success: false,
        error: decision.reason ?? 'Agent delegation is not allowed.',
      };
    }

    const currentDepth =
      typeof context?.delegationDepth === 'number' ? context.delegationDepth : DEFAULT_DELEGATION_DEPTH;

    const specialistConfig = await this.factory.create({
      template,
      params,
      context,
      currentDepth,
    });

    try {
      const result = await this.runner.run(specialistConfig, context);

      if (result.status === 'error' || result.status === 'timeout') {
        return {
          success: false,
          error: result.result,
        };
      }

      const { summary, metadata } = formatSuccess(params.agent, result);
      return {
        success: true,
        summary,
        metadata: {
          ...metadata,
          sessionId: result.metadata.sessionId,
        },
      };
    } catch (error) {
      return {
        success: false,
        error: `Failed to execute specialist agent: ${formatError(error)}`,
      };
    }
  }

  async delegateBackground(params: AssignParams, context?: ToolExecutionContext): Promise<BackgroundDelegationResult> {
    const template = this.catalog.get(params.agent);
    if (!template) {
      return {
        success: false,
        error: `Agent "${params.agent}" not found in registry.`,
      };
    }

    const decision = evaluatePolicy(template, this.enabledAgents);

    if (!decision.allowed) {
      return {
        success: false,
        error: decision.reason ?? 'Agent delegation is not allowed.',
      };
    }

    const currentDepth =
      typeof context?.delegationDepth === 'number' ? context.delegationDepth : DEFAULT_DELEGATION_DEPTH;

    const specialistConfig = await this.factory.create({
      template,
      params,
      context,
      currentDepth,
    });

    const sessionId = specialistConfig.agentId;

    const executionPromise = this.runner
      .run(specialistConfig, context)
      .then((result) => {
        if (result.status === 'error' || result.status === 'timeout') {
          return { success: false, error: result.result } as DelegationResult;
        }
        const { summary, metadata } = formatSuccess(params.agent, result);
        return {
          success: true,
          summary,
          metadata: {
            ...metadata,
            sessionId: result.metadata.sessionId,
          },
        } as DelegationResult;
      })
      .catch((error) => {
        return {
          success: false,
          error: `Failed to execute specialist agent: ${formatError(error)}`,
        } as DelegationResult;
      });

    this.backgroundAgents.set(sessionId, executionPromise);

    return {
      success: true,
      sessionId,
    };
  }

  async getBackgroundResult(sessionId: string, blocking: boolean = false): Promise<DelegationResult | null> {
    const promise = this.backgroundAgents.get(sessionId);
    if (!promise) {
      return null;
    }

    if (blocking) {
      const result = await promise;
      this.backgroundAgents.delete(sessionId);
      return result;
    }

    const result = await Promise.race([
      promise.then((r) => ({ resolved: true as const, result: r })),
      Promise.resolve({ resolved: false as const }),
    ]);

    if (result.resolved) {
      this.backgroundAgents.delete(sessionId);
      return result.result;
    }

    return null;
  }

  isBackgroundAgentRunning(sessionId: string): boolean {
    return this.backgroundAgents.has(sessionId);
  }
}
