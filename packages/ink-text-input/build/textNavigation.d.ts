export type VimMode = "insert" | "normal";
export type LineInfo = {
    lines: string[];
    lineIndex: number;
    column: number;
    lineStart: number;
    lineEnd: number;
};
export declare function getLineInfo(value: string, offset: number): LineInfo;
export declare function moveCursorVertically(value: string, offset: number, direction: "up" | "down"): number | null;
export declare function moveCursorVisually(value: string, offset: number, direction: "up" | "down", wrapWidth: number): number | null;
export declare function findNextWordEnd(text: string, start: number): number;
export declare function clampOffset(valueLength: number, offset: number, mode: VimMode): number;
//# sourceMappingURL=textNavigation.d.ts.map