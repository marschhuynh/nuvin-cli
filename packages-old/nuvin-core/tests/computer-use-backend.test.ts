/**
 * Unit tests for MacOSBackend pure logic.
 *
 * `buildClickCommand` is a module-level unexported function. We test it
 * indirectly by mocking `child_process.spawn` so no real system calls happen,
 * then verifying exactly which cliclick arguments MacOSBackend constructs.
 *
 * `pressKey()` uses AppleScript via `osascript` — we verify the generated
 * AppleScript commands contain the correct key codes and modifier syntax.
 *
 * Also tests the ax-helper-based methods (axSnapshot, axPress, axSetValue,
 * listApps) by verifying spawn args and JSON parsing.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── ax-helper stdout registry ───────────────────────────────────────────────
//
// Declared early (before vi.mock factories) so the spawn mock closure can
// reference it. Tests can swap entries to control what JSON ax-helper returns.

const AX_SNAPSHOT_RESPONSE = JSON.stringify({
  snapshotId: 'snap-abc123',
  app: 'Finder',
  window: 'Finder',
  elements: [
    { ref: 1, role: 'button', title: 'Close', actions: ['AXPress'] },
    { ref: 2, role: 'textfield', desc: 'Search', value: '' },
  ],
});

const AX_PRESS_RESPONSE = JSON.stringify({ status: 'pressed', ref: 1, method: 'AXPress' });
const AX_SET_VALUE_RESPONSE = JSON.stringify({ status: 'set', ref: 3, value: 'hello' });
const AX_LIST_APPS_RESPONSE = JSON.stringify(['Arc', 'Finder', 'Notes']);
const AX_ANNOTATE_RESPONSE = JSON.stringify({ status: 'ok', hints: 2, output: '/tmp/test-output.png' });
const AX_WINDOW_ID_RESPONSE = JSON.stringify({ windowId: 12345, app: 'Finder', window: 'Documents', pid: 100 });

const axHelperStdoutMap: Record<string, string> = {
  snapshot: AX_SNAPSHOT_RESPONSE,
  press: AX_PRESS_RESPONSE,
  'set-value': AX_SET_VALUE_RESPONSE,
  'list-apps': AX_LIST_APPS_RESPONSE,
  annotate: AX_ANNOTATE_RESPONSE,
  'window-id': AX_WINDOW_ID_RESPONSE,
};

// ─── Spawn mock setup ───────────────────────────────────────────────────────
//
// We replace `child_process.spawn` before importing MacOSBackend so the
// module-level `exec` wrapper always calls our mock.
//
// The mock dispatches stdout data by subcommand name (first arg) for ax-helper
// calls, and returns a cliclick path for `which` checks.

type SpawnArgs = { command: string; args: string[] };
let capturedCalls: SpawnArgs[] = [];

vi.mock('node:child_process', () => {
  const spawn = vi.fn((_command: string, _args: string[]) => {
    capturedCalls.push({ command: _command, args: _args });

    const stdoutListeners: Array<(chunk: Buffer) => void> = [];
    const stderrListeners: Array<(chunk: Buffer) => void> = [];
    const closeListeners: Array<(code: number) => void> = [];

    const stdout = {
      on: vi.fn((event: string, cb: (chunk: Buffer) => void) => {
        if (event === 'data') stdoutListeners.push(cb);
      }),
    };
    const stderr = {
      on: vi.fn((event: string, cb: (chunk: Buffer) => void) => {
        if (event === 'data') stderrListeners.push(cb);
      }),
    };
    const child = {
      stdout,
      stderr,
      stdin: {
        write: vi.fn(),
        end: vi.fn(),
      },
      on: vi.fn((event: string, cb: (...args: unknown[]) => void) => {
        if (event === 'close') closeListeners.push(cb as (code: number) => void);
        if (event === 'error') {
          // no-op: we won't emit errors
        }
      }),
    };

    // Simulate async resolution: emit data + close on next tick
    setImmediate(() => {
      if (_command === 'which') {
        // Return a path so ensureCliclick is satisfied
        stdoutListeners.forEach((cb) => cb(Buffer.from('/usr/local/bin/cliclick')));
      } else if (_args[0] === 'snapshot' || _args[0] === 'press' || _args[0] === 'set-value' || _args[0] === 'list-apps' || _args[0] === 'annotate' || _args[0] === 'window-id') {
        // ax-helper subcommand: emit JSON from the registry
        const json = axHelperStdoutMap[_args[0]];
        if (json) stdoutListeners.forEach((cb) => cb(Buffer.from(json)));
      }
      closeListeners.forEach((cb) => cb(0));
    });

    return child;
  });
  return { spawn };
});

// ─── fs mock ─────────────────────────────────────────────────────────────────
//
// MacOSBackend.getAxHelperPath() calls fs.existsSync to check whether
// ax-helper is compiled. We mock it to always return true so tests don't
// depend on the binary actually being present.

vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs')>();
  return {
    ...actual,
    existsSync: vi.fn().mockReturnValue(true),
    readFileSync: actual.readFileSync,
    unlinkSync: actual.unlinkSync,
  };
});

// Import AFTER the mocks are set up
import { MacOSBackend } from '../src/tools/computer/macos-backend.js';

// ─── Helpers ────────────────────────────────────────────────────────────────

/** Get only the cliclick spawn calls (ignoring `which` checks). */
function cliclickCalls(): SpawnArgs[] {
  return capturedCalls.filter((c) => c.command === 'cliclick');
}

