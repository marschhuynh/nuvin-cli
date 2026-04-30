/**
 * focusStore — Zustand store replacing FocusContext.
 *
 * Manages focusable element registration, focus cycling (Tab/Shift+Tab),
 * and current focused element tracking.
 */
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
export declare const focusStore: import("zustand").StoreApi<FocusState & FocusActions>;
/**
 * Reset all internal mutable state. Used for testing.
 */
export declare function resetFocusStore(): void;
/** React hook for accessing focus store. */
export declare function useFocusStore(): FocusState & FocusActions;
export {};
//# sourceMappingURL=focus.d.ts.map