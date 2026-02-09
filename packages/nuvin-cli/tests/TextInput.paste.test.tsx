import { describe, it, expect } from 'vitest';
import { canonicalizeTerminalPaste } from '@nuvin/nuvin-core';
import { processPasteChunk, createPasteState, type PasteResult } from '../source/utils/pasteHandler.js';
import { parseKeypress } from '../source/contexts/InputContext/parseKeypress.js';

const PASTE_START = '\x1b[200~';
const PASTE_START_STRICT = '[200~';
const PASTE_END = '\x1b[201~';
const PASTE_END_STRICT = '[201~';

describe('canonicalizeTerminalPaste', () => {
  it('preserves source code with escape sequences', () => {
    const sourceCode = `const PASTE_START = '\\x1b[200~';
const PASTE_START_STRICT = '[200~';
const PASTE_END = '\\x1b[201~';
const PASTE_END_STRICT = '[201~';`;

    const result = canonicalizeTerminalPaste(sourceCode);

    expect(result).toContain("'\\x1b[200~'");
    expect(result).toContain('[200~');
    expect(result).toContain("'\\x1b[201~'");
    expect(result).toContain('[201~');
  });

  it('normalizes line endings', () => {
    const textWithCRLF = 'line1\r\nline2\r\nline3';
    const result = canonicalizeTerminalPaste(textWithCRLF);
    expect(result).toBe('line1\nline2\nline3');
  });

  it('handles carriage returns', () => {
    const textWithCR = 'overwrite\rthis';
    const result = canonicalizeTerminalPaste(textWithCR);
    // Carriage return followed by other text normalizes to newline
    expect(result).toBe('overwrite\nthis');
  });

  it('handles backspaces', () => {
    const textWithBackspace = 'hello\b\b\b\bHELLO';
    const result = canonicalizeTerminalPaste(textWithBackspace);
    expect(result).toBe('hHELLO');
  });

  it('does not strip ANSI from bracketed paste', () => {
    const contentWithAnsi = "const ESC = '\\x1b';\nprocess.stdout.write('\\x1b[31mRed\\x1b[0m');";
    const result = canonicalizeTerminalPaste(contentWithAnsi);

    expect(result).toContain('\\x1b');
  });

  it('handles empty paste', () => {
    const result = canonicalizeTerminalPaste('');
    expect(result).toBe('');
  });

  it('preserves Unicode content', () => {
    const unicodeContent = 'Hello 🌍 世界 مرحبا мир';
    const result = canonicalizeTerminalPaste(unicodeContent);
    expect(result).toBe(unicodeContent);
  });
});