/** Last cliclick call's args array. */
function lastCliclickArgs(): string[] {
  const calls = cliclickCalls();
  expect(calls.length).toBeGreaterThan(0);
  return calls[calls.length - 1].args;
}

/** Get osascript spawn calls. */
function osascriptCalls(): SpawnArgs[] {
  return capturedCalls.filter((c) => c.command === 'osascript');
}

/** Last osascript call's -e script argument. */
function lastOsascriptScript(): string {
  const calls = osascriptCalls();
  expect(calls.length).toBeGreaterThan(0);
  const args = calls[calls.length - 1].args;
  const eIdx = args.indexOf('-e');
  expect(eIdx).toBeGreaterThanOrEqual(0);
  return args[eIdx + 1];
}

/** Get all ax-helper spawn calls (command is the resolved binary path). */
function axHelperCalls(): SpawnArgs[] {
  // ax-helper path ends with ax-helper; filter by first arg being an ax subcommand
  return capturedCalls.filter(
    (c) =>
      c.args[0] === 'snapshot' ||
      c.args[0] === 'press' ||
      c.args[0] === 'set-value' ||
      c.args[0] === 'list-apps' ||
      c.args[0] === 'annotate' ||
      c.args[0] === 'window-id',
  );
}

/** Last ax-helper call's args array. */
function lastAxHelperArgs(): string[] {
  const calls = axHelperCalls();
  expect(calls.length).toBeGreaterThan(0);
  return calls[calls.length - 1].args;
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('MacOSBackend — buildClickCommand (via click())', () => {
  let backend: MacOSBackend;

  beforeEach(() => {
    capturedCalls = [];
    backend = new MacOSBackend();
  });

  it('left button, clickCount=1 → "c:x,y"', async () => {
    await backend.click(100, 200, 'left', 1);
    expect(lastCliclickArgs()).toEqual(['c:100,200']);
  });

  it('left button, clickCount=2 → "dc:x,y" (double-click)', async () => {
    await backend.click(100, 200, 'left', 2);
    expect(lastCliclickArgs()).toEqual(['dc:100,200']);
  });

  it('left button, clickCount=3 → "tc:x,y" (triple-click)', async () => {
    await backend.click(100, 200, 'left', 3);
    expect(lastCliclickArgs()).toEqual(['tc:100,200']);
  });

  it('right button, clickCount=1 → "rc:x,y"', async () => {
    await backend.click(300, 400, 'right', 1);
    expect(lastCliclickArgs()).toEqual(['rc:300,400']);
  });

  it('middle button, clickCount=1 → "mc:x,y"', async () => {
    await backend.click(50, 75, 'middle', 1);
    expect(lastCliclickArgs()).toEqual(['mc:50,75']);
  });
});

describe('MacOSBackend — pressKey() special keys (AppleScript key code)', () => {
  let backend: MacOSBackend;

  beforeEach(() => {
    capturedCalls = [];
    backend = new MacOSBackend();
  });

  const keyCodeMappings: Array<[input: string, expectedCode: number]> = [
    ['Return', 36],
    ['Enter', 76],
    ['Escape', 53],
    ['Tab', 48],
    ['Backspace', 51],
    ['Delete', 51],
    ['Home', 115],
    ['End', 119],
    ['PageUp', 116],
    ['PageDown', 121],
    ['ArrowUp', 126],
    ['ArrowDown', 125],
    ['ArrowLeft', 123],
    ['ArrowRight', 124],
    ['Space', 49],
    ['F5', 96],
    ['F1', 122],
    ['F12', 111],
  ];

  for (const [input, code] of keyCodeMappings) {
    it(`"${input}" → key code ${code}`, async () => {
      capturedCalls = [];
      await backend.pressKey(input);
      expect(lastOsascriptScript()).toBe(
        `tell application "System Events" to key code ${code}`,
      );
    });
  }

  it('single character "a" → keystroke "a"', async () => {
    capturedCalls = [];
    await backend.pressKey('a');
    expect(lastOsascriptScript()).toBe(
      'tell application "System Events" to keystroke "a"',
    );
  });
});

describe('MacOSBackend — pressKey() key combos (AppleScript modifiers)', () => {
  let backend: MacOSBackend;

  beforeEach(() => {
    capturedCalls = [];
    backend = new MacOSBackend();
  });

  it('meta+s → keystroke "s" using {command down}', async () => {
    await backend.pressKey('meta+s');
    expect(lastOsascriptScript()).toBe(
      'tell application "System Events" to keystroke "s" using {command down}',
    );
  });

  it('option+s → keystroke "s" using {option down}', async () => {
    await backend.pressKey('option+s');
    expect(lastOsascriptScript()).toBe(
      'tell application "System Events" to keystroke "s" using {option down}',
    );
  });

  it('control+s → keystroke "s" using {control down}', async () => {
    await backend.pressKey('control+s');
    expect(lastOsascriptScript()).toBe(
      'tell application "System Events" to keystroke "s" using {control down}',
    );
  });

  it('command+z → keystroke "z" using {command down}', async () => {
    await backend.pressKey('command+z');
    expect(lastOsascriptScript()).toBe(
      'tell application "System Events" to keystroke "z" using {command down}',
    );
  });

  it('super modifier → falls back to "super down"', async () => {
    await backend.pressKey('super+t');
    expect(lastOsascriptScript()).toBe(
      'tell application "System Events" to keystroke "t" using {super down}',
    );
  });

  it('shift+Return → key code 36 using {shift down}', async () => {
    await backend.pressKey('shift+Return');
    expect(lastOsascriptScript()).toBe(
      'tell application "System Events" to key code 36 using {shift down}',
    );
  });

  it('ctrl+shift+t → keystroke "t" using {control down, shift down}', async () => {
    await backend.pressKey('ctrl+shift+t');
    expect(lastOsascriptScript()).toBe(
      'tell application "System Events" to keystroke "t" using {control down, shift down}',
    );
  });

  it('cmd+shift+4 → keystroke "4" using {command down, shift down}', async () => {
    await backend.pressKey('cmd+shift+4');
    expect(lastOsascriptScript()).toBe(
      'tell application "System Events" to keystroke "4" using {command down, shift down}',
    );
  });

  it('cmd+space → key code 49 using {command down}', async () => {
    await backend.pressKey('cmd+space');
    expect(lastOsascriptScript()).toBe(
      'tell application "System Events" to key code 49 using {command down}',
    );
  });
});

// ─── ax-helper method tests ───────────────────────────────────────────────────

describe('MacOSBackend — axSnapshot()', () => {
  let backend: MacOSBackend;

  beforeEach(() => {
    capturedCalls = [];
    backend = new MacOSBackend();
  });

  it('calls ax-helper with "snapshot" subcommand', async () => {
    await backend.axSnapshot();
    const args = lastAxHelperArgs();
    expect(args[0]).toBe('snapshot');
  });

  it('does not pass --app flag when no appName given', async () => {
    await backend.axSnapshot();
    expect(lastAxHelperArgs()).not.toContain('--app');
  });

  it('passes --app flag when appName is provided', async () => {
    await backend.axSnapshot('MyApp');
    const args = lastAxHelperArgs();
    expect(args).toContain('--app');
    expect(args[args.indexOf('--app') + 1]).toBe('MyApp');
  });

  it('parses and returns JSON from stdout', async () => {
    const result = await backend.axSnapshot();
    expect(result.snapshotId).toBe('snap-abc123');
    expect(result.app).toBe('Finder');
    expect(result.elements).toHaveLength(2);
    expect(result.elements[0].ref).toBe(1);
    expect(result.elements[0].role).toBe('button');
    expect(result.elements[0].title).toBe('Close');
  });
});

describe('MacOSBackend — axPress()', () => {
  let backend: MacOSBackend;

  beforeEach(() => {
    capturedCalls = [];
    backend = new MacOSBackend();
  });

  it('calls ax-helper with "press" subcommand and correct --ref and --snapshot-id flags', async () => {
    await backend.axPress(5, 'snapshot-id-xyz');
    const args = lastAxHelperArgs();
    expect(args[0]).toBe('press');
    expect(args).toContain('--ref');
    expect(args[args.indexOf('--ref') + 1]).toBe('5');
    expect(args).toContain('--snapshot-id');
    expect(args[args.indexOf('--snapshot-id') + 1]).toBe('snapshot-id-xyz');
  });

  it('parses and returns JSON from stdout', async () => {
    const result = await backend.axPress(1, 'snap-abc123');
    expect(result.status).toBe('pressed');
    expect(result.ref).toBe(1);
    expect(result.method).toBe('AXPress');
  });
});

describe('MacOSBackend — axSetValue()', () => {
  let backend: MacOSBackend;

  beforeEach(() => {
    capturedCalls = [];
    backend = new MacOSBackend();
  });

  it('calls ax-helper with "set-value" subcommand and correct flags', async () => {
    await backend.axSetValue(3, 'snapshot-id-xyz', 'hello');
    const args = lastAxHelperArgs();
    expect(args[0]).toBe('set-value');
    expect(args).toContain('--ref');
    expect(args[args.indexOf('--ref') + 1]).toBe('3');
    expect(args).toContain('--snapshot-id');
    expect(args[args.indexOf('--snapshot-id') + 1]).toBe('snapshot-id-xyz');
    expect(args).toContain('--value');
    expect(args[args.indexOf('--value') + 1]).toBe('hello');
  });

  it('parses and returns JSON from stdout', async () => {
    const result = await backend.axSetValue(3, 'snap-abc123', 'hello');
    expect(result.status).toBe('set');
    expect(result.ref).toBe(3);
    expect(result.value).toBe('hello');
  });
});

describe('MacOSBackend — listApps()', () => {
  let backend: MacOSBackend;

  beforeEach(() => {
    capturedCalls = [];
    backend = new MacOSBackend();
  });

  it('calls ax-helper with "list-apps" subcommand', async () => {
    await backend.listApps();
    const args = lastAxHelperArgs();
    expect(args[0]).toBe('list-apps');
  });

  it('parses and returns JSON array of app names from stdout', async () => {
    const result = await backend.listApps();
    expect(Array.isArray(result)).toBe(true);
    expect(result).toContain('Arc');
    expect(result).toContain('Finder');
    expect(result).toContain('Notes');
  });
});

// ─── axPress --method flag ────────────────────────────────────────────────────

describe('MacOSBackend — axPress() --method flag', () => {
  let backend: MacOSBackend;

  beforeEach(() => {
    capturedCalls = [];
    backend = new MacOSBackend();
  });

  it('omits --method flag when method is "auto" (default)', async () => {
    await backend.axPress(1, 'snap-abc123');
    const args = lastAxHelperArgs();
    expect(args).not.toContain('--method');
  });

  it('omits --method flag when method is explicitly "auto"', async () => {
    await backend.axPress(1, 'snap-abc123', 'auto');
    const args = lastAxHelperArgs();
    expect(args).not.toContain('--method');
  });

  it('passes --method AXPress when method is "AXPress"', async () => {
    await backend.axPress(1, 'snap-abc123', 'AXPress');
    const args = lastAxHelperArgs();
    expect(args).toContain('--method');
    expect(args[args.indexOf('--method') + 1]).toBe('AXPress');
  });

  it('passes --method CGEvent when method is "CGEvent"', async () => {
    await backend.axPress(1, 'snap-abc123', 'CGEvent');
    const args = lastAxHelperArgs();
    expect(args).toContain('--method');
    expect(args[args.indexOf('--method') + 1]).toBe('CGEvent');
  });

  it('returns parsed result for AXPress response', async () => {
    axHelperStdoutMap['press'] = JSON.stringify({ status: 'pressed', ref: 1, method: 'AXPress' });
    const result = await backend.axPress(1, 'snap-abc123', 'AXPress');
    expect(result.status).toBe('pressed');
    expect(result.method).toBe('AXPress');
    expect(result.ref).toBe(1);
  });

  it('returns parsed result for CGEvent response with coordinates', async () => {
    axHelperStdoutMap['press'] = JSON.stringify({ status: 'clicked', ref: 2, method: 'CGEvent', x: 100, y: 200 });
    const result = await backend.axPress(2, 'snap-abc123', 'CGEvent');
    expect(result.status).toBe('clicked');
    expect(result.method).toBe('CGEvent');
    expect(result.x).toBe(100);
    expect(result.y).toBe(200);
  });
});

// ─── rebuildRefMap stability ──────────────────────────────────────────────────
//
// The TypeScript side cannot run the Swift rebuildRefMap directly. These tests
// verify the contract that makes rebuildRefMap produce stable refs:
//   1. axPress passes the snapshot-id so Swift can reload meta and re-traverse
//      with the correct hintMode and pid.
//   2. The snapshot-id is threaded correctly from axSnapshot → axPress.
//   3. The --ref value passed to ax-helper matches what was returned in the snapshot.

describe('MacOSBackend — rebuildRefMap contract (snapshot-id threading)', () => {
  let backend: MacOSBackend;

  beforeEach(() => {
    capturedCalls = [];
    backend = new MacOSBackend();
    // Reset to default responses
    axHelperStdoutMap['snapshot'] = AX_SNAPSHOT_RESPONSE;
    axHelperStdoutMap['press'] = AX_PRESS_RESPONSE;
  });

  it('snapshot returns a snapshotId that is then passed to press --snapshot-id', async () => {
    const snapshot = await backend.axSnapshot('Finder');
    expect(snapshot.snapshotId).toBe('snap-abc123');

    await backend.axPress(1, snapshot.snapshotId);
    const pressArgs = lastAxHelperArgs();
    expect(pressArgs).toContain('--snapshot-id');
    expect(pressArgs[pressArgs.indexOf('--snapshot-id') + 1]).toBe('snap-abc123');
  });

  it('press passes the exact --ref value from the snapshot element', async () => {
    const snapshot = await backend.axSnapshot('Finder');
    const ref = snapshot.elements[0].ref; // ref 1 = Close button

    await backend.axPress(ref, snapshot.snapshotId);
    const pressArgs = lastAxHelperArgs();
    expect(pressArgs[pressArgs.indexOf('--ref') + 1]).toBe(String(ref));
  });

  it('each snapshot call produces its own snapshotId for isolation', async () => {
    axHelperStdoutMap['snapshot'] = JSON.stringify({ snapshotId: 'snap-first', app: 'Finder', window: 'Finder', elements: [] });
    const first = await backend.axSnapshot('Finder');

    axHelperStdoutMap['snapshot'] = JSON.stringify({ snapshotId: 'snap-second', app: 'Safari', window: 'Safari', elements: [] });
    const second = await backend.axSnapshot('Safari');

    expect(first.snapshotId).toBe('snap-first');
    expect(second.snapshotId).toBe('snap-second');
    expect(first.snapshotId).not.toBe(second.snapshotId);
  });

  it('press with a stale snapshotId still passes it through (Swift handles the error)', async () => {
    // TypeScript does not validate snapshotId existence — that is Swift's job.
    // We just verify the ID is forwarded as-is.
    await backend.axPress(1, 'stale-snapshot-id-999');
    const args = lastAxHelperArgs();
    expect(args[args.indexOf('--snapshot-id') + 1]).toBe('stale-snapshot-id-999');
  });

  it('set-value also threads the snapshotId correctly', async () => {
    const snapshot = await backend.axSnapshot('Finder');
    await backend.axSetValue(2, snapshot.snapshotId, 'test value');
    const args = lastAxHelperArgs();
    expect(args[args.indexOf('--snapshot-id') + 1]).toBe(snapshot.snapshotId);
    expect(args[args.indexOf('--value') + 1]).toBe('test value');
  });
});
