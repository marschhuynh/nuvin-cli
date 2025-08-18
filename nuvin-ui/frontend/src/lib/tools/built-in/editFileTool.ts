import { Tool } from '@/types/tools';
import { readFile, writeFile } from '@/lib/fs-bridge';

function applyPatch(original: string, patch: string): string | null {
  const origLines = original.split('\n');
  const patchLines = patch.split('\n');
  let result: string[] = [];
  let linePtr = 0;

  for (let i = 0; i < patchLines.length; i++) {
    const line = patchLines[i];
    if (!line.startsWith('@@')) {
      // skip headers until we reach first hunk
      continue;
    }
    const match = /@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/.exec(line);
    if (!match) {
      return null;
    }
    const startOld = parseInt(match[1], 10);
    i++;
    // copy unchanged lines before this hunk
    while (linePtr < startOld - 1) {
      result.push(origLines[linePtr] || '');
      linePtr++;
    }
    // process hunk lines
    while (i < patchLines.length && !patchLines[i].startsWith('@@')) {
      const pline = patchLines[i];
      if (pline.startsWith(' ')) {
        result.push(origLines[linePtr] || '');
        linePtr++;
      } else if (pline.startsWith('-')) {
        linePtr++;
      } else if (pline.startsWith('+')) {
        result.push(pline.slice(1));
      } else if (pline.startsWith('\\')) {
        // "\\ No newline at end of file" -> ignore
      } else if (pline === '') {
        // blank line in patch: treat as context
        result.push(origLines[linePtr] || '');
        linePtr++;
      } else {
        return null;
      }
      i++;
    }
    i--; // step back because outer loop will increment
  }

  // append remaining lines
  while (linePtr < origLines.length) {
    result.push(origLines[linePtr]);
    linePtr++;
  }

  return result.join('\n');
}

export const editFileTool: Tool = {
  definition: {
    name: 'edit_file',
    description: 'Applies a unified diff patch to modify a file',
    parameters: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: 'Path of the file to edit'
        },
        patch: {
          type: 'string',
          description: 'Unified diff patch to apply'
        }
      },
      required: ['path', 'patch']
    }
  },

  async execute(parameters) {
    try {
      const { path, patch } = parameters as { path: string; patch: string };

      if (!path || typeof path !== 'string') {
        return {
          status: 'error',
          type: 'text',
          result: 'path parameter is required and must be a string'
        };
      }
      if (!patch || typeof patch !== 'string') {
        return {
          status: 'error',
          type: 'text',
          result: 'patch parameter is required and must be a string'
        };
      }

      const original = await readFile(path);
      const patched = applyPatch(original, patch);
      if (patched === null) {
        return { status: 'error', type: 'text', result: 'Failed to apply patch' };
      }
      await writeFile(path, patched);
      return { status: 'success', type: 'text', result: 'File edited successfully' };
    } catch (err) {
      return {
        status: 'error',
        type: 'text',
        result: `Failed to edit file: ${err instanceof Error ? err.message : err}`
      };
    }
  },

  validate(parameters) {
    if (!parameters.path || typeof parameters.path !== 'string') {
      return false;
    }
    if (!parameters.patch || typeof parameters.patch !== 'string') {
      return false;
    }
    return true;
  },

  category: 'filesystem',
  version: '1.0.0',
  author: 'system'
};
