import { describe, it, expect } from 'vitest';
import { todoWriteTool } from '../todoWriteTool';

describe('todoWriteTool integration', () => {
  it('should execute successfully with valid todo list', async () => {
    const validParams = {
      todos: [
        {
          id: '1',
          content: 'Implement new feature',
          status: 'pending',
          priority: 'high',
        },
        {
          id: '2',
          content: 'Write unit tests',
          status: 'in_progress',
          priority: 'medium',
        },
        {
          id: '3',
          content: 'Update documentation',
          status: 'completed',
          priority: 'low',
        },
      ],
    };

    const result = await todoWriteTool.execute(validParams);

    expect(result.success).toBe(true);
    expect(result.data).toBeDefined();
    expect(result.data.todos).toEqual(validParams.todos);
    expect(result.data.summary).toBeDefined();
    expect(result.data.summary.message).toContain('3 items');
    expect(result.data.summary.message).toContain('1 completed');
    expect(result.data.summary.message).toContain('1 in progress');
    expect(result.data.summary.message).toContain('1 pending');
    expect(result.data.summary.progress).toBe('33% complete');
  });

  it('should validate input correctly', () => {
    const validParams = {
      todos: [
        {
          id: '1',
          content: 'Valid task',
          status: 'pending',
          priority: 'high',
        },
      ],
    };

    const invalidParams = {
      todos: [
        {
          id: '1',
          content: '',
          status: 'invalid_status',
          priority: 'high',
        },
      ],
    };

    expect(todoWriteTool.validate!(validParams)).toBe(true);
    expect(todoWriteTool.validate!(invalidParams)).toBe(false);
  });

  it('should handle edge cases gracefully', async () => {
    // Test empty content
    const emptyContentParams = {
      todos: [
        {
          id: '1',
          content: '',
          status: 'pending',
          priority: 'high',
        },
      ],
    };

    const emptyResult = await todoWriteTool.execute(emptyContentParams);
    expect(emptyResult.success).toBe(false);
    expect(emptyResult.error).toContain('content is required');

    // Test duplicate IDs
    const duplicateIdParams = {
      todos: [
        {
          id: '1',
          content: 'Task 1',
          status: 'pending',
          priority: 'high',
        },
        {
          id: '1',
          content: 'Task 2',
          status: 'pending',
          priority: 'medium',
        },
      ],
    };

    const duplicateResult = await todoWriteTool.execute(duplicateIdParams);
    expect(duplicateResult.success).toBe(false);
    expect(duplicateResult.error).toContain('unique IDs');
  });

  it('should calculate statistics correctly', async () => {
    const mixedStatusParams = {
      todos: [
        { id: '1', content: 'Task 1', status: 'completed', priority: 'high' },
        { id: '2', content: 'Task 2', status: 'completed', priority: 'medium' },
        { id: '3', content: 'Task 3', status: 'in_progress', priority: 'high' },
        { id: '4', content: 'Task 4', status: 'pending', priority: 'low' },
        { id: '5', content: 'Task 5', status: 'pending', priority: 'medium' },
      ],
    };

    const result = await todoWriteTool.execute(mixedStatusParams);

    expect(result.success).toBe(true);
    expect(result.data.summary.stats.total).toBe(5);
    expect(result.data.summary.stats.completed).toBe(2);
    expect(result.data.summary.stats.inProgress).toBe(1);
    expect(result.data.summary.stats.pending).toBe(2);
    expect(result.data.summary.stats.highPriority).toBe(2);
    expect(result.data.summary.stats.mediumPriority).toBe(2);
    expect(result.data.summary.stats.lowPriority).toBe(1);
    expect(result.data.summary.progress).toBe('40% complete');
  });

  it('should identify current and next tasks', async () => {
    const orderedTasksParams = {
      todos: [
        { id: '1', content: 'Completed task', status: 'completed', priority: 'high' },
        { id: '2', content: 'Current task', status: 'in_progress', priority: 'medium' },
        { id: '3', content: 'Next task', status: 'pending', priority: 'low' },
        { id: '4', content: 'Future task', status: 'pending', priority: 'high' },
      ],
    };

    const result = await todoWriteTool.execute(orderedTasksParams);

    expect(result.success).toBe(true);
    expect(result.data.summary.currentTask).toBe('Current task');
    expect(result.data.summary.nextTask).toBe('Next task');
  });

  it('should handle single completed task', async () => {
    const completedParams = {
      todos: [
        { id: '1', content: 'All done!', status: 'completed', priority: 'high' },
      ],
    };

    const result = await todoWriteTool.execute(completedParams);

    expect(result.success).toBe(true);
    expect(result.data.summary.progress).toBe('100% complete');
    expect(result.data.summary.currentTask).toBe(null);
    expect(result.data.summary.nextTask).toBe(null);
  });
});