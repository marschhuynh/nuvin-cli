import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { parse as parseYaml, stringify as stringifyYaml } from 'yaml';
import { isPlainObject, structuredCloneConfig, mergeConfigs } from './utils';
import type { CLIConfig, ConfigFormat, ConfigLoadOptions, ConfigLoadResult, ConfigScope, ConfigSource } from './types';
import { CONFIG_FILE_CANDIDATES } from './const';
import { ProfileManager } from './profile-manager';
import { DEFAULT_PROFILE } from './profile-types';

class AsyncMutex {
  private queue: Array<() => void> = [];
  private locked = false;

  async acquire(): Promise<() => void> {
    return new Promise((resolve) => {
      const tryAcquire = () => {
        if (!this.locked) {
          this.locked = true;
          resolve(() => this.release());
        } else {
          this.queue.push(tryAcquire);
        }
      };
      tryAcquire();
    });
  }

  private release(): void {
    this.locked = false;
    const next = this.queue.shift();
    if (next) next();
  }
}

export class ConfigManager {
  private static instance: ConfigManager | null = null;
  globalDir = path.join(os.homedir(), '.nuvin');
  localDir: string = path.join(process.cwd(), '.nuvin');
  private scopeData: Partial<Record<ConfigScope, ConfigSource>> = {};
  public combined: CLIConfig = {};
  private profileManager?: ProfileManager;
  private currentProfile = DEFAULT_PROFILE;
  private writeMutex = new AsyncMutex();

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

  async initializeProfile(profile?: string): Promise<void> {
    if (!this.profileManager) {
      this.profileManager = new ProfileManager(this._logger);
      await this.profileManager.initialize();
    }

    // Determine active profile (CLI flag overrides registry)
    this.currentProfile = profile || (await this.profileManager.getActive());

    // Update global directory based on profile
    if (this.profileManager.isDefault(this.currentProfile)) {
      this.globalDir = path.join(os.homedir(), '.nuvin');
    } else {
      this.globalDir = this.profileManager.getProfileDir(this.currentProfile);
    }
  }

  getProfileManager(): ProfileManager | undefined {
    return this.profileManager;
  }

  getCurrentProfile(): string {
    return this.currentProfile;
  }

