import { readFile, stat } from "node:fs/promises";
import * as path from "node:path";

import { createToolOutput, defineTool, ToolExecutionError } from "./tools.ts";
import { assertWorkspaceFile, isProbablyBinary, resolveWorkspacePath } from "./workspace-paths.ts";

export interface FileReadToolOptions {
  defaultCwd?: string;
  name?: string;
}

function stripUtfBom(text: string): string {
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
}

function clampLine(value: number, max: number): number {
  if (!Number.isFinite(value)) return 1;
  return Math.max(1, Math.min(Math.trunc(value), max));
}

export function createFileReadTool(options: FileReadToolOptions = {}) {
  const defaultCwd = path.resolve(options.defaultCwd ?? process.cwd());
  const name = options.name ?? "FileRead";

  return defineTool({
    name,
    description: "Read a UTF-8 text file from the workspace. Optionally specify line ranges.",
    inputSchema: {
      type: "object",
      properties: {
        path: { type: "string" },
        lineStart: { type: "number" },
        lineEnd: { type: "number" },
      },
      required: ["path"] as const,
    },
    async *execute(input) {
      const filePath = resolveWorkspacePath(defaultCwd, input.path);
      await assertWorkspaceFile(filePath);
      const stats = await stat(filePath);
      const payload = await readFile(filePath);
      if (isProbablyBinary(payload)) {
        throw new ToolExecutionError(`File appears to be binary: ${input.path}`, {
          path: input.path,
        });
      }

      let text = payload.toString("utf8");
      const bomStripped = text.charCodeAt(0) === 0xfeff;
      text = stripUtfBom(text);
      const lines = text.split(/\r?\n/);

      const metadata = {
        path: input.path,
        resolvedPath: filePath,
        created: stats.birthtime.toISOString(),
        modified: stats.mtime.toISOString(),
        size: stats.size,
        encoding: "utf8",
        bomStripped,
        truncated: false,
        totalLines: lines.length,
      };

      if (input.lineStart !== undefined || input.lineEnd !== undefined) {
        const start = clampLine(input.lineStart ?? 1, lines.length);
        const end = clampLine(input.lineEnd ?? lines.length, lines.length);
        const lineStart = Math.min(start, end);
        const lineEnd = Math.max(start, end);
        const output = lines
          .slice(lineStart - 1, lineEnd)
          .map((line, index) => `${lineStart + index}|${line}`)
          .join("\n");

        yield createToolOutput(output, {
          ...metadata,
          lineRange: {
            lineStart,
            lineEnd,
            linesTotal: lines.length,
          },
        });
        return undefined;
      }

      yield createToolOutput(text, metadata);
      return undefined;
    },
  });
}
