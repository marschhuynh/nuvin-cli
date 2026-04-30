import { describe, it, expect, beforeAll } from 'vitest';
import { GlobTool } from '../tools/GlobTool.js';
import * as Ripgrep from '../tools/ripgrep.js';
import * as path from 'node:path';
import * as os from 'node:os';
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';

describe('GlobTool', () => {
  const tool = new GlobTool({ allowAbsolute: true });
  let testDir: string;

  beforeAll(async () => {
    await Ripgrep.filepath();

    testDir = path.join(os.tmpdir(), `glob-tool-test-${Date.now()}`);
    mkdirSync(testDir, { recursive: true });
    mkdirSync(path.join(testDir, 'src'), { recursive: true });
    mkdirSync(path.join(testDir, 'lib'), { recursive: true });

    writeFileSync(path.join(testDir, 'index.ts'), 'export const a = 1;');
    writeFileSync(path.join(testDir, 'config.json'), '{}');
    writeFileSync(path.join(testDir, 'src', 'main.ts'), 'console.log("main");');
    writeFileSync(path.join(testDir, 'src', 'utils.ts'), 'export function util() {}');
    writeFileSync(path.join(testDir, 'src', 'helper.js'), 'module.exports = {};');
    writeFileSync(path.join(testDir, 'lib', 'lib.ts'), 'export const lib = 1;');
  }, 60000);

  describe('basic pattern matching', () => {
    it('should find files with *.ts pattern in directory', async () => {
      const result = await tool.execute({ pattern: '*.ts', path: testDir });
      expect(result.status).toBe('success');
      expect(result.result).toContain('index.ts');
      expect(result.result).not.toContain('config.json');
    });

    it('should find files recursively with **/*.ts pattern', async () => {
      const result = await tool.execute({ pattern: '**/*.ts', path: testDir });
      expect(result.status).toBe('success');
      expect(result.result).toContain('index.ts');
      expect(result.result).toContain('main.ts');
      expect(result.result).toContain('utils.ts');
      expect(result.result).toContain('lib.ts');
    });

    it('should find files in subdirectory with src/*.ts pattern', async () => {
      const result = await tool.execute({ pattern: 'src/*.ts', path: testDir });
      expect(result.status).toBe('success');
      expect(result.result).toContain('main.ts');
      expect(result.result).toContain('utils.ts');
      expect(result.result).not.toContain('index.ts');
    });

    it('should find json files', async () => {
      const result = await tool.execute({ pattern: '*.json', path: testDir });
      expect(result.status).toBe('success');
      expect(result.result).toContain('config.json');
    });
  });

  describe('error handling', () => {
    it('should return error for missing pattern', async () => {
      const result = await tool.execute({ pattern: '' });
      expect(result.status).toBe('error');
      expect(result.result).toContain('pattern is required');
    });

    it('should return error for non-existent directory', async () => {
      const result = await tool.execute({ pattern: '*.ts', path: '/nonexistent/path/12345' });
      expect(result.status).toBe('error');
      expect(result.result).toContain('Directory not found');
    });
  });

  describe('output format', () => {
    it('should return count in metadata', async () => {
      const result = await tool.execute({ pattern: '**/*.ts', path: testDir });
      expect(result.status).toBe('success');
      expect(result.metadata?.count).toBeGreaterThan(0);
    });

    it('should return truncated flag as false when under limit', async () => {
      const result = await tool.execute({ pattern: '**/*.ts', path: testDir });
      expect(result.status).toBe('success');
      expect(result.metadata?.truncated).toBe(false);
    });

    it('should indicate no files found', async () => {
      const result = await tool.execute({ pattern: '*.xyz', path: testDir });
      expect(result.status).toBe('success');
      expect(result.result).toContain('No files found');
    });
  });

  describe('definition', () => {
    it('should return valid tool definition', () => {
      const def = tool.definition();
      expect(def.name).toBe('glob_tool');
      expect(def.description).toContain('glob pattern');
      expect(def.parameters.required).toContain('pattern');
    });
  });
});
