import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { ConfigManager } from "./manager.js";

async function makeRoot(): Promise<{ root: string; home: string; cwd: string }> {
  const root = await mkdtemp(join(tmpdir(), "nuvin-config-"));
  const home = join(root, "home");
  const cwd = join(root, "workspace");
  await mkdir(join(home, ".nuvin"), { recursive: true });
  await mkdir(join(cwd, ".nuvin"), { recursive: true });
  return { root, home, cwd };
}

describe("ConfigManager.load", () => {
  it("merges global, local, explicit, env, and direct scopes in priority order", async () => {
    const { root, home, cwd } = await makeRoot();

    await writeFile(
      join(home, ".nuvin", "config.yaml"),
      "model: global\nui:\n  theme:\n    mode: dark\n",
    );
    await writeFile(join(cwd, ".nuvin", "config.json"), JSON.stringify({ model: "local" }));
    await writeFile(join(root, "explicit.yaml"), "model: explicit\n");

    const manager = new ConfigManager({ homeDir: home, cwd });
    await manager.load({ explicitPath: join(root, "explicit.yaml") });
    manager.loadConfig({ model: "env" }, "env");
    manager.loadConfig({ requireToolApproval: false }, "direct");

    expect(manager.getConfig()).toMatchObject({
      model: "env",
      requireToolApproval: false,
      ui: { theme: { mode: "dark" } },
    });
  });

  it("treats empty config files as empty objects", async () => {
    const { home, cwd } = await makeRoot();
    await writeFile(join(home, ".nuvin", "config.yaml"), "");
    const manager = new ConfigManager({ homeDir: home, cwd });
    const result = await manager.load();
    expect(result.config).toEqual({});
  });

  it("reports the file path when YAML is invalid", async () => {
    const { home, cwd } = await makeRoot();
    await writeFile(join(home, ".nuvin", "config.yaml"), "model: : bad\n");
    const manager = new ConfigManager({ homeDir: home, cwd });
    await expect(manager.load()).rejects.toThrow(/config\.yaml/);
  });

  it("falls back to local when no global is present", async () => {
    const { home, cwd } = await makeRoot();
    await writeFile(join(cwd, ".nuvin", "config.yaml"), "model: local-only\n");
    const manager = new ConfigManager({ homeDir: home, cwd });
    const result = await manager.load();
    expect(result.config.model).toBe("local-only");
  });

  it("loads global and local config from a custom config directory name", async () => {
    const { home, cwd } = await makeRoot();
    await mkdir(join(home, ".nuvin-dev"), { recursive: true });
    await mkdir(join(cwd, ".nuvin-dev"), { recursive: true });
    await writeFile(join(home, ".nuvin-dev", "config.yaml"), "activeModel: global-model\n");
    await writeFile(join(cwd, ".nuvin-dev", "config.yaml"), "activeModel: local-model\n");

    const manager = new ConfigManager({ configDirName: ".nuvin-dev", homeDir: home, cwd });
    const result = await manager.load();

    expect(result.config.activeModel).toBe("local-model");
    expect(result.sources.map((source) => source.path)).toEqual([
      join(home, ".nuvin-dev", "config.yaml"),
      join(cwd, ".nuvin-dev", "config.yaml"),
    ]);
    expect(manager.getGlobalConfigPath()).toBe(join(home, ".nuvin-dev", "config.yaml"));
  });

  it("exposes scope sources in priority order", async () => {
    const { home, cwd } = await makeRoot();
    await writeFile(join(home, ".nuvin", "config.yaml"), "model: g\n");
    await writeFile(join(cwd, ".nuvin", "config.yaml"), "model: l\n");
    const manager = new ConfigManager({ homeDir: home, cwd });
    const result = await manager.load();
    expect(result.sources.map((source) => source.scope)).toEqual(["global", "local"]);
  });
});
