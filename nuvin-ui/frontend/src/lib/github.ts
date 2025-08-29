import { FetchGithubCopilotKey as GitHubOAuthFetchGithubCopilotKey } from '@wails/services/githuboauthservice';
import type { GitHubTokenResponse } from '@wails/services/models';
import { isWailsEnvironment } from './browser-runtime';

// Browser-compatible types and functions
interface DeviceFlowStartResponse {
  deviceCode: string;
  userCode: string;
  verificationUri: string;
  interval: number;
  expiresIn: number;
}

interface DeviceFlowPollResponse {
  accessToken?: string;
  status: 'pending' | 'complete' | 'error';
  error?: string;
}

const SERVER_BASE_URL = import.meta.env.VITE_SERVER_URL || 'http://localhost:8080';

/**
 * Browser-compatible GitHub device flow authentication
 */
async function fetchGithubCopilotKeyBrowser(): Promise<GitHubTokenResponse | null> {
  try {
    // Step 1: Start device flow
    const startResponse = await fetch(`${SERVER_BASE_URL}/github/device-flow/start`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    if (!startResponse.ok) {
      throw new Error(`Failed to start device flow: ${startResponse.status}`);
    }

    const deviceFlow: DeviceFlowStartResponse = await startResponse.json();

    // Step 2: Open browser tab and show user code
    window.open(deviceFlow.verificationUri, '_blank');

    // Show user code to user
    alert(
      `Please enter this code in the GitHub authorization page: ${deviceFlow.userCode}\n\nClick OK after you have authorized the application.`,
    );

    // Step 3: Poll for completion
    const pollInterval = (deviceFlow.interval || 5) * 1000; // Convert to milliseconds
    const maxAttempts = Math.floor((deviceFlow.expiresIn || 900) / (deviceFlow.interval || 5));

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      await new Promise((resolve) => setTimeout(resolve, pollInterval));

      const pollResponse = await fetch(`${SERVER_BASE_URL}/github/device-flow/poll/${deviceFlow.deviceCode}`, {
        method: 'GET',
      });

      if (!pollResponse.ok) {
        throw new Error(`Failed to poll device flow: ${pollResponse.status}`);
      }

      const pollResult: DeviceFlowPollResponse = await pollResponse.json();

      if (pollResult.status === 'complete' && pollResult.accessToken) {
        // Success! Now get the Copilot token
        const tokenResponse = await fetch(`${SERVER_BASE_URL}/github/copilot-token`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ accessToken: pollResult.accessToken }),
        });

        if (!tokenResponse.ok) {
          throw new Error(`Failed to get Copilot token: ${tokenResponse.status}`);
        }

        const copilotTokens = await tokenResponse.json();
        return {
          accessToken: copilotTokens.accessToken,
          apiKey: copilotTokens.apiKey,
        };
      } else if (pollResult.status === 'error') {
        throw new Error(`GitHub authentication failed: ${pollResult.error}`);
      }
      // If status is 'pending', continue polling
    }

    throw new Error('GitHub authentication timed out');
  } catch (error) {
    console.error('Browser GitHub authentication failed:', error);
    return null;
  }
}

export async function fetchGithubCopilotKey(): Promise<GitHubTokenResponse | null> {
  try {
    if (isWailsEnvironment()) {
      // Use Wails service in desktop app
      const tokens = await GitHubOAuthFetchGithubCopilotKey();
      return tokens || null;
    } else {
      // Use browser-compatible flow
      return await fetchGithubCopilotKeyBrowser();
    }
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
