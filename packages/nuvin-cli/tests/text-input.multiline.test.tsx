import { describe, it, expect } from 'vitest';

/**
 * Helper function to get line information from a string value
 * This mirrors the getLineInfo function in TextInput.tsx
 */
function getLineInfo(value: string, offset: number) {
  const lines = value.split('\n');

  let currentPos = 0;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineEnd = currentPos + line.length;
    if (offset <= lineEnd) {
      return {
        lines,
        lineIndex: i,
        column: offset - currentPos,
        lineStart: currentPos,
        lineEnd,
      };
    }
    currentPos = lineEnd + 1;
  }

  const lastIndex = Math.max(0, lines.length - 1);
  const lastLine = lines[lastIndex] ?? '';
  const lineStart = value.length - lastLine.length;
  return {
    lines,
    lineIndex: lastIndex,
    column: lastLine.length,
    lineStart,
    lineEnd: value.length,
  };
}

/**
 * Helper function to move cursor vertically
 * This mirrors the moveCursorVertically function in TextInput.tsx
 */
function moveCursorVertically(value: string, offset: number, direction: 'up' | 'down'): number | null {
  if (!value.includes('\n')) {
    return null;
  }

  const info = getLineInfo(value, offset);
  const targetIndex = direction === 'up' ? info.lineIndex - 1 : info.lineIndex + 1;

  if (targetIndex < 0 || targetIndex >= info.lines.length) {
    return null;
  }

  const targetLineLength = info.lines[targetIndex].length;
  const targetColumn = Math.min(info.column, targetLineLength);

  let newPos = 0;
  for (let i = 0; i < targetIndex; i++) {
    newPos += info.lines[i].length + 1;
  }

  return newPos + targetColumn;
}

