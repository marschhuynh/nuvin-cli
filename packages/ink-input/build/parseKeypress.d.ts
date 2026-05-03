import type { Key, MouseEvent } from "./types.js";
export type ParseResult = {
    input: string;
    key: Key;
};
export type MouseParseResult = {
    mouse: MouseEvent | null;
    consumed: boolean;
    /** Individual mouse events when multiple non-wheel events arrive in one chunk */
    events?: MouseEvent[];
    /** Non-mouse data that was interleaved — must be dispatched to keyboard pipeline */
    unconsumed?: string;
    /** Incomplete trailing escape sequence — must be preserved as decoder remainder */
    remainder?: string;
};
export declare function setKittyProtocolEnabled(enabled: boolean): void;
export declare function isKittyProtocolEnabled(): boolean;
export declare const nonAlphanumericKeys: string[];
export declare const parseKeypress: (data: string) => ParseResult;
export declare function splitInputChunks(data: string): string[];
export declare function splitInputChunksWithRemainder(data: string): {
    chunks: string[];
    remainder: string;
};
export declare function parseMouseEvent(data: string): MouseParseResult;
//# sourceMappingURL=parseKeypress.d.ts.map