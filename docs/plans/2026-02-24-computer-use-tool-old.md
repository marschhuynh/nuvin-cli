# Computer Use Tool Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a built-in `computer` tool that provides full desktop automation — screenshots, mouse control, keyboard input, scrolling, and window management — matching Anthropic's `computer_use` tool spec, powered by macOS native CLI tools.

**Architecture:** A single `computer` tool with an `action` parameter dispatches to a macOS-native backend that shells out to `screencapture` (screenshots), `cliclick` (mouse/keyboard), and `osascript` (window management). Screenshots return as `mixed` type results with base64 `ImageContentPart`, which the orchestrator already handles for LLM vision. The tool follows the existing `FunctionTool` pattern (like `BashTool`) and registers in `ToolRegistry`.

**Tech Stack:** Node.js child_process (`spawn`), macOS native tools (`screencapture`, `cliclick`, `osascript`), base64 image encoding. Zero npm dependencies.

**Key Design Decisions:**
- **Single tool, action-based** — mirrors Anthropic's `computer_use` pattern: one tool named `computer` with `action` field
- **macOS-only for v1** — uses native CLI tools; cross-platform can be added later via a backend abstraction
- **`cliclick` for mouse/keyboard** — lightweight, Homebrew-installable macOS CLI for mouse moves, clicks, and key presses
- **`screencapture` for screenshots** — built-in macOS command, outputs PNG to temp file, read as base64
- **`osascript` for window management** — AppleScript via CLI for listing/focusing windows
- **Mixed result type for screenshots** — returns `ImageContentPart` so the LLM receives the image directly via vision

---

## Task 1: Types and macOS Backend

**Files:**
- Create: `packages/nuvin-core/src/tools/computer/types.ts`
- Create: `packages/nuvin-core/src/tools/computer/macos-backend.ts`
- Test: `packages/nuvin-core/tests/computer-use-backend.test.ts`

### Step 1: Create action type definitions

Create `packages/nuvin-core/src/tools/computer/types.ts`:

```typescript
/**
 * Computer use tool action types.
 * Mirrors Anthropic's computer_20250124 action set.
 */

export type Coordinate = [x: number, y: number];

export type ScreenshotAction = { action: 'screenshot' };

export type LeftClickAction = { action: 'left_click'; coordinate: Coordinate };
export type RightClickAction = { action: 'right_click'; coordinate: Coordinate };
export type MiddleClickAction = { action: 'middle_click'; coordinate: Coordinate };
export type DoubleClickAction = { action: 'double_click'; coordinate: Coordinate };
export type TripleClickAction = { action: 'triple_click'; coordinate: Coordinate };
export type MouseMoveAction = { action: 'mouse_move'; coordinate: Coordinate };

export type LeftClickDragAction = {
  action: 'left_click_drag';
  coordinate: Coordinate;       // end position
  start_coordinate: Coordinate; // start position
};

export type TypeAction = { action: 'type'; text: string };
export type KeyAction = { action: 'key'; key: string };

export type ScrollAction = {
  action: 'scroll';
  coordinate: Coordinate;
  direction: 'up' | 'down' | 'left' | 'right';
  amount: number;
};

export type WaitAction = { action: 'wait'; duration: number };

export type ComputerAction =
  | ScreenshotAction
  | LeftClickAction
  | RightClickAction
  | MiddleClickAction
  | DoubleClickAction
  | TripleClickAction
  | MouseMoveAction
  | LeftClickDragAction
  | TypeAction
  | KeyAction
  | ScrollAction
  | WaitAction;

export type ScreenshotResult = {
  type: 'screenshot';
  base64: string;
  mimeType: 'image/png';
  width: number;
  height: number;
};

export type TextResult = {
  type: 'text';
  message: string;
};

export type ComputerActionResult = ScreenshotResult | TextResult;

/**
 * Backend interface — abstracts platform-specific automation.
 * Only macOS is implemented in v1.
 */
export interface ComputerBackend {
  screenshot(): Promise<ScreenshotResult>;
  click(x: number, y: number, button: 'left' | 'right' | 'middle', clickCount: number): Promise<void>;
  mouseMove(x: number, y: number): Promise<void>;
  clickDrag(startX: number, startY: number, endX: number, endY: number): Promise<void>;
  typeText(text: string): Promise<void>;
  pressKey(key: string): Promise<void>;
  scroll(x: number, y: number, direction: 'up' | 'down' | 'left' | 'right', amount: number): Promise<void>;
  getScreenSize(): Promise<{ width: number; height: number }>;
}
```

### Step 2: Create macOS backend

Create `packages/nuvin-core/src/tools/computer/macos-backend.ts`:

