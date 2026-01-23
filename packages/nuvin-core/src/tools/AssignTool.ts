import type { ToolDefinition } from '../ports.js';
import { ErrorReason } from '../ports.js';
import type { FunctionTool, ToolExecutionContext, ExecResultError } from './types.js';
import { okText, err } from './result-helpers.js';
import type { AssignParams } from '../agent-types.js';
import type { DelegationService } from '../delegation/types.js';
import type { AssignTaskMetadata } from './tool-result-metadata.js';
import type { DelegationMetadata } from './metadata-types.js';

const DESCRIPTION_TEMPLATE = `Delegate tasks to specialist agents with focused expertise.

Specialist agents operate in isolated contexts with dedicated tools and system prompts. Each agent is optimized for specific workflows and can work independently or collaboratively.

Available agents:
{AGENT_LIST}

**When to use this tool:**
- Tasks matching a specialist's domain (code review, security audit, research, testing)
- Multi-step workflows requiring sustained attention and focus
- Complex operations that benefit from domain-specific knowledge
- Work that produces verbose output you don't want polluting main context

**When NOT to use this tool:**
- Simple questions the main agent can answer directly
- Tasks requiring frequent iterative refinement with you
- Quick lookups or single-file operations (use: file_read, grep_tool, glob_tool)
- Reading specific files or searching for known patterns

**Orchestration patterns supported:**
- Supervisor pattern: Central agent delegates to specialists
- Sequential: Ordered handoffs (draft → review → polish)
- Concurrent: Parallel independent tasks
- Handoff: Dynamic capability-based routing

**Parameters:**

\`description\` (required) - Short identifier for tracking and logs.
  → 3-7 words. Example: "Security audit of auth module"

\`task\` (required) - Detailed instructions for the agent.
  → Include: what to analyze/create, specific files/patterns/scope, expected output format, constraints
  → Scale effort to query complexity (simple fact-finding vs. deep research)

\`resume\` (optional) - Session ID from previous delegation to continue context.
  → Format: "<agent-type>:<session-id>". Preserves full conversation history.

**Context engineering notes:**
- Agents use ~15x more tokens than single-agent workflows
- Each agent maintains isolated context windows for focused reasoning
- Complex tasks benefit from sub-agent specialization
- State is passed via shared session state between agents in a workflow

**Parallelism guidance:**
- Launch multiple agents in parallel to speed up work whenever tasks are independent
- Each agent's work should be isolated (different files, different scopes) to avoid conflicts
- Split large tasks into smaller, independent chunks that can run concurrently
- Example: Review 50 test files → launch 5 agents, each reviewing 10 different files
- Example: Research a topic → launch historian, technologist, and practitioner agents in parallel

**Writing effective task descriptions:**

Good: "Review src/auth/*.ts for security vulnerabilities. Focus on authentication flows, token handling, and input validation. Report critical issues with severity level."

Poor: "Review the auth code"

**Agent selection guidance:**
- Code review → agents with Read, Grep access and review-focused prompts
- Security audit → agents with restricted tools (read-only) and security expertise
- Research → agents with web search/fetch tools
- Testing → agents with file write capabilities

**Session resumption:**
To continue previous work, provide the sessionId from prior metadata. The agent retains full history including tool calls, results, and reasoning—picking up exactly where it stopped.

**Examples:**

// User breaks down work for parallel execution
User: "Analyze the entire codebase for issues - check code quality, security vulnerabilities, and documentation completeness"
Agent: "I'll break this into three isolated tasks and run them in parallel"
Agent: [multiple assign_task calls]
call assign_task({ agent: "code-analyst", task: "Analyze src/**/*.ts for code quality issues, code smells, and refactoring opportunities. Report findings by category.", description: "Code quality analysis" })
call assign_task({ agent: "security-analyst", task: "Analyze src/**/*.ts for security vulnerabilities, hardcoded secrets, and unsafe patterns. Report critical issues first.", description: "Security vulnerability scan" })
call assign_task({ agent: "docs-reviewer", task: "Review documentation completeness. Check that all public APIs have docstrings, README is up to date, and examples work.", description: "Documentation review" })

// User requests sequential workflow
User: "Create a feature, then review it, then write tests"
Agent: "I'll create a pipeline: write → review → test"
Agent: [sequential assign_task calls]
call assign_task({ agent: "feature-writer", task: "Implement the new feature based on requirements. Write clean, documented code.", description: "Implement new feature" })
call assign_task({ agent: "code-reviewer", task: "Review the implemented code for quality, edge cases, and best practices. Provide specific feedback.", description: "Review implementation" })
call assign_task({ agent: "test-writer", task: "Write unit tests for the new feature. Cover happy path and edge cases.", description: "Write unit tests" })

// User asks for complex research
User: "Research this topic thoroughly and create a comprehensive report"
Agent: "I'll spawn specialists for different research angles, then synthesize"
Agent: [concurrent assign_task calls]
call assign_task({ agent: "research-historian", task: "Research the historical context and evolution of this topic. Timeline key developments.", description: "Research historical context" })
call assign_task({ agent: "research-technologist", task: "Research current technologies, tools, and frameworks related to this topic. Compare options.", description: "Research current technologies" })
call assign_task({ agent: "research-practitioner", task: "Research real-world case studies, best practices, and lessons learned from implementations.", description: "Research case studies" })

// User continues interrupted work
User: "Continue where we left off"
Agent: "Resuming the previous session with full context"
Agent: [single assign_task with resume]
call assign_task({
  agent: "code-reviewer",
  resume: "code-reviewer:abc123",
  task: "Continue reviewing the remaining files. Previous work completed src/auth/, now review src/api/ and src/utils/.",
  description: "Continue code review"
})

// Parallel instances of the same agent
User: "Review all 50 test files and identify coverage gaps"
Agent: "I'll launch multiple parallel instances of the test-reviewer agent, each focusing on a subset of files"
Agent: [multiple assign_task calls with same agent]
call assign_task({ agent: "test-reviewer", task: "Review tests/test_api_*.ts files. Identify missing test cases and coverage gaps.", description: "Review API test files" })
call assign_task({ agent: "test-reviewer", task: "Review tests/test_auth_*.ts files. Identify missing test cases and coverage gaps.", description: "Review auth test files" })
call assign_task({ agent: "test-reviewer", task: "Review tests/test_utils_*.ts files. Identify missing test cases and coverage gaps.", description: "Review utils test files" })

// Parallel file processing
User: "Extract documentation from all markdown files in docs/"
Agent: "Launching parallel extractors for different doc sections"
Agent: [multiple assign_task calls]
call assign_task({ agent: "doc-extractor", task: "Extract key information from docs/getting-started/*.md. Create summary of setup instructions.", description: "Extract getting started docs" })
call assign_task({ agent: "doc-extractor", task: "Extract key information from docs/api-reference/*.md. Create summary of available APIs.", description: "Extract API reference docs" })
call assign_task({ agent: "doc-extractor", task: "Extract key information from docs/guides/*.md. Create summary of tutorials and how-tos.", description: "Extract guides docs" })`;

