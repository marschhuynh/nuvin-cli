import type { Key, MouseEvent } from './types.js';

export type ParseResult = {
  input: string;
  key: Key;
};

export type MouseParseResult = {
  mouse: MouseEvent | null;
  consumed: boolean;
  /** Individual mouse events when multiple non-wheel events arrive in one chunk */
  events?: MouseEvent[];
  /** Non-mouse data that was interleaved — must be dispatched to keyboard pipeline */
  unconsumed?: string;
  /** Incomplete trailing escape sequence — must be preserved as decoder remainder */
  remainder?: string;
};

let kittyProtocolEnabled = false;

export function setKittyProtocolEnabled(enabled: boolean): void {
  kittyProtocolEnabled = enabled;
}

export function isKittyProtocolEnabled(): boolean {
  return kittyProtocolEnabled;
}

const createEmptyKey = (): Key => ({
  upArrow: false,
  downArrow: false,
  leftArrow: false,
  rightArrow: false,
  pageDown: false,
  pageUp: false,
  home: false,
  end: false,
  return: false,
  escape: false,
  ctrl: false,
  shift: false,
  tab: false,
  backspace: false,
  delete: false,
  meta: false,
});

const keyName: Record<string, string> = {
  OP: 'f1',
  OQ: 'f2',
  OR: 'f3',
  OS: 'f4',
  '[11~': 'f1',
  '[12~': 'f2',
  '[13~': 'f3',
  '[14~': 'f4',
  '[[A': 'f1',
  '[[B': 'f2',
  '[[C': 'f3',
  '[[D': 'f4',
  '[[E': 'f5',
  '[15~': 'f5',
  '[17~': 'f6',
  '[18~': 'f7',
  '[19~': 'f8',
  '[20~': 'f9',
  '[21~': 'f10',
  '[23~': 'f11',
  '[24~': 'f12',
  '[A': 'up',
  '[B': 'down',
  '[C': 'right',
  '[D': 'left',
  '[E': 'clear',
  '[F': 'end',
  '[H': 'home',
  OA: 'up',
  OB: 'down',
  OC: 'right',
  OD: 'left',
  OE: 'clear',
  OF: 'end',
  OH: 'home',
  '[1~': 'home',
  '[2~': 'insert',
  '[3~': 'delete',
  '[4~': 'end',
  '[5~': 'pageup',
  '[6~': 'pagedown',
  '[[5~': 'pageup',
  '[[6~': 'pagedown',
  '[7~': 'home',
  '[8~': 'end',
  '[a': 'up',
  '[b': 'down',
  '[c': 'right',
  '[d': 'left',
  '[e': 'clear',
  '[2$': 'insert',
  '[3$': 'delete',
  '[5$': 'pageup',
  '[6$': 'pagedown',
  '[7$': 'home',
  '[8$': 'end',
  Oa: 'up',
  Ob: 'down',
  Oc: 'right',
  Od: 'left',
  Oe: 'clear',
  '[2^': 'insert',
  '[3^': 'delete',
  '[5^': 'pageup',
  '[6^': 'pagedown',
  '[7^': 'home',
  '[8^': 'end',
  '[Z': 'tab',
};

export const nonAlphanumericKeys = [...Object.values(keyName), 'backspace', 'return'];

const isShiftKey = (code: string) => {
  return ['[a', '[b', '[c', '[d', '[e', '[2$', '[3$', '[5$', '[6$', '[7$', '[8$', '[Z'].includes(code);
};

const isCtrlKey = (code: string) => {
  return ['Oa', 'Ob', 'Oc', 'Od', 'Oe', '[2^', '[3^', '[5^', '[6^', '[7^', '[8^'].includes(code);
};

