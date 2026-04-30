import { stat } from "node:fs/promises";
import * as path from "node:path";
import * as Ripgrep from "./ripgrep.ts";
import { createToolOutput, defineTool, ToolExecutionError } from "./tools.ts";
import { resolveWorkspacePath } from "./workspace-paths.ts";

export interface GlobToolOptions {
  defaultCwd?: string;
  limit?: number;
  name?: string;
}

export function createGlobTool(options: GlobToolOptions = {}) {
  const defaultCwd = path.resolve(options.defaultCwd ?? process.cwd());
  const defaultLimit = options.limit ?? 100;
  const name = options.name ?? "Glob";

  return defineTool({
    name,
    description: "Find workspace files matching a glob pattern.",
    inputSchema: {
      type: "object",
      properties: {
        pattern: { type: "string" },
        path: { type: "string" },
        limit: { type: "number" },
      },
      required: ["pattern"] as const,
    },
    async *execute(input) {
      if (input.pattern.trim().length === 0) {
        throw new ToolExecutionError("pattern is required", {});
      }

      const searchRoot = resolveWorkspacePath(defaultCwd, input.path ?? ".");
      const stats = await stat(searchRoot).catch(() => null);
      if (!stats?.isDirectory()) {
        throw new ToolExecutionError(`Directory not found: ${input.path ?? "."}`, {
          path: input.path ?? ".",
        });
      }

      const rawLimit = input.limit ?? defaultLimit;
      const limit = Math.max(1, Math.trunc(rawLimit));
      const files: Array<{ mtime: number; path: string }> = [];
      let truncated = false;

      for await (const file of Ripgrep.files({ cwd: searchRoot, glob: [input.pattern] })) {
        if (files.length >= limit) {
          truncated = true;
          break;
        }
        const fileStats = await stat(path.join(searchRoot, file)).catch(() => null);
        files.push({ path: file, mtime: fileStats?.mtimeMs ?? 0 });
      }

      files.sort((a, b) => b.mtime - a.mtime);
      const matches = files.map((file) => file.path);
      const output =
        matches.length === 0
          ? `No files found matching pattern: ${input.pattern}`
          : `${matches.join("\n")}${
              truncated
                ? "\n(Results are truncated. Consider using a more specific path or pattern.)"
                : ""
            }`;

      yield createToolOutput(output, {
        pattern: input.pattern,
        searchPath: path.relative(defaultCwd, searchRoot) || ".",
        matches,
        count: matches.length,
        truncated,
      });
      return undefined;
    },
  });
}
