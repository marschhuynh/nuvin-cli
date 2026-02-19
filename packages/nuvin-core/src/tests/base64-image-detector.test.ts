import { describe, it, expect } from 'vitest';
import {
  extractBase64Images,
  hasBase64Images,
  toMessageContentParts,
  type ExtractedContent,
} from '../utils/base64-image-detector.js';

describe('extractBase64Images', () => {
  it('returns original text when no images found', () => {
    const result = extractBase64Images('just plain text');
    expect(result).toEqual([{ type: 'text', text: 'just plain text' }]);
  });

  it('extracts data URI with image/png', () => {
    const b64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
    const input = `Here is an image: data:image/png;base64,${b64} and some text after`;
    const result = extractBase64Images(input);
    expect(result).toEqual([
      { type: 'text', text: 'Here is an image: ' },
      { type: 'image', mimeType: 'image/png', data: b64 },
      { type: 'text', text: ' and some text after' },
    ]);
  });

  it('extracts data URI with image/jpeg', () => {
    const b64 = '/9j/4AAQSkZJRgABAQEASABIAAD';
    const input = `data:image/jpeg;base64,${b64}`;
    const result = extractBase64Images(input);
    expect(result).toEqual([{ type: 'image', mimeType: 'image/jpeg', data: b64 }]);
  });

  it('extracts multiple data URIs', () => {
    const b64a = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVQI12NgAAIABQABNjN9GQAAAAlwSFlzAAAWJQ==';
    const b64b = '/9j/4AAQSkZJRgABAQEASABIAAD';
    const input = `Image 1: data:image/png;base64,${b64a} Image 2: data:image/jpeg;base64,${b64b}`;
    const result = extractBase64Images(input);
    expect(result.length).toBe(4);
    expect(result[0]).toEqual({ type: 'text', text: 'Image 1: ' });
    expect(result[1]).toEqual({ type: 'image', mimeType: 'image/png', data: b64a });
    expect(result[2]).toEqual({ type: 'text', text: ' Image 2: ' });
    expect(result[3]).toEqual({ type: 'image', mimeType: 'image/jpeg', data: b64b });
  });

  it('handles data URI as entire string', () => {
    const b64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
    const input = `data:image/png;base64,${b64}`;
    const result = extractBase64Images(input);
    expect(result).toEqual([{ type: 'image', mimeType: 'image/png', data: b64 }]);
  });

  it('ignores non-image data URIs', () => {
    const input = 'data:text/plain;base64,SGVsbG8gV29ybGQ=';
    const result = extractBase64Images(input);
    expect(result).toEqual([{ type: 'text', text: input }]);
  });

  it('returns empty array for empty string', () => {
    const result = extractBase64Images('');
    expect(result).toEqual([]);
  });

  it('filters out empty text segments', () => {
    const b64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
    const input = `data:image/png;base64,${b64}`;
    const result = extractBase64Images(input);
    expect(result.every((r) => !(r.type === 'text' && r.text === ''))).toBe(true);
  });

  it('supports image/webp', () => {
    const b64 = 'UklGRlYAAABXRUJQVlA4IEoAAADQAQCdASoBAAEAAkA4JZQCdAEO/hepgAAA';
    const input = `data:image/webp;base64,${b64}`;
    const result = extractBase64Images(input);
    expect(result).toEqual([{ type: 'image', mimeType: 'image/webp', data: b64 }]);
  });

  it('supports image/gif', () => {
    const b64 = 'R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';
    const input = `data:image/gif;base64,${b64}`;
    const result = extractBase64Images(input);
    expect(result).toEqual([{ type: 'image', mimeType: 'image/gif', data: b64 }]);
  });

  it('rejects unsupported MIME type svg+xml', () => {
    const input = 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmci';
    const result = extractBase64Images(input);
    expect(result).toEqual([{ type: 'text', text: input }]);
  });

  it('rejects unsupported MIME type bmp', () => {
    const input = 'data:image/bmp;base64,Qk1GAAAAAAAAAD4AAAAo';
    const result = extractBase64Images(input);
    expect(result).toEqual([{ type: 'text', text: input }]);
  });

  it('rejects unsupported MIME type tiff', () => {
    const input = 'data:image/tiff;base64,SUkqAAgAAAAIAAAB';
    const result = extractBase64Images(input);
    expect(result).toEqual([{ type: 'text', text: input }]);
  });
});