export type AssignSuccessResult = {
  status: 'success';
  type: 'text';
  result: string;
  metadata: AssignTaskMetadata;
};

export type AssignErrorResult = ExecResultError & {
  metadata?: {
    agentId?: string;
    errorReason?: ErrorReason;
    delegationDepth?: number;
    policyDenied?: boolean;
    agentNotFound?: boolean;
  };
};

export type AssignResult = AssignSuccessResult | AssignErrorResult;

export class AssignTool implements FunctionTool<AssignParams, ToolExecutionContext, AssignResult> {
  name = 'assign_task';
  parameters = {
    type: 'object',
    properties: {
      description: {
        type: 'string',
        description:
          'A summary of the task to be performed by the delegated agent. Be specific about the desired outcome. From 5-10 words.',
      },
      agent: {
        type: 'string',
        description: 'Agent ID from registry (e.g., "code-reviewer", "researcher")',
      },
      task: {
        type: 'string',
        description: 'Detailed description of the task to be performed by the agent.',
      },
      resume: {
        type: 'string',
        description:
          'Session ID from a previous agent invocation to resume. The agent will continue with its full previous context preserved.',
      },
    },
    required: ['agent', 'task', 'description'],
  } as const;

  constructor(private readonly delegationService: DelegationService) {}

  /**
   * Update the enabled agents configuration
   */
  setEnabledAgents(enabledAgents: Record<string, boolean>): void {
    this.delegationService.setEnabledAgents(enabledAgents);
  }

