import { z } from 'zod';
import type { ToolParameterMap, ToolName } from './tool-params.js';

export type ValidationResult<T = unknown> = { valid: true; data: T } | { valid: false; errors: string[] };

export type ToolValidator<T extends ToolName> = (
  params: Record<string, unknown>,
) => ValidationResult<ToolParameterMap[T]>;

export const bashToolSchema = z.object({
  cmd: z.string({ message: 'cmd must be a non-empty string' }).min(1, 'cmd must be a non-empty string'),
  cwd: z.string().optional(),
  timeoutMs: z.number().int().positive({ message: 'timeoutMs must be positive' }).optional(),
  description: z.string().optional(),
});

export const fileReadSchema = z.object({
  path: z.string({ message: 'path must be a non-empty string' }).min(1, 'path must be a non-empty string'),
  lineStart: z.number().int().positive({ message: 'lineStart must be positive' }).optional(),
  lineEnd: z.number().int().positive({ message: 'lineEnd must be positive' }).optional(),
  description: z.string().optional(),
});

export const fileEditSchema = z.object({
  file_path: z
    .string({ message: 'file_path must be a non-empty string' })
    .min(1, 'file_path must be a non-empty string'),
  old_text: z.string({ message: 'old_text is required' }),
  new_text: z.string({ message: 'new_text is required' }),
  dry_run: z.boolean().optional(),
  description: z.string().optional(),
});

export const fileNewSchema = z.object({
  file_path: z
    .string({ message: 'file_path must be a non-empty string' })
    .min(1, 'file_path must be a non-empty string'),
  content: z.string({ message: 'content is required' }),
  description: z.string().optional(),
});

export const lsToolSchema = z.object({
  path: z.string().optional(),
  limit: z.number().int().positive({ message: 'limit must be positive' }).optional(),
  description: z.string().optional(),
});

export const webSearchSchema = z.object({
  query: z.string({ message: 'query must be a non-empty string' }).min(1, 'query must be a non-empty string'),
  count: z.number().int().min(1).max(50).optional(),
  offset: z.number().int().nonnegative().optional(),
  domains: z.array(z.string()).optional(),
  recencyDays: z.number().int().positive({ message: 'recencyDays must be positive' }).optional(),
  lang: z.string().optional(),
  region: z.string().optional(),
  safe: z.boolean().optional(),
  type: z.enum(['web', 'images']).optional(),
  hydrateMeta: z.boolean().optional(),
  description: z.string().optional(),
});

export const webFetchSchema = z.object({
  url: z.string({ message: 'url must be a valid URL' }).url('url must be a valid URL'),
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
    .min(1, 'todos must be a non-empty array'),
  description: z.string().optional(),
});

export const assignTaskSchema = z.object({
  agent: z.string({ message: 'agent must be a non-empty string' }).min(1, 'agent must be a non-empty string'),
  task: z.string({ message: 'task must be a non-empty string' }).min(1, 'task must be a non-empty string'),
  description: z
    .string({ message: 'description must be a non-empty string' })
    .min(1, 'description must be a non-empty string'),
});

export const globToolSchema = z.object({
  pattern: z.string({ message: 'pattern must be a non-empty string' }).min(1, 'pattern must be a non-empty string'),
  path: z.string().optional(),
  description: z.string().optional(),
});

export const grepToolSchema = z.object({
  pattern: z.string({ message: 'pattern must be a non-empty string' }).min(1, 'pattern must be a non-empty string'),
  path: z.string().optional(),
  include: z.string().optional(),
  description: z.string().optional(),
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
};
