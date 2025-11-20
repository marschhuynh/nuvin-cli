import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { parse as parseYaml, stringify as stringifyYaml } from 'yaml';
import type { ProfileMetadata, ProfileRegistry, CreateProfileOptions, DeleteProfileOptions } from './profile-types';
import { DEFAULT_PROFILE, PROFILES_REGISTRY_FILE, PROFILES_DIR } from './profile-types';

export class ProfileManager {
  private readonly baseDir: string; // ~/.nuvin-cli
  private readonly profilesDir: string; // ~/.nuvin-cli/profiles
  private readonly registryPath: string; // ~/.nuvin-cli/profiles.yaml
  private registry: ProfileRegistry;

  constructor(private readonly logger: (message: string) => void = () => {}) {
    this.baseDir = path.join(os.homedir(), '.nuvin-cli');
    this.profilesDir = path.join(this.baseDir, PROFILES_DIR);
    this.registryPath = path.join(this.baseDir, PROFILES_REGISTRY_FILE);
    this.registry = { active: DEFAULT_PROFILE, profiles: {} };
  }

  async initialize(): Promise<void> {
    // Ensure base directory exists
    await fs.promises.mkdir(this.baseDir, { recursive: true });
    
    // Ensure profiles directory exists
    await fs.promises.mkdir(this.profilesDir, { recursive: true });

    // Load registry or create initial one
    this.registry = await this.loadRegistry();
  }

  // Core operations
  async list(): Promise<ProfileMetadata[]> {
    const profiles: ProfileMetadata[] = [];
    
    // Always include default profile (implicit)
    profiles.push({
      name: DEFAULT_PROFILE,
      description: 'Default profile',
      created: new Date().toISOString(),
      lastUsed: new Date().toISOString(),
    });

    // Add explicit profiles from registry
    for (const profile of Object.values(this.registry.profiles)) {
      profiles.push(profile);
    }

    return profiles;
  }

  async create(name: string, options: CreateProfileOptions = {}): Promise<void> {
    // Validate name
    if (name === DEFAULT_PROFILE) {
      throw new Error(`Cannot create profile named '${DEFAULT_PROFILE}' (reserved)`);
    }

    if (!/^[a-zA-Z0-9_-]+$/.test(name)) {
      throw new Error('Profile name must contain only alphanumeric characters, hyphens, and underscores');
    }

    if (await this.exists(name)) {
      throw new Error(`Profile '${name}' already exists`);
    }

    const profileDir = this.getProfileDir(name);
    await fs.promises.mkdir(profileDir, { recursive: true });

    // Create subdirectories
    await fs.promises.mkdir(path.join(profileDir, 'agents'), { recursive: true });
    await fs.promises.mkdir(path.join(profileDir, 'sessions'), { recursive: true });

    // Clone from existing profile if requested
    if (options.cloneFrom && options.cloneFrom !== DEFAULT_PROFILE) {
      if (!(await this.exists(options.cloneFrom))) {
        throw new Error(`Source profile '${options.cloneFrom}' does not exist`);
      }
      await this.cloneProfileFiles(options.cloneFrom, name);
    }

    // Add to registry
    const metadata: ProfileMetadata = {
      name,
      description: options.description,
      created: new Date().toISOString(),
      lastUsed: new Date().toISOString(),
    };

    this.registry.profiles[name] = metadata;
    await this.saveRegistry();
  }

  async delete(name: string, options: DeleteProfileOptions = {}): Promise<void> {
    if (name === DEFAULT_PROFILE) {
      throw new Error(`Cannot delete default profile`);
    }

    if (!(await this.exists(name))) {
      throw new Error(`Profile '${name}' does not exist`);
    }

    if (this.registry.active === name) {
      if (!options.force) {
        throw new Error(`Cannot delete active profile '${name}'. Switch to another profile first or use --force`);
      }
      // Switch back to default if forcing deletion of active profile
      this.registry.active = DEFAULT_PROFILE;
    }

    // Remove profile directory
    const profileDir = this.getProfileDir(name);
    if (fs.existsSync(profileDir)) {
      await fs.promises.rm(profileDir, { recursive: true, force: true });
    }

    // Remove from registry
    delete this.registry.profiles[name];
    await this.saveRegistry();
  }

