import type { Except } from "type-fest";
import type { LineInfo } from "./textNavigation.js";
export type { LineInfo };
export type TextInputProps = {
    readonly placeholder?: string;
    readonly focus?: boolean;
    readonly mask?: string;
    readonly showCursor?: boolean;
    readonly value: string;
    readonly onChange: (value: string) => void;
    readonly onSubmit?: (value: string) => void;
    readonly vimModeEnabled?: boolean;
    readonly onVimModeChange?: (mode: "insert" | "normal") => void;
    readonly onUpArrow?: (lineInfo: LineInfo) => void;
    readonly onDownArrow?: (lineInfo: LineInfo) => void;
    readonly onTab?: (value: string, cursorOffset: number, isShiftTab: boolean) => {
        value: string;
        cursorOffset: number;
    } | undefined;
    readonly maxLines?: number;
    readonly showScrollbar?: boolean;
    readonly scrollbarColor?: string;
    readonly scrollbarTrackColor?: string;
};
declare function TextInput({ value: originalValue, placeholder, focus, mask, showCursor, onChange, onSubmit, vimModeEnabled, onVimModeChange, onUpArrow, onDownArrow, onTab, maxLines, showScrollbar, scrollbarColor, scrollbarTrackColor, }: TextInputProps): import("react/jsx-runtime").JSX.Element;
export default TextInput;
type UncontrolledProps = {
    readonly initialValue?: string;
} & Except<TextInputProps, "value" | "onChange">;
export declare function UncontrolledTextInput({ initialValue, ...props }: UncontrolledProps): import("react/jsx-runtime").JSX.Element;
//# sourceMappingURL=TextInput.d.ts.map