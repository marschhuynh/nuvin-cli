/**
 * Unit tests for ComputerUseTool with a mock backend.
 *
 * ComputerUseTool accepts an optional `backend` via constructor injection,
 * allowing us to test all dispatch logic without any system calls.
 *
 * The tool now uses accessibility-tree-based interaction (snapshot/press/set_value)
 * instead of pixel-coordinate-based mouse clicks.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ComputerUseTool } from '../src/tools/ComputerUseTool.js';
import type {
  ComputerBackend,
  ScreenshotResult,
  ScreenSize,
  AXSnapshotResult,
  AXPressResult,
  AXSetValueResult,
  AXScrollResult,
  AnnotateResult,
} from '../src/tools/computer/types.js';

// ─── Mock data ─────────────────────────────────────────────────────────────

const MOCK_SCREENSHOT: ScreenshotResult = {
  type: 'screenshot',
  data: 'iVBORw0KGgo=',
  mimeType: 'image/png',
  width: 1920,
  height: 1080,
  scaleFactor: 1.0,
};

const MOCK_SCREEN_SIZE: ScreenSize = { width: 1920, height: 1080 };

const MOCK_SNAPSHOT: AXSnapshotResult = {
  snapshotId: 'test-snapshot-001',
  app: 'TestApp',
  window: 'Test Window',
  elements: [
    { ref: 1, role: 'button', title: 'Save', actions: ['AXPress'], pos: [10, 20], size: [80, 30] },
    { ref: 2, role: 'textfield', desc: 'Search', value: '', actions: ['AXPress'], pos: [100, 20], size: [200, 28] },
    { ref: 3, role: 'text', title: 'Welcome', value: 'Hello World' },
  ],
};

const MOCK_PRESS: AXPressResult = { status: 'pressed', ref: 1, method: 'AXPress' };
const MOCK_SET_VALUE: AXSetValueResult = { status: 'set', ref: 2, value: 'hello' };
const MOCK_SCROLL: AXScrollResult = { status: 'scrolled', ref: 1, method: 'AXScrollToVisible' };
const MOCK_APPS = ['Arc', 'Finder', 'Notes'];

const MOCK_ANNOTATE: AnnotateResult = {
  data: 'iVBORw0KGgoAnnotated=',
  mimeType: 'image/png',
};

// ─── Mock backend factory ──────────────────────────────────────────────────

function makeMockBackend(): ComputerBackend & {
  screenshot: ReturnType<typeof vi.fn>;
  click: ReturnType<typeof vi.fn>;
  mouseMove: ReturnType<typeof vi.fn>;
  clickDrag: ReturnType<typeof vi.fn>;
  typeText: ReturnType<typeof vi.fn>;
  pressKey: ReturnType<typeof vi.fn>;
  scroll: ReturnType<typeof vi.fn>;
  getScreenSize: ReturnType<typeof vi.fn>;
  activateApp: ReturnType<typeof vi.fn>;
  axSnapshot: ReturnType<typeof vi.fn>;
  axPress: ReturnType<typeof vi.fn>;
  axSetValue: ReturnType<typeof vi.fn>;
  axScroll: ReturnType<typeof vi.fn>;
  listApps: ReturnType<typeof vi.fn>;
  annotateScreenshot: ReturnType<typeof vi.fn>;
  getWindowId: ReturnType<typeof vi.fn>;
} {
  return {
    screenshot: vi.fn().mockResolvedValue(MOCK_SCREENSHOT),
    click: vi.fn().mockResolvedValue(undefined),
    mouseMove: vi.fn().mockResolvedValue(undefined),
    clickDrag: vi.fn().mockResolvedValue(undefined),
    typeText: vi.fn().mockResolvedValue(undefined),
    pressKey: vi.fn().mockResolvedValue(undefined),
    scroll: vi.fn().mockResolvedValue(undefined),
    getScreenSize: vi.fn().mockResolvedValue(MOCK_SCREEN_SIZE),
    activateApp: vi.fn().mockResolvedValue(undefined),
    axSnapshot: vi.fn().mockResolvedValue(MOCK_SNAPSHOT),
    axPress: vi.fn().mockResolvedValue(MOCK_PRESS),
    axSetValue: vi.fn().mockResolvedValue(MOCK_SET_VALUE),
    axScroll: vi.fn().mockResolvedValue(MOCK_SCROLL),
    listApps: vi.fn().mockResolvedValue(MOCK_APPS),
    annotateScreenshot: vi.fn().mockResolvedValue(MOCK_ANNOTATE),
    getWindowId: vi.fn().mockResolvedValue({ windowId: 12345, bounds: { x: 100, y: 200, width: 1400, height: 900 } }),
  };
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('ComputerUseTool', () => {
  let backend: ReturnType<typeof makeMockBackend>;
  let tool: ComputerUseTool;

  beforeEach(() => {
    backend = makeMockBackend();
    tool = new ComputerUseTool(backend);
  });

  // ── Identity ───────────────────────────────────────────────────────────────

  describe('identity', () => {
    it('tool.name is "computer"', () => {
      expect(tool.name).toBe('computer');
    });

    it('definition() returns valid shape with new action enum', () => {
      const def = tool.definition();
      expect(def.name).toBe('computer');
      expect(typeof def.description).toBe('string');
      expect(def.description.length).toBeGreaterThan(0);
      expect(def.parameters).toBeDefined();
      expect((def.parameters as { type?: string }).type).toBe('object');
      const params = def.parameters as {
        properties?: { action?: { enum?: string[] } };
        required?: string[];
      };
      // New AX-tree actions present
      expect(params.properties?.action?.enum).toContain('snapshot');
      expect(params.properties?.action?.enum).toContain('press');
      expect(params.properties?.action?.enum).toContain('set_value');
      expect(params.properties?.action?.enum).toContain('list_apps');
      expect(params.properties?.action?.enum).toContain('screenshot');
      expect(params.required).toContain('action');
    });
  });

  // ── Snapshot ───────────────────────────────────────────────────────────────

  describe('snapshot action', () => {
    it('calls backend.axSnapshot()', async () => {
      await tool.execute({ action: 'snapshot' });
      expect(backend.axSnapshot).toHaveBeenCalledOnce();
    });

    it('passes app name when provided', async () => {
      await tool.execute({ action: 'snapshot', app: 'Safari' });
      expect(backend.axSnapshot).toHaveBeenCalledWith('Safari', undefined, undefined, 'leafCompact');
    });

    it('calls backend.axSnapshot with undefined when no app is provided', async () => {
      await tool.execute({ action: 'snapshot' });
      expect(backend.axSnapshot).toHaveBeenCalledWith(undefined, undefined, undefined, 'leafCompact');
    });

    it('returns text result containing app/window header', async () => {
      const result = await tool.execute({ action: 'snapshot' });
      expect(result.status).toBe('success');
      expect(result.type).toBe('text');
      if (result.type !== 'text') return;
      expect(result.result).toContain('TestApp');
      expect(result.result).toContain('Test Window');
    });

    it('returns text result containing element refs', async () => {
      const result = await tool.execute({ action: 'snapshot' });
      expect(result.type).toBe('text');
      if (result.type !== 'text') return;
      expect(result.result).toContain('ref:1');
      expect(result.result).toContain('ref:2');
      expect(result.result).toContain('ref:3');
    });

    it('stores snapshotId for later use by press/set_value', async () => {
      // After snapshot, press should work (no "no snapshot" error)
      await tool.execute({ action: 'snapshot' });
      const pressResult = await tool.execute({ action: 'press', ref: 1 });
      expect(pressResult.status).toBe('success');
      expect(backend.axPress).toHaveBeenCalledWith(1, 'test-snapshot-001');
    });
  });

  // ── Press ──────────────────────────────────────────────────────────────────

  describe('press action', () => {
    it('calls backend.axPress(ref, snapshotId) after snapshot', async () => {
      await tool.execute({ action: 'snapshot' });
      const result = await tool.execute({ action: 'press', ref: 1 });
      expect(backend.axPress).toHaveBeenCalledWith(1, 'test-snapshot-001');
      expect(result.status).toBe('success');
    });

    it('returns text result with ref and method info', async () => {
      await tool.execute({ action: 'snapshot' });
      const result = await tool.execute({ action: 'press', ref: 1 });
      expect(result.type).toBe('text');
      if (result.type !== 'text') return;
      expect(result.result).toContain('1');
      expect(result.result).toContain('AXPress');
    });

    it('returns error when ref is missing', async () => {
      await tool.execute({ action: 'snapshot' });
      const result = await tool.execute({ action: 'press' });
      expect(result.status).toBe('error');
      expect(result.type).toBe('text');
      if (result.type === 'text') {
        expect(result.result).toContain('ref');
      }
    });

    it('returns error when no snapshot taken yet', async () => {
      // Fresh tool — no snapshot called first
      const freshTool = new ComputerUseTool(backend);
      const result = await freshTool.execute({ action: 'press', ref: 1 });
      expect(result.status).toBe('error');
      expect(result.type).toBe('text');
      if (result.type === 'text') {
        expect(result.result).toContain('snapshot');
      }
    });

    it('includes coordinate info in result when backend returns x/y', async () => {
      const pressWithCoords: AXPressResult = { status: 'clicked', ref: 1, method: 'click', x: 50, y: 25 };
      backend.axPress.mockResolvedValue(pressWithCoords);
      await tool.execute({ action: 'snapshot' });
      const result = await tool.execute({ action: 'press', ref: 1 });
      expect(result.type).toBe('text');
      if (result.type !== 'text') return;
      expect(result.result).toContain('50');
      expect(result.result).toContain('25');
    });
  });

  // ── Set value ─────────────────────────────────────────────────────────────

  describe('set_value action', () => {
    it('calls backend.axSetValue(ref, snapshotId, text) after snapshot', async () => {
      await tool.execute({ action: 'snapshot' });
      const result = await tool.execute({ action: 'set_value', ref: 2, text: 'hello' });
      expect(backend.axSetValue).toHaveBeenCalledWith(2, 'test-snapshot-001', 'hello');
      expect(result.status).toBe('success');
    });

    it('returns text result with ref and value', async () => {
      await tool.execute({ action: 'snapshot' });
      const result = await tool.execute({ action: 'set_value', ref: 2, text: 'hello' });
      expect(result.type).toBe('text');
      if (result.type !== 'text') return;
      expect(result.result).toContain('2');
      expect(result.result).toContain('hello');
    });

    it('returns error when ref is missing', async () => {
      await tool.execute({ action: 'snapshot' });
      const result = await tool.execute({ action: 'set_value', text: 'hello' });
      expect(result.status).toBe('error');
      expect(result.type).toBe('text');
      if (result.type === 'text') {
        expect(result.result).toContain('ref');
      }
    });

    it('returns error when text is missing', async () => {
      await tool.execute({ action: 'snapshot' });
      const result = await tool.execute({ action: 'set_value', ref: 2 });
      expect(result.status).toBe('error');
      expect(result.type).toBe('text');
      if (result.type === 'text') {
        expect(result.result).toContain('text');
      }
    });

    it('returns error when no snapshot taken yet', async () => {
      const freshTool = new ComputerUseTool(backend);
      const result = await freshTool.execute({ action: 'set_value', ref: 2, text: 'hello' });
      expect(result.status).toBe('error');
      expect(result.type).toBe('text');
      if (result.type === 'text') {
        expect(result.result).toContain('snapshot');
      }
    });

    it('returns note text when backend responds with "focused" status and note', async () => {
      const focusedResult: AXSetValueResult = {
        status: 'focused',
        ref: 2,
        note: 'Field focused; type text to set value',
      };
      backend.axSetValue.mockResolvedValue(focusedResult);
      await tool.execute({ action: 'snapshot' });
      const result = await tool.execute({ action: 'set_value', ref: 2, text: 'anything' });
      expect(result.status).toBe('success');
      expect(result.type).toBe('text');
      if (result.type !== 'text') return;
      expect(result.result).toContain('Field focused');
    });
  });

  // ── List apps ─────────────────────────────────────────────────────────────

  describe('list_apps action', () => {
    it('calls backend.listApps()', async () => {
      await tool.execute({ action: 'list_apps' });
      expect(backend.listApps).toHaveBeenCalledOnce();
    });

    it('returns text result with app names', async () => {
      const result = await tool.execute({ action: 'list_apps' });
      expect(result.status).toBe('success');
      expect(result.type).toBe('text');
      if (result.type !== 'text') return;
      expect(result.result).toContain('Arc');
      expect(result.result).toContain('Finder');
      expect(result.result).toContain('Notes');
    });
  });

  // ── Screenshot ─────────────────────────────────────────────────────────────

  describe('screenshot action', () => {
    it('calls backend.screenshot() without windowId when no app specified', async () => {
      await tool.execute({ action: 'screenshot' });
      expect(backend.screenshot).toHaveBeenCalledWith(undefined);
    });

    it('captures specific window when app is specified', async () => {
      await tool.execute({ action: 'screenshot', app: 'Safari' });
      expect(backend.getWindowId).toHaveBeenCalledWith('Safari');
      expect(backend.screenshot).toHaveBeenCalledWith(12345);
    });

    it('returns status=success, type=mixed', async () => {
      const result = await tool.execute({ action: 'screenshot' });
      expect(result.status).toBe('success');
      expect(result.type).toBe('mixed');
    });

    it('returns [TextContentPart, ImageContentPart] in result array', async () => {
      const result = await tool.execute({ action: 'screenshot' });
      expect(result.type).toBe('mixed');
      if (result.type !== 'mixed') return; // type narrowing

      const parts = result.result;
      expect(parts).toHaveLength(2);

      const [textPart, imagePart] = parts;

      // TextContentPart
      expect(textPart.type).toBe('text');
      expect((textPart as { type: string; text: string }).text).toContain('1920x1080');

      // ImageContentPart
      expect(imagePart.type).toBe('image');
      const img = imagePart as { type: string; mimeType: string; data: string };
      expect(img.mimeType).toBe('image/png');
      expect(img.data).toBe('iVBORw0KGgo=');
    });

    it('includes app name in text when app is specified', async () => {
      const result = await tool.execute({ action: 'screenshot', app: 'Safari' });
      if (result.type === 'mixed') {
        const textPart = result.result[0] as { type: string; text: string };
        expect(textPart.text).toContain('Safari');
      }
    });
  });

  // ── Type text ─────────────────────────────────────────────────────────────

  describe('type', () => {
    it('dispatches to backend.typeText() with the text', async () => {
      const result = await tool.execute({ action: 'type', text: 'Hello, World!' });
      expect(backend.typeText).toHaveBeenCalledWith('Hello, World!');
      expect(result.status).toBe('success');
    });

    it('returns error when text is missing', async () => {
      const result = await tool.execute({ action: 'type' });
      expect(result.status).toBe('error');
      if (result.type === 'text') {
        expect(result.result).toContain('text');
      }
    });
  });

  // ── Key press ─────────────────────────────────────────────────────────────

  describe('key', () => {
    it('dispatches to backend.pressKey() with the key string', async () => {
      const result = await tool.execute({ action: 'key', key: 'ctrl+s' });
      expect(backend.pressKey).toHaveBeenCalledWith('ctrl+s');
      expect(result.status).toBe('success');
    });

    it('dispatches single key "Return"', async () => {
      await tool.execute({ action: 'key', key: 'Return' });
      expect(backend.pressKey).toHaveBeenCalledWith('Return');
    });

    it('returns error when key is missing', async () => {
      const result = await tool.execute({ action: 'key' });
      expect(result.status).toBe('error');
      if (result.type === 'text') {
        expect(result.result).toContain('key');
      }
    });
  });

  // ── Scroll ────────────────────────────────────────────────────────────────

  describe('scroll', () => {
    // ── Ref mode ─────────────────────────────────────────────────────────

    it('ref mode: calls backend.axScroll(ref, snapshotId) after snapshot', async () => {
      await tool.execute({ action: 'snapshot' });
      const result = await tool.execute({ action: 'scroll', ref: 1 });
      expect(backend.axScroll).toHaveBeenCalledWith(1, 'test-snapshot-001');
      expect(result.status).toBe('success');
      expect(result.type).toBe('text');
      if (result.type === 'text') {
        expect(result.result).toContain('ref:1');
        expect(result.result).toContain('AXScrollToVisible');
      }
    });

    it('ref mode: activates lastApp before scrolling', async () => {
      await tool.execute({ action: 'snapshot' });
      await tool.execute({ action: 'scroll', ref: 1 });
      expect(backend.activateApp).toHaveBeenCalledWith('TestApp');
    });

    it('ref mode: returns error when no snapshot taken yet', async () => {
      const freshTool = new ComputerUseTool(backend);
      const result = await freshTool.execute({ action: 'scroll', ref: 1 });
      expect(result.status).toBe('error');
      if (result.type === 'text') {
        expect(result.result).toContain('snapshot');
      }
    });

    it('ref mode: includes coordinate info when backend returns x/y', async () => {
      backend.axScroll.mockResolvedValue({ status: 'scrolled', ref: 5, method: 'CGEvent', x: 400, y: 300, lines: 5 });
      await tool.execute({ action: 'snapshot' });
      const result = await tool.execute({ action: 'scroll', ref: 5 });
      expect(result.type).toBe('text');
      if (result.type === 'text') {
        expect(result.result).toContain('400');
        expect(result.result).toContain('300');
        expect(result.result).toContain('5 lines');
      }
    });

    // ── Point mode fallback ──────────────────────────────────────────────

    it('point mode: dispatches to backend.scroll() at screen center when no ref', async () => {
      const result = await tool.execute({ action: 'scroll', direction: 'up', amount: 5 });
      expect(backend.getScreenSize).toHaveBeenCalledOnce();
      expect(backend.scroll).toHaveBeenCalledWith(960, 540, 'up', 5);
      expect(result.status).toBe('success');
    });

    it('point mode: dispatches direction=down', async () => {
      await tool.execute({ action: 'scroll', direction: 'down', amount: 3 });
      expect(backend.scroll).toHaveBeenCalledWith(960, 540, 'down', 3);
    });

    it('point mode: dispatches direction=left', async () => {
      await tool.execute({ action: 'scroll', direction: 'left', amount: 2 });
      expect(backend.scroll).toHaveBeenCalledWith(960, 540, 'left', 2);
    });

    it('point mode: dispatches direction=right', async () => {
      await tool.execute({ action: 'scroll', direction: 'right', amount: 4 });
      expect(backend.scroll).toHaveBeenCalledWith(960, 540, 'right', 4);
    });

    it('point mode: uses default amount=3 when omitted', async () => {
      await tool.execute({ action: 'scroll', direction: 'up' });
      expect(backend.scroll).toHaveBeenCalledWith(960, 540, 'up', 3);
    });

    it('point mode: returns error when direction is missing and no ref', async () => {
      const result = await tool.execute({ action: 'scroll' });
      expect(result.status).toBe('error');
      if (result.type === 'text') {
        expect(result.result).toContain('direction');
      }
    });
  });

  // ── Wait ──────────────────────────────────────────────────────────────────

  describe('wait', () => {
    it('delays for approximately the given duration (50ms)', async () => {
      const start = Date.now();
      const result = await tool.execute({ action: 'wait', duration: 50 });
      const elapsed = Date.now() - start;

      expect(result.status).toBe('success');
      expect(result.type).toBe('text');
      // Should have waited at least 45ms (allow 10ms slack for timing jitter)
      expect(elapsed).toBeGreaterThanOrEqual(45);
      // Should not have called any backend method
      expect(backend.axSnapshot).not.toHaveBeenCalled();
      expect(backend.screenshot).not.toHaveBeenCalled();
    });

    it('returns confirmation text mentioning the wait duration', async () => {
      const result = await tool.execute({ action: 'wait', duration: 50 });
      expect(result.type).toBe('text');
      if (result.type !== 'text') return;
      expect(result.result).toContain('50');
    });

    it('uses default duration=1000 when duration is omitted', async () => {
      vi.useFakeTimers();
      const promise = tool.execute({ action: 'wait' });
      vi.advanceTimersByTime(1000);
      const result = await promise;
      vi.useRealTimers();

      expect(result.status).toBe('success');
      if (result.type === 'text') {
        expect(result.result).toContain('1000');
      }
    });
  });

  // ── Annotated screenshot action ─────────────────────────────────────────────

  describe('annotated_screenshot action', () => {
    it('takes snapshot + screenshot + annotate and returns mixed result', async () => {
      const result = await tool.execute({ action: 'annotated_screenshot' });
      expect(result.status).toBe('success');
      expect(result.type).toBe('mixed');

      // Should have called axSnapshot, getWindowId, screenshot, getScreenSize, and annotateScreenshot
      expect(backend.axSnapshot).toHaveBeenCalledOnce();
      expect(backend.getWindowId).toHaveBeenCalledOnce();
      expect(backend.screenshot).toHaveBeenCalledOnce();
      expect(backend.screenshot).toHaveBeenCalledWith(12345);
      expect(backend.getScreenSize).toHaveBeenCalledOnce();
      expect(backend.annotateScreenshot).toHaveBeenCalledOnce();
    });

    it('returns tree text as first content part', async () => {
      const result = await tool.execute({ action: 'annotated_screenshot' });
      expect(result.type).toBe('mixed');
      if (result.type === 'mixed') {
        const parts = result.result;
        expect(parts.length).toBe(2);
        expect(parts[0]!.type).toBe('text');
        if (parts[0]!.type === 'text') {
          expect(parts[0]!.text).toContain('[App: TestApp');
          expect(parts[0]!.text).toContain('[ref:1]');
        }
      }
    });

    it('returns annotated image as second content part', async () => {
      const result = await tool.execute({ action: 'annotated_screenshot' });
      if (result.type === 'mixed') {
        const imagePart = result.result[1]!;
        expect(imagePart.type).toBe('image');
        if (imagePart.type === 'image') {
          expect(imagePart.data).toBe('iVBORw0KGgoAnnotated=');
          expect(imagePart.mimeType).toBe('image/png');
        }
      }
    });

    it('sets lastSnapshotId so press works after', async () => {
      await tool.execute({ action: 'annotated_screenshot' });
      const pressResult = await tool.execute({ action: 'press', ref: 1 });
      expect(pressResult.status).toBe('success');
      expect(backend.axPress).toHaveBeenCalledWith(1, 'test-snapshot-001');
    });

    it('sets lastApp so type activates app after', async () => {
      await tool.execute({ action: 'annotated_screenshot' });
      await tool.execute({ action: 'type', text: 'hello' });
      expect(backend.activateApp).toHaveBeenCalledWith('TestApp');
    });

    it('passes app parameter through to axSnapshot', async () => {
      await tool.execute({ action: 'annotated_screenshot', app: 'Safari' });
      expect(backend.axSnapshot).toHaveBeenCalledWith('Safari', undefined, undefined, 'leafCompact');
    });

    it('passes elements to annotateScreenshot with correct scale', async () => {
      await tool.execute({ action: 'annotated_screenshot' });

      // With MOCK_SCREENSHOT (1920x1080, scaleFactor=1.0) and MOCK_SCREEN_SIZE (1920x1080):
      // retinaScale = (1920 * 1.0) / 1920 = 1.0
      // annotateScale = 1.0 / 1.0 = 1.0
      // windowOrigin comes from MOCK getWindowId bounds: { x: 100, y: 200 }
      expect(backend.annotateScreenshot).toHaveBeenCalledWith(
        MOCK_SNAPSHOT.elements,
        MOCK_SCREENSHOT.data,
        MOCK_SCREENSHOT.width,
        MOCK_SCREENSHOT.height,
        1.0,
        { x: 100, y: 200 },
      );
    });

    it('computes correct scale for retina displays', async () => {
      // Simulate retina: captured at 3840px, resized to 1568px, screen 1920 points
      backend.screenshot.mockResolvedValue({
        ...MOCK_SCREENSHOT,
        width: 1568,
        height: 882,
        scaleFactor: 3840 / 1568, // ~2.449
      });
      backend.getScreenSize.mockResolvedValue({ width: 1920, height: 1080 });

      await tool.execute({ action: 'annotated_screenshot' });

      // retinaScale = (1568 * 2.449) / 1920 ≈ 2.0
      // annotateScale = 2.0 / 2.449 ≈ 0.817
      const call = backend.annotateScreenshot.mock.calls[0]!;
      const passedScale = call[4] as number;
      expect(passedScale).toBeCloseTo(0.817, 2);
    });

    it('returns error when annotateScreenshot fails', async () => {
      backend.annotateScreenshot.mockRejectedValue(new Error('ax-helper annotate failed'));

      const result = await tool.execute({ action: 'annotated_screenshot' });
      expect(result.status).toBe('error');
      if (result.type === 'text') {
        expect(result.result).toContain('ax-helper annotate failed');
      }
    });

    it('falls back to full-screen capture when getWindowId fails', async () => {
      backend.getWindowId.mockRejectedValue(new Error('No on-screen window found'));

      const result = await tool.execute({ action: 'annotated_screenshot' });
      expect(result.status).toBe('success');
      expect(backend.screenshot).toHaveBeenCalledWith(undefined);
    });
  });

  // ── Unknown action ────────────────────────────────────────────────────────

  describe('unknown action', () => {
    it('returns error result for an unrecognized action string', async () => {
      // Cast to bypass TypeScript's exhaustive check
      const result = await tool.execute({ action: 'fly_to_moon' as never });
      expect(result.status).toBe('error');
      expect(result.type).toBe('text');
      if (result.type === 'text') {
        expect(result.result).toContain('fly_to_moon');
      }
    });
  });

  // ── Backend exception handling ─────────────────────────────────────────────

  describe('backend exception handling', () => {
    it('returns error result when backend.axSnapshot() throws', async () => {
      backend.axSnapshot.mockRejectedValue(new Error('ax-helper is not compiled'));

      const result = await tool.execute({ action: 'snapshot' });
      expect(result.status).toBe('error');
      expect(result.type).toBe('text');
      if (result.type === 'text') {
        expect(result.result).toContain('ax-helper is not compiled');
      }
    });

    it('returns error result when backend.axPress() throws', async () => {
      backend.axPress.mockRejectedValue(new Error('element not found in snapshot'));

      await tool.execute({ action: 'snapshot' });
      const result = await tool.execute({ action: 'press', ref: 99 });
      expect(result.status).toBe('error');
      expect(result.type).toBe('text');
      if (result.type === 'text') {
        expect(result.result).toContain('element not found in snapshot');
      }
    });

    it('returns error result when backend.screenshot() throws', async () => {
      backend.screenshot.mockRejectedValue(new Error('screencapture failed: permission denied'));

      const result = await tool.execute({ action: 'screenshot' });
      expect(result.status).toBe('error');
      if (result.type === 'text') {
        expect(result.result).toContain('screencapture failed');
      }
    });

    it('returns error result when backend throws a non-Error value', async () => {
      backend.axSnapshot.mockRejectedValue('something went wrong');

      const result = await tool.execute({ action: 'snapshot' });
      expect(result.status).toBe('error');
      if (result.type === 'text') {
        expect(result.result).toContain('something went wrong');
      }
    });
  });
});
