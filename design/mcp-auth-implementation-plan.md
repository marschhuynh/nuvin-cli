# MCP Authentication Implementation Plan

## Overview

This document outlines the plan to add full OAuth 2.1 authentication support for MCP servers per the [MCP Specification 2025-11-25](https://modelcontextprotocol.io/specification/2025-11-25/basic/authorization).

## Implementation Status: ✅ COMPLETED

**Completed Date:** January 2026

All core OAuth 2.1 features have been implemented and tested (683 tests in nuvin-core, 640 tests in nuvin-cli).

### ✅ What's Implemented

| Spec Requirement | Status | Location |
|------------------|--------|----------|
| OAuth 2.1 Authorization Code flow | ✅ Done | `packages/nuvin-core/src/mcp/mcp-oauth-client.ts` |
| RFC9728 Protected Resource Metadata discovery | ✅ Done | `MCPOAuthClient.discoverResourceMetadata()` |
| Authorization Server Metadata discovery (RFC8414) | ✅ Done | `MCPOAuthClient.discoverAuthServerMetadata()` |
| Dynamic Client Registration (RFC7591) | ⏸️ Deferred | Not yet needed |
| Client ID Metadata Documents | ⏸️ Deferred | Not yet needed |
| PKCE (S256 challenge method) | ✅ Done | `MCPOAuthClient.generatePKCE()` |
| Token refresh with rotation | ✅ Done | `MCPOAuthClient.refreshAccessToken()` |
| `WWW-Authenticate` 401/403 handling | ✅ Done | `CoreMCPClient.createAuthAwareFetch()` |
| `resource` parameter (RFC8707) | ✅ Done | Included in auth requests |
| Step-up authorization for insufficient scopes | ✅ Done | Via re-auth flow |
| Secure Token Storage (AES-256-GCM) | ✅ Done | `packages/nuvin-cli/source/services/token-storage.ts` |
| CLI Auth Commands | ✅ Done | `auth`, `login`, `logout`, `auth-status` |
| UI Auth Status | ✅ Done | MCPModal auth badges |

### Infrastructure
- **Transports**: stdio and Streamable HTTP via `@modelcontextprotocol/sdk` v1.24.2
- **Lifecycle**: SDK handles `initialize`/`initialized` handshake
- **Protocol Version**: SDK manages `MCP-Protocol-Version` header
- **Tool Discovery**: `tools/list`, `tools/call` implemented
- **Static Auth**: Manual `headers` config (e.g., `Authorization: Bearer <token>`)
- **Reconnection**: `MCPServerManager.reconnectServer()` implemented

## Implementation Details

### Phase 1: Config Schema Extension ✅

**Files modified:**
- `packages/nuvin-cli/source/config/types.ts`
- `packages/nuvin-cli/source/config/mcp-handler.ts`

**`MCPServerConfig` structure:**

```typescript
interface MCPOAuthConfig {
  clientId?: string;
  authorizationServer?: string;
  scopes?: string[];
  tokenStorageKey?: string;
}

interface MCPAuthConfig {
  type: 'none' | 'bearer' | 'oauth';
  token?: string;
  oauth?: MCPOAuthConfig;
}

interface MCPServerConfig {
  // ... existing fields ...
  auth?: MCPAuthConfig;
  headers?: Record<string, string>;  // Still supported for backward compatibility
}
```

### Phase 2: OAuth Client Implementation ✅

**File:** `packages/nuvin-core/src/mcp/mcp-oauth-client.ts`

**Features:**
- RFC 9728 Protected Resource Metadata discovery
- RFC 8414 Authorization Server Metadata discovery
- OAuth 2.1 Authorization Code flow with PKCE (S256)
- Token management with automatic refresh
- Configurable callback port for localhost redirect

```typescript
export class MCPOAuthClient {
  constructor(
    serverUrl: string,
    config: MCPOAuthConfig,
    tokenStorage: TokenStorage,
    callbackPort?: number
  )

  async discoverResourceMetadata(): Promise<ProtectedResourceMetadata | null>;
  async discoverAuthServerMetadata(): Promise<AuthServerMetadata>;
  async getAccessToken(): Promise<string>;
  async refreshAccessToken(): Promise<void>;
  async initiateAuthFlow(): Promise<AuthFlowResult>;
  async handleCallback(code: string, state: string): Promise<void>;
  isAuthenticated(): boolean;
  clearTokens(): Promise<void>;
}
```

### Phase 3: Secure Token Storage ✅

**File:** `packages/nuvin-cli/source/services/token-storage.ts`

**Implementation:** AES-256-GCM encrypted file storage with machine-specific key derivation.

```typescript
export interface TokenStorage {
  get(key: string): Promise<StoredTokens | null>;
  set(key: string, tokens: StoredTokens): Promise<void>;
  delete(key: string): Promise<void>;
  clear(): Promise<void>;
}

interface StoredTokens {
  accessToken: string;
  refreshToken?: string;
  expiresAt?: number;
  scope?: string;
}
```

### Phase 4: HTTP Transport Integration ✅

**File modified:** `packages/nuvin-core/src/mcp/mcp-client.ts`

**Changes:**
- Dynamic `Authorization` header injection from OAuth client
- 401 response handling with automatic re-authentication
- 403 `insufficient_scope` handling with step-up authorization
- Auth-aware fetch wrapper

### Phase 5: CLI Commands ✅

**File modified:** `packages/nuvin-cli/source/config/mcp-handler.ts`

**Commands:**

```bash
# Configure OAuth for a server
nuvin mcp auth <server-name> --type oauth --client-id <id>
nuvin mcp auth <server-name> --type bearer --token <token>

# Trigger OAuth login flow
nuvin mcp login <server-name>

# Clear stored tokens
nuvin mcp logout <server-name>

# Show auth status
nuvin mcp auth-status <server-name>
```

### Phase 6: UI Integration ✅

**Files modified:**
- `packages/nuvin-cli/source/components/MCPModal.tsx`
- `packages/nuvin-cli/source/services/MCPServerManager.ts`

**Features:**
- Auth status badges (authenticated, expired, needs re-auth)
- Scope information display
- Login action for OAuth servers

## Security Implementation

Per MCP spec security requirements:

1. **PKCE Required**: ✅ Always uses S256 code challenge method
2. **Token Audience Validation**: ✅ Verified via `resource` parameter
3. **No Token Passthrough**: ✅ Tokens only used for MCP server auth
4. **HTTPS Required**: ✅ Enforced for OAuth endpoints (localhost exempt)
5. **Localhost Redirects**: ✅ Only `http://127.0.0.1` allowed for CLI
6. **State Parameter**: ✅ Always verified to prevent CSRF
7. **Short-lived Tokens**: ✅ Automatic refresh implemented
8. **Encrypted Storage**: ✅ AES-256-GCM with machine-derived key

## Backward Compatibility

1. **Headers Config**: Existing `headers` config continues to work
2. **Bearer Auth**: Can use `auth.type: 'bearer'` with static token
3. **No Breaking Changes**: All existing MCP configurations remain valid

## Future Enhancements

| Feature | Status | Notes |
|---------|--------|-------|
| Dynamic Client Registration (RFC7591) | Deferred | Add when MCP servers require it |
| Client ID Metadata Documents | Deferred | Add when MCP servers require it |
| Keychain Integration (macOS/Windows) | Deferred | Current encrypted file approach works cross-platform |

## Testing

- **Unit Tests**: OAuth client, token storage, discovery parsing
- **Integration Tests**: Mock OAuth server for full flow testing
- **Test Coverage**: 683 tests (nuvin-core), 640 tests (nuvin-cli)

## References

- [MCP Spec 2025-11-25 Authorization](https://modelcontextprotocol.io/specification/2025-11-25/basic/authorization)
- [OAuth 2.1 Draft](https://datatracker.ietf.org/doc/html/draft-ietf-oauth-v2-1-13)
- [RFC9728 - OAuth Protected Resource Metadata](https://datatracker.ietf.org/doc/html/rfc9728)
- [RFC8414 - OAuth Authorization Server Metadata](https://datatracker.ietf.org/doc/html/rfc8414)
- [RFC7591 - Dynamic Client Registration](https://datatracker.ietf.org/doc/html/rfc7591)
- [RFC8707 - Resource Indicators](https://www.rfc-editor.org/rfc/rfc8707.html)
- [Client ID Metadata Documents Draft](https://datatracker.ietf.org/doc/html/draft-ietf-oauth-client-id-metadata-document-00)
