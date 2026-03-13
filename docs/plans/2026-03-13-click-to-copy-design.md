# Click-to-Copy with Contextual Actions (Alt Mode Only)

**Date:** 2026-03-13
**Status:** Draft

## Overview

When a user left-clicks on any message in the chat (**alt mode only**, `--alt` flag), a floating action bar appears on that message with contextual actions. The bar shows **Copy** (always available) plus type-specific actions: **Edit** for user messages, **Retry** for assistant/tool messages. The bar dismisses when the user clicks elsewhere or presses Escape.

**Scope:** Alt mode only. The legacy `ChatDisplay` (with `<Static>`) is not modified. All changes target `FlexLayout` → `VirtualizedList` → `MessageLine`.

## Architecture

### Why Alt Mode Only

- **Alt mode** uses `FlexLayout` → `VirtualizedList`, which already has full mouse support (scroll events), item ref tracking (`itemRefsMap`), item height measurement, and scroll offset state (`effectiveScrollY`). This gives us everything needed for click hit-testing.
- **Legacy mode** uses `ChatDisplay` with ink's `<Static>` component, which renders items once and never re-renders them — making interactive selection impossible without an overlay hack.

### VirtualizedList Advantage

`VirtualizedList` already tracks:
- `itemRefsMap: Map<string, DOMElement>` — DOM refs for every rendered item
- `itemOffsets: number[]` — cumulative Y offset for each item
- `heightCacheRef: Map<string, number>` — measured height of each item
- `effectiveScrollY` — current scroll position
- `containerRef` — the viewport container with `measureElement()`

This means **hit-testing is trivial**: on click at screen `(x, y)`, we can compute which item the click landed on using `effectiveScrollY + (y - containerTop)` → binary search in `itemOffsets`.

### Components

```
┌─────────────────────────────────────────────────────────┐
│  FlexLayout                                             │
│  └── VirtualizedList (modified)                         │
│      ├── Handles click → hit-test → select item         │
│      ├── Passes selectedItemKey to renderItem           │
│      └── Items:                                          │
│          └── MessageLine (modified)                      │
│              └── MessageActionBar (new, inline)          │
│                  ├── [Copy] — always                     │
│                  ├── [Edit] — user messages               │
│                  └── [Retry] — assistant/tool messages    │
└─────────────────────────────────────────────────────────┘
```

## Detailed Design

### 1. Text Clipboard Utility

**File:** `packages/nuvin-cli/source/utils/copyText.ts`

Platform-specific text-to-clipboard using `child_process.spawn` and piping to stdin (same pattern as existing image clipboard in `clipboard.ts`):

```typescript
import { spawn } from 'node:child_process';
import { platform } from 'node:os';

export function copyTextToClipboard(text: string): Promise<boolean> {
  return new Promise((resolve) => {
    const os = platform();
    let cmd: string;
    let args: string[];

    if (os === 'darwin') {
      cmd = 'pbcopy';
      args = [];
    } else if (os === 'linux') {
      cmd = 'xclip';
      args = ['-selection', 'clipboard'];
    } else if (os === 'win32') {
      cmd = 'clip';
      args = [];
    } else {
      resolve(false);
      return;
    }

    const proc = spawn(cmd, args, { stdio: ['pipe', 'ignore', 'ignore'] });
    proc.on('close', (code) => resolve(code === 0));
    proc.on('error', () => resolve(false));
    proc.stdin.end(text);
  });
}
```

### 2. Click Hit-Testing in VirtualizedList

**File:** `packages/nuvin-cli/source/components/VirtualizedList.tsx`

Add click handling to the existing `handleMouseEvent` callback. The VirtualizedList already has everything needed:

**New props:**
```typescript
export type VirtualizedListProps<T> = {
  // ... existing props ...
  onItemClick?: (item: T, index: number) => void;
  selectedItemKey?: string | null;
};
```

**Hit-test logic inside `handleMouseEvent`:**
```typescript
if (event.type === 'click' && event.button === 0 && onItemClick) {
  // Get container's absolute top position on screen
  const containerBounds = containerRef.current?.getBounds();
  if (!containerBounds) return;

  // Convert screen Y to content Y
  const relativeY = event.y - containerBounds.y;
  const contentY = effectiveScrollY + relativeY;

  // Binary search itemOffsets to find which item contains contentY
  const index = findItemAtOffset(contentY);
  if (index >= 0 && index < items.length) {
    onItemClick(items[index], index);
    return true;
  }
}
```

**Selected item visual:** When `selectedItemKey` matches a rendered item's key, pass a highlight prop or wrap the item's `<Box>` with a different `backgroundColor`.

### 3. FlexLayout — Selection State Management

**File:** `packages/nuvin-cli/source/components/FlexLayout/FlexLayout.tsx`

FlexLayout owns the selection state and wires it into VirtualizedList:

