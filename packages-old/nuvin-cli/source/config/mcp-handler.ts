import { ConfigManager } from './manager.js';
import type { ConfigScope, MCPServerConfig, MCPAuthConfig } from './types.js';
import { MCPOAuthClient, type TokenStorage, type StoredTokens } from '@nuvin/nuvin-core';

export type { MCPServerConfig } from './types.js';

class NoopTokenStorage implements TokenStorage {
  async get(_key: string): Promise<StoredTokens | null> {
    return null;
  }
  async set(_key: string, _tokens: StoredTokens): Promise<void> {}
  async delete(_key: string): Promise<void> {}
}

export class MCPCliHandler {
  private configManager: ConfigManager;
  private profile?: string;

  constructor(profile?: string) {
    this.configManager = ConfigManager.getInstance();
    this.profile = profile;
  }

  private globalScope: ConfigScope = 'global';
  private scopeExplicit = false;

  async handleMCPCommand(args: string[], profile?: string): Promise<void> {
    this.profile = profile;

    await this.configManager.load({ profile: this.profile });

    const remaining = [...args];

    // Parse scope flags before subcommand: mcp --local add ...
    while (remaining.length > 0) {
      if (remaining[0] === '--local') {
        this.globalScope = 'local';
        this.scopeExplicit = true;
        remaining.shift();
      } else if (remaining[0] === '--global') {
        this.globalScope = 'global';
        this.scopeExplicit = true;
        remaining.shift();
      } else if (remaining[0] === '--scope' && remaining[1]) {
        const scopeValue = remaining[1].toLowerCase();
        if (scopeValue === 'local' || scopeValue === 'global') {
          this.globalScope = scopeValue;
          this.scopeExplicit = true;
        }
        remaining.splice(0, 2);
      } else {
        break;
      }
    }

    const [command, ...rest] = remaining;

    switch (command) {
      case 'list':
        await this.listServers(rest);
        break;
      case 'add':
        await this.addServer(rest[0], rest.slice(1));
        break;
      case 'remove':
        await this.removeServer(rest[0]);
        break;
      case 'show':
        await this.showServer(rest[0], rest);
        break;
      case 'enable':
        await this.setServerEnabled(rest[0], true);
        break;
      case 'disable':
        await this.setServerEnabled(rest[0], false);
        break;
      case 'test':
        await this.testServer(rest[0], rest.slice(1));
        break;
      case 'auth':
        await this.configureAuth(rest[0], rest.slice(1));
        break;
      case 'login':
        await this.loginServer(rest[0]);
        break;
      case 'logout':
        await this.logoutServer(rest[0]);
        break;
      case 'auth-status':
        await this.showAuthStatus(rest[0]);
        break;
      case 'help':
      case '--help':
      case '-h':
        this.showHelp();
        break;
      default:
        if (!command) {
          this.showHelp();
        } else {
          console.error(`\nError: Unknown mcp command '${command}'\n`);
          console.log('Available commands:');
          console.log('  list              List all MCP servers');
          console.log('  add <name>        Add a new MCP server (stdio or HTTP)');
          console.log('  remove <name>     Remove an MCP server');
          console.log('  show <name>       Show server configuration');
          console.log('  enable <name>     Enable a server');
          console.log('  disable <name>    Disable a server');
          console.log('  test <name>       Test server connection');
          console.log('  auth <name>       Configure authentication for a server');
          console.log('  login <name>      Authenticate with an OAuth server');
          console.log('  logout <name>     Clear stored tokens for a server');
          console.log('  auth-status <name> Show authentication status');
          console.log('  help              Show detailed help');
          console.log('\nExamples:');
          console.log('  nuvin mcp add myserver npx @org/mcp-server');
          console.log('  nuvin mcp add api --url https://api.example.com');
          console.log('  nuvin mcp auth api --oauth --client-id my-client');
          console.log('  nuvin mcp login api');
          console.log('\nFor more details, run: nuvin mcp help\n');
          process.exit(1);
        }
    }
  }

