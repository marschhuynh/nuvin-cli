import { unwatchFile, watchFile } from "node:fs";
import { readFile, rename, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { parse as parseYaml, stringify as stringifyYaml } from "yaml";
import {
  ConfigConflictError,
  deepMergeForWrite,
  detectScalarConflict,
  mergeAuthArray,
  mergeRecentModels,
} from "./conflicts.js";
import {
  CONFIG_FILE_CANDIDATES,
  DEFAULT_CONFIG_FILE,
  normalizeConfigDirName,
  SCOPE_PRIORITY,
} from "./constants.js";
import { withFileLock } from "./file-lock.js";
import { parseCliConfig } from "./schema.js";
import type {
  AuthMethod,
  CLIConfig,
  ConfigChangeEvent,
  ConfigChangeListener,
  ConfigFormat,
  ConfigLoadOptions,
  ConfigLoadResult,
  ConfigScope,
  ConfigSource,
  RecentModel,
} from "./types.js";
import {
  createNestedPatch,
  deleteNestedValue,
  getNestedValue,
  mergeConfigs,
  structuredCloneConfig,
} from "./utils.js";

export interface ConfigManagerOptions {
  configDirName?: string;
  homeDir?: string;
  cwd?: string;
  logger?: (message: string) => void;
}

type ScopeState = {
  source: ConfigSource | null;
  data: CLIConfig;
  baseline: CLIConfig;
};

function detectFormat(filePath: string): ConfigFormat {
  return filePath.endsWith(".json") ? "json" : "yaml";
}

async function fileExists(path: string): Promise<boolean> {
  try {
    await readFile(path);
    return true;
  } catch {
    return false;
  }
}

async function readConfigFile(
  filePath: string,
): Promise<{ data: CLIConfig; format: ConfigFormat } | null> {
  let raw: string;
  try {
    raw = await readFile(filePath, "utf8");
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw err;
  }

  const format = detectFormat(filePath);
  const trimmed = raw.trim();
  if (!trimmed) {
    return { data: {}, format };
  }

  try {
    const parsed = format === "json" ? JSON.parse(raw) : parseYaml(raw);
    const data = (parsed ?? {}) as CLIConfig;
    return { data, format };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(`Failed to parse config file ${filePath}: ${message}`);
  }
}

async function findFirstExisting(
  dir: string,
  candidates: readonly string[],
): Promise<string | null> {
  for (const name of candidates) {
    const candidate = join(dir, name);
    if (await fileExists(candidate)) return candidate;
  }
  return null;
}

function applyPatch(target: CLIConfig, patch: Partial<CLIConfig>): CLIConfig {
  const next = structuredCloneConfig(target);
  const patchClone = structuredCloneConfig(patch);

  if (patchClone.providers) {
    const providers = (next.providers ?? {}) as Record<
      string,
      CLIConfig["providers"] extends Record<string, infer P> ? P : never
    >;
    for (const [name, provider] of Object.entries(patchClone.providers)) {
      const existing = providers[name] ?? {};
      const mergedProvider = deepMergeForWrite(existing, provider) as Record<string, unknown>;
      const incomingAuth = (provider as { auth?: AuthMethod[] }).auth;
      if (incomingAuth) {
        mergedProvider.auth = mergeAuthArray(
          (existing as { auth?: AuthMethod[] }).auth,
          incomingAuth,
        );
      }
      providers[name] = mergedProvider as never;
    }
    next.providers = providers as CLIConfig["providers"];
    delete (patchClone as { providers?: unknown }).providers;
  }

  if (patchClone.recentModels) {
    next.recentModels = mergeRecentModels(
      next.recentModels as RecentModel[] | undefined,
      patchClone.recentModels as RecentModel[],
    );
    delete (patchClone as { recentModels?: unknown }).recentModels;
  }

  return deepMergeForWrite(next, patchClone) as CLIConfig;
}

async function writeConfigAtomic(
  filePath: string,
  data: CLIConfig,
  format: ConfigFormat,
): Promise<void> {
  const serialized = format === "json" ? `${JSON.stringify(data, null, 2)}\n` : stringifyYaml(data);
  const tmpPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  await writeFile(tmpPath, serialized, "utf8");
  await rename(tmpPath, filePath);
}

export class ConfigManager {
  private readonly configDirName: string;
  private readonly homeDir: string;
  private readonly cwd: string;
  private readonly logger: (message: string) => void;
  private readonly scopes = new Map<ConfigScope, ScopeState>();
  private merged: CLIConfig = {};
  private readonly listeners = new Set<ConfigChangeListener>();
  private watchedFiles = new Map<string, () => void>();
  private lastChangedScopes: ConfigScope[] = [];

  constructor(options: ConfigManagerOptions = {}) {
    this.configDirName = normalizeConfigDirName(options.configDirName);
    this.homeDir = options.homeDir ?? homedir();
    this.cwd = options.cwd ?? process.cwd();
    this.logger = options.logger ?? (() => {});
    for (const scope of SCOPE_PRIORITY) {
      this.scopes.set(scope, { source: null, data: {}, baseline: {} });
    }
  }

  getHomeDir(): string {
    return this.homeDir;
  }

  getCwd(): string {
    return this.cwd;
  }

  getConfigDirName(): string {
    return this.configDirName;
  }

  getGlobalConfigDir(profile?: string): string {
    const base = join(this.homeDir, this.configDirName);
    if (profile && profile !== "default") {
      return join(base, "profiles", profile);
    }
    return base;
  }

  getGlobalConfigPath(profile?: string): string {
    return join(this.getGlobalConfigDir(profile), DEFAULT_CONFIG_FILE);
  }

  async load(options: ConfigLoadOptions = {}): Promise<ConfigLoadResult> {
    const cwd = options.cwd ?? this.cwd;
    const profile = options.profile;
    const globalDir = this.getGlobalConfigDir(profile);
    const localDir = join(cwd, this.configDirName);

    const globalPath = await findFirstExisting(globalDir, CONFIG_FILE_CANDIDATES);
    const localPath = await findFirstExisting(localDir, CONFIG_FILE_CANDIDATES);

    await this.loadScopeFromFile("global", globalPath);
    await this.loadScopeFromFile("local", localPath);

    if (options.explicitPath) {
      const explicitAbs = isAbsolute(options.explicitPath)
        ? options.explicitPath
        : resolve(cwd, options.explicitPath);
      await this.loadScopeFromFile("explicit", explicitAbs, { required: true });
    } else {
      this.scopes.set("explicit", { source: null, data: {}, baseline: {} });
    }

    this.recompute();
    return {
      config: structuredCloneConfig(this.merged),
      sources: this.collectSources(),
    };
  }

  private async loadScopeFromFile(
    scope: ConfigScope,
    filePath: string | null,
    options: { required?: boolean } = {},
  ): Promise<void> {
    if (!filePath) {
      this.scopes.set(scope, { source: null, data: {}, baseline: {} });
      return;
    }

    const result = await readConfigFile(filePath);
    if (!result) {
      if (options.required) {
        throw new Error(`Explicit config file not found: ${filePath}`);
      }
      this.scopes.set(scope, { source: null, data: {}, baseline: {} });
      return;
    }

    const validated = parseCliConfig(result.data);
    this.scopes.set(scope, {
      source: { scope, path: filePath, format: result.format, data: validated },
      data: validated,
      baseline: structuredCloneConfig(validated),
    });
    void dirname;
  }

  loadConfig(config: Partial<CLIConfig>, scope: ConfigScope = "direct"): void {
    const validated = parseCliConfig(config);
    const existing = this.scopes.get(scope) ?? { source: null, data: {}, baseline: {} };
    const data = mergeConfigs([existing.data, validated]);
    this.scopes.set(scope, { source: existing.source, data, baseline: existing.baseline });
    this.lastChangedScopes = [scope];
    this.recompute();
  }

  setScope(scope: ConfigScope, config: Partial<CLIConfig>): void {
    const validated = parseCliConfig(config);
    const existing = this.scopes.get(scope) ?? { source: null, data: {}, baseline: {} };
    this.scopes.set(scope, {
      source: existing.source,
      data: validated,
      baseline: existing.baseline,
    });
    this.lastChangedScopes = [scope];
    this.recompute();
  }

  getConfig(): CLIConfig {
    return structuredCloneConfig(this.merged);
  }

  getScopeSource(scope: ConfigScope): ConfigSource | null {
    return this.scopes.get(scope)?.source ?? null;
  }

  getScopeData(scope: ConfigScope): CLIConfig {
    return structuredCloneConfig(this.scopes.get(scope)?.data ?? {});
  }

  get<T = unknown>(key: string, scope?: ConfigScope): T | undefined {
    if (scope) {
      const state = this.scopes.get(scope);
      if (!state) return undefined;
      return getNestedValue(state.data as Record<string, unknown>, key) as T | undefined;
    }
    return getNestedValue(this.merged as Record<string, unknown>, key) as T | undefined;
  }

  findKeyScope(key: string): ConfigScope | null {
    for (let i = SCOPE_PRIORITY.length - 1; i >= 0; i -= 1) {
      const scope = SCOPE_PRIORITY[i];
      if (!scope) continue;
      const state = this.scopes.get(scope);
      if (!state) continue;
      const value = getNestedValue(state.data as Record<string, unknown>, key);
      if (value !== undefined) return scope;
    }
    return null;
  }

  async set(
    key: string,
    value: unknown,
    scope: ConfigScope | "auto" = "global",
    options: { force?: boolean } = {},
  ): Promise<void> {
    const targetScope = scope === "auto" ? (this.findKeyScope(key) ?? "global") : scope;
    if (targetScope === "env" || targetScope === "direct") {
      throw new Error(`Cannot persist writes to scope "${targetScope}".`);
    }
    const patch = createNestedPatch(key, value) as Partial<CLIConfig>;
    await this.persistPatch(targetScope, patch, { conflictKey: key, force: options.force });
  }

  async delete(
    key: string,
    scope: ConfigScope = "global",
    options: { force?: boolean } = {},
  ): Promise<void> {
    if (scope === "env" || scope === "direct") {
      throw new Error(`Cannot persist deletes to scope "${scope}".`);
    }
    await this.persistDelete(scope, key, { force: options.force });
  }

  async update(
    scope: ConfigScope,
    patch: Partial<CLIConfig>,
    options: { force?: boolean } = {},
  ): Promise<void> {
    if (scope === "env" || scope === "direct") {
      throw new Error(`Cannot persist writes to scope "${scope}".`);
    }
    await this.persistPatch(scope, patch, { force: options.force });
  }

  private resolveTargetPath(scope: ConfigScope): string {
    const existing = this.scopes.get(scope)?.source;
    if (existing) return existing.path;
    if (scope === "global") return this.getGlobalConfigPath();
    if (scope === "local") return join(this.cwd, this.configDirName, DEFAULT_CONFIG_FILE);
    if (scope === "explicit") {
      throw new Error("Cannot persist to explicit scope without a loaded source path.");
    }
    throw new Error(`Unsupported persist scope: ${scope}`);
  }

  private async persistPatch(
    scope: ConfigScope,
    patch: Partial<CLIConfig>,
    options: { conflictKey?: string; force?: boolean },
  ): Promise<void> {
    const targetPath = this.resolveTargetPath(scope);
    const baseline = this.scopes.get(scope)?.baseline ?? {};

    await withFileLock(targetPath, async () => {
      const onDisk = await readConfigFile(targetPath);
      const diskFormat: ConfigFormat = onDisk?.format ?? detectFormat(targetPath);
      const diskData: CLIConfig = onDisk ? parseCliConfig(onDisk.data) : {};

      if (!options.force && options.conflictKey) {
        const desired = getNestedValue(patch as Record<string, unknown>, options.conflictKey);
        detectScalarConflict(
          options.conflictKey,
          baseline as Record<string, unknown>,
          diskData as Record<string, unknown>,
          desired,
        );
      }

      const merged = applyPatch(diskData, patch);
      const validated = parseCliConfig(merged);
      await writeConfigAtomic(targetPath, validated, diskFormat);

      this.scopes.set(scope, {
        source: { scope, path: targetPath, format: diskFormat, data: validated },
        data: validated,
        baseline: structuredCloneConfig(validated),
      });
      this.recompute();
    });
  }

  private async persistDelete(
    scope: ConfigScope,
    key: string,
    options: { force?: boolean },
  ): Promise<void> {
    const targetPath = this.resolveTargetPath(scope);
    const baseline = this.scopes.get(scope)?.baseline ?? {};

    await withFileLock(targetPath, async () => {
      const onDisk = await readConfigFile(targetPath);
      const diskFormat: ConfigFormat = onDisk?.format ?? detectFormat(targetPath);
      const diskData: CLIConfig = onDisk ? parseCliConfig(onDisk.data) : {};

      if (!options.force) {
        const baselineValue = getNestedValue(baseline as Record<string, unknown>, key);
        const diskValue = getNestedValue(diskData as Record<string, unknown>, key);
        if (baselineValue !== undefined && diskValue !== baselineValue) {
          throw new ConfigConflictError(key, diskValue, baselineValue, undefined);
        }
      }

      const next = structuredCloneConfig(diskData);
      deleteNestedValue(next as Record<string, unknown>, key);
      const validated = parseCliConfig(next);
      await writeConfigAtomic(targetPath, validated, diskFormat);

      this.scopes.set(scope, {
        source: { scope, path: targetPath, format: diskFormat, data: validated },
        data: validated,
        baseline: structuredCloneConfig(validated),
      });
      this.recompute();
    });
  }

  private recompute(): void {
    const layers: Array<Partial<CLIConfig>> = [];
    for (const scope of SCOPE_PRIORITY) {
      const state = this.scopes.get(scope);
      if (state) layers.push(state.data);
    }
    this.merged = mergeConfigs(layers);
    this.logger(`config recomputed: scopes=${SCOPE_PRIORITY.join(",")}`);
    this.emitChange(this.lastChangedScopes);
    this.lastChangedScopes = [];
  }

  private emitChange(changedScopes: ConfigScope[]): void {
    if (this.listeners.size === 0) return;
    const event: ConfigChangeEvent = {
      config: structuredCloneConfig(this.merged),
      changedScopes: [...changedScopes],
    };
    for (const listener of this.listeners) {
      try {
        listener(event);
      } catch (err) {
        this.logger(`config listener threw: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
  }

  subscribe(listener: ConfigChangeListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  watch(options: { intervalMs?: number } = {}): () => void {
    const interval = options.intervalMs ?? 2000;
    const paths = new Set<string>();
    for (const scope of SCOPE_PRIORITY) {
      const source = this.scopes.get(scope)?.source;
      if (source) paths.add(source.path);
    }
    for (const path of paths) {
      if (this.watchedFiles.has(path)) continue;
      const handler = () => {
        void this.reloadFile(path);
      };
      watchFile(path, { interval, persistent: false }, handler);
      this.watchedFiles.set(path, () => unwatchFile(path, handler));
    }
    return () => this.unwatch();
  }

  unwatch(): void {
    for (const stop of this.watchedFiles.values()) {
      stop();
    }
    this.watchedFiles.clear();
  }

  private async reloadFile(path: string): Promise<void> {
    const targetScopes: ConfigScope[] = [];
    for (const scope of SCOPE_PRIORITY) {
      if (this.scopes.get(scope)?.source?.path === path) {
        targetScopes.push(scope);
      }
    }
    if (targetScopes.length === 0) return;
    try {
      for (const scope of targetScopes) {
        await this.loadScopeFromFile(scope, path);
      }
      this.lastChangedScopes = targetScopes;
      this.recompute();
    } catch (err) {
      this.logger(
        `config reload failed for ${path}: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  private collectSources(): ConfigSource[] {
    const sources: ConfigSource[] = [];
    for (const scope of SCOPE_PRIORITY) {
      const state = this.scopes.get(scope);
      if (state?.source) sources.push(state.source);
    }
    return sources;
  }
}
