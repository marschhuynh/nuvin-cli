import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import {
  discoverAgentDefinitionsFromDirectories,
  loadAgentDefinitionFromReference,
  loadAgentDefinitionsFromDirectories,
  resolveAgentDirectories,
} from "./agent-loader.js";
import { ConfigManager } from "./manager.js";

async function makeRoot(): Promise<{ root: string; home: string; cwd: string }> {
  const root = await mkdtemp(join(tmpdir(), "nuvin-agent-loader-"));
  const home = join(root, "home");
  const cwd = join(root, "workspace");
  await mkdir(join(home, ".nuvin", "profiles", "work"), { recursive: true });
  await mkdir(join(cwd, ".nuvin"), { recursive: true });
  return { root, home, cwd };
}

describe("resolveAgentDirectories", () => {
  it("resolves default global, profile, and local agent directories plus source-relative custom directories", async () => {
    const { root, home, cwd } = await makeRoot();
    const profileDir = join(home, ".nuvin", "profiles", "work");
    const localConfigDir = join(cwd, ".nuvin");
    const explicitPath = join(root, "explicit.yaml");

    await writeFile(
      join(profileDir, "config.yaml"),
      "agents:\n  directories:\n    - ./profile-extra\n",
    );
    await writeFile(
      join(localConfigDir, "config.yaml"),
      "agents:\n  directories:\n    - ./local-extra\n",
    );
    await writeFile(explicitPath, "agents:\n  directories:\n    - ./explicit-extra\n");

    const manager = new ConfigManager({ homeDir: home, cwd });
    await manager.load({ profile: "work", explicitPath });
    manager.loadConfig({ agents: { directories: ["./env-extra"] } }, "env");

    const directories = resolveAgentDirectories(manager, { profile: "work" });

    expect(directories.map((directory) => [directory.scope, directory.path])).toEqual([
      ["global", join(home, ".nuvin", "agents")],
      ["profile", join(profileDir, "agents")],
      ["profile", join(profileDir, "profile-extra")],
      ["local", join(cwd, ".nuvin", "agents")],
      ["local", join(localConfigDir, "local-extra")],
      ["explicit", join(root, "explicit-extra")],
      ["env", join(cwd, "env-extra")],
    ]);
  });

  it("honors agents.includeDefaults=false while preserving custom directories", async () => {
    const { home, cwd } = await makeRoot();
    await writeFile(
      join(cwd, ".nuvin", "config.yaml"),
      "agents:\n  includeDefaults: false\n  directories:\n    - ./only-custom\n",
    );

    const manager = new ConfigManager({ homeDir: home, cwd });
    await manager.load();

    const directories = resolveAgentDirectories(manager);

    expect(directories.map((directory) => directory.path)).toEqual([
      join(cwd, ".nuvin", "only-custom"),
    ]);
  });

  it("uses the ConfigManager custom config directory name for default agent locations", async () => {
    const { home, cwd } = await makeRoot();
    const profileDir = join(home, ".nuvin-dev", "profiles", "work");
    await mkdir(profileDir, { recursive: true });
    await mkdir(join(cwd, ".nuvin-dev"), { recursive: true });
    await writeFile(
      join(profileDir, "config.yaml"),
      "agents:\n  directories:\n    - ./profile-extra\n",
    );

    const manager = new ConfigManager({ configDirName: ".nuvin-dev", homeDir: home, cwd });
    await manager.load({ profile: "work" });

    const directories = resolveAgentDirectories(manager, { profile: "work" });

    expect(directories.map((directory) => [directory.scope, directory.path])).toEqual([
      ["global", join(home, ".nuvin-dev", "agents")],
      ["profile", join(profileDir, "agents")],
      ["profile", join(profileDir, "profile-extra")],
      ["local", join(cwd, ".nuvin-dev", "agents")],
    ]);
  });
});