  /**
   * Generate dynamic description based on current registry
   * Only shows enabled agents
   */
  definition(): ToolDefinition['function'] {
    const enabledAgents = this.delegationService.listEnabledAgents();
    const agentList = enabledAgents
      .map((a) => {
        const toolsStr = a.allowed_tools?.length ? ` (Tools: ${this.formatTools(a.allowed_tools)})` : '';
        return `- ${a.name}: ${a.description ?? 'No description provided'}${toolsStr}`;
      })
      .join('\n');

    const description = DESCRIPTION_TEMPLATE.replace('{AGENT_LIST}', agentList);

    return {
      name: this.name,
      description,
      parameters: this.parameters,
    };
  }

  private formatTools(tools: string[]): string {
    const toolMap: Record<string, string> = {
      file_read: 'Read',
      file_edit: 'Edit',
      file_new: 'Write',
      grep_tool: 'Grep',
      glob_tool: 'Glob',
      ls_tool: 'LS',
      bash_tool: 'Bash',
      web_search: 'WebSearch',
      web_fetch: 'WebFetch',
      todo_write: 'Todo',
    };

    return (
      tools
        .map((t) => toolMap[t] ?? t)
        .slice(0, 8)
        .join(', ') + (tools.length > 8 ? ', ...' : '')
    );
  }

  /**
   * Delegate a task to a specialist agent for focused execution
   *
   * @param params - Agent ID and task description to delegate
   * @param context - Execution context including delegation depth tracking
   * @returns Delegation result with comprehensive metrics including cost breakdown
   *
   * @example
   * ```typescript
   * const result = await assignTool.execute({
   *   agent: 'code-reviewer',
   *   task: 'Review the changes in src/tools/*.ts',
   *   description: 'Code review of tool implementations'
   * });
   * if (result.status === 'success' && result.type === 'text') {
   *   console.log(result.result); // Agent's response
   *   console.log(result.metadata.metrics?.totalCost); // Cost in USD
   *   console.log(result.metadata.executionTimeMs); // Duration
   *   console.log(result.metadata.toolCallsExecuted); // Number of tool calls
   * }
   * ```
   */
  async execute(params: AssignParams, context?: ToolExecutionContext): Promise<AssignResult> {
    if (!params.agent || typeof params.agent !== 'string') {
      return err('Parameter "agent" is required and must be a string', undefined, ErrorReason.InvalidInput);
    }

    if (!params.task || typeof params.task !== 'string') {
      return err('Parameter "task" is required and must be a string', undefined, ErrorReason.InvalidInput);
    }

    // Handle background execution
    // if (params.run_in_background) {
    //   if (!this.delegationService.delegateBackground) {
    //     return err(
    //       'Background execution is not supported by this delegation service.',
    //       { agentId: params.agent },
    //       ErrorReason.Unknown,
    //     );
    //   }

    //   const outcome = await this.delegationService.delegateBackground(params, context);

    //   if (!outcome.success) {
    //     return err(
    //       outcome.error ?? 'Failed to launch background agent.',
    //       { agentId: params.agent },
    //       ErrorReason.Unknown,
    //     );
    //   }

    //   return okText(
    //     `Agent "${params.agent}" launched in background with session ID: ${outcome.sessionId}. Use task_output tool to retrieve results.`,
    //     {
    //       sessionId: outcome.sessionId,
    //       agentId: params.agent,
    //       agentName: params.agent,
    //       runningInBackground: true,
    //       taskDescription: params.task,
    //       delegationDepth: (context?.delegationDepth ?? 0) + 1,
    //       toolCallsExecuted: 0,
    //       executionTimeMs: 0,
    //     },
    //   );
    // }

    const outcome = await this.delegationService.delegate(params, context);
    if (!outcome.success || !outcome.summary) {
      const isNotFound = outcome.error?.includes('not found');
      const isPolicyDenied = outcome.error?.includes('policy') || outcome.error?.includes('denied');
      return err(
        outcome.error ?? 'Failed to delegate task.',
        {
          agentId: params.agent,
          agentNotFound: isNotFound,
          policyDenied: isPolicyDenied,
          delegationDepth: context?.delegationDepth,
        },
        ErrorReason.Unknown,
      );
    }

    const metadata = outcome.metadata as DelegationMetadata;

    // Add system reminder about session ID for potential resume
    const sessionReminder = metadata.sessionId
      ? `\n\n<system-reminder>\nAgent session ID: "${metadata.sessionId}"\nThis session can be resumed using the resume parameter in assign_task if the user has follow-up questions about this topic.\n</system-reminder>`
      : '';

    return okText(outcome.summary + sessionReminder, {
      ...metadata,
      taskDescription: params.task,
      delegationDepth: (context?.delegationDepth ?? 0) + 1,
    });
  }
}
