import { createHash } from "node:crypto";
import { readFile, rename, stat, writeFile } from "node:fs/promises";
import * as path from "node:path";

import { createToolOutput, defineTool, ToolExecutionError } from "./tools.ts";
import { assertWorkspaceFile, resolveWorkspacePath } from "./workspace-paths.ts";

export interface FileEditToolOptions {
  defaultCwd?: string;
  name?: string;
}

type Eol = "crlf" | "lf";

function detectEol(buffer: Buffer): Eol {
  return /\r\n/.test(buffer.toString("utf8")) ? "crlf" : "lf";
}

function normalizeToLf(text: string): string {
  return text.replace(/\r\n/g, "\n");
}

function convertEol(text: string, eol: Eol): string {
  return eol === "crlf" ? text.replace(/\n/g, "\r\n") : text;
}

async function atomicWrite(target: string, bytes: Buffer): Promise<void> {
  const dir = path.dirname(target);
  const tmp = path.join(
    dir,
    `.tmp.${path.basename(target)}.${Date.now()}.${Math.random().toString(36).slice(2)}`,
  );
  await writeFile(tmp, bytes);
  await rename(tmp, target);
}

function sha256(buffer: Buffer): string {
  return createHash("sha256").update(buffer).digest("hex");
}

function countLines(text: string): number {
  const trimmed = text.replace(/\n$/, "");
  return trimmed.length === 0 ? 0 : trimmed.split("\n").length;
}

function calculateLineNumbers(
  original: string,
  oldText: string,
  newText: string,
  matchIndex: number,
) {
  const oldStartLine = original.slice(0, matchIndex).split("\n").length;
  const oldLineCount = countLines(oldText);
  const newLineCount = countLines(newText);
  return {
    oldStartLine,
    oldEndLine: oldStartLine + oldLineCount - 1,
    newStartLine: oldStartLine,
    newEndLine: oldStartLine + newLineCount - 1,
    oldLineCount,
    newLineCount,
  };
}

export function createFileEditTool(options: FileEditToolOptions = {}) {
  const defaultCwd = path.resolve(options.defaultCwd ?? process.cwd());
  const name = options.name ?? "FileEdit";

  return defineTool({
    name,
    description: "Edit a UTF-8 text file by replacing the first exact text segment.",
    inputSchema: {
      type: "object",
      properties: {
        filePath: { type: "string" },
        oldText: { type: "string" },
        newText: { type: "string" },
        dryRun: { type: "boolean" },
      },
      required: ["filePath", "oldText", "newText"] as const,
    },
    async *execute(input) {
      const filePath = resolveWorkspacePath(defaultCwd, input.filePath);
      await assertWorkspaceFile(filePath);
      const stats = await stat(filePath);
      const buffer = await readFile(filePath);

      const eol = detectEol(buffer);
      const before = normalizeToLf(buffer.toString("utf8"));
      const oldText = normalizeToLf(input.oldText);
      const newText = normalizeToLf(input.newText);
      const index = before.indexOf(oldText);

      if (index === -1) {
        const preview = oldText.slice(0, 100).replace(/\n/g, "\\n");
        throw new ToolExecutionError(
          `oldText not found in file. Make sure it matches exactly including whitespace. Searching for: "${preview}${oldText.length > 100 ? "..." : ""}"`,
          { filePath: input.filePath },
        );
      }

      const afterLf = before.slice(0, index) + newText + before.slice(index + oldText.length);
      const afterText = convertEol(afterLf, eol);
      const afterBytes = Buffer.from(afterText, "utf8");
      const beforeSha = sha256(buffer);
      const afterSha = sha256(afterBytes);
      const noChange = beforeSha === afterSha;
      const dryRun = input.dryRun ?? false;

      if (!dryRun && !noChange) {
        await atomicWrite(filePath, afterBytes);
      }

      yield createToolOutput(
        noChange
          ? "No changes (content identical)."
          : dryRun
            ? "Validated (dry run: no write)."
            : "Edit applied successfully.",
        {
          filePath: input.filePath,
          resolvedPath: filePath,
          created: stats.birthtime.toISOString(),
          modified: stats.mtime.toISOString(),
          size: stats.size,
          eol,
          oldTextLength: oldText.length,
          newTextLength: newText.length,
          bytesWritten: noChange || dryRun ? 0 : afterBytes.length,
          beforeSha,
          afterSha,
          dryRun,
          noChange,
          lineNumbers: calculateLineNumbers(before, oldText, newText, index),
        },
      );
      return undefined;
    },
  });
}
