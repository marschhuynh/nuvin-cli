import type { ImageContentPart, TextContentPart } from '../../ports.js';

// ─── Primitives ────────────────────────────────────────────────────────────

export type Coordinate = [x: number, y: number];

// ─── Action discriminated union ────────────────────────────────────────────

export type ScreenshotAction = {
  type: 'screenshot';
};

export type LeftClickAction = {
  type: 'left_click';
  coordinate: Coordinate;
};

export type RightClickAction = {
  type: 'right_click';
  coordinate: Coordinate;
};

export type MiddleClickAction = {
  type: 'middle_click';
  coordinate: Coordinate;
};

export type DoubleClickAction = {
  type: 'double_click';
  coordinate: Coordinate;
};

export type TripleClickAction = {
  type: 'triple_click';
  coordinate: Coordinate;
};

export type MouseMoveAction = {
  type: 'mouse_move';
  coordinate: Coordinate;
};

export type LeftClickDragAction = {
  type: 'left_click_drag';
  startCoordinate: Coordinate;
  coordinate: Coordinate;
};

export type TypeAction = {
  type: 'type';
  text: string;
};

export type KeyAction = {
  type: 'key';
  key: string;
};

export type ScrollAction = {
  type: 'scroll';
  coordinate: Coordinate;
  direction: 'up' | 'down' | 'left' | 'right';
  amount: number;
};

export type WaitAction = {
  type: 'wait';
  duration?: number;
};

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

// ─── Action result types ───────────────────────────────────────────────────

export type ScreenshotResult = {
  type: 'screenshot';
  data: string; // base64-encoded PNG
  mimeType: string;
  width: number;  // width of the image sent to LLM
  height: number; // height of the image sent to LLM
  scaleFactor: number; // multiply LLM coordinates by this to get screen coordinates
};

export type TextResult = {
  type: 'text';
  message: string;
};

export type ComputerActionResult = ScreenshotResult | TextResult;

// ─── ExecResult extension for mixed content ────────────────────────────────

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

// ─── AX tree types ────────────────────────────────────────────────────────

export type AXElement = {
  ref?: number;
  role: string;
  title?: string | null;
  desc?: string | null;
  value?: string | null;
  /** Full/leafOnly mode: raw AX action names */
  actions?: string[] | null;
  /** leafCompact mode: compacted action names (Name:foo\n... → "foo", AXPress → "Press") */
  act?: string[] | null;
  pos?: [number, number] | null;
  size?: [number, number] | null;
  /** leafCompact table/list containers: uniform row size hoisted from children */
  rowSize?: [number, number] | null;
  children?: AXElement[] | null;
};

export type AXSnapshotResult = {
  snapshotId: string;
  app: string;
  window: string | null;
  elements: AXElement[];
};

export type AXPressResult = {
  status: string;
  ref: number;
  method: string;
  x?: number;
  y?: number;
};

export type AXSetValueResult = {
  status: string;
  ref: number;
  value?: string;
  note?: string;
};

export type AXScrollResult = {
  status: string;
  ref: number;
  method: string;
  x?: number;
  y?: number;
  lines?: number;
};

export type AnnotateResult = {
  data: string; // base64-encoded annotated PNG
  mimeType: string;
};

export type HintMode = 'full' | 'leafOnly' | 'leafCompact';

// ─── ComputerBackend interface ─────────────────────────────────────────────

export type ScreenSize = {
  width: number;
  height: number;
};

export type ClickButton = 'left' | 'right' | 'middle';

export interface ComputerBackend {
  /** Set by the tool before each execution for abort support. */
  signal?: AbortSignal;

  /**
   * Capture the current screen (or a specific window) and return base64-encoded PNG with dimensions.
   * If windowId is provided, captures only that window.
   */
  screenshot(windowId?: number): Promise<ScreenshotResult>;

  /**
   * Perform a mouse click at the given coordinate.
   */
  click(x: number, y: number, button: ClickButton, clickCount: number): Promise<void>;

  /**
   * Move the mouse cursor to the given coordinate without clicking.
   */
  mouseMove(x: number, y: number): Promise<void>;

  /**
   * Click-drag from start to end coordinate using the left button.
   */
  clickDrag(startX: number, startY: number, endX: number, endY: number): Promise<void>;

  /**
   * Type the given text using keyboard synthesis.
   */
  typeText(text: string): Promise<void>;

  /**
   * Press a key or key combination (e.g. "Return", "ctrl+s", "cmd+shift+4").
   */
  pressKey(key: string): Promise<void>;

  /**
   * Scroll at the given coordinate in the given direction by the given amount.
   */
  scroll(x: number, y: number, direction: 'up' | 'down' | 'left' | 'right', amount: number): Promise<void>;

  /**
   * Return the current screen dimensions.
   */
  getScreenSize(): Promise<ScreenSize>;

  /**
   * Capture the accessibility tree for the given app (or frontmost if omitted).
   */
  /**
   * Bring the given application to the foreground.
   */
  activateApp(appName: string): Promise<void>;

  axSnapshot(appName?: string, maxDepth?: number, maxElements?: number, hintMode?: HintMode): Promise<AXSnapshotResult>;

  /**
   * Press (activate) an element identified by its ref from the last snapshot.
   */
  axPress(ref: number, snapshotId: string, method?: 'AXPress' | 'CGEvent' | 'auto'): Promise<AXPressResult>;

  /**
   * Scroll an element into view by its ref from the last snapshot.
   * Uses AXScrollToVisible with CGEvent fallback.
   */
  axScroll(ref: number, snapshotId: string): Promise<AXScrollResult>;

  /**
   * Set the value of an element identified by its ref from the last snapshot.
   */
  axSetValue(ref: number, snapshotId: string, value: string): Promise<AXSetValueResult>;

  /**
   * Return the list of currently running application names.
   */
  listApps(): Promise<string[]>;

  /**
   * Get the CGWindowID for an app's frontmost on-screen window.
   * Used by screenshot() to capture a single window with `screencapture -l`.
   */
  getWindowId(appName?: string): Promise<{ windowId: number; bounds: { x: number; y: number; width: number; height: number } }>;

  /**
   * Annotate a screenshot with ref hint badges from the AX tree.
   * Returns a new PNG with red ref-number pills overlaid on interactive elements.
   */
  annotateScreenshot(
    elements: AXElement[],
    screenshotData: string,
    screenshotWidth: number,
    screenshotHeight: number,
    scaleFactor: number,
    windowOrigin?: { x: number; y: number },
  ): Promise<AnnotateResult>;
}
