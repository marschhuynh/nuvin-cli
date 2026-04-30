import { buildHunks, createSimpleDiff } from "./FileDiffView.js";
import { jsonObject, numberProp, stringProp } from "./json.js";
import type { ToolRendererProps } from "./types.js";

const ROW_VERTICAL_PADDING = 2;
const TOOL_HEADER_HEIGHT = 1;
export const INLINE_APPROVAL_HEIGHT = 7;

const FILE_EDIT_DIFF_HEIGHT_CACHE_LIMIT = 256;
const fileEditDiffHeightCache = new Map<string, number>();

function getTerminalColumns(): number {
  return process.stdout.columns ?? 80;
}

function wrappedLineCount(text: string, chromeWidth: number): number {
  if (text.length === 0) return 1;
  const contentWidth = Math.max(1, getTerminalColumns() - chromeWidth);
  let total = 0;
  for (const line of text.split("\n")) {
    total += line.length === 0 ? 1 : Math.ceil(line.length / contentWidth);
  }
  return total;
}

export function estimateFileEditDiffHeight(message: ToolRendererProps["message"]): number {
  const oldText = typeof message.input?.oldText === "string" ? message.input.oldText : "";
  const newText = typeof message.input?.newText === "string" ? message.input.newText : "";
  if (oldText === newText) return 1;

  const cacheKey = `${oldText.length}\u0000${newText.length}\u0000${oldText}\u0000${newText}`;
  const cached = fileEditDiffHeightCache.get(cacheKey);
  if (cached !== undefined) return cached;

  const diff = createSimpleDiff(oldText, newText);
  const hunks = buildHunks(diff);
  let height = 0;
  for (const hunk of hunks) {
    if (hunk.hiddenBefore > 0) height += 1;
    height += hunk.lines.length;
  }

  const measuredHeight = height === 0 ? 1 : height;

  if (fileEditDiffHeightCache.size >= FILE_EDIT_DIFF_HEIGHT_CACHE_LIMIT) {
    const firstKey = fileEditDiffHeightCache.keys().next().value;
    if (firstKey !== undefined) fileEditDiffHeightCache.delete(firstKey);
  }
  fileEditDiffHeightCache.set(cacheKey, measuredHeight);
  return measuredHeight;
}

function getFileReadMainArg(message: ToolRendererProps["message"]): string {
  const input = jsonObject(message.input);
  const filePath = stringProp(input, "path") ?? message.summary;
  const lineStart = numberProp(input, "lineStart");
  const lineEnd = numberProp(input, "lineEnd");

  if (lineStart !== undefined && lineEnd !== undefined) {
    return `${filePath}:${lineStart}-${lineEnd}`;
  }

  if (lineStart !== undefined) {
    return `${filePath}:${lineStart}`;
  }

  return filePath;
}

function getFileReadPhrase(status: ToolRendererProps["message"]["status"]): string {
  if (status === "pending") return "Waiting to read file";
  if (status === "running" || status === "approved") return "Reading file";
  if (status === "error") return "File read failed";
  if (status === "rejected") return "Skipped file read";
  return "Read file";
}

function getBashMainArg(message: ToolRendererProps["message"]): string {
  const input = jsonObject(message.input);
  const command = stringProp(input, "command") ?? message.summary;
  const cwd = stringProp(input, "cwd");
  return cwd ? `${command} at ${cwd}` : command;
}

function getBashPhrase(status: ToolRendererProps["message"]["status"]): string {
  if (status === "pending") return "Waiting to run command";
  if (status === "approved") return "Approved command";
  if (status === "running") return "Running command";
  if (status === "rejected") return "Skipped command";
  if (status === "error") return "Command failed";
  return "Ran command";
}

function getFileNewMainArg(message: ToolRendererProps["message"]): string {
  const input = jsonObject(message.input);
  const structured = jsonObject(message.structured);
  return stringProp(structured, "filePath") ?? stringProp(input, "filePath") ?? message.summary;
}

function getFileNewPhrase(message: ToolRendererProps["message"]): string {
  const status = message.status;
  if (status === "pending") return "Waiting to create file";
  if (status === "running" || status === "approved") return "Creating file";
  if (status === "rejected") return "Skipped file creation";
  if (status === "error") return "File creation failed";

  const structured = jsonObject(message.structured);
  const lines = numberProp(structured, "lines");
  const bytes = numberProp(structured, "bytes");
  if (lines !== undefined && bytes !== undefined) {
    return `Created file (${lines} lines, ${bytes} bytes)`;
  }
  if (lines !== undefined) return `Created file (${lines} lines)`;
  if (bytes !== undefined) return `Created file (${bytes} bytes)`;
  return "Created file";
}

function getFileEditMainArg(message: ToolRendererProps["message"]): string {
  if (typeof message.structured?.filePath === "string" && message.structured.filePath.length > 0) {
    return message.structured.filePath;
  }
  if (typeof message.input?.filePath === "string" && message.input.filePath.length > 0) {
    return message.input.filePath;
  }
  return message.summary;
}

function getFileEditPhrase(message: ToolRendererProps["message"]): string {
  const status = message.status;
  if (status === "error") return "Edit failed";
  if (status === "rejected") return "Skipped file edit";
  if (status === "pending") return "Waiting to edit file";
  if (status === "approved" || status === "running") return "Editing file";

  const bytesWritten =
    typeof message.structured?.bytesWritten === "number"
      ? message.structured.bytesWritten
      : undefined;
  return bytesWritten !== undefined ? `Edited file (${bytesWritten} bytes)` : "Edited file";
}

function getGlobMainArg(message: ToolRendererProps["message"]): string {
  const input = jsonObject(message.input);
  return stringProp(input, "pattern") ?? message.summary;
}

