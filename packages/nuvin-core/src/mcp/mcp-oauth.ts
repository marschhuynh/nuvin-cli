import * as crypto from 'node:crypto';
import * as http from 'node:http';
import { URL } from 'node:url';

export interface MCPOAuthConfig {
  clientId?: string;
  clientMetadataUrl?: string;
  authorizationServer?: string;
  scopes?: string[];
  tokenStorageKey?: string;
}

export interface OAuthDiscoveryResult {
  authorizationServerUrl: string;
  authServerMetadata?: AuthServerMetadata;
  protectedResourceMetadata?: ProtectedResourceMetadata;
  wwwAuthenticateScope?: string;
}

export interface StoredTokens {
  accessToken: string;
  refreshToken?: string;
  expiresAt?: number;
  scope?: string;
  tokenType?: string;
}

export interface TokenStorage {
  get(key: string): Promise<StoredTokens | null>;
  set(key: string, tokens: StoredTokens): Promise<void>;
  delete(key: string): Promise<void>;
}

export interface ProtectedResourceMetadata {
  resource: string;
  authorization_servers?: string[];
  scopes_supported?: string[];
  bearer_methods_supported?: string[];
}

export interface AuthServerMetadata {
  issuer: string;
  authorization_endpoint: string;
  token_endpoint: string;
  registration_endpoint?: string;
  scopes_supported?: string[];
  response_types_supported?: string[];
  code_challenge_methods_supported?: string[];
  grant_types_supported?: string[];
  client_id_metadata_document_supported?: boolean;
}

export interface AuthFlowResult {
  success: boolean;
  tokens?: StoredTokens;
  error?: string;
}

interface PKCEChallenge {
  codeVerifier: string;
  codeChallenge: string;
  state: string;
}

interface PendingAuthFlow {
  pkce: PKCEChallenge;
  redirectUri: string;
  scopes: string[];
  resource: string;
}

function base64UrlEncode(buffer: Buffer): string {
  return buffer.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function generateCodeVerifier(): string {
  return base64UrlEncode(crypto.randomBytes(32));
}

function generateCodeChallenge(verifier: string): string {
  const hash = crypto.createHash('sha256').update(verifier).digest();
  return base64UrlEncode(hash);
}

function generateState(): string {
  return base64UrlEncode(crypto.randomBytes(16));
}

async function fetchJson<T>(url: string, options?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...options,
    headers: {
      Accept: 'application/json',
      ...options?.headers,
    },
  });

  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(`HTTP ${response.status}: ${text || response.statusText}`);
  }

  return response.json() as Promise<T>;
}

export class MCPOAuthClient {
  private protectedResourceMetadata: ProtectedResourceMetadata | null = null;
  private authServerMetadata: AuthServerMetadata | null = null;
  private pendingFlow: PendingAuthFlow | null = null;
  private callbackServer: http.Server | null = null;
  private discoveryResult: OAuthDiscoveryResult | null = null;
  private wwwAuthenticateScope: string | null = null;
  private cachedClientId: string | null = null;
  private cachedRedirectUris: string[] | null = null;

  constructor(
    private serverUrl: string,
    private config: MCPOAuthConfig,
    private tokenStorage: TokenStorage,
  ) {}

  private get storageKey(): string {
    return this.config.tokenStorageKey || `mcp_oauth_${new URL(this.serverUrl).host}`;
  }