```typescript
const [selectedMessageId, setSelectedMessageId] = useState<string | null>(null);

const handleItemClick = useCallback((item: ListItem, _index: number) => {
  if (item.type === 'message') {
    setSelectedMessageId((prev) =>
      prev === item.message.id ? null : item.message.id  // toggle on re-click
    );
  }
}, []);

// Clear on Escape
useInput((input, key) => {
  if (key.escape && selectedMessageId) {
    setSelectedMessageId(null);
    return true;
  }
});

// Pass to VirtualizedList
<VirtualizedList
  items={listItems}
  renderItem={(item, index) => renderItem(item, index, selectedMessageId)}
  onItemClick={handleItemClick}
  selectedItemKey={selectedMessageId}
  ...
/>
```

### 4. MessageLine — Action Bar Integration

**File:** `packages/nuvin-cli/source/components/MessageLine.tsx`

Add `isSelected` prop. When selected, render `<MessageActionBar>` inline at the top of the message:

```typescript
type MessageLineProps = {
  // ... existing props ...
  isSelected?: boolean;
  onAction?: (action: 'copy' | 'edit' | 'retry') => void;
};
```

```tsx
return (
  <Box ref={boxRef} ...>
    {isSelected && (
      <MessageActionBar
        messageType={message.type}
        onAction={handleAction}
      />
    )}
    {content}
  </Box>
);
```

### 5. MessageActionBar Component

**File:** `packages/nuvin-cli/source/components/MessageActionBar.tsx`

A compact inline row rendered above the message content when selected.

```
                              [📋 Copy] [✏️ Edit]
❯ [you]
  Can you fix the login bug?
```

**Buttons by message type:**

| Message Type | Buttons |
|---|---|
| `user` | Copy, Edit |
| `assistant` | Copy, Retry |
| `tool` | Copy |
| `thinking` | Copy |
| `error` / `warning` / `info` / `system` | Copy |

**Interaction model:**
- **Mouse:** Each button is a separate `<Box>` with known position. The action bar subscribes to clicks via `useMouse()` at high priority and hit-tests its own buttons.
- **Keyboard:** Left/Right arrows move focus between buttons, Enter activates. The action bar subscribes via `useInput()` at high priority when visible.
- After action: show "Copied!" for 1.5s, then dismiss the bar.

### 6. Content Extraction

**File:** `packages/nuvin-cli/source/utils/extractMessageContent.ts`

Extracts copyable text from a `MessageLine`:

| Message Type | Content |
|---|---|
| `user` | `message.content` |
| `assistant` | `message.content` (raw markdown) |
| `tool` | Tool name + args summary + result text (from `metadata.toolResultsByCallId`) |
| `thinking` | `message.content` |
| `error` / `warning` / `info` / `system` | `message.content` |

For `tool` messages, iterate `metadata.toolCalls` and extract results using the existing `parseDetailLines()` from `ToolResultView/utils.ts`.

## Implementation Plan

### Phase 1: Foundation
1. **Create `copyText.ts`** — Platform-specific text clipboard utility
2. **Create `extractMessageContent.ts`** — Content extraction logic per message type

### Phase 2: Click Infrastructure
3. **Modify `VirtualizedList.tsx`** — Add `onItemClick` prop with hit-testing in mouse handler, add `selectedItemKey` prop for visual highlight
4. **Modify `FlexLayout.tsx`** — Own selection state, wire `onItemClick` / `selectedItemKey`, handle Escape to dismiss

### Phase 3: Action Bar
5. **Create `MessageActionBar.tsx`** — Inline bar with Copy + contextual buttons, keyboard nav + mouse click on buttons
6. **Modify `MessageLine.tsx`** — Add `isSelected` and `onAction` props, render action bar when selected

### Phase 4: Actions
7. **Wire Copy action** — `extractMessageContent()` → `copyTextToClipboard()` → "Copied!" feedback
8. **Wire Edit action** (user messages) — Populate input area with message content
9. **Wire Retry action** (assistant messages) — Re-send previous user message

### Phase 5: Polish
10. **Visual feedback** — "Copied!" flash, selected message highlight/border
11. **Click-outside dismiss** — Click on non-message area clears selection

## Open Questions

1. **Edit action mechanics:** Pre-fill the input area with the user message content? Or delete messages after it and re-submit?
2. **Retry action mechanics:** Re-send just the last user message, or the entire conversation up to that point?
3. **`getBounds()` on containerRef:** Need to verify that `containerRef` (a `BoxRef`) exposes `getBounds()` — the `Box` component sets this up via `useImperativeHandle`, but `containerRef` is typed as `BoxRef` so it should work.

## Risk Assessment

- **Low risk:** Hit-testing — VirtualizedList already has `itemOffsets`, `effectiveScrollY`, and `containerRef`. The math is straightforward.
- **Low risk:** Clipboard utility — standard platform commands.
- **Medium risk:** Action bar button hit-testing — individual buttons are small text regions. Fallback: keyboard-only interaction for button selection.
- **Low risk:** Alt-mode scoping — changes are isolated to FlexLayout/VirtualizedList, no impact on legacy ChatDisplay.
