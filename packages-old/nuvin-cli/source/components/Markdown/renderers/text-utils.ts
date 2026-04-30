import stringWidth from 'string-width';

const HARD_RETURN = '\r';
const HARD_RETURN_RE = new RegExp(HARD_RETURN);
const TAB_ALLOWED_CHARACTERS = ['\t'];

export function identity(str: string): string {
  return str;
}

export function compose(...funcs: Array<(text: string) => string>): (text: string) => string {
  return (text: string): string => {
    let result = text;
    for (let i = funcs.length; i-- > 0; ) {
      result = funcs[i](result);
    }
    return result;
  };
}

export function escapeRegExp(str: string): string {
  return str.replace(/[-[\]/{}()*+?.\\^$|]/g, '\\$&');
}

export function unescapeEntities(html: string): string {
  return html
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

export function textLength(str: string): number {
  return stringWidth(str);
}

export function fixHardReturn(text: string, reflow: boolean): string {
  return reflow ? text.replace(HARD_RETURN_RE, '\n') : text;
}

function isAllowedTabString(string: string): boolean {
  return TAB_ALLOWED_CHARACTERS.some((char) => string.match(`^(${char})+$`));
}

export function sanitizeTab(tab: number | string, fallbackTab: number): string {
  if (typeof tab === 'number') {
    return new Array(tab + 1).join(' ');
  } else if (typeof tab === 'string' && isAllowedTabString(tab)) {
    return tab;
  } else {
    return new Array(fallbackTab + 1).join(' ');
  }
}