  async load(options: ConfigLoadOptions = {}): Promise<ConfigLoadResult> {
    // Initialize profile support - preserve current profile if no explicit profile specified
    const profileToUse = options.profile ?? (this.currentProfile !== DEFAULT_PROFILE ? this.currentProfile : undefined);
    await this.initializeProfile(profileToUse);

    const cwd = options.cwd ? path.resolve(options.cwd) : process.cwd();
    this.localDir = path.join(cwd, '.nuvin');
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
   * Uses mutex to prevent race conditions during concurrent updates.
   */
  async update(scope: ConfigScope, patch: Partial<CLIConfig>): Promise<void> {
    if (scope === 'direct' || scope === 'env') {
      throw new Error('Cannot update runtime-only config scope. Use loadConfig() instead.');
    }

    if (scope === 'explicit' && !this.scopeData.explicit) {
      throw new Error('Cannot update explicit config because no --config file was loaded.');
    }

    const release = await this.writeMutex.acquire();
    try {
      const source = this.scopeData[scope] ?? (await this.createEmptyScope(scope));
      if (!source) {
        throw new Error(`Unable to resolve config scope '${scope}'.`);
      }

      const merged = mergeConfigs([source.data, patch]);
      await this.writeConfigFile(source.path, source.format, merged);
      source.data = merged;
      this.scopeData[scope] = source;

      this.recombine();
    } finally {
      release();
    }
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
   * Find the scope that defined the exact key, or closest parent path.
   * Priority: exact match first, then parent paths.
   * For each path level, searches scopes from highest to lowest: direct > env > explicit > local > global
   */
  findKeyScope(key: string): ConfigScope | null {
    const orderedScopes: ConfigScope[] = ['direct', 'env', 'explicit', 'local', 'global'];

    for (const scope of orderedScopes) {
      const source = this.scopeData[scope];
      if (source?.data && this.getNestedValue(source.data, key) !== undefined) {
        return scope;
      }
    }

    const parts = key.split('.');
    for (let i = parts.length - 1; i > 0; i--) {
      const parentKey = parts.slice(0, i).join('.');
      for (const scope of orderedScopes) {
        const source = this.scopeData[scope];
        const parentValue = this.getNestedValue(source?.data ?? {}, parentKey);
        if (parentValue !== undefined && typeof parentValue === 'object' && parentValue !== null) {
          return scope;
        }
      }
    }

    return null;
  }

  /**
   * Set a configuration value using dot notation and persist it to the specified scope.
   * By default (scope='auto'), it will find the scope that originally defined the key and update that.
   * If the key doesn't exist in any scope, it defaults to 'global'.
   * Note: Setting to 'env' or 'direct' scope will not persist to disk (runtime-only).
   */
  async set(key: string, value: unknown, scope: ConfigScope | 'auto' = 'auto'): Promise<void> {
    let targetScope: ConfigScope;

    if (scope === 'auto') {
      const foundScope = this.findKeyScope(key);
      if (foundScope && foundScope !== 'direct' && foundScope !== 'env') {
        targetScope = foundScope;
      } else {
        targetScope = 'global';
      }
    } else {
      targetScope = scope;
    }

    if (targetScope === 'direct' || targetScope === 'env') {
      const patch = this.createNestedObject(key, value) as Partial<CLIConfig>;
      const currentScope = this.scopeData[targetScope]?.data ?? {};
      const merged = mergeConfigs([currentScope, patch]);
      this.loadConfig(merged, targetScope);
      return;
    }

    if (targetScope === 'explicit' && !this.scopeData.explicit) {
      throw new Error('Cannot set to explicit config because no --config file was loaded.');
    }

    const patch = this.createNestedObject(key, value) as Partial<CLIConfig>;
    await this.update(targetScope, patch);
  }

  /**
   * Delete a configuration key and persist the change.
   * For nested keys, use dot notation (e.g., "agentsEnabled.my-agent")
   * Uses mutex to prevent race conditions during concurrent updates.
   */
  async delete(key: string, scope: ConfigScope = 'global'): Promise<void> {
    if (scope === 'direct' || scope === 'env') {
      throw new Error('Cannot delete from runtime-only config scope.');
    }

    if (scope === 'explicit' && !this.scopeData.explicit) {
      throw new Error('Cannot delete from explicit config because no --config file was loaded.');
    }

    const release = await this.writeMutex.acquire();
    try {
      const source = this.scopeData[scope];
      if (!source) {
        return;
      }

      const keys = key.split('.');
      const data = structuredCloneConfig(source.data);

      let current: Record<string, unknown> = data;
      for (let i = 0; i < keys.length - 1; i++) {
        const k = keys[i];
        if (!k || !current[k] || typeof current[k] !== 'object') {
          return;
        }
        current = current[k] as Record<string, unknown>;
      }

      const lastKey = keys[keys.length - 1];
      if (lastKey) {
        delete current[lastKey];
      }

      await this.writeConfigFile(source.path, source.format, data);
      source.data = data;
      this.scopeData[scope] = source;
      this.recombine();
    } finally {
      release();
    }
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

    const tempFile = `${filePath}.${process.pid}.tmp`;
    try {
      await fs.promises.writeFile(tempFile, payload, 'utf-8');
      await fs.promises.rename(tempFile, filePath);
    } catch (err) {
      try {
        await fs.promises.unlink(tempFile);
      } catch {}
      throw err;
    }
  }
}

export function determineFormat(filePath: string): ConfigFormat {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === '.yaml' || ext === '.yml') return 'yaml';
  return 'json';
}
