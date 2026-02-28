import * as os from 'node:os';
import type { ToolDefinition, ImageContentPart, TextContentPart } from '../ports.js';
import type { FunctionTool, ToolExecutionContext } from './types.js';
import type { ComputerBackend, ComputerUseResult, AXElement, AXSnapshotResult } from './computer/types.js';
import { MacOSBackend } from './computer/macos-backend.js';

// ─── Parameter types ───────────────────────────────────────────────────────

import type { HintMode } from './computer/types.js';

export type ComputerUseParams = {
  action: 'snapshot' | 'press' | 'set_value' | 'type' | 'key' | 'scroll' | 'screenshot' | 'wait' | 'list_apps' | 'annotated_screenshot';
  ref?: number;
  app?: string;
  text?: string;
  key?: string;
  direction?: 'up' | 'down' | 'left' | 'right';
  amount?: number;
  duration?: number;
  maxDepth?: number;
  maxElements?: number;
  hintMode?: HintMode;
};

// ─── JSON Schema parameters ────────────────────────────────────────────────

const PARAMETERS = {
  type: 'object',
  properties: {
    action: {
      type: 'string',
      enum: ['snapshot', 'press', 'set_value', 'type', 'key', 'scroll', 'screenshot', 'wait', 'list_apps', 'annotated_screenshot'],
      description: 'The action to perform. Use `snapshot` for text-only UI tree, `annotated_screenshot` for visual screenshot with ref hints overlaid (Vimium-style), then `press` or `set_value` to interact by ref.',
    },
    ref: {
      type: 'integer',
      description: 'Element ref ID from the last snapshot (for press, set_value actions).',
    },
    app: {
      type: 'string',
      description: 'Target app name (for snapshot, annotated_screenshot, screenshot). Omit to use the frontmost app.',
    },
    text: {
      type: 'string',
      description: 'Text to type (for type action) or value to set (for set_value action).',
    },
    key: {
      type: 'string',
      description: 'Key or combo to press (for key action). Examples: "Return", "cmd+s", "ctrl+a".',
    },
    direction: {
      type: 'string',
      enum: ['up', 'down', 'left', 'right'],
      description: 'Scroll direction (for scroll action).',
    },
    amount: {
      type: 'integer',
      minimum: 1,
      description: 'Scroll lines (for scroll action). Defaults to 3.',
    },
    duration: {
      type: 'integer',
      minimum: 0,
      description: 'Milliseconds to wait (for wait action). Defaults to 1000.',
    },
    maxDepth: {
      type: 'integer',
      minimum: 1,
      description: 'Maximum depth for AX tree traversal (for snapshot, annotated_screenshot). Defaults to 8.',
    },
    maxElements: {
      type: 'integer',
      minimum: 1,
      description: 'Maximum number of actionable elements to capture (for snapshot, annotated_screenshot). Defaults to 500.',
    },
    hintMode: {
      type: 'string',
      enum: ['full', 'leafOnly', 'leafCompact'],
      description: 'Hint mode for AX snapshot (for snapshot, annotated_screenshot). "full" = all elements get refs, "leafOnly" = only leaf-actionable elements get refs, "leafCompact" = prune non-actionable structure. Defaults to "leafCompact".',
    },
  },
  required: ['action'],
} as const;

// ─── AX tree formatter ─────────────────────────────────────────────────────

function formatAXTree(snapshot: AXSnapshotResult): string {
  const lines: string[] = [];
  lines.push(`[App: ${snapshot.app}${snapshot.window ? ` | Window: ${snapshot.window}` : ''}]`);
  lines.push('');

  function formatElement(el: AXElement, indent: number) {
    const pad = '  '.repeat(indent);
    const refTag = el.ref !== undefined ? `[ref:${el.ref}]` : '';
    const parts: string[] = refTag ? [`${pad}${refTag}`, el.role] : [`${pad}${el.role}`];

    const label = el.title || el.desc;
    if (label) parts.push(`"${label}"`);
    if (el.value !== undefined && el.value !== null) parts.push(`value="${el.value}"`);
    const acts = el.act ?? el.actions;
    if (acts?.length) parts.push(`{${acts.join(',')}}`);

    lines.push(parts.join(' '));

    if (el.children) {
      for (const child of el.children) {
        formatElement(child, indent + 1);
      }
    }
  }

  for (const el of snapshot.elements) {
    formatElement(el, 0);
  }

  return lines.join('\n');
}

// ─── Helpers ───────────────────────────────────────────────────────────────

function requireText(params: ComputerUseParams, actionName: string): string {
  if (typeof params.text !== 'string' || params.text.length === 0) {
    throw new Error(`Action "${actionName}" requires a non-empty text parameter.`);
  }
  return params.text;
}

function requireKey(params: ComputerUseParams, actionName: string): string {
  if (typeof params.key !== 'string' || params.key.length === 0) {
    throw new Error(`Action "${actionName}" requires a key parameter.`);
  }
  return params.key;
}

