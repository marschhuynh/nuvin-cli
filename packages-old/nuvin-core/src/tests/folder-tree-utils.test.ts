import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { generateFolderTree } from '../folder-tree-utils.js';
import { promises as fs } from 'fs';
import * as path from 'path';
import * as os from 'os';

describe('generateFolderTree', () => {
  let testDir: string;

  beforeEach(async () => {
    testDir = path.join(os.tmpdir(), `folder-tree-test-${Date.now()}`);
    await fs.mkdir(testDir, { recursive: true });
  });

  afterEach(async () => {
    await fs.rm(testDir, { recursive: true, force: true });
  });

  describe('basic tree generation', () => {
    it('should generate tree for empty directory', async () => {
      const tree = await generateFolderTree(testDir);
      expect(tree).toContain(`${path.basename(testDir)}/`);
      expect(tree).toContain('(empty or all files ignored)');
    });

    it('should list files and directories', async () => {
      await fs.writeFile(path.join(testDir, 'file1.txt'), 'content');
      await fs.writeFile(path.join(testDir, 'file2.md'), 'content');
      await fs.mkdir(path.join(testDir, 'subdir'));

      const tree = await generateFolderTree(testDir);

      expect(tree).toContain('file1.txt');
      expect(tree).toContain('file2.md');
      expect(tree).toContain('subdir/');
    });

    it('should show nested structure with indentation', async () => {
      await fs.mkdir(path.join(testDir, 'dir1'), { recursive: true });
      await fs.writeFile(path.join(testDir, 'dir1', 'nested.txt'), 'content');
      await fs.mkdir(path.join(testDir, 'dir1', 'dir2'), { recursive: true });
      await fs.writeFile(path.join(testDir, 'dir1', 'dir2', 'deep.txt'), 'content');

      const tree = await generateFolderTree(testDir);

      expect(tree).toContain('dir1/');
      expect(tree).toContain('  nested.txt');
      expect(tree).toContain('  dir2/');
      expect(tree).toContain('    deep.txt');
    });

    it('should sort directories before files', async () => {
      await fs.writeFile(path.join(testDir, 'aaa-file.txt'), 'content');
      await fs.mkdir(path.join(testDir, 'zzz-dir'));
      await fs.writeFile(path.join(testDir, 'bbb-file.txt'), 'content');
      await fs.mkdir(path.join(testDir, 'aaa-dir'));

      const tree = await generateFolderTree(testDir);
      const lines = tree.split('\n');

      const aaDirIdx = lines.findIndex((l) => l.includes('aaa-dir/'));
      const zzzDirIdx = lines.findIndex((l) => l.includes('zzz-dir/'));
      const aaaFileIdx = lines.findIndex((l) => l.includes('aaa-file.txt'));
      const bbbFileIdx = lines.findIndex((l) => l.includes('bbb-file.txt'));

      expect(aaDirIdx).toBeLessThan(zzzDirIdx);
      expect(zzzDirIdx).toBeLessThan(aaaFileIdx);
      expect(aaaFileIdx).toBeLessThan(bbbFileIdx);
    });
  });

  describe('gitignore handling', () => {
    it('should respect .gitignore patterns', async () => {
      await fs.writeFile(path.join(testDir, '.gitignore'), 'node_modules\n*.log\n');
      await fs.mkdir(path.join(testDir, 'node_modules'));
      await fs.writeFile(path.join(testDir, 'node_modules', 'package.json'), '{}');
      await fs.writeFile(path.join(testDir, 'error.log'), 'error');
      await fs.writeFile(path.join(testDir, 'readme.txt'), 'readme');

      const tree = await generateFolderTree(testDir);

      expect(tree).not.toContain('node_modules');
      expect(tree).not.toContain('error.log');
      expect(tree).toContain('readme.txt');
    });

    it('should ignore directory patterns with trailing slash', async () => {
      await fs.writeFile(path.join(testDir, '.gitignore'), 'build/\n');
      await fs.mkdir(path.join(testDir, 'build'));
      await fs.writeFile(path.join(testDir, 'build', 'output.js'), 'code');
      await fs.writeFile(path.join(testDir, 'source.ts'), 'code');

      const tree = await generateFolderTree(testDir);

      expect(tree).not.toContain('build/');
      expect(tree).not.toContain('output.js');
      expect(tree).toContain('source.ts');
    });

    it('should handle wildcard patterns', async () => {
      await fs.writeFile(path.join(testDir, '.gitignore'), '*.tmp\ntest-*\n');
      await fs.writeFile(path.join(testDir, 'file.tmp'), 'temp');
      await fs.writeFile(path.join(testDir, 'test-data.txt'), 'test');
      await fs.writeFile(path.join(testDir, 'production-data.txt'), 'prod');

      const tree = await generateFolderTree(testDir);

      expect(tree).not.toContain('file.tmp');
      expect(tree).not.toContain('test-data.txt');
      expect(tree).toContain('production-data.txt');
    });

    it('should handle negation patterns', async () => {
      await fs.writeFile(path.join(testDir, '.gitignore'), '*.log\n!important.log\n');
      await fs.writeFile(path.join(testDir, 'debug.log'), 'debug');
      await fs.writeFile(path.join(testDir, 'important.log'), 'important');
      await fs.writeFile(path.join(testDir, 'readme.txt'), 'readme');

      const tree = await generateFolderTree(testDir);

      expect(tree).not.toContain('debug.log');
      expect(tree).toContain('important.log');
      expect(tree).toContain('readme.txt');
    });

    it('should always ignore .git directory', async () => {
      await fs.mkdir(path.join(testDir, '.git'));
      await fs.writeFile(path.join(testDir, '.git', 'config'), 'config');
      await fs.writeFile(path.join(testDir, 'readme.txt'), 'readme');

      const tree = await generateFolderTree(testDir);

      expect(tree).not.toContain('.git');
      expect(tree).toContain('readme.txt');
    });
  });

  describe('options', () => {
    it('should respect maxDepth option', async () => {
      await fs.mkdir(path.join(testDir, 'level1'), { recursive: true });
      await fs.mkdir(path.join(testDir, 'level1', 'level2'), { recursive: true });
      await fs.mkdir(path.join(testDir, 'level1', 'level2', 'level3'), { recursive: true });
      await fs.writeFile(path.join(testDir, 'level1', 'file1.txt'), 'content');
      await fs.writeFile(path.join(testDir, 'level1', 'level2', 'file2.txt'), 'content');
      await fs.writeFile(path.join(testDir, 'level1', 'level2', 'level3', 'file3.txt'), 'content');

      const tree = await generateFolderTree(testDir, { maxDepth: 2 });

      expect(tree).toContain('level1/');
      expect(tree).toContain('file1.txt');
      expect(tree).toContain('level2/');
      expect(tree).not.toContain('file2.txt');
      expect(tree).not.toContain('level3/');
      expect(tree).not.toContain('file3.txt');
    });

    it('should respect maxFiles option', async () => {
      for (let i = 0; i < 10; i++) {
        await fs.writeFile(path.join(testDir, `file${i}.txt`), 'content');
      }

      const tree = await generateFolderTree(testDir, { maxFiles: 5 });
      const fileCount = (tree.match(/file\d+\.txt/g) || []).length;

      expect(fileCount).toBeLessThanOrEqual(5);
    });

    it('should include hidden files when includeHidden is true', async () => {
      await fs.writeFile(path.join(testDir, '.hidden'), 'hidden');
      await fs.writeFile(path.join(testDir, 'visible.txt'), 'visible');

      const treeWithHidden = await generateFolderTree(testDir, { includeHidden: true });
      expect(treeWithHidden).toContain('.hidden');
      expect(treeWithHidden).toContain('visible.txt');

      const treeWithoutHidden = await generateFolderTree(testDir, { includeHidden: false });
      expect(treeWithoutHidden).not.toContain('.hidden');
      expect(treeWithoutHidden).toContain('visible.txt');
    });

    it('should exclude hidden files by default', async () => {
      await fs.writeFile(path.join(testDir, '.hidden'), 'hidden');
      await fs.writeFile(path.join(testDir, 'visible.txt'), 'visible');

      const tree = await generateFolderTree(testDir);

      expect(tree).not.toContain('.hidden');
      expect(tree).toContain('visible.txt');
    });
  });

  describe('edge cases', () => {
    it('should handle directories with special characters', async () => {
      await fs.mkdir(path.join(testDir, 'dir-with-dashes'));
      await fs.mkdir(path.join(testDir, 'dir_with_underscores'));
      await fs.writeFile(path.join(testDir, 'file with spaces.txt'), 'content');

      const tree = await generateFolderTree(testDir);

      expect(tree).toContain('dir-with-dashes/');
      expect(tree).toContain('dir_with_underscores/');
      expect(tree).toContain('file with spaces.txt');
    });

    it('should handle empty subdirectories', async () => {
      await fs.mkdir(path.join(testDir, 'empty-dir'));

      const tree = await generateFolderTree(testDir);

      expect(tree).toContain('empty-dir/');
    });

    it('should work without .gitignore file', async () => {
      await fs.writeFile(path.join(testDir, 'file.txt'), 'content');
      await fs.mkdir(path.join(testDir, 'dir'));

      const tree = await generateFolderTree(testDir);

      expect(tree).toContain('file.txt');
      expect(tree).toContain('dir/');
    });
  });

  describe('output format', () => {
    it('should use forward slash for directories', async () => {
      await fs.mkdir(path.join(testDir, 'testdir'));

      const tree = await generateFolderTree(testDir);

      expect(tree).toMatch(/testdir\//);
    });

    it('should not use slash suffix for files', async () => {
      await fs.writeFile(path.join(testDir, 'testfile.txt'), 'content');

      const tree = await generateFolderTree(testDir);

      expect(tree).toContain('testfile.txt');
      expect(tree).not.toMatch(/testfile\.txt\//);
    });

    it('should include root directory name', async () => {
      const tree = await generateFolderTree(testDir);
      const rootName = path.basename(testDir);

      expect(tree).toContain(rootName + '/');
    });
  });
});
