import { describe, it, expect, vi } from 'vitest';
import {
  toolSchemas,
  validateToolParams,
  bashToolSchema,
  fileReadSchema,
  globToolSchema,
  grepToolSchema,
  memoryExtractSchema,
} from '../tools/tool-validators.js';
import type { ToolName } from '../tools/tool-params.js';

describe('Tool Validators - Zod Schemas', () => {
  describe('bashToolSchema', () => {
    it('should validate valid bash tool params', () => {
      const result = bashToolSchema.safeParse({
        cmd: 'echo "hello"',
        cwd: '/tmp',
        timeoutMs: 5000,
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.cmd).toBe('echo "hello"');
        expect(result.data.cwd).toBe('/tmp');
        expect(result.data.timeoutMs).toBe(5000);
      }
    });

    it('should reject missing cmd', () => {
      const result = bashToolSchema.safeParse({});
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].message).toContain('cmd must be a non-empty string');
      }
    });

    it('should reject invalid timeout', () => {
      const result = bashToolSchema.safeParse({
        cmd: 'test',
        timeoutMs: -1,
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].message).toContain('must be positive');
      }
    });
  });

  describe('fileReadSchema', () => {
    it('should validate valid file read params', () => {
      const result = fileReadSchema.safeParse({
        path: '/path/to/file.ts',
        lineStart: 1,
        lineEnd: 10,
      });
      expect(result.success).toBe(true);
    });

    it('should reject missing path', () => {
      const result = fileReadSchema.safeParse({});
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].message).toContain('path must be a non-empty string');
      }
    });
  });

  describe('globToolSchema', () => {
    it('should validate valid glob params', () => {
      const result = globToolSchema.safeParse({
        pattern: '*.ts',
        path: 'src',
      });
      expect(result.success).toBe(true);
    });

    it('should reject missing pattern', () => {
      const result = globToolSchema.safeParse({});
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].message).toContain('pattern must be a non-empty string');
      }
    });
  });

  describe('grepToolSchema', () => {
    it('should validate valid grep params', () => {
      const result = grepToolSchema.safeParse({
        pattern: 'function',
        include: '*.ts',
      });
      expect(result.success).toBe(true);
    });

    it('should reject missing pattern', () => {
      const result = grepToolSchema.safeParse({});
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].message).toContain('pattern must be a non-empty string');
      }
    });
  });

  describe('memoryExtractSchema', () => {
    it('should validate valid memory extract params', () => {
      const result = memoryExtractSchema.safeParse({
        scope: 'project',
        maxMessages: 12,
        minSimilarityScore: 0.35,
      });
      expect(result.success).toBe(true);
    });

    it('should reject invalid maxMessages', () => {
      const result = memoryExtractSchema.safeParse({
        maxMessages: 0,
      });
      expect(result.success).toBe(false);
    });
  });
});

describe('validateToolParams', () => {
  it('should validate bash_tool params', () => {
    const result = validateToolParams('bash_tool', { cmd: 'test' });
    expect(result.valid).toBe(true);
    if (result.valid) {
      expect(result.data.cmd).toBe('test');
    }
  });

  it('should validate file_read params', () => {
    const result = validateToolParams('file_read', { path: '/file.ts' });
    expect(result.valid).toBe(true);
    if (result.valid) {
      expect(result.data.path).toBe('/file.ts');
    }
  });

  it('should validate glob_tool params', () => {
    const result = validateToolParams('glob_tool', { pattern: '*.ts' });
    expect(result.valid).toBe(true);
    if (result.valid) {
      expect(result.data.pattern).toBe('*.ts');
    }
  });

  it('should validate grep params', () => {
    const result = validateToolParams('grep_tool', { pattern: 'test' });
    expect(result.valid).toBe(true);
    if (result.valid) {
      expect(result.data.pattern).toBe('test');
    }
  });

  it('should validate memory_extract params', () => {
    const result = validateToolParams('memory_extract', { scope: 'project', maxMessages: 10 });
    expect(result.valid).toBe(true);
    if (result.valid) {
      expect(result.data.scope).toBe('project');
    }
  });

  it('should return errors for invalid params', () => {
    const result = validateToolParams('bash_tool', {});
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0]).toMatch(/cmd:/);
    }
  });

  it('should return valid for unknown tool name', () => {
    const result = validateToolParams('unknown_tool' as ToolName, { param: 'value' });
    expect(result.valid).toBe(true);
  });

  it('should format zod errors properly', () => {
    const result = validateToolParams('bash_tool', { cmd: 123 });
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0]).toMatch(/cmd: cmd must be a non-empty string/);
    }
  });
});
