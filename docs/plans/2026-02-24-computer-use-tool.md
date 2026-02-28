# Computer Use Tool Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a built-in `computer` tool that provides desktop automation — screenshots, mouse, keyboard, scroll — matching Anthropic's `computer_use` action set, powered by macOS native CLI tools.

**Architecture:** A single `computer` tool with an `action` parameter (like Anthropic's `computer_20250124`) dispatches to a platform-specific backend. v1 implements only macOS, using `screencapture` (screenshots), `cliclick` (mouse/keyboard via Homebrew), and `python3 + Quartz` (scroll via CGEvents). Screenshots return as `mixed` type results containing `ImageContentPart`, which the orchestrator already handles for LLM vision.

**Tech Stack:** Node.js `child_process.spawn`, macOS native tools. Zero npm dependencies.

---

## Tasks

### Task 1: Types and ComputerBackend Interface

**Create** `packages/nuvin-core/src/tools/computer/types.ts`

Define the type system for the tool:
- `Coordinate` tuple `[x, y]`
- Discriminated union `ComputerAction` with one variant per action (`ScreenshotAction`, `LeftClickAction`, etc.)
- `ComputerActionResult` — either `ScreenshotResult` (base64 + dimensions) or `TextResult` (confirmation message)
- `ComputerBackend` interface with methods: `screenshot()`, `click()`, `mouseMove()`, `clickDrag()`, `typeText()`, `pressKey()`, `scroll()`, `getScreenSize()`

The interface enables future platform backends (Linux, Windows) without changing the tool layer.

---

### Task 2: macOS Backend

**Create** `packages/nuvin-core/src/tools/computer/macos-backend.ts`

Implement `ComputerBackend` for macOS using native CLI tools:

- **screenshot()** — `screencapture -x -C <tmpfile>`, read as base64, clean up temp file
- **click()** — `cliclick c:X,Y` / `dc:` / `tc:` / `rc:` based on button and click count
- **mouseMove()** — `cliclick m:X,Y`
- **clickDrag()** — `cliclick dd:X,Y du:X,Y`
- **typeText()** — `cliclick t:<text>`
- **pressKey()** — single keys via `cliclick kp:<key>`, combos like `ctrl+s` via `kd:ctrl kp:s ku:ctrl`
- **scroll()** — `python3 -c "import Quartz; ..."` using `CGEventCreateScrollWheelEvent` for reliable native scrolling
- **getScreenSize()** — AppleScript `tell application "Finder" to get bounds of window of desktop`, fallback to `system_profiler`

Include a `cliclick` availability check that caches the result and throws a helpful error with `brew install cliclick` instructions.

Private helpers:
- `exec(command, args)` — spawn wrapper with stdout/stderr capture
- `translateKey(key)` — map Anthropic key names (Return, ArrowUp, F5...) to cliclick names
- `translateModifier(mod)` — map modifier names (ctrl, cmd, meta, option) to cliclick modifiers
- `buildClickArgs(x, y, button, clickCount)` — produce correct cliclick command string

---

### Task 3: ComputerUseTool (FunctionTool)

**Create** `packages/nuvin-core/src/tools/ComputerUseTool.ts`

Implement `FunctionTool<ComputerUseParams, ToolExecutionContext, ComputerUseResult>`:

- **name:** `'computer'`
- **constructor:** accepts optional `ComputerBackend` (for testing); defaults to `MacOSBackend` on darwin, throws on other platforms
- **parameters:** JSON Schema with `action` enum, plus optional `coordinate`, `start_coordinate`, `text`, `key`, `direction`, `amount`, `duration`
- **definition():** returns tool name + description + parameters schema
- **execute():** switch on `params.action`, delegate to backend methods, wrap results:
  - `screenshot` → return `{ type: 'mixed', result: [TextContentPart, ImageContentPart] }`
  - All other actions → return `{ type: 'text', result: 'confirmation message' }`
  - Errors → return `{ status: 'error', type: 'text', result: error.message }`

The `mixed` result type is critical — it's how the orchestrator (`orchestrator.ts:945`) passes images to the LLM as vision content parts.

---

### Task 4: Register in ToolRegistry

**Modify** `packages/nuvin-core/src/tools.ts`

- Import `ComputerUseTool`
- Add to `toolInstances` array, guarded by `process.platform === 'darwin'`
- The tool auto-appears in `getToolDefinitions()` when `'computer'` is in the enabled tools list

**Modify** `packages/nuvin-core/src/index.ts`

- Export `ComputerUseTool`, `ComputerUseParams`, `ComputerUseResult`
- Export types from `computer/types.ts`: `ComputerAction`, `ComputerBackend`

---

### Task 5: CLI Render Config

**Modify** `packages/nuvin-cli/source/components/ToolCallViewer/registry.ts`

Add a `computer` entry to `TOOL_REGISTRY`:

- **displayName:** context-aware — show action name while running (e.g., "Capturing screenshot", "Computer: left_click")
- **statusText:** for screenshots show "Screenshot captured", for actions show the confirmation text
- **excludeParams:** hide all params (action, coordinate, text, key, etc.) from expanded view since the header shows the action
- **renderResult: null** — screenshots go to LLM via mixed results, not rendered in CLI terminal
- **collapsedByDefault: true**

---

### Task 6: Unit Tests

**Create** `packages/nuvin-core/tests/computer-use-backend.test.ts`

Test pure logic in `MacOSBackend` without system calls:
- `buildClickArgs()` — verify correct cliclick commands for left/right/double/triple click
- `translateKey()` — verify key name mapping (Return→return, ArrowUp→arrow-up, F5→f5, passthrough)
- `translateModifier()` — verify modifier mapping (meta→cmd, option→alt)

**Create** `packages/nuvin-core/tests/computer-use-tool.test.ts`

Test `ComputerUseTool` with a mock `ComputerBackend`:
- Screenshot returns `mixed` result with `ImageContentPart`
- Each mouse action dispatches correct backend method with correct args
- Keyboard actions dispatch to `typeText`/`pressKey`
- Scroll dispatches with direction and amount
- Wait actually delays
- Unknown action returns error
- Backend exception surfaces as error result

Run: `cd packages/nuvin-core && npx vitest run tests/computer-use-*.test.ts`

---

### Task 7: Build Verification

- `cd packages/nuvin-core && npx tsc --noEmit` — no type errors
- `cd packages/nuvin-cli && npx tsc --noEmit` — no type errors
- `cd packages/nuvin-core && npx vitest run` — all tests pass

---

## Prerequisites

- **cliclick** — `brew install cliclick` (mouse/keyboard control)
- **python3** — ships with macOS (used for Quartz scroll events)
- **Accessibility permissions** — macOS requires granting accessibility access to the terminal app running nuvin (System Settings → Privacy & Security → Accessibility)
- **Screen Recording permission** — required for `screencapture` to capture the full screen

---

## Architecture Diagram

```
┌─────────────────────────────────┐
│         LLM (Claude)            │
│  Sends: { tool: "computer",    │
│    action: "screenshot" }       │
└──────────────┬──────────────────┘
               │ tool call
               ▼
┌─────────────────────────────────┐
│      ComputerUseTool            │
│  (FunctionTool implementation)  │
│  - Validates params             │
│  - Dispatches to backend        │
│  - Formats results              │
│    (text or mixed/image)        │
└──────────────┬──────────────────┘
               │ backend.method()
               ▼
┌─────────────────────────────────┐
│      ComputerBackend            │
│  (interface)                    │
│                                 │
│  ┌───────────────────────────┐  │
│  │   MacOSBackend (v1)       │  │
│  │   - screencapture (PNG)   │  │
│  │   - cliclick (mouse/kbd)  │  │
│  │   - python3+Quartz(scroll)│  │
│  │   - osascript (screen sz) │  │
│  └───────────────────────────┘  │
│                                 │
│  ┌───────────────────────────┐  │
│  │   LinuxBackend (future)   │  │
│  │   WindowsBackend (future) │  │
│  └───────────────────────────┘  │
└─────────────────────────────────┘
               │
               ▼
┌─────────────────────────────────┐
│      Orchestrator               │
│  - mixed result → vision parts  │
│  - text result → message        │
│  (orchestrator.ts:945)          │
└─────────────────────────────────┘
```

---

## Existing Code References

| What | Where | Why it matters |
|------|-------|----------------|
| FunctionTool interface | `nuvin-core/src/tools/types.ts` | ComputerUseTool implements this |
| Result helpers (`okText`, `err`) | `nuvin-core/src/tools/result-helpers.ts` | Use for text results and errors |
| Mixed result handling | `nuvin-core/src/orchestrator.ts:945-946` | Converts `mixed` results to LLM vision content parts |
| ImageContentPart type | `nuvin-core/src/ports.ts:46-53` | Type for base64 image data in mixed results |
| ToolRegistry constructor | `nuvin-core/src/tools.ts:60-75` | Where to add ComputerUseTool to toolInstances |
| Tool render registry | `nuvin-cli/source/components/ToolCallViewer/registry.ts` | Where to add CLI display config |
| BashTool (reference impl) | `nuvin-core/src/tools/BashTool.ts` | Pattern for spawn-based tool with timeout/error handling |
| flattenMcpContent | `nuvin-core/src/mcp/mcp-tools.ts:44-58` | Shows how mixed results are constructed (same pattern) |

---

## Future Work (Out of Scope)

- **Cross-platform backends** — Linux (xdotool + scrot), Windows (PowerShell + nircmd)
- **Coordinate scaling** — auto-resize screenshots to API size limits and scale coordinates back
- **zoom action** — Anthropic's `computer_20251124` adds `zoom` for region inspection
- **Screen recording permission check** — detect and prompt if screencapture returns blank
- **hold_key action** — hold a key for a duration (Anthropic `computer_20250124`)
- **Configurable display** — support `display_number` for multi-monitor setups

## Key Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Tool granularity | Single tool with `action` param | Matches Anthropic spec, fewer tool definitions |
| Platform scope | macOS only (v1) | User's platform; backend interface enables future expansion |
| Mouse/keyboard | `cliclick` (Homebrew) | Lightweight, well-maintained, supports all click types + key combos |
| Screenshots | `screencapture` (built-in) | Ships with macOS, no dependencies |
| Scroll | `python3` + `Quartz.CGEvent` | macOS ships python3; CGEvent is the reliable scroll API |
| Result format | `mixed` (text + image) for screenshots; `text` for actions | Leverages existing orchestrator image pipeline |

---

## Supported Actions

| Action | Parameters | Notes |
|--------|-----------|-------|
| `screenshot` | — | Returns base64 PNG via `ImageContentPart` |
| `left_click` | `coordinate: [x, y]` | cliclick `c:` |
| `right_click` | `coordinate: [x, y]` | cliclick `rc:` |
| `middle_click` | `coordinate: [x, y]` | cliclick `ctrl+click` fallback |
| `double_click` | `coordinate: [x, y]` | cliclick `dc:` |
| `triple_click` | `coordinate: [x, y]` | cliclick `tc:` |
| `mouse_move` | `coordinate: [x, y]` | cliclick `m:` |
| `left_click_drag` | `coordinate`, `start_coordinate` | cliclick `dd:` + `du:` |
| `type` | `text: string` | cliclick `t:` |
| `key` | `key: string` | Supports combos like `ctrl+s` via `kd:`/`kp:`/`ku:` |
| `scroll` | `coordinate`, `direction`, `amount` | python3 Quartz CGEvent scroll wheel |
| `wait` | `duration: number` (seconds) | `setTimeout` in Node |

---

## Files

| File | Action | Purpose |
|------|--------|---------|
| `packages/nuvin-core/src/tools/computer/types.ts` | Create | Action union types, `ComputerBackend` interface, result types |
| `packages/nuvin-core/src/tools/computer/macos-backend.ts` | Create | macOS-native backend: screencapture, cliclick, Quartz scroll |
| `packages/nuvin-core/src/tools/ComputerUseTool.ts` | Create | `FunctionTool` implementation — action dispatch, result formatting |
| `packages/nuvin-core/src/tools.ts` | Modify | Register `ComputerUseTool` in `ToolRegistry` (macOS only) |
| `packages/nuvin-core/src/index.ts` | Modify | Export new tool and types |
| `packages/nuvin-cli/source/components/ToolCallViewer/registry.ts` | Modify | Add `computer` entry to CLI render registry |
| `packages/nuvin-core/tests/computer-use-backend.test.ts` | Create | Unit tests for backend arg-building and key translation |
| `packages/nuvin-core/tests/computer-use-tool.test.ts` | Create | Unit tests for action dispatch with mock backend |

---