```typescript
import { spawn } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import type { ComputerBackend, ScreenshotResult } from './types.js';

/**
 * macOS-native computer automation backend.
 *
 * Uses:
 * - `screencapture` (built-in) for screenshots
 * - `cliclick` (Homebrew) for mouse/keyboard
 * - `osascript` for screen size queries
 */
export class MacOSBackend implements ComputerBackend {
  private cachedScreenSize: { width: number; height: number } | null = null;

  async screenshot(): Promise<ScreenshotResult> {
    const tmpFile = path.join(os.tmpdir(), `nuvin-screenshot-${Date.now()}.png`);
    try {
      await this.exec('screencapture', ['-x', '-C', tmpFile]);
      const buffer = await fs.promises.readFile(tmpFile);
      const base64 = buffer.toString('base64');
      const size = await this.getScreenSize();
      return {
        type: 'screenshot',
        base64,
        mimeType: 'image/png',
        width: size.width,
        height: size.height,
      };
    } finally {
      // Clean up temp file
      fs.promises.unlink(tmpFile).catch(() => {});
    }
  }

  async click(x: number, y: number, button: 'left' | 'right' | 'middle', clickCount: number): Promise<void> {
    const args = this.buildClickArgs(x, y, button, clickCount);
    await this.exec('cliclick', args);
  }

  async mouseMove(x: number, y: number): Promise<void> {
    await this.exec('cliclick', [`m:${x},${y}`]);
  }

  async clickDrag(startX: number, startY: number, endX: number, endY: number): Promise<void> {
    await this.exec('cliclick', [`dd:${startX},${startY}`, `du:${endX},${endY}`]);
  }

  async typeText(text: string): Promise<void> {
    // cliclick `t:` types text. Need to escape special chars.
    await this.exec('cliclick', [`t:${text}`]);
  }

  async pressKey(key: string): Promise<void> {
    // Convert Anthropic key format (e.g., "ctrl+s", "Return") to cliclick format
    const cliclickKey = this.translateKey(key);
    await this.exec('cliclick', [`kp:${cliclickKey}`]);
  }

  async scroll(x: number, y: number, direction: 'up' | 'down' | 'left' | 'right', amount: number): Promise<void> {
    // Move mouse to position first, then scroll
    await this.mouseMove(x, y);

    // cliclick doesn't support horizontal scroll natively.
    // For vertical: use osascript with scroll wheel events.
    const scrollAmount = direction === 'up' || direction === 'left' ? amount : -amount;
    const axis = direction === 'left' || direction === 'right' ? 'horizontal' : 'vertical';

    if (axis === 'vertical') {
      // Use cliclick scroll (positive = up, negative = down in cliclick)
      // cliclick doesn't have scroll, so use osascript
      const lines = Math.abs(scrollAmount);
      const deltaY = direction === 'up' ? lines : -lines;
      await this.execAppleScript(
        `tell application "System Events" to scroll area 1 of (first process whose frontmost is true) to {0, ${deltaY}}`
      );
    } else {
      // Horizontal scroll via osascript
      const deltaX = direction === 'left' ? -amount : amount;
      await this.execAppleScript(
        `tell application "System Events" to scroll area 1 of (first process whose frontmost is true) to {${deltaX}, 0}`
      );
    }
  }

  async getScreenSize(): Promise<{ width: number; height: number }> {
    if (this.cachedScreenSize) return this.cachedScreenSize;

    const script = 'tell application "Finder" to get bounds of window of desktop';
    const output = await this.execAppleScript(script);
    // Output format: "0, 0, 1920, 1080"
    const parts = output.trim().split(',').map((s) => parseInt(s.trim(), 10));
    if (parts.length >= 4) {
      this.cachedScreenSize = { width: parts[2]!, height: parts[3]! };
      return this.cachedScreenSize;
    }

    // Fallback: use system_profiler
    const profilerOutput = await this.exec('system_profiler', ['SPDisplaysDataType']);
    const match = profilerOutput.match(/Resolution:\s+(\d+)\s*x\s*(\d+)/);
    if (match) {
      this.cachedScreenSize = { width: parseInt(match[1]!, 10), height: parseInt(match[2]!, 10) };
      return this.cachedScreenSize;
    }

    throw new Error('Could not determine screen size');
  }

  // --- Private helpers ---

  private buildClickArgs(x: number, y: number, button: 'left' | 'right' | 'middle', clickCount: number): string[] {
    // cliclick commands: c (click), dc (double-click), tc (triple-click), rc (right-click)
    const coord = `${x},${y}`;
    if (button === 'right') return [`rc:${coord}`];
    if (button === 'middle') {
      // cliclick doesn't support middle click natively; use kd/ku with option
      return [`kd:ctrl`, `c:${coord}`, `ku:ctrl`]; // Ctrl+click as fallback
    }
    if (clickCount === 2) return [`dc:${coord}`];
    if (clickCount === 3) return [`tc:${coord}`];
    return [`c:${coord}`];
  }

  private translateKey(key: string): string {
    // Anthropic format: "ctrl+s", "Return", "space", "alt+tab"
    // cliclick format: "return", "space", uses kd:/ku: for modifiers

    // For key combos like "ctrl+s", we need kd: (key down) and ku: (key up)
    // This method handles single keys; combos are handled in pressKey
    const keyMap: Record<string, string> = {
      Return: 'return',
      Enter: 'return',
      Tab: 'tab',
      Escape: 'escape',
      Backspace: 'delete',
      Delete: 'fwd-delete',
      space: 'space',
      ArrowUp: 'arrow-up',
      ArrowDown: 'arrow-down',
      ArrowLeft: 'arrow-left',
      ArrowRight: 'arrow-right',
      Home: 'home',
      End: 'end',
      PageUp: 'page-up',
      PageDown: 'page-down',
      F1: 'f1', F2: 'f2', F3: 'f3', F4: 'f4',
      F5: 'f5', F6: 'f6', F7: 'f7', F8: 'f8',
      F9: 'f9', F10: 'f10', F11: 'f11', F12: 'f12',
    };
    return keyMap[key] ?? key.toLowerCase();
  }

  private async exec(command: string, args: string[]): Promise<string> {
    return new Promise((resolve, reject) => {
      const child = spawn(command, args, { stdio: ['ignore', 'pipe', 'pipe'] });
      const stdout: Buffer[] = [];
      const stderr: Buffer[] = [];

      child.stdout.on('data', (chunk: Buffer) => stdout.push(chunk));
      child.stderr.on('data', (chunk: Buffer) => stderr.push(chunk));

      child.on('close', (code) => {
        if (code !== 0) {
          const errMsg = Buffer.concat(stderr).toString('utf8').trim();
          reject(new Error(`${command} exited with code ${code}: ${errMsg}`));
          return;
        }
        resolve(Buffer.concat(stdout).toString('utf8'));
      });

      child.on('error', (err) => {
        if ('code' in err && err.code === 'ENOENT') {
          reject(new Error(
            `'${command}' not found. ${command === 'cliclick' ? 'Install with: brew install cliclick' : ''}`
          ));
          return;
        }
        reject(err);
      });
    });
  }

  private async execAppleScript(script: string): Promise<string> {
    return this.exec('osascript', ['-e', script]);
  }
}
```

