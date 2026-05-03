import type { LineInfo } from "./textNavigation.js";
export type LineIndex = {
    lineStarts: number[];
    lineCount: number;
    getLineInfo: (offset: number) => LineInfo;
    getLine: (index: number) => string;
    getLineRange: (startLine: number, endLine: number) => string;
};
export declare function useLineIndex(value: string): LineIndex;
//# sourceMappingURL=useLineIndex.d.ts.map