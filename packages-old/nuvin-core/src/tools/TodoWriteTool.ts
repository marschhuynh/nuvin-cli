import type { ToolDefinition } from '../ports.js';
import { ErrorReason } from '../ports.js';
import type { TodoStore, TodoItem as StoreTodo } from '../todo-store.js';
import type { FunctionTool, ToolExecutionContext, ExecResultError } from './types.js';
import { okText, err } from './result-helpers.js';
import type { TodoWriteMetadata } from './tool-result-metadata.js';

type TodoWriteParams = {
  todos: Array<{
    id: string;
    content: string;
    status: 'pending' | 'in_progress' | 'completed';
    priority: 'high' | 'medium' | 'low';
    createdAt?: string;
  }>;
};

export type TodoWriteSuccessResult = {
  status: 'success';
  type: 'text';
  result: string;
  metadata: TodoWriteMetadata;
};

export type TodoWriteResult = TodoWriteSuccessResult | ExecResultError;

export class TodoWriteTool implements FunctionTool<TodoWriteParams, ToolExecutionContext, TodoWriteResult> {
  name = 'todo_write';
  parameters = {
    type: 'object',
    properties: {
      todos: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            content: { type: 'string' },
            status: { type: 'string', enum: ['pending', 'in_progress', 'completed'] },
            priority: { type: 'string', enum: ['high', 'medium', 'low'] },
            id: { type: 'string' },
            createdAt: { type: 'string' },
          },
          required: ['content', 'status', 'priority', 'id'],
        },
        description: 'Updated todo list',
      },
    },
    required: ['todos'],
  } as const;

  constructor(private store: TodoStore) {}

  definition(): ToolDefinition['function'] {
    return {
      name: this.name,
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
      parameters: this.parameters,
    };
  }

  async execute(params: TodoWriteParams, context?: ToolExecutionContext): Promise<TodoWriteResult> {
    const todos = params?.todos;
    const ctx = context;
    if (!Array.isArray(todos) || todos.length === 0) {
      return err('Parameter "todos" must be a non-empty array', undefined, ErrorReason.InvalidInput);
    }

    for (let i = 0; i < todos.length; i++) {
      const t = todos[i];
      if (!t) continue;

      if (!t.content || typeof t.content !== 'string' || !t.content.trim()) {
        return err(`Todo ${i + 1}: content required`, undefined, ErrorReason.InvalidInput);
      }
      if (!['pending', 'in_progress', 'completed'].includes(String(t.status))) {
        return err(`Todo ${i + 1}: invalid status`, undefined, ErrorReason.InvalidInput);
      }
      if (!['high', 'medium', 'low'].includes(String(t.priority))) {
        return err(`Todo ${i + 1}: invalid priority`, undefined, ErrorReason.InvalidInput);
      }
      if (!t.id || typeof t.id !== 'string' || !t.id.trim()) {
        return err(`Todo ${i + 1}: id required`, undefined, ErrorReason.InvalidInput);
      }
    }

    const ids = todos.map((t) => t.id);
    const unique = new Set(ids);
    if (unique.size !== ids.length) {
      return err('Todo items must have unique IDs', undefined, ErrorReason.InvalidInput);
    }

    const conversationId = ctx?.sessionId || ctx?.conversationId || 'default';
    const nowIso = new Date().toISOString();
    const items: StoreTodo[] = todos.map((t) => ({
      id: String(t.id),
      content: String(t.content),
      status: t.status,
      priority: t.priority,
      conversationId,
      createdAt: t.createdAt || nowIso,
      updatedAt: nowIso,
    }));

    await this.store.setTodos(items, conversationId);
    const stats = await this.store.getTodoStats(conversationId);
    const progress = stats.total > 0 ? Math.round((stats.completed / stats.total) * 100) : 0;

    const listForReminder = items
      .map((item, idx) => {
        const statusLabel =
          item.status === 'completed' ? '[completed]' : item.status === 'in_progress' ? '[in_progress]' : '[pending]';
        return `${idx + 1}. ${statusLabel} ${item.content}`;
      })
      .join('\n');

    const allCompleted = items.length > 0 && items.every((t) => t.status === 'completed');

    const serialized = listForReminder
      .split('\n')
      .map((line) => {
        const m = line.match(/^(\d+)\. \[([^\]]+)\] (.+)$/);
        if (!m) return line;
        const [, num, status, content] = m;
        const idx = parseInt(num ?? '0') - 1;
        return `{"content":"${content}","status":"${status}","id":"${items[idx]?.id || ''}"}`;
      })
      .join(',');

    const systemReminder = allCompleted
      ? `All ${items.length} todo items have been completed successfully!\n\n<system-reminder>\nAll todo items are now completed! Ask about next steps. Completed list:\n[${serialized}].\n</system-reminder>`
      : `Todos have been modified successfully. Continue with current tasks if applicable.\n\n<system-reminder>\nYour todo list has changed. DO NOT mention this explicitly to the user. Latest contents:\n[${serialized}].\n</system-reminder>`;

    return okText(systemReminder, {
      recentChanges: true,
      stats,
      progress: `${progress}%`,
      allCompleted,
      conversationId,
      items: items.map((item) => ({
        id: item.id,
        content: item.content,
        status: item.status,
        priority: item.priority,
        createdAt: item.createdAt || nowIso,
      })),
      todosWritten: items.length,
    });
  }
}
