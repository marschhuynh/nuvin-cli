import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';
import { parse as parseYaml } from 'yaml';
import {
  validateSkillFrontmatter,
  type SkillInfo,
  type Skill,
  type SkillsConfig,
  type SkillDiscoveryResult,
  type SkillDiscoveryError,
} from '@/types/skills.js';

const SKILL_FILE = 'SKILL.md';

function getDefaultDirectories(homeDir: string): string[] {
  return [
    '.claude/skills',
    path.join(homeDir, '.claude', 'skills'),
    '.nuvin/skills',
    path.join(homeDir, '.nuvin', 'skills'),
  ];
}

function parseFrontmatter(content: string): { data: Record<string, unknown>; content: string } | null {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/);
  if (!match) return null;

  try {
    const data = parseYaml(match[1]) as Record<string, unknown>;
    return { data, content: match[2] };
  } catch {
    return null;
  }
}

async function exists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function isDirectory(filePath: string): Promise<boolean> {
  try {
    const stat = await fs.stat(filePath);
    return stat.isDirectory();
  } catch {
    return false;
  }
}

export class SkillsService {
  private static instance: SkillsService | null = null;
  private skills: Record<string, SkillInfo> = {};
  private errors: SkillDiscoveryError[] = [];
  private config: SkillsConfig = {};
  private enabledSkills: Record<string, boolean> = {};
  private discovered = false;
  private homeDir: string;

  constructor(homeDir?: string) {
    this.homeDir = homeDir ?? os.homedir();
  }

  static getInstance(): SkillsService {
    if (!SkillsService.instance) {
      SkillsService.instance = new SkillsService();
    }
    return SkillsService.instance;
  }

  static resetInstance(): void {
    SkillsService.instance = null;
  }

  static createWithHomeDir(homeDir: string): SkillsService {
    return new SkillsService(homeDir);
  }

  setConfig(config: SkillsConfig): void {
    this.enabledSkills = config.enabledSkills ?? {};
    this.config = config;
    this.discovered = false;
  }

  async discover(cwd: string = process.cwd()): Promise<SkillDiscoveryResult> {
    if (this.discovered) {
      return { skills: this.skills, errors: this.errors };
    }

    this.skills = {};
    this.errors = [];

    const directories = this.getSearchDirectories(cwd);

    for (const dir of directories) {
      await this.scanDirectory(dir);
    }

    this.discovered = true;
    return { skills: this.skills, errors: this.errors };
  }

  private getSearchDirectories(cwd: string): string[] {
    const dirs: string[] = [];
    const defaultDirs = getDefaultDirectories(this.homeDir);

    for (const dir of defaultDirs) {
      if (path.isAbsolute(dir)) {
        dirs.push(dir);
      } else {
        dirs.push(path.join(cwd, dir));
      }
    }

    if (this.config.directories) {
      for (const dir of this.config.directories) {
        const resolved = dir.startsWith('~') ? path.join(this.homeDir, dir.slice(1)) : dir;
        if (path.isAbsolute(resolved)) {
          dirs.push(resolved);
        } else {
          dirs.push(path.join(cwd, resolved));
        }
      }
    }

    const envPath = process.env.NUVIN_SKILLS_PATH;
    if (envPath) {
      for (const dir of envPath.split(path.delimiter)) {
        if (dir.trim()) {
          dirs.push(dir.trim());
        }
      }
    }

    return [...new Set(dirs)];
  }

  private async scanDirectory(baseDir: string): Promise<void> {
    if (!(await isDirectory(baseDir))) return;

    try {
      const entries = await fs.readdir(baseDir, { withFileTypes: true });

      for (const entry of entries) {
        if (!entry.isDirectory()) continue;

        const skillDir = path.join(baseDir, entry.name);
        const skillFile = path.join(skillDir, SKILL_FILE);

        if (await exists(skillFile)) {
          await this.loadSkill(skillFile, skillDir);
        }
      }
    } catch {
      // Directory doesn't exist or can't be read
    }
  }

