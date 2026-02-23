# Statusline Config Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a `/statusline` command that lets users configure which footer segments are shown and in what order across two configurable rows.

**Architecture:** The config stores `ui.statusline.rows` as a `StatuslineSegment[][]` — two arrays each listing segment keys in render order. The Footer component reads this to render each row data-driven. The `/statusline` command opens an interactive TUI modal for toggling and reordering segments across rows.

**Tech Stack:** TypeScript, React/Ink (TUI), existing command registry pattern, ConfigContext

---

### Task 1: Add `StatuslineConfig` types

**Files:**
- Modify: `packages/nuvin-cli/source/config/types.ts`

All 12 segment keys:
```
session | thinking | sudo | tokens | context | cached | requests | tools | cost | lsp | gitBranch | keybindings
```

**Step 1: Add types**

In `types.ts`, add after the `UIThemeSettings` interface:

```typescript
export type StatuslineSegment =
  | 'session'
  | 'thinking'
  | 'sudo'
  | 'tokens'
  | 'context'
  | 'cached'
  | 'requests'
  | 'tools'
  | 'cost'
  | 'lsp'
  | 'gitBranch'
  | 'keybindings';

export interface StatuslineConfig {
  /** Two rows of segments. Each row is an ordered list of segment keys.
   * Segments not listed in either row are hidden.
   * Default: all segments in visual order across 2 rows. */
  rows?: [StatuslineSegment[], StatuslineSegment[]];
}
```

In `CLIConfig.ui`, add `statusline`:
```typescript
ui?: {
  theme?: UIThemeSettings;
  statusline?: StatuslineConfig;
};
```

**Step 2: Check diagnostics**

Run: `pnpm --filter nuvin-cli tsc --noEmit`
Expected: No new errors.

**Step 3: Commit**

```bash
git add packages/nuvin-cli/source/config/types.ts
git commit -m "feat(statusline): add StatuslineConfig types"
```

---

### Task 2: Add default segment layout constant

**Files:**
- Modify: `packages/nuvin-cli/source/components/Footer.tsx`

The default layout (used when `ui.statusline.rows` is absent) mirrors the current hardcoded layout:

```typescript
export const DEFAULT_STATUSLINE_ROWS: [StatuslineSegment[], StatuslineSegment[]] = [
  ['session', 'thinking', 'sudo', 'tokens', 'context', 'cached', 'requests', 'tools', 'cost', 'lsp'],
  ['gitBranch', 'keybindings'],
];
```

Export this constant from `Footer.tsx` so the command can reference it when resetting to defaults.

**Step 1: Add import and constant**

At the top of `Footer.tsx`, add:
```typescript
import type { StatuslineSegment } from '@/config/types.js';

export const DEFAULT_STATUSLINE_ROWS: [StatuslineSegment[], StatuslineSegment[]] = [
  ['session', 'thinking', 'sudo', 'tokens', 'context', 'cached', 'requests', 'tools', 'cost', 'lsp'],
  ['gitBranch', 'keybindings'],
];
```

**Step 2: Check diagnostics**

Run: `pnpm --filter nuvin-cli tsc --noEmit`
Expected: No errors.

**Step 3: Commit**

```bash
git add packages/nuvin-cli/source/components/Footer.tsx
git commit -m "feat(statusline): add DEFAULT_STATUSLINE_ROWS constant"
```

---

### Task 3: Refactor Footer to data-driven segment rendering

**Files:**
- Modify: `packages/nuvin-cli/source/components/Footer.tsx`

Replace the hardcoded two-row layout with a data-driven render loop. Each row is an array of segment keys; for each key, render the corresponding JSX fragment (or null if conditions not met, e.g. no metrics).

**Step 1: Add config read inside `FooterComponent`**

```typescript
const rows = get<[StatuslineSegment[], StatuslineSegment[]]>('ui.statusline.rows') ?? DEFAULT_STATUSLINE_ROWS;
const [row1, row2] = rows;
```

**Step 2: Build segment renderers**

