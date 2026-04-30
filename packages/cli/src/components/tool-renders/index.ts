import { AssignTaskToolRender } from "./AssignTaskToolRender.js";
import { BashToolRender } from "./BashToolRender.js";
import { FileEditToolRender } from "./FileEditToolRender.js";
import { FileNewToolRender } from "./FileNewToolRender.js";
import { FileReadToolRender } from "./FileReadToolRender.js";
import { GlobToolRender } from "./GlobToolRender.js";
import { GrepToolRender } from "./GrepToolRender.js";
import { LsToolRender } from "./LsToolRender.js";
import type { ToolRenderer } from "./types.js";
import { UnknownToolRender } from "./UnknownToolRender.js";

const TOOL_RENDERERS: Record<string, ToolRenderer> = {
  Bash: BashToolRender,
  FileEdit: FileEditToolRender,
  FileNew: FileNewToolRender,
  FileRead: FileReadToolRender,
  Glob: GlobToolRender,
  Grep: GrepToolRender,
  Ls: LsToolRender,
  AssignTask: AssignTaskToolRender
};

export function getToolRenderer(toolName: string): ToolRenderer {
  return TOOL_RENDERERS[toolName] ?? UnknownToolRender;
}
