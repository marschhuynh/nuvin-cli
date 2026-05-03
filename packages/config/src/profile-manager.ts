import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { parse as parseYaml, stringify as stringifyYaml } from "yaml";

import { DEFAULT_CONFIG_FILE, normalizeConfigDirName } from "./constants.js";
import type {
  CreateProfileOptions,
  DeleteProfileOptions,
  ProfileMetadata,
  ProfilesRegistry,
} from "./profile-types.js";
import {
  DEFAULT_PROFILE,
  PROFILE_NAME_PATTERN,
  PROFILES_DIR,
  PROFILES_REGISTRY_FILE,
} from "./profile-types.js";

export interface ProfileManagerOptions {
  configDirName?: string;
  homeDir?: string;
}

function ensureValidName(name: string): void {
  if (!PROFILE_NAME_PATTERN.test(name)) {
    throw new Error(
      `Invalid profile name "${name}". Names must contain only letters, digits, underscores, or hyphens.`,
    );
  }
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await readFile(path);
    return true;
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException).code === "EISDIR") return true;
    return false;
  }
}

export class ProfileManager {
  private readonly configDirName: string;
  private readonly homeDir: string;

  constructor(options: ProfileManagerOptions = {}) {
    this.configDirName = normalizeConfigDirName(options.configDirName);
    this.homeDir = options.homeDir ?? homedir();
  }

  isDefault(name: string): boolean {
    return name === DEFAULT_PROFILE;
  }

  getRootDir(): string {
    return join(this.homeDir, this.configDirName);
  }

  getRegistryPath(): string {
    return join(this.getRootDir(), PROFILES_REGISTRY_FILE);
  }

  getProfileDir(name: string): string {
    ensureValidName(name);
    if (this.isDefault(name)) {
      return this.getRootDir();
    }
    return join(this.getRootDir(), PROFILES_DIR, name);
  }

  getProfileConfigPath(name: string): string {
    return join(this.getProfileDir(name), DEFAULT_CONFIG_FILE);
  }

  getProfileAgentsDir(name: string): string {
    return join(this.getProfileDir(name), "agents");
  }

  getProfileSessionsDir(name: string): string {
    return join(this.getProfileDir(name), "sessions");
  }

  getProfileCommandsDir(name: string): string {
    return join(this.getProfileDir(name), "commands");
  }

  async initialize(): Promise<void> {
    await mkdir(this.getRootDir(), { recursive: true });
    if (!(await pathExists(this.getRegistryPath()))) {
      await this.writeRegistry({
        active: DEFAULT_PROFILE,
        profiles: { [DEFAULT_PROFILE]: { name: DEFAULT_PROFILE, createdAt: Date.now() } },
      });
    }
  }

  async list(): Promise<ProfileMetadata[]> {
    const registry = await this.readRegistry();
    return Object.values(registry.profiles);
  }

  async getActive(): Promise<string> {
    const registry = await this.readRegistry();
    return registry.active;
  }

  async exists(name: string): Promise<boolean> {
    const registry = await this.readRegistry();
    return Boolean(registry.profiles[name]);
  }

  async create(name: string, options: CreateProfileOptions = {}): Promise<void> {
    ensureValidName(name);
    if (this.isDefault(name)) {
      throw new Error(`Profile "${name}" is reserved for the default profile.`);
    }
    const registry = await this.readRegistry();
    if (registry.profiles[name]) {
      throw new Error(`Profile "${name}" already exists.`);
    }
    const profileDir = this.getProfileDir(name);
    await mkdir(profileDir, { recursive: true });

    if (options.copyFrom) {
      const sourceDir = this.getProfileDir(options.copyFrom);
      await cp(sourceDir, profileDir, { recursive: true, force: false, errorOnExist: false });
    }

    registry.profiles[name] = {
      name,
      createdAt: Date.now(),
      description: options.description,
    };
    await this.writeRegistry(registry);
  }

  async delete(name: string, options: DeleteProfileOptions = {}): Promise<void> {
    ensureValidName(name);
    if (this.isDefault(name)) {
      throw new Error("Cannot delete the default profile.");
    }
    const registry = await this.readRegistry();
    if (!registry.profiles[name]) {
      if (options.force) return;
      throw new Error(`Profile "${name}" does not exist.`);
    }
    if (registry.active === name) {
      registry.active = DEFAULT_PROFILE;
    }
    delete registry.profiles[name];
    await this.writeRegistry(registry);
    await rm(this.getProfileDir(name), { recursive: true, force: true });
  }

  async switch(name: string): Promise<void> {
    ensureValidName(name);
    const registry = await this.readRegistry();
    if (!registry.profiles[name]) {
      throw new Error(`Profile "${name}" does not exist.`);
    }
    registry.active = name;
    await this.writeRegistry(registry);
  }

  private async readRegistry(): Promise<ProfilesRegistry> {
    const path = this.getRegistryPath();
    let raw: string;
    try {
      raw = await readFile(path, "utf8");
    } catch (err: unknown) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") {
        return {
          active: DEFAULT_PROFILE,
          profiles: { [DEFAULT_PROFILE]: { name: DEFAULT_PROFILE } },
        };
      }
      throw err;
    }
    const trimmed = raw.trim();
    if (!trimmed) {
      return {
        active: DEFAULT_PROFILE,
        profiles: { [DEFAULT_PROFILE]: { name: DEFAULT_PROFILE } },
      };
    }
    try {
      const parsed = path.endsWith(".json") ? JSON.parse(raw) : parseYaml(raw);
      const data = (parsed ?? {}) as Partial<ProfilesRegistry>;
      const active = data.active ?? DEFAULT_PROFILE;
      const profiles = data.profiles ?? { [DEFAULT_PROFILE]: { name: DEFAULT_PROFILE } };
      return { active, profiles };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      throw new Error(`Failed to parse profiles registry ${path}: ${message}`);
    }
  }

  private async writeRegistry(registry: ProfilesRegistry): Promise<void> {
    await mkdir(this.getRootDir(), { recursive: true });
    await writeFile(this.getRegistryPath(), stringifyYaml(registry), "utf8");
  }
}
