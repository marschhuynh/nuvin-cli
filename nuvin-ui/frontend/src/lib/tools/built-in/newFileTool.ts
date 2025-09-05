import type { Tool } from '@/types/tools';
import { mkdirAll, pathExists, writeFile, getFsRuntime } from '@/lib/fs-bridge';
import { isAbsolutePath } from './utils'

export const newFileTool: Tool = {
  definition: {
    name: 'new_file',
    description:
      'Creates a new file with the provided content. Requires an absolute path and fails if the file already exists.',
    parameters: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: 'Absolute path of the file to create (no relative paths)',
        },
        content: {
          type: 'string',
          description: 'Content to write to the new file',
        },
      },
      required: ['path', 'content'],
    },
  },

  async execute(parameters) {
    try {
      // Guard: this tool requires Wails desktop or Node test runtime
      const runtime = getFsRuntime();
      if (runtime === 'browser') {
        return {
          status: 'error',
          type: 'text',
          result:
            'Filesystem tools are only available in the desktop app. Start via "cd nuvin-ui && wails3 dev" (or run under Node/Vitest). The browser dev server cannot access your host filesystem.',
        };
      }

      const { path: filePath, content } = parameters as {
        path: string;
        content: string;
      };

      if (!filePath || typeof filePath !== 'string') {
        return {
          status: 'error',
          type: 'text',
          result: 'path parameter is required and must be a string',
        };
      }

      if (!isAbsolutePath(filePath)) {
        return { status: 'error', type: 'text', result: 'Absolute path required. Relative paths are not allowed.' };
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
        result: `Failed to create file: ${err instanceof Error ? err.message : err}`,
      };
    }
  },

  validate(parameters) {
    if (!parameters.path || typeof parameters.path !== 'string') {
      return false;
    }
    // Absolute path enforcement
    const p: string = parameters.path;
    const isAbs = p.startsWith('/') || /^\\\\/.test(p) || /^\\/.test(p) || /^[a-zA-Z]:[\\/]/.test(p);
    if (!isAbs) return false;
    if (typeof parameters.content !== 'string') {
      return false;
    }
    return true;
  },

  category: 'filesystem',
  version: '1.0.0',
  author: 'system',
};
