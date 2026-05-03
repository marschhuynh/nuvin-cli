/**
 * focusStore — Zustand store replacing FocusContext.
 *
 * Manages focusable element registration, focus cycling (Tab/Shift+Tab),
 * and current focused element tracking.
 */

import { useStore } from "zustand";
import { createStore } from "zustand/vanilla";

type FocusableEntry = {
  id: string;
  tabIndex: number;
  registrationOrder: number;
};

type FocusState = {
  focusedId: string | null;
};

type FocusActions = {
  setFocusedId: (id: string | null) => void;
  clearFocus: () => void;
  cycleFocus: (direction?: "forward" | "backward") => void;
  registerFocusable: (id: string, tabIndex?: number) => () => void;
  getFocusableIds: () => string[];
};

// Internal mutable state (no re-renders needed)
const focusableEntries = new Map<string, FocusableEntry>();
let registrationCounter = 0;

function getSortedEntries(): FocusableEntry[] {
  return Array.from(focusableEntries.values()).sort((a, b) => {
    if (a.tabIndex !== b.tabIndex) {
      return a.tabIndex - b.tabIndex;
    }
    return a.registrationOrder - b.registrationOrder;
  });
}

export const focusStore = createStore<FocusState & FocusActions>()((set, get) => ({
  focusedId: null,

  setFocusedId: (id: string | null) => {
    set({ focusedId: id });
  },

  clearFocus: () => {
    set({ focusedId: null });
  },

  cycleFocus: (direction: "forward" | "backward" = "forward") => {
    const entries = getSortedEntries();
    if (entries.length === 0) return;

    const ids = entries.map((e) => e.id);
    const currentFocusedId = get().focusedId;
    const currentIndex = currentFocusedId ? ids.indexOf(currentFocusedId) : -1;

    let nextIndex: number;
    if (direction === "forward") {
      nextIndex = (currentIndex + 1) % ids.length;
    } else {
      nextIndex = currentIndex <= 0 ? ids.length - 1 : currentIndex - 1;
    }

    set({ focusedId: ids[nextIndex] || null });
  },

  registerFocusable: (id: string, tabIndex = 0) => {
    const order = registrationCounter++;
    focusableEntries.set(id, { id, tabIndex, registrationOrder: order });
    return () => {
      focusableEntries.delete(id);
    };
  },

  getFocusableIds: () => {
    return getSortedEntries().map((e) => e.id);
  },
}));

/**
 * Reset all internal mutable state. Used for testing.
 */
export function resetFocusStore(): void {
  focusableEntries.clear();
  registrationCounter = 0;
  focusStore.setState({ focusedId: null });
}

/** React hook for accessing focus store. */
export function useFocusStore() {
  return useStore(focusStore);
}
