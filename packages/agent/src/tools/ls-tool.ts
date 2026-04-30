import { readdir, readFile, stat } from "node:fs/promises";
import * as path from "node:path";
import * as yaml from "yaml";

import type { JsonObject } from "../shared/types.ts";
import { createToolOutput, defineTool, ToolExecutionError } from "./tools.ts";
import { isProbablyBinary, resolveWorkspacePath } from "./workspace-paths.ts";

export interface LsToolOptions {
  defaultCwd?: string;
  name?: string;
}

type DirEntryType = "directory" | "file" | "other" | "symlink";

type LsEntry = JsonObject & {
  lines?: number;
  mode?: number;
  mtime?: number;
  name: string;
  size?: number;
  type: DirEntryType;
};

async function countTextLines(filePath: string): Promise<number | undefined> {
  const buffer = await readFile(filePath).catch(() => null);
  if (!buffer || isProbablyBinary(buffer)) return undefined;
  return buffer.toString("utf8").split(/\r?\n/).length;
}

export function createLsTool(options: LsToolOptions = {}) {
  const defaultCwd = path.resolve(options.defaultCwd ?? process.cwd());
  const name = options.name ?? "Ls";

  return defineTool({
    name,
    description: "List files and directories in a workspace directory.",
    inputSchema: {
      type: "object",
      properties: {
        path: { type: "string" },
        limit: { type: "number" },
      },
    },
    async *execute(input) {
      const requestedPath = input.path ?? ".";
      const directoryPath = resolveWorkspacePath(defaultCwd, requestedPath);
      const directoryStats = await stat(directoryPath).catch(() => null);
      if (!directoryStats?.isDirectory()) {
        throw new ToolExecutionError(`Directory not found: ${requestedPath}`, {
          path: requestedPath,
        });
      }

      const rawLimit = input.limit ?? 1000;
      const limit = Math.min(Math.max(Math.trunc(rawLimit), 1), 10_000);
      const names = await readdir(directoryPath);
      const entries: LsEntry[] = [];

      for (const entryName of names.slice(0, limit)) {
        const entryPath = path.join(directoryPath, entryName);
        const entryStats = await stat(entryPath).catch(() => null);
        if (!entryStats) continue;

        let type: DirEntryType = "other";
        if (entryStats.isFile()) type = "file";
        else if (entryStats.isDirectory()) type = "directory";
        else if (entryStats.isSymbolicLink()) type = "symlink";

        const entry: LsEntry = {
          name: entryName,
          type,
          size: entryStats.size,
          mtime: entryStats.mtimeMs,
          mode: entryStats.mode,
        };

        const lines = type === "file" ? await countTextLines(entryPath) : undefined;
        if (lines !== undefined) entry.lines = lines;
        entries.push(entry);
      }

      entries.sort((a, b) => a.name.localeCompare(b.name));
      const outputData = {
        path: requestedPath,
        total: entries.length,
        truncated: names.length > limit,
        entries,
      };

      yield createToolOutput(yaml.stringify(outputData, { indent: 2, lineWidth: 0 }).trimEnd(), {
        path: requestedPath,
        total: entries.length,
        truncated: names.length > limit,
        limit,
        entries,
      });
      return undefined;
    },
  });
}