  private async loadSkill(skillFile: string, skillDir: string): Promise<void> {
    try {
      const content = await fs.readFile(skillFile, 'utf-8');
      const parsed = parseFrontmatter(content);

      if (!parsed) {
        this.errors.push({
          path: skillFile,
          message: 'Invalid or missing frontmatter',
          type: 'parse-error',
        });
        return;
      }

      const result = validateSkillFrontmatter(parsed.data);
      if (!result.success) {
        this.errors.push({
          path: skillFile,
          message: result.error,
          type: 'invalid-frontmatter',
        });
        return;
      }

      const dirName = path.basename(skillDir);
      if (result.data.name !== dirName) {
        this.errors.push({
          path: skillFile,
          message: `Skill name "${result.data.name}" must match directory name "${dirName}"`,
          type: 'invalid-name',
        });
        return;
      }

      if (result.data.disabled) {
        return;
      }

      if (this.config.exclude?.includes(result.data.name)) {
        return;
      }

      if (this.skills[result.data.name]) {
        return;
      }

      this.skills[result.data.name] = {
        name: result.data.name,
        description: result.data.description,
        location: skillFile,
      };
    } catch (err) {
      this.errors.push({
        path: skillFile,
        message: err instanceof Error ? err.message : 'Unknown error',
        type: 'parse-error',
      });
    }
  }

  async get(name: string): Promise<SkillInfo | null> {
    if (!this.discovered) {
      await this.discover();
    }
    if (!this.isEnabled(name)) return null;
    return this.skills[name] ?? null;
  }

  async getAll(): Promise<Record<string, SkillInfo>> {
    if (!this.discovered) {
      await this.discover();
    }
    const result: Record<string, SkillInfo> = {};
    for (const [name, info] of Object.entries(this.skills)) {
      if (this.isEnabled(name)) {
        result[name] = info;
      }
    }
    return result;
  }

  async loadFull(name: string): Promise<Skill | null> {
    const info = await this.get(name);
    if (!info) return null;

    try {
      const content = await fs.readFile(info.location, 'utf-8');
      const parsed = parseFrontmatter(content);
      if (!parsed) return null;

      const result = validateSkillFrontmatter(parsed.data);
      if (!result.success) return null;

      const skillDir = path.dirname(info.location);

      const [hasScripts, hasReferences, hasAssets] = await Promise.all([
        isDirectory(path.join(skillDir, 'scripts')),
        isDirectory(path.join(skillDir, 'references')),
        isDirectory(path.join(skillDir, 'assets')),
      ]);

      return {
        name: result.data.name,
        description: result.data.description,
        location: info.location,
        content: parsed.content,
        license: result.data.license,
        compatibility: result.data.compatibility,
        metadata: result.data.metadata,
        allowedTools: result.data['allowed-tools']?.split(/\s+/).filter(Boolean),
        hasScripts,
        hasReferences,
        hasAssets,
      };
    } catch {
      return null;
    }
  }

  isEnabled(name: string): boolean {
    return this.enabledSkills[name] !== false;
  }

  buildToolDescription(): string {
    const skillList = Object.values(this.skills).filter((s) => this.isEnabled(s.name));

    if (skillList.length === 0) {
      return 'Load a skill to get detailed instructions for a specific task. No skills are currently available.';
    }

    const lines = [
      'Load a skill to get detailed instructions for a specific task.',
      'Skills provide specialized knowledge and step-by-step guidance.',
      'Use this when a task matches an available skill description.',
    ];

    for (const skill of skillList) {
      lines.push(`- ${skill.name}: ${skill.description}`);
    }
    return lines.join('\n');
  }

  getErrors(): SkillDiscoveryError[] {
    return [...this.errors];
  }

  reset(): void {
    this.skills = {};
    this.errors = [];
    this.discovered = false;
  }