### Step 3: Write backend unit tests

Create `packages/nuvin-core/tests/computer-use-backend.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MacOSBackend } from '../src/tools/computer/macos-backend.js';

// These tests validate the argument building and key translation logic
// without actually executing system commands.

describe('MacOSBackend', () => {
  let backend: MacOSBackend;

  beforeEach(() => {
    backend = new MacOSBackend();
  });

  describe('buildClickArgs (via reflection)', () => {
    it('builds left click args', () => {
      const args = (backend as any).buildClickArgs(100, 200, 'left', 1);
      expect(args).toEqual(['c:100,200']);
    });

    it('builds double click args', () => {
      const args = (backend as any).buildClickArgs(100, 200, 'left', 2);
      expect(args).toEqual(['dc:100,200']);
    });

    it('builds triple click args', () => {
      const args = (backend as any).buildClickArgs(100, 200, 'left', 3);
      expect(args).toEqual(['tc:100,200']);
    });

    it('builds right click args', () => {
      const args = (backend as any).buildClickArgs(100, 200, 'right', 1);
      expect(args).toEqual(['rc:100,200']);
    });
  });

  describe('translateKey', () => {
    it('translates Return', () => {
      expect((backend as any).translateKey('Return')).toBe('return');
    });

    it('translates Escape', () => {
      expect((backend as any).translateKey('Escape')).toBe('escape');
    });

    it('translates ArrowUp', () => {
      expect((backend as any).translateKey('ArrowUp')).toBe('arrow-up');
    });

    it('passes through unknown keys lowercased', () => {
      expect((backend as any).translateKey('a')).toBe('a');
    });

    it('translates F-keys', () => {
      expect((backend as any).translateKey('F5')).toBe('f5');
    });
  });
});
```

### Step 4: Run tests to verify they pass

```bash
cd packages/nuvin-core && npx vitest run tests/computer-use-backend.test.ts
```

Expected: All tests pass (they only test pure logic, no system calls).

### Step 5: Commit

```bash
git add packages/nuvin-core/src/tools/computer/ packages/nuvin-core/tests/computer-use-backend.test.ts
git commit -m "feat(core): add computer use types and macOS backend"
```

---

## Task 2: ComputerUseTool FunctionTool Implementation

**Files:**
- Create: `packages/nuvin-core/src/tools/ComputerUseTool.ts`
- Test: `packages/nuvin-core/tests/computer-use-tool.test.ts`

### Step 1: Create the ComputerUseTool

Create `packages/nuvin-core/src/tools/ComputerUseTool.ts`:

