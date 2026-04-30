import { ConfigManager } from './manager.js';
import type { ConfigScope } from './types.js';

export class ConfigCliHandler {
  private configManager: ConfigManager;
  private profile?: string;

  constructor(profile?: string) {
    this.configManager = ConfigManager.getInstance();
    this.profile = profile;
  }

  async handleConfigCommand(args: string[], profile?: string): Promise<void> {
    this.profile = profile;
    if (args.length === 0) {
      this.showHelp();
      return;
    }

    const [action, ...rest] = args;

    switch (action.toLowerCase()) {
      case 'get':
        await this.handleGet(rest);
        break;
      case 'set':
        await this.handleSet(rest);
        break;
      case 'list':
        await this.handleList(rest);
        break;
      case '--help':
      case '-h':
      case 'help':
        this.showHelp();
        break;
      default:
        console.error(`Unknown config action: ${action}`);
        this.showHelp();
        process.exit(1);
    }
  }

  private async handleGet(args: string[]): Promise<void> {
    if (args.length === 0) {
      console.error('Error: config key is required for get command');
      console.error('Usage: nuvin-cli config get <key> [--scope global|local]');
      process.exit(1);
    }

    const key = args[0];
    const scopeIndex = args.indexOf('--scope');
    const scope = scopeIndex !== -1 && args[scopeIndex + 1] ? (args[scopeIndex + 1] as ConfigScope) : undefined;

    try {
      await this.configManager.load({ profile: this.profile });
      const value = this.configManager.get(key, scope);

      if (value === undefined) {
        console.log(`Config key '${key}' not found`);
      } else {
        console.log(this.formatValue(value));
      }
    } catch (error) {
      console.error(`Error getting config: ${error instanceof Error ? error.message : String(error)}`);
      process.exit(1);
    }
  }

  private async handleSet(args: string[]): Promise<void> {
    if (args.length < 2) {
      console.error('Error: config key and value are required for set command');
      console.error('Usage: nuvin-cli config set <key> <value> [--global|--local]');
      process.exit(1);
    }

    const key = args[0];
    const value = args[1];

    let scope: ConfigScope = 'global';
    if (args.includes('--local')) {
      scope = 'local';
    } else if (args.includes('--global')) {
      scope = 'global';
    }

    try {
      await this.configManager.load({ profile: this.profile });
      const parsedValue = this.parseValue(value);
      await this.configManager.set(key, parsedValue, scope);
      console.log(`Set ${key} = ${this.formatValue(parsedValue)} (${scope} scope)`);
    } catch (error) {
      console.error(`Error setting config: ${error instanceof Error ? error.message : String(error)}`);
      process.exit(1);
    }
  }

  private async handleList(args: string[]): Promise<void> {
    const scopeIndex = args.indexOf('--scope');
    const scope = scopeIndex !== -1 && args[scopeIndex + 1] ? (args[scopeIndex + 1] as ConfigScope) : undefined;

    try {
      await this.configManager.load({ profile: this.profile });

      if (scope) {
        const scopeSource = this.configManager.getScopeSource(scope);
        if (scopeSource) {
          console.log(`Configuration for ${scope} scope (${scopeSource.path}):`);
          console.log(this.formatConfig(scopeSource.data));
        } else {
          console.log(`No configuration found for ${scope} scope`);
        }
      } else {
        console.log('Combined configuration:');
        console.log(this.formatConfig(this.configManager.getConfig()));
      }
    } catch (error) {
      console.error(`Error listing config: ${error instanceof Error ? error.message : String(error)}`);
      process.exit(1);
    }
  }

  private parseValue(value: string): unknown {
    // Try to parse as JSON first
    if (value === 'true') return true;
    if (value === 'false') return false;
    if (value === 'null') return null;
    if (value === 'undefined') return undefined;

    // Try to parse as number
    const num = Number(value);
    if (!Number.isNaN(num) && value === num.toString()) {
      return num;
    }

    // Try to parse as JSON for objects/arrays
    if ((value.startsWith('{') && value.endsWith('}')) || (value.startsWith('[') && value.endsWith(']'))) {
      try {
        return JSON.parse(value);
      } catch {
        // Fall through to string
      }
    }

    // Return as string
    return value;
  }

  private formatValue(value: unknown): string {
    if (typeof value === 'string') {
      return value;
    }
    return JSON.stringify(value, null, 2);
  }

  private formatConfig(config: Record<string, unknown>): string {
    return JSON.stringify(config, null, 2);
  }

  private showHelp(): void {
    console.log(`
nuvin-cli config - Configuration management

USAGE:
    nuvin-cli config <COMMAND> [OPTIONS]

COMMANDS:
    get <key>                    Get a configuration value
    set <key> <value>            Set a configuration value
    list                         List all configuration values
    help                         Show this help message

OPTIONS:
    --global                     Use global scope (default for set)
    --local                      Use local scope
    --scope <global|local>       Specify scope for get/list commands

EXAMPLES:
    nuvin-cli config get activeProvider
    nuvin-cli config set activeProvider openrouter --global
    nuvin-cli config set providers.github.token "ghp_xxxx" --local
    nuvin-cli config get providers.openrouter.apiKey --scope global
    nuvin-cli config list --scope local
    nuvin-cli config list

CONFIGURATION KEYS:
    activeProvider               Current AI provider (openrouter|github|zai|anthropic|echo)
    model                        Default model name
    providers.<name>.apiKey      API key for specific provider
    providers.<name>.token       Token for specific provider (alias for apiKey)
    providers.<name>.model       Default model for specific provider
    tokens.<provider>            Direct token mapping
    apiKey                       General API key fallback
    mcp.configPath              MCP configuration file path
    mcp.servers                 Inline MCP server configuration
    session.memPersist          Enable session persistence
    thinking                    Thinking display and reasoning effort (OFF|LOW|MEDIUM|HIGH)
    requireToolApproval         Require manual approval for tools
`);
  }
}
