import { ConfigManager } from './manager.js';
import type { ConfigScope } from './types.js';

export interface MCPServerConfig {
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  transport?: 'stdio' | 'http';
  url?: string;
  headers?: Record<string, string>;
  prefix?: string;
  timeoutMs?: number;
  enabled?: boolean;
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
          console.log('  help              Show detailed help');
          console.log('\nExamples:');
          console.log('  nuvin mcp add myserver npx @org/mcp-server');
          console.log('  nuvin mcp add api --url https://api.example.com');
          console.log('  nuvin --profile work mcp add jira --url https://mcp.atlassian.com');
          console.log('  nuvin mcp list');
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

      console.log(`  ${name.padEnd(14)} ${transport.padEnd(6)} ${status.padEnd(12)} prefix: ${prefix}`);
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
      // HTTP transport - no command needed
    } else if (!config.command) {
      console.error('Error: command is required for stdio transport');
      console.log('Usage: nuvin mcp add <name> <command> [args...]');
      console.log('       nuvin mcp add <name> --url <url> [options]');
      process.exit(1);
    }

    await this.configManager.set(`mcp.servers.${name}`, config, this.globalScope);

    console.log(`✓ Added MCP server '${name}' (${this.globalScope} scope)`);
  }

  private parseServerOptions(options: string[]): MCPServerConfig {
    const config: MCPServerConfig = { enabled: true };
    const positionalArgs: string[] = [];
    const knownFlags = new Set([
      '--command', '--args', '--env', '--transport', '--url', '--header',
      '--prefix', '--timeout', '--disabled',
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
      ? this.configManager.get(`mcp.servers.${name}`, this.globalScope) as MCPServerConfig | undefined
      : this.configManager.get(`mcp.servers.${name}`) as MCPServerConfig | undefined;
    if (!config) {
      const scopeMsg = this.scopeExplicit ? ` in ${this.globalScope} config` : '';
      console.error(`Error: MCP server '${name}' not found${scopeMsg}`);
      process.exit(1);
    }

    const verbose = options.includes('--verbose') || options.includes('-v');
    
    const timeoutIdx = options.indexOf('--timeout');
    const customTimeout = timeoutIdx !== -1 ? Number.parseInt(options[timeoutIdx + 1] || '', 10) : null;
    const timeoutMs = customTimeout && !Number.isNaN(customTimeout) ? customTimeout : (config.timeoutMs || 120000);

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
        client = new CoreMCPClient(
          { type: 'http', url: config.url, headers: config.headers },
          timeoutMs,
        );
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
  nuvin --profile work mcp add api --url "https://api.example.com"
  nuvin --profile personal mcp list
  nuvin mcp add fs npx -y @anthropic-ai/mcp-server-filesystem /home
  nuvin mcp --local add chrome-devtools npx chrome-devtools-mcp@latest
  nuvin mcp --local disable github
  nuvin mcp show fs
  nuvin mcp test fs --verbose
  nuvin mcp --local remove old-server
`);
  }
}
