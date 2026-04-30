import { describe, it, expect } from 'vitest';
import { isValidCommandId, sanitizeCommandId } from '../command-types.js';

describe('command-types', () => {
  describe('isValidCommandId', () => {
    it('should accept valid command ids', () => {
      expect(isValidCommandId('review')).toBe(true);
      expect(isValidCommandId('code-review')).toBe(true);
      expect(isValidCommandId('test123')).toBe(true);
      expect(isValidCommandId('a')).toBe(true);
    });

    it('should reject invalid command ids', () => {
      expect(isValidCommandId('')).toBe(false);
      expect(isValidCommandId('123')).toBe(false);
      expect(isValidCommandId('-test')).toBe(false);
      expect(isValidCommandId('Test')).toBe(false);
      expect(isValidCommandId('test_cmd')).toBe(false);
      expect(isValidCommandId('test cmd')).toBe(false);
    });
  });

  describe('sanitizeCommandId', () => {
    it('should convert to lowercase', () => {
      expect(sanitizeCommandId('Review')).toBe('review');
      expect(sanitizeCommandId('CODE-REVIEW')).toBe('code-review');
    });

    it('should replace invalid characters with hyphens', () => {
      expect(sanitizeCommandId('test_cmd')).toBe('test-cmd');
      expect(sanitizeCommandId('test cmd')).toBe('test-cmd');
      expect(sanitizeCommandId('test@cmd!')).toBe('test-cmd');
    });

    it('should collapse multiple hyphens', () => {
      expect(sanitizeCommandId('test--cmd')).toBe('test-cmd');
      expect(sanitizeCommandId('test___cmd')).toBe('test-cmd');
    });

    it('should remove leading and trailing hyphens', () => {
      expect(sanitizeCommandId('-test-')).toBe('test');
      expect(sanitizeCommandId('---test---')).toBe('test');
    });

    it('should handle edge cases', () => {
      expect(sanitizeCommandId('my-cool-command-123')).toBe('my-cool-command-123');
      expect(sanitizeCommandId('  spaces  ')).toBe('spaces');
    });
  });
});
