import { describe, it, expect } from 'vitest';

// Test the TodoWrite tool validation and core logic
const todoWriteValidate = (parameters: any): boolean => {
  if (!parameters.todos || !Array.isArray(parameters.todos)) {
    return false;
  }

  if (parameters.todos.length === 0) {
    return false;
  }

  // Validate each todo item structure
  for (const todo of parameters.todos) {
    if (!todo.content || typeof todo.content !== 'string' || todo.content.trim().length === 0) {
      return false;
    }

    if (!todo.status || !['pending', 'in_progress', 'completed'].includes(todo.status)) {
      return false;
    }

    if (!todo.priority || !['high', 'medium', 'low'].includes(todo.priority)) {
      return false;
    }

    if (!todo.id || typeof todo.id !== 'string' || todo.id.trim().length === 0) {
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
};

const generateTodoStats = (todos: any[]) => {
  return {
    total: todos.length,
    pending: todos.filter(todo => todo.status === 'pending').length,
    inProgress: todos.filter(todo => todo.status === 'in_progress').length,
    completed: todos.filter(todo => todo.status === 'completed').length,
    highPriority: todos.filter(todo => todo.priority === 'high').length,
    mediumPriority: todos.filter(todo => todo.priority === 'medium').length,
    lowPriority: todos.filter(todo => todo.priority === 'low').length,
  };
};

describe('todoWriteTool', () => {
  describe('validation', () => {
    it('should validate correct todo parameters', () => {
      const validTodos = {
        todos: [
          {
            id: '1',
            content: 'Implement feature X',
            status: 'pending',
            priority: 'high',
          },
          {
            id: '2',
            content: 'Write tests for feature Y',
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

      expect(todoWriteValidate(validTodos)).toBe(true);
    });

    it('should reject invalid parameters', () => {
      // Missing todos
      expect(todoWriteValidate({})).toBe(false);
      
      // Todos is not an array
      expect(todoWriteValidate({ todos: 'invalid' })).toBe(false);
      
      // Empty todos array
      expect(todoWriteValidate({ todos: [] })).toBe(false);
    });

    it('should reject invalid todo items', () => {
      // Missing content
      expect(todoWriteValidate({
        todos: [{ id: '1', status: 'pending', priority: 'high' }]
      })).toBe(false);

      // Empty content
      expect(todoWriteValidate({
        todos: [{ id: '1', content: '', status: 'pending', priority: 'high' }]
      })).toBe(false);

      // Invalid status
      expect(todoWriteValidate({
        todos: [{ id: '1', content: 'Task', status: 'invalid', priority: 'high' }]
      })).toBe(false);

      // Invalid priority
      expect(todoWriteValidate({
        todos: [{ id: '1', content: 'Task', status: 'pending', priority: 'urgent' }]
      })).toBe(false);

      // Missing id
      expect(todoWriteValidate({
        todos: [{ content: 'Task', status: 'pending', priority: 'high' }]
      })).toBe(false);

      // Empty id
      expect(todoWriteValidate({
        todos: [{ id: '', content: 'Task', status: 'pending', priority: 'high' }]
      })).toBe(false);
    });

    it('should reject duplicate IDs', () => {
      expect(todoWriteValidate({
        todos: [
          { id: '1', content: 'Task 1', status: 'pending', priority: 'high' },
          { id: '1', content: 'Task 2', status: 'pending', priority: 'medium' },
        ]
      })).toBe(false);
    });

    it('should validate allowed status values', () => {
      const validStatuses = ['pending', 'in_progress', 'completed'];
      
      for (const status of validStatuses) {
        expect(todoWriteValidate({
          todos: [{ id: '1', content: 'Task', status, priority: 'high' }]
        })).toBe(true);
      }

      const invalidStatuses = ['todo', 'done', 'working', 'active'];
      
      for (const status of invalidStatuses) {
        expect(todoWriteValidate({
          todos: [{ id: '1', content: 'Task', status, priority: 'high' }]
        })).toBe(false);
      }
    });

    it('should validate allowed priority values', () => {
      const validPriorities = ['high', 'medium', 'low'];
      
      for (const priority of validPriorities) {
        expect(todoWriteValidate({
          todos: [{ id: '1', content: 'Task', status: 'pending', priority }]
        })).toBe(true);
      }

      const invalidPriorities = ['urgent', 'critical', 'normal', '1', '2', '3'];
      
      for (const priority of invalidPriorities) {
        expect(todoWriteValidate({
          todos: [{ id: '1', content: 'Task', status: 'pending', priority }]
        })).toBe(false);
      }
    });
  });

  describe('statistics generation', () => {
    it('should generate correct statistics', () => {
      const todos = [
        { id: '1', content: 'Task 1', status: 'pending', priority: 'high' },
        { id: '2', content: 'Task 2', status: 'in_progress', priority: 'medium' },
        { id: '3', content: 'Task 3', status: 'completed', priority: 'low' },
        { id: '4', content: 'Task 4', status: 'completed', priority: 'high' },
        { id: '5', content: 'Task 5', status: 'pending', priority: 'medium' },
      ];

      const stats = generateTodoStats(todos);

      expect(stats.total).toBe(5);
      expect(stats.pending).toBe(2);
      expect(stats.inProgress).toBe(1);
      expect(stats.completed).toBe(2);
      expect(stats.highPriority).toBe(2);
      expect(stats.mediumPriority).toBe(2);
      expect(stats.lowPriority).toBe(1);
    });

    it('should handle empty todo list', () => {
      const stats = generateTodoStats([]);

      expect(stats.total).toBe(0);
      expect(stats.pending).toBe(0);
      expect(stats.inProgress).toBe(0);
      expect(stats.completed).toBe(0);
      expect(stats.highPriority).toBe(0);
      expect(stats.mediumPriority).toBe(0);
      expect(stats.lowPriority).toBe(0);
    });
  });

  describe('progress calculation', () => {
    it('should calculate progress percentage correctly', () => {
      const calculateProgress = (todos: any[]) => {
        const stats = generateTodoStats(todos);
        return stats.total > 0 ? Math.round((stats.completed / stats.total) * 100) : 0;
      };

      // 50% complete
      const todos1 = [
        { id: '1', content: 'Task 1', status: 'completed', priority: 'high' },
        { id: '2', content: 'Task 2', status: 'pending', priority: 'medium' },
      ];
      expect(calculateProgress(todos1)).toBe(50);

      // 100% complete
      const todos2 = [
        { id: '1', content: 'Task 1', status: 'completed', priority: 'high' },
        { id: '2', content: 'Task 2', status: 'completed', priority: 'medium' },
      ];
      expect(calculateProgress(todos2)).toBe(100);

      // 0% complete
      const todos3 = [
        { id: '1', content: 'Task 1', status: 'pending', priority: 'high' },
        { id: '2', content: 'Task 2', status: 'in_progress', priority: 'medium' },
      ];
      expect(calculateProgress(todos3)).toBe(0);

      // Empty list
      expect(calculateProgress([])).toBe(0);
    });
  });

  describe('best practices validation', () => {
    it('should identify multiple in_progress tasks', () => {
      const todos = [
        { id: '1', content: 'Task 1', status: 'in_progress', priority: 'high' },
        { id: '2', content: 'Task 2', status: 'in_progress', priority: 'medium' },
        { id: '3', content: 'Task 3', status: 'pending', priority: 'low' },
      ];

      const inProgressCount = todos.filter(todo => todo.status === 'in_progress').length;
      expect(inProgressCount).toBeGreaterThan(1);
    });

    it('should find current and next tasks', () => {
      const todos = [
        { id: '1', content: 'Task 1', status: 'completed', priority: 'high' },
        { id: '2', content: 'Task 2', status: 'in_progress', priority: 'medium' },
        { id: '3', content: 'Task 3', status: 'pending', priority: 'low' },
        { id: '4', content: 'Task 4', status: 'pending', priority: 'high' },
      ];

      const currentTask = todos.find(todo => todo.status === 'in_progress');
      const nextTask = todos.find(todo => todo.status === 'pending');

      expect(currentTask?.content).toBe('Task 2');
      expect(nextTask?.content).toBe('Task 3');
    });
  });

  describe('edge cases', () => {
    it('should handle todos with whitespace in content', () => {
      expect(todoWriteValidate({
        todos: [{ id: '1', content: '   ', status: 'pending', priority: 'high' }]
      })).toBe(false);

      expect(todoWriteValidate({
        todos: [{ id: '1', content: '  Valid task  ', status: 'pending', priority: 'high' }]
      })).toBe(true);
    });

    it('should handle very long task content', () => {
      const longContent = 'A'.repeat(1000);
      expect(todoWriteValidate({
        todos: [{ id: '1', content: longContent, status: 'pending', priority: 'high' }]
      })).toBe(true);
    });

    it('should handle special characters in content', () => {
      const specialContent = 'Task with émojis 🚀 and spëcial chàracters!';
      expect(todoWriteValidate({
        todos: [{ id: '1', content: specialContent, status: 'pending', priority: 'high' }]
      })).toBe(true);
    });
  });
});