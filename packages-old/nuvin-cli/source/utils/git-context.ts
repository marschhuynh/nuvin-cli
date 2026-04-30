import * as fs from 'node:fs';
import * as path from 'node:path';

/**
 * Git context information extracted from the current workspace.
 */
export interface GitContextInfo {
  /**
   * Shell name (e.g., 'bash', 'zsh', 'fish')
   */
  shell?: string;
  
  /**
   * Current git branch name
   */
  gitBranch?: string;
  
  /**
   * Git repository name (extracted from remote URL or folder name)
   */
  gitRepo?: string;
  
  /**
   * Recent commit history (last 5 commits)
   */
  recentCommits?: string;
}

/**
 * Extract git context information from the current workspace.
 * 
 * This function gathers contextual information about the development environment:
 * - Shell information from environment variables
 * - Git branch, repository name, and recent commits (if in a git repository)
 * 
 * All operations are non-blocking and fail gracefully, returning undefined for
 * any information that cannot be retrieved.
 * 
 * @returns Promise resolving to GitContextInfo with available context data
 * 
 * @example
 * ```typescript
 * const context = await getGitContextInfo();
 * console.log(`Working on ${context.gitRepo} (${context.gitBranch})`);
 * ```
 */
export async function getGitContextInfo(): Promise<GitContextInfo> {
  const shell = process.env.SHELL ? path.basename(process.env.SHELL) : undefined;

  let gitBranch: string | undefined;
  let gitRepo: string | undefined;
  let recentCommits: string | undefined;

  try {
    const workspaceDir = process.cwd();
    // Check if we're in a git repository
    const gitDir = path.join(workspaceDir, '.git');
    const isGitRepo = fs.existsSync(gitDir);

    if (isGitRepo) {
      // Import execSync once for all git operations
      const { execSync } = await import('node:child_process');

      // Get current branch
      try {
        gitBranch = execSync('git rev-parse --abbrev-ref HEAD', {
          cwd: workspaceDir,
          encoding: 'utf-8',
        }).trim();
      } catch {
        // Git command failed, leave undefined
      }

      // Get repo name from git remote or folder name
      try {
        const originUrl = execSync('git config --get remote.origin.url', {
          cwd: workspaceDir,
          encoding: 'utf-8',
        }).trim();
        // Extract repo name from URL (handles both https and ssh formats)
        const match = originUrl.match(/[:/]([^/]+\/[^/]+?)(\.git)?$/);
        gitRepo = match?.[1] ?? path.basename(workspaceDir);
      } catch {
        // Fallback to folder name if git remote fails
        gitRepo = path.basename(workspaceDir);
      }

      // Get recent commits (last 5)
      try {
        recentCommits = execSync('git log -5 --pretty=format:"%h - %s (%ar)"', {
          cwd: workspaceDir,
          encoding: 'utf-8',
          maxBuffer: 1024 * 1024, // 1MB should be more than enough for 5 commits
        }).trim();
      } catch {
        // Git command failed, leave undefined
      }
    }
  } catch {
    // Not a git repo or git not available
  }

  return { shell, gitBranch, gitRepo, recentCommits };
}
