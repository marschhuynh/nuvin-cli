import { type VimMode } from "./textNavigation.js";
type InkKey = {
    upArrow: boolean;
    downArrow: boolean;
    leftArrow: boolean;
    rightArrow: boolean;
    return: boolean;
    escape: boolean;
    ctrl: boolean;
    shift: boolean;
    tab: boolean;
    backspace: boolean;
    delete: boolean;
    meta: boolean;
};
export type VimAction = {
    type: "move-cursor";
    offset: number;
} | {
    type: "set-value";
    value: string;
    offset: number;
} | {
    type: "enter-insert-mode";
    offset?: number;
} | {
    type: "enter-insert-and-set-value";
    value: string;
    offset: number;
} | {
    type: "submit";
} | {
    type: "none";
};
export type UseVimModeOptions = {
    enabled: boolean;
    onModeChange?: (mode: VimMode) => void;
};
export type UseVimModeReturn = {
    mode: VimMode;
    handleVimInput: (input: string, key: InkKey, value: string, cursorOffset: number) => VimAction;
    enterInsertMode: () => void;
    enterNormalMode: () => void;
};
export declare function useVimMode({ enabled, onModeChange }: UseVimModeOptions): UseVimModeReturn;
export {};
//# sourceMappingURL=useVimMode.d.ts.map