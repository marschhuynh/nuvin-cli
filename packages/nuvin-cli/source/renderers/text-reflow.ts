import { textLength } from './text-utils.js';

const HARD_RETURN = '\r';
const HARD_RETURN_RE = new RegExp(HARD_RETURN);
const HARD_RETURN_GFM_RE = new RegExp(`${HARD_RETURN}|<br />`);

export function reflowText(text: string, width: number, gfm?: boolean): string {
  const splitRe = gfm ? HARD_RETURN_GFM_RE : HARD_RETURN_RE;
  const sections = text.split(splitRe);
  const reflowed: string[] = [];

  sections.forEach((section) => {
    // biome-ignore lint/suspicious/noControlCharactersInRegex: ANSI escape sequences are intentional for terminal formatting
    const fragments = section.split(/(\u001b\[(?:\d{1,3})(?:;\d{1,3})*m)/g);
    let column = 0;
    let currentLine = '';
    let lastWasEscapeChar = false;

    while (fragments.length) {
      const fragment = fragments[0];

      if (fragment === '') {
        fragments.splice(0, 1);
        lastWasEscapeChar = false;
        continue;
      }

      if (!textLength(fragment)) {
        currentLine += fragment;
        fragments.splice(0, 1);
        lastWasEscapeChar = true;
        continue;
      }

      const words = fragment.split(/[ \t\n]+/);

      for (let i = 0; i < words.length; i++) {
        let word = words[i];
        let addSpace = column !== 0;
        if (lastWasEscapeChar) addSpace = false;

        if (column + word.length + (addSpace ? 1 : 0) > width) {
          if (word.length <= width) {
            reflowed.push(currentLine);
            currentLine = word;
            column = word.length;
          } else {
            let w = word.substr(0, width - column - (addSpace ? 1 : 0));
            if (addSpace) currentLine += ' ';
            currentLine += w;
            reflowed.push(currentLine);
            currentLine = '';
            column = 0;

            word = word.substr(w.length);
            while (word.length) {
              w = word.substr(0, width);
              if (!w.length) break;

              if (w.length < width) {
                currentLine = w;
                column = w.length;
                break;
              } else {
                reflowed.push(w);
                word = word.substr(width);
              }
            }
          }
        } else {
          if (addSpace) {
            currentLine += ' ';
            column++;
          }
          currentLine += word;
          column += word.length;
        }

        lastWasEscapeChar = false;
      }

      fragments.splice(0, 1);
    }

    if (textLength(currentLine)) reflowed.push(currentLine);
  });

  return reflowed.join('\n');
}

export function indent(indentStr: string, text: string): string {
  if (!text) return text;
  return indentStr + text.split('\n').join(`\n${indentStr}`);
}

export function hr(inputHrStr: string, length: number | boolean): string {
  const actualLength = typeof length === 'number' ? length : process.stdout.columns || 80;
  return new Array(actualLength).join(inputHrStr);
}

export function section(text: string): string {
  return `${text}\n\n`;
}
