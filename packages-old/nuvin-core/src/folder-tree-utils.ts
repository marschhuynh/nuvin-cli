import { promises as fs } from 'node:fs';
import * as path from 'node:path';

export type FolderTreeOptions = {
  maxDepth?: number;
  maxFiles?: number;
  includeHidden?: boolean;
};

type GitIgnoreRule = {
  pattern: string;
  isNegation: boolean;
  isDirectory: boolean;
};

class GitIgnoreParser {
  private rules: GitIgnoreRule[] = [];

  constructor(gitignoreContent: string) {
    const lines = gitignoreContent.split('\n');
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;

      const isNegation = trimmed.startsWith('!');
      const pattern = isNegation ? trimmed.slice(1) : trimmed;
      const isDirectory = pattern.endsWith('/');

      this.rules.push({
        pattern: isDirectory ? pattern.slice(0, -1) : pattern,
        isNegation,
        isDirectory,
      });
    }
  }

  shouldIgnore(relativePath: string, isDirectory: boolean): boolean {
    let ignored = false;

    for (const rule of this.rules) {
      if (rule.isDirectory && !isDirectory) continue;

      if (this.matchPattern(relativePath, rule.pattern)) {
        ignored = !rule.isNegation;
      }
    }

    return ignored;
  }

  private matchPattern(filePath: string, pattern: string): boolean {
    const pathParts = filePath.split('/');

    if (pattern.includes('*')) {
      const regex = new RegExp(`^${pattern.replace(/\./g, '\\.').replace(/\*/g, '.*').replace(/\?/g, '.')}$`);
      return regex.test(filePath) || pathParts.some((part) => regex.test(part));
    }

    return filePath === pattern || filePath.startsWith(`${pattern}/`) || pathParts.some((part) => part === pattern);
  }
}

async function loadGitIgnore(rootDir: string): Promise<GitIgnoreParser | null> {
  const gitignorePath = path.join(rootDir, '.gitignore');
  try {
    const content = await fs.readFile(gitignorePath, 'utf-8');
    return new GitIgnoreParser(content);
  } catch {
    return null;
  }
}

async function buildTree(
  dir: string,
  rootDir: string,
  gitignore: GitIgnoreParser | null,
  options: Required<FolderTreeOptions>,
  depth: number,
  fileCount: { count: number },
): Promise<string[]> {
  if (depth >= options.maxDepth || fileCount.count >= options.maxFiles) {
    return [];
  }

  let entries;
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch {
    return [];
  }
  const lines: string[] = [];

  const sortedEntries = entries.sort((a, b) => {
    if (a.isDirectory() && !b.isDirectory()) return -1;
    if (!a.isDirectory() && b.isDirectory()) return 1;
    return a.name.localeCompare(b.name);
  });

  for (const entry of sortedEntries) {
    if (fileCount.count >= options.maxFiles) break;

    if (!options.includeHidden && entry.name.startsWith('.')) continue;

    if (entry.name === '.git') continue;

    const fullPath = path.join(dir, entry.name);
    const relativePath = path.relative(rootDir, fullPath);

    if (gitignore?.shouldIgnore(relativePath, entry.isDirectory())) {
      continue;
    }

    const indent = '  '.repeat(depth);
    const suffix = entry.isDirectory() ? '/' : '';
    lines.push(`${indent}${entry.name}${suffix}`);
    fileCount.count++;

    if (entry.isDirectory() && depth + 1 < options.maxDepth) {
      const subLines = await buildTree(fullPath, rootDir, gitignore, options, depth + 1, fileCount);
      lines.push(...subLines);
    }
  }

  return lines;
}

export async function generateFolderTree(rootDir: string, options: FolderTreeOptions = {}): Promise<string> {
  const opts: Required<FolderTreeOptions> = {
    maxDepth: options.maxDepth ?? 5,
    maxFiles: options.maxFiles ?? 500,
    includeHidden: options.includeHidden ?? false,
  };

  const gitignore = await loadGitIgnore(rootDir);
  const fileCount = { count: 0 };

  const lines = await buildTree(rootDir, rootDir, gitignore, opts, 0, fileCount);

  const header = `${path.basename(rootDir)}/`;

  if (lines.length === 0) {
    return `${header}\n(empty or all files ignored)`;
  }

  return [header, ...lines].join('\n');
}
