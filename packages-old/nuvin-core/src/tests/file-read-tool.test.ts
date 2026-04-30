import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { FileReadTool } from '../tools/FileReadTool.js';
import { promises as fs } from 'fs';
import * as path from 'path';
import * as os from 'os';

describe('FileReadTool', () => {
  let tmpDir: string;
  let tool: FileReadTool;

  beforeAll(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'file-read-test-'));
    tool = new FileReadTool({ rootDir: tmpDir });
  });

  afterAll(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  describe('basic file reading', () => {
    it('should read entire file', async () => {
      const filePath = path.join(tmpDir, 'test.txt');
      await fs.writeFile(filePath, 'Hello World');

      const result = await tool.execute({ path: 'test.txt' });

      expect(result.status).toBe('success');
      expect(result.result).toBe('Hello World');
      expect(result.metadata?.path).toBe('test.txt');
    });

    it('should return error for non-existent file', async () => {
      const result = await tool.execute({ path: 'nonexistent.txt' });

      expect(result.status).toBe('error');
      expect(result.result).toContain('not found');
    });

    it('should handle empty files', async () => {
      const filePath = path.join(tmpDir, 'empty.txt');
      await fs.writeFile(filePath, '');

      const result = await tool.execute({ path: 'empty.txt' });

      expect(result.status).toBe('success');
      expect(result.result).toBe('');
    });
  });

  describe('line range reading', () => {
    beforeAll(async () => {
      const filePath = path.join(tmpDir, 'lines.txt');
      const content = Array.from({ length: 10 }, (_, i) => `Line ${i + 1}`).join('\n');
      await fs.writeFile(filePath, content);
    });

    it('should read specific line range', async () => {
      const result = await tool.execute({
        path: 'lines.txt',
        lineStart: 3,
        lineEnd: 5,
      });

      expect(result.status).toBe('success');
      expect(result.result).toBe('3│Line 3\n4│Line 4\n5│Line 5');
      expect(result.metadata?.lineRange?.lineStart).toBe(3);
      expect(result.metadata?.lineRange?.lineEnd).toBe(5);
      expect(result.metadata?.lineRange?.linesTotal).toBe(10);
    });

    it('should read from start when only lineEnd specified', async () => {
      const result = await tool.execute({
        path: 'lines.txt',
        lineEnd: 3,
      });

      expect(result.status).toBe('success');
      expect(result.result).toBe('1│Line 1\n2│Line 2\n3│Line 3');
      expect(result.metadata?.lineRange?.lineStart).toBe(1);
      expect(result.metadata?.lineRange?.lineEnd).toBe(3);
    });

    it('should read to end when only lineStart specified', async () => {
      const result = await tool.execute({
        path: 'lines.txt',
        lineStart: 8,
      });

      expect(result.status).toBe('success');
      expect(result.result).toBe('8│Line 8\n9│Line 9\n10│Line 10');
      expect(result.metadata?.lineRange?.lineStart).toBe(8);
      expect(result.metadata?.lineRange?.lineEnd).toBe(10);
    });

    it('should handle reversed line ranges', async () => {
      const result = await tool.execute({
        path: 'lines.txt',
        lineStart: 5,
        lineEnd: 3,
      });

      expect(result.status).toBe('success');
      expect(result.result).toBe('3│Line 3\n4│Line 4\n5│Line 5');
    });

    it('should clamp out-of-bounds line numbers', async () => {
      const result = await tool.execute({
        path: 'lines.txt',
        lineStart: 8,
        lineEnd: 100,
      });

      expect(result.status).toBe('success');
      expect(result.metadata?.lineRange?.lineEnd).toBe(10);
    });

    it('should handle single line read', async () => {
      const result = await tool.execute({
        path: 'lines.txt',
        lineStart: 5,
        lineEnd: 5,
      });

      expect(result.status).toBe('success');
      expect(result.result).toBe('5│Line 5');
    });
  });

  describe('metadata', () => {
    it('should include created and modified timestamps', async () => {
      const filePath = path.join(tmpDir, 'metadata-test.txt');
      await fs.writeFile(filePath, 'test content');

      const result = await tool.execute({ path: 'metadata-test.txt' });

      expect(result.status).toBe('success');
      expect(result.metadata?.created).toBeDefined();
      expect(result.metadata?.modified).toBeDefined();

      const created = new Date(result.metadata!.created as string);
      const modified = new Date(result.metadata!.modified as string);

      expect(created).toBeInstanceOf(Date);
      expect(modified).toBeInstanceOf(Date);
      expect(created.getTime()).not.toBeNaN();
      expect(modified.getTime()).not.toBeNaN();
    });

    it('should update modified timestamp after file change', async () => {
      const filePath = path.join(tmpDir, 'mtime-test.txt');
      await fs.writeFile(filePath, 'original');

      const result1 = await tool.execute({ path: 'mtime-test.txt' });
      const modified1 = result1.metadata!.modified as string;

      await new Promise((resolve) => setTimeout(resolve, 10));
      await fs.writeFile(filePath, 'updated');

      const result2 = await tool.execute({ path: 'mtime-test.txt' });
      const modified2 = result2.metadata!.modified as string;

      expect(new Date(modified2).getTime()).toBeGreaterThanOrEqual(new Date(modified1).getTime());
    });
  });

  describe('multiline content', () => {
    it('should handle files with various line endings', async () => {
      const filePath = path.join(tmpDir, 'line-endings.txt');
      await fs.writeFile(filePath, 'Line 1\nLine 2\r\nLine 3\n');

      const result = await tool.execute({ path: 'line-endings.txt' });

      expect(result.status).toBe('success');
      expect(result.result).toContain('Line 1');
      expect(result.result).toContain('Line 2');
      expect(result.result).toContain('Line 3');
    });

    it('should preserve empty lines', async () => {
      const filePath = path.join(tmpDir, 'empty-lines.txt');
      await fs.writeFile(filePath, 'Line 1\n\nLine 3\n\n\nLine 6');

      const result = await tool.execute({
        path: 'empty-lines.txt',
        lineStart: 1,
        lineEnd: 6,
      });

      expect(result.status).toBe('success');
      const lines = result.result.split('\n');
      expect(lines).toHaveLength(6);
      expect(lines[1]).toBe('2│');
      expect(lines[3]).toBe('4│');
    });
  });

  describe('UTF-8 and BOM handling', () => {
    it('should strip UTF-8 BOM', async () => {
      const filePath = path.join(tmpDir, 'bom.txt');
      await fs.writeFile(filePath, '\uFEFFHello');

      const result = await tool.execute({ path: 'bom.txt' });

      expect(result.status).toBe('success');
      expect(result.result).toBe('Hello');
      expect(result.result.charCodeAt(0)).not.toBe(0xfeff);
    });

    it('should handle unicode content', async () => {
      const filePath = path.join(tmpDir, 'unicode.txt');
      await fs.writeFile(filePath, 'Hello 世界 🌍');

      const result = await tool.execute({ path: 'unicode.txt' });

      expect(result.status).toBe('success');
      expect(result.result).toBe('Hello 世界 🌍');
    });
  });

  describe('file size limits', () => {
    it('should reject files exceeding hard limit', async () => {
      const tmpDir2 = await fs.mkdtemp(path.join(os.tmpdir(), 'small-limit-'));
      const smallTool = new FileReadTool({
        rootDir: tmpDir2,
        maxBytesDefault: 50,
        maxBytesHard: 50,
      });

      const filePath = path.join(tmpDir2, 'large.txt');
      await fs.writeFile(filePath, 'x'.repeat(200));

      const result = await smallTool.execute({ path: 'large.txt' });

      await fs.rm(tmpDir2, { recursive: true, force: true });

      expect(result.status).toBe('success');
      expect(result.result).toContain('<system-reminder>');
      expect(result.result).toContain('File too large to read in full');
      expect(result.metadata?.truncated).toBe(true);
    });
  });

  describe('path safety', () => {
    it('should reject path traversal attempts', async () => {
      const result = await tool.execute({ path: '../../../etc/passwd' });

      expect(result.status).toBe('error');
      expect(result.result).toContain('escapes workspace');
    });

    it('should reject absolute paths by default', async () => {
      const result = await tool.execute({ path: '/etc/passwd' });

      expect(result.status).toBe('error');
    });
  });

  describe('content truncation', () => {
    // Helper: generate content larger than 20KB threshold
    // ~100 bytes per line × 250 lines ≈ 25KB
    function makeLargeContent(lineCount: number) {
      return Array.from({ length: lineCount }, (_, i) => `Line ${i + 1}: ${'x'.repeat(80)}`).join('\n');
    }

    it('should truncate full-file reads exceeding 20KB', async () => {
      const filePath = path.join(tmpDir, 'big.txt');
      const content = makeLargeContent(250);
      await fs.writeFile(filePath, content);

      const result = await tool.execute({ path: 'big.txt' });

      expect(result.status).toBe('success');
      expect(result.result).toContain('<system-reminder>');
      expect(result.result).toContain('Use lineStart/lineEnd parameters to read specific sections');
      expect(result.metadata?.truncated).toBe(true);
      expect(result.metadata?.totalLines).toBe(250);
    });

    it('should not truncate small files', async () => {
      const filePath = path.join(tmpDir, 'small-file.txt');
      await fs.writeFile(filePath, 'small content');

      const result = await tool.execute({ path: 'small-file.txt' });

      expect(result.status).toBe('success');
      expect(result.result).toBe('small content');
      expect(result.metadata?.truncated).toBe(false);
      expect(result.result).not.toContain('<system-reminder>');
    });

    it('should not truncate when lineStart/lineEnd is specified on a large file', async () => {
      const filePath = path.join(tmpDir, 'big-range.txt');
      await fs.writeFile(filePath, makeLargeContent(250));

      const result = await tool.execute({ path: 'big-range.txt', lineStart: 1, lineEnd: 10 });

      expect(result.status).toBe('success');
      expect(result.result).not.toContain('<system-reminder>');
    });

    it('should truncate on line boundaries (not mid-line)', async () => {
      const filePath = path.join(tmpDir, 'uniform-lines.txt');
      // 300 lines of exactly 100 chars each → 30KB
      const lineContent = 'A'.repeat(100);
      const content = Array.from({ length: 300 }, () => lineContent).join('\n');
      await fs.writeFile(filePath, content);

      const result = await tool.execute({ path: 'uniform-lines.txt' });

      expect(result.status).toBe('success');
      expect(result.metadata?.truncated).toBe(true);
      // Content before the system-reminder should only have complete lines
      const contentBeforeReminder = result.result.split('\n\n<system-reminder>')[0];
      const truncatedLines = contentBeforeReminder.split('\n');
      for (const line of truncatedLines) {
        expect(line.length).toBe(100);
      }
    });

    it('should include total line count in truncation message', async () => {
      const filePath = path.join(tmpDir, 'big-msg.txt');
      await fs.writeFile(filePath, makeLargeContent(500));

      const result = await tool.execute({ path: 'big-msg.txt' });

      expect(result.status).toBe('success');
      expect(result.result).toContain('500 lines');
      expect(result.metadata?.truncated).toBe(true);
      expect(result.metadata?.totalLines).toBe(500);
    });

    it('should not truncate a file just under 20KB', async () => {
      const filePath = path.join(tmpDir, 'under-limit.txt');
      await fs.writeFile(filePath, 'x'.repeat(19_000));

      const result = await tool.execute({ path: 'under-limit.txt' });

      expect(result.status).toBe('success');
      expect(result.metadata?.truncated).toBe(false);
      expect(result.result).not.toContain('<system-reminder>');
    });
  });
});
