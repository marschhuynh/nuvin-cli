export type DecodeResult = {
    chunks: string[];
    hasPendingEscape: boolean;
};
export declare class InputStreamDecoder {
    private remainder;
    getCombinedData(data: string): string;
    feedCombinedData(combinedData: string): DecodeResult;
    flushPendingEscape(): string[];
    clear(): void;
    getRemainder(): string;
}
//# sourceMappingURL=InputStreamDecoder.d.ts.map