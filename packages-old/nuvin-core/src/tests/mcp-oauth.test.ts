import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import {
  MCPOAuthClient,
  parseWWWAuthenticate,
  isInsufficientScopeError,
  isUnauthorizedError,
} from '../mcp/mcp-oauth.js';
import type { TokenStorage, StoredTokens } from '../mcp/mcp-oauth.js';

class MockTokenStorage implements TokenStorage {
  private tokens: Map<string, StoredTokens> = new Map();

  async get(key: string): Promise<StoredTokens | null> {
    return this.tokens.get(key) || null;
  }

  async set(key: string, tokens: StoredTokens): Promise<void> {
    this.tokens.set(key, tokens);
  }

  async delete(key: string): Promise<void> {
    this.tokens.delete(key);
  }

  async list(): Promise<string[]> {
    return Array.from(this.tokens.keys());
  }

  clear(): void {
    this.tokens.clear();
  }
}

describe('parseWWWAuthenticate', () => {
  it('parses Bearer scheme with parameters', () => {
    const header = 'Bearer realm="example", error="invalid_token", error_description="Token expired"';
    const result = parseWWWAuthenticate(header);

    expect(result.scheme).toBe('Bearer');
    expect(result.params.realm).toBe('example');
    expect(result.params.error).toBe('invalid_token');
    expect(result.params.error_description).toBe('Token expired');
  });

  it('parses resource_metadata parameter', () => {
    const header = 'Bearer resource_metadata="https://example.com/.well-known/oauth-protected-resource", scope="read write"';
    const result = parseWWWAuthenticate(header);

    expect(result.scheme).toBe('Bearer');
    expect(result.params.resource_metadata).toBe('https://example.com/.well-known/oauth-protected-resource');
    expect(result.params.scope).toBe('read write');
  });

  it('parses insufficient_scope error', () => {
    const header = 'Bearer error="insufficient_scope", scope="files:read files:write"';
    const result = parseWWWAuthenticate(header);

    expect(result.params.error).toBe('insufficient_scope');
    expect(result.params.scope).toBe('files:read files:write');
  });

  it('handles empty header by returning empty scheme', () => {
    const result = parseWWWAuthenticate('');
    expect(result.scheme).toBe('');
    expect(result.params).toEqual({});
  });

  it('handles scheme-only header', () => {
    const result = parseWWWAuthenticate('Bearer');
    expect(result.scheme).toBe('Bearer');
    expect(result.params).toEqual({});
  });

  it('parses unquoted values', () => {
    const header = 'Bearer realm=OAuth, error=invalid_token';
    const result = parseWWWAuthenticate(header);

    expect(result.scheme).toBe('Bearer');
    expect(result.params.realm).toBe('OAuth');
    expect(result.params.error).toBe('invalid_token');
  });

  it('parses mixed quoted and unquoted values', () => {
    const header = 'Bearer realm="OAuth", error=invalid_token, error_description="Missing or invalid access token"';
    const result = parseWWWAuthenticate(header);

    expect(result.scheme).toBe('Bearer');
    expect(result.params.realm).toBe('OAuth');
    expect(result.params.error).toBe('invalid_token');
    expect(result.params.error_description).toBe('Missing or invalid access token');
  });
});

describe('isInsufficientScopeError', () => {
  it('detects insufficient_scope error', () => {
    const result = isInsufficientScopeError(
      403,
      'Bearer error="insufficient_scope", scope="files:read files:write"',
    );

    expect(result.isError).toBe(true);
    expect(result.requiredScopes).toEqual(['files:read', 'files:write']);
  });

  it('returns false for non-403 status', () => {
    const result = isInsufficientScopeError(
      401,
      'Bearer error="insufficient_scope", scope="files:read"',
    );

    expect(result.isError).toBe(false);
  });

  it('returns false for different error type', () => {
    const result = isInsufficientScopeError(
      403,
      'Bearer error="invalid_token"',
    );

    expect(result.isError).toBe(false);
  });

  it('returns false without WWW-Authenticate header', () => {
    const result = isInsufficientScopeError(403);
    expect(result.isError).toBe(false);
  });
});

