import type { ImageContentPart, TextContentPart } from '../ports.js';

/**
 * Discriminated union representing a segment extracted from a string
 * that may contain embedded base64 data URIs.
 *
 * - `text`  — plain text content (no data URI)
 * - `image` — a decoded data URI with its MIME type and raw base64 payload
 */
export type ExtractedContent =
  | { type: 'text'; text: string }
  | { type: 'image'; mimeType: string; data: string };

/**
 * Matches `data:image/<subtype>;base64,<payload>` where:
 *   - subtype is one of: png, jpeg, jpg, gif, webp
 *   - payload is standard base64 (A-Z, a-z, 0-9, +, /, optional = padding, optional newlines)
 *
 * Uses the global flag so `String.prototype.matchAll` yields all occurrences.
 */
const DATA_URI_REGEX =
  /data:(image\/(?:png|jpeg|jpg|gif|webp));base64,([A-Za-z0-9+/\n\r]+=*)/g;

/**
 * Scans `input` for embedded base64 image data URIs and splits the string
 * into an ordered array of text and image segments.
 *
 * @example
 * ```ts
 * const parts = extractBase64Images('Look: data:image/png;base64,iVBOR... done');
 * // [
 * //   { type: 'text', text: 'Look: ' },
 * //   { type: 'image', mimeType: 'image/png', data: 'iVBOR...' },
 * //   { type: 'text', text: ' done' },
 * // ]
 * ```
 */
export function extractBase64Images(input: string): ExtractedContent[] {
  if (!input) return [];

  // Reset lastIndex — the global regex may retain state from prior test() calls
  DATA_URI_REGEX.lastIndex = 0;

  const results: ExtractedContent[] = [];
  let lastIndex = 0;

  for (const match of input.matchAll(DATA_URI_REGEX)) {
    const matchStart = match.index!;
    const mimeType = match[1]!;
    const data = match[2]!;

    // Capture any plain text that precedes this match
    if (matchStart > lastIndex) {
      results.push({ type: 'text', text: input.slice(lastIndex, matchStart) });
    }

    results.push({ type: 'image', mimeType, data });
    lastIndex = matchStart + match[0].length;
  }

  // Capture any trailing text after the last match
  if (lastIndex < input.length) {
    results.push({ type: 'text', text: input.slice(lastIndex) });
  }

  // If nothing matched, the entire input is plain text
  if (results.length === 0 && input.length > 0) {
    results.push({ type: 'text', text: input });
  }

  return results;
}

/**
 * Quick boolean check for whether a string contains at least one
 * base64-encoded image data URI.
 */
export function hasBase64Images(input: string): boolean {
  // Reset lastIndex since we reuse a global regex
  DATA_URI_REGEX.lastIndex = 0;
  return DATA_URI_REGEX.test(input);
}

/**
 * Converts extracted content segments into the provider-facing
 * `TextContentPart | ImageContentPart` union used by the orchestrator's
 * message pipeline.
 */
export function toMessageContentParts(
  extracted: ExtractedContent[],
): Array<TextContentPart | ImageContentPart> {
  return extracted.map((item) => {
    if (item.type === 'text') {
      return { type: 'text' as const, text: item.text };
    }
    return {
      type: 'image' as const,
      mimeType: item.mimeType,
      data: item.data,
    };
  });
}
