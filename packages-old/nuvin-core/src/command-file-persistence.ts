import * as fs from 'node:fs';
import * as path from 'node:path';
import { parse as parseYaml, stringify as stringifyYaml } from 'yaml';
import type {
  CommandSource,
  CustomCommandTemplate,
  CustomCommandFrontmatter,
} from './command-types.js';
import { sanitizeCommandId } from './command-types.js';

export interface CommandFilePersistenceOptions {
  globalDir: string;
  profileDir?: string;
  localDir: string;
}

export class CommandFilePersistence {
  private globalDir: string;
  private profileDir?: string;
  private localDir: string;

  constructor(options: CommandFilePersistenceOptions) {
    this.globalDir = options.globalDir;
    this.profileDir = options.profileDir;
    this.localDir = options.localDir;
  }

  setProfileDir(profileDir: string | undefined): void {
    this.profileDir = profileDir;
  }

  getDir(source: CommandSource): string {
    switch (source) {
      case 'global':
        return this.globalDir;
      case 'profile':
        if (!this.profileDir) {
          throw new Error('Profile directory not set');
        }
        return this.profileDir;
      case 'local':
        return this.localDir;
    }
  }

  private ensureDir(dir: string): void {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }

  async loadAll(): Promise<CustomCommandTemplate[]> {
    const commands: CustomCommandTemplate[] = [];
    const sources: CommandSource[] = ['global', 'local'];
    
    if (this.profileDir) {
      sources.splice(1, 0, 'profile');
    }

    for (const source of sources) {
      try {
        const dir = this.getDir(source);
        const loaded = await this.loadFromDir(dir, source);
        commands.push(...loaded);
      } catch {
        // Directory might not exist, skip
      }
    }

    return commands;
  }

  private async loadFromDir(dir: string, source: CommandSource): Promise<CustomCommandTemplate[]> {
    const commands: CustomCommandTemplate[] = [];

    if (!fs.existsSync(dir)) {
      return commands;
    }

    const files = fs.readdirSync(dir);
    const mdFiles = files.filter((f) => f.endsWith('.md'));

    for (const file of mdFiles) {
      try {
        const command = await this.load(file, source);
        if (command) {
          commands.push(command);
        }
      } catch (error) {
        console.warn(`Failed to load command from ${file}:`, error);
      }
    }

    return commands;
  }

  async load(filename: string, source: CommandSource): Promise<CustomCommandTemplate | null> {
    try {
      const dir = this.getDir(source);
      const filePath = path.join(dir, filename);
      const content = fs.readFileSync(filePath, 'utf8');
      
      const { frontmatter, body } = this.parseFrontmatter(content);
      
      if (!frontmatter.description) {
        console.warn(`Invalid command template in ${filename}: missing description`);
        return null;
      }

      const id = path.basename(filename, '.md');

      return {
        id,
        description: frontmatter.description,
        prompt: body.trim(),
        enabled: frontmatter.enabled ?? true,
        source,
        filePath,
      };
    } catch (error) {
      console.warn(`Failed to load command from ${filename}:`, error);
      return null;
    }
  }

  async save(command: CustomCommandTemplate): Promise<void> {
    const dir = this.getDir(command.source);
    this.ensureDir(dir);

    const id = sanitizeCommandId(command.id);
    const filename = `${id}.md`;
    const filePath = path.join(dir, filename);

    const frontmatter: CustomCommandFrontmatter = {
      description: command.description,
    };

    if (command.enabled === false) {
      frontmatter.enabled = false;
    }

    const content = this.buildMarkdown(frontmatter, command.prompt);
    fs.writeFileSync(filePath, content, 'utf8');
  }

  async delete(commandId: string, source: CommandSource): Promise<void> {
    const dir = this.getDir(source);
    const filename = `${sanitizeCommandId(commandId)}.md`;
    const filePath = path.join(dir, filename);

    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  }

  exists(commandId: string, source: CommandSource): boolean {
    try {
      const dir = this.getDir(source);
      const filename = `${sanitizeCommandId(commandId)}.md`;
      const filePath = path.join(dir, filename);
      return fs.existsSync(filePath);
    } catch {
      return false;
    }
  }

  private parseFrontmatter(content: string): { frontmatter: Partial<CustomCommandFrontmatter>; body: string } {
    const frontmatterRegex = /^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/;
    const match = content.match(frontmatterRegex);

    if (!match) {
      return {
        frontmatter: {},
        body: content,
      };
    }

    try {
      const frontmatter = parseYaml(match[1] || '') as Partial<CustomCommandFrontmatter>;
      return {
        frontmatter: frontmatter || {},
        body: match[2] || '',
      };
    } catch {
      return {
        frontmatter: {},
        body: content,
      };
    }
  }

  private buildMarkdown(frontmatter: CustomCommandFrontmatter, body: string): string {
    const yamlContent = stringifyYaml(frontmatter, { lineWidth: 0 }).trim();
    return `---\n${yamlContent}\n---\n\n${body}\n`;
  }
}
