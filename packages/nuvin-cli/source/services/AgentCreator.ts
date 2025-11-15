import type { LLMPort, AgentTemplate } from '@nuvin/nuvin-core';
import { AGENT_CREATOR_SYSTEM_PROMPT, buildAgentCreationPrompt } from '@nuvin/nuvin-core';

export interface AgentCreationResult {
  success: boolean;
  agent?: Partial<AgentTemplate> & { systemPrompt: string };
  error?: string;
}

/**
 * Generate 4 random characters from a-zA-Z0-9
 */
function generateRandomSuffix(): string {
  const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let result = '';
  for (let i = 0; i < 4; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

/**
 * Generate unique agent ID with random suffix
 */
function generateAgentId(name?: string): string {
  const baseId = name
    ? name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '')
    : 'agent';
  return `${baseId}-${generateRandomSuffix()}`;
}

/**
 * AgentCreator - service for LLM-assisted agent creation
 */
export class AgentCreator {
  constructor(private llm: LLMPort) {}

  /**
   * Create an agent configuration from a user description
   */
  async createAgent(userDescription: string, model: string): Promise<AgentCreationResult> {
    try {
      // Build the messages
      const messages = [
        {
          role: 'system' as const,
          content: AGENT_CREATOR_SYSTEM_PROMPT,
        },
        {
          role: 'user' as const,
          content: buildAgentCreationPrompt(userDescription),
        },
      ];

      // Call LLM to generate agent configuration
      const result = await this.llm.generateCompletion({
        model,
        messages,
        temperature: 0.7,
        topP: 1,
      });

      // Parse the response
      const content = result.content?.trim();
      if (!content) {
        return {
          success: false,
          error: 'LLM returned empty response',
        };
      }

      // Try to extract JSON from the response
      const jsonMatch = content.match(/```json\s*([\s\S]*?)\s*```/) || content.match(/({[\s\S]*})/);
      const jsonStr = jsonMatch ? jsonMatch[1] : content;

      let agentConfig: Partial<AgentTemplate>;
      try {
        agentConfig = JSON.parse(jsonStr);
      } catch (parseError) {
        return {
          success: false,
          error: `Failed to parse LLM response as JSON: ${parseError instanceof Error ? parseError.message : String(parseError)}`,
        };
      }

      // Validate that systemPrompt exists
      if (!agentConfig.systemPrompt || typeof agentConfig.systemPrompt !== 'string') {
        return {
          success: false,
          error: 'LLM did not generate required field: systemPrompt',
        };
      }

      // Ensure agent ID has random suffix
      const name = agentConfig.name || agentConfig.id;
      agentConfig.id = generateAgentId(name);

      return {
        success: true,
        agent: agentConfig as Partial<AgentTemplate> & { systemPrompt: string },
      };
    } catch (error) {
      return {
        success: false,
        error: `Failed to create agent: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  }
}