function getGlobPhrase(message: ToolRendererProps["message"]): string {
  const status = message.status;
  if (status === "pending") return "Waiting to find files";
  if (status === "running" || status === "approved") return "Finding files";
  if (status === "rejected") return "Skipped file search";
  if (status === "error") return "Search failed";

  const structured = jsonObject(message.structured);
  const count = numberProp(structured, "count");
  const truncated = structured?.truncated === true;
  const text =
    count !== undefined ? `Found ${count} file${count === 1 ? "" : "s"}` : "Search complete";
  return truncated ? `${text} (truncated)` : text;
}

function getGrepMainArg(message: ToolRendererProps["message"]): string {
  const input = jsonObject(message.input);
  const pattern = stringProp(input, "pattern") ?? "";
  const searchPath = stringProp(input, "path");
  if (pattern.length === 0) return searchPath ?? message.summary;
  return searchPath ? `${pattern} at ${searchPath}` : pattern;
}

function getGrepPhrase(message: ToolRendererProps["message"]): string {
  const status = message.status;
  if (status === "pending") return "Waiting to search";
  if (status === "running" || status === "approved") return "Searching";
  if (status === "rejected") return "Skipped search";
  if (status === "error") return "Search failed";

  const structured = jsonObject(message.structured);
  const matchCount = numberProp(structured, "matchCount");
  const fileCount = numberProp(structured, "fileCount");
  const truncated = structured?.truncated === true;

  if (matchCount === 0) return "Not found";
  if (matchCount === undefined) return "Search complete";

  let text = `Found ${matchCount} match${matchCount === 1 ? "" : "es"}`;
  if (fileCount !== undefined) text += ` in ${fileCount} file${fileCount === 1 ? "" : "s"}`;
  if (truncated) text += " (truncated)";
  return text;
}

function getLsMainArg(message: ToolRendererProps["message"]): string {
  const input = jsonObject(message.input);
  return stringProp(input, "path") ?? ".";
}

function getLsPhrase(message: ToolRendererProps["message"]): string {
  const status = message.status;
  if (status === "pending") return "Waiting to list directory";
  if (status === "running" || status === "approved") return "Listing directory";
  if (status === "rejected") return "Skipped directory listing";
  if (status === "error") return "Listing failed";

  const structured = jsonObject(message.structured);
  const total = numberProp(structured, "total");
  const truncated = structured?.truncated === true;
  const text = total !== undefined ? `Listed ${total} entries` : "Listed";
  return truncated ? `${text} (truncated)` : text;
}

function getAssignTaskMainArg(message: ToolRendererProps["message"]): string {
  const trimmed = message.summary.trim();
  if (!trimmed.startsWith("{")) return "agent";

  try {
    const parsed = JSON.parse(trimmed);
    return typeof parsed?.agentId === "string" && parsed.agentId.trim().length > 0
      ? parsed.agentId.trim()
      : "agent";
  } catch {
    return "agent";
  }
}

function getAssignTaskPhrase(status: ToolRendererProps["message"]["status"]): string {
  if (status === "approved") return "Approved delegation";
  if (status === "error") return "Delegation failed";
  if (status === "ok") return "Delegated";
  if (status === "pending") return "Waiting to delegate";
  if (status === "rejected") return "Skipped delegation";
  return "Delegating";
}

function getUnknownPhrase(status: ToolRendererProps["message"]["status"]): string {
  if (status === "approved" || status === "running") return "Running";
  if (status === "error") return "Failed";
  if (status === "ok") return "Completed";
  if (status === "pending") return "Waiting";
  return "Denied";
}

function getHeaderText(message: ToolRendererProps["message"]): string {
  let phrase = "";
  let mainArg: string | undefined;

  switch (message.toolName) {
    case "Bash":
      phrase = getBashPhrase(message.status);
      mainArg = getBashMainArg(message);
      break;
    case "FileRead":
      phrase = getFileReadPhrase(message.status);
      mainArg = getFileReadMainArg(message);
      break;
    case "FileNew":
      phrase = getFileNewPhrase(message);
      mainArg = getFileNewMainArg(message);
      break;
    case "FileEdit":
      phrase = getFileEditPhrase(message);
      mainArg = getFileEditMainArg(message);
      break;
    case "Glob":
      phrase = getGlobPhrase(message);
      mainArg = getGlobMainArg(message);
      break;
    case "Grep":
      phrase = getGrepPhrase(message);
      mainArg = getGrepMainArg(message);
      break;
    case "Ls":
      phrase = getLsPhrase(message);
      mainArg = getLsMainArg(message);
      break;
    case "AssignTask":
    case "delegate_to_agent":
      phrase = getAssignTaskPhrase(message.status);
      mainArg = getAssignTaskMainArg(message);
      break;
    default:
      phrase = getUnknownPhrase(message.status);
      mainArg = message.summary;
      break;
  }

  return mainArg ? `• ${phrase} · ${mainArg}` : `• ${phrase}`;
}

export function estimateToolHeaderHeight(message: ToolRendererProps["message"]): number {
  const headerText = getHeaderText(message);
  if (headerText.length === 0) {
    return TOOL_HEADER_HEIGHT;
  }

  return wrappedLineCount(headerText, 1);
}

export function getToolStatusTransitionMinHeight(
  message: ToolRendererProps["message"],
): number | undefined {
  if (message.status !== "approved" && message.status !== "running") {
    return undefined;
  }

  if (message.toolName !== "Bash") {
    return undefined;
  }

  const basePendingHeight = ROW_VERTICAL_PADDING + estimateToolHeaderHeight(message);

  return basePendingHeight + INLINE_APPROVAL_HEIGHT;
}
