import type { ToolMessageStatus } from "#src/lib/messages/state.js";
import type { Theme } from "#src/lib/theme/runtime.js";

export function getToolStatusColor(theme: Theme, status: ToolMessageStatus): string {
  return theme.message.tool[status];
}
