import * as path from 'node:path';
import {
  CommandFilePersistence,
  type CommandSource,
  type CustomCommandTemplate,
  type CompleteCustomCommand,
  sanitizeCommandId,
} from '@nuvin/nuvin-core';

export interface CustomCommandRegistryOptions {
  globalDir: string;
  profileDir?: string;
  localDir: string;
  activeProfile?: string;
}

export class CustomCommandRegistry {
  private commands = new Map<string, CompleteCustomCommand>();
  private allCommands = new Map<string, CompleteCustomCommand[]>();
  private persistence: CommandFilePersistence;
  private activeProfile?: string;
  private globalDir: string;
  private profileDir?: string;
  private localDir: string;

  constructor(options: CustomCommandRegistryOptions) {
    this.globalDir = path.join(options.globalDir, 'commands');
    this.profileDir = options.profileDir ? path.join(options.profileDir, 'commands') : undefined;
    this.localDir = path.join(options.localDir, 'commands');
    this.activeProfile = options.activeProfile;

    this.persistence = new CommandFilePersistence({
      globalDir: this.globalDir,
      profileDir: this.profileDir,
      localDir: this.localDir,
    });
  }

  async initialize(): Promise<void> {
    await this.loadCommands();
  }

  private async loadCommands(): Promise<void> {
    this.commands.clear();
    this.allCommands.clear();

    const allTemplates = await this.persistence.loadAll();

    for (const template of allTemplates) {
      const complete = this.toComplete(template);

      if (!this.allCommands.has(complete.id)) {
        this.allCommands.set(complete.id, []);
      }
      this.allCommands.get(complete.id)?.push(complete);
    }

    for (const [id, versions] of this.allCommands) {
      const sorted = this.sortByPriority(versions);
      const firstItem = sorted[0];

      for (let i = 1; i < sorted.length; i++) {
        const item = sorted[i];
        if (item && firstItem) {
          item.shadowedBy = firstItem.source;
        }
      }

      if (firstItem) {
        this.commands.set(id, firstItem);
      }
    }
  }

  private sortByPriority(commands: CompleteCustomCommand[]): CompleteCustomCommand[] {
    const priority: Record<CommandSource, number> = {
      local: 0,
      profile: 1,
      global: 2,
    };

    return [...commands].sort((a, b) => priority[a.source] - priority[b.source]);
  }

  private toComplete(template: CustomCommandTemplate): CompleteCustomCommand {
    return {
      id: template.id,
      description: template.description,
      prompt: template.prompt,
      enabled: template.enabled ?? true,
      source: template.source,
      filePath: template.filePath || '',
    };
  }

  setActiveProfile(profile: string | undefined, profileDir: string | undefined): void {
    this.activeProfile = profile;
    this.profileDir = profileDir ? path.join(profileDir, 'commands') : undefined;
    this.persistence.setProfileDir(this.profileDir);
  }

  getActiveProfile(): string | undefined {
    return this.activeProfile;
  }

  hasActiveProfile(): boolean {
    return this.activeProfile !== undefined && this.activeProfile !== 'default';
  }

  register(command: CustomCommandTemplate): void {
    const complete = this.toComplete(command);

    if (!this.allCommands.has(complete.id)) {
      this.allCommands.set(complete.id, []);
    }

    const versions = this.allCommands.get(complete.id);
    if (!versions) return;

    const existingIndex = versions.findIndex((v) => v.source === complete.source);
    if (existingIndex >= 0) {
      versions[existingIndex] = complete;
    } else {
      versions.push(complete);
    }

    const sorted = this.sortByPriority(versions);
    const firstItem = sorted[0];
    for (let i = 1; i < sorted.length; i++) {
      const item = sorted[i];
      if (item && firstItem) {
        item.shadowedBy = firstItem.source;
      }
    }
    if (firstItem) {
      firstItem.shadowedBy = undefined;
      this.commands.set(complete.id, firstItem);
    }
  }

  unregister(commandId: string, source?: CommandSource): void {
    if (source) {
      const versions = this.allCommands.get(commandId);
      if (versions) {
        const index = versions.findIndex((v) => v.source === source);
        if (index >= 0) {
          versions.splice(index, 1);
        }

        if (versions.length === 0) {
          this.allCommands.delete(commandId);
          this.commands.delete(commandId);
        } else {
          const sorted = this.sortByPriority(versions);
          const firstItem = sorted[0];
          for (let i = 1; i < sorted.length; i++) {
            const item = sorted[i];
            if (item && firstItem) {
              item.shadowedBy = firstItem.source;
            }
          }
          if (firstItem) {
            firstItem.shadowedBy = undefined;
            this.commands.set(commandId, firstItem);
          }
        }
      }
    } else {
      this.commands.delete(commandId);
      this.allCommands.delete(commandId);
    }
  }

  get(commandId: string): CompleteCustomCommand | undefined {
    return this.commands.get(commandId);
  }

  list(options?: { includeHidden?: boolean }): CompleteCustomCommand[] {
    const commands = Array.from(this.commands.values());
    if (options?.includeHidden) {
      return commands;
    }
    return commands.filter((cmd) => cmd.enabled);
  }

  listAll(): CompleteCustomCommand[] {
    const all: CompleteCustomCommand[] = [];
    for (const versions of this.allCommands.values()) {
      all.push(...versions);
    }
    return all;
  }

  exists(commandId: string): boolean {
    return this.commands.has(commandId);
  }

  getShadowed(commandId: string): CompleteCustomCommand[] {
    const versions = this.allCommands.get(commandId);
    if (!versions || versions.length <= 1) {
      return [];
    }
    const sorted = this.sortByPriority(versions);
    return sorted.slice(1);
  }

  async saveToFile(command: CompleteCustomCommand): Promise<void> {
    await this.persistence.save(command);
    this.register(command);
  }

  async deleteFromFile(commandId: string, source: CommandSource): Promise<void> {
    await this.persistence.delete(commandId, source);
    this.unregister(commandId, source);
  }

  renderPrompt(commandId: string, userPrompt: string): string {
    const command = this.get(commandId);
    if (!command) {
      return userPrompt;
    }
    return command.prompt.replace(/\{\{user_prompt\}\}/g, userPrompt);
  }

  getSource(commandId: string): CommandSource | undefined {
    return this.commands.get(commandId)?.source;
  }

  getAvailableScopes(): CommandSource[] {
    const scopes: CommandSource[] = ['global'];
    if (this.hasActiveProfile()) {
      scopes.push('profile');
    }
    scopes.push('local');
    return scopes;
  }

  getCommandFilePath(commandId: string, source: CommandSource): string {
    const filename = `${sanitizeCommandId(commandId)}.md`;
    const dir = this.persistence.getDir(source);
    return path.join(dir, filename);
  }

  async reload(): Promise<void> {
    await this.loadCommands();
  }
}
