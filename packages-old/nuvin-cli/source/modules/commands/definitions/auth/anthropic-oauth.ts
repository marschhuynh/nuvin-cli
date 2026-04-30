import { generatePKCE } from './pkce.js';

const CLIENT_ID = '9d1c250a-e61b-44d9-88ed-5944d1962f5e';
const REDIRECT_URI = 'https://console.anthropic.com/oauth/code/callback';

export interface AuthCredentials {
  type: 'success' | 'failed';
  access?: string;
  refresh?: string;
  expires?: number;
  key?: string;
}

export interface OAuthFlow {
  url: string;
  verifier: string;
  instructions: string;
}

/**
 * Generate OAuth authorization URL for Anthropic
 */
export async function generateAuthUrl(mode: 'max' | 'console'): Promise<OAuthFlow> {
  const pkce = generatePKCE();

  const baseUrl = mode === 'console' ? 'console.anthropic.com' : 'claude.ai';
  const url = new URL(`https://${baseUrl}/oauth/authorize`);

  url.searchParams.set('code', 'true');
  url.searchParams.set('client_id', CLIENT_ID);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('redirect_uri', REDIRECT_URI);
  url.searchParams.set('scope', 'org:create_api_key user:profile user:inference');
  url.searchParams.set('code_challenge', pkce.challenge);
  url.searchParams.set('code_challenge_method', 'S256');
  url.searchParams.set('state', pkce.verifier);

  return {
    url: url.toString(),
    verifier: pkce.verifier,
    instructions: 'After authorizing, paste the full callback URL or just the authorization code: ',
  };
}

/**
 * Exchange authorization code for access token
 */
export async function exchangeCodeForToken(code: string, verifier: string): Promise<AuthCredentials> {
  let authCode: string;
  let state: string;

  // Try to parse different formats the user might paste:
  // 1. Full callback URL: https://console.anthropic.com/oauth/code/callback?code=xxx&state=yyy
  // 2. Just code#state
  // 3. Just the code

  try {
    // Check if it's a full URL
    if (code.startsWith('https://')) {
      const url = new URL(code);
      authCode = url.searchParams.get('code') || '';
      state = url.searchParams.get('state') || '';
    } else {
      // Split on # first (legacy format)
      const parts = code.split('#');
      authCode = parts[0];
      state = parts[1] || '';
    }
  } catch (_error) {
    // If parsing fails, assume it's just the code
    authCode = code;
    state = '';
  }

  // Clean up the auth code (remove any whitespace)
  authCode = authCode.trim();

  try {
    const response = await fetch('https://console.anthropic.com/v1/oauth/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        code: authCode,
        state: state || verifier, // Use extracted state or fallback to verifier
        grant_type: 'authorization_code',
        client_id: CLIENT_ID,
        redirect_uri: REDIRECT_URI,
        code_verifier: verifier,
      }),
    });

    if (!response.ok) {
      await response.text(); // consume response body

      // Try fallback: maybe the state should always be verifier
      try {
        const fallbackResponse = await fetch('https://console.anthropic.com/v1/oauth/token', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            code: authCode,
            state: verifier, // Always use verifier
            grant_type: 'authorization_code',
            client_id: CLIENT_ID,
            redirect_uri: REDIRECT_URI,
            code_verifier: verifier,
          }),
        });

        if (fallbackResponse.ok) {
          const json = await fallbackResponse.json();
          return {
            type: 'success',
            access: json.access_token,
            refresh: json.refresh_token,
            expires: Date.now() + json.expires_in * 1000,
          };
        } else {
        }
      } catch (_fallbackError) {
        // Silently ignore fallback errors
      }

      return { type: 'failed' };
    }

    const json = await response.json();
    return {
      type: 'success',
      access: json.access_token,
      refresh: json.refresh_token,
      expires: Date.now() + json.expires_in * 1000,
    };
  } catch (_error) {
    return { type: 'failed' };
  }
}

/**
 * Create API key using OAuth access token (for console flow)
 */
export async function createApiKey(accessToken: string): Promise<AuthCredentials> {
  try {
    const response = await fetch('https://api.anthropic.com/api/oauth/claude_cli/create_api_key', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        authorization: `Bearer ${accessToken}`,
      },
    });

    if (!response.ok) {
      return { type: 'failed' };
    }

    const result = await response.json();
    return { type: 'success', key: result.raw_key };
  } catch (_error) {
    return { type: 'failed' };
  }
}

/**
 * Refresh access token using refresh token
 */
export async function refreshAccessToken(refreshToken: string): Promise<AuthCredentials> {
  try {
    const response = await fetch('https://console.anthropic.com/v1/oauth/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        grant_type: 'refresh_token',
        refresh_token: refreshToken,
        client_id: CLIENT_ID,
      }),
    });

    if (!response.ok) {
      return { type: 'failed' };
    }

    const json = await response.json();
    return {
      type: 'success',
      access: json.access_token,
      refresh: json.refresh_token,
      expires: Date.now() + json.expires_in * 1000,
    };
  } catch (_error) {
    return { type: 'failed' };
  }
}