  async switch(name: string): Promise<void> {
    if (name !== DEFAULT_PROFILE && !(await this.exists(name))) {
      throw new Error(`Profile '${name}' does not exist`);
    }

    this.registry.active = name;
    
    // Update last used time
    if (name !== DEFAULT_PROFILE && this.registry.profiles[name]) {
      this.registry.profiles[name].lastUsed = new Date().toISOString();
    }

    await this.saveRegistry();
  }

  async getActive(): Promise<string> {
    return this.registry.active || DEFAULT_PROFILE;
  }

  async exists(name: string): Promise<boolean> {
    if (name === DEFAULT_PROFILE) {
      return true; // Default profile always exists
    }

    return name in this.registry.profiles && fs.existsSync(this.getProfileDir(name));
  }

  // Path resolution
  getProfileDir(name: string): string {
    if (this.isDefault(name)) {
      return this.baseDir;
    }
    return path.join(this.profilesDir, name);
  }

  getProfileConfigPath(name: string): string {
    return path.join(this.getProfileDir(name), 'config.yaml');
  }

  getProfileMcpConfigPath(name: string): string {
    return path.join(this.getProfileDir(name), '.nuvin_mcp.json');
  }

  getProfileAgentsDir(name: string): string {
    return path.join(this.getProfileDir(name), 'agents');
  }

  getProfileSessionsDir(name: string): string {
    return path.join(this.getProfileDir(name), 'sessions');
  }

  // Check if profile is the default
  isDefault(name: string): boolean {
    return name === DEFAULT_PROFILE;
  }

  private async loadRegistry(): Promise<ProfileRegistry> {
    if (!fs.existsSync(this.registryPath)) {
      return { active: DEFAULT_PROFILE, profiles: {} };
    }

    try {
      const content = await fs.promises.readFile(this.registryPath, 'utf-8');
      const parsed = parseYaml(content);
      
      if (!parsed || typeof parsed !== 'object') {
        return { active: DEFAULT_PROFILE, profiles: {} };
      }

      const registry = parsed as ProfileRegistry;
      
      // Validate structure
      if (!registry.profiles || typeof registry.profiles !== 'object') {
        registry.profiles = {};
      }

      if (!registry.active) {
        registry.active = DEFAULT_PROFILE;
      }

      return registry;
    } catch (error) {
      this.logger(`Failed to load profiles registry: ${error instanceof Error ? error.message : String(error)}`);
      return { active: DEFAULT_PROFILE, profiles: {} };
    }
  }

  private async saveRegistry(): Promise<void> {
    try {
      const yaml = stringifyYaml(this.registry);
      await fs.promises.writeFile(this.registryPath, yaml, 'utf-8');
    } catch (error) {
      this.logger(`Failed to save profiles registry: ${error instanceof Error ? error.message : String(error)}`);
      throw error;
    }
  }

  private async cloneProfileFiles(source: string, target: string): Promise<void> {
    const sourceDir = this.getProfileDir(source);
    const targetDir = this.getProfileDir(target);

    // Copy config file if exists
    const sourceConfig = path.join(sourceDir, 'config.yaml');
    const targetConfig = path.join(targetDir, 'config.yaml');
    if (fs.existsSync(sourceConfig)) {
      await fs.promises.copyFile(sourceConfig, targetConfig);
    }

    // Copy MCP config if exists
    const sourceMcp = path.join(sourceDir, '.nuvin_mcp.json');
    const targetMcp = path.join(targetDir, '.nuvin_mcp.json');
    if (fs.existsSync(sourceMcp)) {
      await fs.promises.copyFile(sourceMcp, targetMcp);
    }

    // Copy agents directory if exists
    const sourceAgents = path.join(sourceDir, 'agents');
    const targetAgents = path.join(targetDir, 'agents');
    if (fs.existsSync(sourceAgents)) {
      await this.copyDirectory(sourceAgents, targetAgents);
    }

    // Note: We don't copy sessions directory for privacy reasons
  }

  private async copyDirectory(source: string, target: string): Promise<void> {
    await fs.promises.mkdir(target, { recursive: true });
    
    const entries = await fs.promises.readdir(source, { withFileTypes: true });
    
    for (const entry of entries) {
      const sourcePath = path.join(source, entry.name);
      const targetPath = path.join(target, entry.name);

      if (entry.isDirectory()) {
        await this.copyDirectory(sourcePath, targetPath);
      } else {
        await fs.promises.copyFile(sourcePath, targetPath);
      }
    }
  }
}