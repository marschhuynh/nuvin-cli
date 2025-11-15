import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { parse as parseYaml, stringify as stringifyYaml } from 'yaml';
import { isPlainObject, structuredCloneConfig, mergeConfigs } from './utils';
import type { CLIConfig, ConfigFormat, ConfigLoadOptions, ConfigLoadResult, ConfigScope, ConfigSource } from './types';
import { CONFIG_FILE_CANDIDATES } from './const';

export class ConfigManager {
  private static instance: ConfigManager | null = null;
  globalDir = path.join(os.homedir(), '.nuvin-cli');
  localDir: string = path.join(process.cwd(), '.nuvin-cli');
  private scopeData: Partial<Record<ConfigScope, ConfigSource>> = {};
  public combined: CLIConfig = {};

  private constructor(readonly _logger: (message: string) => void = () => {}) {}

  static getInstance(logger?: (message: string) => void): ConfigManager {
    if (!ConfigManager.instance) {
      ConfigManager.instance = new ConfigManager(logger);
    }
    return ConfigManager.instance;
  }

  static resetInstance(): void {
    ConfigManager.instance = null;
  }

  async load(options: ConfigLoadOptions = {}): Promise<ConfigLoadResult> {
    const cwd = options.cwd ? path.resolve(options.cwd) : process.cwd();
    this.localDir = path.join(cwd, '.nuvin-cli');
    this.scopeData = {};

    const sources: ConfigSource[] = [];

    const global = await this.loadFromScope('global', this.globalDir);
    if (global) sources.push(global);

    const local = await this.loadFromScope('local', this.localDir);
    if (local) sources.push(local);

    if (options.explicitPath) {
      const explicitPath = path.resolve(cwd, options.explicitPath);
      const explicit = await this.loadFromScope('explicit', explicitPath, true);
      if (explicit) sources.push(explicit);
    }

    this.recombine();

    return { config: structuredCloneConfig(this.combined), sources };
  }

  /**
   * Load configuration from a data object with a specific scope.
   * The 'direct' scope has the highest priority and overrides all other scopes.
   * This is useful for CLI flags that should override file-based configuration.
   */
  loadConfig(config: Partial<CLIConfig>, scope: ConfigScope = 'direct'): void {
    const source: ConfigSource = {
      scope,
      path: '<runtime>',
      format: 'json',
      data: config as CLIConfig,
    };

    this.scopeData[scope] = source;
    this.recombine();
  }

  /**
   * Recombine all scope data into the merged config.
   * Priority order (lowest to highest): global < local < explicit < env < direct
   */
  private recombine(): void {
    const orderedScopes: ConfigScope[] = ['global', 'local', 'explicit', 'env', 'direct'];
    const configs = orderedScopes
      .map((sc) => (this.scopeData[sc] ? this.scopeData[sc].data : null))
      .filter((cfg): cfg is CLIConfig => Boolean(cfg));
    this.combined = mergeConfigs(configs);
  }

  getConfig(): CLIConfig {
    return structuredCloneConfig(this.combined);
  }

  getScopeSource(scope: ConfigScope): ConfigSource | null {
    return this.scopeData[scope] ? { ...this.scopeData[scope] } : null;
  }

  /**
   * Update the configuration for a given scope (global/local/explicit) and persist it to disk.
   * If no file exists for the scope yet, a new YAML config will be created automatically.
   * Note: Cannot update 'env' or 'direct' scope as they are runtime-only.
   */
  async update(scope: ConfigScope, patch: Partial<CLIConfig>): Promise<void> {
    if (scope === 'direct' || scope === 'env') {
      throw new Error('Cannot update runtime-only config scope. Use loadConfig() instead.');
    }

    if (scope === 'explicit' && !this.scopeData.explicit) {
      throw new Error('Cannot update explicit config because no --config file was loaded.');
    }

    const source = this.scopeData[scope] ?? (await this.createEmptyScope(scope));
    if (!source) {
      throw new Error(`Unable to resolve config scope '${scope}'.`);
    }

    const merged = mergeConfigs([source.data, patch]);
    await this.writeConfigFile(source.path, source.format, merged);
    source.data = merged;
    this.scopeData[scope] = source;

    // Recombine all scopes
    this.recombine();
  }

