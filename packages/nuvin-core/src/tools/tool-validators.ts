import { z } from 'zod';
import type { ToolParameterMap, ToolName } from './tool-params.js';

export type ValidationResult<T = unknown> = { valid: true; data: T } | { valid: false; errors: string[] };

export type ToolValidator<T extends ToolName> = (
  params: Record<string, unknown>,
) => ValidationResult<ToolParameterMap[T]>;

const requiredString = (label: string) =>
  z.preprocess(
    (value) => (typeof value === 'string' ? value : ''),
    z.string().min(1, `${label} must be a non-empty string`),
  );

export const bashToolSchema = z.object({
  cmd: requiredString('cmd'),
  cwd: z.string().optional(),
  timeoutMs: z.number().int().positive({ message: 'must be positive' }).optional(),
  description: z.string().optional(),
  ignoreOutput: z.boolean().optional(),
});

export const fileReadSchema = z.preprocess(
  (value) => {
    if (value && typeof value === 'object' && 'file_path' in value && !('path' in value)) {
      const record = value as Record<string, unknown>;
      return { ...record, path: record.file_path };
    }
    return value;
  },
  z.object({
    path: requiredString('path'),
    lineStart: z.number().int().positive({ message: 'must be positive' }).optional(),
    lineEnd: z.number().int().positive({ message: 'must be positive' }).optional(),
    description: z.string().optional(),
  }),
);

export const fileEditSchema = z.object({
  file_path: requiredString('file_path'),
  old_text: requiredString('old_text'),
  new_text: requiredString('new_text'),
  dry_run: z.boolean().optional(),
  description: z.string().optional(),
});

export const fileNewSchema = z.object({
  file_path: requiredString('file_path'),
  content: requiredString('content'),
  description: z.string().optional(),
});

export const lsToolSchema = z.object({
  path: z.string().optional(),
  limit: z.number().int().positive({ message: 'must be positive' }).optional(),
  description: z.string().optional(),
});

export const webSearchSchema = z.object({
  query: requiredString('query'),
  count: z.number().int().min(1).max(50).optional(),
  offset: z.number().int().nonnegative().optional(),
  domains: z.array(z.string()).optional(),
  recencyDays: z.number().int().positive({ message: 'must be positive' }).optional(),
  lang: z.string().optional(),
  region: z.string().optional(),
  safe: z.boolean().optional(),
  type: z.enum(['web', 'images']).optional(),
  hydrateMeta: z.boolean().optional(),
  description: z.string().optional(),
});

export const webFetchSchema = z.object({
  url: requiredString('url').refine((value) => {
    try {
      new URL(value);
      return true;
    } catch {
      return false;
    }
  }, 'url must be a valid URL'),
  description: z.string().optional(),
});

export const todoWriteSchema = z.object({
  todos: z
    .array(
      z.object({
        id: z.string().min(1),
        content: z.string().min(1),
        status: z.enum(['pending', 'in_progress', 'completed']),
        priority: z.enum(['high', 'medium', 'low']),
        createdAt: z.string().optional(),
      }),
    )
    .min(1, 'must be a non-empty array'),
  description: z.string().optional(),
});

export const assignTaskSchema = z.object({
  agent: requiredString('agent'),
  task: requiredString('task'),
  description: requiredString('description'),
});

export const globToolSchema = z.object({
  pattern: requiredString('pattern'),
  path: z.string().optional(),
  description: z.string().optional(),
});

export const grepToolSchema = z.object({
  pattern: requiredString('pattern'),
  path: z.string().optional(),
  include: z.string().optional(),
  limit: z.number().int().min(1).optional(),
  description: z.string().optional(),
});

export const computerToolSchema = z.object({
  action: z.enum(['snapshot', 'press', 'set_value', 'type', 'key', 'scroll', 'screenshot', 'wait', 'list_apps', 'annotated_screenshot']),
  ref: z.number().int().optional(),
  app: z.string().optional(),
  text: z.string().optional(),
  key: z.string().optional(),
  direction: z.enum(['up', 'down', 'left', 'right']).optional(),
  amount: z.number().int().min(1).optional(),
  duration: z.number().int().min(0).optional(),
});

export const toolSchemas = {
  bash_tool: bashToolSchema,
  file_read: fileReadSchema,
  file_edit: fileEditSchema,
  file_new: fileNewSchema,
  ls_tool: lsToolSchema,
  web_search: webSearchSchema,
  web_fetch: webFetchSchema,
  todo_write: todoWriteSchema,
  assign_task: assignTaskSchema,
  glob_tool: globToolSchema,
  grep_tool: grepToolSchema,
  computer: computerToolSchema,
} as const;

export function validateToolParams<T extends ToolName>(
  toolName: T,
  params: Record<string, unknown>,
): ValidationResult<ToolParameterMap[T]> {
  const schema = toolSchemas[toolName];
  if (!schema) {
    return { valid: true, data: params as ToolParameterMap[T] };
  }

  const result = schema.safeParse(params);
  if (result.success) {
    return { valid: true, data: result.data as ToolParameterMap[T] };
  }

  const errors = result.error.issues.map((err) => `${err.path.join('.')}: ${err.message}`);

  return { valid: false, errors };
}

export const toolValidators = {
  bash_tool: (params: Record<string, unknown>) => validateToolParams('bash_tool', params),
  file_read: (params: Record<string, unknown>) => validateToolParams('file_read', params),
  file_edit: (params: Record<string, unknown>) => validateToolParams('file_edit', params),
  file_new: (params: Record<string, unknown>) => validateToolParams('file_new', params),
  ls_tool: (params: Record<string, unknown>) => validateToolParams('ls_tool', params),
  web_search: (params: Record<string, unknown>) => validateToolParams('web_search', params),
  web_fetch: (params: Record<string, unknown>) => validateToolParams('web_fetch', params),
  todo_write: (params: Record<string, unknown>) => validateToolParams('todo_write', params),
  assign_task: (params: Record<string, unknown>) => validateToolParams('assign_task', params),
  glob_tool: (params: Record<string, unknown>) => validateToolParams('glob_tool', params),
  grep_tool: (params: Record<string, unknown>) => validateToolParams('grep_tool', params),
  computer: (params: Record<string, unknown>) => validateToolParams('computer', params),
};