describe('processPasteChunk', () => {
  describe('single-chunk paste', () => {
    it('handles single-chunk paste with ANSI prefix', () => {
      const content = 'Hello World!';
      const input = PASTE_START + content + PASTE_END;
      const state = createPasteState();

      const result = processPasteChunk(input, state);

      expect(result.shouldWaitForMore).toBe(false);
      expect(result.processedInput).toBe(content);
      expect(result.newState.buffer).toBe(null);
      expect(result.isPasteStart).toBe(true);
    });

    it('handles single-chunk paste without ANSI prefix', () => {
      const content = 'Hello World!';
      const input = PASTE_START_STRICT + content + PASTE_END_STRICT;
      const state = createPasteState();

      const result = processPasteChunk(input, state);

      expect(result.shouldWaitForMore).toBe(false);
      expect(result.processedInput).toBe(content);
      expect(result.newState.buffer).toBe(null);
      expect(result.isPasteStart).toBe(true);
    });
  });

  describe('multi-chunk paste', () => {
    it('handles first chunk without end marker', () => {
      const content = 'This is a long text';
      const input = PASTE_START + content;
      const state = createPasteState();

      const result = processPasteChunk(input, state);

      expect(result.shouldWaitForMore).toBe(true);
      expect(result.processedInput).toBe(null);
      expect(result.newState.buffer).toBe(content);
      expect(result.isPasteStart).toBe(true);
    });

    it('handles second chunk with end marker', () => {
      const firstPart = 'This is a long text';
      const secondPart = ' that continues here';

      // First chunk
      const input1 = PASTE_START + firstPart;
      const state1 = createPasteState();
      const result1 = processPasteChunk(input1, state1);

      expect(result1.newState.buffer).toBe(firstPart);
      expect(result1.isPasteStart).toBe(true);

      // Second chunk
      const input2 = secondPart + PASTE_END;
      const result2 = processPasteChunk(input2, result1.newState);

      expect(result2.shouldWaitForMore).toBe(false);
      expect(result2.processedInput).toBe(firstPart + secondPart);
      expect(result2.newState.buffer).toBe(null);
      expect(result2.isPasteStart).toBe(false);
    });

    it('handles three chunk paste', () => {
      const chunks = ['First chunk', ' second chunk', ' third chunk'];
      let state = createPasteState();
      let result: PasteResult;

      // First chunk
      result = processPasteChunk(PASTE_START + chunks[0], state);
      expect(result.shouldWaitForMore).toBe(true);
      expect(result.isPasteStart).toBe(true);
      state = result.newState;

      // Second chunk
      result = processPasteChunk(chunks[1], state);
      expect(result.shouldWaitForMore).toBe(true);
      expect(result.isPasteStart).toBe(false);
      state = result.newState;

      // Third chunk with end marker
      result = processPasteChunk(chunks[2] + PASTE_END, state);
      expect(result.shouldWaitForMore).toBe(false);
      expect(result.processedInput).toBe(chunks.join(''));
      expect(result.isPasteStart).toBe(false);
    });
  });

  describe('content with paste markers', () => {
    it('does not prematurely end paste when content contains end marker', () => {
      const content = "const PASTE_END = '[201~';";
      const input = PASTE_START_STRICT + content;
      const state = createPasteState();

      const result = processPasteChunk(input, state);

      // Should NOT think paste ended even though content contains [201~]
      expect(result.shouldWaitForMore).toBe(true);
      expect(result.newState.buffer).toBe(content);
      expect(result.isPasteStart).toBe(true);
    });

    it('correctly handles paste with markers in content across chunks', () => {
      const firstPart = "const PASTE_START = '[200~';\nconst PASTE_END_STRICT = '[201~';";
      const secondPart = '\nmore content here';

      const state = createPasteState();

      // First chunk
      let result = processPasteChunk(PASTE_START_STRICT + firstPart, state);
      expect(result.shouldWaitForMore).toBe(true);
      expect(result.newState.buffer).toContain("'[201~'");

      // Second chunk
      result = processPasteChunk(secondPart + PASTE_END_STRICT, result.newState);
      expect(result.shouldWaitForMore).toBe(false);
      expect(result.processedInput).toBe(firstPart + secondPart);
      expect(result.processedInput).toContain("'[201~'");
      expect(result.processedInput).toContain("'[200~'");
    });

    it('handles the TextInput.tsx regression case', () => {
      // The actual content from issue-copy.txt
      const fullContent = `import { useState, useEffect, useRef } from 'react';
import { Text, useInput, useStdout } from 'ink';
import chalk from 'chalk';
import type { Except } from 'type-fest';
import { eventBus } from '../services/EventBus.js';
import { canonicalizeTerminalPaste } from '../utils.js';

const PASTE_START = '\\x1b[200~';
const PASTE_START_STRICT = '[200~';
const PASTE_END = '\\x1b[201~';
const PASTE_END_STRICT = '[201~';

export type Props = {
  /**
   * Text to display when \`value\` is empty.
   */
  readonly placeholder?: string;

  /**
   * Listen to user's input. Useful in case there are multiple input components
   * at the same time and input must be "routed" to a specific component.
   */
  readonly focus?: boolean; // eslint-disable-line react/boolean-prop-naming

  /**
   * Replace all chars and mask the value. Useful for password inputs.
   */
  readonly mask?: string;

  /**
   * Whether to show cursor and allow navigation inside text input with arrow keys.
   */
  readonly showCursor?: boolean; /`;

      // Simulate chunking at ~1021 bytes
      const chunk1Size = 1011; // Content size from issue
      const chunk1Content = fullContent.slice(0, chunk1Size);
      const chunk2Content = fullContent.slice(chunk1Size);

      const state = createPasteState();

      // First chunk
      let result = processPasteChunk(PASTE_START_STRICT + chunk1Content, state);
      expect(result.shouldWaitForMore).toBe(true);

      // Second chunk
      result = processPasteChunk(chunk2Content + PASTE_END_STRICT, result.newState);
      expect(result.shouldWaitForMore).toBe(false);
      expect(result.processedInput).toBe(fullContent);

      // Verify all markers are preserved in content as string literals
      expect(result.processedInput).toContain("'[200~'");
      expect(result.processedInput).toContain("'[201~'");
      expect(result.processedInput).toContain("'\\x1b[200~'");
      expect(result.processedInput).toContain("'\\x1b[201~'");
    });

    it('handles content ending with forward slash', () => {
      const contentEndingWithSlash = '  readonly showCursor?: boolean; /';

      const state = createPasteState();

      // First chunk
      let result = processPasteChunk(PASTE_START_STRICT + contentEndingWithSlash, state);
      expect(result.shouldWaitForMore).toBe(true);

      // Second chunk (just the end marker)
      result = processPasteChunk(PASTE_END_STRICT, result.newState);
      expect(result.shouldWaitForMore).toBe(false);
      expect(result.processedInput).toBe(contentEndingWithSlash);
      expect(result.processedInput?.endsWith('/')).toBe(true);
    });
  });

  describe('non-paste input', () => {
    it('returns null for regular input', () => {
      const input = 'regular text';
      const state = createPasteState();

      const result = processPasteChunk(input, state);

      expect(result.shouldWaitForMore).toBe(false);
      expect(result.processedInput).toBe(null);
      expect(result.newState.buffer).toBe(null);
      expect(result.isPasteStart).toBe(false);
    });

    it('ignores paste markers in regular input when not in paste mode', () => {
      const input = 'text with [201~] marker';
      const state = createPasteState();

      const result = processPasteChunk(input, state);

      expect(result.processedInput).toBe(null);
      expect(result.isPasteStart).toBe(false);
    });
  });

  describe('end marker as separate chunk', () => {
    it('completes paste when end marker arrives as its own chunk', () => {
      const longUrl = 'https://y3o6d0zjyc.execute-api.us-east-1.amazonaws.com/prod/demodb/authorize?response_type=code&client_id=DcYECKPT707qFl1CRlo4Egs5kgoAEkif&redirect_uri=https://inferno.healthit.gov/suites/custom/smart/redirect&scope=launch/patient+openid+fhirUser+offline_access+patient/Medication.rs';
      let state = createPasteState();

      // First chunk: start marker + content
      let result = processPasteChunk(PASTE_START + longUrl, state);
      expect(result.shouldWaitForMore).toBe(true);
      expect(result.isPasteStart).toBe(true);
      state = result.newState;

      // Second chunk: end marker arrives alone (as parseKeypress would pass it through)
      result = processPasteChunk(PASTE_END, state);
      expect(result.shouldWaitForMore).toBe(false);
      expect(result.processedInput).toBe(longUrl);
    });

    it('completes paste when strict end marker arrives as its own chunk', () => {
      const content = 'some pasted text';
      let state = createPasteState();

      let result = processPasteChunk(PASTE_START_STRICT + content, state);
      expect(result.shouldWaitForMore).toBe(true);
      state = result.newState;

      result = processPasteChunk(PASTE_END_STRICT, state);
      expect(result.shouldWaitForMore).toBe(false);
      expect(result.processedInput).toBe(content);
    });

    it('completes paste when end marker is embedded in a continuation chunk', () => {
      const part1 = 'first part of paste';
      const part2 = ' second part';
      let state = createPasteState();

      let result = processPasteChunk(PASTE_START + part1, state);
      expect(result.shouldWaitForMore).toBe(true);
      state = result.newState;

      // End marker in the middle of data (unlikely but should be handled)
      result = processPasteChunk(part2 + PASTE_END, state);
      expect(result.shouldWaitForMore).toBe(false);
      expect(result.processedInput).toBe(part1 + part2);
    });

    it('handles empty continuation chunk before end marker', () => {
      const content = 'hello world';
      let state = createPasteState();

      let result = processPasteChunk(PASTE_START + content, state);
      expect(result.shouldWaitForMore).toBe(true);
      state = result.newState;

      // Empty string continuation (e.g., parseKeypress stripped something)
      result = processPasteChunk('', state);
      expect(result.shouldWaitForMore).toBe(true);
      state = result.newState;

      // End marker finally arrives
      result = processPasteChunk(PASTE_END, state);
      expect(result.shouldWaitForMore).toBe(false);
      expect(result.processedInput).toBe(content);
    });
  });
});

describe('parseKeypress paste marker handling', () => {
  it('passes through paste start marker as-is', () => {
    const data = '\x1b[200~some content';
    const result = parseKeypress(data);
    expect(result.input).toBe(data);
  });

  it('passes through paste end marker as-is', () => {
    const data = '\x1b[201~';
    const result = parseKeypress(data);
    // Should NOT be consumed by fnKeyRe — must pass through for paste handler
    expect(result.input).toBe(data);
  });

  it('passes through strict paste end marker as-is', () => {
    const data = '[201~';
    const result = parseKeypress(data);
    expect(result.input).toBe(data);
  });

  it('passes through paste end marker with trailing data', () => {
    const data = '\x1b[201~extra';
    const result = parseKeypress(data);
    expect(result.input).toBe(data);
  });
});