```typescript
import * as os from 'node:os';
import type { ToolDefinition, ImageContentPart, TextContentPart } from '../ports.js';
import type { FunctionTool, ToolExecutionContext, ExecResult } from './types.js';
import { err } from './result-helpers.js';
import type { ComputerAction, ComputerBackend } from './computer/types.js';
import { MacOSBackend } from './computer/macos-backend.js';

export type ComputerUseParams = ComputerAction;

/**
 * Result type for screenshot actions — returns mixed content with image.
 */
export type ComputerUseResult =
  | {
      status: 'success';
      type: 'mixed';
      result: Array<TextContentPart | ImageContentPart>;
      metadata?: Record<string, unknown>;
    }
  | {
      status: 'success';
      type: 'text';
      result: string;
      metadata?: Record<string, unknown>;
    }
  | {
      status: 'error';
      type: 'text';
      result: string;
      metadata?: Record<string, unknown>;
    };

export class ComputerUseTool implements FunctionTool<ComputerUseParams, ToolExecutionContext, ComputerUseResult> {
  name = 'computer' as const;

  private backend: ComputerBackend;

  constructor(backend?: ComputerBackend) {
    if (backend) {
      this.backend = backend;
    } else if (os.platform() === 'darwin') {
      this.backend = new MacOSBackend();
    } else {
      // Placeholder for future cross-platform support
      throw new Error(`Computer use tool is not supported on ${os.platform()}. Only macOS is currently supported.`);
    }
  }

  parameters = {
    type: 'object',
    properties: {
      action: {
        type: 'string',
        description: 'The action to perform.',
        enum: [
          'screenshot', 'left_click', 'right_click', 'middle_click',
          'double_click', 'triple_click', 'mouse_move', 'left_click_drag',
          'type', 'key', 'scroll', 'wait',
        ],
      },
      coordinate: {
        type: 'array',
        description: 'Screen coordinates [x, y] for mouse actions.',
        items: { type: 'integer' },
        minItems: 2,
        maxItems: 2,
      },
      start_coordinate: {
        type: 'array',
        description: 'Start coordinates [x, y] for drag actions.',
        items: { type: 'integer' },
        minItems: 2,
        maxItems: 2,
      },
      text: {
        type: 'string',
        description: 'Text to type (for "type" action).',
      },
      key: {
        type: 'string',
        description: 'Key or key combination to press (for "key" action). Examples: "Return", "ctrl+s", "alt+tab".',
      },
      direction: {
        type: 'string',
        description: 'Scroll direction.',
        enum: ['up', 'down', 'left', 'right'],
      },
      amount: {
        type: 'integer',
        description: 'Scroll amount in pixels/lines.',
        minimum: 1,
      },
      duration: {
        type: 'number',
        description: 'Wait duration in seconds (for "wait" action).',
        minimum: 0,
        maximum: 30,
      },
    },
    required: ['action'],
  } as const;

  definition(): ToolDefinition['function'] {
    return {
      name: this.name,
      description:
        'Control the computer desktop. Take screenshots, move/click the mouse, type text, press keys, and scroll. ' +
        'Use "screenshot" to see the current screen state. Use coordinate-based actions to interact with UI elements.',
      parameters: this.parameters,
    };
  }

  async execute(params: ComputerUseParams, ctx?: ToolExecutionContext): Promise<ComputerUseResult> {
    try {
      switch (params.action) {
        case 'screenshot':
          return await this.handleScreenshot();

        case 'left_click':
          await this.backend.click(params.coordinate[0], params.coordinate[1], 'left', 1);
          return this.okText(`Clicked at (${params.coordinate[0]}, ${params.coordinate[1]})`);

        case 'right_click':
          await this.backend.click(params.coordinate[0], params.coordinate[1], 'right', 1);
          return this.okText(`Right-clicked at (${params.coordinate[0]}, ${params.coordinate[1]})`);

        case 'middle_click':
          await this.backend.click(params.coordinate[0], params.coordinate[1], 'middle', 1);
          return this.okText(`Middle-clicked at (${params.coordinate[0]}, ${params.coordinate[1]})`);

        case 'double_click':
          await this.backend.click(params.coordinate[0], params.coordinate[1], 'left', 2);
          return this.okText(`Double-clicked at (${params.coordinate[0]}, ${params.coordinate[1]})`);

        case 'triple_click':
          await this.backend.click(params.coordinate[0], params.coordinate[1], 'left', 3);
          return this.okText(`Triple-clicked at (${params.coordinate[0]}, ${params.coordinate[1]})`);

        case 'mouse_move':
          await this.backend.mouseMove(params.coordinate[0], params.coordinate[1]);
          return this.okText(`Moved mouse to (${params.coordinate[0]}, ${params.coordinate[1]})`);

        case 'left_click_drag':
          await this.backend.clickDrag(
            params.start_coordinate[0], params.start_coordinate[1],
            params.coordinate[0], params.coordinate[1],
          );
          return this.okText(
            `Dragged from (${params.start_coordinate[0]}, ${params.start_coordinate[1]}) ` +
            `to (${params.coordinate[0]}, ${params.coordinate[1]})`
          );

        case 'type':
          await this.backend.typeText(params.text);
          return this.okText(`Typed "${params.text.length > 50 ? params.text.slice(0, 50) + '...' : params.text}"`);

        case 'key':
          await this.backend.pressKey(params.key);
          return this.okText(`Pressed key: ${params.key}`);

        case 'scroll':
          await this.backend.scroll(
            params.coordinate[0], params.coordinate[1],
            params.direction, params.amount,
          );
          return this.okText(
            `Scrolled ${params.direction} by ${params.amount} at (${params.coordinate[0]}, ${params.coordinate[1]})`
          );

        case 'wait':
          await new Promise((resolve) => setTimeout(resolve, params.duration * 1000));
          return this.okText(`Waited ${params.duration} seconds`);

        default:
          return err(`Unknown action: ${(params as any).action}`);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return err(message);
    }
  }

  private async handleScreenshot(): Promise<ComputerUseResult> {
    const result = await this.backend.screenshot();
    return {
      status: 'success',
      type: 'mixed',
      result: [
        { type: 'text', text: `Screenshot captured (${result.width}x${result.height})` },
        { type: 'image', mimeType: result.mimeType, data: result.base64 },
      ],
      metadata: { width: result.width, height: result.height },
    };
  }

  private okText(message: string): ComputerUseResult {
    return { status: 'success', type: 'text', result: message };
  }
}
```

