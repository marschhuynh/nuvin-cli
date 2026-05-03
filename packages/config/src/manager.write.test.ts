import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { parse } from "yaml";

import { ConfigConflictError } from "./conflicts.js";
import { ConfigManager } from "./manager.js";

async function makeHome(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "nuvin-config-write-"));
  await mkdir(join(root, ".nuvin"), { recursive: true });
  return root;
}

async function readYamlConfig(home: string): Promise<Record<string, unknown>> {
  const raw = await readFile(join(home, ".nuvin", "config.yaml"), "utf8");
  return (parse(raw) ?? {}) as Record<string, unknown>;
}

describe("ConfigManager writes", () => {
  it("merges non-overlapping writes from separate manager instances", async () => {
    const home = await makeHome();
    const one = new ConfigManager({ homeDir: home, cwd: home });
    const two = new ConfigManager({ homeDir: home, cwd: home });

    await one.load();
    await two.load();

    await one.set("activeModel", "glm-4.7", "global");
    await two.set("ui.theme.mode", "light", "global");

    expect(await readYamlConfig(home)).toMatchObject({
      activeModel: "glm-4.7",
      ui: { theme: { mode: "light" } },
    });
  });

  it("detects same-scalar-path conflicts when disk changed since baseline", async () => {
    const home = await makeHome();
    const one = new ConfigManager({ homeDir: home, cwd: home });
    const two = new ConfigManager({ homeDir: home, cwd: home });
    await one.load();
    await two.load();
    await one.set("activeModel", "value-from-one", "global");

    await expect(two.set("activeModel", "value-from-two", "global")).rejects.toBeInstanceOf(
      ConfigConflictError,
    );

    expect(await readYamlConfig(home)).toMatchObject({ activeModel: "value-from-one" });
  });

  it("force=true overrides conflicts", async () => {
    const home = await makeHome();
    const one = new ConfigManager({ homeDir: home, cwd: home });
    const two = new ConfigManager({ homeDir: home, cwd: home });
    await one.load();
    await two.load();
    await one.set("activeModel", "value-from-one", "global");
    await two.set("activeModel", "value-from-two", "global", { force: true });

    expect(await readYamlConfig(home)).toMatchObject({ activeModel: "value-from-two" });
  });

  it("merges providers.<name>.auth by type", async () => {
    const home = await makeHome();
    const cm = new ConfigManager({ homeDir: home, cwd: home });
    await cm.load();
    await cm.update("global", {
      providers: {
        zai: { auth: [{ type: "apiKey", apiKey: "k1" }] },
      },
    });
    await cm.update("global", {
      providers: {
        zai: {
          auth: [
            { type: "apiKey", apiKey: "k2" },
            { type: "oauth", access: "a", refresh: "r" },
          ],
        },
      },
    });
    const persisted = (await readYamlConfig(home)) as {
      providers?: { zai?: { auth?: Array<{ type: string }> } };
    };
    const auth = persisted.providers?.zai?.auth ?? [];
    expect(auth).toHaveLength(2);
    expect(auth.map((entry) => entry.type).sort()).toEqual(["apiKey", "oauth"]);
  });

  it("merges recentModels by provider+model and caps at 5", async () => {
    const home = await makeHome();
    const cm = new ConfigManager({ homeDir: home, cwd: home });
    await cm.load();
    for (let i = 0; i < 7; i += 1) {
      await cm.update("global", {
        recentModels: [{ provider: "p", model: `m${i}`, usedAt: i }],
      });
    }
    const persisted = (await readYamlConfig(home)) as {
      recentModels?: Array<{ model: string }>;
    };
    expect(persisted.recentModels).toHaveLength(5);
    expect(persisted.recentModels?.[0]?.model).toBe("m6");
  });

  it("cleans up stale lock directories", async () => {
    const home = await makeHome();
    const targetPath = join(home, ".nuvin", "config.yaml");
    await writeFile(targetPath, "");
    await mkdir(`${targetPath}.lock`, { recursive: true });
    await writeFile(
      `${targetPath}.lock/owner.json`,
      JSON.stringify({ pid: 999999, hostname: "stale", createdAt: 0 }),
      "utf8",
    );
    const oldTime = new Date(Date.now() - 60_000);
    const { utimes } = await import("node:fs/promises");
    await utimes(`${targetPath}.lock`, oldTime, oldTime);
    await utimes(`${targetPath}.lock/owner.json`, oldTime, oldTime);

    const cm = new ConfigManager({ homeDir: home, cwd: home });
    await cm.load();
    await cm.set("activeModel", "after-stale", "global");
    expect(await readYamlConfig(home)).toMatchObject({ activeModel: "after-stale" });
  });
});
