import { splitInputChunksWithRemainder } from "./parseKeypress.js";
export class InputStreamDecoder {
    remainder = "";
    getCombinedData(data) {
        return this.remainder + data;
    }
    feedCombinedData(combinedData) {
        const { chunks, remainder } = splitInputChunksWithRemainder(combinedData);
        this.remainder = remainder;
        return {
            chunks,
            hasPendingEscape: remainder === "\x1b",
        };
    }
    flushPendingEscape() {
        if (this.remainder === "\x1b") {
            this.remainder = "";
            return ["\x1b"];
        }
        return [];
    }
    clear() {
        this.remainder = "";
    }
    getRemainder() {
        return this.remainder;
    }
}
//# sourceMappingURL=InputStreamDecoder.js.map