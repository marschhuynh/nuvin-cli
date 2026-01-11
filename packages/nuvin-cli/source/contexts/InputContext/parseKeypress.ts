import type { Key, MouseEvent } from './types.js';

export type ParseResult = {
  input: string;
  key: Key;
};

export type MouseParseResult = {
  mouse: MouseEvent | null;
  consumed: boolean;
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

// biome-ignore lint/suspicious/noControlCharactersInRegex: Kitty keyboard protocol
const KITTY_CSI_U_RE = /^\x1b\[(\d+)(?:;(\d+))?u$/;

const KITTY_KEYCODE_MAP: Record<number, keyof Key> = {
  9: 'tab',
  13: 'return',
  27: 'escape',
  127: 'backspace',
};

function parseKittyProtocol(data: string): ParseResult | null {
  const match = KITTY_CSI_U_RE.exec(data);
  if (!match || !match[1]) return null;

  const keycode = parseInt(match[1], 10);
  const modifierValue = match[2] ? parseInt(match[2], 10) - 1 : 0;

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
    key.delete = true;
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

export function parseMouseEvent(data: string): MouseParseResult {
  const hasSgrMouse = data.includes('\x1b[<');
  const hasX10Mouse = data.startsWith('\x1b[M') && data.length >= 6;

  if (!hasSgrMouse && !hasX10Mouse) {
    return { mouse: null, consumed: false };
  }

  // biome-ignore lint/suspicious/noControlCharactersInRegex: ANSI escape sequence for mouse events
  const sgrRegex = /\x1b\[<(\d+);(\d+);(\d+)([Mm])/g;
  let wheelUpCount = 0;
  let wheelDownCount = 0;
  let lastMouse: MouseEvent | null = null;
  let lastX = 0;
  let lastY = 0;

  for (const match of data.matchAll(sgrRegex)) {
    const button = parseInt(match[1] ?? '0', 10);
    const x = parseInt(match[2] ?? '0', 10);
    const y = parseInt(match[3] ?? '0', 10);
    const isRelease = match[4] === 'm';
    lastX = x;
    lastY = y;

    if (button === 64) {
      wheelUpCount++;
    } else if (button === 65) {
      wheelDownCount++;
    } else if (button >= 32 && button < 64) {
      lastMouse = { type: 'drag', button: button - 32, x, y };
    } else if (isRelease) {
      lastMouse = { type: 'release', button, x, y };
    } else {
      lastMouse = { type: 'click', button, x, y };
    }
  }

  if (wheelUpCount > 0) {
    return { mouse: { type: 'wheel-up', button: 64, x: lastX, y: lastY, count: wheelUpCount }, consumed: true };
  }
  if (wheelDownCount > 0) {
    return { mouse: { type: 'wheel-down', button: 65, x: lastX, y: lastY, count: wheelDownCount }, consumed: true };
  }
  if (lastMouse) {
    return { mouse: lastMouse, consumed: true };
  }

  if (data.length >= 6 && data.startsWith('\x1b[M')) {
    const rawButton = data.charCodeAt(3) - 32;
    const x = data.charCodeAt(4) - 32;
    const y = data.charCodeAt(5) - 32;
    const button = rawButton & 3;

    if (rawButton === 64) return { mouse: { type: 'wheel-up', button: 64, x, y, count: 1 }, consumed: true };
    if (rawButton === 65) return { mouse: { type: 'wheel-down', button: 65, x, y, count: 1 }, consumed: true };
    if (rawButton & 32) return { mouse: { type: 'drag', button, x, y }, consumed: true };
    if (rawButton === 3) return { mouse: { type: 'release', button, x, y }, consumed: true };
    return { mouse: { type: 'click', button, x, y }, consumed: true };
  }

  return { mouse: null, consumed: false };
}
