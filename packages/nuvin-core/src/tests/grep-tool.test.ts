import { describe, it, expect, beforeAll } from 'vitest';
import { GrepTool } from '../tools/GrepTool.js';
import * as Ripgrep from '../tools/ripgrep.js';
import * as path from 'node:path';
import * as os from 'node:os';
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';

describe('GrepTool', () => {
  const tool = new GrepTool({ allowAbsolute: true });
  let testDir: string;

  beforeAll(async () => {
    await Ripgrep.filepath();

    testDir = path.join(os.tmpdir(), `grep-tool-test-${Date.now()}`);
    mkdirSync(testDir, { recursive: true });
    mkdirSync(path.join(testDir, 'src'), { recursive: true });

    writeFileSync(
      path.join(testDir, 'index.ts'),
      `
export function greet(name: string) {
  return \`Hello, \${name}!\`;
}

export function farewell(name: string) {
  return \`Goodbye, \${name}!\`;
}
`,
    );

    writeFileSync(
      path.join(testDir, 'config.json'),
      `{
  "name": "test-project",
  "version": "1.0.0"
}`,
    );

    writeFileSync(
      path.join(testDir, 'src', 'utils.ts'),
      `
// TODO: Implement this function
export function formatDate(date: Date) {
  return date.toISOString();
}

// FIXME: Handle edge cases
export function parseNumber(str: string) {
  return parseInt(str, 10);
}
`,
    );

    writeFileSync(
      path.join(testDir, 'src', 'main.js'),
      `
function greet(name) {
  console.log("Hello, " + name);
}
`,
    );
  }, 60000);

  describe('basic pattern matching', () => {
    it('should find matches for simple pattern', async () => {
      const result = await tool.execute({ pattern: 'greet', path: testDir });
      expect(result.status).toBe('success');
      expect(result.result).toContain('greet');
      expect(result.metadata?.matchCount).toBeGreaterThan(0);
    });

    it('should find matches with regex pattern', async () => {
      const result = await tool.execute({ pattern: 'function.*greet', path: testDir });
      expect(result.status).toBe('success');
      expect(result.result).toContain('function');
      expect(result.result).toContain('greet');
    });

    it('should find TODO/FIXME comments', async () => {
      const result = await tool.execute({ pattern: 'TODO|FIXME', path: testDir });
      expect(result.status).toBe('success');
      expect(result.result).toContain('TODO');
      expect(result.result).toContain('FIXME');
    });
  });

  describe('file filtering', () => {
    it('should filter by file pattern with include', async () => {
      const result = await tool.execute({ pattern: 'greet', path: testDir, include: '*.ts' });
      expect(result.status).toBe('success');
      expect(result.result).toContain('index.ts');
      expect(result.result).not.toContain('main.js');
    });

    it('should filter by multiple extensions with include', async () => {
      const result = await tool.execute({ pattern: 'greet', path: testDir, include: '*.{ts,js}' });
      expect(result.status).toBe('success');
      expect(result.metadata?.matchCount).toBeGreaterThan(0);
    });
  });

  describe('error handling', () => {
    it('should return error for missing pattern', async () => {
      const result = await tool.execute({ pattern: '' });
      expect(result.status).toBe('error');
      expect(result.result).toContain('pattern is required');
    });

    it('should return error for non-existent directory', async () => {
      const result = await tool.execute({ pattern: 'test', path: '/nonexistent/path/12345' });
      expect(result.status).toBe('error');
      expect(result.result).toContain('not found');
    });

    it('should return error for non-existent file', async () => {
      const result = await tool.execute({ pattern: 'test', path: path.join(testDir, 'nonexistent.ts') });
      expect(result.status).toBe('error');
      expect(result.result).toContain('not found');
    });
  });

  describe('single file search', () => {
    it('should search within a single file', async () => {
      const result = await tool.execute({
        pattern: 'greet',
        path: path.join(testDir, 'index.ts'),
      });
      expect(result.status).toBe('success');
      expect(result.result).toContain('greet');
      expect(result.metadata?.fileCount).toBe(1);
    });

    it('should find matches with anchors in single file', async () => {
      const result = await tool.execute({
        pattern: '^export',
        path: path.join(testDir, 'index.ts'),
      });
      expect(result.status).toBe('success');
      expect(result.result).toContain('export');
      expect(result.metadata?.matchCount).toBeGreaterThan(0);
    });

    it('should return no matches when pattern not found in file', async () => {
      const result = await tool.execute({
        pattern: 'nonexistentpattern12345',
        path: path.join(testDir, 'index.ts'),
      });
      expect(result.status).toBe('success');
      expect(result.result).toContain('No matches found');
    });

    it('should ignore include param when searching single file', async () => {
      const result = await tool.execute({
        pattern: 'greet',
        path: path.join(testDir, 'index.ts'),
        include: '*.js', // Should be ignored for single file
      });
      expect(result.status).toBe('success');
      expect(result.result).toContain('greet');
    });

    it('should respect limit param for single file', async () => {
      const result = await tool.execute({
        pattern: 'function|export',
        path: path.join(testDir, 'index.ts'),
        limit: 2,
      });
      expect(result.status).toBe('success');
      expect(result.metadata?.matchCount).toBeLessThanOrEqual(2);
    });
  });

  describe('output format', () => {
    it('should return match count in metadata', async () => {
      const result = await tool.execute({ pattern: 'function', path: testDir });
      expect(result.status).toBe('success');
      expect(result.metadata?.matchCount).toBeGreaterThan(0);
    });

    it('should return file count in metadata', async () => {
      const result = await tool.execute({ pattern: 'greet', path: testDir });
      expect(result.status).toBe('success');
      expect(result.metadata?.fileCount).toBeGreaterThan(0);
    });

    it('should include line numbers in output', async () => {
      const result = await tool.execute({ pattern: 'greet', path: testDir });
      expect(result.status).toBe('success');
      expect(result.result).toMatch(/Line \d+:/);
    });

    it('should indicate no matches found', async () => {
      const result = await tool.execute({ pattern: 'nonexistentpattern12345', path: testDir });
      expect(result.status).toBe('success');
      expect(result.result).toContain('No matches found');
    });

    it('should respect limit parameter', async () => {
      const result = await tool.execute({ pattern: 'function|greet', path: testDir, limit: 2 });
      expect(result.status).toBe('success');
      expect(result.metadata?.matchCount).toBeLessThanOrEqual(2);
    });
  });

  describe('definition', () => {
    it('should return valid tool definition', () => {
      const def = tool.definition();
      expect(def.name).toBe('grep_tool');
      expect(def.description).toContain('regex pattern');
      expect(def.parameters.required).toContain('pattern');
    });
  });

  describe('context lines', () => {
    it('should return context lines around matches', async () => {
      const result = await tool.execute({
        pattern: 'formatDate',
        path: path.join(testDir, 'src', 'utils.ts'),
        context: 2,
      });
      expect(result.status).toBe('success');
      // Should include surrounding lines
      expect(result.result).toContain('TODO');
      expect(result.result).toContain('formatDate');
    });

    it('should mark match lines with > prefix', async () => {
      const result = await tool.execute({
        pattern: 'formatDate',
        path: path.join(testDir, 'src', 'utils.ts'),
        context: 1,
      });
      expect(result.status).toBe('success');
      expect(result.result).toMatch(/> Line \d+:.*formatDate/);
    });

    it('should mark context lines with space prefix', async () => {
      const result = await tool.execute({
        pattern: 'formatDate',
        path: path.join(testDir, 'src', 'utils.ts'),
        context: 1,
      });
      expect(result.status).toBe('success');
      // Context lines should have space prefix, not >
      const lines = result.result.split('\n');
      const contextLines = lines.filter((l) => l.startsWith('  Line'));
      expect(contextLines.length).toBeGreaterThan(0);
    });

    it('should count only actual matches, not context lines', async () => {
      const result = await tool.execute({
        pattern: 'formatDate',
        path: path.join(testDir, 'src', 'utils.ts'),
        context: 2,
      });
      expect(result.status).toBe('success');
      // Should only count the actual match, not context lines
      expect(result.metadata?.matchCount).toBe(1);
    });

    it('should work with context in directory search', async () => {
      const result = await tool.execute({
        pattern: 'greet',
        path: testDir,
        include: '*.ts',
        context: 1,
      });
      expect(result.status).toBe('success');
      expect(result.result).toContain('greet');
    });
  });
});
