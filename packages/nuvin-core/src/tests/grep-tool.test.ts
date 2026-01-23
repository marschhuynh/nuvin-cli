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

    writeFileSync(path.join(testDir, 'index.ts'), `
export function greet(name: string) {
  return \`Hello, \${name}!\`;
}

export function farewell(name: string) {
  return \`Goodbye, \${name}!\`;
}
`);

    writeFileSync(path.join(testDir, 'config.json'), `{
  "name": "test-project",
  "version": "1.0.0"
}`);

    writeFileSync(path.join(testDir, 'src', 'utils.ts'), `
// TODO: Implement this function
export function formatDate(date: Date) {
  return date.toISOString();
}

// FIXME: Handle edge cases
export function parseNumber(str: string) {
  return parseInt(str, 10);
}
`);

    writeFileSync(path.join(testDir, 'src', 'main.js'), `
function greet(name) {
  console.log("Hello, " + name);
}
`);
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
      expect(result.result).toContain('Directory not found');
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
});