  private async listServers(options: string[]): Promise<void> {
    const servers = (this.configManager.get('mcp.servers') as Record<string, MCPServerConfig>) || {};
    const isJson = options.includes('--json');

    if (isJson) {
      console.log(JSON.stringify(servers, null, 2));
      return;
    }

    const entries = Object.entries(servers);
    if (entries.length === 0) {
      console.log('\nNo MCP servers configured.');
      console.log('Use `nuvin mcp add <name>` to add a server.\n');
      return;
    }

    console.log('\nMCP Servers:');
    console.log('============');

    for (const [name, config] of entries) {
      const transport = config.transport || 'stdio';
      const enabled = config.enabled !== false;
      const status = enabled ? '✓ enabled' : '✗ disabled';
      const prefix = config.prefix || `mcp_${name}_`;
      const authType = config.auth?.type || 'none';
      const authInfo = authType !== 'none' ? ` [${authType}]` : '';

      console.log(`  ${name.padEnd(14)} ${transport.padEnd(6)} ${status.padEnd(12)} prefix: ${prefix}${authInfo}`);
    }

    const enabledCount = entries.filter(([, c]) => c.enabled !== false).length;
    console.log(`\nTotal: ${entries.length} servers (${enabledCount} enabled)\n`);
  }

  private async addServer(name: string | undefined, options: string[]): Promise<void> {
    if (!name) {
      console.error('Error: Server name is required');
      console.log('Usage: nuvin mcp add <name> <command> [args...] [options]');
      console.log('       nuvin mcp add <name> --url <url> [options]');
      process.exit(1);
    }

    const existing = this.configManager.get(`mcp.servers.${name}`);
    if (existing) {
      console.error(`Error: MCP server '${name}' already exists`);
      console.log('Use `nuvin mcp remove` first or choose a different name.');
      process.exit(1);
    }

    const config = this.parseServerOptions(options);

    if (config.url) {
      if (config.auth?.type === 'oauth' && !config.auth.oauth?.authorizationServer) {
        console.log('Discovering OAuth configuration...');
        const discoveredAuth = await this.discoverOAuthConfig(config.url);
        if (discoveredAuth) {
          if (!config.auth.oauth) config.auth.oauth = {};
          config.auth.oauth.authorizationServer = discoveredAuth.authorizationServer;
          if (discoveredAuth.scopes && !config.auth.oauth.scopes?.length) {
            config.auth.oauth.scopes = discoveredAuth.scopes;
          }
          console.log(`  ✓ Authorization server: ${discoveredAuth.authorizationServer}`);
          if (discoveredAuth.scopes?.length) {
            console.log(`  ✓ Discovered scopes: ${discoveredAuth.scopes.join(', ')}`);
          }
        }
      }
    } else if (!config.command) {
      console.error('Error: command is required for stdio transport');
      console.log('Usage: nuvin mcp add <name> <command> [args...]');
      console.log('       nuvin mcp add <name> --url <url> [options]');
      process.exit(1);
    }

    await this.configManager.set(`mcp.servers.${name}`, config, this.globalScope);

    console.log(`✓ Added MCP server '${name}' (${this.globalScope} scope)`);

    // Auto-login if OAuth is configured
    if (config.auth?.type === 'oauth' && config.url) {
      console.log('\nInitiating OAuth login...');
      await this.loginServer(name);
    }
  }

  private async discoverOAuthConfig(
    serverUrl: string,
  ): Promise<{ authorizationServer: string; scopes?: string[] } | null> {
    try {
      const oauthClient = new MCPOAuthClient(serverUrl, {}, new NoopTokenStorage());
      const discovery = await oauthClient.discoverOAuthServer();

      return {
        authorizationServer: discovery.authorizationServerUrl,
        scopes:
          discovery.wwwAuthenticateScope?.split(' ').filter(Boolean) ||
          discovery.protectedResourceMetadata?.scopes_supported ||
          discovery.authServerMetadata?.scopes_supported,
      };
    } catch (err) {
      console.log(`  ⚠ Could not auto-discover OAuth config: ${err instanceof Error ? err.message : String(err)}`);
      console.log('  You may need to configure --auth-server manually.');
      return null;
    }
  }