### Step 2: Write ComputerUseTool unit tests

Create `packages/nuvin-core/tests/computer-use-tool.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ComputerUseTool } from '../src/tools/ComputerUseTool.js';
import type { ComputerBackend, ScreenshotResult } from '../src/tools/computer/types.js';

/**
 * Mock backend to test ComputerUseTool dispatch logic
 * without executing real system commands.
 */
function createMockBackend(): ComputerBackend & { calls: Array<{ method: string; args: unknown[] }> } {
  const calls: Array<{ method: string; args: unknown[] }> = [];
  const track = (method: string) => (...args: unknown[]) => {
    calls.push({ method, args });
    return Promise.resolve();
  };

  return {
    calls,
    screenshot: vi.fn(async (): Promise<ScreenshotResult> => {
      calls.push({ method: 'screenshot', args: [] });
      return {
        type: 'screenshot',
        base64: 'iVBORw0KGgo=',
        mimeType: 'image/png',
        width: 1920,
        height: 1080,
      };
    }),
    click: vi.fn(track('click') as any),
    mouseMove: vi.fn(track('mouseMove') as any),
    clickDrag: vi.fn(track('clickDrag') as any),
    typeText: vi.fn(track('typeText') as any),
    pressKey: vi.fn(track('pressKey') as any),
    scroll: vi.fn(track('scroll') as any),
    getScreenSize: vi.fn(async () => ({ width: 1920, height: 1080 })),
  };
}

describe('ComputerUseTool', () => {
  let tool: ComputerUseTool;
  let backend: ReturnType<typeof createMockBackend>;

  beforeEach(() => {
    backend = createMockBackend();
    tool = new ComputerUseTool(backend);
  });

  it('has correct name', () => {
    expect(tool.name).toBe('computer');
  });

  it('returns a valid tool definition', () => {
    const def = tool.definition();
    expect(def.name).toBe('computer');
    expect(def.parameters).toBeDefined();
  });

  describe('screenshot', () => {
    it('returns mixed result with image', async () => {
      const result = await tool.execute({ action: 'screenshot' });
      expect(result.status).toBe('success');
      expect(result.type).toBe('mixed');
      if (result.type === 'mixed') {
        expect(result.result).toHaveLength(2);
        expect(result.result[0]).toEqual({ type: 'text', text: 'Screenshot captured (1920x1080)' });
        expect(result.result[1]).toEqual({
          type: 'image',
          mimeType: 'image/png',
          data: 'iVBORw0KGgo=',
        });
      }
    });
  });

  describe('mouse actions', () => {
    it('dispatches left_click to backend', async () => {
      const result = await tool.execute({ action: 'left_click', coordinate: [100, 200] });
      expect(result.status).toBe('success');
      expect(backend.click).toHaveBeenCalledWith(100, 200, 'left', 1);
    });

    it('dispatches right_click to backend', async () => {
      await tool.execute({ action: 'right_click', coordinate: [300, 400] });
      expect(backend.click).toHaveBeenCalledWith(300, 400, 'right', 1);
    });

    it('dispatches double_click to backend', async () => {
      await tool.execute({ action: 'double_click', coordinate: [50, 60] });
      expect(backend.click).toHaveBeenCalledWith(50, 60, 'left', 2);
    });

    it('dispatches triple_click to backend', async () => {
      await tool.execute({ action: 'triple_click', coordinate: [50, 60] });
      expect(backend.click).toHaveBeenCalledWith(50, 60, 'left', 3);
    });

    it('dispatches mouse_move to backend', async () => {
      await tool.execute({ action: 'mouse_move', coordinate: [500, 600] });
      expect(backend.mouseMove).toHaveBeenCalledWith(500, 600);
    });

    it('dispatches left_click_drag to backend', async () => {
      await tool.execute({
        action: 'left_click_drag',
        start_coordinate: [10, 20],
        coordinate: [100, 200],
      });
      expect(backend.clickDrag).toHaveBeenCalledWith(10, 20, 100, 200);
    });
  });

  describe('keyboard actions', () => {
    it('dispatches type to backend', async () => {
      await tool.execute({ action: 'type', text: 'hello world' });
      expect(backend.typeText).toHaveBeenCalledWith('hello world');
    });

    it('dispatches key to backend', async () => {
      await tool.execute({ action: 'key', key: 'ctrl+s' });
      expect(backend.pressKey).toHaveBeenCalledWith('ctrl+s');
    });
  });

  describe('scroll', () => {
    it('dispatches scroll to backend', async () => {
      await tool.execute({
        action: 'scroll',
        coordinate: [500, 500],
        direction: 'down',
        amount: 3,
      });
      expect(backend.scroll).toHaveBeenCalledWith(500, 500, 'down', 3);
    });
  });

  describe('wait', () => {
    it('waits the specified duration', async () => {
      const start = Date.now();
      await tool.execute({ action: 'wait', duration: 0.1 });
      const elapsed = Date.now() - start;
      expect(elapsed).toBeGreaterThanOrEqual(80); // Allow some tolerance
    });
  });

  describe('error handling', () => {
    it('returns error for unknown action', async () => {
      const result = await tool.execute({ action: 'unknown_action' } as any);
      expect(result.status).toBe('error');
    });

    it('returns error when backend throws', async () => {
      (backend.click as any).mockRejectedValueOnce(new Error('cliclick not found'));
      const result = await tool.execute({ action: 'left_click', coordinate: [100, 200] });
      expect(result.status).toBe('error');
      expect(result.result).toContain('cliclick not found');
    });
  });
});
```