describe('hasBase64Images', () => {
  const PNG_B64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

  it('returns true when a base64 image data URI is present', () => {
    expect(hasBase64Images(`data:image/png;base64,${PNG_B64}`)).toBe(true);
  });

  it('returns true when a data URI is embedded in surrounding text', () => {
    expect(hasBase64Images(`Look at this: data:image/jpeg;base64,/9j/4AAQSkZJRgABAQ== nice!`)).toBe(true);
  });

  it('returns false for plain text', () => {
    expect(hasBase64Images('just some regular text')).toBe(false);
  });

  it('returns false for empty string', () => {
    expect(hasBase64Images('')).toBe(false);
  });

  it('returns false for non-image data URIs', () => {
    expect(hasBase64Images('data:text/plain;base64,SGVsbG8=')).toBe(false);
  });

  it('returns false for unsupported image MIME types', () => {
    expect(hasBase64Images('data:image/svg+xml;base64,PHN2Zz4=')).toBe(false);
    expect(hasBase64Images('data:image/bmp;base64,Qk1G')).toBe(false);
    expect(hasBase64Images('data:image/tiff;base64,SUkq')).toBe(false);
  });

  it('returns true for each supported MIME type', () => {
    expect(hasBase64Images(`data:image/png;base64,${PNG_B64}`)).toBe(true);
    expect(hasBase64Images('data:image/jpeg;base64,/9j/4AAQ')).toBe(true);
    expect(hasBase64Images('data:image/jpg;base64,/9j/4AAQ')).toBe(true);
    expect(hasBase64Images('data:image/gif;base64,R0lGODlh')).toBe(true);
    expect(hasBase64Images('data:image/webp;base64,UklGRlYA')).toBe(true);
  });

  it('works correctly when called multiple times in succession', () => {
    // Regression: global regex lastIndex must be reset between calls
    expect(hasBase64Images(`data:image/png;base64,${PNG_B64}`)).toBe(true);
    expect(hasBase64Images('no image here')).toBe(false);
    expect(hasBase64Images(`data:image/gif;base64,R0lGODlh`)).toBe(true);
  });
});

describe('toMessageContentParts', () => {
  it('converts text segments to TextContentPart', () => {
    const extracted: ExtractedContent[] = [{ type: 'text', text: 'Hello world' }];
    const result = toMessageContentParts(extracted);
    expect(result).toEqual([{ type: 'text', text: 'Hello world' }]);
  });

  it('converts image segments to ImageContentPart', () => {
    const extracted: ExtractedContent[] = [{ type: 'image', mimeType: 'image/png', data: 'iVBORw0KGgo=' }];
    const result = toMessageContentParts(extracted);
    expect(result).toEqual([{ type: 'image', mimeType: 'image/png', data: 'iVBORw0KGgo=' }]);
  });

  it('converts mixed text and image segments in order', () => {
    const extracted: ExtractedContent[] = [
      { type: 'text', text: 'Before ' },
      { type: 'image', mimeType: 'image/jpeg', data: '/9j/4AAQ' },
      { type: 'text', text: ' After' },
    ];
    const result = toMessageContentParts(extracted);
    expect(result).toEqual([
      { type: 'text', text: 'Before ' },
      { type: 'image', mimeType: 'image/jpeg', data: '/9j/4AAQ' },
      { type: 'text', text: ' After' },
    ]);
  });

  it('returns an empty array for empty input', () => {
    const result = toMessageContentParts([]);
    expect(result).toEqual([]);
  });

  it('handles multiple consecutive images', () => {
    const extracted: ExtractedContent[] = [
      { type: 'image', mimeType: 'image/png', data: 'aaaa' },
      { type: 'image', mimeType: 'image/gif', data: 'bbbb' },
    ];
    const result = toMessageContentParts(extracted);
    expect(result).toEqual([
      { type: 'image', mimeType: 'image/png', data: 'aaaa' },
      { type: 'image', mimeType: 'image/gif', data: 'bbbb' },
    ]);
  });

  it('integrates with extractBase64Images end-to-end', () => {
    const b64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
    const input = `Check this: data:image/png;base64,${b64} cool`;
    const extracted = extractBase64Images(input);
    const parts = toMessageContentParts(extracted);
    expect(parts).toEqual([
      { type: 'text', text: 'Check this: ' },
      { type: 'image', mimeType: 'image/png', data: b64 },
      { type: 'text', text: ' cool' },
    ]);
  });
});