  private parseServerOptions(options: string[]): MCPServerConfig {
    const config: MCPServerConfig = { enabled: true };
    const positionalArgs: string[] = [];
    const knownFlags = new Set([
      '--command',
      '--args',
      '--env',
      '--transport',
      '--url',
      '--header',
      '--prefix',
      '--timeout',
      '--disabled',
      '--auth-type',
      '--auth-token',
      '--oauth',
      '--client-id',
      '--client-metadata-url',
      '--auth-server',
      '--scopes',
    ]);

    const isUrl = (str: string): boolean => str.startsWith('http://') || str.startsWith('https://');

    for (let i = 0; i < options.length; i++) {
      const flag = options[i];
      const value = options[i + 1];

      if (!knownFlags.has(flag)) {
        positionalArgs.push(flag);
        continue;
      }

      switch (flag) {
        case '--command':
          config.command = value;
          i++;
          break;
        case '--args':
          if (value) {
            if (value.includes(',')) {
              config.args = value.split(',').map((s) => s.trim());
            } else {
              config.args = value.split(/\s+/).filter(Boolean);
            }
          }
          i++;
          break;
        case '--env': {
          if (!config.env) config.env = {};
          const eqIdx = value?.indexOf('=') ?? -1;
          if (eqIdx > 0 && value) {
            const key = value.slice(0, eqIdx);
            const val = value.slice(eqIdx + 1);
            config.env[key] = val;
          }
          i++;
          break;
        }
        case '--transport':
          config.transport = value as 'stdio' | 'http';
          i++;
          break;
        case '--url':
          config.url = value;
          config.transport = 'http';
          i++;
          break;
        case '--header': {
          if (!config.headers) config.headers = {};
          const hEqIdx = value?.indexOf('=') ?? -1;
          if (hEqIdx > 0 && value) {
            const hkey = value.slice(0, hEqIdx);
            const hval = value.slice(hEqIdx + 1);
            config.headers[hkey] = hval;
          }
          i++;
          break;
        }
        case '--prefix':
          config.prefix = value;
          i++;
          break;
        case '--timeout':
          config.timeoutMs = Number.parseInt(value || '120000', 10);
          i++;
          break;
        case '--disabled':
          config.enabled = false;
          break;
        case '--auth-type':
          if (!config.auth) config.auth = { type: 'none' };
          config.auth.type = value as 'none' | 'bearer' | 'oauth';
          i++;
          break;
        case '--auth-token':
          if (!config.auth) config.auth = { type: 'bearer' };
          config.auth.type = 'bearer';
          config.auth.token = value;
          i++;
          break;
        case '--oauth':
          if (!config.auth) config.auth = { type: 'oauth' };
          config.auth.type = 'oauth';
          if (!config.auth.oauth) config.auth.oauth = {};
          break;
        case '--client-id':
          if (!config.auth) config.auth = { type: 'oauth' };
          config.auth.type = 'oauth';
          if (!config.auth.oauth) config.auth.oauth = {};
          config.auth.oauth.clientId = value;
          i++;
          break;
        case '--client-metadata-url':
          if (!config.auth) config.auth = { type: 'oauth' };
          config.auth.type = 'oauth';
          if (!config.auth.oauth) config.auth.oauth = {};
          config.auth.oauth.clientMetadataUrl = value;
          i++;
          break;
        case '--auth-server':
          if (!config.auth) config.auth = { type: 'oauth' };
          config.auth.type = 'oauth';
          if (!config.auth.oauth) config.auth.oauth = {};
          config.auth.oauth.authorizationServer = value;
          i++;
          break;
        case '--scopes':
          if (!config.auth) config.auth = { type: 'oauth' };
          config.auth.type = 'oauth';
          if (!config.auth.oauth) config.auth.oauth = {};
          config.auth.oauth.scopes = value?.split(',').map((s) => s.trim());
          i++;
          break;
      }
    }

    if (positionalArgs.length > 0) {
      const firstArg = positionalArgs[0];

      if (isUrl(firstArg)) {
        config.url = firstArg;
        config.transport = 'http';
        if (positionalArgs.length > 1) {
          console.error('Warning: Additional positional arguments ignored when URL is provided');
        }
      } else if (!config.command && !config.url) {
        config.command = firstArg;
        if (positionalArgs.length > 1) {
          config.args = positionalArgs.slice(1);
        }
      }
    }

    return config;
  }

