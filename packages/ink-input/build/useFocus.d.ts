export type FocusContextValue = {
    id: string;
    isFocused: boolean;
    focus: () => void;
    clearFocus: () => void;
};
export type FocusCycleValue = {
    cycleFocus: (direction?: "forward" | "backward") => void;
    cycleNext: () => void;
    cycleBack: () => void;
    focusedId: string | null;
    setFocusedId: (id: string | null) => void;
    getFocusableIds: () => string[];
};
export declare function useFocus({ active, autoFocus, id: customId, tabIndex, }?: {
    active?: boolean;
    autoFocus?: boolean;
    id?: string;
    tabIndex?: number | string;
}): FocusContextValue;
export declare function useFocusCycle(): FocusCycleValue;
//# sourceMappingURL=useFocus.d.ts.map