// biome-ignore lint/suspicious/noControlCharactersInRegex: ANSI escape sequence parsing
const metaKeyCodeRe = /^(?:\x1b)([a-zA-Z0-9])$/;
// biome-ignore lint/suspicious/noControlCharactersInRegex: ANSI escape sequence parsing
const fnKeyRe = /^(?:\x1b+)(O|N|\[|\[\[)(?:(\d+)(?:;(\d+))?([~^$])|(?:1;)?(\d+)?([a-zA-Z]))/;

const KITTY_KEYCODE_MAP: Record<number, keyof Key> = {
  8: 'backspace',
  9: 'tab',
  13: 'return',
  27: 'escape',
  127: 'backspace',
};

function parseKittyProtocol(data: string): ParseResult | null {
  if (!data.startsWith('\x1b[') || !data.endsWith('u')) {
    return null;
  }

  // Kitty CSI-u: ESC [ <keycode> [; <modifiers> [:<event-type>]] [; ...] u
  // We only need keycode + modifiers; extra fields are ignored.
  const payload = data.slice(2, -1);
  const segments = payload.split(';');
  const keycodeSegment = segments[0];
  if (!keycodeSegment) return null;

  const keycode = Number.parseInt(keycodeSegment.split(':')[0] ?? '', 10);
  if (Number.isNaN(keycode)) return null;

  const modifierSegment = segments[1];
  const modifierToken = modifierSegment?.split(':')[0];
  const modifierValue = modifierToken ? Number.parseInt(modifierToken, 10) - 1 : 0;

  const key = createEmptyKey();

  key.shift = !!(modifierValue & 1);
  key.meta = !!(modifierValue & 2);
  key.ctrl = !!(modifierValue & 4);

  const keyProp = KITTY_KEYCODE_MAP[keycode];
  if (keyProp) {
    key[keyProp] = true;
  }

  // Shift+Enter -> newline character (for multiline input)
  if (keycode === 13 && key.shift) {
    return { input: '\n', key: createEmptyKey() };
  }

  let input = '';
  if (keycode >= 32 && keycode <= 126) {
    input = String.fromCharCode(keycode);
  }

  return { input, key };
}

export const parseKeypress = (data: string): ParseResult => {
  if (kittyProtocolEnabled) {
    const kittyResult = parseKittyProtocol(data);
    if (kittyResult) return kittyResult;
  }

  let parts: RegExpExecArray | null;
  const s = data;

  const key = createEmptyKey();

  if (s === '\r') {
    key.return = true;
    return { input: '', key };
  } else if (s === '\n') {
    return { input: '\n', key };
  } else if (s === '\t') {
    key.tab = true;
    return { input: '', key };
  } else if (s === '\b' || s === '\x1b\b') {
    key.backspace = true;
    key.meta = s.charAt(0) === '\x1b';
    return { input: '', key };
  } else if (s === '\x7f' || s === '\x1b\x7f') {
    key.backspace = true;
    key.meta = s.charAt(0) === '\x1b';
    return { input: '', key };
  } else if (s === '\x1b' || s === '\x1b\x1b') {
    key.escape = true;
    key.meta = s.length === 2;
    return { input: '', key };
  } else if (s === ' ' || s === '\x1b ') {
    key.meta = s.length === 2;
    return { input: ' ', key };
  } else if (s.length === 1 && s <= '\x1a') {
    key.ctrl = true;
    const name = String.fromCharCode(s.charCodeAt(0) + 'a'.charCodeAt(0) - 1);
    return { input: name, key };
  } else if (s.length === 1 && s >= '0' && s <= '9') {
    return { input: s, key };
  } else if (s.length === 1 && s >= 'a' && s <= 'z') {
    return { input: s, key };
  } else if (s.length === 1 && s >= 'A' && s <= 'Z') {
    key.shift = true;
    return { input: s, key };
  }

  parts = metaKeyCodeRe.exec(s);
  if (parts) {
    key.meta = true;
    key.shift = /^[A-Z]$/.test(parts[1] ?? '');
    return { input: parts[1] ?? '', key };
  }

  if (s.startsWith('\x1b[200~') || s.startsWith('[200~')) {
    return { input: data, key };
  }

  // Pass through paste end markers so the paste handler can detect them
  if (s.startsWith('\x1b[201~') || s.startsWith('[201~')) {
    return { input: data, key };
  }

  parts = fnKeyRe.exec(s);
  if (parts) {
    const segs = [...s];

    if (segs[0] === '\u001b' && segs[1] === '\u001b') {
      key.meta = true;
    }

    const code = [parts[1], parts[2], parts[4], parts[6]].filter(Boolean).join('');
    const modifier = ((parts[3] || parts[5] || 1) as unknown as number) - 1;

    key.ctrl = !!(modifier & 4);
    key.meta = key.meta || !!(modifier & 10);
    key.shift = !!(modifier & 1);

    const name = keyName[code] || '';
    key.shift = isShiftKey(code) || key.shift;
    key.ctrl = isCtrlKey(code) || key.ctrl;

    if (name === 'up') key.upArrow = true;
    else if (name === 'down') key.downArrow = true;
    else if (name === 'left') key.leftArrow = true;
    else if (name === 'right') key.rightArrow = true;
    else if (name === 'pageup') key.pageUp = true;
    else if (name === 'pagedown') key.pageDown = true;
    else if (name === 'home') key.home = true;
    else if (name === 'end') key.end = true;
    else if (name === 'return') key.return = true;
    else if (name === 'escape') key.escape = true;
    else if (name === 'tab') key.tab = true;
    else if (name === 'backspace') key.backspace = true;
    else if (name === 'delete') key.delete = true;

    const input = key.ctrl ? name : '';
    return { input, key };
  }

  return { input: data, key: createEmptyKey() };
};

/**
 * Split a raw stdin chunk into individual keypress strings.
 * When keys are held down rapidly, the terminal may deliver multiple
 * escape sequences in a single read. This function splits them so
 * each can be parsed independently by parseKeypress.
 */
// biome-ignore lint/suspicious/noControlCharactersInRegex: ANSI escape sequence splitting
const ESC_SEQ_RE = /\x1b(?:\[[^\x1b]*|\]8;[^\x1b]*|O[A-Za-z]|[a-zA-Z0-9])/g;

export function splitInputChunks(data: string): string[] {
  // Short-circuit: single character or simple single-escape-sequence chunks
  if (data.length <= 1) return [data];

  // Bracketed paste — never split
  if (data.includes('[200~') || data.includes('[201~')) return [data];

  // If it doesn't contain ESC, check for control characters that need splitting.
  // When keys like backspace (\x7f) are held, the terminal sends multiple bytes in
  // one chunk (e.g., "\x7f\x7f\x7f"). These must be split so each is parsed as a
  // separate keypress, otherwise they get misinterpreted as text input.
  if (!data.includes('\x1b')) {
    // Fast path: if all chars are printable (>= space, not DEL), no splitting needed
    let hasControl = false;
    for (let i = 0; i < data.length; i++) {
      const code = data.charCodeAt(i);
      if (code < 0x20 || code === 0x7f) {
        hasControl = true;
        break;
      }
    }
    if (!hasControl) return [data];

    // IME pattern: backspace(s) followed by replacement character(s).
    // IMEs (e.g. Vietnamese Telex/VNI) send \x7f + replacement chars in a single
    // chunk. Keep it atomic so TextInput can process it as one operation.
    const stripped = data.replace(/\x7f/g, '');
    if (stripped.length > 0 && !stripped.includes('\x00')) {
      let onlyBackspaceAndPrintable = true;
      for (let i = 0; i < stripped.length; i++) {
        const code = stripped.charCodeAt(i);
        if (code < 0x20) {
          onlyBackspaceAndPrintable = false;
          break;
        }
      }
      if (onlyBackspaceAndPrintable) return [data];
    }

    // Split: each character becomes its own chunk
    const results: string[] = [];
    for (const ch of data) {
      results.push(ch);
    }
    return results;
  }

  const results: string[] = [];
  let lastIndex = 0;

  for (const match of data.matchAll(ESC_SEQ_RE)) {
    // Any plain text before this escape sequence
    if (match.index > lastIndex) {
      const plain = data.slice(lastIndex, match.index);
      for (const ch of plain) {
        results.push(ch);
      }
    }
    results.push(match[0]);
    lastIndex = match.index + match[0].length;
  }

  // Any remaining text after the last escape sequence
  if (lastIndex < data.length) {
    const remaining = data.slice(lastIndex);
    for (const ch of remaining) {
      results.push(ch);
    }
  }

  return results.length > 0 ? results : [data];
}

function isIncompleteEscapeChunk(chunk: string): boolean {
  if (!chunk.startsWith('\x1b')) {
    return false;
  }

  if (chunk === '\x1b') {
    return true;
  }

  if (chunk.startsWith('\x1b[')) {
    // Complete CSI forms we support
    // biome-ignore lint/suspicious/noControlCharactersInRegex: ESC is intentional in terminal parsing
    if (/^\x1b\[[0-9:;]+u$/.test(chunk)) return false; // Kitty CSI-u
    // biome-ignore lint/suspicious/noControlCharactersInRegex: ESC is intentional in terminal parsing
    if (/^\x1b\[\d+(?:;\d+)?[~^$]$/.test(chunk)) return false; // fn/edit keys
    // biome-ignore lint/suspicious/noControlCharactersInRegex: ESC is intentional in terminal parsing
    if (/^\x1b\[(?:1;)?\d?[a-zA-Z]$/.test(chunk)) return false; // arrows/home/end variants
    // biome-ignore lint/suspicious/noControlCharactersInRegex: ESC is intentional in terminal parsing
    if (/^\x1b\[<\d+;\d+;\d+[Mm]$/.test(chunk)) return false; // SGR mouse
    if (chunk.startsWith('\x1b[200~') || chunk.startsWith('\x1b[201~')) return false; // paste markers
    return true;
  }

  if (chunk.startsWith('\x1bO')) {
    // biome-ignore lint/suspicious/noControlCharactersInRegex: ESC is intentional in terminal parsing
    return !/^\x1bO[a-zA-Z]$/.test(chunk);
  }

  if (chunk.startsWith('\x1b]')) {
    // OSC sequences terminate with BEL or ST (ESC \)
    return !(chunk.includes('\x07') || chunk.endsWith('\x1b\\'));
  }

  // Meta-key sequences are usually exactly two bytes: ESC + char
  return chunk.length === 1;
}

export function splitInputChunksWithRemainder(data: string): { chunks: string[]; remainder: string } {
  const chunks = splitInputChunks(data);
  if (chunks.length === 0) {
    return { chunks, remainder: '' };
  }

  const lastChunk = chunks[chunks.length - 1] ?? '';
  if (!isIncompleteEscapeChunk(lastChunk)) {
    return { chunks, remainder: '' };
  }

  return {
    chunks: chunks.slice(0, -1),
    remainder: lastChunk,
  };
}

export function parseMouseEvent(data: string): MouseParseResult {
  const hasSgrMouse = data.includes('\x1b[<');
  const hasX10Mouse = data.startsWith('\x1b[M') && data.length >= 6;

  if (!hasSgrMouse && !hasX10Mouse) {
    return { mouse: null, consumed: false };
  }

  // SGR mouse parsing
  if (hasSgrMouse) {
    // biome-ignore lint/suspicious/noControlCharactersInRegex: ANSI escape sequence for mouse events
    const sgrRegex = /\x1b\[<(\d+);(\d+);(\d+)([Mm])/g;
    const allMatches: Array<{ match: RegExpExecArray; event: MouseEvent }> = [];
    let wheelUpCount = 0;
    let wheelDownCount = 0;
    let lastX = 0;
    let lastY = 0;

    for (const match of data.matchAll(sgrRegex)) {
      const button = parseInt(match[1] ?? '0', 10);
      const x = parseInt(match[2] ?? '0', 10);
      const y = parseInt(match[3] ?? '0', 10);
      const isRelease = match[4] === 'm';
      lastX = x;
      lastY = y;

      let event: MouseEvent;
      if (button === 64) {
        wheelUpCount++;
        event = { type: 'wheel-up', button: 64, x, y, count: 1 };
      } else if (button === 65) {
        wheelDownCount++;
        event = { type: 'wheel-down', button: 65, x, y, count: 1 };
      } else if (button === 35) {
        event = { type: 'move', button: 0, x, y };
      } else if (button >= 32 && button < 64) {
        event = { type: 'drag', button: button - 32, x, y };
      } else if (isRelease) {
        event = { type: 'release', button, x, y };
      } else {
        event = { type: 'click', button, x, y };
      }

      allMatches.push({ match: match as RegExpExecArray, event });
    }

    if (allMatches.length === 0) {
      return { mouse: null, consumed: false };
    }

    // Collect non-mouse gaps between matches
    const unconsumedParts: string[] = [];
    let lastEnd = 0;
    for (const { match } of allMatches) {
      if (match.index > lastEnd) {
        unconsumedParts.push(data.slice(lastEnd, match.index));
      }
      lastEnd = match.index + match[0].length;
    }

    // Check trailing data after last match
    let remainder: string | undefined;
    if (lastEnd < data.length) {
      const trailing = data.slice(lastEnd);
      if (trailing.includes('\x1b')) {
        remainder = trailing;
      } else {
        unconsumedParts.push(trailing);
      }
    }

    const unconsumed = unconsumedParts.join('') || undefined;
    const events = allMatches.map(m => m.event);

    // Determine primary mouse event (backwards compat)
    let mouse: MouseEvent;
    if (wheelUpCount > 0) {
      mouse = { type: 'wheel-up', button: 64, x: lastX, y: lastY, count: wheelUpCount };
    } else if (wheelDownCount > 0) {
      mouse = { type: 'wheel-down', button: 65, x: lastX, y: lastY, count: wheelDownCount };
    } else {
      mouse = events[events.length - 1] ?? events[0];
    }

    return { mouse, consumed: true, events, unconsumed, remainder };
  }

  // X10 mouse fallback
  if (data.length >= 6 && data.startsWith('\x1b[M')) {
    const rawButton = data.charCodeAt(3) - 32;
    const x = data.charCodeAt(4) - 32;
    const y = data.charCodeAt(5) - 32;
    const button = rawButton & 3;

    let event: MouseEvent;
    if (rawButton === 64) event = { type: 'wheel-up', button: 64, x, y, count: 1 };
    else if (rawButton === 65) event = { type: 'wheel-down', button: 65, x, y, count: 1 };
    else if (rawButton & 32) event = { type: 'drag', button, x, y };
    else if (rawButton === 3) event = { type: 'release', button, x, y };
    else event = { type: 'click', button, x, y };

    const remainder = data.length > 6 ? data.slice(6) : undefined;
    return { mouse: event, consumed: true, events: [event], remainder };
  }

  return { mouse: null, consumed: false };
}
