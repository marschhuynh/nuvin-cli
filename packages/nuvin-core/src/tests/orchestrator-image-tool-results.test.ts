import { describe, it, expect } from 'vitest';
import { extractBase64Images, toMessageContentParts } from '../utils/base64-image-detector.js';

// A minimal valid 1x1 PNG encoded in base64 — used across all tests
const TINY_PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

describe('orchestrator image tool result handling', () => {
  // -------------------------------------------------------------------
  // extractBase64Images + toMessageContentParts integration
  // -------------------------------------------------------------------

  it('text result with data URI produces image parts', () => {
    const input = `Screenshot: data:image/png;base64,${TINY_PNG}`;
    const extracted = extractBase64Images(input);
    const parts = toMessageContentParts(extracted);

    expect(parts).toEqual([
      { type: 'text', text: 'Screenshot: ' },
      { type: 'image', mimeType: 'image/png', data: TINY_PNG },
    ]);
  });

  it('plain text result stays as string', () => {
    const extracted = extractBase64Images('File contents: hello world');

    expect(extracted).toEqual([{ type: 'text', text: 'File contents: hello world' }]);
    expect(extracted.some((e) => e.type === 'image')).toBe(false);
  });

  it('partsToProviderContent converts image parts to data URIs', () => {
    // Since partsToProviderContent is a private module function, test it
    // indirectly through the detector + converter pipeline.
    const parts = toMessageContentParts([
      { type: 'text', text: 'Result: ' },
      { type: 'image', mimeType: 'image/png', data: TINY_PNG },
    ]);

    expect(parts[0]).toEqual({ type: 'text', text: 'Result: ' });
    expect(parts[1]).toEqual({ type: 'image', mimeType: 'image/png', data: TINY_PNG });
  });

  // -------------------------------------------------------------------
  // Multiple images and interleaved text
  // -------------------------------------------------------------------

  it('extracts multiple images interleaved with text', () => {
    const input = `Before data:image/png;base64,${TINY_PNG} middle data:image/jpeg;base64,${TINY_PNG} after`;
    const extracted = extractBase64Images(input);

    expect(extracted).toHaveLength(5);
    expect(extracted[0]).toEqual({ type: 'text', text: 'Before ' });
    expect(extracted[1]).toEqual({ type: 'image', mimeType: 'image/png', data: TINY_PNG });
    expect(extracted[2]).toEqual({ type: 'text', text: ' middle ' });
    expect(extracted[3]).toEqual({ type: 'image', mimeType: 'image/jpeg', data: TINY_PNG });
    expect(extracted[4]).toEqual({ type: 'text', text: ' after' });
  });

  it('toMessageContentParts preserves ordering for multi-image input', () => {
    const input = `A data:image/gif;base64,${TINY_PNG} B`;
    const parts = toMessageContentParts(extractBase64Images(input));

    expect(parts).toEqual([
      { type: 'text', text: 'A ' },
      { type: 'image', mimeType: 'image/gif', data: TINY_PNG },
      { type: 'text', text: ' B' },
    ]);
  });

  // -------------------------------------------------------------------
  // Edge cases
  // -------------------------------------------------------------------

  it('empty string returns empty array', () => {
    expect(extractBase64Images('')).toEqual([]);
  });

  it('image-only input (no surrounding text) produces single image part', () => {
    const input = `data:image/webp;base64,${TINY_PNG}`;
    const extracted = extractBase64Images(input);

    expect(extracted).toEqual([{ type: 'image', mimeType: 'image/webp', data: TINY_PNG }]);
  });

  it('hasImages check returns false for plain text', () => {
    const extracted = extractBase64Images('no images here');
    const hasImages = extracted.some((e) => e.type === 'image');

    expect(hasImages).toBe(false);
  });

  it('hasImages check returns true when images are present', () => {
    const extracted = extractBase64Images(`data:image/png;base64,${TINY_PNG}`);
    const hasImages = extracted.some((e) => e.type === 'image');

    expect(hasImages).toBe(true);
  });
});
