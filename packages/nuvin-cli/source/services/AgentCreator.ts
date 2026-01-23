import type { LLMPort, AgentTemplate } from '@nuvin/nuvin-core';
import { AGENT_CREATOR_SYSTEM_PROMPT, buildAgentCreationPrompt } from '@nuvin/nuvin-core';

export interface AgentCreationResult {
  success: boolean;
  agent?: Partial<AgentTemplate> & { instructions: string };
  error?: string;
  retryable?: boolean;
}

const MAX_RETRIES = 2;
const DEFAULT_TEMPERATURE = 0.3;

export interface AgentCreatorOptions {
  temperature?: number;
  maxTokens?: number;
  retries?: number;
}

function generateAgentId(name?: string): string {
  const baseId = name
    ? name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '')
    : 'agent';
  return baseId || 'agent';
}

function getToolDescriptions(): string {
  return `
Available tools with descriptions:
- file_read: Read file contents from the filesystem
- file_new: Create new files with specified content
- file_edit: Modify existing files with precise edits
- bash_tool: Execute shell commands with timeout
- glob_tool: Find files matching glob patterns
- grep_tool: Search for text patterns in files
- ls_tool: List directory contents
- todo_write: Create and manage task lists
- web_search: Search the web for information
- web_fetch: Fetch and parse web page content
- assign_task: Delegate tasks to specialist agents
`;
}

export class AgentCreator {
  constructor(
    private llm: LLMPort,
    private options: AgentCreatorOptions = {},
  ) {}

  async createAgent(userDescription: string, model: string): Promise<AgentCreationResult> {
    const temperature = this.options.temperature ?? DEFAULT_TEMPERATURE;
    const maxRetries = this.options.retries ?? MAX_RETRIES;
    let lastError: string | undefined;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      const isRetry = attempt > 0;

      try {
        const messages = [
          {
            role: 'system' as const,
            content: AGENT_CREATOR_SYSTEM_PROMPT + getToolDescriptions(),
          },
          {
            role: 'user' as const,
            content: buildAgentCreationPrompt(userDescription),
          },
        ];

        const result = await this.llm.generateCompletion({
          model,
          messages,
          temperature: isRetry ? Math.max(0.2, temperature - 0.1) : temperature,
          topP: 1,
        });

        const content = result.content?.trim();
        if (!content) {
          if (attempt < maxRetries) {
            lastError = 'LLM returned empty response';
            continue;
          }
          return {
            success: false,
            error: 'LLM returned an empty response. Please try a more detailed description.',
            retryable: true,
          };
        }

        const jsonMatch =
          content.match(/```json\s*([\s\S]*?)\s*```/) ||
          content.match(/```\s*([\s\S]*?)\s*```/) ||
          content.match(/{[\s\S]*}/);

        const jsonStr = jsonMatch ? jsonMatch[1] : content;

        let agentConfig: Partial<AgentTemplate>;
        try {
          agentConfig = JSON.parse(jsonStr);
        } catch (_parseError) {
          if (attempt < maxRetries) {
            lastError = `Failed to parse LLM response as JSON`;
            continue;
          }
          return {
            success: false,
            error: `The generated configuration is not valid JSON. Try being more specific about the agent's role and constraints.`,
            retryable: true,
          };
        }

        if (!agentConfig.instructions || typeof agentConfig.instructions !== 'string') {
          if (attempt < maxRetries) {
            lastError = 'LLM did not generate required instructions';
            continue;
          }
          return {
            success: false,
            error: "The generated agent is missing instructions. Please describe the agent's behavior more clearly.",
            retryable: true,
          };
        }

        const name = agentConfig.name;
        agentConfig.name = generateAgentId(name);

        if (!agentConfig.temperature) {
          agentConfig.temperature = DEFAULT_TEMPERATURE;
        }

        if (!agentConfig.allowed_tools || !Array.isArray(agentConfig.allowed_tools) || agentConfig.allowed_tools.length === 0) {
          agentConfig.allowed_tools = ['Read', 'WebSearch'];
        }

        return {
          success: true,
          agent: agentConfig as Partial<AgentTemplate> & { instructions: string },
        };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);

        if (attempt < maxRetries) {
          lastError = errorMessage;
          continue;
        }

        const isTimeout = errorMessage.includes('timeout') || errorMessage.includes('timed out');
        const isRateLimit = errorMessage.includes('rate') || errorMessage.includes('quota');

        return {
          success: false,
          error: isTimeout
            ? 'The model timed out. Try a simpler description or a faster model.'
            : isRateLimit
              ? 'Rate limit exceeded. Please wait a moment and try again.'
              : `Failed to create agent: ${errorMessage}`,
          retryable: !isRateLimit,
        };
      }
    }

    return {
      success: false,
      error: lastError
        ? `Failed after ${maxRetries + 1} attempts: ${lastError}. Try a more detailed description.`
        : 'Failed to create agent. Please try again.',
      retryable: true,
    };
  }
}