describe("loadAgentDefinitionsFromDirectories", () => {
  it("discovers lightweight agent references and loads a full definition only from the selected reference", async () => {
    const { root } = await makeRoot();
    const agentsDir = join(root, "lazy-agents");
    await mkdir(agentsDir, { recursive: true });

    await writeFile(
      join(agentsDir, "researcher.md"),
      [
        "---",
        "name: researcher",
        "description: Researches a task",
        "tools: [bash]",
        "---",
        "Research prompt that should not live in the discovered reference.",
        "",
      ].join("\n"),
    );

    const references = await discoverAgentDefinitionsFromDirectories([
      { scope: "local", path: agentsDir, kind: "default" },
    ]);

    expect(references).toHaveLength(1);
    expect(references[0]).toMatchObject({
      id: "researcher",
      description: "Researches a task",
      tools: ["bash"],
      source: {
        scope: "local",
        path: join(agentsDir, "researcher.md"),
      },
    });
    expect(references[0]).not.toHaveProperty("systemPrompt");

    const fullDefinition = await loadAgentDefinitionFromReference(
      references[0] ?? expect.fail("references[0] missing"),
    );

    expect(fullDefinition).toMatchObject({
      id: "researcher",
      systemPrompt: "Research prompt that should not live in the discovered reference.",
    });
  });

  it("parses Claude-style Markdown agent definitions and lets higher-precedence directories override lower ones", async () => {
    const { root } = await makeRoot();
    const globalAgentsDir = join(root, "global-agents");
    const localAgentsDir = join(root, "local-agents");
    await mkdir(globalAgentsDir, { recursive: true });
    await mkdir(localAgentsDir, { recursive: true });

    await writeFile(
      join(globalAgentsDir, "researcher.md"),
      [
        "---",
        "name: researcher",
        "description: Global research agent",
        "tools: [bash]",
        "---",
        "Global prompt.",
        "",
      ].join("\n"),
    );
    await writeFile(
      join(localAgentsDir, "researcher.md"),
      [
        "---",
        "name: researcher",
        "description: Local research agent",
        "---",
        "Local prompt.",
        "",
      ].join("\n"),
    );
    await writeFile(
      join(localAgentsDir, "reviewer.md"),
      [
        "---",
        "name: reviewer",
        "description: Reviews implementation changes",
        "enabled: false",
        "---",
        "Review prompt.",
        "",
      ].join("\n"),
    );

    const definitions = await loadAgentDefinitionsFromDirectories([
      { scope: "global", path: globalAgentsDir, kind: "default" },
      { scope: "local", path: localAgentsDir, kind: "default" },
    ]);

    const researcher = definitions.find((definition) => definition.id === "researcher");
    const reviewer = definitions.find((definition) => definition.id === "reviewer");

    expect(researcher).toMatchObject({
      id: "researcher",
      description: "Local research agent",
      systemPrompt: "Local prompt.",
      source: {
        scope: "local",
        path: join(localAgentsDir, "researcher.md"),
      },
    });
    expect(reviewer).toMatchObject({
      id: "reviewer",
      enabled: false,
      systemPrompt: "Review prompt.",
    });
  });

  it("parses Markdown frontmatter values that contain additional colons", async () => {
    const { root } = await makeRoot();
    const agentsDir = join(root, "markdown-agents");
    await mkdir(agentsDir, { recursive: true });

    await writeFile(
      join(agentsDir, "reviewer.md"),
      [
        "---",
        "name: reviewer",
        "description: Use when reviewing code. Context: User finished a feature.",
        "tools: Read, Write, Bash",
        "enabled: true",
        "---",
        "Review the implementation carefully.",
        "",
      ].join("\n"),
    );

    const definitions = await loadAgentDefinitionsFromDirectories([
      { scope: "local", path: agentsDir, kind: "default" },
    ]);

    expect(definitions[0]).toMatchObject({
      id: "reviewer",
      description: "Use when reviewing code. Context: User finished a feature.",
      enabled: true,
      tools: ["Read", "Write", "Bash"],
      systemPrompt: "Review the implementation carefully.",
    });
  });
});
