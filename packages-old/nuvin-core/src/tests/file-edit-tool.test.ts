import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { promises as fs } from 'fs';
import * as path from 'path';
import * as os from 'os';
import { FileEditTool } from '../tools/FileEditTool';

const TMP_DIR = path.join(process.cwd(), 'tests', '__tmp__');

async function rimraf(p: string) {
  await fs.rm(p, { recursive: true, force: true });
}

beforeAll(async () => {
  await rimraf(TMP_DIR);
  await fs.mkdir(TMP_DIR, { recursive: true });
});

afterAll(async () => {
  await rimraf(TMP_DIR);
});

describe('FileEditTool', () => {
  // ===== BASIC EDIT TESTS =====

  describe('Basic editing', () => {
    it('replaces text in an existing file', async () => {
      const tool = new FileEditTool({ rootDir: process.cwd() });
      const relPath = path.join('tests', '__tmp__', 'basic-edit.txt');
      const abs = path.join(process.cwd(), relPath);
      await fs.writeFile(abs, 'hello world', 'utf8');

      const res = await tool.execute({
        file_path: relPath,
        old_text: 'world',
        new_text: 'universe',
      });

      expect(res.status).toBe('success');
      expect(res.result).toContain('Edit applied successfully');

      const data = await fs.readFile(abs, 'utf8');
      expect(data).toBe('hello universe');
    });

    it('replaces multiline text', async () => {
      const tool = new FileEditTool({ rootDir: process.cwd() });
      const relPath = path.join('tests', '__tmp__', 'multiline-edit.txt');
      const abs = path.join(process.cwd(), relPath);
      await fs.writeFile(abs, 'line1\nold line 2\nold line 3\nline4', 'utf8');

      const res = await tool.execute({
        file_path: relPath,
        old_text: 'old line 2\nold line 3',
        new_text: 'new line 2\nnew line 3',
      });

      expect(res.status).toBe('success');
      const data = await fs.readFile(abs, 'utf8');
      expect(data).toBe('line1\nnew line 2\nnew line 3\nline4');
    });

    it('deletes text by replacing with empty string', async () => {
      const tool = new FileEditTool({ rootDir: process.cwd() });
      const relPath = path.join('tests', '__tmp__', 'delete-text.txt');
      const abs = path.join(process.cwd(), relPath);
      await fs.writeFile(abs, 'keep this REMOVE_ME and this', 'utf8');

      const res = await tool.execute({
        file_path: relPath,
        old_text: 'REMOVE_ME ',
        new_text: '',
      });

      expect(res.status).toBe('success');
      const data = await fs.readFile(abs, 'utf8');
      expect(data).toBe('keep this and this');
    });

    it('adds text by replacing empty old_text', async () => {
      const tool = new FileEditTool({ rootDir: process.cwd() });
      const relPath = path.join('tests', '__tmp__', 'add-text.txt');
      const abs = path.join(process.cwd(), relPath);
      await fs.writeFile(abs, 'content', 'utf8');

      const res = await tool.execute({
        file_path: relPath,
        old_text: '',
        new_text: 'prefix',
      });

      expect(res.status).toBe('success');
      const data = await fs.readFile(abs, 'utf8');
      expect(data).toBe('prefixcontent');
    });

    it('preserves LF line endings', async () => {
      const tool = new FileEditTool({ rootDir: process.cwd() });
      const relPath = path.join('tests', '__tmp__', 'lf-preserve.txt');
      const abs = path.join(process.cwd(), relPath);
      await fs.writeFile(abs, 'line1\nold\nline3\n', 'utf8');

      const res = await tool.execute({
        file_path: relPath,
        old_text: 'old',
        new_text: 'new',
      });

      expect(res.status).toBe('success');
      const data = await fs.readFile(abs, 'utf8');
      expect(data).toBe('line1\nnew\nline3\n');
      expect(data).not.toContain('\r\n');
    });

    it('preserves CRLF line endings', async () => {
      const tool = new FileEditTool({ rootDir: process.cwd() });
      const relPath = path.join('tests', '__tmp__', 'crlf-preserve.txt');
      const abs = path.join(process.cwd(), relPath);
      await fs.writeFile(abs, 'line1\r\nold\r\nline3\r\n', 'utf8');

      const res = await tool.execute({
        file_path: relPath,
        old_text: 'old',
        new_text: 'new',
      });

      expect(res.status).toBe('success');
      const data = await fs.readFile(abs, 'utf8');
      expect(data).toBe('line1\r\nnew\r\nline3\r\n');
    });

    it('includes SHA hashes in metadata', async () => {
      const tool = new FileEditTool({ rootDir: process.cwd() });
      const relPath = path.join('tests', '__tmp__', 'sha-test.txt');
      const abs = path.join(process.cwd(), relPath);
      await fs.writeFile(abs, 'original content', 'utf8');

      const res = await tool.execute({
        file_path: relPath,
        old_text: 'original',
        new_text: 'modified',
      });

      expect(res.status).toBe('success');
      expect(res.metadata?.beforeSha).toBeTruthy();
      expect(res.metadata?.afterSha).toBeTruthy();
      expect(res.metadata?.beforeSha).not.toBe(res.metadata?.afterSha);
    });
  });

  // ===== DRY RUN AND NO-CHANGE TESTS =====

  describe('Dry run and no-change detection', () => {
    it('performs dry run without writing', async () => {
      const tool = new FileEditTool({ rootDir: process.cwd() });
      const relPath = path.join('tests', '__tmp__', 'dry-run.txt');
      const abs = path.join(process.cwd(), relPath);
      await fs.writeFile(abs, 'original content', 'utf8');

      const res = await tool.execute({
        file_path: relPath,
        old_text: 'original',
        new_text: 'changed',
        dry_run: true,
      });

      expect(res.status).toBe('success');
      expect(res.result).toContain('dry run');
      expect(res.metadata?.dryRun).toBe(true);

      const data = await fs.readFile(abs, 'utf8');
      expect(data).toBe('original content');
    });

    it('detects no changes when content is identical', async () => {
      const tool = new FileEditTool({ rootDir: process.cwd() });
      const relPath = path.join('tests', '__tmp__', 'no-change.txt');
      const abs = path.join(process.cwd(), relPath);
      await fs.writeFile(abs, 'same content', 'utf8');

      const res = await tool.execute({
        file_path: relPath,
        old_text: 'content',
        new_text: 'content',
      });

      expect(res.status).toBe('success');
      expect(res.result).toContain('No changes');
      expect(res.metadata?.bytesWritten).toBe(0);
    });
  });

  // ===== ERROR TESTS =====

  describe('Error handling', () => {
    it('errors when file does not exist', async () => {
      const tool = new FileEditTool({ rootDir: process.cwd() });
      const relPath = path.join('tests', '__tmp__', 'nonexistent.txt');

      const res = await tool.execute({
        file_path: relPath,
        old_text: 'old',
        new_text: 'new',
      });

      expect(res.status).toBe('error');
      expect(res.result).toContain('File does not exist');
    });

    it('errors when old_text is not found', async () => {
      const tool = new FileEditTool({ rootDir: process.cwd() });
      const relPath = path.join('tests', '__tmp__', 'not-found.txt');
      const abs = path.join(process.cwd(), relPath);
      await fs.writeFile(abs, 'actual content', 'utf8');

      const res = await tool.execute({
        file_path: relPath,
        old_text: 'nonexistent text',
        new_text: 'new',
      });

      expect(res.status).toBe('error');
      expect(res.result).toContain('old_text not found');
      expect(res.result).toContain('nonexistent text');
    });

    it('rejects result exceeding maxBytes', async () => {
      const tool = new FileEditTool({ rootDir: process.cwd(), maxBytes: 50 });
      const relPath = path.join('tests', '__tmp__', 'too-large.txt');
      const abs = path.join(process.cwd(), relPath);
      await fs.writeFile(abs, 'short', 'utf8');

      const res = await tool.execute({
        file_path: relPath,
        old_text: 'short',
        new_text: 'x'.repeat(100),
      });

      expect(res.status).toBe('error');
      expect(res.result).toContain('too large');
    });
  });

  // ===== PATH HANDLING TESTS =====

  describe('Path handling', () => {
    it('rejects paths escaping workspace root with ../', async () => {
      const tool = new FileEditTool({ rootDir: process.cwd() });
      const res = await tool.execute({
        file_path: path.join('..', 'outside.txt'),
        old_text: 'old',
        new_text: 'new',
      });

      expect(res.status).toBe('error');
      expect(String(res.result)).toMatch(/outside workspace root/i);
    });

    it('rejects absolute paths outside workspace root', async () => {
      const tool = new FileEditTool({ rootDir: process.cwd() });
      const res = await tool.execute({
        file_path: '/tmp/outside.txt',
        old_text: 'old',
        new_text: 'new',
      });

      expect(res.status).toBe('error');
      expect(String(res.result)).toMatch(/outside workspace root/i);
    });

    it('expands ~ to home directory', async () => {
      const tool = new FileEditTool({ rootDir: os.homedir() });
      const relPath = path.join('tmp-file-edit-test.txt');
      const abs = path.join(os.homedir(), relPath);
      await fs.writeFile(abs, 'tilde original', 'utf8');

      const res = await tool.execute({
        file_path: `~/${relPath}`,
        old_text: 'original',
        new_text: 'test',
      });

      expect(res.status).toBe('success');
      const data = await fs.readFile(abs, 'utf8');
      expect(data).toBe('tilde test');
      await fs.unlink(abs);
    });

    it('accepts absolute path within workspace root', async () => {
      const tool = new FileEditTool({ rootDir: process.cwd() });
      const abs = path.join(process.cwd(), 'tests', '__tmp__', 'absolute.txt');
      await fs.writeFile(abs, 'absolute original', 'utf8');

      const res = await tool.execute({
        file_path: abs,
        old_text: 'original',
        new_text: 'path',
      });

      expect(res.status).toBe('success');
      const data = await fs.readFile(abs, 'utf8');
      expect(data).toBe('absolute path');
    });
  });

  // ===== VALIDATION TESTS =====

  describe('Input validation', () => {
    it('rejects missing file_path', async () => {
      const tool = new FileEditTool({ rootDir: process.cwd() });
      const res = await tool.execute({
        file_path: '',
        old_text: 'old',
        new_text: 'new',
      });

      expect(res.status).toBe('error');
      expect(res.result).toContain('file_path');
    });

    it('rejects non-string old_text', async () => {
      const tool = new FileEditTool({ rootDir: process.cwd() });
      const res = await tool.execute({
        file_path: 'test.txt',
        old_text: 123 as any,
        new_text: 'new',
      });

      expect(res.status).toBe('error');
      expect(res.result).toContain('old_text must be a string');
    });

    it('rejects non-string new_text', async () => {
      const tool = new FileEditTool({ rootDir: process.cwd() });
      const res = await tool.execute({
        file_path: 'test.txt',
        old_text: 'old',
        new_text: 123 as any,
      });

      expect(res.status).toBe('error');
      expect(res.result).toContain('new_text must be a string');
    });

    it('rejects file exceeding maxBytes when reading', async () => {
      const tool = new FileEditTool({ rootDir: process.cwd(), maxBytes: 20 });
      const relPath = path.join('tests', '__tmp__', 'large-existing.txt');
      const abs = path.join(process.cwd(), relPath);
      await fs.writeFile(abs, 'x'.repeat(50), 'utf8');

      const res = await tool.execute({
        file_path: relPath,
        old_text: 'x',
        new_text: 'y',
      });

      expect(res.status).toBe('error');
      expect(res.result).toContain('File too large');
    });
  });

  // ===== EDGE CASES =====

  describe('Edge cases', () => {
    it('handles file with no line endings', async () => {
      const tool = new FileEditTool({ rootDir: process.cwd() });
      const relPath = path.join('tests', '__tmp__', 'no-eol.txt');
      const abs = path.join(process.cwd(), relPath);
      await fs.writeFile(abs, 'no newline', 'utf8');

      const res = await tool.execute({
        file_path: relPath,
        old_text: 'newline',
        new_text: 'linebreak',
      });

      expect(res.status).toBe('success');
      const out = await fs.readFile(abs, 'utf8');
      expect(out).toBe('no linebreak');
    });

    it('handles Unicode content', async () => {
      const tool = new FileEditTool({ rootDir: process.cwd() });
      const relPath = path.join('tests', '__tmp__', 'unicode.txt');
      const abs = path.join(process.cwd(), relPath);
      await fs.writeFile(abs, 'Hello 世界 🌍', 'utf8');

      const res = await tool.execute({
        file_path: relPath,
        old_text: '世界',
        new_text: 'World',
      });

      expect(res.status).toBe('success');
      const data = await fs.readFile(abs, 'utf8');
      expect(data).toBe('Hello World 🌍');
    });

    it('finds first occurrence when multiple matches exist', async () => {
      const tool = new FileEditTool({ rootDir: process.cwd() });
      const relPath = path.join('tests', '__tmp__', 'multiple-matches.txt');
      const abs = path.join(process.cwd(), relPath);
      await fs.writeFile(abs, 'foo bar foo baz', 'utf8');

      const res = await tool.execute({
        file_path: relPath,
        old_text: 'foo',
        new_text: 'FOO',
      });

      expect(res.status).toBe('success');
      const data = await fs.readFile(abs, 'utf8');
      expect(data).toBe('FOO bar foo baz');
    });

    it('respects maxBytes=1 minimum', async () => {
      const tool = new FileEditTool({ rootDir: process.cwd(), maxBytes: 0 });
      expect((tool as any).maxBytes).toBe(1);
    });
  });

  // ===== CONTEXT TESTS =====

  describe('Execution context', () => {
    it('uses context.workspaceRoot when provided', async () => {
      const tool = new FileEditTool({ rootDir: '/default' });
      const customRoot = process.cwd();
      const relPath = path.join('tests', '__tmp__', 'context-workspace.txt');
      const abs = path.join(customRoot, relPath);
      await fs.writeFile(abs, 'context original', 'utf8');

      const res = await tool.execute(
        {
          file_path: relPath,
          old_text: 'original',
          new_text: 'test',
        },
        { workspaceRoot: customRoot } as any,
      );

      expect(res.status).toBe('success');
      const data = await fs.readFile(abs, 'utf8');
      expect(data).toBe('context test');
    });

    it('uses context.cwd when workspaceRoot not provided', async () => {
      const tool = new FileEditTool({ rootDir: '/default' });
      const customCwd = process.cwd();
      const relPath = path.join('tests', '__tmp__', 'context-cwd.txt');
      const abs = path.join(customCwd, relPath);
      await fs.writeFile(abs, 'cwd original', 'utf8');

      const res = await tool.execute(
        {
          file_path: relPath,
          old_text: 'original',
          new_text: 'test',
        },
        { cwd: customCwd } as any,
      );

      expect(res.status).toBe('success');
      const data = await fs.readFile(abs, 'utf8');
      expect(data).toBe('cwd test');
    });

    it('prefers context.workspaceRoot over context.cwd when both provided', async () => {
      const tool = new FileEditTool({ rootDir: '/default' });
      const customRoot = process.cwd();
      const wrongCwd = '/wrong/path';
      const relPath = path.join('tests', '__tmp__', 'context-precedence.txt');
      const abs = path.join(customRoot, relPath);
      await fs.writeFile(abs, 'precedence original', 'utf8');

      const res = await tool.execute(
        {
          file_path: relPath,
          old_text: 'original',
          new_text: 'test',
        },
        { workspaceRoot: customRoot, cwd: wrongCwd } as any,
      );

      expect(res.status).toBe('success');
      const data = await fs.readFile(abs, 'utf8');
      expect(data).toBe('precedence test');
    });
  });

  // ===== PATH HANDLING EDGE CASES =====

  describe('Path handling edge cases', () => {
    it('resolves relative path from subdirectory context', async () => {
      const tool = new FileEditTool({ rootDir: process.cwd() });
      const subdir = path.join(process.cwd(), 'tests', '__tmp__');
      const relPath = 'subdir-test.txt';
      const abs = path.join(subdir, relPath);
      await fs.writeFile(abs, 'subdir original', 'utf8');

      const res = await tool.execute(
        {
          file_path: relPath,
          old_text: 'original',
          new_text: 'content',
        },
        { workspaceRoot: subdir } as any,
      );

      expect(res.status).toBe('success');
      const data = await fs.readFile(abs, 'utf8');
      expect(data).toBe('subdir content');
    });

    it('normalizes paths with ./ prefix', async () => {
      const tool = new FileEditTool({ rootDir: process.cwd() });
      const relPath = path.join('.', 'tests', '__tmp__', 'dot-prefix.txt');
      const abs = path.join(process.cwd(), 'tests', '__tmp__', 'dot-prefix.txt');
      await fs.writeFile(abs, 'dot original', 'utf8');

      const res = await tool.execute({
        file_path: relPath,
        old_text: 'original',
        new_text: 'test',
      });

      expect(res.status).toBe('success');
      const data = await fs.readFile(abs, 'utf8');
      expect(data).toBe('dot test');
    });

    it('handles paths with redundant separators', async () => {
      const tool = new FileEditTool({ rootDir: process.cwd() });
      const relPath = path.join('tests', '__tmp__', 'redundant.txt');
      const abs = path.join(process.cwd(), relPath);
      await fs.writeFile(abs, 'redundant original', 'utf8');

      const res = await tool.execute({
        file_path: relPath,
        old_text: 'original',
        new_text: 'test',
      });

      expect(res.status).toBe('success');
      const data = await fs.readFile(abs, 'utf8');
      expect(data).toBe('redundant test');
    });
  });
});
