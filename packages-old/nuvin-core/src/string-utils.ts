import { stripVTControlCharacters } from 'util';

// terminalCanonicalize.ts
export function normalizeNewlines(s: string): string {
  return s.replace(/\r\n?/g, '\n');
}

export function resolveCarriageReturns(s: string): string {
  // For each visual line, if there are CRs, the last segment is what remained on screen
  return s
    .split('\n')
    .map((line) => {
      if (line.includes('\r')) {
        const parts = line.split('\r');
        return parts[parts.length - 1];
      }
      return line;
    })
    .join('\n');
}

export function resolveBackspaces(s: string): string {
  // Apply backspaces on Unicode code points (not raw UTF-16)
  const codepoints = Array.from(s);
  const out: string[] = [];
  for (const cp of codepoints) {
    if (cp === '\b') {
      out.pop();
    } else {
      out.push(cp);
    }
  }
  return out.join('');
}

export function stripAnsiAndControls(s: string): string {
  // Use Node.js built-in util.stripVTControlCharacters for basic control char removal
  s = stripVTControlCharacters(s);

  // Additional control character cleanup that util.stripVTControlCharacters doesn't handle
  const ESC = '\u001B';

  // util.stripVTControlCharacters may leave OSC remnants like ";Window Title\u0007"
  // or fragments from partially-stripped sequences. Clean these up aggressively.
  // Remove any sequence starting with ; and ending with BEL or ESC\
  s = s.replace(/;[^\u0007\n]*?\u0007/g, ''); // OSC remnants with BEL
  s = s.replace(new RegExp(`;[^\\n]*?${ESC}\\\\`, 'g'), ''); // OSC remnants with ST

  // Remove any remaining BEL characters
  s = s.replace(/\u0007/g, '');

  // DCS/PM/APC … ST (ESC P|^|_ … ESC \\))
  s = s.replace(new RegExp(`${ESC}[P_^][\\s\\S]*?${ESC}\\\\`, 'g'), '');
  // Other ESC sequences (like ESC =, ESC >, ESC 7, ESC 8, etc.)
  s = s.replace(new RegExp(`${ESC}[=>7-8()]`, 'g'), '');
  // 8-bit C1 controls
  s = s.replace(/[\u0080-\u009F]/g, '');
  // Zero-widths & NBSPs
  s = s.replace(/[\u200B-\u200F\u2060-\u2069\u00A0]/g, '');
  // Terminal visual indicators (⏎ return symbol, ␤ newline symbol, etc.)
  s = s.replace(/[\u23CE\u2424]/g, '');

  return s;
}

export function canonicalizeTerminalPaste(raw: string): string {
  let s = normalizeNewlines(raw);
  s = resolveCarriageReturns(s);
  s = resolveBackspaces(s);
  return s;
}
