import { open, readdir, readFile } from "node:fs/promises";
import { dirname, extname, isAbsolute, join, relative, resolve } from "node:path";

import { SCOPE_PRIORITY } from "./constants.js";
import type { ConfigManager } from "./manager.js";
import type {
  AgentDefinitionReference,
  AgentDefinitionSource,
  AgentDefinitionSourceScope,
  AgentDirectorySource,
  ConfigScope,
  SerializedAgentDefinition,
} from "./types.js";

export interface ResolveAgentDirectoriesOptions {
  profile?: string;
}

interface AgentFrontmatter {
  name?: unknown;
  description?: unknown;
  enabled?: unknown;
  model?: unknown;
  tools?: unknown;
}

type ParsedFrontmatter = Record<string, boolean | string | string[]>;
const MAX_AGENT_FRONTMATTER_BYTES = 64 * 1024;

function addUniqueDirectory(
  directories: AgentDirectorySource[],
  seen: Set<string>,
  source: AgentDirectorySource,
): void {
  if (seen.has(source.path)) {
    return;
  }

  seen.add(source.path);
  directories.push(source);
}

function isPathInside(path: string, parent: string): boolean {
  const rel = relative(parent, path);
  return rel === "" || (!rel.startsWith("..") && !isAbsolute(rel));
}

function inferSourceScope(
  manager: ConfigManager,
  scope: ConfigScope,
  sourcePath: string | undefined,
  profile: string | undefined,
): AgentDefinitionSourceScope {
  if (scope === "global" && profile && profile !== "default" && sourcePath) {
    const profileDir = join(manager.getHomeDir(), manager.getConfigDirName(), "profiles", profile);
    if (isPathInside(sourcePath, profileDir)) {
      return "profile";
    }
  }

  return scope;
}

function resolveDirectoryPath(path: string, baseDir: string, homeDir: string): string {
  if (path === "~") {
    return homeDir;
  }

  if (path.startsWith("~/")) {
    return join(homeDir, path.slice(2));
  }

  if (isAbsolute(path)) {
    return path;
  }

  return resolve(baseDir, path);
}

function getScopeBaseDir(
  manager: ConfigManager,
  scope: ConfigScope,
  sourcePath: string | undefined,
): string {
  if (sourcePath) {
    return dirname(sourcePath);
  }

  if (scope === "local") {
    return join(manager.getCwd(), manager.getConfigDirName());
  }

  return manager.getCwd();
}

export function resolveAgentDirectories(
  manager: ConfigManager,
  options: ResolveAgentDirectoriesOptions = {},
): AgentDirectorySource[] {
  const config = manager.getConfig();
  if (config.agents?.enabled === false) {
    return [];
  }

  const directories: AgentDirectorySource[] = [];
  const seen = new Set<string>();
  const profile = options.profile;
  const rootConfigDir = join(manager.getHomeDir(), manager.getConfigDirName());
  const profileDir =
    profile && profile !== "default" ? join(rootConfigDir, "profiles", profile) : rootConfigDir;
  const includeDefaults = config.agents?.includeDefaults !== false;

  const addDefault = (scope: AgentDefinitionSourceScope, path: string): void => {
    addUniqueDirectory(directories, seen, {
      scope,
      path,
      kind: "default",
    });
  };

  const addCustomForScope = (scope: ConfigScope): void => {
    const data = manager.getScopeData(scope);
    const customDirectories = data.agents?.directories ?? [];
    if (customDirectories.length === 0) {
      return;
    }

    const source = manager.getScopeSource(scope);
    const baseDir = getScopeBaseDir(manager, scope, source?.path);
    const sourceScope = inferSourceScope(manager, scope, source?.path, profile);

    for (const directory of customDirectories) {
      addUniqueDirectory(directories, seen, {
        scope: sourceScope,
        path: resolveDirectoryPath(directory, baseDir, manager.getHomeDir()),
        kind: "custom",
        ...(source?.path ? { sourcePath: source.path } : {}),
      });
    }
  };

  if (includeDefaults) {
    addDefault("global", join(rootConfigDir, "agents"));
    if (profile && profile !== "default") {
      addDefault("profile", join(profileDir, "agents"));
    }
  }

  addCustomForScope("global");

  if (includeDefaults) {
    addDefault("local", join(manager.getCwd(), manager.getConfigDirName(), "agents"));
  }

  addCustomForScope("local");

  for (const scope of SCOPE_PRIORITY) {
    if (scope === "global" || scope === "local") {
      continue;
    }
    addCustomForScope(scope);
  }

  return directories;
}

