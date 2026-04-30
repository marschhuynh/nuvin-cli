import type React from "react";
import { createContext, useContext, useMemo } from "react";

import type { PendingApproval } from "#src/lib/approvals/queue.js";
import type { TuiMessage } from "#src/lib/messages/state.js";

/**
 * Provides a lookup from a tool call id (the id of an `AssignTask` call)
 * to the list of `TuiMessage`s that were emitted by the delegated child agent
 * — i.e. messages whose `parentToolCallId === toolCallId`.
 *
 * The `MessageList` builds this index once per render so nested tool renderers
 * (currently `AssignTaskToolRender`) can render their delegated child's
 * activity inline without re-scanning the full message list per row.
 */
export type ChildMessagesIndex = ReadonlyMap<string, readonly TuiMessage[]>;

const ChildMessagesContext = createContext<ChildMessagesIndex>(new Map());

/**
 * Active approval is exposed through context (in addition to being passed as
 * a prop at the top level) so nested tool renderers — which render their
 * children via the delegation render — can resolve "is the approval mine?"
 * against the unfiltered approval rather than a parent-scoped slot.
 */
const ActiveApprovalContext = createContext<PendingApproval | null>(null);

type ChildMessagesProviderProps = {
  activeApproval: PendingApproval | null;
  index: ChildMessagesIndex;
  children: React.ReactNode;
};

export function ChildMessagesProvider({
  activeApproval,
  index,
  children,
}: ChildMessagesProviderProps): React.ReactElement {
  return (
    <ChildMessagesContext.Provider value={index}>
      <ActiveApprovalContext.Provider value={activeApproval}>
        {children}
      </ActiveApprovalContext.Provider>
    </ChildMessagesContext.Provider>
  );
}

const EMPTY_CHILDREN: readonly TuiMessage[] = [];

export function useChildMessages(parentToolCallId: string | undefined): readonly TuiMessage[] {
  const index = useContext(ChildMessagesContext);
  return useMemo(
    () => (parentToolCallId ? (index.get(parentToolCallId) ?? EMPTY_CHILDREN) : EMPTY_CHILDREN),
    [index, parentToolCallId],
  );
}

export function useActiveApproval(): PendingApproval | null {
  return useContext(ActiveApprovalContext);
}