function requireDirection(
  params: ComputerUseParams,
  actionName: string,
): 'up' | 'down' | 'left' | 'right' {
  if (!params.direction) {
    throw new Error(`Action "${actionName}" requires a direction parameter.`);
  }
  return params.direction;
}

function okMixed(
  text: string,
  imageData: string,
  mimeType: string,
): ComputerUseResult & { status: 'success'; type: 'mixed' } {
  const textPart: TextContentPart = { type: 'text', text };
  const imagePart: ImageContentPart = { type: 'image', mimeType, data: imageData };
  const result: Array<TextContentPart | ImageContentPart> = [textPart, imagePart];
  return { status: 'success', type: 'mixed', result };
}

function okText(text: string): ComputerUseResult & { status: 'success'; type: 'text' } {
  return { status: 'success', type: 'text', result: text };
}

function errResult(message: string): ComputerUseResult & { status: 'error'; type: 'text' } {
  return { status: 'error', type: 'text', result: message };
}

// ─── ComputerUseTool ────────────────────────────────────────────────────────

export class ComputerUseTool
  implements FunctionTool<ComputerUseParams, ToolExecutionContext, ComputerUseResult>
{
  name = 'computer' as const;
  parameters = PARAMETERS;

  private readonly backend: ComputerBackend;
  /** Snapshot ID from the most recent `snapshot` call; required by press/set_value */
  private lastSnapshotId: string | null = null;
  /** App name from the most recent `snapshot` call; used to activate before type/key */
  private lastApp: string | null = null;

  constructor(backend?: ComputerBackend) {
    if (backend) {
      this.backend = backend;
    } else {
      const platform = os.platform();
      if (platform !== 'darwin') {
        throw new Error(
          `ComputerUseTool: platform "${platform}" is not supported. ` +
            'Only macOS (darwin) is currently supported.',
        );
      }
      this.backend = new MacOSBackend();
    }
  }

  definition(): ToolDefinition['function'] {
    return {
      name: this.name,
      description:
        'Interact with the computer desktop via the accessibility tree. ' +
        'Use `snapshot` for a text-only UI tree, or `annotated_screenshot` to see a screenshot with ref hints overlaid (Vimium-style). ' +
        'Pass `app` to target a specific application (e.g. app="Safari"); omit to use the frontmost app. ' +
        'Optional: `maxDepth` (default 8), `maxElements` (default 500), `hintMode` (default "leafCompact") control snapshot behavior. ' +
        'Then use `press` or `set_value` to interact by element ref. ' +
        'Use `type` and `key` for keyboard input, `scroll` to scroll an element into view by ref (or at screen center if no ref given). ' +
        'Use `screenshot` only when you need a raw visual without hints. ' +
        'Always start with `snapshot` or `annotated_screenshot` to orient yourself.',
      parameters: this.parameters,
    };
  }

  async execute(params: ComputerUseParams, context?: ToolExecutionContext): Promise<ComputerUseResult> {
    if (context?.signal?.aborted) {
      return errResult('Aborted');
    }
    this.backend.signal = context?.signal;
    try {
      return await this.dispatch(params);
    } catch (e: unknown) {
      if (context?.signal?.aborted) return errResult('Aborted');
      const message = e instanceof Error ? e.message : String(e);
      return errResult(message);
    } finally {
      this.backend.signal = undefined;
    }
  }

  private async dispatch(params: ComputerUseParams): Promise<ComputerUseResult> {
    switch (params.action) {
      case 'snapshot': {
        const snapshot = await this.backend.axSnapshot(
          params.app,
          params.maxDepth,
          params.maxElements,
          params.hintMode ?? 'leafCompact',
        );
        this.lastSnapshotId = snapshot.snapshotId;
        this.lastApp = snapshot.app;
        const formatted = formatAXTree(snapshot);
        return okText(formatted);
      }

      case 'press': {
        if (params.ref === undefined) throw new Error('Action "press" requires a ref parameter.');
        if (!this.lastSnapshotId) throw new Error('No snapshot taken yet. Use "snapshot" first.');
        if (this.lastApp) await this.backend.activateApp(this.lastApp);
        const result = await this.backend.axPress(params.ref, this.lastSnapshotId);
        return okText(`Pressed ref:${result.ref} via ${result.method}${result.x !== undefined ? ` at (${result.x}, ${result.y})` : ''}`);
      }

      case 'set_value': {
        if (params.ref === undefined) throw new Error('Action "set_value" requires a ref parameter.');
        if (typeof params.text !== 'string') throw new Error('Action "set_value" requires a text parameter.');
        if (!this.lastSnapshotId) throw new Error('No snapshot taken yet. Use "snapshot" first.');
        if (this.lastApp) await this.backend.activateApp(this.lastApp);
        const result = await this.backend.axSetValue(params.ref, this.lastSnapshotId, params.text);
        if (result.note) return okText(`ref:${result.ref}: ${result.note}`);
        return okText(`Set value on ref:${result.ref} to "${result.value}"`);
      }

      case 'type': {
        const text = requireText(params, 'type');
        if (this.lastApp) await this.backend.activateApp(this.lastApp);
        await this.backend.typeText(text);
        return okText(`Typed: ${JSON.stringify(text)}`);
      }

      case 'key': {
        const key = requireKey(params, 'key');
        if (this.lastApp) await this.backend.activateApp(this.lastApp);
        await this.backend.pressKey(key);
        return okText(`Pressed key: ${key}`);
      }

      case 'scroll': {
        // Ref mode: scroll element into view using AXScrollToVisible
        if (params.ref !== undefined) {
          if (!this.lastSnapshotId) throw new Error('No snapshot taken yet. Use "snapshot" first.');
          if (this.lastApp) await this.backend.activateApp(this.lastApp);
          const result = await this.backend.axScroll(params.ref, this.lastSnapshotId);
          return okText(`Scrolled ref:${result.ref} into view via ${result.method}${result.x !== undefined ? ` at (${result.x}, ${result.y})` : ''}${result.lines !== undefined ? `, ${result.lines} lines` : ''}`);
        }
        // Point mode fallback: scroll at screen center
        const direction = requireDirection(params, 'scroll');
        const amount = params.amount ?? 3;
        const screenSize = await this.backend.getScreenSize();
        const cx = Math.round(screenSize.width / 2);
        const cy = Math.round(screenSize.height / 2);
        await this.backend.scroll(cx, cy, direction, amount);
        return okText(`Scrolled ${direction} by ${amount} lines`);
      }

      case 'screenshot': {
        // If app is specified, capture just that window
        let windowId: number | undefined;
        if (params.app) {
          const windowInfo = await this.backend.getWindowId(params.app);
          windowId = windowInfo.windowId;
        }
        const result = await this.backend.screenshot(windowId);
        return okMixed(
          `Screenshot taken (${result.width}x${result.height})${params.app ? ` of ${params.app}` : ''}`,
          result.data,
          result.mimeType,
        );
      }

      case 'wait': {
        const duration = params.duration ?? 1000;
        await new Promise<void>((resolve) => {
          const timer = setTimeout(resolve, duration);
          this.backend.signal?.addEventListener('abort', () => {
            clearTimeout(timer);
            resolve();
          });
        });
        if (this.backend.signal?.aborted) throw new Error('Aborted');
        return okText(`Waited ${duration}ms`);
      }

      case 'list_apps': {
        const apps = await this.backend.listApps();
        return okText(`Running applications:\n${apps.map(a => `- ${a}`).join('\n')}`);
      }

      case 'annotated_screenshot': {
        // 1. Take AX snapshot
        const snapshot = await this.backend.axSnapshot(
          params.app,
          params.maxDepth,
          params.maxElements,
          params.hintMode ?? 'leafCompact',
        );
        this.lastSnapshotId = snapshot.snapshotId;
        this.lastApp = snapshot.app;

        // 2. Get window ID and take window-only screenshot
        let windowId: number | undefined;
        let windowOrigin: { x: number; y: number } | undefined;
        try {
          const windowInfo = await this.backend.getWindowId(params.app);
          windowId = windowInfo.windowId;
          windowOrigin = { x: windowInfo.bounds.x, y: windowInfo.bounds.y };
        } catch {
          // Fall back to full-screen capture if window-id fails
        }
        const screenshotResult = await this.backend.screenshot(windowId);

        // 3. Compute scale: AX positions are in screen points, screenshot is in pixels.
        //    Retina Macs: 1 point = 2 pixels. After resize, scaleFactor = captured/resized.
        //    Combined: screenPoint × retinaScale / resizeScaleFactor
        //    But screenshot() already captures at retina resolution and returns scaleFactor
        //    (captured→resized ratio). We need: screenPoint → resized pixel.
        //    resizedPixel = screenPoint × retinaScale × (1/scaleFactor)
        //    So the scale to pass = retinaScale / scaleFactor
        //    We estimate retina by: capturedPixels / screenSize
        const screenSize = await this.backend.getScreenSize();
        const retinaScale = screenshotResult.width > 0 && screenSize.width > 0
          ? (screenshotResult.width * screenshotResult.scaleFactor) / screenSize.width
          : 2.0;
        const annotateScale = retinaScale / screenshotResult.scaleFactor;

        // 4. Annotate screenshot with ref badges
        const annotated = await this.backend.annotateScreenshot(
          snapshot.elements,
          screenshotResult.data,
          screenshotResult.width,
          screenshotResult.height,
          annotateScale,
          windowOrigin,
        );

        // 5. Return tree text + annotated image
        const treeText = formatAXTree(snapshot);
        return okMixed(treeText, annotated.data, annotated.mimeType);
      }

      default: {
        const exhaustive: never = params.action;
        return errResult(`Unknown action: ${String(exhaustive)}`);
      }
    }
  }
}