describe('isUnauthorizedError', () => {
  it('detects 401 with resource metadata', () => {
    const result = isUnauthorizedError(
      401,
      'Bearer resource_metadata="https://example.com/.well-known/oauth-protected-resource", scope="read"',
    );

    expect(result.isError).toBe(true);
    expect(result.resourceMetadataUrl).toBe('https://example.com/.well-known/oauth-protected-resource');
    expect(result.requiredScopes).toEqual(['read']);
  });

  it('detects 401 without header', () => {
    const result = isUnauthorizedError(401);

    expect(result.isError).toBe(true);
    expect(result.resourceMetadataUrl).toBeUndefined();
  });

  it('returns false for non-401 status', () => {
    const result = isUnauthorizedError(403, 'Bearer error="insufficient_scope"');
    expect(result.isError).toBe(false);
  });
});

describe('MCPOAuthClient', () => {
  let mockTokenStorage: MockTokenStorage;
  let mockFetch: ReturnType<typeof vi.fn>;
  const originalFetch = global.fetch;

  beforeEach(() => {
    mockTokenStorage = new MockTokenStorage();
    mockFetch = vi.fn();
    global.fetch = mockFetch;
  });

  afterEach(() => {
    global.fetch = originalFetch;
    mockTokenStorage.clear();
    vi.clearAllMocks();
  });

  describe('getAccessToken', () => {
    it('returns null when no token stored', async () => {
      const client = new MCPOAuthClient(
        'https://mcp.example.com',
        { clientId: 'test-client' },
        mockTokenStorage,
      );

      const token = await client.getAccessToken();
      expect(token).toBeNull();
    });

    it('returns stored token if valid', async () => {
      await mockTokenStorage.set('mcp_oauth_mcp.example.com', {
        accessToken: 'valid-token',
        expiresAt: Date.now() + 3600000,
      });

      const client = new MCPOAuthClient(
        'https://mcp.example.com',
        { clientId: 'test-client' },
        mockTokenStorage,
      );

      const token = await client.getAccessToken();
      expect(token).toBe('valid-token');
    });

    it('returns null for expired token without refresh token', async () => {
      await mockTokenStorage.set('mcp_oauth_mcp.example.com', {
        accessToken: 'expired-token',
        expiresAt: Date.now() - 1000,
      });

      const client = new MCPOAuthClient(
        'https://mcp.example.com',
        { clientId: 'test-client' },
        mockTokenStorage,
      );

      const token = await client.getAccessToken();
      expect(token).toBeNull();
    });

    it('uses custom tokenStorageKey when provided', async () => {
      await mockTokenStorage.set('custom-key', {
        accessToken: 'custom-token',
        expiresAt: Date.now() + 3600000,
      });

      const client = new MCPOAuthClient(
        'https://mcp.example.com',
        { clientId: 'test-client', tokenStorageKey: 'custom-key' },
        mockTokenStorage,
      );

      const token = await client.getAccessToken();
      expect(token).toBe('custom-token');
    });
  });

  describe('hasValidToken', () => {
    it('returns true when valid token exists', async () => {
      await mockTokenStorage.set('mcp_oauth_mcp.example.com', {
        accessToken: 'valid-token',
        expiresAt: Date.now() + 3600000,
      });

      const client = new MCPOAuthClient(
        'https://mcp.example.com',
        { clientId: 'test-client' },
        mockTokenStorage,
      );

      const hasToken = await client.hasValidToken();
      expect(hasToken).toBe(true);
    });

    it('returns false when no token exists', async () => {
      const client = new MCPOAuthClient(
        'https://mcp.example.com',
        { clientId: 'test-client' },
        mockTokenStorage,
      );

      const hasToken = await client.hasValidToken();
      expect(hasToken).toBe(false);
    });
  });

  describe('getAuthStatus', () => {
    it('returns unauthenticated when no token', async () => {
      const client = new MCPOAuthClient(
        'https://mcp.example.com',
        { clientId: 'test-client' },
        mockTokenStorage,
      );

      const status = await client.getAuthStatus();
      expect(status.authenticated).toBe(false);
    });

    it('returns authenticated with scope info', async () => {
      const expiresAt = Date.now() + 3600000;
      await mockTokenStorage.set('mcp_oauth_mcp.example.com', {
        accessToken: 'valid-token',
        expiresAt,
        scope: 'read write',
      });

      const client = new MCPOAuthClient(
        'https://mcp.example.com',
        { clientId: 'test-client' },
        mockTokenStorage,
      );

      const status = await client.getAuthStatus();
      expect(status.authenticated).toBe(true);
      expect(status.scope).toBe('read write');
      expect(status.expiresAt).toBe(expiresAt);
    });

    it('returns not authenticated for expired token', async () => {
      await mockTokenStorage.set('mcp_oauth_mcp.example.com', {
        accessToken: 'expired-token',
        expiresAt: Date.now() - 1000,
      });

      const client = new MCPOAuthClient(
        'https://mcp.example.com',
        { clientId: 'test-client' },
        mockTokenStorage,
      );

      const status = await client.getAuthStatus();
      expect(status.authenticated).toBe(false);
    });
  });

  describe('logout', () => {
    it('clears stored tokens', async () => {
      await mockTokenStorage.set('mcp_oauth_mcp.example.com', {
        accessToken: 'token-to-clear',
      });

      const client = new MCPOAuthClient(
        'https://mcp.example.com',
        { clientId: 'test-client' },
        mockTokenStorage,
      );

      await client.logout();

      const token = await mockTokenStorage.get('mcp_oauth_mcp.example.com');
      expect(token).toBeNull();
    });
  });

  describe('discoverOAuthServer', () => {
    it('uses configured authorization server directly', async () => {
      const authMetadata = {
        issuer: 'https://auth.example.com',
        authorization_endpoint: 'https://auth.example.com/authorize',
        token_endpoint: 'https://auth.example.com/token',
        code_challenge_methods_supported: ['S256'],
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(authMetadata),
      });

      const client = new MCPOAuthClient(
        'https://mcp.example.com',
        { clientId: 'test-client', authorizationServer: 'https://auth.example.com' },
        mockTokenStorage,
      );

      const result = await client.discoverOAuthServer();

      expect(result.authorizationServerUrl).toBe('https://auth.example.com');
      expect(result.authServerMetadata).toEqual(authMetadata);
    });

    it('probes server and extracts WWW-Authenticate scope', async () => {
      const protectedResourceMetadata = {
        resource: 'https://mcp.example.com',
        authorization_servers: ['https://auth.example.com'],
        scopes_supported: ['read', 'write'],
      };

      const authMetadata = {
        issuer: 'https://auth.example.com',
        authorization_endpoint: 'https://auth.example.com/authorize',
        token_endpoint: 'https://auth.example.com/token',
        code_challenge_methods_supported: ['S256'],
      };

      mockFetch
        .mockResolvedValueOnce({
          ok: false,
          status: 401,
          headers: new Map([['WWW-Authenticate', 'Bearer scope="api:read api:write"']]),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve(protectedResourceMetadata),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve(authMetadata),
        });

      const client = new MCPOAuthClient(
        'https://mcp.example.com',
        { clientId: 'test-client' },
        mockTokenStorage,
      );

      const result = await client.discoverOAuthServer();

      expect(result.authorizationServerUrl).toBe('https://auth.example.com');
      expect(result.wwwAuthenticateScope).toBe('api:read api:write');
    });

    it('uses resource_metadata URL from WWW-Authenticate header', async () => {
      const protectedResourceMetadata = {
        resource: 'https://mcp.example.com',
        authorization_servers: ['https://auth.example.com'],
      };

      const authMetadata = {
        issuer: 'https://auth.example.com',
        authorization_endpoint: 'https://auth.example.com/authorize',
        token_endpoint: 'https://auth.example.com/token',
        code_challenge_methods_supported: ['S256'],
      };

      mockFetch
        .mockResolvedValueOnce({
          ok: false,
          status: 401,
          headers: new Map([
            ['WWW-Authenticate', 'Bearer resource_metadata="https://mcp.example.com/.well-known/oauth-protected-resource"'],
          ]),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve(protectedResourceMetadata),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve(authMetadata),
        });

      const client = new MCPOAuthClient(
        'https://mcp.example.com',
        { clientId: 'test-client' },
        mockTokenStorage,
      );

      const result = await client.discoverOAuthServer();

      expect(result.authorizationServerUrl).toBe('https://auth.example.com');
      expect(mockFetch).toHaveBeenCalledWith(
        'https://mcp.example.com/.well-known/oauth-protected-resource',
        expect.any(Object),
      );
    });

    it('falls back to server URL when no PRM found', async () => {
      const authMetadata = {
        issuer: 'https://mcp.example.com',
        authorization_endpoint: 'https://mcp.example.com/authorize',
        token_endpoint: 'https://mcp.example.com/token',
        code_challenge_methods_supported: ['S256'],
      };

      mockFetch
        .mockResolvedValueOnce({
          ok: false,
          status: 401,
          headers: new Map([['WWW-Authenticate', 'Bearer']]),
        })
        .mockRejectedValueOnce(new Error('Not found'))
        .mockRejectedValueOnce(new Error('Not found'))
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve(authMetadata),
        });

      const client = new MCPOAuthClient(
        'https://mcp.example.com',
        { clientId: 'test-client' },
        mockTokenStorage,
      );

      const result = await client.discoverOAuthServer();

      expect(result.authorizationServerUrl).toBe('https://mcp.example.com');
      expect(result.protectedResourceMetadata).toBeUndefined();
    });
  });

  describe('discoverProtectedResourceMetadata', () => {
    it('returns cached metadata from discovery', async () => {
      const metadata = {
        resource: 'https://mcp.example.com/api',
        authorization_servers: ['https://auth.example.com'],
        scopes_supported: ['read', 'write'],
      };

      const authMetadata = {
        issuer: 'https://auth.example.com',
        authorization_endpoint: 'https://auth.example.com/authorize',
        token_endpoint: 'https://auth.example.com/token',
        code_challenge_methods_supported: ['S256'],
      };

      mockFetch
        .mockResolvedValueOnce({
          ok: false,
          status: 401,
          headers: new Map([['WWW-Authenticate', 'Bearer']]),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve(metadata),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve(authMetadata),
        });

      const client = new MCPOAuthClient(
        'https://mcp.example.com/api',
        { clientId: 'test-client' },
        mockTokenStorage,
      );

      const result = await client.discoverProtectedResourceMetadata();
      expect(result).toEqual(metadata);
    });

    it('throws error when discovery fails and no PRM found', async () => {
      mockFetch
        .mockResolvedValueOnce({
          ok: false,
          status: 401,
          headers: new Map([['WWW-Authenticate', 'Bearer']]),
        })
        .mockRejectedValueOnce(new Error('Not found'))
        .mockRejectedValueOnce(new Error('Not found'))
        .mockRejectedValueOnce(new Error('Not found'));

      const client = new MCPOAuthClient(
        'https://mcp.example.com',
        { clientId: 'test-client' },
        mockTokenStorage,
      );

      await expect(client.discoverProtectedResourceMetadata()).rejects.toThrow(
        /Failed to discover protected resource metadata/,
      );
    });
  });

  describe('discoverAuthServerMetadata', () => {
    it('uses configured authorization server', async () => {
      const authMetadata = {
        issuer: 'https://auth.example.com',
        authorization_endpoint: 'https://auth.example.com/authorize',
        token_endpoint: 'https://auth.example.com/token',
        code_challenge_methods_supported: ['S256'],
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(authMetadata),
      });

      const client = new MCPOAuthClient(
        'https://mcp.example.com',
        { clientId: 'test-client', authorizationServer: 'https://auth.example.com' },
        mockTokenStorage,
      );

      const result = await client.discoverAuthServerMetadata();

      expect(result).toEqual(authMetadata);
      expect(mockFetch).toHaveBeenCalledWith(
        'https://auth.example.com/.well-known/oauth-authorization-server',
        expect.any(Object),
      );
    });

    it('throws error if PKCE not supported', async () => {
      const authMetadataWithoutPKCE = {
        issuer: 'https://auth.example.com',
        authorization_endpoint: 'https://auth.example.com/authorize',
        token_endpoint: 'https://auth.example.com/token',
        code_challenge_methods_supported: ['plain'],
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(authMetadataWithoutPKCE),
      });

      const client = new MCPOAuthClient(
        'https://mcp.example.com',
        { clientId: 'test-client', authorizationServer: 'https://auth.example.com' },
        mockTokenStorage,
      );

      await expect(client.discoverAuthServerMetadata()).rejects.toThrow(
        /does not support PKCE with S256/,
      );
    });

    it('throws error when metadata not found', async () => {
      mockFetch
        .mockRejectedValueOnce(new Error('Not found'))
        .mockRejectedValueOnce(new Error('Not found'));

      const client = new MCPOAuthClient(
        'https://mcp.example.com',
        { clientId: 'test-client', authorizationServer: 'https://auth.example.com' },
        mockTokenStorage,
      );

      await expect(client.discoverAuthServerMetadata()).rejects.toThrow(
        /Failed to discover authorization server metadata/,
      );
    });
  });

  describe('buildAuthorizationUrl', () => {
    it('builds correct authorization URL', async () => {
      const authMetadata = {
        issuer: 'https://auth.example.com',
        authorization_endpoint: 'https://auth.example.com/authorize',
        token_endpoint: 'https://auth.example.com/token',
        code_challenge_methods_supported: ['S256'],
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(authMetadata),
      });

      const client = new MCPOAuthClient(
        'https://mcp.example.com',
        { clientId: 'test-client', authorizationServer: 'https://auth.example.com', scopes: ['read', 'write'] },
        mockTokenStorage,
      );

      const url = await client.buildAuthorizationUrl(3000);
      const parsed = new URL(url);

      expect(parsed.origin).toBe('https://auth.example.com');
      expect(parsed.pathname).toBe('/authorize');
      expect(parsed.searchParams.get('response_type')).toBe('code');
      expect(parsed.searchParams.get('client_id')).toBe('test-client');
      expect(parsed.searchParams.get('redirect_uri')).toBe('http://127.0.0.1:3000/callback');
      expect(parsed.searchParams.get('code_challenge_method')).toBe('S256');
      expect(parsed.searchParams.get('scope')).toBe('read write');
      expect(parsed.searchParams.get('resource')).toBe('https://mcp.example.com');
      expect(parsed.searchParams.has('code_challenge')).toBe(true);
      expect(parsed.searchParams.has('state')).toBe(true);
    });

    it('uses WWW-Authenticate scope when no config scopes', async () => {
      const authMetadata = {
        issuer: 'https://auth.example.com',
        authorization_endpoint: 'https://auth.example.com/authorize',
        token_endpoint: 'https://auth.example.com/token',
        code_challenge_methods_supported: ['S256'],
      };

      mockFetch
        .mockResolvedValueOnce({
          ok: false,
          status: 401,
          headers: new Map([['WWW-Authenticate', 'Bearer scope="api:read api:write"']]),
        })
        .mockRejectedValueOnce(new Error('Not found'))
        .mockRejectedValueOnce(new Error('Not found'))
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve(authMetadata),
        });

      const client = new MCPOAuthClient(
        'https://mcp.example.com',
        { clientId: 'test-client' },
        mockTokenStorage,
      );

      const url = await client.buildAuthorizationUrl(3000);
      const parsed = new URL(url);

      expect(parsed.searchParams.get('scope')).toBe('api:read api:write');
    });
  });

  describe('handleCallback', () => {
    it('exchanges code for tokens', async () => {
      const authMetadata = {
        issuer: 'https://auth.example.com',
        authorization_endpoint: 'https://auth.example.com/authorize',
        token_endpoint: 'https://auth.example.com/token',
        code_challenge_methods_supported: ['S256'],
      };

      const tokenResponse = {
        access_token: 'new-access-token',
        refresh_token: 'new-refresh-token',
        expires_in: 3600,
        scope: 'read write',
        token_type: 'Bearer',
      };

      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve(authMetadata),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve(tokenResponse),
        });

      const client = new MCPOAuthClient(
        'https://mcp.example.com',
        { clientId: 'test-client', authorizationServer: 'https://auth.example.com' },
        mockTokenStorage,
      );

      const authUrl = await client.buildAuthorizationUrl(3000);
      const state = new URL(authUrl).searchParams.get('state')!;

      const tokens = await client.handleCallback('auth-code', state);

      expect(tokens.accessToken).toBe('new-access-token');
      expect(tokens.refreshToken).toBe('new-refresh-token');
      expect(tokens.scope).toBe('read write');

      const stored = await mockTokenStorage.get('mcp_oauth_mcp.example.com');
      expect(stored?.accessToken).toBe('new-access-token');
    });

    it('throws error on state mismatch', async () => {
      const authMetadata = {
        issuer: 'https://auth.example.com',
        authorization_endpoint: 'https://auth.example.com/authorize',
        token_endpoint: 'https://auth.example.com/token',
        code_challenge_methods_supported: ['S256'],
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(authMetadata),
      });

      const client = new MCPOAuthClient(
        'https://mcp.example.com',
        { clientId: 'test-client', authorizationServer: 'https://auth.example.com' },
        mockTokenStorage,
      );

      await client.buildAuthorizationUrl(3000);

      await expect(client.handleCallback('auth-code', 'wrong-state')).rejects.toThrow(
        /State mismatch/,
      );
    });

    it('throws error when no pending flow', async () => {
      const client = new MCPOAuthClient(
        'https://mcp.example.com',
        { clientId: 'test-client' },
        mockTokenStorage,
      );

      await expect(client.handleCallback('auth-code', 'some-state')).rejects.toThrow(
        /No pending authorization flow/,
      );
    });
  });
});
