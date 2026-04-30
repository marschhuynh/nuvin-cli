import { type VimMode } from "./textNavigation.js";
export type EditorState = {
    value: string;
    cursorOffset: number;
    cursorWidth: number;
};
export type UseEditorStateOptions = {
    initialValue: string;
    vimMode: VimMode;
    onChange: (value: string) => void;
};
export declare function syncEditorStateFromExternalValue(current: EditorState, externalValue: string, vimMode: VimMode): EditorState;
export declare function reconcileExternalValue(current: EditorState, externalValue: string, vimMode: VimMode, pendingEchoes: string[]): {
    nextState: EditorState | null;
    nextPendingEchoes: string[];
};
export declare function useEditorState({ initialValue, vimMode, onChange }: UseEditorStateOptions): {
    state: EditorState;
    stateRef: import("react").RefObject<EditorState>;
    setValue: (value: string, offset: number, width?: number) => void;
    moveCursor: (offset: number) => void;
    reset: () => void;
    setInitialCursor: (focus: boolean) => void;
};
//# sourceMappingURL=useEditorState.d.ts.map