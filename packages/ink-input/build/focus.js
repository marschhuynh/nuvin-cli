/**
 * focusStore — Zustand store replacing FocusContext.
 *
 * Manages focusable element registration, focus cycling (Tab/Shift+Tab),
 * and current focused element tracking.
 */
import { useStore } from "zustand";
import { createStore } from "zustand/vanilla";
// Internal mutable state (no re-renders needed)
const focusableEntries = new Map();
let registrationCounter = 0;
function getSortedEntries() {
    return Array.from(focusableEntries.values()).sort((a, b) => {
        if (a.tabIndex !== b.tabIndex) {
            return a.tabIndex - b.tabIndex;
        }
        return a.registrationOrder - b.registrationOrder;
    });
}
export const focusStore = createStore()((set, get) => ({
    focusedId: null,
    setFocusedId: (id) => {
        set({ focusedId: id });
    },
    clearFocus: () => {
        set({ focusedId: null });
    },
    cycleFocus: (direction = "forward") => {
        const entries = getSortedEntries();
        if (entries.length === 0)
            return;
        const ids = entries.map((e) => e.id);
        const currentFocusedId = get().focusedId;
        const currentIndex = currentFocusedId ? ids.indexOf(currentFocusedId) : -1;
        let nextIndex;
        if (direction === "forward") {
            nextIndex = (currentIndex + 1) % ids.length;
        }
        else {
            nextIndex = currentIndex <= 0 ? ids.length - 1 : currentIndex - 1;
        }
        set({ focusedId: ids[nextIndex] || null });
    },
    registerFocusable: (id, tabIndex = 0) => {
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
export function resetFocusStore() {
    focusableEntries.clear();
    registrationCounter = 0;
    focusStore.setState({ focusedId: null });
}
/** React hook for accessing focus store. */
export function useFocusStore() {
    return useStore(focusStore);
}
//# sourceMappingURL=focus.js.map