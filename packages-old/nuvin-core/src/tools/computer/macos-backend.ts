import { spawn } from 'node:child_process';
import * as os from 'node:os';
import * as fs from 'node:fs';
import * as path from 'node:path';
import type {
  ComputerBackend,
  ClickButton,
  ScreenshotResult,
  ScreenSize,
  AXSnapshotResult,
  AXPressResult,
  AXSetValueResult,
  AXScrollResult,
  AXElement,
  AnnotateResult,
  HintMode,
} from './types.js';

// ─── Spawn wrapper ─────────────────────────────────────────────────────────

type ExecResult = {
  stdout: string;
  stderr: string;
  code: number | null;
};

function exec(command: string, args: string[], signal?: AbortSignal): Promise<ExecResult> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new Error('Aborted'));
      return;
    }

    const child = spawn(command, args, { stdio: ['ignore', 'pipe', 'pipe'] });

    const stdout: Buffer[] = [];
    const stderr: Buffer[] = [];

    child.stdout.on('data', (chunk: Buffer) => stdout.push(chunk));
    child.stderr.on('data', (chunk: Buffer) => stderr.push(chunk));

    let abortHandler: (() => void) | null = null;
    if (signal) {
      abortHandler = () => {
        child.kill('SIGTERM');
        reject(new Error('Aborted'));
      };
      signal.addEventListener('abort', abortHandler);
    }

    child.on('error', reject);
    child.on('close', (code) => {
      if (signal && abortHandler) {
        signal.removeEventListener('abort', abortHandler);
      }
      resolve({
        stdout: Buffer.concat(stdout).toString('utf8').trim(),
        stderr: Buffer.concat(stderr).toString('utf8').trim(),
        code,
      });
    });
  });
}

function execWithStdin(command: string, args: string[], stdin: string, signal?: AbortSignal): Promise<ExecResult> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new Error('Aborted'));
      return;
    }

    const child = spawn(command, args, { stdio: ['pipe', 'pipe', 'pipe'] });

    const stdout: Buffer[] = [];
    const stderr: Buffer[] = [];

    child.stdout.on('data', (chunk: Buffer) => stdout.push(chunk));
    child.stderr.on('data', (chunk: Buffer) => stderr.push(chunk));

    let abortHandler: (() => void) | null = null;
    if (signal) {
      abortHandler = () => {
        child.kill('SIGTERM');
        reject(new Error('Aborted'));
      };
      signal.addEventListener('abort', abortHandler);
    }

    child.on('error', reject);
    child.on('close', (code) => {
      if (signal && abortHandler) {
        signal.removeEventListener('abort', abortHandler);
      }
      resolve({
        stdout: Buffer.concat(stdout).toString('utf8').trim(),
        stderr: Buffer.concat(stderr).toString('utf8').trim(),
        code,
      });
    });

    child.stdin.write(stdin);
    child.stdin.end();
  });
}

// ─── Key translation ───────────────────────────────────────────────────────

// Map key names → macOS virtual key codes (for AppleScript `key code`)
const APPLESCRIPT_KEY_CODES: Record<string, number> = {
  Return: 36,
  return: 36,
  Enter: 76, // numpad enter
  enter: 76,
  Tab: 48,
  tab: 48,
  Escape: 53,
  escape: 53,
  esc: 53,
  Backspace: 51,
  backspace: 51,
  Delete: 51,
  delete: 51,
  'fwd-delete': 117,
  ForwardDelete: 117,
  Home: 115,
  home: 115,
  End: 119,
  end: 119,
  PageUp: 116,
  'page-up': 116,
  PageDown: 121,
  'page-down': 121,
  ArrowUp: 126,
  'arrow-up': 126,
  ArrowDown: 125,
  'arrow-down': 125,
  ArrowLeft: 123,
  'arrow-left': 123,
  ArrowRight: 124,
  'arrow-right': 124,
  Space: 49,
  space: 49,
  F1: 122, F2: 120, F3: 99, F4: 118, F5: 96, F6: 97,
  F7: 98, F8: 100, F9: 101, F10: 109, F11: 103, F12: 111,
  f1: 122, f2: 120, f3: 99, f4: 118, f5: 96, f6: 97,
  f7: 98, f8: 100, f9: 101, f10: 109, f11: 103, f12: 111,
};