  /**
   * Get a configuration value using dot notation (e.g., "auth.github.token", "providers.openrouter.apiKey")
   */
  get(key: string, scope?: ConfigScope): unknown {
    const config = scope ? this.scopeData[scope]?.data : this.combined;
    if (!config) return undefined;

    return this.getNestedValue(config, key);
  }

  /**
   * Set a configuration value using dot notation and persist it to the specified scope.
   * Note: Setting to 'env' or 'direct' scope will not persist to disk (runtime-only).
   */
  async set(key: string, value: unknown, scope: ConfigScope = 'global'): Promise<void> {
    if (scope === 'direct' || scope === 'env') {
      // For runtime scopes, just update in memory without persisting
      const patch = this.createNestedObject(key, value) as Partial<CLIConfig>;
      const currentScope = this.scopeData[scope]?.data ?? {};
      const merged = mergeConfigs([currentScope, patch]);
      this.loadConfig(merged, scope);
      return;
    }

    if (scope === 'explicit' && !this.scopeData.explicit) {
      throw new Error('Cannot set to explicit config because no --config file was loaded.');
    }

    const patch = this.createNestedObject(key, value) as Partial<CLIConfig>;
    await this.update(scope, patch);
  }

  /**
   * Delete a configuration key and persist the change.
   * For nested keys, use dot notation (e.g., "agentsEnabled.my-agent")
   */
  async delete(key: string, scope: ConfigScope = 'global'): Promise<void> {
    if (scope === 'direct' || scope === 'env') {
      throw new Error('Cannot delete from runtime-only config scope.');
    }

    if (scope === 'explicit' && !this.scopeData.explicit) {
      throw new Error('Cannot delete from explicit config because no --config file was loaded.');
    }

    const source = this.scopeData[scope];
    if (!source) {
      return; // Nothing to delete if scope doesn't exist
    }

    const keys = key.split('.');
    const data = structuredCloneConfig(source.data);

    // Navigate to parent object
    let current: Record<string, unknown> = data;
    for (let i = 0; i < keys.length - 1; i++) {
      const key = keys[i];
      if (!key || !current[key] || typeof current[key] !== 'object') {
        return; // Path doesn't exist
      }
      current = current[key] as Record<string, unknown>;
    }

    // Delete the key
    const lastKey = keys[keys.length - 1];
    if (lastKey) {
      delete current[lastKey];
    }

    // Write and update
    await this.writeConfigFile(source.path, source.format, data);
    source.data = data;
    this.scopeData[scope] = source;
    this.recombine();
  }

  private getNestedValue(obj: Record<string, unknown>, path: string): unknown {
    const keys = path.split('.');
    let current: unknown = obj;

    for (const key of keys) {
      if (current && typeof current === 'object' && key in current) {
        current = (current as Record<string, unknown>)[key];
      } else {
        return undefined;
      }
    }

    return current;
  }

  private createNestedObject(path: string, value: unknown): Record<string, unknown> | unknown[] {
    const keys = this.parsePath(path);
    const result: Record<string, unknown> = {};
    let current: Record<string, unknown> | unknown[] = result;

    for (let i = 0; i < keys.length - 1; i++) {
      const key = keys[i];
      if (!key) continue;

      if (key.isArrayIndex) {
        if (!Array.isArray(current)) {
          throw new Error(`Cannot use array index on non-array at ${key.name}`);
        }
        const index = Number.parseInt(key.name, 10);
        if (Number.isNaN(index) || index < 0) {
          throw new Error(`Invalid array index: ${key.name}`);
        }
        while (current.length <= index) {
          current.push({});
        }
        current = current[index] as Record<string, unknown>;
      } else if (key.createsArray) {
        const arr: unknown[] = [];
        if (Array.isArray(current)) {
          throw new Error('Cannot create nested arrays in config path');
        }
        current[key.name] = arr;
        current = arr;
      } else {
        if (Array.isArray(current)) {
          throw new Error(`Cannot use property ${key.name} on array`);
        }
        current[key.name] = {};
        current = current[key.name] as Record<string, unknown>;
      }
    }

    const lastKey = keys[keys.length - 1];
    if (lastKey) {
      if (lastKey.isArrayIndex) {
        if (!Array.isArray(current)) {
          throw new Error(`Cannot use array index on non-array at ${lastKey.name}`);
        }
        const index = Number.parseInt(lastKey.name, 10);
        if (Number.isNaN(index) || index < 0) {
          throw new Error(`Invalid array index: ${lastKey.name}`);
        }
        while (current.length <= index) {
          current.push(undefined);
        }
        current[index] = value;
      } else {
        if (Array.isArray(current)) {
          throw new Error(`Cannot set property ${lastKey.name} on array`);
        }
        current[lastKey.name] = value;
      }
    }
    return result;
  }

