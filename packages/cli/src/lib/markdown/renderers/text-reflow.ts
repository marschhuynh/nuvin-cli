import { textLength } from "./text-utils.js";

const HARD_RETURN = "\r";
const HARD_RETURN_RE = new RegExp(HARD_RETURN);
const HARD_RETURN_GFM_RE = new RegExp(`${HARD_RETURN}|<br />`);

function reflowLine(line: string, width: number): string[] {
  const leadingMatch = line.match(/^([ \t]*)/);
  const leadingIndent = leadingMatch ? leadingMatch[1] : "";
  const indentWidth = leadingIndent.replace(/\t/g, "    ").length;
  const content = line.slice(leadingIndent.length);

  if (!content) return [leadingIndent];

  const effectiveWidth = width - indentWidth;
  if (effectiveWidth <= 0) return [line];

  // biome-ignore lint/suspicious/noControlCharactersInRegex: ANSI escape sequence parsing
  const fragments = content.split(/(\u001b\[(?:\d{1,3})(?:;\d{1,3})*m)/g);
  const reflowed: string[] = [];
  let column = 0;
  let currentLine = leadingIndent;
  let lastWasEscapeChar = false;

  while (fragments.length) {
    const fragment = fragments[0];

    if (fragment === "") {
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

    const words = fragment.split(/ +/);

    for (let i = 0; i < words.length; i++) {
      let word = words[i];
      let wordWidth = textLength(word);
      let addSpace = column !== 0;
      if (lastWasEscapeChar) addSpace = false;

      if (column + wordWidth + (addSpace ? 1 : 0) > effectiveWidth) {
        if (wordWidth <= effectiveWidth) {
          reflowed.push(currentLine);
          currentLine = leadingIndent + word;
          column = wordWidth;
        } else {
          let w = word.substr(0, effectiveWidth - column - (addSpace ? 1 : 0));
          let wWidth = textLength(w);
          if (addSpace) currentLine += " ";
          currentLine += w;
          reflowed.push(currentLine);
          currentLine = leadingIndent;
          column = 0;

          word = word.substr(w.length);
          wordWidth = textLength(word);
          while (wordWidth) {
            w = word.substr(0, effectiveWidth);
            wWidth = textLength(w);
            if (!wWidth) break;

            if (wWidth < effectiveWidth) {
              currentLine = leadingIndent + w;
              column = wWidth;
              break;
            } else {
              reflowed.push(leadingIndent + w);
              word = word.substr(effectiveWidth);
              wordWidth = textLength(word);
            }
          }
        }
      } else {
        if (addSpace) {
          currentLine += " ";
          column++;
        }
        currentLine += word;
        column += wordWidth;
      }

      lastWasEscapeChar = false;
    }

    fragments.splice(0, 1);
  }

  if (textLength(currentLine)) reflowed.push(currentLine);

  return reflowed;
}

export function reflowText(text: string, width: number, gfm?: boolean): string {
  const splitRe = gfm ? HARD_RETURN_GFM_RE : HARD_RETURN_RE;
  const sections = text.split(splitRe);
  const reflowed: string[] = [];

  sections.forEach((section) => {
    const lines = section.split("\n");
    for (const line of lines) {
      reflowed.push(...reflowLine(line, width));
    }
  });

  return reflowed.join("\n");
}

export function indent(indentStr: string, text: string): string {
  if (!text) return text;
  return indentStr + text.split("\n").join(`\n${indentStr}`);
}

export function hr(inputHrStr: string, length: number): string {
  return new Array(length).join(inputHrStr);
}

export function section(text: string): string {
  return `${text}\n\n`;
}
