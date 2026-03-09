import { describe, it, expect } from 'vitest';

function computeLineStarts(value: string): number[] {
  const starts = [0];
  for (let i = 0; i < value.length; i++) {
    if (value[i] === '\n') {
      starts.push(i + 1);
    }
  }
  return starts;
}

function getLineInfo(value: string, lineStarts: number[], offset: number) {
  const clampedOffset = Math.max(0, Math.min(offset, value.length));

  let low = 0;
  let high = lineStarts.length - 1;

  while (low < high) {
    const mid = Math.ceil((low + high + 1) / 2);
    if (lineStarts[mid] <= clampedOffset) {
      low = mid;
    } else {
      high = mid - 1;
    }
  }

  const lineIndex = low;
  const lineStart = lineStarts[lineIndex];
  const lineEnd = lineIndex < lineStarts.length - 1 ? lineStarts[lineIndex + 1] - 1 : value.length;

  const lines: string[] = [];
  for (let i = 0; i < lineStarts.length; i++) {
    const start = lineStarts[i];
    const end = i < lineStarts.length - 1 ? lineStarts[i + 1] - 1 : value.length;
    lines.push(value.slice(start, end));
  }

  return {
    lines,
    lineIndex,
    column: clampedOffset - lineStart,
    lineStart,
    lineEnd,
  };
}

function getLine(value: string, lineStarts: number[], index: number): string {
  if (index < 0 || index >= lineStarts.length) return '';
  const start = lineStarts[index];
  const end = index < lineStarts.length - 1 ? lineStarts[index + 1] - 1 : value.length;
  return value.slice(start, end);
}

function getLineRange(value: string, lineStarts: number[], startLine: number, endLine: number): string {
  if (startLine < 0 || startLine >= lineStarts.length) return '';
  if (endLine < startLine || endLine >= lineStarts.length) {
    endLine = lineStarts.length - 1;
  }

  const start = lineStarts[startLine];
  const end = endLine < lineStarts.length - 1 ? lineStarts[endLine + 1] - 1 : value.length;
  return value.slice(start, end);
}

