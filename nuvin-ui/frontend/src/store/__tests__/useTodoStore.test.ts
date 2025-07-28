import { describe, it, expect, beforeEach } from 'vitest';
import { useTodoStore } from '../useTodoStore';
import type { TodoItem } from '@/types';

describe('useTodoStore', () => {
  beforeEach(() => {
    // Reset the store before each test
    useTodoStore.getState().reset();
  });

  it('should add global todos correctly', () => {
    const store = useTodoStore.getState();
    
    const todoId = store.addTodo({
      content: 'Test global todo',
      status: 'pending',
      priority: 'high',
    });

    expect(todoId).toBeDefined();
    
    const globalTodos = store.getTodos();
    expect(globalTodos).toHaveLength(1);
    expect(globalTodos[0].content).toBe('Test global todo');
    expect(globalTodos[0].status).toBe('pending');
    expect(globalTodos[0].priority).toBe('high');
    expect(globalTodos[0].id).toBe(todoId);
  });

  it('should add conversation-scoped todos correctly', () => {
    const store = useTodoStore.getState();
    const conversationId = 'test-conversation';
    
    const todoId = store.addTodo({
      content: 'Test conversation todo',
      status: 'in_progress',
      priority: 'medium',
      conversationId,
    });

    expect(todoId).toBeDefined();
    
    const conversationTodos = store.getTodos(conversationId);
    expect(conversationTodos).toHaveLength(1);
    expect(conversationTodos[0].content).toBe('Test conversation todo');
    expect(conversationTodos[0].conversationId).toBe(conversationId);
    
    // Global todos should be empty
    const globalTodos = store.getTodos();
    expect(globalTodos).toHaveLength(0);
  });

  it('should update todos correctly', () => {
    const store = useTodoStore.getState();
    
    const todoId = store.addTodo({
      content: 'Original content',
      status: 'pending',
      priority: 'low',
    });

    store.updateTodo(todoId, {
      content: 'Updated content',
      status: 'completed',
      priority: 'high',
    });

    const todo = store.getTodoById(todoId);
    expect(todo?.content).toBe('Updated content');
    expect(todo?.status).toBe('completed');
    expect(todo?.priority).toBe('high');
  });

  it('should delete todos correctly', () => {
    const store = useTodoStore.getState();
    
    const todoId = store.addTodo({
      content: 'Todo to delete',
      status: 'pending',
      priority: 'medium',
    });

    expect(store.getTodos()).toHaveLength(1);
    
    store.deleteTodo(todoId);
    
    expect(store.getTodos()).toHaveLength(0);
    expect(store.getTodoById(todoId)).toBeNull();
  });

  it('should calculate stats correctly', () => {
    const store = useTodoStore.getState();
    const conversationId = 'test-conversation';
    
    // Add various todos
    store.addTodo({ content: 'Todo 1', status: 'pending', priority: 'high', conversationId });
    store.addTodo({ content: 'Todo 2', status: 'in_progress', priority: 'medium', conversationId });
    store.addTodo({ content: 'Todo 3', status: 'completed', priority: 'low', conversationId });
    store.addTodo({ content: 'Todo 4', status: 'completed', priority: 'high', conversationId });

    const stats = store.getTodoStats(conversationId);
    
    expect(stats.total).toBe(4);
    expect(stats.pending).toBe(1);
    expect(stats.inProgress).toBe(1);
    expect(stats.completed).toBe(2);
    expect(stats.highPriority).toBe(2);
    expect(stats.mediumPriority).toBe(1);
    expect(stats.lowPriority).toBe(1);
  });

  it('should move todos between conversations', () => {
    const store = useTodoStore.getState();
    const conversation1 = 'conv-1';
    const conversation2 = 'conv-2';
    
    const todoId = store.addTodo({
      content: 'Movable todo',
      status: 'pending',
      priority: 'medium',
      conversationId: conversation1,
    });

    expect(store.getTodos(conversation1)).toHaveLength(1);
    expect(store.getTodos(conversation2)).toHaveLength(0);

    store.moveTodoToConversation(todoId, conversation2);

    expect(store.getTodos(conversation1)).toHaveLength(0);
    expect(store.getTodos(conversation2)).toHaveLength(1);

    const movedTodo = store.getTodoById(todoId);
    expect(movedTodo?.conversationId).toBe(conversation2);
  });

  it('should move todo from conversation to global', () => {
    const store = useTodoStore.getState();
    const conversationId = 'test-conversation';
    
    const todoId = store.addTodo({
      content: 'Move to global',
      status: 'pending',
      priority: 'medium',
      conversationId,
    });

    expect(store.getTodos(conversationId)).toHaveLength(1);
    expect(store.getTodos()).toHaveLength(0);

    store.moveTodoToConversation(todoId, undefined);

    expect(store.getTodos(conversationId)).toHaveLength(0);
    expect(store.getTodos()).toHaveLength(1);

    const movedTodo = store.getTodoById(todoId);
    expect(movedTodo?.conversationId).toBeUndefined();
  });

  it('should set multiple todos at once', () => {
    const store = useTodoStore.getState();
    const conversationId = 'test-conversation';
    
    const todos: Omit<TodoItem, 'createdAt' | 'updatedAt'>[] = [
      { id: 'todo-1', content: 'First todo', status: 'pending', priority: 'high', conversationId },
      { id: 'todo-2', content: 'Second todo', status: 'in_progress', priority: 'medium', conversationId },
      { id: 'todo-3', content: 'Third todo', status: 'completed', priority: 'low', conversationId },
    ];

    store.setTodos(todos as TodoItem[], conversationId);

    const storedTodos = store.getTodos(conversationId);
    expect(storedTodos).toHaveLength(3);
    expect(storedTodos.map(t => t.content)).toEqual(['First todo', 'Second todo', 'Third todo']);
  });

  it('should provide utility methods for status updates', () => {
    const store = useTodoStore.getState();
    
    const todoId = store.addTodo({
      content: 'Status test todo',
      status: 'pending',
      priority: 'medium',
    });

    store.markAsInProgress(todoId);
    expect(store.getTodoById(todoId)?.status).toBe('in_progress');

    store.markAsCompleted(todoId);
    expect(store.getTodoById(todoId)?.status).toBe('completed');

    store.markAsPending(todoId);
    expect(store.getTodoById(todoId)?.status).toBe('pending');
  });

  it('should get all todos across conversations', () => {
    const store = useTodoStore.getState();
    
    // Add global todos
    store.addTodo({ content: 'Global 1', status: 'pending', priority: 'high' });
    store.addTodo({ content: 'Global 2', status: 'completed', priority: 'medium' });
    
    // Add conversation todos
    store.addTodo({ content: 'Conv 1', status: 'in_progress', priority: 'low', conversationId: 'conv-1' });
    store.addTodo({ content: 'Conv 2', status: 'pending', priority: 'high', conversationId: 'conv-2' });

    const allTodos = store.getAllTodos();
    expect(allTodos).toHaveLength(4);
    
    const contents = allTodos.map(t => t.content).sort();
    expect(contents).toEqual(['Conv 1', 'Conv 2', 'Global 1', 'Global 2']);
  });
});