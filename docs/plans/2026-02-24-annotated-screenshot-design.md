# Annotated Screenshot: Vimium-style Ref Hints

**Date**: 2026-02-24
**Status**: Design

## Problem

The computer tool offers two separate actions for understanding UI:
- `snapshot` — returns the accessibility tree as text (fast, cheap, semantic)
- `screenshot` — returns a raw screenshot image (visual context, expensive)

When the LLM needs both, it must call two actions. More importantly, there's no spatial mapping between the ref numbers in the tree and the elements visible in the screenshot. The LLM has to mentally correlate "ref:5 is a Button titled 'Submit'" with where it sees a Submit button in the image.

## Solution

A new `annotated_screenshot` action that:
1. Takes an AX snapshot (tree with element positions)
2. Takes a screenshot
3. Overlays numeric ref badges onto the screenshot at each interactive element's position
4. Returns both the formatted tree text AND the annotated image

This mirrors Vimium C's approach — overlaying hint identifiers on visible UI elements — but uses the existing integer refs from the AX tree instead of letter codes.

## Design

### New Action: `annotated_screenshot`

**Parameters**: `app?: string` (same as `snapshot`)

**Returns**: `mixed` result — `[TextContentPart(tree), ImageContentPart(annotated PNG)]`

**Flow**:
```
axSnapshot(app) → AXSnapshotResult (tree with pos/size)
screenshot()    → ScreenshotResult (resized PNG + scaleFactor)
ax-helper annotate <input.png> <output.png> --scale <factor>
  stdin: JSON array of {ref, x, y, w, h}
→ Annotated PNG with ref badges
```

### Badge Style

- **Shape**: Rounded-rect pill (corner radius 3px)
- **Background**: Red (#E53935), 90% opacity
- **Text**: White, bold, 10pt system font
- **Content**: Just the ref number (e.g., `3`, `17`, `42`)
- **Position**: Centered on the element's top-left corner
- **Filtering**: Only elements with `pos` + `size` AND at least one action (interactive elements)

### Scale Factor Handling

The screenshot goes through a resize pipeline (max 1568px long edge, max ~1.15MP). Annotation happens AFTER resize. The scale factor passed to `ax-helper annotate` converts AX screen-point coordinates to resized-image pixel coordinates:

```
imagePixel = screenPoint × retinaScale / resizeScaleFactor
```

Where:
- `retinaScale` = 2.0 on Retina Macs (captured pixels / screen points)
- `resizeScaleFactor` = `capturedPixels / resizedPixels` (from screenshot() result)
- Combined: `scale = retinaScale / resizeScaleFactor`

Passed as `--scale <float>` CLI arg.

### Swift `annotate` Command

New subcommand in `ax-helper/main.swift`:

```
ax-helper annotate <input-png> <output-png> --scale <float>
```

Reads JSON from stdin:
```json
[{"ref": 1, "x": 100, "y": 200, "w": 80, "h": 30}, ...]
```

Uses Core Graphics to:
1. Load input PNG as CGImage
2. Create bitmap context at image dimensions
3. Draw original image
4. For each element: draw red pill badge with white ref number
5. Write output PNG

### Backend Integration

New method on `ComputerBackend`:
```typescript
annotateScreenshot(
  elements: AXElement[],
  screenshotData: string,    // base64 PNG (already resized)
  screenshotWidth: number,
  screenshotHeight: number,
  scaleFactor: number,       // combined retina/resize scale
): Promise<{ data: string; mimeType: string }>;
```

### ComputerUseTool Changes

- Add `'annotated_screenshot'` to action enum
- New dispatch case combining snapshot + screenshot + annotate
- Sets `lastSnapshotId` and `lastApp` (same as `snapshot`)

### Files Changed

1. `packages/nuvin-core/src/tools/computer/ax-helper/main.swift` — new `annotate` command
2. `packages/nuvin-core/src/tools/computer/types.ts` — `annotateScreenshot` on interface
3. `packages/nuvin-core/src/tools/computer/macos-backend.ts` — implement `annotateScreenshot()`
4. `packages/nuvin-core/src/tools/ComputerUseTool.ts` — new action + dispatch
5. `packages/nuvin-core/src/tools/tool-validators.ts` — update schema
6. `packages/nuvin-core/src/tools/tool-params.ts` — update types
7. `packages/nuvin-cli/source/components/ToolCallViewer/registry.ts` — display name
8. `packages/nuvin-cli/source/agents/nuvin-agent.md` — system prompt update
9. Tests for new action + backend method
