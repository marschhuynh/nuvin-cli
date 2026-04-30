import { z } from 'zod';

export const SkillFrontmatterSchema = z.object({
  name: z
    .string()
    .min(1)
    .max(64)
    .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, 'Must be lowercase alphanumeric with hyphens'),
  description: z.string().min(1).max(1024),
  disabled: z.boolean().optional(),
  license: z.string().optional(),
  compatibility: z.string().max(500).optional(),
  metadata: z.record(z.string(), z.string()).optional(),
  'allowed-tools': z.string().optional(),
});

export type SkillFrontmatter = z.infer<typeof SkillFrontmatterSchema>;

export interface SkillInfo {
  name: string;
  description: string;
  location: string;
}

export interface Skill extends SkillInfo {
  content: string;
  license?: string;
  compatibility?: string;
  metadata?: Record<string, string>;
  allowedTools?: string[];
  hasScripts: boolean;
  hasReferences: boolean;
  hasAssets: boolean;
}

export interface SkillsConfig {
  enabled?: boolean;
  directories?: string[];
  exclude?: string[];
  enabledSkills?: Record<string, boolean>;
}

export interface SkillToolResult {
  title: string;
  output: string;
  metadata: {
    name: string;
    dir: string;
  };
}

export interface SkillDiscoveryError {
  path: string;
  message: string;
  type: 'invalid-frontmatter' | 'missing-file' | 'invalid-name' | 'parse-error';
}

export interface SkillDiscoveryResult {
  skills: Record<string, SkillInfo>;
  errors: SkillDiscoveryError[];
}

export function validateSkillFrontmatter(
  data: Record<string, unknown>,
): { success: true; data: SkillFrontmatter } | { success: false; error: string } {
  const result = SkillFrontmatterSchema.safeParse(data);
  if (!result.success) {
    const errors = result.error.issues.map((e) => e.message).join(', ');
    return { success: false, error: errors };
  }
  return { success: true, data: result.data };
}
