import { stat } from "node:fs/promises";
import * as path from "node:path";

import { ToolExecutionError } from "./tools.ts";

export function resolveWorkspacePath(rootDir: string, inputPath: string): string {
  const root = path.resolve(rootDir);
  const resolved = path.resolve(root, inputPath);
  const relative = path.relative(root, resolved);

  if (relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative))) {
    return resolved;
  }

  throw new ToolExecutionError(`Path is outside workspace: ${inputPath}`, {
    path: inputPath,
    rootDir: root,
  });
}

export async function assertWorkspaceFile(filePath: string): Promise<void> {
  const stats = await stat(filePath);
  if (!stats.isFile()) {
    throw new ToolExecutionError(`Path is not a file: ${filePath}`, { path: filePath });
  }
}

export function isProbablyBinary(buffer: Buffer): boolean {
  return buffer.includes(0);
}