  private async configureAuth(name: string | undefined, options: string[]): Promise<void> {
    if (!name) {
      console.error('Error: Server name is required');
      console.log('Usage: nuvin mcp auth <name> [options]');
      console.log('Options:');
      console.log('  --none                 Disable authentication');
      console.log('  --bearer <token>       Use static bearer token');
      console.log('  --oauth                Enable OAuth 2.1 authentication');
      console.log('  --client-id <id>       OAuth client ID');
      console.log('  --client-metadata-url <url>  OAuth client metadata URL');
      console.log('  --auth-server <url>    OAuth authorization server URL');
      console.log('  --scopes <scope1,scope2>  OAuth scopes (comma-separated)');
      process.exit(1);
    }

    const existing = this.configManager.get(`mcp.servers.${name}`) as MCPServerConfig | undefined;
    if (!existing) {
      console.error(`Error: MCP server '${name}' not found`);
      process.exit(1);
    }

    if (existing.transport !== 'http' && !existing.url) {
      console.error('Error: Authentication is only supported for HTTP transport servers');
      process.exit(1);
    }

    const authConfig: MCPAuthConfig = { type: 'none' };

    for (let i = 0; i < options.length; i++) {
      const flag = options[i];
      const value = options[i + 1];

      switch (flag) {
        case '--none':
          authConfig.type = 'none';
          break;
        case '--bearer':
          authConfig.type = 'bearer';
          authConfig.token = value;
          i++;
          break;
        case '--oauth':
          authConfig.type = 'oauth';
          if (!authConfig.oauth) authConfig.oauth = {};
          break;
        case '--client-id':
          authConfig.type = 'oauth';
          if (!authConfig.oauth) authConfig.oauth = {};
          authConfig.oauth.clientId = value;
          i++;
          break;
        case '--client-metadata-url':
          authConfig.type = 'oauth';
          if (!authConfig.oauth) authConfig.oauth = {};
          authConfig.oauth.clientMetadataUrl = value;
          i++;
          break;
        case '--auth-server':
          authConfig.type = 'oauth';
          if (!authConfig.oauth) authConfig.oauth = {};
          authConfig.oauth.authorizationServer = value;
          i++;
          break;
        case '--scopes':
          authConfig.type = 'oauth';
          if (!authConfig.oauth) authConfig.oauth = {};
          authConfig.oauth.scopes = value?.split(',').map((s) => s.trim());
          i++;
          break;
      }
    }

    await this.configManager.set(`mcp.servers.${name}.auth`, authConfig, this.globalScope);

    if (authConfig.type === 'oauth' && existing.url && !authConfig.oauth?.authorizationServer) {
      console.log('Discovering OAuth configuration...');
      const discoveredAuth = await this.discoverOAuthConfig(existing.url);
      if (discoveredAuth) {
        if (!authConfig.oauth) authConfig.oauth = {};
        authConfig.oauth.authorizationServer = discoveredAuth.authorizationServer;
        if (discoveredAuth.scopes && !authConfig.oauth.scopes?.length) {
          authConfig.oauth.scopes = discoveredAuth.scopes;
        }
        await this.configManager.set(`mcp.servers.${name}.auth`, authConfig, this.globalScope);
        console.log(`  ✓ Authorization server: ${discoveredAuth.authorizationServer}`);
        if (discoveredAuth.scopes?.length) {
          console.log(`  ✓ Discovered scopes: ${discoveredAuth.scopes.join(', ')}`);
        }
      }
    }

    console.log(`✓ Configured ${authConfig.type} authentication for '${name}' (${this.globalScope} scope)`);

    if (authConfig.type === 'oauth') {
      console.log(`\nRun \`nuvin mcp login ${name}\` to authenticate.`);
    }
  }

  private async loginServer(name: string | undefined): Promise<void> {
    if (!name) {
      console.error('Error: Server name is required');
      console.log('Usage: nuvin mcp login <name>');
      process.exit(1);
    }

    const config = this.configManager.get(`mcp.servers.${name}`) as MCPServerConfig | undefined;
    if (!config) {
      console.error(`Error: MCP server '${name}' not found`);
      process.exit(1);
    }

    if (config.auth?.type !== 'oauth') {
      console.error(`Error: Server '${name}' is not configured for OAuth authentication`);
      console.log(`Configure OAuth first: nuvin mcp auth ${name} --oauth --client-id <id>`);
      process.exit(1);
    }

    if (!config.url) {
      console.error('Error: Server URL is required for OAuth authentication');
      process.exit(1);
    }

    console.log(`Initiating OAuth login for '${name}'...`);

    try {
      const { MCPOAuthClient } = await import('@nuvin/nuvin-core');
      const { FileTokenStorage } = await import('../services/TokenStorage.js');
      const open = await import('open');

      const tokenStorage = new FileTokenStorage();
      const oauthClient = new MCPOAuthClient(config.url, config.auth.oauth || {}, tokenStorage);

      const result = await oauthClient.initiateAuthFlow(async (url) => {
        console.log('\nOpening browser for authentication...');
        console.log(`If browser doesn't open, visit: ${url}\n`);
        await open.default(url);
      });

      if (result.success) {
        console.log('✓ Successfully authenticated!');
        if (result.tokens?.scope) {
          console.log(`  Scopes: ${result.tokens.scope}`);
        }
        if (result.tokens?.expiresAt) {
          const expiresIn = Math.round((result.tokens.expiresAt - Date.now()) / 1000 / 60);
          console.log(`  Token expires in: ${expiresIn} minutes`);
        }
      } else {
        console.error(`✗ Authentication failed: ${result.error}`);
        process.exit(1);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`✗ Login failed: ${message}`);
      process.exit(1);
    }
  }

