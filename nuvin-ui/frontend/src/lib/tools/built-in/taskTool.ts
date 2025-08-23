import type { Tool } from '@/types/tools';
import { agentManager } from '@/lib/agents/agent-manager';
import { generateUUID } from '@/lib/utils';

export const taskTool: Tool = {
  definition: {
    name: 'task',
    description: `Launch a new agent that has access to the following tools: Bash, Glob,
Grep, LS, ExitPlanMode, Read, Edit, MultiEdit, Write, NotebookRead,
NotebookEdit, WebFetch, todo_write, WebSearch. When
you are searching for a keyword or file and are not confident that you
will find the right match in the first few tries, use the Agent tool to
perform the search for you.

When to use the Agent tool:

- If you are searching for a keyword like "config" or "logger", or for
questions like "which file does X?", the Agent tool is strongly
recommended

When NOT to use the Agent tool:

- If you want to read a specific file path, use the Read or Glob tool
instead of the Agent tool, to find the match more quickly

- If you are searching for a specific class definition like "class Foo",
use the Glob tool instead, to find the match more quickly

- If you are searching for code within a specific file or set of 2-3
files, use the Read tool instead of the Agent tool, to find the match more
quickly

- Writing code and running bash commands (use other tools for that)

- Other tasks that are not related to searching for a keyword or file

Usage notes:

1. Launch multiple agents concurrently whenever possible, to maximize
performance; to do that, use a single message with multiple tool uses

2. When the agent is done, it will return a single message back to you.
The result returned by the agent is not visible to the user. To show the
user the result, you should send a text message back to the user with a
concise summary of the result.

3. Each agent invocation is stateless. You will not be able to send
additional messages to the agent, nor will the agent be able to
communicate with you outside of its final report. Therefore, your prompt
should contain a highly detailed task description for the agent to perform
autonomously and you should specify exactly what information the agent
should return back to you in its final and only message to you.

4. The agent's outputs should generally be trusted

5. Clearly tell the agent whether you expect it to write code or just to
do research (search, file reads, web fetches, etc.), since it is not aware
of the user's intent`,
    parameters: {
      type: 'object',
      properties: {
        description: {
          type: 'string',
          description: 'A short (3-5 word) description of the task',
        },
        prompt: {
          type: 'string',
          description: 'The task for the agent to perform',
        },
      },
      required: ['description', 'prompt'],
    },
  },

  async execute(parameters) {
    try {
      const { description, prompt } = parameters;

      if (!description || typeof description !== 'string') {
        return {
          status: 'error',
          type: 'text',
          result: 'Description parameter is required and must be a string',
        };
      }

      if (!prompt || typeof prompt !== 'string') {
        return {
          status: 'error',
          type: 'text',
          result: 'Prompt parameter is required and must be a string',
        };
      }

      // Validate description length (should be 3-5 words)
      const wordCount = description.trim().split(/\s+/).length;
      if (wordCount < 2 || wordCount > 8) {
        return {
          status: 'error',
          type: 'text',
          result: 'Description should be 3-5 words (2-8 words accepted)',
        };
      }

      // Check if an active agent is available
      const activeAgent = agentManager.getActiveAgent();
      if (!activeAgent) {
        return {
          status: 'error',
          type: 'text',
          result: 'No active agent available to handle the task',
        };
      }

      // Generate a unique task ID for tracking
      const taskId = generateUUID();

      try {
        // Send the task to the active agent
        const response = await agentManager.sendMessage(prompt, {
          taskId,
          userId: 'system', // Mark as system-initiated task
          timeout: 300000, // 5 minute timeout for task completion
        });

        return {
          status: 'success',
          type: 'text',
          result: response.content,
          additionalResult: {
            taskId,
            description,
            prompt,
            agentId: response.metadata?.agentId,
            agentType: response.metadata?.agentType,
            tokensUsed: response.metadata?.totalTokens,
            responseTime: response.metadata?.responseTime,
            model: response.metadata?.model,
            provider: response.metadata?.provider,
          },
          metadata: {
            executionType: 'agent_task',
            agentUsed: activeAgent.name,
          },
        };
      } catch (agentError) {
        // Handle agent execution errors
        return {
          status: 'error',
          type: 'text',
          result: `task execution failed: ${agentError instanceof Error ? agentError.message : 'Unknown error'}`,
          metadata: {
            taskId,
            description,
            agentAttempted: activeAgent.name,
          },
        };
      }
    } catch (error) {
      return {
        status: 'error',
        type: 'text',
        result: `task tool error: ${error instanceof Error ? error.message : 'Unknown error'}`,
      };
    }
  },

  validate(parameters) {
    if (typeof parameters.description !== 'string' || !parameters.description.trim()) {
      return false;
    }
    if (typeof parameters.prompt !== 'string' || !parameters.prompt.trim()) {
      return false;
    }
    return true;
  },

  category: 'agent',
  version: '1.0.0',
  author: 'system',
};
