import { Tool } from '@/types/tools';

export const todoWriteTool: Tool = {
  definition: {
    name: 'TodoWrite',
    description: `Use this tool to create and manage a structured task list for your current coding session. This helps you track progress, organize complex tasks, and demonstrate thoroughness to the user.
It also helps the user understand the progress of the task and overall progress of their requests.

## When to Use This Tool
Use this tool proactively in these scenarios:

1. Complex multi-step tasks - When a task requires 3 or more distinct steps or actions
2. Non-trivial and complex tasks - Tasks that require careful planning or multiple operations
3. User explicitly requests todo list - When the user directly asks you to use the todo list
4. User provides multiple tasks - When users provide a list of things to be done (numbered or comma-separated)
5. After receiving new instructions - Immediately capture user requirements as todos
6. When you start working on a task - Mark it as in_progress BEFORE beginning work. Ideally you should only have one todo as in_progress at a time
7. After completing a task - Mark it as completed and add any new follow-up tasks discovered during implementation

## When NOT to Use This Tool

Skip using this tool when:
1. There is only a single, straightforward task
2. The task is trivial and tracking it provides no organizational benefit
3. The task can be completed in less than 3 trivial steps
4. The task is purely conversational or informational

NOTE that you should not use this tool if there is only one trivial task to do. In this case you are better off just doing the task directly.

## Task States and Management

1. **Task States**: Use these states to track progress:
   - pending: Task not yet started
   - in_progress: Currently working on (limit to ONE task at a time)
   - completed: Task finished successfully

2. **Task Management**:
   - Update task status in real-time as you work
   - Mark tasks complete IMMEDIATELY after finishing (don't batch completions)
   - Only have ONE task in_progress at any time
   - Complete current tasks before starting new ones
   - Remove tasks that are no longer relevant from the list entirely

3. **Task Completion Requirements**:
   - ONLY mark a task as completed when you have FULLY accomplished it
   - If you encounter errors, blockers, or cannot finish, keep the task as in_progress
   - When blocked, create a new task describing what needs to be resolved
   - Never mark a task as completed if:
     - Tests are failing
     - Implementation is partial
     - You encountered unresolved errors
     - You couldn't find necessary files or dependencies

4. **Task Breakdown**:
   - Create specific, actionable items
   - Break complex tasks into smaller, manageable steps
   - Use clear, descriptive task names

When in doubt, use this tool. Being proactive with task management demonstrates attentiveness and ensures you complete all requirements successfully.`,
    parameters: {
      type: 'object',
      properties: {
        todos: {
          type: 'array',
          items: {
            type: 'object',
            description: 'A todo item with content, status, priority, and unique ID',
            properties: {
              content: {
                type: 'string',
                minLength: 1,
                description: 'The text content of the todo item',
              },
              status: {
                type: 'string',
                enum: ['pending', 'in_progress', 'completed'],
                description: 'The current status of the todo item',
              },
              priority: {
                type: 'string',
                enum: ['high', 'medium', 'low'],
                description: 'The priority level of the todo item',
              },
              id: {
                type: 'string',
                description: 'A unique identifier for the todo item',
              },
            },
            required: ['content', 'status', 'priority', 'id'],
          },
          description: 'The updated todo list',
        },
      },
      required: ['todos'],
    } as any,
  },

  async execute(parameters) {
    try {
      const { todos } = parameters;

      if (!Array.isArray(todos)) {
        return {
          success: false,
          error: 'Todos parameter must be an array',
        };
      }

      if (todos.length === 0) {
        return {
          success: false,
          error: 'At least one todo item is required',
        };
      }

      // Validate each todo item
      for (let i = 0; i < todos.length; i++) {
        const todo = todos[i];

        if (
          !todo.content ||
          typeof todo.content !== 'string' ||
          todo.content.trim().length === 0
        ) {
          return {
            success: false,
            error: `Todo item ${i + 1}: content is required and must be a non-empty string`,
          };
        }

        if (
          !todo.status ||
          !['pending', 'in_progress', 'completed'].includes(todo.status)
        ) {
          return {
            success: false,
            error: `Todo item ${i + 1}: status must be one of: pending, in_progress, completed`,
          };
        }

        if (
          !todo.priority ||
          !['high', 'medium', 'low'].includes(todo.priority)
        ) {
          return {
            success: false,
            error: `Todo item ${i + 1}: priority must be one of: high, medium, low`,
          };
        }

        if (
          !todo.id ||
          typeof todo.id !== 'string' ||
          todo.id.trim().length === 0
        ) {
          return {
            success: false,
            error: `Todo item ${i + 1}: id is required and must be a non-empty string`,
          };
        }
      }

      // Check for duplicate IDs
      const ids = todos.map((todo) => todo.id);
      const uniqueIds = new Set(ids);
      if (ids.length !== uniqueIds.size) {
        return {
          success: false,
          error: 'Todo items must have unique IDs',
        };
      }

      // Validate that only one task is in_progress (best practice)
      const inProgressTasks = todos.filter(
        (todo) => todo.status === 'in_progress',
      );
      if (inProgressTasks.length > 1) {
        console.warn(
          'Warning: Multiple tasks marked as in_progress. Best practice is to have only one active task at a time.',
        );
      }

      // Generate summary statistics
      const stats = {
        total: todos.length,
        pending: todos.filter((todo) => todo.status === 'pending').length,
        inProgress: todos.filter((todo) => todo.status === 'in_progress')
          .length,
        completed: todos.filter((todo) => todo.status === 'completed').length,
        highPriority: todos.filter((todo) => todo.priority === 'high').length,
        mediumPriority: todos.filter((todo) => todo.priority === 'medium')
          .length,
        lowPriority: todos.filter((todo) => todo.priority === 'low').length,
      };

      // Format progress percentage
      const progressPercentage =
        stats.total > 0 ? Math.round((stats.completed / stats.total) * 100) : 0;

      return {
        success: true,
        data: {
          todos: todos,
          summary: {
            message: `Todo list updated successfully with ${stats.total} items (${stats.completed} completed, ${stats.inProgress} in progress, ${stats.pending} pending)`,
            progress: `${progressPercentage}% complete`,
            stats: stats,
            currentTask:
              inProgressTasks.length > 0 ? inProgressTasks[0].content : null,
            nextTask:
              todos.find((todo) => todo.status === 'pending')?.content || null,
          },
        },
      };
    } catch (error) {
      return {
        success: false,
        error: `TodoWrite execution error: ${
          error instanceof Error ? error.message : 'Unknown error'
        }`,
      };
    }
  },

  validate(parameters) {
    if (!parameters.todos || !Array.isArray(parameters.todos)) {
      return false;
    }

    if (parameters.todos.length === 0) {
      return false;
    }

    // Validate each todo item structure
    for (const todo of parameters.todos) {
      if (
        !todo.content ||
        typeof todo.content !== 'string' ||
        todo.content.trim().length === 0
      ) {
        return false;
      }

      if (
        !todo.status ||
        !['pending', 'in_progress', 'completed'].includes(todo.status)
      ) {
        return false;
      }

      if (
        !todo.priority ||
        !['high', 'medium', 'low'].includes(todo.priority)
      ) {
        return false;
      }

      if (
        !todo.id ||
        typeof todo.id !== 'string' ||
        todo.id.trim().length === 0
      ) {
        return false;
      }
    }

    // Check for duplicate IDs
    const ids = parameters.todos.map((todo: any) => todo.id);
    const uniqueIds = new Set(ids);
    if (ids.length !== uniqueIds.size) {
      return false;
    }

    return true;
  },

  category: 'productivity',
  version: '1.0.0',
  author: 'system',
};
