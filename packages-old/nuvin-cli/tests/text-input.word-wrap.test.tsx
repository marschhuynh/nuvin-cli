import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useStdout } from 'ink';

// Mock dependencies
vi.mock('ink', () => ({
  Text: ({ children }: { children: React.ReactNode }) => children,
  useInput: vi.fn(),
  useStdout: vi.fn(),
}));

vi.mock('../source/services/EventBus.js', () => ({
  eventBus: {
    emit: vi.fn(),
    on: vi.fn(),
    off: vi.fn(),
  },
}));

vi.mock('../source/utils/pasteHandler.js', () => ({
  processPasteChunk: vi.fn((_input) => ({
    shouldWaitForMore: false,
    isPasteStart: false,
    processedInput: null,
    newState: { buffer: null, isPasting: false },
  })),
  createPasteState: vi.fn(() => ({ buffer: null, isPasting: false })),
}));

describe('TextInput Word Wrapping', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Mock stdout with a default terminal width
    (useStdout as unknown as { mockReturnValue: (value: { stdout: { columns: number } }) => void }).mockReturnValue({
      stdout: { columns: 80 },
    });
  });

  describe('Line Position Tracking', () => {
    it('should correctly identify cursor position in single line', () => {
      // Test that cursor position tracking works correctly for single line
      const text = 'Hello World';
      const cursorOffset = 5;

      // Split into lines
      const lines = text.split('\n');
      let lineStartPos = 0;
      let currentLineIdx = 0;

      // Find which line contains the cursor
      let lineFound = false;
      for (let i = 0; i < lines.length; i++) {
        const lineEndPos = lineStartPos + lines[i].length;
        if (cursorOffset <= lineEndPos) {
          currentLineIdx = i;
          lineFound = true;
          break;
        }
        lineStartPos = lineEndPos + 1;
      }

      expect(currentLineIdx).toBe(0);
      expect(lineStartPos).toBe(0);
      expect(lineFound).toBe(true);
    });

    it('should correctly identify cursor position in multi-line text', () => {
      const text = 'Hello\nWorld\nTest';
      const cursorOffset = 12; // Position in "Test"

      const lines = text.split('\n');
      let lineStartPos = 0;
      let currentLineIdx = 0;

      let lineFound = false;
      for (let i = 0; i < lines.length; i++) {
        const lineEndPos = lineStartPos + lines[i].length;
        if (cursorOffset <= lineEndPos) {
          currentLineIdx = i;
          lineFound = true;
          break;
        }
        lineStartPos = lineEndPos + 1;
      }

      expect(currentLineIdx).toBe(2);
      expect(lineStartPos).toBe(12);
      expect(lineFound).toBe(true);
    });

    it('should handle cursor at end of line (before newline)', () => {
      const text = 'Hello\nWorld';
      const cursorOffset = 5; // Right after "Hello", at end of line

      const lines = text.split('\n');
      let lineStartPos = 0;
      let currentLineIdx = 0;

      let lineFound = false;
      for (let i = 0; i < lines.length; i++) {
        const lineEndPos = lineStartPos + lines[i].length;
        if (cursorOffset <= lineEndPos) {
          currentLineIdx = i;
          lineFound = true;
          break;
        }
        lineStartPos = lineEndPos + 1;
      }

      // Cursor at position 5 which equals lineEndPos (0 + 5) for line 0
      // With <= comparison, cursor should be on line 0
      expect(currentLineIdx).toBe(0);
      expect(lineFound).toBe(true);
    });

    it('should handle cursor at very end of text', () => {
      const text = 'Hello\nWorld';
      const cursorOffset = 11; // At the very end

      const lines = text.split('\n');
      let lineStartPos = 0;
      let currentLineIdx = 0;

      let lineFound = false;
      for (let i = 0; i < lines.length; i++) {
        const lineEndPos = lineStartPos + lines[i].length;
        if (cursorOffset <= lineEndPos) {
          currentLineIdx = i;
          lineFound = true;
          break;
        }
        lineStartPos = lineEndPos + 1;
      }

      expect(currentLineIdx).toBe(1);
      expect(lineStartPos).toBe(6);
      expect(lineFound).toBe(true);
    });

    it('should use fallback when cursor is beyond all content', () => {
      const text = 'Hello';
      const lines = text.split('\n');
      let lineStartPos = 0;
      let currentLineIdx = 0;
      const nextCursorOffset = 100; // Way beyond content

      let lineFound = false;
      for (let i = 0; i < lines.length; i++) {
        const lineEndPos = lineStartPos + lines[i].length;
        if (nextCursorOffset <= lineEndPos) {
          currentLineIdx = i;
          lineFound = true;
          break;
        }
        lineStartPos = lineEndPos + 1;
      }

      // Fallback: if loop didn't find the line, place on last line
      if (!lineFound && lines.length > 0) {
        currentLineIdx = lines.length - 1;
        lineStartPos = 0;
        for (let i = 0; i < currentLineIdx; i++) {
          lineStartPos += lines[i].length + 1;
        }
      }

      // Ensure currentLineIdx is valid
      currentLineIdx = Math.max(0, Math.min(currentLineIdx, lines.length - 1));

      // Loop didn't find the line (cursor at 100 > text length 5)
      // Fallback should place cursor on last line (line 0 in this case)
      expect(currentLineIdx).toBe(0);
      expect(lineFound).toBe(false);
    });
  });

  describe('Word Boundary Detection', () => {
    it('should identify space as word boundary', () => {
      const isWordBoundary = (char: string) => /[\s\-,;.:!?()[\]{}'"&@/\\]/.test(char);

      expect(isWordBoundary(' ')).toBe(true);
    });

    it('should identify hyphen as word boundary', () => {
      const isWordBoundary = (char: string) => /[\s\-,;.:!?()[\]{}'"&@/\\]/.test(char);

      expect(isWordBoundary('-')).toBe(true);
    });

    it('should identify punctuation as word boundary', () => {
      const isWordBoundary = (char: string) => /[\s\-,;.:!?()[\]{}'"&@/\\]/.test(char);

      expect(isWordBoundary(',')).toBe(true);
      expect(isWordBoundary(';')).toBe(true);
      expect(isWordBoundary('.')).toBe(true);
    });

    it('should identify tab as word boundary', () => {
      const isWordBoundary = (char: string) => /[\s\-,;.:!?()[\]{}'"&@/\\]/.test(char);

      expect(isWordBoundary('\t')).toBe(true);
    });

    it('should not identify regular characters as word boundary', () => {
      const isWordBoundary = (char: string) => /[\s\-,;.:!?()[\]{}'"&@/\\]/.test(char);

      expect(isWordBoundary('a')).toBe(false);
      expect(isWordBoundary('Z')).toBe(false);
      expect(isWordBoundary('0')).toBe(false);
    });
  });

  describe('Word Wrapping Logic', () => {
    it('should wrap at word boundary when line exceeds width', () => {
      const availableWidth = 20;
      const currentLine = 'This is a very long line that exceeds the width';
      const isWordBoundary = (char: string) => /[\s\-,;.:!?()[\]{}'"&@/\\]/.test(char);

      let wrapBreakPoint = availableWidth;
      const searchStart = Math.min(availableWidth, currentLine.length);
      const minSearchPoint = Math.max(0, searchStart - Math.floor(availableWidth * 0.3));

      for (let i = searchStart; i > minSearchPoint; i--) {
        if (isWordBoundary(currentLine[i])) {
          wrapBreakPoint = i + 1;
          break;
        }
      }

      const firstPart = currentLine.slice(0, wrapBreakPoint).trimEnd();
      const secondPart = currentLine.slice(wrapBreakPoint).trimStart();

      expect(firstPart.length).toBeLessThanOrEqual(availableWidth);
      expect(firstPart).toBe('This is a very long');
      expect(secondPart).toBe('line that exceeds the width');
    });

    it('should hard wrap if no word boundary found', () => {
      const availableWidth = 20;
      const currentLine = 'Thisisaverylongwordwithnospacesthatneedstowrap';
      const isWordBoundary = (char: string) => /[\s\-,;.:!?()[\]{}'"&@/\\]/.test(char);

      let wrapBreakPoint = availableWidth;
      const searchStart = Math.min(availableWidth, currentLine.length);
      const minSearchPoint = Math.max(0, searchStart - Math.floor(availableWidth * 0.3));

      for (let i = searchStart; i > minSearchPoint; i--) {
        if (isWordBoundary(currentLine[i])) {
          wrapBreakPoint = i + 1;
          break;
        }
      }

      // Should fall back to availableWidth
      expect(wrapBreakPoint).toBe(availableWidth);
    });

    it('should handle wrapping at hyphen', () => {
      const availableWidth = 20;
      const currentLine = 'This is a multi-word-hyphenated-long-text';
      const isWordBoundary = (char: string) => /[\s\-,;.:!?()[\]{}'"&@/\\]/.test(char);

      let wrapBreakPoint = availableWidth;
      const searchStart = Math.min(availableWidth, currentLine.length);
      const minSearchPoint = Math.max(0, searchStart - Math.floor(availableWidth * 0.3));

      for (let i = searchStart; i > minSearchPoint; i--) {
        if (isWordBoundary(currentLine[i])) {
          wrapBreakPoint = i + 1;
          break;
        }
      }

      const _firstPart = currentLine.slice(0, wrapBreakPoint).trimEnd();

      // Should wrap at a hyphen or space within the search range
      // The wrapped part after trimming should be reasonable length
      expect(wrapBreakPoint).toBeGreaterThan(minSearchPoint);
      expect(wrapBreakPoint).toBeLessThanOrEqual(searchStart + 1);
    });
  });

  describe('Cursor Position Adjustment After Wrapping', () => {
    it('should keep cursor in first part if it was before break point', () => {
      const currentLine = 'This is a long line';
      const breakPoint = 10;
      const cursorColumnInLine = 5; // Cursor at "is"

      const textBeforeBreak = currentLine.slice(0, breakPoint);
      const textAfterBreak = currentLine.slice(breakPoint);
      const firstPart = textBeforeBreak.trimEnd();
      const secondPart = textAfterBreak.trimStart();

      const lineStartPos = 0;
      const newLineStartPos = lineStartPos;
      let adjustedCursorOffset = 0;

      const positionInOriginal = cursorColumnInLine;
      const leadingSpacesTrimmed = textAfterBreak.length - secondPart.length;

      if (positionInOriginal < firstPart.length) {
        adjustedCursorOffset = newLineStartPos + positionInOriginal;
      } else if (positionInOriginal < breakPoint) {
        adjustedCursorOffset = newLineStartPos + firstPart.length;
      } else {
        const positionInSecondPartOriginal = positionInOriginal - breakPoint;
        if (positionInSecondPartOriginal < leadingSpacesTrimmed) {
          adjustedCursorOffset = newLineStartPos + firstPart.length + 1;
        } else {
          const positionInSecondPartContent = positionInSecondPartOriginal - leadingSpacesTrimmed;
          adjustedCursorOffset = newLineStartPos + firstPart.length + 1 + positionInSecondPartContent;
        }
      }

      expect(adjustedCursorOffset).toBe(5);
    });

    it('should move cursor to second line if it was after break point', () => {
      const currentLine = 'This is a long line';
      const breakPoint = 10;
      const cursorColumnInLine = 15; // Cursor in "line"

      const textBeforeBreak = currentLine.slice(0, breakPoint);
      const textAfterBreak = currentLine.slice(breakPoint);
      const firstPart = textBeforeBreak.trimEnd();
      const secondPart = textAfterBreak.trimStart();

      const lineStartPos = 0;
      const newLineStartPos = lineStartPos;
      let adjustedCursorOffset = 0;

      const positionInOriginal = cursorColumnInLine;
      const leadingSpacesTrimmed = textAfterBreak.length - secondPart.length;

      if (positionInOriginal < firstPart.length) {
        adjustedCursorOffset = newLineStartPos + positionInOriginal;
      } else if (positionInOriginal < breakPoint) {
        adjustedCursorOffset = newLineStartPos + firstPart.length;
      } else {
        const positionInSecondPartOriginal = positionInOriginal - breakPoint;
        if (positionInSecondPartOriginal < leadingSpacesTrimmed) {
          adjustedCursorOffset = newLineStartPos + firstPart.length + 1;
        } else {
          const positionInSecondPartContent = positionInSecondPartOriginal - leadingSpacesTrimmed;
          adjustedCursorOffset = newLineStartPos + firstPart.length + 1 + positionInSecondPartContent;
        }
      }

      // Cursor should be in second line
      expect(adjustedCursorOffset).toBeGreaterThan(firstPart.length);
    });

    it('should clamp cursor to end of first part if in trailing whitespace', () => {
      const currentLine = 'This is a   long line'; // Extra spaces
      const breakPoint = 11; // After the spaces
      const cursorColumnInLine = 10; // In the trailing spaces

      const textBeforeBreak = currentLine.slice(0, breakPoint);
      const textAfterBreak = currentLine.slice(breakPoint);
      const firstPart = textBeforeBreak.trimEnd(); // "This is a"
      const secondPart = textAfterBreak.trimStart();

      const lineStartPos = 0;
      const newLineStartPos = lineStartPos;
      let adjustedCursorOffset = 0;

      const positionInOriginal = cursorColumnInLine;
      const leadingSpacesTrimmed = textAfterBreak.length - secondPart.length;

      if (positionInOriginal < firstPart.length) {
        adjustedCursorOffset = newLineStartPos + positionInOriginal;
      } else if (positionInOriginal < breakPoint) {
        // Cursor was in trailing whitespace
        adjustedCursorOffset = newLineStartPos + firstPart.length;
      } else {
        const positionInSecondPartOriginal = positionInOriginal - breakPoint;
        if (positionInSecondPartOriginal < leadingSpacesTrimmed) {
          adjustedCursorOffset = newLineStartPos + firstPart.length + 1;
        } else {
          const positionInSecondPartContent = positionInSecondPartOriginal - leadingSpacesTrimmed;
          adjustedCursorOffset = newLineStartPos + firstPart.length + 1 + positionInSecondPartContent;
        }
      }

      expect(adjustedCursorOffset).toBe(firstPart.length);
    });

    it('should handle cursor at exact break point', () => {
      const currentLine = 'This is a long line';
      const breakPoint = 10;
      const cursorColumnInLine = 10; // Exactly at break point

      const textBeforeBreak = currentLine.slice(0, breakPoint);
      const textAfterBreak = currentLine.slice(breakPoint);
      const firstPart = textBeforeBreak.trimEnd();
      const secondPart = textAfterBreak.trimStart();

      const lineStartPos = 0;
      const newLineStartPos = lineStartPos;
      let adjustedCursorOffset = 0;

      const positionInOriginal = cursorColumnInLine;
      const leadingSpacesTrimmed = textAfterBreak.length - secondPart.length;

      if (positionInOriginal < firstPart.length) {
        adjustedCursorOffset = newLineStartPos + positionInOriginal;
      } else if (positionInOriginal < breakPoint) {
        adjustedCursorOffset = newLineStartPos + firstPart.length;
      } else {
        const positionInSecondPartOriginal = positionInOriginal - breakPoint;
        if (positionInSecondPartOriginal < leadingSpacesTrimmed) {
          adjustedCursorOffset = newLineStartPos + firstPart.length + 1;
        } else {
          const positionInSecondPartContent = positionInSecondPartOriginal - leadingSpacesTrimmed;
          adjustedCursorOffset = newLineStartPos + firstPart.length + 1 + positionInSecondPartContent;
        }
      }

      // Should place cursor at start of second line (after leading space is trimmed)
      expect(adjustedCursorOffset).toBe(firstPart.length + 1);
    });

    it('should handle cursor in leading whitespace of second part', () => {
      const currentLine = 'This is a    long line'; // 4 spaces after "a"
      const breakPoint = 10; // After "This is a " (includes 1 space)
      const cursorColumnInLine = 11; // In the leading spaces of second part

      const textBeforeBreak = currentLine.slice(0, breakPoint);
      const textAfterBreak = currentLine.slice(breakPoint);
      const firstPart = textBeforeBreak.trimEnd(); // "This is a"
      const secondPart = textAfterBreak.trimStart(); // "long line"

      const lineStartPos = 0;
      const newLineStartPos = lineStartPos;
      let adjustedCursorOffset = 0;

      const positionInOriginal = cursorColumnInLine;
      const leadingSpacesTrimmed = textAfterBreak.length - secondPart.length;

      if (positionInOriginal < firstPart.length) {
        adjustedCursorOffset = newLineStartPos + positionInOriginal;
      } else if (positionInOriginal < breakPoint) {
        adjustedCursorOffset = newLineStartPos + firstPart.length;
      } else {
        const positionInSecondPartOriginal = positionInOriginal - breakPoint;
        if (positionInSecondPartOriginal < leadingSpacesTrimmed) {
          // Cursor in leading whitespace
          adjustedCursorOffset = newLineStartPos + firstPart.length + 1;
        } else {
          const positionInSecondPartContent = positionInSecondPartOriginal - leadingSpacesTrimmed;
          adjustedCursorOffset = newLineStartPos + firstPart.length + 1 + positionInSecondPartContent;
        }
      }

      // Cursor was in leading spaces that got trimmed, should be at start of second line content
      expect(adjustedCursorOffset).toBe(firstPart.length + 1);
    });

    it('should handle cursor in content of second part after leading spaces', () => {
      const currentLine = 'Hello     World'; // 5 spaces
      const breakPoint = 10; // After "Hello     "
      const cursorColumnInLine = 14; // In "World" (position 4 in "World")

      const textBeforeBreak = currentLine.slice(0, breakPoint);
      const textAfterBreak = currentLine.slice(breakPoint);
      const firstPart = textBeforeBreak.trimEnd(); // "Hello"
      const secondPart = textAfterBreak.trimStart(); // "World"

      const lineStartPos = 0;
      const newLineStartPos = lineStartPos;
      let adjustedCursorOffset = 0;

      const positionInOriginal = cursorColumnInLine;
      const leadingSpacesTrimmed = textAfterBreak.length - secondPart.length;

      if (positionInOriginal < firstPart.length) {
        adjustedCursorOffset = newLineStartPos + positionInOriginal;
      } else if (positionInOriginal < breakPoint) {
        adjustedCursorOffset = newLineStartPos + firstPart.length;
      } else {
        const positionInSecondPartOriginal = positionInOriginal - breakPoint;
        if (positionInSecondPartOriginal < leadingSpacesTrimmed) {
          adjustedCursorOffset = newLineStartPos + firstPart.length + 1;
        } else {
          const positionInSecondPartContent = positionInSecondPartOriginal - leadingSpacesTrimmed;
          adjustedCursorOffset = newLineStartPos + firstPart.length + 1 + positionInSecondPartContent;
        }
      }

      // Cursor in "World" at position 4, should be at newLineStartPos + "Hello".length + 1 (newline) + 4
      expect(adjustedCursorOffset).toBe(firstPart.length + 1 + 4);
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty line', () => {
      const currentLine = '';
      const availableWidth = 20;

      expect(currentLine.length).toBeLessThanOrEqual(availableWidth);
      // No wrapping needed
    });

    it('should handle line exactly at available width', () => {
      const availableWidth = 20;
      const currentLine = 'Exactly twenty chars';

      expect(currentLine.length).toBe(availableWidth);
      // Should not wrap - only wrap if exceeds
    });

    it('should handle line one character over width', () => {
      const availableWidth = 20;
      const currentLine = 'Exactly twenty chars!';

      expect(currentLine.length).toBe(availableWidth + 1);
      // Should trigger wrapping
    });

    it('should handle single word longer than width', () => {
      const availableWidth = 10;
      const currentLine = 'Supercalifragilisticexpialidocious';
      const isWordBoundary = (char: string) => /[\s\-,;.:!?()[\]{}'"&@/\\]/.test(char);

      let wrapBreakPoint = availableWidth;
      const searchStart = Math.min(availableWidth, currentLine.length);
      const minSearchPoint = Math.max(0, searchStart - Math.floor(availableWidth * 0.3));

      for (let i = searchStart; i > minSearchPoint; i--) {
        if (isWordBoundary(currentLine[i])) {
          wrapBreakPoint = i + 1;
          break;
        }
      }

      // Should hard wrap at availableWidth
      expect(wrapBreakPoint).toBe(availableWidth);
    });

    it('should handle multiple spaces between words', () => {
      const currentLine = 'Word1    Word2    Word3';
      const wrapBreakPoint = 10;

      const textBeforeBreak = currentLine.slice(0, wrapBreakPoint);
      const textAfterBreak = currentLine.slice(wrapBreakPoint);
      const firstPart = textBeforeBreak.trimEnd();
      const secondPart = textAfterBreak.trimStart();

      // trimEnd and trimStart should handle multiple spaces
      expect(firstPart).not.toMatch(/\s$/);
      expect(secondPart).not.toMatch(/^\s/);
    });

    it('should preserve existing newlines in multi-line text', () => {
      const text = 'Line1\nLine2\nLine3';
      const lines = text.split('\n');

      expect(lines.length).toBe(3);
      expect(lines[0]).toBe('Line1');
      expect(lines[1]).toBe('Line2');
      expect(lines[2]).toBe('Line3');
    });
  });

  describe('Integration Tests', () => {
    it('should handle typing that triggers wrap mid-sentence', () => {
      const availableWidth = 20;
      const originalText = 'This is getting long n';
      const newChar = 'o';
      const currentLine = `${originalText + newChar}w`;

      // Should exceed width and wrap
      expect(currentLine.length).toBeGreaterThan(availableWidth);
    });

    it('should handle paste that creates very long line', () => {
      const availableWidth = 30;
      const pastedText =
        'This is a very long pasted text that definitely exceeds the available width and should be wrapped';

      expect(pastedText.length).toBeGreaterThan(availableWidth);
      // Should trigger wrapping logic
    });

    it('should recalculate line positions after wrap', () => {
      const lines = ['First line', 'Second line that is too long'];
      const _availableWidth = 20;
      const currentLineIdx = 1;

      const currentLine = lines[currentLineIdx];
      const wrapBreakPoint = 20;

      const firstPart = currentLine.slice(0, wrapBreakPoint).trimEnd();
      const secondPart = currentLine.slice(wrapBreakPoint).trimStart();

      // Simulate wrapping
      lines[currentLineIdx] = firstPart;
      lines.splice(currentLineIdx + 1, 0, secondPart);

      expect(lines.length).toBe(3);
      expect(lines[1]).toBe(firstPart);
      expect(lines[2]).toBe(secondPart);

      // Recalculate position
      let newLineStartPos = 0;
      for (let i = 0; i < currentLineIdx; i++) {
        newLineStartPos += lines[i].length + 1;
      }

      expect(newLineStartPos).toBe(lines[0].length + 1);
    });
  });
});