  async discoverOAuthServer(): Promise<OAuthDiscoveryResult> {
    if (this.discoveryResult) {
      return this.discoveryResult;
    }

    if (this.config.authorizationServer) {
      const authServerMetadata = await this.fetchAuthServerMetadataFromUrl(this.config.authorizationServer);
      this.discoveryResult = {
        authorizationServerUrl: this.config.authorizationServer,
        authServerMetadata: authServerMetadata || undefined,
      };
      return this.discoveryResult;
    }

    let wwwAuthenticateHeader: string | undefined;

    try {
      const response = await fetch(this.serverUrl, {
        method: 'GET',
        headers: { Accept: 'application/json, text/event-stream' },
        signal: AbortSignal.timeout(10000),
      });

      if (response.ok) {
        const authServerMetadata = await this.fetchAuthServerMetadataFromUrl(this.serverUrl);
        this.discoveryResult = {
          authorizationServerUrl: this.serverUrl,
          authServerMetadata: authServerMetadata || undefined,
        };
        return this.discoveryResult;
      }

      if (response.status === 401) {
        wwwAuthenticateHeader = response.headers.get('WWW-Authenticate') || undefined;

        if (wwwAuthenticateHeader) {
          const parsed = parseWWWAuthenticate(wwwAuthenticateHeader);
          this.wwwAuthenticateScope = parsed.params.scope || null;
        }
      }
    } catch {
      // Continue with discovery
    }

    const protectedResourceMetadata = await this.tryDiscoverProtectedResourceMetadata(wwwAuthenticateHeader);

    let authorizationServerUrl: string;

    if (protectedResourceMetadata?.authorization_servers?.length) {
      authorizationServerUrl = protectedResourceMetadata.authorization_servers[0];
      this.protectedResourceMetadata = protectedResourceMetadata;
    } else {
      authorizationServerUrl = this.serverUrl;
    }

    const authServerMetadata = await this.fetchAuthServerMetadataFromUrl(authorizationServerUrl);

    this.discoveryResult = {
      authorizationServerUrl,
      authServerMetadata: authServerMetadata || undefined,
      protectedResourceMetadata: protectedResourceMetadata || undefined,
      wwwAuthenticateScope: this.wwwAuthenticateScope || undefined,
    };

    return this.discoveryResult;
  }

  private async tryDiscoverProtectedResourceMetadata(
    wwwAuthenticateHeader?: string,
  ): Promise<ProtectedResourceMetadata | null> {
    if (wwwAuthenticateHeader) {
      const parsed = parseWWWAuthenticate(wwwAuthenticateHeader);
      if (parsed.params.resource_metadata) {
        try {
          return await fetchJson<ProtectedResourceMetadata>(parsed.params.resource_metadata);
        } catch {
          // Fall through to well-known discovery
        }
      }
    }

    const serverUrl = new URL(this.serverUrl);
    const pathSegments = serverUrl.pathname.split('/').filter(Boolean);

    const wellKnownUrls = [
      pathSegments.length > 0
        ? `${serverUrl.origin}/.well-known/oauth-protected-resource/${pathSegments.join('/')}`
        : null,
      `${serverUrl.origin}/.well-known/oauth-protected-resource`,
    ].filter((url): url is string => url !== null);

    for (const url of wellKnownUrls) {
      try {
        return await fetchJson<ProtectedResourceMetadata>(url);
      } catch {
        // Try next URL
      }
    }

    return null;
  }

  private async fetchAuthServerMetadataFromUrl(authServerUrl: string): Promise<AuthServerMetadata | null> {
    const issuerUrl = new URL(authServerUrl);
    const pathSegments = issuerUrl.pathname.split('/').filter(Boolean);

    // Always include origin-level well-known URLs as fallback
    const wellKnownUrls =
      pathSegments.length > 0
        ? [
            `${issuerUrl.origin}/.well-known/oauth-authorization-server/${pathSegments.join('/')}`,
            `${issuerUrl.origin}/.well-known/openid-configuration/${pathSegments.join('/')}`,
            `${issuerUrl.origin}/${pathSegments.join('/')}/.well-known/openid-configuration`,
            // Fallback to origin-level (e.g., Atlassian serves metadata at origin)
            `${issuerUrl.origin}/.well-known/oauth-authorization-server`,
            `${issuerUrl.origin}/.well-known/openid-configuration`,
          ]
        : [
            `${issuerUrl.origin}/.well-known/oauth-authorization-server`,
            `${issuerUrl.origin}/.well-known/openid-configuration`,
          ];

    for (const url of wellKnownUrls) {
      try {
        const metadata = await fetchJson<AuthServerMetadata>(url);
        return metadata;
      } catch {
        // Try next URL
      }
    }

    return null;
  }

