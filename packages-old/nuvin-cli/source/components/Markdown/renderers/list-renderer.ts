const BULLET_POINT_REGEX = '\\*';
const NUMBERED_POINT_REGEX = '\\d+\\.';
const POINT_REGEX = `(?:${[BULLET_POINT_REGEX, NUMBERED_POINT_REGEX].join('|')})`;
export const BULLET_POINT = '* ';

function isPointedLine(line: string, indent: string): boolean {
  return !!line.match(`^(?:${indent})*${POINT_REGEX}`);
}

function toSpaces(str: string): string {
  return ' '.repeat(str.length);
}

function bulletPointLine(indent: string, line: string): string {
  return isPointedLine(line, indent) ? line : toSpaces(BULLET_POINT) + line;
}

function bulletPointLines(lines: string, indent: string): string {
  const transform = (line: string) => bulletPointLine(indent, line);
  return lines
    .split('\n')
    .filter((line) => line.trim().length > 0)
    .map(transform)
    .join('\n');
}

function numberedPoint(n: number): string {
  return `${n}. `;
}

function numberedLine(indent: string, line: string, num: number): { num: number; line: string } {
  return isPointedLine(line, indent)
    ? {
        num: num + 1,
        line: line.replace(BULLET_POINT, numberedPoint(num + 1)),
      }
    : {
        num: num,
        line: toSpaces(numberedPoint(num)) + line,
      };
}

function numberedLines(lines: string, indent: string): string {
  let num = 0;
  return lines
    .split('\n')
    .filter((line) => line.trim().length > 0)
    .map((line) => {
      const numbered = numberedLine(indent, line, num);
      num = numbered.num;
      return numbered.line;
    })
    .join('\n');
}

export function formatList(body: string, ordered: boolean, indent: string): string {
  body = body.trim();
  body = ordered ? numberedLines(body, indent) : bulletPointLines(body, indent);
  return body;
}

export function fixNestedLists(body: string, indent: string): string {
  const regex = new RegExp(`(\\S(?: |  )?)((?:${indent})+)(${POINT_REGEX}(?:.*)+)$`, 'gm');
  return body.replace(regex, `$1\n${indent}$2$3`);
}

export function indentLines(indent: string, text: string): string {
  return text.replace(/(^|\n)(.+)/g, `$1${indent}$2`);
}
