import type { Tool } from '@/types/tools';
import { useTodoStore } from '@/store/useTodoStore';

export const todoReadTool: Tool = {
  definition: {
    name: 'TodoRead',
    description: `Read and retrieve todo items from the todo store. This tool allows you to query todos by conversation or globally.

## Usage Examples
- Read all todos for current conversation: Use without any parameters
- Read global todos: Set global parameter to true
- Get specific conversation todos: Provide conversationId
- Get todos with specific status: Use status filter

## Response Format
Returns todos with their current status, priority, creation dates, and conversation association.`,
    parameters: {
      type: 'object',
      properties: {
        conversationId: {
          type: 'string',
          description:
            'Conversation ID to filter todos. If not provided, uses current conversation from context.',
        },
        global: {
          type: 'boolean',
          description:
            'If true, retrieves global todos not associated with any conversation.',
        },
        status: {
          type: 'string',
          enum: ['pending', 'in_progress', 'completed'],
          description: 'Filter todos by status',
        },
        priority: {
          type: 'string',
          enum: ['high', 'medium', 'low'],
          description: 'Filter todos by priority',
        },
        includeStats: {
          type: 'boolean',
          description: 'Include summary statistics in the response.',
        },
      },
    } as any,
  },

  async execute(parameters, context) {
    try {
      const {
        conversationId: paramConversationId,
        global,
        status,
        priority,
        includeStats,
      } = parameters;

      // Access the store directly
      const todoStore = useTodoStore.getState();

      // Determine which todos to retrieve
      let todos;
      let targetConversationId: string | undefined;

      if (global) {
        todos = todoStore.getTodos(); // Gets global todos
        targetConversationId = undefined;
      } else {
        targetConversationId = paramConversationId || context?.sessionId;
        todos = todoStore.getTodos(targetConversationId);
      }

      // Apply filters
      if (status) {
        todos = todos.filter((todo) => todo.status === status);
      }

      if (priority) {
        todos = todos.filter((todo) => todo.priority === priority);
      }

      // Sort by priority (high -> medium -> low) and then by creation date
      const priorityOrder = { high: 0, medium: 1, low: 2 };
      todos.sort((a, b) => {
        const priorityDiff =
          priorityOrder[a.priority] - priorityOrder[b.priority];
        if (priorityDiff !== 0) return priorityDiff;

        // If same priority, sort by creation date (newest first)
        const aDate = new Date(a.createdAt || 0).getTime();
        const bDate = new Date(b.createdAt || 0).getTime();
        return bDate - aDate;
      });

      // Generate response
      const response: any = {
        todos,
        count: todos.length,
        scope: global
          ? 'global'
          : `conversation: ${targetConversationId || 'current'}`,
      };

      if (includeStats) {
        response.stats = todoStore.getTodoStats(targetConversationId);
      }

      // Add helpful summary
      let summaryMessage = `Found ${todos.length} todo(s)`;
      if (global) {
        summaryMessage += ' (global)';
      } else {
        summaryMessage += ` for conversation ${targetConversationId || 'current'}`;
      }

      if (status) {
        summaryMessage += ` with status: ${status}`;
      }
      if (priority) {
        summaryMessage += ` with priority: ${priority}`;
      }

      response.summary = summaryMessage;

      return {
        success: true,
        data: response,
      };
    } catch (error) {
      return {
        success: false,
        error: `TodoRead execution error: ${
          error instanceof Error ? error.message : 'Unknown error'
        }`,
      };
    }
  },

  validate(parameters) {
    // All parameters are optional, so always valid
    return true;
  },

  category: 'productivity',
  version: '1.0.0',
  author: 'system',
};
