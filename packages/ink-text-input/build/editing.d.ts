export type EditResult = {
    value: string;
    cursorOffset: number;
};
export declare function applyBackspace(value: string, cursorOffset: number): EditResult | null;
export declare function applyDelete(value: string, cursorOffset: number): EditResult | null;
//# sourceMappingURL=editing.d.ts.map