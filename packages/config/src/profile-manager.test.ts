import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { ConfigManager } from "./manager.js";
import { ProfileManager } from "./profile-manager.js";

async function makeHome(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "nuvin-profile-"));
  await mkdir(join(root, ".nuvin"), { recursive: true });
  return root;
}

describe("ProfileManager paths", () => {
  it("default profile maps to ~/.nuvin", async () => {
    const home = await makeHome();
    const manager = new ProfileManager({ homeDir: home });
    expect(manager.getProfileDir("default")).toBe(join(home, ".nuvin"));
    expect(manager.getProfileConfigPath("default")).toBe(join(home, ".nuvin", "config.yaml"));
  });

  it("named profile maps under profiles/<name>", async () => {
    const home = await makeHome();
    const manager = new ProfileManager({ homeDir: home });
    expect(manager.getProfileDir("work")).toBe(join(home, ".nuvin", "profiles", "work"));
  });

  it("maps profile paths under a custom config directory name", async () => {
    const home = await makeHome();
    const manager = new ProfileManager({ configDirName: ".nuvin-dev", homeDir: home });

    expect(manager.getProfileDir("default")).toBe(join(home, ".nuvin-dev"));
    expect(manager.getProfileConfigPath("work")).toBe(
      join(home, ".nuvin-dev", "profiles", "work", "config.yaml"),
    );
    expect(manager.getProfileAgentsDir("work")).toBe(
      join(home, ".nuvin-dev", "profiles", "work", "agents"),
    );
  });

  it("rejects invalid names", async () => {
    const home = await makeHome();
    const manager = new ProfileManager({ homeDir: home });
    expect(() => manager.getProfileDir("bad name")).toThrow(/Invalid profile name/);
    expect(() => manager.getProfileDir("bad/name")).toThrow(/Invalid profile name/);
  });

  it("initialize creates the registry file", async () => {
    const home = await makeHome();
    const manager = new ProfileManager({ homeDir: home });
    await manager.initialize();
    expect(await manager.getActive()).toBe("default");
    expect(await manager.exists("default")).toBe(true);
  });

  it("create + switch + delete round-trips through registry", async () => {
    const home = await makeHome();
    const manager = new ProfileManager({ homeDir: home });
    await manager.initialize();
    await manager.create("work");
    await manager.switch("work");
    expect(await manager.getActive()).toBe("work");
    await manager.delete("work");
    expect(await manager.exists("work")).toBe(false);
    expect(await manager.getActive()).toBe("default");
  });
});

describe("ConfigManager profile loading", () => {
  it("reads global config from the named profile directory", async () => {
    const home = await makeHome();
    const profileDir = join(home, ".nuvin", "profiles", "work");
    await mkdir(profileDir, { recursive: true });
    await writeFile(join(profileDir, "config.yaml"), "model: profile-work\n");

    const cm = new ConfigManager({ homeDir: home, cwd: home });
    const result = await cm.load({ profile: "work" });
    expect(result.config.model).toBe("profile-work");
  });
});
