import { stat } from "node:fs/promises";
import * as path from "node:path";

import type { JsonObject } from "../shared/types.ts";
import * as Ripgrep from "./ripgrep.ts";
import { createToolOutput, defineTool, ToolExecutionError } from "./tools.ts";
import { resolveWorkspacePath } from "./workspace-paths.ts";

export interface GrepToolOptions {
  defaultCwd?: string;
  limit?: number;
  name?: string;
}

const MAX_LINE_LENGTH = 2000;

type GrepStructured = JsonObject & {
  fileCount: number;
  include?: string;
  matchCount: number;
  pattern: string;
  searchPath: string;
  truncated: boolean;
};

export function createGrepTool(options: GrepToolOptions = {}) {
  const defaultCwd = path.resolve(options.defaultCwd ?? process.cwd());
  const defaultLimit = options.limit ?? 100;
  const name = options.name ?? "Grep";

  return defineTool({
    name,
    description: "Search for a regex pattern in workspace file contents.",
    inputSchema: {
      type: "object",
      properties: {
        pattern: { type: "string" },
        path: { type: "string" },
        include: { type: "string" },
        limit: { type: "number" },
        context: { type: "number" },
      },
      required: ["pattern"] as const,
    },
    async *execute(input) {
      if (input.pattern.trim().length === 0) {
        throw new ToolExecutionError("pattern is required", {});
      }

      const searchPath = resolveWorkspacePath(defaultCwd, input.path ?? ".");
      const pathStats = await stat(searchPath).catch(() => null);
      const isFile = pathStats?.isFile() ?? false;
      const isDir = pathStats?.isDirectory() ?? false;
      if (!isFile && !isDir) {
        throw new ToolExecutionError(`Path not found: ${input.path ?? "."}`, {
          path: input.path ?? ".",
        });
      }

      const rawLimit = input.limit ?? defaultLimit;
      const limit = Math.max(1, Math.trunc(rawLimit));
      const matches = await Ripgrep.search({
        cwd: isDir ? searchPath : path.dirname(searchPath),
        pattern: input.pattern,
        glob: isDir ? input.include : undefined,
        limit,
        file: isFile ? searchPath : undefined,
        context: input.context,
      });

      const filesWithMtime = new Map<string, { matches: Ripgrep.RipgrepMatch[]; mtime: number }>();
      for (const match of matches) {
        if (!filesWithMtime.has(match.filePath)) {
          const fileStats = await stat(match.filePath).catch(() => null);
          filesWithMtime.set(match.filePath, {
            matches: [],
            mtime: fileStats?.mtimeMs ?? 0,
          });
        }
        filesWithMtime.get(match.filePath)?.matches.push(match);
      }

      const sortedFiles = [...filesWithMtime.entries()].sort((a, b) => b[1].mtime - a[1].mtime);
      const matchCount = matches.filter((match) => !match.isContext).length;
      const truncated = matches.length >= limit;
      const baseDir = isFile ? path.dirname(searchPath) : searchPath;

      let output = "";
      if (matches.length === 0) {
        output = `No matches found for pattern: ${input.pattern}`;
      } else {
        output = `Found ${matchCount} match${matchCount === 1 ? "" : "es"}\n`;
        for (const [filePath, fileData] of sortedFiles) {
          const relFilePath = isFile ? path.basename(filePath) : path.relative(baseDir, filePath);
          output += `\n${relFilePath}:\n`;
          for (const match of fileData.matches) {
            const lineText =
              match.lineText.length > MAX_LINE_LENGTH
                ? `${match.lineText.slice(0, MAX_LINE_LENGTH)}...`
                : match.lineText;
            const prefix = match.isContext ? "  " : "> ";
            output += `${prefix}Line ${match.lineNum}: ${lineText}\n`;
          }
        }
        if (truncated) {
          output += "\n(Results are truncated. Consider using a more specific path or pattern.)";
        }
      }

      const structured: GrepStructured = {
        searchPath: path.relative(defaultCwd, searchPath) || ".",
        pattern: input.pattern,
        matchCount,
        fileCount: filesWithMtime.size,
        truncated,
      };
      if (isDir && input.include !== undefined) {
        structured.include = input.include;
      }

      yield createToolOutput(output.trim(), structured);
      return undefined;
    },
  });
}
