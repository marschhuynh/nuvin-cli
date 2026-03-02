import * as path from 'node:path';
import { createHash } from 'node:crypto';
import { execSync } from 'node:child_process';

export interface WorkspaceContext {
  workspaceRoot: string;
  workspaceId: string;
}

function hashWorkspaceRoot(root: string): string {
  const digest = createHash('sha256').update(root).digest('hex').slice(0, 16);
  return `ws_${digest}`;
}

function resolveWorkspaceRoot(cwd: string): string {
  try {
    const gitRoot = execSync('git rev-parse --show-toplevel', {
      cwd,
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
    if (gitRoot.length > 0) {
      return path.resolve(gitRoot);
    }
  } catch {
    // Fallback to current working directory.
  }
  return path.resolve(cwd);
}

export function getWorkspaceContext(cwd: string = process.cwd()): WorkspaceContext {
  const resolvedCwd = path.resolve(cwd);
  const workspaceRoot = resolveWorkspaceRoot(resolvedCwd);
  return {
    workspaceRoot,
    workspaceId: hashWorkspaceRoot(workspaceRoot),
  };
}
