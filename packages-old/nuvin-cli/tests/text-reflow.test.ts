import { describe, it, expect } from 'vitest';
import { reflowText, indent, hr, section } from '../source/components/Markdown/renderers/text-reflow.js';
import { textLength } from '../source/components/Markdown/renderers/text-utils.js';

describe('textLength', () => {
  it('returns correct length for plain text', () => {
    expect(textLength('hello')).toBe(5);
  });

  it('ignores ANSI escape codes', () => {
    const colored = '\u001b[31mhello\u001b[0m';
    expect(textLength(colored)).toBe(5);
  });

  it('handles multiple ANSI codes', () => {
    const styled = '\u001b[1;31;44mBold Red on Blue\u001b[0m';
    expect(textLength(styled)).toBe(16);
  });

  it('returns 0 for empty string', () => {
    expect(textLength('')).toBe(0);
  });

  it('returns 0 for ANSI-only string', () => {
    expect(textLength('\u001b[31m\u001b[0m')).toBe(0);
  });

  it('handles wide characters (CJK)', () => {
    expect(textLength('你好')).toBe(4);
  });

  it('handles emojis', () => {
    expect(textLength('👋')).toBe(2);
  });
});

describe('reflowText', () => {
  describe('basic reflow', () => {
    it('does not reflow text shorter than width', () => {
      const result = reflowText('hello world', 80);
      expect(result).toBe('hello world');
    });

    it('reflows text longer than width', () => {
      const result = reflowText('hello world', 8);
      expect(result).toBe('hello\nworld');
    });

    it('reflows multiple words', () => {
      const result = reflowText('one two three four', 10);
      expect(result).toBe('one two\nthree four');
    });
    it('reflows multiple words - width 87', () => {
      const result = reflowText(
        'Acknowledged. Leading whitespace in user input is now preserved since useHandleSubmit.ts at line 68 passes the original value to prepareUserSubmission instead of a trimmed one.',
        87,
      );
      expect(result).toBe(
        'Acknowledged. Leading whitespace in user input is now preserved since\nuseHandleSubmit.ts at line 68 passes the original value to prepareUserSubmission\ninstead of a trimmed one.',
      );
    });

    it('preserves existing newlines', () => {
      const result = reflowText('line one\nline two', 80);
      expect(result).toBe('line one\nline two');
    });

    it('handles empty string', () => {
      const result = reflowText('', 80);
      expect(result).toBe('');
    });
  });

  describe('indentation preservation', () => {
    it('preserves leading spaces on wrapped lines', () => {
      const result = reflowText('  hello world test', 10);
      expect(result).toBe('  hello\n  world\n  test');
    });

    it('preserves tabs as indentation', () => {
      const result = reflowText('\thello world', 10);
      const lines = result.split('\n');
      expect(lines[0]).toMatch(/^\t/);
      expect(lines[1]).toMatch(/^\t/);
    });
  });

  describe('long words', () => {
    it('breaks words longer than width', () => {
      const result = reflowText('supercalifragilistic', 10);
      expect(result.split('\n').length).toBeGreaterThan(1);
      result.split('\n').forEach((line) => {
        expect(textLength(line)).toBeLessThanOrEqual(10);
      });
    });

    it('handles single very long word', () => {
      const result = reflowText('abcdefghijklmnop', 5);
      const lines = result.split('\n');
      expect(lines.length).toBe(4);
      expect(lines[0]).toBe('abcde');
      expect(lines[1]).toBe('fghij');
      expect(lines[2]).toBe('klmno');
      expect(lines[3]).toBe('p');
    });
  });

  describe('ANSI escape sequences', () => {
    it('preserves ANSI codes and reflows correctly', () => {
      const colored = '\u001b[31mhello\u001b[0m \u001b[32mworld\u001b[0m';
      const result = reflowText(colored, 8);
      expect(result).toContain('\u001b[31m');
      expect(result).toContain('\u001b[32m');
    });

    it('does not count ANSI codes toward width', () => {
      const colored = '\u001b[31mhello\u001b[0m world';
      const result = reflowText(colored, 12);
      expect(result).toBe(colored);
    });

    it('handles inline code style (codespan)', () => {
      const text = 'See \u001b[33museHandleSubmit.ts\u001b[0m for details';
      const result = reflowText(text, 30);
      expect(result.split('\n').every((line) => textLength(line) <= 30)).toBe(true);
    });
  });

  describe('GFM mode', () => {
    it('treats <br /> as hard return in GFM mode', () => {
      const result = reflowText('line one<br />line two', 80, true);
      expect(result).toBe('line one\nline two');
    });

    it('treats \\r as hard return in GFM mode', () => {
      const result = reflowText('line one\rline two', 80, true);
      expect(result).toBe('line one\nline two');
    });

    it('does not treat <br /> as hard return in non-GFM mode', () => {
      const result = reflowText('line one<br />line two', 80, false);
      expect(result).toBe('line one<br />line two');
    });
  });

  describe('edge cases', () => {
    it('handles multiple spaces between words', () => {
      const result = reflowText('hello    world', 80);
      expect(result).toBe('hello world');
    });

    it('handles width of 0 or negative', () => {
      const result = reflowText('  hello', 0);
      expect(result).toBe('  hello');
    });

    it('handles text with only whitespace', () => {
      const result = reflowText('   ', 80);
      expect(result).toBe('   ');
    });

    it('handles mixed content with code spans', () => {
      const text =
        'Acknowledged. Leading whitespace in user input is now preserved since \u001b[33museHandleSubmit.ts\u001b[0m at line 68 passes the original value to \u001b[33mprepareUserSubmission\u001b[0m instead of a trimmed one.';
      const result = reflowText(text, 100);
      result.split('\n').forEach((line) => {
        expect(textLength(line)).toBeLessThanOrEqual(100);
      });
    });
  });
});

describe('indent', () => {
  it('adds indent to single line', () => {
    expect(indent('  ', 'hello')).toBe('  hello');
  });

  it('adds indent to multiple lines', () => {
    expect(indent('  ', 'line1\nline2')).toBe('  line1\n  line2');
  });

  it('returns empty string for empty input', () => {
    expect(indent('  ', '')).toBe('');
  });

  it('handles tab indent', () => {
    expect(indent('\t', 'hello\nworld')).toBe('\thello\n\tworld');
  });
});

describe('hr', () => {
  it('creates horizontal rule of specified length', () => {
    const result = hr('-', 10);
    expect(result).toBe('---------');
  });

  it('uses process.stdout.columns when length is true', () => {
    const result = hr('-', true);
    expect(result.length).toBeGreaterThan(0);
  });

  it('handles custom characters', () => {
    const result = hr('=', 5);
    expect(result).toBe('====');
  });
});

describe('section', () => {
  it('adds double newline after text', () => {
    expect(section('hello')).toBe('hello\n\n');
  });

  it('handles empty string', () => {
    expect(section('')).toBe('\n\n');
  });
});