// Map modifier names → AppleScript modifier syntax
function appleScriptModifier(mod: string): string {
  switch (mod.toLowerCase()) {
    case 'cmd': case 'command': case 'meta': return 'command down';
    case 'ctrl': case 'control': return 'control down';
    case 'alt': case 'option': return 'option down';
    case 'shift': return 'shift down';
    default: return `${mod.toLowerCase()} down`;
  }
}

// ─── Click argument builder ────────────────────────────────────────────────

function buildClickCommand(button: ClickButton, clickCount: number): string {
  if (button === 'right') return 'rc';
  if (button === 'middle') return 'mc';
  if (clickCount >= 3) return 'tc';
  if (clickCount === 2) return 'dc';
  return 'c';
}

// ─── cliclick availability cache ──────────────────────────────────────────

let cliclickAvailable: boolean | null = null;

async function ensureCliclick(): Promise<void> {
  if (cliclickAvailable === true) return;

  if (cliclickAvailable === null) {
    try {
      const result = await exec('which', ['cliclick']);
      cliclickAvailable = result.code === 0 && result.stdout.length > 0;
    } catch {
      cliclickAvailable = false;
    }
  }

  if (!cliclickAvailable) {
    throw new Error(
      'cliclick is not installed. Install it with: brew install cliclick\n' +
        'cliclick is required for mouse and keyboard automation on macOS.',
    );
  }
}

// ─── ax-helper path resolver ──────────────────────────────────────────────

const COMPUTER_DIR = path.join(os.homedir(), '.nuvin', 'computer');

function ensureComputerDir(): void {
  if (!fs.existsSync(COMPUTER_DIR)) {
    fs.mkdirSync(COMPUTER_DIR, { recursive: true });
  }
}

function getAxHelperPath(): string {
  const binPath = path.join(os.homedir(), '.nuvin', 'bin', 'ax-helper');
  if (!fs.existsSync(binPath)) {
    throw new Error(
      'ax-helper is not compiled. Run: /setup computer-use\n' +
      'ax-helper is required for accessibility-tree-based desktop automation.'
    );
  }
  return binPath;
}

// ─── MacOSBackend ──────────────────────────────────────────────────────────

export class MacOSBackend implements ComputerBackend {
  /** Set by the tool before each dispatch; backend methods use this for abort support. */
  signal?: AbortSignal;

  private run(command: string, args: string[]): Promise<ExecResult> {
    return exec(command, args, this.signal);
  }

  private runWithStdin(command: string, args: string[], stdin: string): Promise<ExecResult> {
    return execWithStdin(command, args, stdin, this.signal);
  }

  async screenshot(windowId?: number): Promise<ScreenshotResult> {
    ensureComputerDir();
    const tmpFile = path.join(COMPUTER_DIR, `screenshot-${Date.now()}.png`);

    try {
      const args = windowId !== undefined
        ? ['-x', '-o', '-l', String(windowId), tmpFile]
        : ['-x', '-C', tmpFile];
      const result = await this.run('screencapture', args);
      if (result.code !== 0) {
        throw new Error(`screencapture failed: ${result.stderr || result.stdout}`);
      }

      // Get actual captured image dimensions via sips
      const sipsInfo = await this.run('sips', ['-g', 'pixelWidth', '-g', 'pixelHeight', tmpFile]);
      let capturedWidth = 0;
      let capturedHeight = 0;
      if (sipsInfo.code === 0) {
        const wMatch = sipsInfo.stdout.match(/pixelWidth:\s*(\d+)/);
        const hMatch = sipsInfo.stdout.match(/pixelHeight:\s*(\d+)/);
        if (wMatch && hMatch) {
          capturedWidth = parseInt(wMatch[1], 10);
          capturedHeight = parseInt(hMatch[1], 10);
        }
      }

      // Resize to fit within LLM vision constraints:
      // - Max 1568px on longest edge
      // - Max ~1.15 megapixels total
      const MAX_LONG_EDGE = 1568;
      const MAX_PIXELS = 1_150_000;

      // scaleFactor converts LLM coordinates back to screen coordinates.
      // cliclick operates in logical points, and screencapture captures at
      // retina pixel density (2x on most Macs). So we need:
      //   screen_point = llm_coord * (captured_pixels / resized_pixels) / retina_scale
      // But since we don't know retina_scale reliably across multi-monitor,
      // we capture at whatever resolution screencapture gives, resize for the LLM,
      // and the scaleFactor = captured_pixels / resized_pixels.
      // The ComputerUseTool divides by retina separately using getScreenSize().
      let scaleFactor = 1.0;

      if (capturedWidth > 0 && capturedHeight > 0) {
        const longEdge = Math.max(capturedWidth, capturedHeight);
        const totalPixels = capturedWidth * capturedHeight;
        const longEdgeScale = MAX_LONG_EDGE / longEdge;
        const totalPixelScale = Math.sqrt(MAX_PIXELS / totalPixels);
        const scale = Math.min(1.0, longEdgeScale, totalPixelScale);

        if (scale < 1.0) {
          const origWidth = capturedWidth;
          const newWidth = Math.round(capturedWidth * scale);
          const newHeight = Math.round(capturedHeight * scale);
          await this.run('sips', ['--resampleWidth', String(newWidth), tmpFile, '--out', tmpFile]);
          capturedWidth = newWidth;
          capturedHeight = newHeight;
          scaleFactor = origWidth / newWidth;
        }
      }

      const data = fs.readFileSync(tmpFile).toString('base64');

      return {
        type: 'screenshot',
        data,
        mimeType: 'image/png',
        width: capturedWidth || 1440,
        height: capturedHeight || 900,
        scaleFactor,
      };
    } finally {
      // Keep screenshot in ~/.nuvin/computer/ for debugging
    }
  }

