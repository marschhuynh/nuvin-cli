import { Tool } from '@/types/tools';
import { mkdirAll, pathExists, writeFile } from '@/lib/fs-bridge';

export const newFileTool: Tool = {
  definition: {
    name: 'new_file',
    description: 'Creates a new file with the provided content. Fails if the file already exists.',
    parameters: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: 'Path of the file to create'
        },
        content: {
          type: 'string',
          description: 'Content to write to the new file'
        }
      },
      required: ['path', 'content']
    }
  },

  async execute(parameters) {
    try {
      const { path: filePath, content } = parameters as { path: string; content: string };

      if (!filePath || typeof filePath !== 'string') {
        return {
          status: 'error',
          type: 'text',
          result: 'path parameter is required and must be a string'
        };
      }

      if (await pathExists(filePath)) {
        return { status: 'error', type: 'text', result: 'File already exists' };
      }

      // ensure parent directory exists (basic dirname implementation)
      const sepIndex = Math.max(filePath.lastIndexOf('/'), filePath.lastIndexOf('\\'));
      const dir = sepIndex > 0 ? filePath.slice(0, sepIndex) : '';
      if (dir) {
        await mkdirAll(dir);
      }
      await writeFile(filePath, content);

      return { status: 'success', type: 'text', result: 'File created' };
    } catch (err) {
      return {
        status: 'error',
        type: 'text',
        result: `Failed to create file: ${err instanceof Error ? err.message : err}`
      };
    }
  },

  validate(parameters) {
    if (!parameters.path || typeof parameters.path !== 'string') {
      return false;
    }
    if (typeof parameters.content !== 'string') {
      return false;
    }
    return true;
  },

  category: 'filesystem',
  version: '1.0.0',
  author: 'system'
};