  async discoverProtectedResourceMetadata(): Promise<ProtectedResourceMetadata> {
    if (this.protectedResourceMetadata) {
      return this.protectedResourceMetadata;
    }

    const discovery = await this.discoverOAuthServer();
    if (discovery.protectedResourceMetadata) {
      this.protectedResourceMetadata = discovery.protectedResourceMetadata;
      return this.protectedResourceMetadata;
    }

    throw new Error(
      `Failed to discover protected resource metadata for ${this.serverUrl}. ` +
        'The server does not expose RFC 9728 metadata. ' +
        'Please configure authorizationServer manually.',
    );
  }

  async discoverAuthServerMetadata(): Promise<AuthServerMetadata> {
    if (this.authServerMetadata) {
      return this.authServerMetadata;
    }

    const discovery = await this.discoverOAuthServer();

    if (discovery.authServerMetadata) {
      if (!discovery.authServerMetadata.code_challenge_methods_supported?.includes('S256')) {
        throw new Error('Authorization server does not support PKCE with S256');
      }
      this.authServerMetadata = discovery.authServerMetadata;
      return this.authServerMetadata;
    }

    throw new Error(
      `Failed to discover authorization server metadata for ${discovery.authorizationServerUrl}. ` +
        'Please verify the authorizationServer URL is correct.',
    );
  }

  async getAccessToken(): Promise<string | null> {
    const tokens = await this.tokenStorage.get(this.storageKey);
    if (!tokens) {
      return null;
    }

    if (tokens.expiresAt && Date.now() >= tokens.expiresAt - 60000) {
      if (tokens.refreshToken) {
        try {
          const refreshedTokens = await this.refreshTokens(tokens.refreshToken);
          return refreshedTokens.accessToken;
        } catch {
          await this.tokenStorage.delete(this.storageKey);
          return null;
        }
      }
      await this.tokenStorage.delete(this.storageKey);
      return null;
    }

    return tokens.accessToken;
  }

  async hasValidToken(): Promise<boolean> {
    const token = await this.getAccessToken();
    return token !== null;
  }