### Step 3: Run tests to verify they pass

```bash
cd packages/nuvin-core && npx vitest run tests/computer-use-tool.test.ts
```

Expected: All tests pass (mock backend, no system calls).

### Step 4: Commit

```bash
git add packages/nuvin-core/src/tools/ComputerUseTool.ts packages/nuvin-core/tests/computer-use-tool.test.ts
git commit -m "feat(core): add ComputerUseTool with action dispatch and tests"
```

---

## Task 3: Register in ToolRegistry and Add Exports

**Files:**
- Modify: `packages/nuvin-core/src/tools.ts` (line ~24, ~70)
- Modify: `packages/nuvin-core/src/index.ts` (line ~62, ~158)

### Step 1: Add ComputerUseTool to ToolRegistry

In `packages/nuvin-core/src/tools.ts`, add the import:

```typescript
// After the existing tool imports (around line 14)
import { ComputerUseTool } from './tools/ComputerUseTool.js';
```

Then add it to the `toolInstances` array in the constructor (around line 70, after `AskUserTool`):

```typescript
// Add to toolInstances array, after `new AskUserTool()`
// Only add on macOS
...(process.platform === 'darwin' ? [new ComputerUseTool()] : []),
```

### Step 2: Add exports to index.ts

In `packages/nuvin-core/src/index.ts`, after the `BashTool` export (line ~62):

```typescript
export { ComputerUseTool } from './tools/ComputerUseTool.js';
export type { ComputerUseParams, ComputerUseResult } from './tools/ComputerUseTool.js';
```

After the `AssignResult` export (line ~158):

```typescript
export type { ComputerAction, ComputerBackend, ComputerActionResult } from './tools/computer/types.js';
```

### Step 3: Verify the build compiles

```bash
cd packages/nuvin-core && npx tsc --noEmit
```

Expected: No type errors.

### Step 4: Commit

```bash
git add packages/nuvin-core/src/tools.ts packages/nuvin-core/src/index.ts
git commit -m "feat(core): register ComputerUseTool in ToolRegistry and add exports"
```

---

## Task 4: CLI Rendering Configuration

**Files:**
- Modify: `packages/nuvin-cli/source/components/ToolCallViewer/registry.ts`

### Step 1: Add computer tool to the CLI render registry

In `packages/nuvin-cli/source/components/ToolCallViewer/registry.ts`, add a new entry to `TOOL_REGISTRY` (after the `lsp` entry):