  async click(x: number, y: number, button: ClickButton, clickCount: number): Promise<void> {
    await ensureCliclick();
    const cmd = buildClickCommand(button, clickCount);
    await this.run('cliclick', [`${cmd}:${x},${y}`]);
  }

  async mouseMove(x: number, y: number): Promise<void> {
    await ensureCliclick();
    await this.run('cliclick', [`m:${x},${y}`]);
  }

  async clickDrag(startX: number, startY: number, endX: number, endY: number): Promise<void> {
    await ensureCliclick();
    await this.run('cliclick', [`dd:${startX},${startY}`, `du:${endX},${endY}`]);
  }

  async typeText(text: string): Promise<void> {
    // Two-path strategy for Unicode support:
    //
    // • ASCII-only text → cliclick `t:` (CGEventKeyboardSetUnicodeString).
    //   Note: CGEvents may not reach all apps (e.g. Raycast); this is accepted
    //   for the typing action. Newlines are injected via AppleScript key code 36.
    //
    // • Non-ASCII text (emoji, accented chars, CJK, etc.) → clipboard paste:
    //   write to clipboard via pbcopy, then simulate Cmd+V via AppleScript.
    //   cliclick `t:` cannot produce key codes for emoji (tested), so this is
    //   the only approach that supports full Unicode AND works in all apps.
    const isAsciiOnly = /^[ -~\t\n\r]*$/.test(text);

    if (!isAsciiOnly) {
      const pbcopyResult = await execWithStdin('pbcopy', [], text, this.signal);
      if (pbcopyResult.code !== 0) {
        throw new Error(`typeText (pbcopy) failed: ${pbcopyResult.stderr || pbcopyResult.stdout}`);
      }
      const pasteResult = await this.run('osascript', [
        '-e',
        'tell application "System Events" to keystroke "v" using {command down}',
      ]);
      if (pasteResult.code !== 0) {
        throw new Error(`typeText (paste) failed: ${pasteResult.stderr || pasteResult.stdout}`);
      }
      return;
    }

    // ASCII path: cliclick t:, splitting on \n to inject Return via AppleScript.
    await ensureCliclick();
    const lines = text.split('\n');
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].length > 0) {
        const result = await this.run('cliclick', [`t:${lines[i]}`]);
        if (result.code !== 0) {
          throw new Error(`typeText failed: ${result.stderr || result.stdout}`);
        }
      }
      if (i < lines.length - 1) {
        const returnResult = await this.run('osascript', [
          '-e',
          'tell application "System Events" to key code 36',
        ]);
        if (returnResult.code !== 0) {
          throw new Error(`typeText (Return) failed: ${returnResult.stderr || returnResult.stdout}`);
        }
      }
    }
  }

  async pressKey(key: string): Promise<void> {
    // Use AppleScript System Events for key presses — more reliable than cliclick
    // across different apps (e.g. Raycast doesn't respond to cliclick CGEvents).
    const parts = key.split('+');
    const mainKey = parts[parts.length - 1];
    const modifiers = parts.slice(0, -1);

    // Build the AppleScript key press
    const keyCode = APPLESCRIPT_KEY_CODES[mainKey] ?? APPLESCRIPT_KEY_CODES[mainKey.toLowerCase()];
    const modUsing = modifiers.length > 0
      ? ` using {${modifiers.map(appleScriptModifier).join(', ')}}`
      : '';

    let script: string;
    if (keyCode !== undefined) {
      // Special key — use key code
      script = `tell application "System Events" to key code ${keyCode}${modUsing}`;
    } else if (mainKey.length === 1) {
      // Single character — use keystroke
      script = `tell application "System Events" to keystroke "${mainKey}"${modUsing}`;
    } else {
      // Unknown key name — try keystroke as fallback
      script = `tell application "System Events" to keystroke "${mainKey.toLowerCase()}"${modUsing}`;
    }

    const result = await this.run('osascript', ['-e', script]);
    if (result.code !== 0) {
      throw new Error(`pressKey failed: ${result.stderr || result.stdout}`);
    }
  }

  async scroll(x: number, y: number, direction: 'up' | 'down' | 'left' | 'right', amount: number): Promise<void> {
    const axHelper = getAxHelperPath();
    const isVertical = direction === 'up' || direction === 'down';
    const sign = direction === 'up' || direction === 'left' ? -1 : 1;
    const delta = sign * amount;

    const args = isVertical
      ? ['scroll', '--x', String(x), '--y', String(y), '--dy', String(delta)]
      : ['scroll', '--x', String(x), '--y', String(y), '--dx', String(delta)];

    const result = await this.run(axHelper, args);
    if (result.code !== 0) {
      throw new Error(`scroll failed: ${result.stderr || result.stdout}`);
    }
  }

  async getScreenSize(): Promise<ScreenSize> {
    // Primary: AppleScript — asks Finder for the desktop window bounds
    try {
      const result = await this.run('osascript', [
        '-e',
        'tell application "Finder" to get bounds of window of desktop',
      ]);
      if (result.code === 0 && result.stdout) {
        const parts = result.stdout.split(',').map((s) => parseInt(s.trim(), 10));
        if (parts.length === 4 && parts.every((n) => !isNaN(n))) {
          // bounds = {left, top, right, bottom}
          const width = parts[2] - parts[0];
          const height = parts[3] - parts[1];
          if (width > 0 && height > 0) {
            return { width, height };
          }
        }
      }
    } catch {
      // fall through to system_profiler
    }

    // Fallback: system_profiler
    try {
      const result = await this.run('system_profiler', ['SPDisplaysDataType']);
      if (result.code === 0) {
        const match = result.stdout.match(/Resolution:\s*(\d+)\s*x\s*(\d+)/);
        if (match) {
          return { width: parseInt(match[1], 10), height: parseInt(match[2], 10) };
        }
      }
    } catch {
      // fall through to default
    }

    // Last-resort default (common MacBook resolution)
    return { width: 1440, height: 900 };
  }

  async activateApp(appName: string): Promise<void> {
    await this.run('osascript', ['-e', `tell application "${appName}" to activate`]);
    // Brief pause to let the app come to foreground
    await new Promise<void>((resolve) => setTimeout(resolve, 300));
  }

  async axSnapshot(appName?: string, maxDepth?: number, maxElements?: number, hintMode?: HintMode): Promise<AXSnapshotResult> {
    const axHelper = getAxHelperPath();
    const args = ['snapshot'];
    if (appName) args.push('--app', appName);
    if (maxDepth !== undefined) args.push('--max-depth', String(maxDepth));
    if (maxElements !== undefined) args.push('--max-elements', String(maxElements));
    if (hintMode) args.push('--hint-mode', hintMode);
    const result = await this.run(axHelper, args);
    if (result.code !== 0) {
      throw new Error(`ax-helper snapshot failed: ${result.stderr || result.stdout}`);
    }
    return JSON.parse(result.stdout) as AXSnapshotResult;
  }

  async axPress(ref: number, snapshotId: string, method: 'AXPress' | 'CGEvent' | 'auto' = 'auto'): Promise<AXPressResult> {
    const axHelper = getAxHelperPath();
    const args = ['press', '--ref', String(ref), '--snapshot-id', snapshotId];
    if (method !== 'auto') args.push('--method', method);
    const result = await this.run(axHelper, args);
    if (result.code !== 0) {
      throw new Error(`ax-helper press failed: ${result.stderr || result.stdout}`);
    }
    return JSON.parse(result.stdout) as AXPressResult;
  }

  async axSetValue(ref: number, snapshotId: string, value: string): Promise<AXSetValueResult> {
    const axHelper = getAxHelperPath();
    const result = await this.run(axHelper, ['set-value', '--ref', String(ref), '--snapshot-id', snapshotId, '--value', value]);
    if (result.code !== 0) {
      throw new Error(`ax-helper set-value failed: ${result.stderr || result.stdout}`);
    }
    return JSON.parse(result.stdout) as AXSetValueResult;
  }

  async axScroll(ref: number, snapshotId: string): Promise<AXScrollResult> {
    const axHelper = getAxHelperPath();
    const result = await this.run(axHelper, ['scroll', '--ref', String(ref), '--snapshot-id', snapshotId]);
    if (result.code !== 0) {
      throw new Error(`ax-helper scroll failed: ${result.stderr || result.stdout}`);
    }
    return JSON.parse(result.stdout) as AXScrollResult;
  }

  async listApps(): Promise<string[]> {
    const axHelper = getAxHelperPath();
    const result = await this.run(axHelper, ['list-apps']);
    if (result.code !== 0) {
      throw new Error(`ax-helper list-apps failed: ${result.stderr || result.stdout}`);
    }
    return JSON.parse(result.stdout) as string[];
  }

  async getWindowId(appName?: string): Promise<{ windowId: number; bounds: { x: number; y: number; width: number; height: number } }> {
    const axHelper = getAxHelperPath();
    const args = ['window-id'];
    if (appName) args.push('--app', appName);
    const result = await this.run(axHelper, args);
    if (result.code !== 0) {
      throw new Error(`ax-helper window-id failed: ${result.stderr || result.stdout}`);
    }
    const parsed = JSON.parse(result.stdout) as { windowId: number; bounds: { x: number; y: number; width: number; height: number } };
    return parsed;
  }

  async annotateScreenshot(
    elements: AXElement[],
    screenshotData: string,
    _screenshotWidth: number,
    _screenshotHeight: number,
    scaleFactor: number,
    windowOrigin?: { x: number; y: number },
  ): Promise<AnnotateResult> {
    const axHelper = getAxHelperPath();
    ensureComputerDir();
    const inputFile = path.join(COMPUTER_DIR, `annotate-in-${Date.now()}.png`);
    const outputFile = path.join(COMPUTER_DIR, `annotate-out-${Date.now()}.png`);

    try {
      // Write screenshot to temp file
      fs.writeFileSync(inputFile, Buffer.from(screenshotData, 'base64'));

      // Flatten AX tree to extract positioned leaf-actionable elements.
      // "Leaf actionable" = has actions but no descendant with actions.
      // This avoids parent containers overlapping their children.
      const hints: Array<{ ref: number; x: number; y: number; w: number; h: number }> = [];

      function hasActionableDescendant(el: AXElement): boolean {
        if (!el.children) return false;
        for (const child of el.children) {
          if ((child.act ?? child.actions) && (child.act ?? child.actions)!.length > 0) return true;
          if (hasActionableDescendant(child)) return true;
        }
        return false;
      }

      function collect(el: AXElement) {
        const acts = el.act ?? el.actions;
        const isActionable = acts && acts.length > 0;
        if (isActionable && el.ref !== undefined && el.pos && el.size && !hasActionableDescendant(el)) {
          const w = el.size[0];
          const h = el.size[1];
          if (w <= 0 || h <= 0) return; // Skip zero-size elements
          const x = el.pos[0] - (windowOrigin?.x ?? 0);
          const y = el.pos[1] - (windowOrigin?.y ?? 0);
          if (x + w <= 0 || y + h <= 0) return; // Skip fully off-screen (left/top)
          hints.push({ ref: el.ref, x, y, w, h });
          return; // no actionable descendants, skip recursion
        }
        if (el.children) {
          for (const child of el.children) {
            collect(child);
          }
        }
      }
      for (const el of elements) {
        collect(el);
      }

      // Pipe hints JSON to ax-helper annotate
      const hintsJson = JSON.stringify(hints);
      const result = await this.runWithStdin(
        axHelper,
        ['annotate', inputFile, outputFile, '--scale', String(scaleFactor)],
        hintsJson,
      );

      if (result.code !== 0) {
        throw new Error(`ax-helper annotate failed: ${result.stderr || result.stdout}`);
      }

      // Read annotated PNG
      const data = fs.readFileSync(outputFile).toString('base64');
      return { data, mimeType: 'image/png' };
    } finally {
      // Keep annotate files in ~/.nuvin/computer/ for debugging
    }
  }
}
