# Message Action Modal Mouse Selection Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add mouse click support to select and trigger actions in the `MessageActionModal` bottom sheet — clicking an action item highlights and executes it, clicking outside (backdrop) dismisses.

**Architecture:** Add a `useMouse` handler at priority 150 (higher than the backdrop dismiss at 100) inside `MessageActionModal`. Each action row gets a `Box` ref stored in a refs array. On click, check each action's `getBounds()` to find which row was hit. If a row is hit, set `focusIndex` and trigger the action. If no row is hit, the event propagates to the backdrop handler which dismisses the modal.

**Tech Stack:** `useMouse` hook, `BoxRef.getBounds()` for hit testing, existing ref pattern from VirtualizedList.

---

## Current State

`MessageActionModal` (`components/MessageActionModal.tsx`) renders action items as a vertical list:

```tsx
<Box flexDirection="column">
  {actions.map((action, i) => {
    const isFocused = i === focusIndex;
    return (
      <Box key={action} paddingX={1}>
        <Text ...>{isFocused ? '▸ ' : '  '}{ACTION_LABELS[action]}</Text>
      </Box>
    );
  })}
</Box>
```

Keyboard input already works (↑/↓ + Enter). No mouse support exists.

The FlexLayout backdrop dismiss handler uses `useMouse` at priority 100 to close the modal on any click. The modal's handler must be higher priority (150) so it can intercept clicks on action items and return `true` to stop propagation, while letting clicks on the backdrop area fall through (return nothing → propagates to priority 100 → dismisses).

## Key reference: `BoxRef.getBounds()`

```tsx
import type { BoxRef } from 'ink';
// ref.current?.getBounds() returns { x, y, width, height } in absolute screen coordinates
// MouseEvent has { x, y } in the same coordinate space
```

---

### Task 1: Add mouse click support to MessageActionModal

**Files:**
- Modify: `packages/nuvin-cli/source/components/MessageActionModal.tsx`

**Step 1: Add imports**

Add `useRef` to the React import and add `useMouse` + `BoxRef`:

```tsx
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Box, Text, type BoxRef } from 'ink';
import { useInput, useMouse } from '@/contexts/InputContext/index.js';
```

**Step 2: Add action item refs**

Inside the component, after the `focusIndex` and `feedback` state declarations, add:

```tsx
const actionRefs = useRef<Map<number, BoxRef>>(new Map());
```

**Step 3: Add ref callback helper**

Add a ref callback setter (before the `useInput` call):

```tsx
const setActionRef = useCallback((index: number, el: BoxRef | null) => {
  if (el) {
    actionRefs.current.set(index, el);
  } else {
    actionRefs.current.delete(index);
  }
}, []);
```

**Step 4: Add useMouse handler**

After the existing `useInput` block, add:

```tsx
useMouse(
  (event) => {
    if (event.type === 'click' && event.button === 0) {
      for (const [index, ref] of actionRefs.current) {
        const bounds = ref.getBounds();
        if (
          event.x >= bounds.x &&
          event.x < bounds.x + bounds.width &&
          event.y >= bounds.y &&
          event.y < bounds.y + bounds.height
        ) {
          setFocusIndex(index);
          const action = actions[index];
          if (action) {
            void handleAction(action);
          }
          return true; // consume click — don't propagate to backdrop
        }
      }
      // Click was NOT on any action item → don't return true
      // This lets it propagate to FlexLayout's backdrop handler (priority 100)
    }
  },
  { isActive: visible && !feedback, priority: 150 },
);
```

Priority 150 > 100 (backdrop dismiss) so action clicks are checked first. If no action is hit, the event propagates down to the backdrop handler which closes the modal.

**Step 5: Attach refs to action Box elements**

Update the action items rendering to attach refs:

```tsx
{actions.map((action, i) => {
  const isFocused = i === focusIndex;
  return (
    <Box key={action} paddingX={1} ref={(el: BoxRef | null) => setActionRef(i, el)}>
      <Text
        bold={isFocused}
        color={isFocused ? theme.colors.accent : undefined}
        dimColor={!isFocused}
      >
        {isFocused ? '▸ ' : '  '}{ACTION_LABELS[action]}
      </Text>
    </Box>
  );
})}
```

**Step 6: Run type check**

```bash
cd packages/nuvin-cli && pnpm tsc --noEmit
```

**Step 7: Run tests**

```bash
cd packages/nuvin-cli && pnpm test -- --run
```

**Step 8: Commit**

```bash
git add packages/nuvin-cli/source/components/MessageActionModal.tsx
git commit -m "feat(cli): add mouse click support to message action modal"
```

---

## File Summary

| File | Change |
|------|--------|
| `components/MessageActionModal.tsx` | Add `useMouse` at priority 150 with `BoxRef.getBounds()` hit testing per action row |
