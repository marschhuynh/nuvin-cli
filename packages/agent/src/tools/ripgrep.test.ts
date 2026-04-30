import assert from "node:assert/strict";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { test } from "vitest";

import * as Ripgrep from "./ripgrep.ts";

test("Ripgrep.files finds files with a glob", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "nuvin-rg-files-"));
  await mkdir(path.join(root, "src"));
  await writeFile(path.join(root, "src/index.ts"), "export const value = 1;\n");
  await writeFile(path.join(root, "src/index.js"), "module.exports = {};\n");

  const files: string[] = [];
  for await (const file of Ripgrep.files({ cwd: root, glob: ["**/*.ts"] })) {
    files.push(file);
  }

  assert.deepEqual(files, ["src/index.ts"]);
});

test("Ripgrep.search returns regex content matches with line numbers", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "nuvin-rg-search-"));
  await writeFile(path.join(root, "index.ts"), "alpha\nexport const value = 1;\n");

  const matches = await Ripgrep.search({
    cwd: root,
    pattern: "^export",
    limit: 10,
  });

  assert.equal(matches.length, 1);
  assert.equal(matches[0]?.filePath, path.join(root, "index.ts"));
  assert.equal(matches[0]?.lineNum, 2);
  assert.equal(matches[0]?.lineText, "export const value = 1;");
});