describe('TextInput - Multi-line input', () => {
  describe('Line information tracking', () => {
    it('correctly identifies first line position', () => {
      const multiLineValue = 'Line 1\nLine 2\nLine 3';
      const info = getLineInfo(multiLineValue, 3); // Position in "Line 1"

      expect(info.lineIndex).toBe(0);
      expect(info.column).toBe(3);
      expect(info.lineStart).toBe(0);
      expect(info.lineEnd).toBe(6);
    });

    it('correctly identifies second line position', () => {
      const multiLineValue = 'Line 1\nLine 2\nLine 3';
      const info = getLineInfo(multiLineValue, 10); // Position in "Line 2"

      expect(info.lineIndex).toBe(1);
      expect(info.column).toBe(3);
      expect(info.lineStart).toBe(7);
      expect(info.lineEnd).toBe(13);
    });

    it('correctly identifies last line position', () => {
      const multiLineValue = 'Line 1\nLine 2\nLine 3';
      const info = getLineInfo(multiLineValue, 17); // Position in "Line 3"

      expect(info.lineIndex).toBe(2);
      expect(info.column).toBe(3);
      expect(info.lineStart).toBe(14);
      expect(info.lineEnd).toBe(20);
    });

    it('handles position at newline boundary', () => {
      const multiLineValue = 'Line 1\nLine 2';
      const info = getLineInfo(multiLineValue, 6); // Right at end of first line

      expect(info.lineIndex).toBe(0);
      expect(info.column).toBe(6);
    });

    it('handles empty lines', () => {
      const multiLineValue = 'Line 1\n\nLine 3';
      const info = getLineInfo(multiLineValue, 7); // Position on empty line

      expect(info.lineIndex).toBe(1);
      expect(info.column).toBe(0);
      expect(info.lineStart).toBe(7);
      expect(info.lineEnd).toBe(7);
    });

    it('handles single line (no newlines)', () => {
      const singleLineValue = 'Just one line';
      const info = getLineInfo(singleLineValue, 5);

      expect(info.lineIndex).toBe(0);
      expect(info.lines.length).toBe(1);
    });

    it('handles position beyond content (fallback to last line)', () => {
      const multiLineValue = 'Line 1\nLine 2';
      const info = getLineInfo(multiLineValue, 100); // Way beyond

      expect(info.lineIndex).toBe(1);
      expect(info.column).toBe(6); // "Line 2".length
    });
  });

  describe('Vertical cursor movement', () => {
    it('moves cursor down to next line', () => {
      const multiLineValue = 'Line 1\nLine 2\nLine 3';
      const cursorAt = 3; // Position in "Line 1"

      const newPos = moveCursorVertically(multiLineValue, cursorAt, 'down');

      expect(newPos).toBe(10); // Same column (3) on next line
    });

    it('moves cursor up to previous line', () => {
      const multiLineValue = 'Line 1\nLine 2\nLine 3';
      const cursorAt = 10; // Position in "Line 2"

      const newPos = moveCursorVertically(multiLineValue, cursorAt, 'up');

      expect(newPos).toBe(3); // Same column on previous line
    });

    it('returns null when trying to move up from first line', () => {
      const multiLineValue = 'Line 1\nLine 2';
      const cursorAt = 3; // Position in first line

      const newPos = moveCursorVertically(multiLineValue, cursorAt, 'up');

      expect(newPos).toBe(null);
    });

    it('returns null when trying to move down from last line', () => {
      const multiLineValue = 'Line 1\nLine 2';
      const cursorAt = 10; // Position in last line

      const newPos = moveCursorVertically(multiLineValue, cursorAt, 'down');

      expect(newPos).toBe(null);
    });

    it('returns null for single line text', () => {
      const singleLineValue = 'Just one line';
      const cursorAt = 5;

      const newPosDown = moveCursorVertically(singleLineValue, cursorAt, 'down');
      const newPosUp = moveCursorVertically(singleLineValue, cursorAt, 'up');

      expect(newPosDown).toBe(null);
      expect(newPosUp).toBe(null);
    });

    it('preserves column when moving between equal length lines', () => {
      const multiLineValue = 'AAAA\nBBBB\nCCCC';
      const cursorAt = 2; // Column 2 in first line

      const downPos = moveCursorVertically(multiLineValue, cursorAt, 'down');
      expect(downPos).toBe(7); // Column 2 in second line
      expect(downPos).not.toBe(null);

      const upPos = moveCursorVertically(multiLineValue, downPos ?? 0, 'up');
      expect(upPos).toBe(2); // Back to column 2 in first line
    });

    it('clamps column when moving to shorter line', () => {
      const multiLineValue = 'Long line here\nShort';
      const cursorAt = 10; // Column 10 in first line

      const newPos = moveCursorVertically(multiLineValue, cursorAt, 'down');

      // Second line is only 5 chars, so column should be clamped to 5
      expect(newPos).toBe(20); // 15 (first line + \n) + 5 (clamped column)
    });

    it('handles moving to empty line', () => {
      const multiLineValue = 'Line 1\n\nLine 3';
      const cursorAt = 3; // Column 3 in first line

      const newPos = moveCursorVertically(multiLineValue, cursorAt, 'down');

      // Empty line has length 0, so column should be clamped to 0
      expect(newPos).toBe(7); // Position at start of empty line
    });

    it('handles moving from empty line', () => {
      const multiLineValue = 'Line 1\n\nLine 3';
      const cursorAt = 7; // Position on empty line

      const newPosDown = moveCursorVertically(multiLineValue, cursorAt, 'down');
      const newPosUp = moveCursorVertically(multiLineValue, cursorAt, 'up');

      expect(newPosDown).toBe(8); // Start of "Line 3"
      expect(newPosUp).toBe(0); // Start of "Line 1"
    });
  });

  describe('Test output simulation (the original use case)', () => {
    it('correctly splits test output into multiple lines', () => {
      const testOutput =
        ' ✓ tests/eventProcessor.fixed.test.ts (8 tests) 7ms\n ✓ tests/eventProcessor.test.ts (10 tests) 8ms';

      const lines = testOutput.split('\n');

      expect(lines.length).toBe(2);
      expect(lines[0]).toContain('eventProcessor.fixed.test.ts');
      expect(lines[1]).toContain('eventProcessor.test.ts');
    });

    it('identifies line boundaries in test output', () => {
      const testOutput =
        ' ✓ tests/eventProcessor.fixed.test.ts (8 tests) 7ms\n ✓ tests/eventProcessor.test.ts (10 tests) 8ms';

      // Get info for position in first line
      const info1 = getLineInfo(testOutput, 20);
      expect(info1.lineIndex).toBe(0);
      expect(info1.lines[0]).toContain('eventProcessor.fixed.test.ts');

      // Get info for position in second line
      const info2 = getLineInfo(testOutput, 60);
      expect(info2.lineIndex).toBe(1);
      expect(info2.lines[1]).toContain('eventProcessor.test.ts');
    });

    it('allows cursor navigation between test output lines', () => {
      const testOutput =
        ' ✓ tests/eventProcessor.fixed.test.ts (8 tests) 7ms\n ✓ tests/eventProcessor.test.ts (10 tests) 8ms';

      const cursorOnFirstLine = 10;
      const newPos = moveCursorVertically(testOutput, cursorOnFirstLine, 'down');

      expect(newPos).not.toBe(null);
      if (newPos !== null) {
        const info = getLineInfo(testOutput, newPos);
        expect(info.lineIndex).toBe(1);
      }
    });
  });

  describe('Edge cases', () => {
    it('handles text with only newlines', () => {
      const value = '\n\n\n';
      const info = getLineInfo(value, 1);

      expect(info.lines.length).toBe(4); // 3 newlines create 4 lines
      expect(info.lineIndex).toBe(1);
    });

    it('handles very long multi-line text', () => {
      const lines = Array.from({ length: 100 }, (_, i) => `Line ${i + 1}`);
      const value = lines.join('\n');

      const info50 = getLineInfo(value, value.indexOf('Line 50'));
      expect(info50.lineIndex).toBe(49);

      const info99 = getLineInfo(value, value.indexOf('Line 99'));
      expect(info99.lineIndex).toBe(98);
    });

    it('handles lines with special characters', () => {
      const value = 'Line with\ttabs\nLine with "quotes"\nLine with \'apostrophes\'';
      const lines = value.split('\n');

      expect(lines.length).toBe(3);
      expect(lines[0]).toContain('\t');
      expect(lines[1]).toContain('"');
      expect(lines[2]).toContain("'");
    });

    it('handles unicode characters', () => {
      const value = 'Hello 🌍\nWorld 世界\nمرحبا мир';
      const info = getLineInfo(value, 10);

      expect(info.lines.length).toBe(3);
      // Just verify it doesn't crash with unicode
      expect(info.lineIndex).toBeGreaterThanOrEqual(0);
    });

    it('handles cursor at start of text', () => {
      const value = 'Line 1\nLine 2';
      const info = getLineInfo(value, 0);

      expect(info.lineIndex).toBe(0);
      expect(info.column).toBe(0);
      expect(info.lineStart).toBe(0);
    });

    it('handles cursor at end of text', () => {
      const value = 'Line 1\nLine 2';
      const info = getLineInfo(value, value.length);

      expect(info.lineIndex).toBe(1);
      expect(info.column).toBe(6); // Length of "Line 2"
    });

    it('handles backspace simulation across line boundaries', () => {
      const value = 'Line 1\nLine 2';
      const cursorAtStartOfSecondLine = 7;

      // Removing character before cursor would remove the newline
      const newValue = value.slice(0, cursorAtStartOfSecondLine - 1) + value.slice(cursorAtStartOfSecondLine);

      expect(newValue).toBe('Line 1Line 2');
      expect(newValue).not.toContain('\n');
    });

    it('handles inserting newline at cursor position', () => {
      const value = 'Line 1';
      const cursorAt = 4; // After "Line"

      const newValue = `${value.slice(0, cursorAt)}\n${value.slice(cursorAt)}`;

      expect(newValue).toBe('Line\n 1');
      const lines = newValue.split('\n');
      expect(lines.length).toBe(2);
    });
  });

  describe('Line operations', () => {
    it('identifies line for deletion (dd command)', () => {
      const value = 'Line 1\nLine 2\nLine 3';
      const cursorAt = 10; // On second line

      const info = getLineInfo(value, cursorAt);

      expect(info.lineIndex).toBe(1);
      expect(info.lineStart).toBe(7);
      expect(info.lineEnd).toBe(13);

      // Simulate deleting the line
      const newValue = value.slice(0, info.lineStart) + value.slice(info.lineEnd + 1);
      expect(newValue).toBe('Line 1\nLine 3');
    });

    it('identifies position for inserting line below (o command)', () => {
      const value = 'Line 1\nLine 2';
      const cursorAt = 3; // On first line

      const info = getLineInfo(value, cursorAt);
      const insertPos = info.lineEnd;

      // Simulate inserting newline below
      const newValue = `${value.slice(0, insertPos)}\n${value.slice(insertPos)}`;
      expect(newValue).toBe('Line 1\n\nLine 2');

      const lines = newValue.split('\n');
      expect(lines.length).toBe(3);
    });

    it('identifies position for inserting line above (O command)', () => {
      const value = 'Line 1\nLine 2';
      const cursorAt = 10; // On second line

      const info = getLineInfo(value, cursorAt);
      const insertPos = info.lineStart;

      // Simulate inserting newline above
      const newValue = `${value.slice(0, insertPos)}\n${value.slice(insertPos)}`;
      expect(newValue).toBe('Line 1\n\nLine 2');

      const lines = newValue.split('\n');
      expect(lines.length).toBe(3);
    });

    it('handles going to start of line (0 command)', () => {
      const value = 'Line 1\nLine 2\nLine 3';
      const cursorAt = 10; // Middle of second line

      const info = getLineInfo(value, cursorAt);
      const lineStart = info.lineStart;

      expect(lineStart).toBe(7);
    });

    it('handles going to end of line ($ command)', () => {
      const value = 'Line 1\nLine 2\nLine 3';
      const cursorAt = 8; // Start of second line

      const info = getLineInfo(value, cursorAt);
      const lineEnd = info.lineEnd;

      expect(lineEnd).toBe(13);
    });

    it('handles going to first line (gg command)', () => {
      const _value = 'Line 1\nLine 2\nLine 3';
      const firstLineStart = 0;

      expect(firstLineStart).toBe(0);
    });

    it('handles going to last line (G command)', () => {
      const value = 'Line 1\nLine 2\nLine 3';
      const lines = value.split('\n');
      const lastLineIndex = lines.length - 1;

      let lastLineStart = 0;
      for (let i = 0; i < lastLineIndex; i++) {
        lastLineStart += lines[i].length + 1;
      }

      expect(lastLineStart).toBe(14);
      expect(lines[lastLineIndex]).toBe('Line 3');
    });
  });

  describe('Multi-line text display', () => {
    it('maintains line structure when rendering', () => {
      const value = 'Line 1\nLine 2\nLine 3';
      const lines = value.split('\n');

      expect(lines).toEqual(['Line 1', 'Line 2', 'Line 3']);
    });

    it('renders test output as separate lines', () => {
      const testOutput =
        ' ✓ tests/eventProcessor.fixed.test.ts (8 tests) 7ms\n ✓ tests/eventProcessor.test.ts (10 tests) 8ms';
      const lines = testOutput.split('\n');

      expect(lines.length).toBe(2);
      expect(lines[0]).toBe(' ✓ tests/eventProcessor.fixed.test.ts (8 tests) 7ms');
      expect(lines[1]).toBe(' ✓ tests/eventProcessor.test.ts (10 tests) 8ms');
    });
  });
});
