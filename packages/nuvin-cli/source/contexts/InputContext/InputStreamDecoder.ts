import { splitInputChunksWithRemainder } from './parseKeypress.js';

export type DecodeResult = {
  chunks: string[];
  hasPendingEscape: boolean;
};

export class InputStreamDecoder {
  private remainder = '';

  getCombinedData(data: string): string {
    return this.remainder + data;
  }

  feedCombinedData(combinedData: string): DecodeResult {
    const { chunks, remainder } = splitInputChunksWithRemainder(combinedData);
    this.remainder = remainder;
    return {
      chunks,
      hasPendingEscape: remainder === '\x1b',
    };
  }

  flushPendingEscape(): string[] {
    if (this.remainder === '\x1b') {
      this.remainder = '';
      return ['\x1b'];
    }
    return [];
  }

  clear(): void {
    this.remainder = '';
  }

  getRemainder(): string {
    return this.remainder;
  }
}
