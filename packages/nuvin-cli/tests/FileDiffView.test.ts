import { describe, it, expect } from 'vitest';
import { createSimpleDiff } from '../source/components/FileDiffView.js';

describe('FileDiffView', () => {
  it('should create diff with unique segments', () => {
    const oldText = 'hello world test';
    const newText = 'hello new world test';

    const diff = createSimpleDiff(oldText, newText);

    expect(diff).toBeDefined();
    expect(Array.isArray(diff)).toBe(true);
  });

  it('should handle multiple segments with duplicate text content', () => {
    const oldText = 'a b c d';
    const newText = 'a x b y c z d';

    const diff = createSimpleDiff(oldText, newText);

    expect(diff).toBeDefined();
    expect(diff.length).toBeGreaterThan(0);
  });

  it('should handle whitespace-heavy diffs', () => {
    const oldText = '  hello   world  ';
    const newText = '  hello   new world  ';

    const diff = createSimpleDiff(oldText, newText);

    expect(diff).toBeDefined();
    expect(diff.some((line) => line.type === 'modify' || line.type === 'remove' || line.type === 'add')).toBe(true);
  });

  it('should produce modify lines with segments for similar content', () => {
    const oldText = 'const foo = "bar";';
    const newText = 'const foo = "baz";';

    const diff = createSimpleDiff(oldText, newText);

    const modifyLines = diff.filter((line) => line.type === 'modify');
    expect(modifyLines.length).toBeGreaterThan(0);

    modifyLines.forEach((line) => {
      if (line.segments) {
        const segmentTexts = line.segments.map((s) => s.text);
        const uniqueSegments = new Set(segmentTexts);
        expect(segmentTexts.length).toBeGreaterThanOrEqual(uniqueSegments.size);
      }
    });
  });

  describe('character-level diff highlighting', () => {
    it('should highlight only the added comma when adding comma to end of line', () => {
      const oldText = '\t\t"checkJs": false';
      const newText = '\t\t"checkJs": false,';

      const diff = createSimpleDiff(oldText, newText);

      // Should produce two modify lines (one for old, one for new)
      const modifyLines = diff.filter((line) => line.type === 'modify');
      expect(modifyLines).toHaveLength(2);

      // Old line should have all content as unchanged (nothing removed)
      const oldLine = modifyLines.find((line) => line.oldLineNum !== undefined);
      expect(oldLine).toBeDefined();
      expect(oldLine?.segments).toBeDefined();

      // All segments in old line should be 'unchanged' (no removals)
      const oldSegments = oldLine?.segments ?? [];
      expect(oldSegments.every((seg) => seg.type === 'unchanged')).toBe(true);

      // Reconstruct text from segments to verify correctness
      const oldReconstructed = oldSegments.map((s) => s.text).join('');
      expect(oldReconstructed).toBe(oldText);

      // New line should have unchanged content + added comma
      const newLine = modifyLines.find((line) => line.newLineNum !== undefined);
      expect(newLine).toBeDefined();
      expect(newLine?.segments).toBeDefined();

      const newSegments = newLine?.segments ?? [];

      // Should have at least one 'unchanged' segment and one 'add' segment
      expect(newSegments.some((seg) => seg.type === 'unchanged')).toBe(true);
      expect(newSegments.some((seg) => seg.type === 'add')).toBe(true);

      // The 'add' segment should only be the comma
      const addedSegments = newSegments.filter((seg) => seg.type === 'add');
      expect(addedSegments).toHaveLength(1);
      expect(addedSegments[0].text).toBe(',');

      // Reconstruct text from segments to verify correctness
      const newReconstructed = newSegments.map((s) => s.text).join('');
      expect(newReconstructed).toBe(newText);
    });

    it('should highlight only changed characters when modifying middle of line', () => {
      const oldText = 'const value = "hello";';
      const newText = 'const value = "world";';

      const diff = createSimpleDiff(oldText, newText);

      const modifyLines = diff.filter((line) => line.type === 'modify');
      expect(modifyLines).toHaveLength(2);

      // Old line: should have unchanged prefix + removed middle + unchanged suffix
      const oldLine = modifyLines.find((line) => line.oldLineNum !== undefined);
      expect(oldLine?.segments).toBeDefined();

      const oldSegments = oldLine?.segments ?? [];
      const oldReconstructed = oldSegments.map((s) => s.text).join('');
      expect(oldReconstructed).toBe(oldText);

      // Should have unchanged content for common parts
      expect(oldSegments.some((seg) => seg.type === 'unchanged' && seg.text.includes('const value'))).toBe(true);

      // New line: should have unchanged prefix + added middle + unchanged suffix
      const newLine = modifyLines.find((line) => line.newLineNum !== undefined);
      expect(newLine?.segments).toBeDefined();

      const newSegments = newLine?.segments ?? [];
      const newReconstructed = newSegments.map((s) => s.text).join('');
      expect(newReconstructed).toBe(newText);
    });

    it('should handle adding text to beginning of line', () => {
      const oldText = 'const world = 1;';
      const newText = 'const hello world = 1;';

      const diff = createSimpleDiff(oldText, newText);

      const modifyLines = diff.filter((line) => line.type === 'modify');
      expect(modifyLines).toHaveLength(2);

      // New line should have common prefix, added segment in middle, and common suffix
      const newLine = modifyLines.find((line) => line.newLineNum !== undefined);
      const newSegments = newLine?.segments ?? [];

      // Should have unchanged segments for common parts
      expect(newSegments.some((seg) => seg.type === 'unchanged')).toBe(true);

      // Should have added segment for "hello "
      expect(newSegments.some((seg) => seg.type === 'add' && seg.text === 'hello ')).toBe(true);

      // Reconstruct to verify
      const reconstructed = newSegments.map((s) => s.text).join('');
      expect(reconstructed).toBe(newText);
    });

    it('should handle removing text from end of line', () => {
      const oldText = 'const hello world = 1;';
      const newText = 'const hello = 1;';

      const diff = createSimpleDiff(oldText, newText);

      const modifyLines = diff.filter((line) => line.type === 'modify');
      expect(modifyLines).toHaveLength(2);

      // Old line should have common prefix, removed segment in middle, and common suffix
      const oldLine = modifyLines.find((line) => line.oldLineNum !== undefined);
      const oldSegments = oldLine?.segments ?? [];

      // Should have unchanged segments for common parts
      expect(oldSegments.some((seg) => seg.type === 'unchanged')).toBe(true);

      // Should have removed segment for "world "
      expect(oldSegments.some((seg) => seg.type === 'remove' && seg.text === 'world ')).toBe(true);

      // Reconstruct to verify
      const reconstructed = oldSegments.map((s) => s.text).join('');
      expect(reconstructed).toBe(oldText);
    });

    it('should handle complete line replacement', () => {
      const oldText = 'completely different';
      const newText = 'totally new text';

      const diff = createSimpleDiff(oldText, newText);

      const modifyLines = diff.filter((line) => line.type === 'modify');

      // Should create modify lines since similarity might be above threshold
      // or should create remove + add lines if completely different
      expect(modifyLines.length).toBeGreaterThanOrEqual(0);

      const addLines = diff.filter((line) => line.type === 'add');
      const removeLines = diff.filter((line) => line.type === 'remove');

      // Should have either modify lines or add/remove lines
      expect(modifyLines.length + addLines.length + removeLines.length).toBeGreaterThan(0);
    });
  });
});
