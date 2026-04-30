export type UsePasteReturn = {
    processPaste: (input: string) => {
        processedInput: string | null;
        shouldWaitForMore: boolean;
        isPasteStart: boolean;
    };
};
export declare function usePaste(): UsePasteReturn;
//# sourceMappingURL=usePaste.d.ts.map