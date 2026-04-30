import type { JsonObject, JsonValue, ToolUseBlock } from "@nuvin/agent-core/shared";

/**
 * Plain-text renderer registry for tool args displayed in the approval prompt.
 *
 * Each renderer returns an array of lines. Lines are rendered as-is in the
 * scrollable args body; renderers must NOT include ANSI escapes — coloring
 * happens in the React render tree, not here.
 *
 * To support a new tool (e.g. a future edit tool that produces diffs), add an
 * entry keyed by the tool name. The default renderer falls back to pretty JSON.
 */

export type ToolArgsRenderer = (toolCall: ToolUseBlock) => string[];

function asJsonObject(value: JsonValue): JsonObject | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? value : undefined;
}

function stringProp(input: JsonObject | undefined, key: string): string | undefined {
  const value = input?.[key];
  return typeof value === "string" ? value : undefined;
}

function numberProp(input: JsonObject | undefined, key: string): number | undefined {
  const value = input?.[key];
  return typeof value === "number" ? value : undefined;
}

function booleanProp(input: JsonObject | undefined, key: string): boolean | undefined {
  const value = input?.[key];
  return typeof value === "boolean" ? value : undefined;
}

function pushStringLine(
  lines: string[],
  label: string,
  value: string | undefined,
  missing?: string,
): void {
  if (value !== undefined) {
    lines.push(`${label}: ${value}`);
  } else if (missing !== undefined) {
    lines.push(`${label}: ${missing}`);
  }
}

function pushNumberLine(lines: string[], label: string, value: number | undefined): void {
  if (value !== undefined) {
    lines.push(`${label}: ${value}`);
  }
}

function pushBooleanLine(lines: string[], label: string, value: boolean | undefined): void {
  if (value !== undefined) {
    lines.push(`${label}: ${value ? "true" : "false"}`);
  }
}

function pushMultilineString(
  lines: string[],
  label: string,
  value: string | undefined,
  missing: string,
): void {
  if (value === undefined) {
    lines.push(`${label}: ${missing}`);
    return;
  }

  const parts = value.split("\n");
  lines.push(`${label}: ${parts[0] ?? ""}`);
  const padding = " ".repeat(label.length + 2);
  for (let index = 1; index < parts.length; index += 1) {
    lines.push(`${padding}${parts[index]}`);
  }
}

function renderBashArgs(toolCall: ToolUseBlock): string[] {
  const input = asJsonObject(toolCall.input);
  const lines: string[] = [];
  pushMultilineString(lines, "Command", stringProp(input, "command"), "<missing command>");
  pushStringLine(lines, "Cwd", stringProp(input, "cwd"));
  pushNumberLine(
    lines,
    "Timeout (ms)",
    numberProp(input, "timeoutMs") ?? numberProp(input, "timeout_ms"),
  );
  pushBooleanLine(lines, "Ignore output", booleanProp(input, "ignoreOutput"));
  return lines;
}

function renderFileReadArgs(toolCall: ToolUseBlock): string[] {
  const input = asJsonObject(toolCall.input);
  const lines: string[] = [];
  pushStringLine(lines, "Path", stringProp(input, "path"), "<missing path>");
  pushNumberLine(lines, "Line start", numberProp(input, "lineStart"));
  pushNumberLine(lines, "Line end", numberProp(input, "lineEnd"));
  return lines;
}

function renderFileNewArgs(toolCall: ToolUseBlock): string[] {
  const input = asJsonObject(toolCall.input);
  const content = stringProp(input, "content");
  const lines: string[] = [];
  pushStringLine(lines, "File", stringProp(input, "filePath"), "<missing filePath>");
  if (content !== undefined) {
    lines.push(`Content length: ${content.length} chars`);
    lines.push(`Lines: ${content.split(/\r?\n/).length}`);
  } else {
    lines.push("Content: <missing content>");
  }
  return lines;
}

function renderGrepArgs(toolCall: ToolUseBlock): string[] {
  const input = asJsonObject(toolCall.input);
  const lines: string[] = [];
  pushStringLine(lines, "Pattern", stringProp(input, "pattern"), "<missing pattern>");
  pushStringLine(lines, "Path", stringProp(input, "path"));
  pushStringLine(lines, "Include", stringProp(input, "include"));
  pushNumberLine(lines, "Context", numberProp(input, "context"));
  pushNumberLine(lines, "Limit", numberProp(input, "limit"));
  return lines;
}

function renderGlobArgs(toolCall: ToolUseBlock): string[] {
  const input = asJsonObject(toolCall.input);
  const lines: string[] = [];
  pushStringLine(lines, "Pattern", stringProp(input, "pattern"), "<missing pattern>");
  pushStringLine(lines, "Path", stringProp(input, "path"));
  pushNumberLine(lines, "Limit", numberProp(input, "limit"));
  return lines;
}

function renderLsArgs(toolCall: ToolUseBlock): string[] {
  const input = asJsonObject(toolCall.input);
  const lines: string[] = [];
  pushStringLine(lines, "Path", stringProp(input, "path"), ".");
  pushNumberLine(lines, "Limit", numberProp(input, "limit"));
  return lines;
}

const renderers: Record<string, ToolArgsRenderer> = {
  Bash: renderBashArgs,
  FileNew: renderFileNewArgs,
  FileRead: renderFileReadArgs,
  Glob: renderGlobArgs,
  Grep: renderGrepArgs,
  Ls: renderLsArgs,
};

const defaultRenderer: ToolArgsRenderer = (toolCall) => {
  return JSON.stringify(toolCall.input, null, 2).split("\n");
};

export function renderToolArgs(toolCall: ToolUseBlock): string[] {
  const renderer = renderers[toolCall.name] ?? defaultRenderer;
  return renderer(toolCall);
}

export function registerToolArgsRenderer(name: string, renderer: ToolArgsRenderer): void {
  renderers[name] = renderer;
}
