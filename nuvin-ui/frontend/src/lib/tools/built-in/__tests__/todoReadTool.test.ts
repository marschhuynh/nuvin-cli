import { describe, it, expect, beforeEach } from 'vitest';
import { todoReadTool } from '../todoReadTool';
import { useTodoStore } from '@/store/useTodoStore';

describe('TodoRead Tool', () => {
  beforeEach(() => {
    // Reset the store before each test
    useTodoStore.getState().reset();
  });

  it('should read global todos correctly', async () => {
    const store = useTodoStore.getState();
    
    // Add some global todos
    store.addTodo({ content: 'Global todo 1', status: 'pending', priority: 'high' });
    store.addTodo({ content: 'Global todo 2', status: 'completed', priority: 'medium' });

    const result = await todoReadTool.execute({ global: true });

    expect(result.success).toBe(true);
    expect(result.data?.todos).toHaveLength(2);
    expect(result.data?.count).toBe(2);
    expect(result.data?.scope).toBe('global');
    expect(result.data?.summary).toContain('Found 2 todo(s) (global)');
  });

  it('should read conversation todos correctly', async () => {
    const store = useTodoStore.getState();
    const conversationId = 'test-conversation';
    
    // Add some conversation todos
    store.addTodo({ content: 'Conv todo 1', status: 'pending', priority: 'high', conversationId });
    store.addTodo({ content: 'Conv todo 2', status: 'in_progress', priority: 'low', conversationId });

    const result = await todoReadTool.execute(
      { conversationId },
      { sessionId: conversationId }
    );

    expect(result.success).toBe(true);
    expect(result.data?.todos).toHaveLength(2);
    expect(result.data?.count).toBe(2);
    expect(result.data?.scope).toContain('conversation: test-conversation');
  });

  it('should filter todos by status', async () => {
    const store = useTodoStore.getState();
    const conversationId = 'test-conversation';
    
    // Add todos with different statuses
    store.addTodo({ content: 'Pending todo', status: 'pending', priority: 'high', conversationId });
    store.addTodo({ content: 'In progress todo', status: 'in_progress', priority: 'medium', conversationId });
    store.addTodo({ content: 'Completed todo', status: 'completed', priority: 'low', conversationId });

    const result = await todoReadTool.execute(
      { conversationId, status: 'pending' },
      { sessionId: conversationId }
    );

    expect(result.success).toBe(true);
    expect(result.data?.todos).toHaveLength(1);
    expect(result.data?.todos[0].content).toBe('Pending todo');
    expect(result.data?.summary).toContain('with status: pending');
  });

  it('should filter todos by priority', async () => {
    const store = useTodoStore.getState();
    const conversationId = 'test-conversation';
    
    // Add todos with different priorities
    store.addTodo({ content: 'High priority', status: 'pending', priority: 'high', conversationId });
    store.addTodo({ content: 'Medium priority', status: 'pending', priority: 'medium', conversationId });
    store.addTodo({ content: 'Low priority', status: 'pending', priority: 'low', conversationId });

    const result = await todoReadTool.execute(
      { conversationId, priority: 'high' },
      { sessionId: conversationId }
    );

    expect(result.success).toBe(true);
    expect(result.data?.todos).toHaveLength(1);
    expect(result.data?.todos[0].content).toBe('High priority');
    expect(result.data?.summary).toContain('with priority: high');
  });

  it('should include stats when requested', async () => {
    const store = useTodoStore.getState();
    const conversationId = 'test-conversation';
    
    // Add some todos
    store.addTodo({ content: 'Pending high', status: 'pending', priority: 'high', conversationId });
    store.addTodo({ content: 'In progress medium', status: 'in_progress', priority: 'medium', conversationId });
    store.addTodo({ content: 'Completed low', status: 'completed', priority: 'low', conversationId });

    const result = await todoReadTool.execute(
      { conversationId, includeStats: true },
      { sessionId: conversationId }
    );

    expect(result.success).toBe(true);
    expect(result.data?.stats).toBeDefined();
    expect(result.data?.stats.total).toBe(3);
    expect(result.data?.stats.pending).toBe(1);
    expect(result.data?.stats.inProgress).toBe(1);
    expect(result.data?.stats.completed).toBe(1);
  });

  it('should sort todos by priority', async () => {
    const store = useTodoStore.getState();
    const conversationId = 'test-conversation';
    
    // Add todos with different priorities (reverse order to test sorting)
    store.addTodo({ content: 'Low priority', status: 'pending', priority: 'low', conversationId });
    store.addTodo({ content: 'High priority', status: 'pending', priority: 'high', conversationId });
    store.addTodo({ content: 'Medium priority', status: 'pending', priority: 'medium', conversationId });

    const result = await todoReadTool.execute(
      { conversationId },
      { sessionId: conversationId }
    );

    expect(result.success).toBe(true);
    expect(result.data?.todos).toHaveLength(3);
    
    // Should be sorted: high priority first, then medium, then low
    const priorities = result.data?.todos.map((t: any) => t.priority);
    expect(priorities?.[0]).toBe('high');
    expect(priorities?.[1]).toBe('medium');
    expect(priorities?.[2]).toBe('low');
  });

  it('should handle empty todo list', async () => {
    const result = await todoReadTool.execute(
      { global: true },
      { sessionId: 'test-conversation' }
    );

    expect(result.success).toBe(true);
    expect(result.data?.todos).toHaveLength(0);
    expect(result.data?.count).toBe(0);
    expect(result.data?.summary).toContain('Found 0 todo(s)');
  });

  it('should use context sessionId when no conversationId provided', async () => {
    const store = useTodoStore.getState();
    const conversationId = 'context-conversation';
    
    // Add todo to the context conversation
    store.addTodo({ content: 'Context todo', status: 'pending', priority: 'medium', conversationId });

    const result = await todoReadTool.execute(
      {}, // No conversationId provided
      { sessionId: conversationId } // Should use this from context
    );

    expect(result.success).toBe(true);
    expect(result.data?.todos).toHaveLength(1);
    expect(result.data?.todos[0].content).toBe('Context todo');
    expect(result.data?.scope).toContain('context-conversation');
  });

  it('should validate parameters correctly', () => {
    // All parameters are optional, so should always return true
    expect(todoReadTool.validate?.({})).toBe(true);
    expect(todoReadTool.validate?.({ global: true })).toBe(true);
    expect(todoReadTool.validate?.({ conversationId: 'test', status: 'pending' })).toBe(true);
  });
});