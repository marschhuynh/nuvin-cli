export type CommandSource = 'global' | 'profile' | 'local';

export interface CustomCommandTemplate {
  id: string;
  description: string;
  prompt: string;
  enabled?: boolean;
  source: CommandSource;
  filePath?: string;
}

export interface CompleteCustomCommand extends CustomCommandTemplate {
  id: string;
  description: string;
  prompt: string;
  enabled: boolean;
  source: CommandSource;
  filePath: string;
  shadowedBy?: CommandSource;
}

export interface CustomCommandFrontmatter {
  description: string;
  enabled?: boolean;
}

export function isValidCommandId(id: string): boolean {
  return /^[a-z][a-z0-9-]*$/.test(id);
}

export function sanitizeCommandId(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}