function assertString(value: unknown, field: string, path: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`Agent definition ${path} requires a non-empty ${field}`);
  }

  return value.trim();
}

function normalizeTools(value: unknown, path: string): string[] | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (typeof value === "string") {
    return value
      .split(",")
      .map((entry) => entry.trim())
      .filter((entry) => entry.length > 0);
  }

  if (Array.isArray(value) && value.every((entry) => typeof entry === "string")) {
    return value.map((entry) => entry.trim()).filter((entry) => entry.length > 0);
  }

  throw new Error(`Agent definition ${path} has invalid tools; expected string or string[]`);
}

function normalizeOptionalString(value: unknown, field: string, path: string): string | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`Agent definition ${path} has invalid ${field}; expected non-empty string`);
  }

  return value.trim();
}

function normalizeOptionalBoolean(
  value: unknown,
  field: string,
  path: string,
): boolean | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (typeof value !== "boolean") {
    throw new Error(`Agent definition ${path} has invalid ${field}; expected boolean`);
  }

  return value;
}

function unquote(value: string): string {
  const trimmed = value.trim();
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

function parseFrontmatterScalar(value: string): boolean | string | string[] {
  const trimmed = value.trim();

  if (/^(true|false)$/i.test(trimmed)) {
    return trimmed.toLowerCase() === "true";
  }

  if (trimmed.startsWith("[") && trimmed.endsWith("]")) {
    const inner = trimmed.slice(1, -1).trim();
    if (!inner) {
      return [];
    }
    return inner
      .split(",")
      .map((entry) => unquote(entry))
      .filter((entry) => entry.length > 0);
  }

  return unquote(trimmed);
}

function isTopLevelField(line: string): boolean {
  return /^[A-Za-z0-9_-]+:\s*/.test(line);
}

function stripIndent(lines: string[]): string[] {
  const nonBlank = lines.filter((line) => line.trim().length > 0);
  const minIndent =
    nonBlank.length > 0
      ? Math.min(...nonBlank.map((line) => line.match(/^\s*/)?.[0].length ?? 0))
      : 0;

  return lines.map((line) => line.slice(Math.min(minIndent, line.length)));
}

function parseIndentedFrontmatterValue(lines: string[]): string | string[] {
  const meaningfulLines = lines.filter((line) => line.trim().length > 0);
  if (meaningfulLines.length > 0 && meaningfulLines.every((line) => /^\s*-\s+/.test(line))) {
    return meaningfulLines
      .map((line) => unquote(line.replace(/^\s*-\s+/, "")))
      .filter((entry) => entry.length > 0);
  }

  return stripIndent(lines).join("\n").trim();
}

function parseMarkdownFrontmatter(raw: string): AgentFrontmatter {
  const metadata: ParsedFrontmatter = {};
  const lines = raw.replace(/\r\n/g, "\n").split("\n");

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i] ?? "";
    const trimmed = line.trim();

    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }

    const match = line.match(/^([A-Za-z0-9_-]+):\s*(.*)$/);
    if (!match) {
      continue;
    }

    const key = match[1] ?? "";
    const value = match[2] ?? "";

    if (value === "|" || value === ">" || value.trim().length === 0) {
      const blockLines: string[] = [];
      while (i + 1 < lines.length && !isTopLevelField(lines[i + 1] ?? "")) {
        i += 1;
        blockLines.push(lines[i] ?? "");
      }
      metadata[key] = parseIndentedFrontmatterValue(blockLines);
      continue;
    }

    metadata[key] = parseFrontmatterScalar(value);
  }

  return metadata;
}