describe('useLineIndex - pure function tests', () => {
  describe('computeLineStarts', () => {
    it('handles empty string', () => {
      const lineStarts = computeLineStarts('');
      expect(lineStarts).toEqual([0]);
    });

    it('handles single line', () => {
      const lineStarts = computeLineStarts('Hello World');
      expect(lineStarts).toEqual([0]);
    });

    it('handles multiple lines', () => {
      const lineStarts = computeLineStarts('Line 1\nLine 2\nLine 3');
      expect(lineStarts).toEqual([0, 7, 14]);
    });

    it('handles empty lines', () => {
      const lineStarts = computeLineStarts('Line 1\n\nLine 3');
      expect(lineStarts).toEqual([0, 7, 8]);
    });

    it('handles text ending with newline', () => {
      const lineStarts = computeLineStarts('Line 1\n');
      expect(lineStarts).toEqual([0, 7]);
    });
  });

  describe('getLineInfo', () => {
    it('returns correct info for first line', () => {
      const value = 'Line 1\nLine 2\nLine 3';
      const lineStarts = computeLineStarts(value);
      const info = getLineInfo(value, lineStarts, 3);

      expect(info.lineIndex).toBe(0);
      expect(info.column).toBe(3);
      expect(info.lineStart).toBe(0);
      expect(info.lineEnd).toBe(6);
      expect(info.lines).toEqual(['Line 1', 'Line 2', 'Line 3']);
    });

    it('returns correct info for second line', () => {
      const value = 'Line 1\nLine 2\nLine 3';
      const lineStarts = computeLineStarts(value);
      const info = getLineInfo(value, lineStarts, 10);

      expect(info.lineIndex).toBe(1);
      expect(info.column).toBe(3);
      expect(info.lineStart).toBe(7);
      expect(info.lineEnd).toBe(13);
    });

    it('returns correct info for last line', () => {
      const value = 'Line 1\nLine 2\nLine 3';
      const lineStarts = computeLineStarts(value);
      const info = getLineInfo(value, lineStarts, 17);

      expect(info.lineIndex).toBe(2);
      expect(info.column).toBe(3);
      expect(info.lineStart).toBe(14);
      expect(info.lineEnd).toBe(20);
    });

    it('handles position at newline boundary', () => {
      const value = 'Line 1\nLine 2';
      const lineStarts = computeLineStarts(value);
      const info = getLineInfo(value, lineStarts, 6);

      expect(info.lineIndex).toBe(0);
      expect(info.column).toBe(6);
    });

    it('handles empty line', () => {
      const value = 'Line 1\n\nLine 3';
      const lineStarts = computeLineStarts(value);
      const info = getLineInfo(value, lineStarts, 7);

      expect(info.lineIndex).toBe(1);
      expect(info.column).toBe(0);
      expect(info.lineStart).toBe(7);
      expect(info.lineEnd).toBe(7);
    });

    it('handles cursor at start', () => {
      const value = 'Line 1\nLine 2';
      const lineStarts = computeLineStarts(value);
      const info = getLineInfo(value, lineStarts, 0);

      expect(info.lineIndex).toBe(0);
      expect(info.column).toBe(0);
      expect(info.lineStart).toBe(0);
    });

    it('handles cursor at end', () => {
      const value = 'Line 1\nLine 2';
      const lineStarts = computeLineStarts(value);
      const info = getLineInfo(value, lineStarts, 13);

      expect(info.lineIndex).toBe(1);
      expect(info.column).toBe(6);
    });

    it('clamps offset beyond content', () => {
      const value = 'Line 1\nLine 2';
      const lineStarts = computeLineStarts(value);
      const info = getLineInfo(value, lineStarts, 100);

      expect(info.lineIndex).toBe(1);
    });

    it('clamps negative offset', () => {
      const value = 'Line 1\nLine 2';
      const lineStarts = computeLineStarts(value);
      const info = getLineInfo(value, lineStarts, -5);

      expect(info.lineIndex).toBe(0);
      expect(info.column).toBe(0);
    });
  });

  describe('getLine', () => {
    it('returns correct line content', () => {
      const value = 'Line 1\nLine 2\nLine 3';
      const lineStarts = computeLineStarts(value);

      expect(getLine(value, lineStarts, 0)).toBe('Line 1');
      expect(getLine(value, lineStarts, 1)).toBe('Line 2');
      expect(getLine(value, lineStarts, 2)).toBe('Line 3');
    });

    it('returns empty string for out of bounds index', () => {
      const value = 'Line 1\nLine 2';
      const lineStarts = computeLineStarts(value);

      expect(getLine(value, lineStarts, -1)).toBe('');
      expect(getLine(value, lineStarts, 5)).toBe('');
    });

    it('handles empty line', () => {
      const value = 'Line 1\n\nLine 3';
      const lineStarts = computeLineStarts(value);

      expect(getLine(value, lineStarts, 1)).toBe('');
    });
  });

  describe('getLineRange', () => {
    it('returns single line', () => {
      const value = 'Line 1\nLine 2\nLine 3';
      const lineStarts = computeLineStarts(value);

      expect(getLineRange(value, lineStarts, 0, 0)).toBe('Line 1');
      expect(getLineRange(value, lineStarts, 1, 1)).toBe('Line 2');
    });

    it('returns multiple lines', () => {
      const value = 'Line 1\nLine 2\nLine 3';
      const lineStarts = computeLineStarts(value);

      expect(getLineRange(value, lineStarts, 0, 1)).toBe('Line 1\nLine 2');
      expect(getLineRange(value, lineStarts, 0, 2)).toBe('Line 1\nLine 2\nLine 3');
    });

    it('handles out of bounds end', () => {
      const value = 'Line 1\nLine 2';
      const lineStarts = computeLineStarts(value);

      expect(getLineRange(value, lineStarts, 0, 10)).toBe('Line 1\nLine 2');
    });

    it('returns empty string for invalid start', () => {
      const value = 'Line 1\nLine 2';
      const lineStarts = computeLineStarts(value);

      expect(getLineRange(value, lineStarts, -1, 0)).toBe('');
      expect(getLineRange(value, lineStarts, 5, 6)).toBe('');
    });
  });

  describe('binary search correctness', () => {
    it('handles 100+ lines efficiently', () => {
      const lines = Array.from({ length: 100 }, (_, i) => `Line ${i + 1}`);
      const value = lines.join('\n');
      const lineStarts = computeLineStarts(value);

      expect(lineStarts.length).toBe(100);

      const info50 = getLineInfo(value, lineStarts, value.indexOf('Line 50'));
      expect(info50.lineIndex).toBe(49);

      const info99 = getLineInfo(value, lineStarts, value.indexOf('Line 99'));
      expect(info99.lineIndex).toBe(98);

      const info1 = getLineInfo(value, lineStarts, 0);
      expect(info1.lineIndex).toBe(0);
    });

    it('produces same results as original getLineInfo', () => {
      const testCases = [
        { value: 'Hello', offset: 3 },
        { value: 'Line 1\nLine 2', offset: 0 },
        { value: 'Line 1\nLine 2', offset: 6 },
        { value: 'Line 1\nLine 2', offset: 7 },
        { value: 'Line 1\nLine 2', offset: 13 },
        { value: 'Line 1\n\nLine 3', offset: 7 },
        { value: '\n\n\n', offset: 1 },
      ];

      for (const { value, offset } of testCases) {
        const lineStarts = computeLineStarts(value);
        const info = getLineInfo(value, lineStarts, offset);

        const originalLines = value.split('\n');
        let currentPos = 0;
        let expectedLineIndex = 0;

        for (let i = 0; i < originalLines.length; i++) {
          const lineEnd = currentPos + originalLines[i].length;
          if (offset <= lineEnd) {
            expectedLineIndex = i;
            break;
          }
          currentPos = lineEnd + 1;
        }

        expect(info.lineIndex).toBe(expectedLineIndex);
      }
    });
  });
});
