import { describe, it, expect } from 'vitest';
import { deepMerge } from '../source/config/utils.js';

describe('deepMerge', () => {
  describe('basic merging', () => {
    it('should merge two simple objects', () => {
      const target = { a: 1, b: 2 };
      const source = { c: 3, d: 4 };
      const result = deepMerge(target, source);

      expect(result).toEqual({ a: 1, b: 2, c: 3, d: 4 });
    });

    it('should override target values with source values', () => {
      const target = { a: 1, b: 2 };
      const source = { b: 3, c: 4 };
      const result = deepMerge(target, source);

      expect(result).toEqual({ a: 1, b: 3, c: 4 });
    });

    it('should skip undefined values in source', () => {
      const target = { a: 1, b: 2 };
      const source = { b: undefined, c: 3 };
      const result = deepMerge(target, source);

      expect(result).toEqual({ a: 1, b: 2, c: 3 });
    });

    it('should not mutate original target', () => {
      const target = { a: 1, b: 2 };
      const targetCopy = { ...target };
      const source = { c: 3 };

      deepMerge(target, source);

      expect(target).toEqual(targetCopy);
    });
  });

  describe('nested object merging', () => {
    it('should deep merge nested objects', () => {
      const target = {
        user: { name: 'John', age: 30 },
        settings: { theme: 'dark' },
      };
      const source = {
        user: { age: 31, email: 'john@example.com' },
        settings: { fontSize: 14 },
      };
      const result = deepMerge(target, source);

      expect(result).toEqual({
        user: { name: 'John', age: 31, email: 'john@example.com' },
        settings: { theme: 'dark', fontSize: 14 },
      });
    });

    it('should handle deeply nested objects', () => {
      const target = {
        level1: {
          level2: {
            level3: { a: 1 },
          },
        },
      };
      const source = {
        level1: {
          level2: {
            level3: { b: 2 },
            newKey: 'value',
          },
        },
      };
      const result = deepMerge(target, source);

      expect(result).toEqual({
        level1: {
          level2: {
            level3: { a: 1, b: 2 },
            newKey: 'value',
          },
        },
      });
    });

    it('should replace non-object with object', () => {
      const target = { a: 'string' };
      const source = { a: { nested: true } };
      const result = deepMerge(target, source);

      expect(result).toEqual({ a: { nested: true } });
    });

    it('should replace object with non-object', () => {
      const target = { a: { nested: true } };
      const source = { a: 'string' };
      const result = deepMerge(target, source);

      expect(result).toEqual({ a: 'string' });
    });
  });

  describe('array merging', () => {
    it('should merge array elements by index', () => {
      const target = {
        items: [
          { id: 1, name: 'First' },
          { id: 2, name: 'Second' },
        ],
      };
      const source = {
        items: [{ id: 1, name: 'Updated First' }],
      };
      const result = deepMerge(target, source);

      expect(result).toEqual({
        items: [
          { id: 1, name: 'Updated First' },
          { id: 2, name: 'Second' },
        ],
      });
    });

    it('should merge array elements preserving unmerged properties', () => {
      const target = {
        auth: [{ type: 'api-key', 'api-key': 'old-key' }],
      };
      const source = {
        auth: [{ 'api-key': 'new-key' }],
      };
      const result = deepMerge(target, source);

      expect(result).toEqual({
        auth: [{ type: 'api-key', 'api-key': 'new-key' }],
      });
    });

    it('should add new array elements from source', () => {
      const target = {
        items: [{ id: 1 }],
      };
      const source = {
        items: [{ id: 1 }, { id: 2 }, { id: 3 }],
      };
      const result = deepMerge(target, source);

      expect(result).toEqual({
        items: [{ id: 1 }, { id: 2 }, { id: 3 }],
      });
    });

    it('should clone array elements that are objects', () => {
      const target = {};
      const sourceObj = { name: 'test' };
      const source = {
        items: [sourceObj],
      };
      const result = deepMerge(target, source);

      expect(result.items).toEqual([{ name: 'test' }]);
      expect(result.items[0]).not.toBe(sourceObj);
    });

    it('should handle arrays with primitive values', () => {
      const target = {
        tags: ['a', 'b'],
      };
      const source = {
        tags: ['c', 'd', 'e'],
      };
      const result = deepMerge(target, source);

      expect(result).toEqual({
        tags: ['c', 'd', 'e'],
      });
    });

    it('should replace non-array with array', () => {
      const target = { items: 'not-an-array' };
      const source = { items: [1, 2, 3] };
      const result = deepMerge(target, source);

      expect(result).toEqual({ items: [1, 2, 3] });
    });

    it('should handle mixed array elements (objects and primitives)', () => {
      const target = {
        mixed: [{ id: 1 }, 'string', 123],
      };
      const source = {
        mixed: [{ id: 1, name: 'updated' }, 'new-string'],
      };
      const result = deepMerge(target, source);

      expect(result).toEqual({
        mixed: [{ id: 1, name: 'updated' }, 'new-string', 123],
      });
    });
  });

  describe('real-world scenarios', () => {
    it('should merge provider config with auth array', () => {
      const target = {
        providers: {
          openrouter: {
            auth: [{ type: 'api-key' }],
          },
        },
      };
      const source = {
        providers: {
          openrouter: {
            auth: [{ 'api-key': 'sk-or-xxx' }],
          },
        },
      };
      const result = deepMerge(target, source);

      expect(result).toEqual({
        providers: {
          openrouter: {
            auth: [{ type: 'api-key', 'api-key': 'sk-or-xxx' }],
          },
        },
      });
    });

    it('should merge multiple provider configs', () => {
      const target = {
        providers: {
          openrouter: { model: 'gpt-4' },
          anthropic: { model: 'claude-3' },
        },
      };
      const source = {
        providers: {
          openrouter: { apiKey: 'key1' },
          github: { apiKey: 'key2' },
        },
      };
      const result = deepMerge(target, source);

      expect(result).toEqual({
        providers: {
          openrouter: { model: 'gpt-4', apiKey: 'key1' },
          anthropic: { model: 'claude-3' },
          github: { apiKey: 'key2' },
        },
      });
    });

    it('should handle empty objects', () => {
      const target = {};
      const source = { a: 1, b: { c: 2 } };
      const result = deepMerge(target, source);

      expect(result).toEqual({ a: 1, b: { c: 2 } });
    });

    it('should handle empty source', () => {
      const target = { a: 1, b: 2 };
      const source = {};
      const result = deepMerge(target, source);

      expect(result).toEqual({ a: 1, b: 2 });
    });
  });

  describe('edge cases', () => {
    it('should handle null values', () => {
      const target = { a: 1 };
      const source = { a: null };
      const result = deepMerge(target, source);

      expect(result).toEqual({ a: null });
    });

    it('should handle empty arrays', () => {
      const target = { items: [1, 2, 3] };
      const source = { items: [] };
      const result = deepMerge(target, source);

      expect(result).toEqual({ items: [1, 2, 3] });
    });

    it('should clone nested objects in arrays', () => {
      const target = {
        items: [{ id: 1, nested: { value: 'original' } }],
      };
      const source = {
        items: [{ nested: { value: 'updated', new: true } }],
      };
      const result = deepMerge(target, source);

      expect(result).toEqual({
        items: [{ id: 1, nested: { value: 'updated', new: true } }],
      });
    });

    it('should handle arrays with undefined elements', () => {
      const target = {
        items: [{ id: 1 }, undefined, { id: 3 }],
      };
      const source = {
        items: [{ id: 1 }, { id: 2 }],
      };
      const result = deepMerge(target, source);

      expect(result).toEqual({
        items: [{ id: 1 }, { id: 2 }, { id: 3 }],
      });
    });

    it('should preserve array length from target if longer', () => {
      const target = {
        items: [1, 2, 3, 4, 5],
      };
      const source = {
        items: [10, 20],
      };
      const result = deepMerge(target, source);

      expect(result).toEqual({
        items: [10, 20, 3, 4, 5],
      });
    });
  });
});
