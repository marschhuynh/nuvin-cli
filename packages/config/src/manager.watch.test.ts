import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { ConfigManager } from "./manager.js";
import type { ConfigChangeEvent } from "./types.js";

async function makeHome(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "nuvin-watch-"));
  await mkdir(join(root, ".nuvin"), { recursive: true });
  return root;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

describe("ConfigManager subscriptions", () => {
  it("emits to subscribers when loadConfig changes runtime scope", async () => {
    const home = await makeHome();
    const cm = new ConfigManager({ homeDir: home, cwd: home });
    await cm.load();

    const events: ConfigChangeEvent[] = [];
    const unsubscribe = cm.subscribe((event) => {
      events.push(event);
    });

    cm.loadConfig({ model: "rt-model" }, "direct");

    expect(events).toHaveLength(1);
    expect(events[0]?.config.model).toBe("rt-model");
    expect(events[0]?.changedScopes).toEqual(["direct"]);

    unsubscribe();
    cm.loadConfig({ model: "rt-model-2" }, "direct");
    expect(events).toHaveLength(1);
  });

  it("reloads scopes when watched files change externally", async () => {
    const home = await makeHome();
    const configPath = join(home, ".nuvin", "config.yaml");
    await writeFile(configPath, "model: initial\n");

    const cm = new ConfigManager({ homeDir: home, cwd: home });
    await cm.load();

    const events: ConfigChangeEvent[] = [];
    cm.subscribe((event) => {
      events.push(event);
    });
    const stopWatching = cm.watch({ intervalMs: 100 });

    await delay(250);
    const { utimes } = await import("node:fs/promises");
    const future = new Date(Date.now() + 2000);
    await writeFile(configPath, "model: updated\n");
    await utimes(configPath, future, future);

    const start = Date.now();
    while (Date.now() - start < 6000) {
      if (cm.getConfig().model === "updated") break;
      await delay(100);
    }

    stopWatching();

    expect(cm.getConfig().model).toBe("updated");
    expect(events.some((event) => event.changedScopes.includes("global"))).toBe(true);
  }, 10000);
});
