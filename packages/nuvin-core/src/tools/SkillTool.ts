import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import type { ToolDefinition } from '../ports.js';
import { ErrorReason } from '../ports.js';
import type { FunctionTool, ToolExecutionContext, ExecResultError } from './types.js';
import { err } from './result-helpers.js';

export type SkillParams = {
  name: string;
};

export type SkillMetadata = {
  name: string;
  dir: string;
};

export type SkillSuccessResult = {
  status: 'success';
  type: 'text';
  result: string;
  metadata: SkillMetadata;
};

export type SkillErrorResult = ExecResultError & {
  metadata?: {
    name?: string;
    errorReason?: ErrorReason;
  };
};

export type SkillResult = SkillSuccessResult | SkillErrorResult;

export interface SkillInfo {
  name: string;
  description: string;
  location: string;
}

export interface SkillProvider {
  get(name: string): Promise<SkillInfo | null>;
  getAll(): Promise<Record<string, SkillInfo>>;
  buildToolDescription(): string;
  getPermission(name: string): 'allow' | 'ask' | 'deny';
}

function parseFrontmatter(content: string): { data: Record<string, unknown>; content: string } | null {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/);
  if (!match) return null;

  try {
    const lines = match[1].split('\n');
    const data: Record<string, unknown> = {};
    for (const line of lines) {
      const colonIndex = line.indexOf(':');
      if (colonIndex > 0) {
        const key = line.slice(0, colonIndex).trim();
        const value = line.slice(colonIndex + 1).trim();
        data[key] = value;
      }
    }
    return { data, content: match[2] };
  } catch {
    return null;
  }
}

export class SkillTool implements FunctionTool<SkillParams, ToolExecutionContext, SkillResult> {
  name = 'skill' as const;

  private provider: SkillProvider | null = null;
  private dynamicDescription: string = 'Load a skill to get detailed instructions. No skills available.';

  parameters = {
    type: 'object',
    properties: {
      name: {
        type: 'string',
        description: 'The skill identifier from available_skills (e.g., "front-end-skill" or "vitest-skill")',
      },
    },
    required: ['name'],
  } as const;

  setProvider(provider: SkillProvider): void {
    this.provider = provider;
    this.dynamicDescription = provider.buildToolDescription();
  }

  updateDescription(): void {
    if (this.provider) {
      this.dynamicDescription = this.provider.buildToolDescription();
    }
  }

  definition(): ToolDefinition['function'] {
    return {
      name: this.name,
      description: this.dynamicDescription,
      parameters: this.parameters,
    };
  }

  async execute(params: SkillParams, _context?: ToolExecutionContext): Promise<SkillResult> {
    if (!this.provider) {
      return err('Skill provider not configured', { name: params.name }, ErrorReason.Unknown);
    }

    if (!params.name || typeof params.name !== 'string') {
      return err('Parameter "name" must be a non-empty string', undefined, ErrorReason.InvalidInput);
    }

    const skill = await this.provider.get(params.name);

    if (!skill) {
      const all = await this.provider.getAll();
      const available = Object.keys(all).join(', ') || 'none';
      return err(
        `Skill "${params.name}" not found. Available skills: ${available}`,
        { name: params.name },
        ErrorReason.NotFound,
      );
    }

    const permission = this.provider.getPermission(params.name);
    if (permission === 'deny') {
      return err(`Skill "${params.name}" is not permitted`, { name: params.name }, ErrorReason.PermissionDenied);
    }

    try {
      const content = await fs.readFile(skill.location, 'utf-8');
      const parsed = parseFrontmatter(content);

      if (!parsed) {
        return err(`Failed to parse skill file: ${skill.location}`, { name: params.name }, ErrorReason.Unknown);
      }

      const dir = path.dirname(skill.location);

      const output = [`## Skill: ${skill.name}`, '', `**Base directory**: ${dir}`, '', parsed.content.trim()].join(
        '\n',
      );

      return {
        status: 'success',
        type: 'text',
        result: output,
        metadata: {
          name: skill.name,
          dir,
        },
      };
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      return err(`Failed to load skill: ${message}`, { name: params.name }, ErrorReason.Unknown);
    }
  }
}