```typescript
  computer: {
    displayName: (ctx) => {
      const { toolState } = ctx;
      const action = get(ctx.toolCall, 'parameters.action') as string | undefined;
      if (toolState === 'running') return action === 'screenshot' ? 'Capturing screenshot' : `Computer: ${action ?? '...'}`;
      if (toolState === 'error') return 'Computer use failed';
      return action === 'screenshot' ? 'Screenshot' : `Computer: ${action ?? 'done'}`;
    },
    statusText: {
      success: (r: ToolExecutionResult) => {
        const action = get(r, 'metadata.action') as string | undefined;
        if (r.type === 'mixed') return 'Screenshot captured';
        return r.result as string || 'Done';
      },
      error: 'Failed',
    },
    excludeParams: ['action', 'coordinate', 'start_coordinate', 'text', 'key', 'direction', 'amount', 'duration'],
    renderResult: null, // Screenshot image is passed to LLM, not rendered in CLI
    collapsedByDefault: true,
  },
```

### Step 2: Verify CLI build compiles

```bash
cd packages/nuvin-cli && npx tsc --noEmit
```

Expected: No type errors.

### Step 3: Commit

```bash
git add packages/nuvin-cli/source/components/ToolCallViewer/registry.ts
git commit -m "feat(cli): add computer tool render config to ToolCallViewer registry"
```

---

## Task 5: Key Combo Support in pressKey

The macOS backend's `pressKey` method needs to handle modifier key combinations like `ctrl+s`, `alt+tab`, `cmd+shift+p`. cliclick uses `kd:` (key down) and `ku:` (key up) for modifier keys.

**Files:**
- Modify: `packages/nuvin-core/src/tools/computer/macos-backend.ts`
- Add tests to: `packages/nuvin-core/tests/computer-use-backend.test.ts`

### Step 1: Update pressKey to handle combos

Replace the `pressKey` method in `macos-backend.ts`:

```typescript
  async pressKey(key: string): Promise<void> {
    // Handle key combinations like "ctrl+s", "cmd+shift+p"
    if (key.includes('+')) {
      const parts = key.split('+');
      const mainKey = parts.pop()!;
      const modifiers = parts;

      const args: string[] = [];
      // Press modifiers down
      for (const mod of modifiers) {
        args.push(`kd:${this.translateModifier(mod)}`);
      }
      // Press the main key
      const translatedKey = this.translateKey(mainKey);
      args.push(`kp:${translatedKey}`);
      // Release modifiers (reverse order)
      for (const mod of [...modifiers].reverse()) {
        args.push(`ku:${this.translateModifier(mod)}`);
      }
      await this.exec('cliclick', args);
    } else {
      const cliclickKey = this.translateKey(key);
      await this.exec('cliclick', [`kp:${cliclickKey}`]);
    }
  }

  private translateModifier(mod: string): string {
    const modMap: Record<string, string> = {
      ctrl: 'ctrl',
      control: 'ctrl',
      alt: 'alt',
      option: 'alt',
      shift: 'shift',
      cmd: 'cmd',
      command: 'cmd',
      meta: 'cmd',
      super: 'cmd',
      fn: 'fn',
    };
    return modMap[mod.toLowerCase()] ?? mod.toLowerCase();
  }
```

### Step 2: Add tests for key combos

Add to `packages/nuvin-core/tests/computer-use-backend.test.ts`:

```typescript
  describe('translateModifier', () => {
    it('translates ctrl', () => {
      expect((backend as any).translateModifier('ctrl')).toBe('ctrl');
    });

    it('translates cmd', () => {
      expect((backend as any).translateModifier('cmd')).toBe('cmd');
    });

    it('translates meta to cmd', () => {
      expect((backend as any).translateModifier('meta')).toBe('cmd');
    });

    it('translates option to alt', () => {
      expect((backend as any).translateModifier('option')).toBe('alt');
    });
  });
```

### Step 3: Run tests

```bash
cd packages/nuvin-core && npx vitest run tests/computer-use-backend.test.ts
```

### Step 4: Commit

```bash
git add packages/nuvin-core/src/tools/computer/macos-backend.ts packages/nuvin-core/tests/computer-use-backend.test.ts
git commit -m "feat(core): add key combo support to macOS backend pressKey"
```

---

## Task 6: Scroll Implementation via CGEvents

The initial scroll implementation using AppleScript is unreliable. Use a shell command with `osascript` JavaScript bridge to `CGEvent` for more reliable scrolling.

**Files:**
- Modify: `packages/nuvin-core/src/tools/computer/macos-backend.ts`

### Step 1: Replace scroll implementation

Replace the `scroll` method in `macos-backend.ts`:

```typescript
  async scroll(x: number, y: number, direction: 'up' | 'down' | 'left' | 'right', amount: number): Promise<void> {
    // Move mouse to position first
    await this.mouseMove(x, y);

    // Use AppleScript with CGEvent for reliable scrolling
    // Scroll wheel delta: positive = up/left, negative = down/right
    const isVertical = direction === 'up' || direction === 'down';
    const delta = (direction === 'up' || direction === 'left') ? amount : -amount;

    if (isVertical) {
      // Vertical scroll using mouse scroll events via cliclick (if supported)
      // Fallback: use AppleScript to simulate scroll
      const script = `
        tell application "System Events"
          repeat ${Math.abs(delta)} times
            ${delta > 0 ? 'key code 126 using {option}' : 'key code 125 using {option}'}
          end repeat
        end tell
      `;
      // Alternative: direct scroll via python or swift
      // For now, use osascript with key events as a workaround
      // TODO: Consider using a small Swift helper for native CGEvent scrolling
      await this.execAppleScript(
        `do shell script "python3 -c \\"import Quartz; for i in range(${Math.abs(delta)}): e = Quartz.CGEventCreateScrollWheelEvent(None, Quartz.kCGScrollEventUnitLine, 1, ${delta > 0 ? 1 : -1}); Quartz.CGEventPost(Quartz.kCGHIDEventTap, e)\\""`
      );
    } else {
      // Horizontal scroll
      await this.execAppleScript(
        `do shell script "python3 -c \\"import Quartz; for i in range(${Math.abs(delta)}): e = Quartz.CGEventCreateScrollWheelEvent(None, Quartz.kCGScrollEventUnitLine, 2, 0, ${delta > 0 ? 1 : -1}); Quartz.CGEventPost(Quartz.kCGHIDEventTap, e)\\""`
      );
    }
  }
```

### Step 2: Commit

```bash
git add packages/nuvin-core/src/tools/computer/macos-backend.ts
git commit -m "feat(core): improve scroll implementation using CGEvent via python3"
```

---

## Task 7: cliclick Availability Check

Add a startup check that warns if `cliclick` is not installed, since it's required for mouse/keyboard actions.

**Files:**
- Modify: `packages/nuvin-core/src/tools/computer/macos-backend.ts`

### Step 1: Add availability check

Add a static method and constructor check to `MacOSBackend`:

```typescript
  private cliclickAvailable: boolean | null = null;

  /**
   * Check if cliclick is available. Caches the result.
   */
  async ensureCliclick(): Promise<void> {
    if (this.cliclickAvailable === true) return;
    if (this.cliclickAvailable === false) {
      throw new Error(
        'cliclick is not installed. Install with: brew install cliclick\n' +
        'cliclick is required for mouse and keyboard control on macOS.'
      );
    }

    try {
      await this.exec('which', ['cliclick']);
      this.cliclickAvailable = true;
    } catch {
      this.cliclickAvailable = false;
      throw new Error(
        'cliclick is not installed. Install with: brew install cliclick\n' +
        'cliclick is required for mouse and keyboard control on macOS.'
      );
    }
  }
```

Then add `await this.ensureCliclick()` at the start of `click`, `mouseMove`, `clickDrag`, `typeText`, and `pressKey` methods.

### Step 2: Commit

```bash
git add packages/nuvin-core/src/tools/computer/macos-backend.ts
git commit -m "feat(core): add cliclick availability check with install instructions"
```

---

## Supported Actions (Anthropic Parity)

| Action | Description | Parameters |
|--------|-------------|------------|
| `screenshot` | Capture current display | — |
| `left_click` | Click at coordinates | `coordinate: [x, y]` |
| `right_click` | Right-click at coordinates | `coordinate: [x, y]` |
| `middle_click` | Middle-click at coordinates | `coordinate: [x, y]` |
| `double_click` | Double-click at coordinates | `coordinate: [x, y]` |
| `triple_click` | Triple-click at coordinates | `coordinate: [x, y]` |
| `mouse_move` | Move cursor to coordinates | `coordinate: [x, y]` |
| `left_click_drag` | Click and drag | `coordinate: [x, y]`, `start_coordinate: [x, y]` |
| `type` | Type text string | `text: string` |
| `key` | Press key or combo | `key: string` (e.g., "ctrl+s", "Return") |
| `scroll` | Scroll in direction | `coordinate: [x, y]`, `direction: up\|down\|left\|right`, `amount: number` |
| `wait` | Pause between actions | `duration: number` (seconds) |

---

## File Overview

| File | Action |
|------|--------|
| `packages/nuvin-core/src/tools/computer/macos-backend.ts` | Create — macOS native automation functions |
| `packages/nuvin-core/src/tools/computer/types.ts` | Create — Action types and parameter interfaces |
| `packages/nuvin-core/src/tools/ComputerUseTool.ts` | Create — FunctionTool implementation |
| `packages/nuvin-core/src/tools.ts` | Modify — Register ComputerUseTool in ToolRegistry |
| `packages/nuvin-core/src/index.ts` | Modify — Export new types |
| `packages/nuvin-cli/source/components/ToolCallViewer/registry.ts` | Modify — Add CLI render config |
| `packages/nuvin-core/tests/computer-use-tool.test.ts` | Create — Unit tests |

---
