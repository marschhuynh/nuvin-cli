import { Tool } from '@/types/tools';
import { readFile } from '@/lib/fs-bridge';

export const readFileTool: Tool = {
  definition: {
    name: 'read_file',
    description: 'Reads the contents of a file. Optionally return a specific line range.',
    parameters: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: 'Path to the file to read'
        },
        start: {
          type: 'number',
          description: 'Optional start line number (1-indexed)'
        },
        end: {
          type: 'number',
          description: 'Optional end line number (1-indexed, inclusive)'
        }
      },
      required: ['path']
    }
  },

  async execute(parameters) {
    try {
      const { path, start, end } = parameters as {
        path: string; start?: number; end?: number;
      };

      if (!path || typeof path !== 'string') {
        return {
          status: 'error',
          type: 'text',
          result: 'path parameter is required and must be a string'
        };
      }

      const data = await readFile(path);
      let result = data;

      if (start !== undefined || end !== undefined) {
        const lines = data.split(/\r?\n/);
        const s = Math.max((start ?? 1) - 1, 0);
        const e = end ? Math.min(end, lines.length) : lines.length;
        result = lines.slice(s, e).join('\n');
      }

      return { status: 'success', type: 'text', result };
    } catch (err) {
      return {
        status: 'error',
        type: 'text',
        result: `Failed to read file: ${err instanceof Error ? err.message : err}`
      };
    }
  },

  validate(parameters) {
    if (!parameters.path || typeof parameters.path !== 'string') {
      return false;
    }
    if (parameters.start !== undefined && typeof parameters.start !== 'number') {
      return false;
    }
    if (parameters.end !== undefined && typeof parameters.end !== 'number') {
      return false;
    }
    return true;
  },

  category: 'filesystem',
  version: '1.0.0',
  author: 'system'
};