  private async refreshTokens(refreshToken: string): Promise<StoredTokens> {
    const authServer = await this.discoverAuthServerMetadata();

    const params = new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
      client_id: await this.getClientId(),
    });

    const response = await fetch(authServer.token_endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Accept: 'application/json',
      },
      body: params.toString(),
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => '');
      throw new Error(`Token refresh failed: ${response.status} ${errorText}`);
    }

    const tokenResponse = (await response.json()) as {
      access_token: string;
      refresh_token?: string;
      expires_in?: number;
      scope?: string;
      token_type?: string;
    };

    const tokens: StoredTokens = {
      accessToken: tokenResponse.access_token,
      refreshToken: tokenResponse.refresh_token || refreshToken,
      expiresAt: tokenResponse.expires_in ? Date.now() + tokenResponse.expires_in * 1000 : undefined,
      scope: tokenResponse.scope,
      tokenType: tokenResponse.token_type || 'Bearer',
    };

    await this.tokenStorage.set(this.storageKey, tokens);
    return tokens;
  }

  private async getClientId(): Promise<string> {
    // Return cached client ID if available (important for token exchange)
    if (this.cachedClientId) {
      return this.cachedClientId;
    }

    if (this.config.clientId) {
      this.cachedClientId = this.config.clientId;
      return this.cachedClientId;
    }

    if (this.config.clientMetadataUrl) {
      this.cachedClientId = this.config.clientMetadataUrl;
      return this.cachedClientId;
    }

    const authServer = await this.discoverAuthServerMetadata();

    if (authServer.registration_endpoint) {
      const clientMetadata = {
        client_name: 'Nuvin CLI',
        redirect_uris: ['http://127.0.0.1:3334/callback'],
        grant_types: ['authorization_code', 'refresh_token'],
        response_types: ['code'],
        token_endpoint_auth_method: 'none',
      };

      try {
        const response = await fetch(authServer.registration_endpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Accept: 'application/json',
          },
          body: JSON.stringify(clientMetadata),
        });

        if (response.ok) {
          const client = (await response.json()) as { client_id: string; redirect_uris?: string[] };
          this.cachedClientId = client.client_id;
          if (client.redirect_uris?.length) {
            this.cachedRedirectUris = client.redirect_uris;
          }
          return this.cachedClientId;
        }
      } catch {
        // Fall through to error
      }
    }

    throw new Error(
      'No client ID configured and dynamic client registration failed. ' +
        'Please configure clientId or clientMetadataUrl.',
    );
  }

  async buildAuthorizationUrl(port: number): Promise<string> {
    const authServer = await this.discoverAuthServerMetadata();
    const clientId = await this.getClientId();

    const codeVerifier = generateCodeVerifier();
    const codeChallenge = generateCodeChallenge(codeVerifier);
    const state = generateState();

    const redirectUri = `http://127.0.0.1:${port}/callback`;

    const scopes = this.getEffectiveScopes();

    const serverUrl = new URL(this.serverUrl);
    const resource = `${serverUrl.origin}${serverUrl.pathname}`.replace(/\/$/, '');

    this.pendingFlow = {
      pkce: { codeVerifier, codeChallenge, state },
      redirectUri,
      scopes,
      resource,
    };

    const params = new URLSearchParams({
      response_type: 'code',
      client_id: clientId,
      redirect_uri: redirectUri,
      state,
      code_challenge: codeChallenge,
      code_challenge_method: 'S256',
      resource,
    });

    if (scopes.length > 0) {
      params.set('scope', scopes.join(' '));
    }

    return `${authServer.authorization_endpoint}?${params.toString()}`;
  }

  private getEffectiveScopes(): string[] {
    if (this.config.scopes && this.config.scopes.length > 0) {
      return this.config.scopes;
    }

    if (this.wwwAuthenticateScope) {
      return this.wwwAuthenticateScope.split(' ').filter(Boolean);
    }

    if (this.protectedResourceMetadata?.scopes_supported?.length) {
      return this.protectedResourceMetadata.scopes_supported;
    }

    if (this.authServerMetadata?.scopes_supported?.length) {
      return this.authServerMetadata.scopes_supported;
    }

    return [];
  }

  async handleCallback(code: string, state: string): Promise<StoredTokens> {
    if (!this.pendingFlow) {
      throw new Error('No pending authorization flow');
    }

    if (state !== this.pendingFlow.pkce.state) {
      throw new Error('State mismatch - possible CSRF attack');
    }

    const authServer = await this.discoverAuthServerMetadata();
    const clientId = await this.getClientId();

    const params = new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: this.pendingFlow.redirectUri,
      client_id: clientId,
      code_verifier: this.pendingFlow.pkce.codeVerifier,
      resource: this.pendingFlow.resource,
    });

    const response = await fetch(authServer.token_endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Accept: 'application/json',
      },
      body: params.toString(),
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => '');
      throw new Error(`Token exchange failed: ${response.status} ${errorText}`);
    }

    const tokenResponse = (await response.json()) as {
      access_token: string;
      refresh_token?: string;
      expires_in?: number;
      scope?: string;
      token_type?: string;
    };

    const tokens: StoredTokens = {
      accessToken: tokenResponse.access_token,
      refreshToken: tokenResponse.refresh_token,
      expiresAt: tokenResponse.expires_in ? Date.now() + tokenResponse.expires_in * 1000 : undefined,
      scope: tokenResponse.scope,
      tokenType: tokenResponse.token_type || 'Bearer',
    };

    await this.tokenStorage.set(this.storageKey, tokens);
    this.pendingFlow = null;

    return tokens;
  }

  async initiateAuthFlow(openBrowser: (url: string) => Promise<void>): Promise<AuthFlowResult> {
    return new Promise(async (resolve) => {
      let port: number;

      try {
        port = await this.findAvailablePort();
      } catch (err) {
        resolve({
          success: false,
          error: `Failed to find available port: ${err instanceof Error ? err.message : String(err)}`,
        });
        return;
      }

      const timeout = setTimeout(
        () => {
          this.stopCallbackServer();
          resolve({ success: false, error: 'Authorization timed out after 5 minutes' });
        },
        5 * 60 * 1000,
      );

      this.callbackServer = http.createServer(async (req, res) => {
        const url = new URL(req.url || '/', `http://127.0.0.1:${port}`);

        if (url.pathname !== '/callback') {
          res.writeHead(404);
          res.end('Not found');
          return;
        }

        const code = url.searchParams.get('code');
        const state = url.searchParams.get('state');
        const error = url.searchParams.get('error');
        const errorDescription = url.searchParams.get('error_description');

        clearTimeout(timeout);

        if (error) {
          res.writeHead(200, { 'Content-Type': 'text/html' });
          res.end(this.generateErrorHtml(error, errorDescription));
          this.stopCallbackServer();
          resolve({ success: false, error: errorDescription || error });
          return;
        }

        if (!code || !state) {
          res.writeHead(400, { 'Content-Type': 'text/html' });
          res.end(this.generateErrorHtml('Invalid callback', 'Missing code or state parameter'));
          this.stopCallbackServer();
          resolve({ success: false, error: 'Missing code or state parameter' });
          return;
        }

        try {
          const tokens = await this.handleCallback(code, state);
          res.writeHead(200, { 'Content-Type': 'text/html' });
          res.end(this.generateSuccessHtml());
          this.stopCallbackServer();
          resolve({ success: true, tokens });
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          res.writeHead(500, { 'Content-Type': 'text/html' });
          res.end(this.generateErrorHtml('Token exchange failed', message));
          this.stopCallbackServer();
          resolve({ success: false, error: message });
        }
      });

      this.callbackServer.listen(port, '127.0.0.1', async () => {
        try {
          const authUrl = await this.buildAuthorizationUrl(port);
          await openBrowser(authUrl);
        } catch (err) {
          clearTimeout(timeout);
          this.stopCallbackServer();
          resolve({
            success: false,
            error: `Failed to start authorization: ${err instanceof Error ? err.message : String(err)}`,
          });
        }
      });

      this.callbackServer.on('error', (err) => {
        clearTimeout(timeout);
        resolve({ success: false, error: `Callback server error: ${err.message}` });
      });
    });
  }

  private stopCallbackServer(): void {
    if (this.callbackServer) {
      this.callbackServer.close();
      this.callbackServer = null;
    }
  }

  private async findAvailablePort(): Promise<number> {
    // Extract ports from cached redirect URIs if available
    if (this.cachedRedirectUris?.length) {
      for (const uri of this.cachedRedirectUris) {
        try {
          const url = new URL(uri);
          const port = parseInt(url.port, 10);
          if (port && (await this.isPortAvailable(port))) {
            return port;
          }
        } catch {
          // Invalid URL, skip
        }
      }
    }

    // Fallback to default port
    const defaultPort = 3334;
    if (await this.isPortAvailable(defaultPort)) {
      return defaultPort;
    }
    throw new Error(`No available port found. Please free port ${defaultPort} and try again.`);
  }

  private isPortAvailable(port: number): Promise<boolean> {
    return new Promise((resolve) => {
      const server = http.createServer();
      server.listen(port, '127.0.0.1', () => {
        server.close(() => resolve(true));
      });
      server.on('error', () => resolve(false));
    });
  }

  private generateSuccessHtml(): string {
    return `<!DOCTYPE html>
<html>
<head>
  <title>Authorization Successful</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; 
           display: flex; justify-content: center; align-items: center; height: 100vh; 
           margin: 0; background: #f5f5f5; }
    .container { text-align: center; padding: 40px; background: white; 
                 border-radius: 8px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
    .success { color: #22c55e; font-size: 48px; }
    h1 { color: #333; margin: 20px 0 10px; }
    p { color: #666; }
  </style>
</head>
<body>
  <div class="container">
    <div class="success">✓</div>
    <h1>Authorization Successful</h1>
    <p>You can close this window and return to the terminal.</p>
  </div>
</body>
</html>`;
  }

  private generateErrorHtml(error: string, description?: string | null): string {
    return `<!DOCTYPE html>
<html>
<head>
  <title>Authorization Failed</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; 
           display: flex; justify-content: center; align-items: center; height: 100vh; 
           margin: 0; background: #f5f5f5; }
    .container { text-align: center; padding: 40px; background: white; 
                 border-radius: 8px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
    .error { color: #ef4444; font-size: 48px; }
    h1 { color: #333; margin: 20px 0 10px; }
    p { color: #666; }
    .detail { color: #999; font-size: 14px; margin-top: 10px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="error">✗</div>
    <h1>Authorization Failed</h1>
    <p>${error}</p>
    ${description ? `<p class="detail">${description}</p>` : ''}
  </div>
</body>
</html>`;
  }

  async logout(): Promise<void> {
    await this.tokenStorage.delete(this.storageKey);
  }

  async getAuthStatus(): Promise<{
    authenticated: boolean;
    expiresAt?: number;
    scope?: string;
  }> {
    const tokens = await this.tokenStorage.get(this.storageKey);
    if (!tokens) {
      return { authenticated: false };
    }

    const isExpired = tokens.expiresAt && Date.now() >= tokens.expiresAt;
    return {
      authenticated: !isExpired,
      expiresAt: tokens.expiresAt,
      scope: tokens.scope,
    };
  }
}