  private parsePath(path: string): Array<{ name: string; isArrayIndex: boolean; createsArray: boolean }> {
    const segments: Array<{ name: string; isArrayIndex: boolean; createsArray: boolean }> = [];
    const parts = path.split('.');

    for (const part of parts) {
      if (!part) continue;

      const arrayMatch = part.match(/^(.+)\[(\d+)\]$/);
      if (arrayMatch) {
        segments.push({ name: arrayMatch[1] || '', isArrayIndex: false, createsArray: true });
        segments.push({ name: arrayMatch[2] || '', isArrayIndex: true, createsArray: false });
      } else {
        segments.push({ name: part, isArrayIndex: false, createsArray: false });
      }
    }

    return segments;
  }

  private async createEmptyScope(scope: ConfigScope): Promise<ConfigSource | null> {
    const targetDir = scope === 'global' ? this.globalDir : this.localDir;
    const filename = path.join(targetDir, 'config.yaml');
    await fs.promises.mkdir(targetDir, { recursive: true });
    const emptyConfig: CLIConfig = {};
    await this.writeConfigFile(filename, 'yaml', emptyConfig);
    const created: ConfigSource = { scope, path: filename, format: 'yaml', data: emptyConfig };
    this.scopeData[scope] = created;
    return created;
  }

  private async loadFromScope(
    scope: ConfigScope,
    targetPath: string,
    requireExists = false,
  ): Promise<ConfigSource | null> {
    const resolved = this.resolveConfigFile(targetPath);
    if (!resolved) {
      if (requireExists) {
        throw new Error(`Config file not found at ${targetPath}`);
      }
      return null;
    }

    const { data, format } = await this.readConfigFile(resolved);
    const source: ConfigSource = { scope, path: resolved, format, data };
    this.scopeData[scope] = source;
    return source;
  }

  private resolveConfigFile(target: string): string | null {
    const normalized = path.resolve(target);
    if (!fs.existsSync(normalized)) {
      return null;
    }

    const stats = fs.statSync(normalized);
    if (stats.isFile()) {
      return normalized;
    }

    if (stats.isDirectory()) {
      for (const candidate of CONFIG_FILE_CANDIDATES) {
        const candidatePath = path.join(normalized, candidate);
        if (fs.existsSync(candidatePath) && fs.statSync(candidatePath).isFile()) {
          return candidatePath;
        }
      }
    }

    return null;
  }

  private async readConfigFile(filePath: string): Promise<{ data: CLIConfig; format: ConfigFormat }> {
    const raw = await fs.promises.readFile(filePath, 'utf-8');
    if (!raw.trim()) {
      return { data: {}, format: determineFormat(filePath) };
    }

    const format = determineFormat(filePath);

    try {
      if (format === 'yaml') {
        const parsed = parseYaml(raw) ?? {};
        if (isPlainObject(parsed)) {
          return { data: parsed as CLIConfig, format };
        }
        throw new Error('YAML config must evaluate to an object.');
      }

      const parsed = JSON.parse(raw);
      if (isPlainObject(parsed)) {
        return { data: parsed as CLIConfig, format };
      }
      throw new Error('JSON config must evaluate to an object.');
    } catch (error) {
      throw new Error(
        `Failed to parse config at ${filePath}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  private async writeConfigFile(filePath: string, format: ConfigFormat, data: CLIConfig): Promise<void> {
    const dir = path.dirname(filePath);
    await fs.promises.mkdir(dir, { recursive: true });
    const payload = format === 'yaml' ? stringifyYaml(data) : `${JSON.stringify(data, null, 2)}\n`;
    await fs.promises.writeFile(filePath, payload, 'utf-8');
  }
}

export function determineFormat(filePath: string): ConfigFormat {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === '.yaml' || ext === '.yml') return 'yaml';
  return 'json';
}
