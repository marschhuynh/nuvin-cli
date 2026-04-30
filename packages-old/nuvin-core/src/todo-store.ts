import type { MemoryPort } from './ports.js';

export type TodoStatus = 'pending' | 'in_progress' | 'completed';
export type TodoPriority = 'high' | 'medium' | 'low';

export type TodoItem = {
  id: string;
  content: string;
  status: TodoStatus;
  priority: TodoPriority;
  conversationId?: string;
  createdAt?: string;
  updatedAt?: string;
};

export type TodoStats = {
  total: number;
  pending: number;
  inProgress: number;
  completed: number;
};

export class TodoStore {
  constructor(private memory: MemoryPort<TodoItem>) {}

  async getTodos(conversationId?: string): Promise<TodoItem[]> {
    const key = conversationId ?? 'default';
    const items = await this.memory.get(key);
    return items ?? [];
  }

  async setTodos(items: TodoItem[], conversationId?: string): Promise<void> {
    const key = conversationId ?? 'default';
    await this.memory.set(key, items);
  }

  async getTodoStats(conversationId?: string): Promise<TodoStats> {
    const items = await this.getTodos(conversationId);
    const stats: TodoStats = { total: items.length, pending: 0, inProgress: 0, completed: 0 };
    for (const i of items) {
      if (i.status === 'pending') stats.pending++;
      else if (i.status === 'in_progress') stats.inProgress++;
      else if (i.status === 'completed') stats.completed++;
    }
    return stats;
  }
}