  private async logoutServer(name: string | undefined): Promise<void> {
    if (!name) {
      console.error('Error: Server name is required');
      console.log('Usage: nuvin mcp logout <name>');
      process.exit(1);
    }

    const config = this.configManager.get(`mcp.servers.${name}`) as MCPServerConfig | undefined;
    if (!config) {
      console.error(`Error: MCP server '${name}' not found`);
      process.exit(1);
    }

    if (!config.url) {
      console.error('Error: Server URL is required');
      process.exit(1);
    }

    try {
      const { MCPOAuthClient } = await import('@nuvin/nuvin-core');
      const { FileTokenStorage } = await import('../services/TokenStorage.js');

      const tokenStorage = new FileTokenStorage();
      const oauthClient = new MCPOAuthClient(config.url, config.auth?.oauth || {}, tokenStorage);

      await oauthClient.logout();
      console.log(`✓ Logged out from '${name}' - tokens cleared`);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`✗ Logout failed: ${message}`);
      process.exit(1);
    }
  }

  private async showAuthStatus(name: string | undefined): Promise<void> {
    if (!name) {
      console.error('Error: Server name is required');
      console.log('Usage: nuvin mcp auth-status <name>');
      process.exit(1);
    }

    const config = this.configManager.get(`mcp.servers.${name}`) as MCPServerConfig | undefined;
    if (!config) {
      console.error(`Error: MCP server '${name}' not found`);
      process.exit(1);
    }

    console.log(`\nAuthentication status for '${name}':`);
    console.log('='.repeat(name.length + 30));

    const authType = config.auth?.type || 'none';
    console.log(`Auth type: ${authType}`);

    if (authType === 'none') {
      console.log('Status: No authentication configured');
      return;
    }

    if (authType === 'bearer') {
      console.log(`Status: Static bearer token configured`);
      console.log(`Token: ${config.auth?.token ? `****${config.auth.token.slice(-4)}` : 'Not set'}`);
      return;
    }

    if (authType === 'oauth') {
      console.log(`Client ID: ${config.auth?.oauth?.clientId || config.auth?.oauth?.clientMetadataUrl || 'Dynamic'}`);

      if (config.auth?.oauth?.authorizationServer) {
        console.log(`Auth Server: ${config.auth.oauth.authorizationServer}`);
      }

      if (config.auth?.oauth?.scopes?.length) {
        console.log(`Scopes: ${config.auth.oauth.scopes.join(', ')}`);
      }

      if (!config.url) {
        console.log('Status: Server URL not configured');
        return;
      }

      try {
        const { MCPOAuthClient } = await import('@nuvin/nuvin-core');
        const { FileTokenStorage } = await import('../services/TokenStorage.js');

        const tokenStorage = new FileTokenStorage();
        const oauthClient = new MCPOAuthClient(config.url, config.auth?.oauth || {}, tokenStorage);

        const status = await oauthClient.getAuthStatus();

        if (status.authenticated) {
          console.log('Status: ✓ Authenticated');
          if (status.scope) {
            console.log(`Active scopes: ${status.scope}`);
          }
          if (status.expiresAt) {
            const expiresIn = Math.round((status.expiresAt - Date.now()) / 1000 / 60);
            if (expiresIn > 0) {
              console.log(`Expires in: ${expiresIn} minutes`);
            } else {
              console.log('Status: Token expired (will refresh on next use)');
            }
          }
        } else {
          console.log('Status: ✗ Not authenticated');
          console.log(`\nRun 'nuvin mcp login ${name}' to authenticate.`);
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.log(`Status: Error checking auth status - ${message}`);
      }
    }

    console.log();
  }

  private async removeServer(name: string | undefined): Promise<void> {
    if (!name) {
      console.error('Error: Server name is required');
      process.exit(1);
    }

    const existing = this.configManager.get(`mcp.servers.${name}`);
    if (!existing) {
      console.error(`Error: MCP server '${name}' not found`);
      process.exit(1);
    }

    await this.configManager.delete(`mcp.servers.${name}`, this.globalScope);

    console.log(`✓ Removed MCP server '${name}' (${this.globalScope} scope)`);
  }

  private async showServer(name: string | undefined, options: string[]): Promise<void> {
    if (!name) {
      console.error('Error: Server name is required');
      process.exit(1);
    }

    const config = this.configManager.get(`mcp.servers.${name}`) as MCPServerConfig | undefined;
    if (!config) {
      console.error(`Error: MCP server '${name}' not found`);
      process.exit(1);
    }

    if (options.includes('--json')) {
      console.log(JSON.stringify(config, null, 2));
      return;
    }

    const enabled = config.enabled !== false;
    const transport = config.transport || 'stdio';

    console.log(`\nMCP Server: ${name}`);
    console.log('='.repeat(name.length + 13));
    console.log(`Status:     ${enabled ? '✓ enabled' : '✗ disabled'}`);
    console.log(`Transport:  ${transport}`);

    if (transport === 'http') {
      console.log(`URL:        ${config.url}`);
      if (config.headers && Object.keys(config.headers).length > 0) {
        console.log(`Headers:    ${Object.keys(config.headers).join(', ')}`);
      }

      const authType = config.auth?.type || 'none';
      console.log(`Auth:       ${authType}`);
      if (authType === 'oauth' && config.auth?.oauth?.clientId) {
        console.log(`Client ID:  ${config.auth.oauth.clientId}`);
      }
    } else {
      console.log(`Command:    ${config.command}`);
      if (config.args?.length) {
        console.log(`Args:       ${config.args.join(' ')}`);
      }
      if (config.env && Object.keys(config.env).length > 0) {
        console.log(`Env:        ${Object.keys(config.env).join(', ')}`);
      }
    }

    console.log(`Prefix:     ${config.prefix || `mcp_${name}_`}`);
    console.log(`Timeout:    ${config.timeoutMs || 120000}ms`);
    console.log();
  }

  private async setServerEnabled(name: string | undefined, enabled: boolean): Promise<void> {
    if (!name) {
      console.error('Error: Server name is required');
      process.exit(1);
    }

    const existing = this.configManager.get(`mcp.servers.${name}`);
    if (!existing) {
      console.error(`Error: MCP server '${name}' not found`);
      process.exit(1);
    }

    await this.configManager.set(`mcp.servers.${name}.enabled`, enabled, this.globalScope);
    console.log(`✓ ${enabled ? 'Enabled' : 'Disabled'} MCP server '${name}' (${this.globalScope} scope)`);
  }

  private async testServer(name: string | undefined, options: string[]): Promise<void> {
    if (!name) {
      console.error('Error: Server name is required');
      process.exit(1);
    }

    const config = this.scopeExplicit
      ? (this.configManager.get(`mcp.servers.${name}`, this.globalScope) as MCPServerConfig | undefined)
      : (this.configManager.get(`mcp.servers.${name}`) as MCPServerConfig | undefined);
    if (!config) {
      const scopeMsg = this.scopeExplicit ? ` in ${this.globalScope} config` : '';
      console.error(`Error: MCP server '${name}' not found${scopeMsg}`);
      process.exit(1);
    }

    const verbose = options.includes('--verbose') || options.includes('-v');

    const timeoutIdx = options.indexOf('--timeout');
    const customTimeout = timeoutIdx !== -1 ? Number.parseInt(options[timeoutIdx + 1] || '', 10) : null;
    const timeoutMs = customTimeout && !Number.isNaN(customTimeout) ? customTimeout : config.timeoutMs || 120000;

    console.log(`Testing MCP server '${name}'...`);
    if (verbose) {
      console.log(`  Timeout: ${timeoutMs}ms`);
    }

    let stderrOutput = '';

    try {
      const { CoreMCPClient } = await import('@nuvin/nuvin-core');
      const { PassThrough } = await import('node:stream');

      const transport = config.transport || 'stdio';
      let client: InstanceType<typeof CoreMCPClient>;

      if (transport === 'http') {
        if (!config.url) {
          throw new Error('HTTP transport requires a URL');
        }
        client = new CoreMCPClient({ type: 'http', url: config.url, headers: config.headers }, timeoutMs);
      } else {
        if (!config.command) {
          throw new Error('Stdio transport requires a command');
        }
        const stderrStream = new PassThrough();
        stderrStream.on('data', (chunk: Buffer) => {
          stderrOutput += chunk.toString();
        });

        client = new CoreMCPClient(
          { type: 'stdio', command: config.command, args: config.args, env: config.env, stderr: stderrStream },
          timeoutMs,
        );
      }

      process.stdout.write('  Connecting...     ');
      const start = Date.now();
      await client.connect();
      console.log(`✓ OK (${Date.now() - start}ms)`);

      process.stdout.write('  Listing tools...  ');
      const tools = client.getTools();
      console.log(`✓ OK (${tools.length} tools found)`);

      if (tools.length > 0) {
        console.log('\n  Tools:');
        for (const tool of tools) {
          console.log(`    - ${tool.name}${tool.description ? `: ${tool.description}` : ''}`);
        }
      }

      await client.disconnect();

      if (verbose && stderrOutput.trim()) {
        console.log('\n  Server debug output:');
        for (const line of stderrOutput.trim().split('\n')) {
          console.log(`    ${line}`);
        }
      }

      console.log(`\n✓ MCP server '${name}' is working correctly\n`);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.log('✗ FAILED');
      console.error(`\n✗ Error: ${message}`);

      if (stderrOutput.trim()) {
        console.error('\n  Server stderr:');
        for (const line of stderrOutput.trim().split('\n')) {
          console.error(`    ${line}`);
        }
      }

      process.exit(1);
    }
  }

  private showHelp(): void {
    console.log(`
MCP Server Management Commands

Usage:
  nuvin [OPTIONS] mcp <command> [options]

Profile Options (go before 'mcp'):
  --profile NAME          Use specific profile for this command
                         (e.g., nuvin --profile work mcp add server)

Scope Options (must come before command):
  --scope <local|global>  Config scope (default: global)
  --local                 Shorthand for --scope local
  --global                Shorthand for --scope global

Commands:
  list                    List all configured MCP servers
  add <name>              Add a new MCP server
  remove <name>           Remove an MCP server
  show <name>             Show server details
  enable <name>           Enable a server
  disable <name>          Disable a server
  test <name>             Test connection to a server
  auth <name>             Configure authentication for a server
  login <name>            Authenticate with an OAuth server
  logout <name>           Clear stored tokens for a server
  auth-status <name>      Show authentication status
  help                    Show this help

Add Server (short syntax):
  nuvin mcp add <name> <command> [args...]

Add Options (stdio transport):
  --command <cmd>         Executable command
  --args <a,b,c>          Comma-separated arguments
  --env <KEY=VALUE>       Environment variable (repeatable)

Add Options (http transport):
  --url <url>             Server URL (required for http)
  --header <KEY=VALUE>    HTTP header (repeatable)

Authentication Options:
  --auth-type <type>      Auth type: none, bearer, oauth
  --auth-token <token>    Bearer token (sets auth-type to bearer)
  --oauth                 Enable OAuth authentication
  --client-id <id>        OAuth client ID
  --client-metadata-url <url>  OAuth client metadata document URL
  --auth-server <url>     OAuth authorization server URL override
  --scopes <s1,s2>        OAuth scopes (comma-separated)

Common Add Options:
  --transport <type>      Transport: stdio (default) or http
  --prefix <prefix>       Tool name prefix
  --timeout <ms>          Timeout in milliseconds
  --disabled              Add in disabled state

Other Options:
  --json                  Output as JSON (for list/show)
  --verbose, -v           Show detailed output (for test)
  --timeout <ms>          Override timeout (for test)

Examples:
  # Add stdio server
  nuvin mcp add fs npx -y @anthropic-ai/mcp-server-filesystem /home

  # Add HTTP server with OAuth
  nuvin mcp add api --url "https://api.example.com" --oauth --client-id my-app
  nuvin mcp login api

  # Add HTTP server with bearer token
  nuvin mcp add api --url "https://api.example.com" --auth-token "secret123"

  # Configure auth for existing server
  nuvin mcp auth myserver --oauth --client-id my-client --scopes "read,write"

  # Check auth status
  nuvin mcp auth-status api

  # List and test
  nuvin mcp list
  nuvin mcp test api --verbose
`);
  }
}
