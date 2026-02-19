import { describe, it, expect } from 'vitest';
import { flattenMcpContent } from '../mcp/mcp-tools.js';

describe('flattenMcpContent', () => {
  describe('empty / undefined content', () => {
    it('should return text with empty string for undefined content', () => {
      const result = flattenMcpContent(undefined);
      expect(result).toEqual({ type: 'text', value: '' });
    });

    it('should return text with empty string for empty array', () => {
      const result = flattenMcpContent([]);
      expect(result).toEqual({ type: 'text', value: '' });
    });
  });

  describe('text-only content', () => {
    it('should join single text block', () => {
      const result = flattenMcpContent([{ type: 'text', text: 'hello world' }]);
      expect(result).toEqual({ type: 'text', value: 'hello world' });
    });

    it('should join multiple text blocks with newlines', () => {
      const result = flattenMcpContent([
        { type: 'text', text: 'line one' },
        { type: 'text', text: 'line two' },
        { type: 'text', text: 'line three' },
      ]);
      expect(result).toEqual({ type: 'text', value: 'line one\nline two\nline three' });
    });
  });

  describe('image-only content', () => {
    it('should return mixed with a single image part', () => {
      const result = flattenMcpContent([{ type: 'image', data: 'iVBORw0KGgo=', mimeType: 'image/png' }]);
      expect(result).toEqual({
        type: 'mixed',
        parts: [{ type: 'image', mimeType: 'image/png', data: 'iVBORw0KGgo=' }],
      });
    });

    it('should return mixed with multiple image parts', () => {
      const result = flattenMcpContent([
        { type: 'image', data: 'base64data1', mimeType: 'image/png' },
        { type: 'image', data: 'base64data2', mimeType: 'image/jpeg' },
      ]);
      expect(result).toEqual({
        type: 'mixed',
        parts: [
          { type: 'image', mimeType: 'image/png', data: 'base64data1' },
          { type: 'image', mimeType: 'image/jpeg', data: 'base64data2' },
        ],
      });
    });
  });

  describe('mixed text + image content', () => {
    it('should return mixed with text and image parts interleaved', () => {
      const result = flattenMcpContent([
        { type: 'text', text: 'Here is the screenshot:' },
        { type: 'image', data: 'screenData', mimeType: 'image/png' },
      ]);
      expect(result).toEqual({
        type: 'mixed',
        parts: [
          { type: 'text', text: 'Here is the screenshot:' },
          { type: 'image', mimeType: 'image/png', data: 'screenData' },
        ],
      });
    });

    it('should handle text-image-text ordering', () => {
      const result = flattenMcpContent([
        { type: 'text', text: 'Before' },
        { type: 'image', data: 'imgData', mimeType: 'image/webp' },
        { type: 'text', text: 'After' },
      ]);
      expect(result).toEqual({
        type: 'mixed',
        parts: [
          { type: 'text', text: 'Before' },
          { type: 'image', mimeType: 'image/webp', data: 'imgData' },
          { type: 'text', text: 'After' },
        ],
      });
    });

    it('should handle multiple images interleaved with text', () => {
      const result = flattenMcpContent([
        { type: 'text', text: 'Chart 1:' },
        { type: 'image', data: 'chart1', mimeType: 'image/png' },
        { type: 'text', text: 'Chart 2:' },
        { type: 'image', data: 'chart2', mimeType: 'image/png' },
      ]);
      expect(result).toEqual({
        type: 'mixed',
        parts: [
          { type: 'text', text: 'Chart 1:' },
          { type: 'image', mimeType: 'image/png', data: 'chart1' },
          { type: 'text', text: 'Chart 2:' },
          { type: 'image', mimeType: 'image/png', data: 'chart2' },
        ],
      });
    });
  });

  describe('image blocks with missing fields', () => {
    it('should fall through to json when image block is missing data', () => {
      const result = flattenMcpContent([{ type: 'image', mimeType: 'image/png' }]);
      expect(result.type).toBe('json');
      if (result.type === 'json') {
        expect(result.value).toEqual([{ type: 'image', mimeType: 'image/png' }]);
      }
    });

    it('should fall through to json when image block is missing mimeType', () => {
      const result = flattenMcpContent([{ type: 'image', data: 'someBase64' }]);
      expect(result.type).toBe('json');
      if (result.type === 'json') {
        expect(result.value).toEqual([{ type: 'image', data: 'someBase64' }]);
      }
    });

    it('should fall through to json when image block is missing both data and mimeType', () => {
      const result = flattenMcpContent([{ type: 'image' }]);
      expect(result.type).toBe('json');
    });
  });

  describe('non-text, non-image content (unknown types)', () => {
    it('should return json for unknown content types', () => {
      const result = flattenMcpContent([{ type: 'resource', text: 'some resource data' }]);
      expect(result.type).toBe('json');
      if (result.type === 'json') {
        expect(result.value).toEqual([{ type: 'resource', text: 'some resource data' }]);
      }
    });

    it('should return json for mixed text and unknown types', () => {
      const result = flattenMcpContent([
        { type: 'text', text: 'hello' },
        { type: 'resource', text: 'resource data' },
      ]);
      expect(result.type).toBe('json');
    });
  });

  describe('edge cases with images and unknown types', () => {
    it('should skip unknown types when images are present', () => {
      const result = flattenMcpContent([
        { type: 'text', text: 'Description' },
        { type: 'image', data: 'imgData', mimeType: 'image/png' },
        { type: 'resource', text: 'unknown block' },
      ]);
      // hasImages is true, so we enter the image branch.
      // The unknown "resource" type is neither text nor valid image, so it's skipped.
      expect(result).toEqual({
        type: 'mixed',
        parts: [
          { type: 'text', text: 'Description' },
          { type: 'image', mimeType: 'image/png', data: 'imgData' },
        ],
      });
    });
  });
});