  async create(
    skill: { name: string; description: string; content: string },
    location: 'local' | 'global' = 'local',
    cwd: string = process.cwd(),
  ): Promise<{ success: true; path: string } | { success: false; error: string }> {
    const namePattern = /^[a-z0-9]+(-[a-z0-9]+)*$/;
    if (!namePattern.test(skill.name)) {
      return { success: false, error: 'Name must be lowercase alphanumeric with hyphens' };
    }

    if (!skill.description.trim()) {
      return { success: false, error: 'Description is required' };
    }

    const baseDir =
      location === 'global' ? path.join(this.homeDir, '.nuvin', 'skills') : path.join(cwd, '.nuvin', 'skills');

    const skillDir = path.join(baseDir, skill.name);
    const skillFile = path.join(skillDir, SKILL_FILE);

    if (await exists(skillFile)) {
      return { success: false, error: `Skill "${skill.name}" already exists at ${skillFile}` };
    }

    try {
      await fs.mkdir(skillDir, { recursive: true });

      const frontmatter = `---
name: ${skill.name}
description: ${skill.description}
---
`;
      const fileContent = frontmatter + skill.content;
      await fs.writeFile(skillFile, fileContent, 'utf-8');

      this.skills[skill.name] = {
        name: skill.name,
        description: skill.description,
        location: skillFile,
      };

      return { success: true, path: skillFile };
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : 'Unknown error' };
    }
  }

  async update(
    originalName: string,
    skill: { name: string; description: string; content: string },
  ): Promise<{ success: true; path: string } | { success: false; error: string }> {
    const info = this.skills[originalName];
    if (!info) {
      return { success: false, error: `Skill "${originalName}" not found` };
    }

    const namePattern = /^[a-z0-9]+(-[a-z0-9]+)*$/;
    if (!namePattern.test(skill.name)) {
      return { success: false, error: 'Name must be lowercase alphanumeric with hyphens' };
    }

    if (!skill.description.trim()) {
      return { success: false, error: 'Description is required' };
    }

    const oldSkillDir = path.dirname(info.location);
    const baseDir = path.dirname(oldSkillDir);
    const renamed = skill.name !== originalName;

    if (renamed && this.skills[skill.name]) {
      return { success: false, error: `Skill "${skill.name}" already exists` };
    }

    try {
      const frontmatter = `---
name: ${skill.name}
description: ${skill.description}
---
`;
      const fileContent = frontmatter + skill.content;

      if (renamed) {
        const newSkillDir = path.join(baseDir, skill.name);
        const newSkillFile = path.join(newSkillDir, SKILL_FILE);

        await fs.mkdir(newSkillDir, { recursive: true });
        await fs.writeFile(newSkillFile, fileContent, 'utf-8');

        // Copy other files from old directory
        try {
          const entries = await fs.readdir(oldSkillDir, { withFileTypes: true });
          for (const entry of entries) {
            if (entry.name !== SKILL_FILE) {
              const srcPath = path.join(oldSkillDir, entry.name);
              const destPath = path.join(newSkillDir, entry.name);
              if (entry.isDirectory()) {
                await fs.cp(srcPath, destPath, { recursive: true });
              } else {
                await fs.copyFile(srcPath, destPath);
              }
            }
          }
        } catch {
          // Ignore errors copying extra files
        }

        await fs.rm(oldSkillDir, { recursive: true, force: true });

        delete this.skills[originalName];
        this.skills[skill.name] = {
          name: skill.name,
          description: skill.description,
          location: newSkillFile,
        };

        return { success: true, path: newSkillFile };
      } else {
        await fs.writeFile(info.location, fileContent, 'utf-8');

        this.skills[skill.name] = {
          name: skill.name,
          description: skill.description,
          location: info.location,
        };

        return { success: true, path: info.location };
      }
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : 'Unknown error' };
    }
  }

  async delete(name: string): Promise<{ success: true } | { success: false; error: string }> {
    const info = this.skills[name];
    if (!info) {
      return { success: false, error: `Skill "${name}" not found` };
    }

    try {
      const skillDir = path.dirname(info.location);
      await fs.rm(skillDir, { recursive: true, force: true });

      delete this.skills[name];
      return { success: true };
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : 'Unknown error' };
    }
  }

  list(): SkillInfo[] {
    return Object.values(this.skills).filter((s) => this.isEnabled(s.name));
  }

  exists(name: string): boolean {
    return name in this.skills;
  }
}

export const skillsService = SkillsService.getInstance();