export function parseWWWAuthenticate(header: string): {
  scheme: string;
  params: Record<string, string>;
} {
  if (!header || header.trim() === '') {
    return { scheme: '', params: {} };
  }

  const schemeMatch = header.match(/^(\w+)\s*/);
  const scheme = schemeMatch?.[1] || 'Bearer';
  const params: Record<string, string> = {};

  const paramString = schemeMatch ? header.slice(schemeMatch[0].length) : header;

  const paramRegex = /(\w+)=(?:"([^"]*)"|([^\s,]+))(?:,\s*)?/g;
  let match: RegExpExecArray | null;

  while ((match = paramRegex.exec(paramString)) !== null) {
    const key = match[1];
    const value = match[2] ?? match[3];
    if (key && value !== undefined) {
      params[key] = value;
    }
  }

  return { scheme, params };
}

export function isInsufficientScopeError(
  status: number,
  wwwAuthenticate?: string,
): { isError: boolean; requiredScopes?: string[] } {
  if (status === 403 && wwwAuthenticate) {
    const parsed = parseWWWAuthenticate(wwwAuthenticate);
    if (parsed.params.error === 'insufficient_scope') {
      const scopes = parsed.params.scope?.split(' ').filter(Boolean);
      return { isError: true, requiredScopes: scopes };
    }
  }
  return { isError: false };
}

export function isUnauthorizedError(
  status: number,
  wwwAuthenticate?: string,
): { isError: boolean; resourceMetadataUrl?: string; requiredScopes?: string[] } {
  if (status === 401) {
    if (wwwAuthenticate) {
      const parsed = parseWWWAuthenticate(wwwAuthenticate);
      return {
        isError: true,
        resourceMetadataUrl: parsed.params.resource_metadata,
        requiredScopes: parsed.params.scope?.split(' ').filter(Boolean),
      };
    }
    return { isError: true };
  }
  return { isError: false };
}