Replace the inline render logic with a `renderSegment(key: StatuslineSegment): React.ReactNode` function defined inside the component (or just use a switch/map inline).

Each case:

- `'session'`: `sessionId ? <Text ...>Session: {sessionId}</Text> : null` — rendered as part of the joined status string (see below)
- `'thinking'`: thinking indicator in the status string
- `'sudo'`: SUDO in the status string
- `'tokens'`: `metrics?.currentTokens || metrics?.totalTokens ? <Text ...>Tokens: ...</Text> : null`
- `'context'`: `metrics?.contextWindowLimit && metrics.contextWindowUsage !== undefined ? <Text ...>({pct}%)</Text> : null`
- `'cached'`: `metrics?.currentCachedTokens > 0 ? <Text ...>Cached: ...</Text> : null`
- `'requests'`: `metrics?.llmCallCount > 0 ? <Text ...>Req: {llmCallCount}</Text> : null`
- `'tools'`: `metrics?.toolCallCount > 0 ? <Text ...>Tools: {toolCallCount}</Text> : null`
- `'cost'`: `metrics?.totalCost > 0 ? <Text ...>${formatCost(totalCost)}</Text> : null`
- `'lsp'`: `lspTotal > 0 ? <Text ...>LSP: {lspConnected}/{lspTotal}</Text> : null`
- `'gitBranch'`: `gitBranch ? <Text ...>:{gitBranch}</Text> : null`
- `'keybindings'`: `<Text dimColor>/ command · ESC×2 stop</Text>`

Note: `session`, `thinking`, `sudo` are currently rendered as a single joined string. With the reorder feature they should each become independent `<Text>` nodes separated by ` | ` (a pipe separator). This changes the render approach slightly — instead of joining, render them as `<Text> | </Text>` between active items.

**Step 3: Row 1 render**

Row 1 has two logical zones: left (status items: session, thinking, sudo) and right (metrics). The current layout uses `justifyContent="space-between"`. With fully free placement, we keep this: segments that are "status" type (session, thinking, sudo) render left, and "metrics" type (tokens, context, etc.) render right. The classification:

- Left group (status): `session`, `thinking`, `sudo`
- Right group (metrics): `tokens`, `context`, `cached`, `requests`, `tools`, `cost`, `lsp`

Within each group, segments render in the order they appear in `row1`. If a segment from the left group appears in row1, it goes in the left `<Box>`; right-group segments go in the right `<Box>`.

**Step 4: Row 2 render**

Row 2 similarly: left-group segments (`gitBranch`) in left `<Box>`, right-group (`keybindings`) in right `<Box>`. But since fully free placement is supported, any segment can be placed in row2. Classification:

- Left group for row 2: `gitBranch` (and status items if user moves them there)
- Right group for row 2: `keybindings` (and metrics items if user moves them there)

To keep this simple without a left/right designation per-segment, use this heuristic: **the first half of the row goes left, the second half goes right** — but this is fragile. 

