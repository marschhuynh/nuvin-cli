import { describe, it, expect, vi, beforeEach } from 'vitest';
import { commandRegistry } from '../source/modules/commands/registry.js';
import type { CommandDefinition } from '../source/modules/commands/types.js';
import { findCommandCompletion, completeCommand } from '../source/utils/commandCompletion.js';

const createMockCommand = (id: string): CommandDefinition => ({
  id,
  type: 'function',
  description: `Test command ${id}`,
  handler: async () => {},
});

describe('useCommandCompletion', () => {
  beforeEach(() => {
    // Clear the registry and register test commands
    // Note: This is a workaround - ideally we'd use a fresh registry
    const exitCmd = createMockCommand('/exit');
    const helpCmd = createMockCommand('/help');
    const historyCmd = createMockCommand('/history');
    const clearCmd = createMockCommand('/clear');

    commandRegistry.register(exitCmd);
    commandRegistry.register(helpCmd);
    commandRegistry.register(historyCmd);
    commandRegistry.register(clearCmd);
  });

  describe('findCommandCompletion', () => {
    it('returns null for input without slash command', () => {
      const result = findCommandCompletion('hello world', 5);
      expect(result).toBeNull();
    });

    it('returns null for empty partial command', () => {
      const result = findCommandCompletion('/', 1);
      expect(result).toBeNull();
    });

    it('finds /exit command when typing /e', () => {
      const result = findCommandCompletion('/e', 2);
      expect(result).toBe('/exit');
    });

    it('finds /exit command when typing /ex', () => {
      const result = findCommandCompletion('/ex', 3);
      expect(result).toBe('/exit');
    });

    it('finds /exit command when typing /exit with cursor in middle', () => {
      const result = findCommandCompletion('/exit', 2); // cursor after /e
      expect(result).toBe('/exit');
    });

    it('returns first matching command for /h (could be /help or /history)', () => {
      const result = findCommandCompletion('/h', 2);
      // Should return first matching command
      expect(result).toBeTruthy();
      expect(result).toMatch(/^\/(help|history)$/);
    });

    it('returns null for non-matching command', () => {
      const result = findCommandCompletion('/xyz', 4);
      expect(result).toBeNull();
    });

    it('returns null when cursor is not at command position', () => {
      const result = findCommandCompletion('hello world', 10);
      expect(result).toBeNull();
    });

    it('completes /ex when cursor is at end of /ex in the middle of text', () => {
      const result = findCommandCompletion('/hello /ex', 11);
      expect(result).toBe('/exit');
    });
  });

  describe('completeCommand', () => {
    it('completes /e to /exit with trailing space', () => {
      const result = completeCommand('/e', 2, '/exit');
      expect(result.newValue).toBe('/exit ');
      expect(result.newCursorOffset).toBe(6);
    });

    it('completes /ex to /exit with trailing space', () => {
      const result = completeCommand('/ex', 3, '/exit');
      expect(result.newValue).toBe('/exit ');
      expect(result.newCursorOffset).toBe(6);
    });

    it('preserves text after cursor', () => {
      const result = completeCommand('/e more text', 2, '/exit');
      expect(result.newValue).toBe('/exit  more text');
      expect(result.newCursorOffset).toBe(6);
    });

    it('handles cursor in middle of partial command', () => {
      const result = completeCommand('/ex here', 3, '/exit');
      expect(result.newValue).toBe('/exit  here');
      expect(result.newCursorOffset).toBe(6);
    });

    it('returns original when no partial command found', () => {
      const result = completeCommand('hello', 3, '/exit');
      expect(result.newValue).toBe('hello');
      expect(result.newCursorOffset).toBe(3);
    });
  });
});
