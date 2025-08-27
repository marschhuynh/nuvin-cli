import { FetchGithubCopilotKey as GitHubOAuthFetchGithubCopilotKey } from '@wails/services/githuboauthservice';
import type { GitHubTokenResponse } from '@wails/services/models';

export async function fetchGithubCopilotKey(): Promise<GitHubTokenResponse | null> {
  try {
    const tokens = await GitHubOAuthFetchGithubCopilotKey();
    return tokens || null;
  } catch (error) {
    console.error('Failed to fetch GitHub Copilot key:', error);
    return null;
  }
}

/**
 * Helper function to check if a GitHub provider has both required tokens
 */
export function hasCompleteGitHubTokens(provider: GitHubTokenResponse): boolean {
  return !!(provider.apiKey && provider.accessToken);
}

/**
 * Helper function to get the access token from a provider, with fallback
 */
export function getGitHubAccessToken(provider: GitHubTokenResponse): string | null {
  const token = provider.accessToken || provider.apiKey || null;
  return token ? token.trim() : null;
}

/**
 * Validates and cleans a GitHub token
 */
export function validateAndCleanGitHubToken(token: string): string {
  if (!token) {
    throw new Error('GitHub token is required');
  }

  const cleanToken = token.trim();

  if (!cleanToken) {
    throw new Error('GitHub token cannot be empty or only whitespace');
  }

  // Check for obvious whitespace issues
  if (token !== cleanToken) {
    console.warn('GitHub token contained whitespace that was trimmed');
  }

  return cleanToken;
}

// Types for window.go are declared in src/types/wails-fs.d.ts
