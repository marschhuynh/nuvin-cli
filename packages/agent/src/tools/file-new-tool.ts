import { mkdir, rename, stat, writeFile } from "node:fs/promises";
import * as path from "node:path";

import { createToolOutput, defineTool } from "./tools.ts";
import { resolveWorkspacePath } from "./workspace-paths.ts";

export interface FileNewToolOptions {
  defaultCwd?: string;
  name?: string;
}

async function atomicWrite(target: string, bytes: Buffer): Promise<void> {
  const dir = path.dirname(target);
  await mkdir(dir, { recursive: true });
  const tmp = path.join(
    dir,
    `.tmp.${path.basename(target)}.${Date.now()}.${Math.random().toString(36).slice(2)}`,
  );
  await writeFile(tmp, bytes);
  await rename(tmp, target);
}

export function createFileNewTool(options: FileNewToolOptions = {}) {
  const defaultCwd = path.resolve(options.defaultCwd ?? process.cwd());
  const name = options.name ?? "FileNew";

  return defineTool({
    name,
    description: "Create or overwrite a UTF-8 text file in the workspace.",
    inputSchema: {
      type: "object",
      properties: {
        filePath: { type: "string" },
        content: { type: "string" },
      },
      required: ["filePath", "content"] as const,
    },
    async *execute(input) {
      const filePath = resolveWorkspacePath(defaultCwd, input.filePath);
      const existsBefore = await stat(filePath)
        .then(() => true)
        .catch(() => false);
      const bytes = Buffer.from(input.content, "utf8");
      await atomicWrite(filePath, bytes);

      yield createToolOutput(`File written at ${input.filePath}.`, {
        filePath: input.filePath,
        resolvedPath: filePath,
        bytes: bytes.length,
        lines: input.content.split(/\r?\n/).length,
        created: new Date().toISOString(),
        overwritten: existsBefore,
      });
      return undefined;
    },
  });
}
