import assert from "node:assert/strict";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { test } from "vitest";

import { assertWorkspaceFile, isProbablyBinary, resolveWorkspacePath } from "./workspace-paths.ts";

test("resolveWorkspacePath resolves relative paths inside the root", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "nuvin-paths-"));

  assert.equal(resolveWorkspacePath(root, "src/index.ts"), path.join(root, "src/index.ts"));
});

test("resolveWorkspacePath rejects traversal outside the root", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "nuvin-paths-"));

  assert.throws(() => resolveWorkspacePath(root, "../outside.txt"), /outside workspace/i);
});

test("resolveWorkspacePath rejects absolute paths outside the root", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "nuvin-paths-"));

  assert.throws(() => resolveWorkspacePath(root, os.tmpdir()), /outside workspace/i);
});

test("assertWorkspaceFile accepts files and rejects directories", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "nuvin-paths-"));
  const filePath = path.join(root, "file.txt");
  await writeFile(filePath, "plain text\n");
  await assertWorkspaceFile(filePath);

  await mkdir(path.join(root, "dir"));
  await assert.rejects(() => assertWorkspaceFile(path.join(root, "dir")), /not a file/i);
});

test("isProbablyBinary detects nul bytes", () => {
  assert.equal(isProbablyBinary(Buffer.from([65, 0, 66])), true);
  assert.equal(isProbablyBinary(Buffer.from("plain text")), false);
});