**Better approach:** Keep the left/right classification per segment fixed (it's cosmetic, not functional), and let "fully free" mean users can move any segment to either row. The left/right within a row is determined by the segment's inherent alignment:

```typescript
const LEFT_ALIGNED: StatuslineSegment[] = ['session', 'thinking', 'sudo', 'gitBranch'];
const RIGHT_ALIGNED: StatuslineSegment[] = ['tokens', 'context', 'cached', 'requests', 'tools', 'cost', 'lsp', 'keybindings'];
```

Within each rendered row, partition segments into left-aligned and right-aligned groups (preserving the user's order within each partition), then render left `<Box>` and right `<Box>` with `justifyContent="space-between"`.

**Step 5: Check diagnostics and existing tests**

```bash
pnpm --filter nuvin-cli tsc --noEmit
pnpm --filter nuvin-cli test --run
```

Expected: no errors, existing footer tests pass.

**Step 6: Commit**

```bash
git add packages/nuvin-cli/source/components/Footer.tsx
git commit -m "feat(statusline): data-driven footer segment rendering"
```

---

### Task 4: Build `/statusline` command

**Files:**
- Create: `packages/nuvin-cli/source/modules/commands/definitions/statusline.tsx`

This is a `ComponentCommand` that opens an AppModal with a two-panel segment editor.

**Step 1: Plan the modal state**

```typescript
type SegmentEditorState = {
  rows: [StatuslineSegment[], StatuslineSegment[]];  // mutable copy
  cursor: { row: number; index: number };            // which segment is focused
};
```

**Step 2: Write the component**

```tsx
import React, { useState } from 'react';
import { Box, Text } from 'ink';
import { useInput } from '@/contexts/InputContext/index.js';
import { AppModal } from '@/components/AppModal.js';
import { useTheme } from '@/contexts/ThemeContext.js';
import type { CommandComponentProps, CommandRegistry } from '@/modules/commands/types.js';
import type { StatuslineSegment } from '@/config/types.js';
import { DEFAULT_STATUSLINE_ROWS } from '@/components/Footer.js';
import * as crypto from 'node:crypto';

// Human-readable labels
const SEGMENT_LABELS: Record<StatuslineSegment, string> = {
  session:     'Session ID',
  thinking:    'Thinking level',
  sudo:        'SUDO indicator',
  tokens:      'Token count',
  context:     'Context %',
  cached:      'Cached tokens',
  requests:    'LLM requests',
  tools:       'Tool calls',
  cost:        'Cost',
  lsp:         'LSP status',
  gitBranch:   'Git branch',
  keybindings: 'Keybindings',
};

const ALL_SEGMENTS: StatuslineSegment[] = [
  'session', 'thinking', 'sudo',
  'tokens', 'context', 'cached', 'requests', 'tools', 'cost', 'lsp',
  'gitBranch', 'keybindings',
];
```

**Keyboard controls:**
- `↑`/`↓`: move cursor within row
- `←`/`→`: switch active row (row 0 ↔ row 1)
- `m`: move focused segment to the other row (appends to end of that row)
- `u`: move focused segment up within its row
- `d`: move focused segment down within its row
- `x` or `delete`: remove segment from its row (hidden)
- `a`: if cursor is on an empty "hidden segments" list — add a hidden segment back
- `Enter`: save and deactivate
- `ESC`: cancel (discard changes)

The modal has three sections:
1. **Row 1** — segments listed horizontally, cursor highlights one
2. **Row 2** — same
3. **Hidden** — segments not in any row (read-only list, press `a` on one to re-add to row 1)

**Step 3: Save logic**

On Enter, call:
```typescript
await context.config.set('ui.statusline.rows', state.rows, 'global');
context.eventBus.emit('ui:line', {
  id: crypto.randomUUID(),
  type: 'info',
  content: 'Statusline layout saved.',
  metadata: { timestamp: new Date().toISOString() },
});
deactivate();
```

**Step 4: Register function**

```typescript
export function registerStatuslineCommand(registry: CommandRegistry) {
  registry.register({
    id: '/statusline',
    type: 'component',
    description: 'Configure statusline segments and layout',
    category: 'ui',
    component: StatuslineCommandComponent,
    createState({ rawInput, config }) {
      const saved = config.get<[StatuslineSegment[], StatuslineSegment[]]>('ui.statusline.rows');
      return { rows: saved ?? DEFAULT_STATUSLINE_ROWS.map(r => [...r]) };
    },
  });
}
```

**Step 5: Check diagnostics**

```bash
pnpm --filter nuvin-cli tsc --noEmit
```

Expected: no errors.

**Step 6: Commit**

```bash
git add packages/nuvin-cli/source/modules/commands/definitions/statusline.tsx
git commit -m "feat(statusline): add /statusline command component"
```

---

### Task 5: Register the command

**Files:**
- Modify: `packages/nuvin-cli/source/modules/commands/definitions/index.ts`

**Step 1: Add import and registration call**

```typescript
import { registerStatuslineCommand } from './statusline.js';
// ...inside registerCommands():
registerStatuslineCommand(commandRegistry);
```

**Step 2: Check diagnostics**

```bash
pnpm --filter nuvin-cli tsc --noEmit
pnpm --filter nuvin-cli test --run
```

**Step 3: Commit**

```bash
git add packages/nuvin-cli/source/modules/commands/definitions/index.ts
git commit -m "feat(statusline): register /statusline command"
```

---

### Task 6: Add tests

**Files:**
- Create: `packages/nuvin-cli/tests/statusline.test.ts`

Test the pure logic (no React rendering needed):

```typescript
import { describe, it, expect } from 'vitest';
import { DEFAULT_STATUSLINE_ROWS } from '../source/components/Footer.js';
import type { StatuslineSegment } from '../source/config/types.js';

describe('DEFAULT_STATUSLINE_ROWS', () => {
  it('contains all 12 segments exactly once', () => {
    const all = DEFAULT_STATUSLINE_ROWS.flat();
    expect(all).toHaveLength(12);
    const unique = new Set(all);
    expect(unique.size).toBe(12);
  });

  it('row 1 contains status and metrics segments', () => {
    expect(DEFAULT_STATUSLINE_ROWS[0]).toContain('tokens');
    expect(DEFAULT_STATUSLINE_ROWS[0]).toContain('session');
  });

  it('row 2 contains gitBranch and keybindings', () => {
    expect(DEFAULT_STATUSLINE_ROWS[1]).toContain('gitBranch');
    expect(DEFAULT_STATUSLINE_ROWS[1]).toContain('keybindings');
  });
});

describe('StatuslineSegment type coverage', () => {
  it('ALL_SEGMENTS covers all valid keys', () => {
    // This is a compile-time check — if StatuslineSegment adds a key,
    // DEFAULT_STATUSLINE_ROWS.flat() should still include it.
    const flat = DEFAULT_STATUSLINE_ROWS.flat() as StatuslineSegment[];
    const knownSegments: StatuslineSegment[] = [
      'session', 'thinking', 'sudo',
      'tokens', 'context', 'cached', 'requests', 'tools', 'cost', 'lsp',
      'gitBranch', 'keybindings',
    ];
    for (const seg of knownSegments) {
      expect(flat).toContain(seg);
    }
  });
});
```

**Step 1: Write and run tests**

```bash
pnpm --filter nuvin-cli test --run tests/statusline.test.ts
```

Expected: all pass.

**Step 2: Commit**

```bash
git add packages/nuvin-cli/tests/statusline.test.ts
git commit -m "test(statusline): add segment layout tests"
```

---

### Task 7: Update help text

**Files:**
- Modify: `packages/nuvin-cli/source/modules/commands/definitions/help.tsx`

The `/help` command should list `/statusline` with description `Configure statusline segments and layout`.

No manual edit needed — help is auto-generated from the registry. Verify `/help` output includes the new command by running the app and typing `/help`.

**Step 1: Manual smoke test**

Start the CLI, type `/statusline`, confirm the modal opens. Type ESC to cancel. Type `/statusline` again, move a segment to row 2, press Enter, confirm the footer changes.

**Step 2: Final commit**

```bash
git commit --allow-empty -m "feat(statusline): complete /statusline config feature"
```

---

## Notes

- The `context` segment (context window %) is logically dependent on `tokens` — if `tokens` is hidden but `context` is shown, the `(12%)` text renders orphaned. This is acceptable for v1; a future improvement could auto-hide `context` when `tokens` is hidden.
- The modal does not need to handle `vimMode` segment — vim mode display (`-- INSERT --`) is gated by `vimModeEnabled` prop from the parent app, not by the statusline config. It could be added as a segment in a future iteration.
- The `LEFT_ALIGNED` / `RIGHT_ALIGNED` constant (Task 3 Step 4) means the user's "free placement" is cross-row but not cross-alignment within a row. This is the simplest model that avoids the footer becoming visually broken.