async function readMarkdownFrontmatter(path: string): Promise<string> {
  const file = await open(path, "r");
  let raw = "";
  let position = 0;
  const buffer = Buffer.alloc(4096);

  try {
    while (raw.length <= MAX_AGENT_FRONTMATTER_BYTES) {
      const { bytesRead } = await file.read(buffer, 0, buffer.length, position);

      if (bytesRead === 0) {
        break;
      }

      position += bytesRead;
      raw += buffer.subarray(0, bytesRead).toString("utf8");

      if (raw.length >= 5 && !raw.startsWith("---\n") && !raw.startsWith("---\r\n")) {
        throw new Error(`Agent definition ${path} must start with Markdown frontmatter`);
      }

      const match = raw.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/);
      if (match) {
        return match[1] ?? "";
      }
    }
  } finally {
    await file.close();
  }

  throw new Error(`Agent definition ${path} must include closing Markdown frontmatter`);
}

function toAgentDefinitionSource(
  source: AgentDirectorySource,
  path: string,
): AgentDefinitionSource {
  return {
    scope: source.scope,
    path,
    directory: source.path,
    kind: source.kind,
  };
}

function parseAgentFrontmatter(
  raw: string,
  path: string,
): {
  metadata: AgentFrontmatter;
  systemPrompt: string;
} {
  const match = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!match) {
    throw new Error(`Agent definition ${path} must start with Markdown frontmatter`);
  }

  return {
    metadata: parseMarkdownFrontmatter(match[1] ?? ""),
    systemPrompt: (match[2] ?? "").trim(),
  };
}

function createAgentDefinitionReference(
  metadata: AgentFrontmatter,
  source: AgentDefinitionSource,
  path: string,
): AgentDefinitionReference {
  const name = assertString(metadata.name, "name", path);
  const description = assertString(metadata.description, "description", path);

  return {
    id: name,
    name,
    description,
    ...(normalizeOptionalBoolean(metadata.enabled, "enabled", path) !== undefined
      ? { enabled: normalizeOptionalBoolean(metadata.enabled, "enabled", path) }
      : {}),
    ...(normalizeOptionalString(metadata.model, "model", path) !== undefined
      ? { model: normalizeOptionalString(metadata.model, "model", path) }
      : {}),
    ...(normalizeTools(metadata.tools, path) !== undefined
      ? { tools: normalizeTools(metadata.tools, path) }
      : {}),
    source,
  };
}

function parseAgentDefinitionReference(
  frontmatter: string,
  source: AgentDirectorySource,
  path: string,
): AgentDefinitionReference {
  const metadata = parseMarkdownFrontmatter(frontmatter);
  return createAgentDefinitionReference(metadata, toAgentDefinitionSource(source, path), path);
}

function parseAgentDefinition(
  raw: string,
  source: AgentDefinitionSource,
  path: string,
): SerializedAgentDefinition {
  const { metadata, systemPrompt } = parseAgentFrontmatter(raw, path);

  if (systemPrompt.length === 0) {
    throw new Error(`Agent definition ${path} requires a non-empty prompt body`);
  }

  return {
    ...createAgentDefinitionReference(metadata, source, path),
    systemPrompt,
  };
}

export async function discoverAgentDefinitionsFromDirectories(
  directories: AgentDirectorySource[],
): Promise<AgentDefinitionReference[]> {
  const definitions = new Map<string, AgentDefinitionReference>();

  for (const directory of directories) {
    let entries: import("node:fs").Dirent[];
    try {
      entries = await readdir(directory.path, { encoding: "utf8", withFileTypes: true });
    } catch (err: unknown) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") {
        continue;
      }
      throw err;
    }

    for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
      if (!entry.isFile() || extname(entry.name) !== ".md") {
        continue;
      }

      const path = join(directory.path, entry.name);
      const definition = parseAgentDefinitionReference(
        await readMarkdownFrontmatter(path),
        directory,
        path,
      );
      if (definitions.has(definition.id)) {
        definitions.delete(definition.id);
      }
      definitions.set(definition.id, definition);
    }
  }

  return [...definitions.values()];
}

export async function loadAgentDefinitionFromReference(
  reference: AgentDefinitionReference,
): Promise<SerializedAgentDefinition> {
  return parseAgentDefinition(
    await readFile(reference.source.path, "utf8"),
    reference.source,
    reference.source.path,
  );
}

export async function loadAgentDefinitionsFromDirectories(
  directories: AgentDirectorySource[],
): Promise<SerializedAgentDefinition[]> {
  const references = await discoverAgentDefinitionsFromDirectories(directories);
  return await Promise.all(references.map(loadAgentDefinitionFromReference));
}
