# Message Action Bottom Sheet Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace the inline action bar (positioned over message content) with a bottom-sheet modal when clicking a message line in alt mode — reusing the existing `AppModal` component and adding a backdrop layer that darkens the VirtualizedList.

**Architecture:** When a message is clicked in alt mode, instead of rendering `MessageActionBar` inline inside the message, we show an `AppModal` as a bottom-sheet overlay positioned absolutely at the bottom of the FlexLayout container. A new backdrop layer (semi-transparent / dim overlay) covers the VirtualizedList to indicate the modal is active. The modal intercepts keyboard input, and clicking outside (on the backdrop) or pressing Escape dismisses it. This change only applies to alt mode — non-alt mode behavior is untouched.

**Tech Stack:** React (Ink), existing AppModal component, Ink's absolute positioning + zIndex system.

---

## Current Architecture

### How message click → action bar works today

1. **Mouse click on message:** `VirtualizedList.tsx:380-417` captures clicks via `useMouse()` hook → calls `onItemClick(items[index], index)`
2. **Selection state:** `FlexLayout.tsx:42-46` handles `handleItemClick` → toggles `selectedMessageId` state
3. **Action bar render:** `MessageLine.tsx:306-310` conditionally renders `<MessageActionBar>` as `position="absolute" top={0} right={0}` inside each message when `isSelected=true`
4. **Action handling:** `MessageLine.tsx:53-63` `handleAction` → copy/edit/retry via clipboard + eventBus
5. **Deselection:** ESC key (FlexLayout useInput, priority default) or clicking empty area

### Key components

| Component | File | Role |
|-----------|------|------|
| `FlexLayout` | `components/FlexLayout/FlexLayout.tsx` | Owns `selectedMessageId` state, composes VirtualizedList + bottom section |
| `MessageLine` | `components/MessageLine.tsx` | Renders individual message, currently renders inline action bar |
| `MessageActionBar` | `components/MessageActionBar.tsx` | The action buttons (Copy/Edit/Retry) with keyboard nav |
| `AppModal` | `components/AppModal.tsx` | Reusable modal with title, content, footer, ESC/Enter close |
| `VirtualizedList` | `components/VirtualizedList.tsx` | Mouse click detection + virtualized rendering |
| `InteractionArea` | `components/InteractionArea.tsx` | Alt mode overlay pattern reference (absolute + bottom + zIndex) |

### Alt mode overlay pattern (existing)

InteractionArea already overlays content in alt mode using:
```tsx
<Box position="absolute" bottom={2} zIndex={25} flexShrink={0}>
  <UserQuestionPrompt questionData={pendingQuestion} />
</Box>
```

This anchors to the `position="relative"` parent in FlexLayout's root Box (line 103). We follow this same pattern.

---

## Plan

### Task 1: Add backdrop support to AppModal

**Files:**
- Modify: `packages/nuvin-cli/source/components/AppModal.tsx`

Currently, `AppModal` renders a full-height content Box with no backdrop/overlay. We need to add an optional `backdrop` prop that, when true, renders the modal content inside a full-screen container with a dim background — dimming everything behind it.

**Step 1: Add `backdrop` prop to AppModalProps**

In `packages/nuvin-cli/source/components/AppModal.tsx`, add the prop:

```tsx
export interface AppModalProps {
  visible: boolean;
  title?: string | ReactNode;
  rightTitle?: string | ReactNode;
  footer?: string | ReactNode;
  type?: AppModalType;
  titleColor?: string;
  borderColor?: string;
  children: ReactNode;
  onClose?: () => void;
  closeOnEscape?: boolean;
  closeOnEnter?: boolean;
  paddingX?: number;
  paddingY?: number;
  marginX?: number;
  marginY?: number;
  height?: number | string;
  backdrop?: boolean; // NEW: renders a dim overlay behind the modal
}
```

**Step 2: Implement backdrop rendering**

When `backdrop` is true, wrap the modal content in a full-size container. The backdrop effect in terminal is achieved by setting the full outer Box's background to a dark/dim color. The actual content stays at the bottom.

```tsx
export const AppModal: FC<AppModalProps> = ({
  // ...existing props
  backdrop = false,
}) => {
  // ...existing useInput logic stays the same

  if (!visible) return null;

  const modalContent = (
    <Box height={height} flexDirection="column" width="100%" backgroundColor={globalTheme.modal.background} flexGrow={backdrop ? 0 : 1}>
      {/* ...existing title, content, footer - no changes */}
    </Box>
  );

  if (backdrop) {
    return (
      <Box
        flexDirection="column"
        width="100%"
        height="100%"
        justifyContent="flex-end"
        backgroundColor="#000000"
      >
        {modalContent}
      </Box>
    );
  }

  return modalContent;
};
```

The key insight: when `backdrop=true`, we wrap in a full-size Box with `backgroundColor="#000000"` (or a theme color) and `justifyContent="flex-end"` to push the modal to the bottom like a bottom sheet. The dark background naturally "dims" whatever is behind it since terminal rendering overwrites cells.

**Step 3: Run tests**

```bash
cd packages/nuvin-cli && pnpm test -- --run
```

Expected: All existing tests pass (no behavior change for existing modal consumers).

**Step 4: Commit**

```bash
git add packages/nuvin-cli/source/components/AppModal.tsx
git commit -m "feat(cli): add backdrop support to AppModal"
```

---

### Task 2: Create MessageActionModal component

**Files:**
- Create: `packages/nuvin-cli/source/components/MessageActionModal.tsx`

This is a new component that wraps AppModal to display message actions (Copy, Edit, Retry) in a bottom-sheet style modal. It replaces the inline `MessageActionBar` for alt mode.

**Step 1: Create the component**

```tsx
// packages/nuvin-cli/source/components/MessageActionModal.tsx
import React, { useState, useEffect, useCallback } from 'react';
import { Box, Text } from 'ink';
import { useInput } from '@/contexts/InputContext/index.js';
import { useTheme } from '@/contexts/ThemeContext.js';
import type { MessageLine } from '@/adapters/index.js';
import { AppModal } from './AppModal.js';
import type { MessageAction } from './MessageActionBar.js';
import { extractMessageContent } from '../utils/extractMessageContent.js';
import { copyTextToClipboard } from '../utils/copyText.js';
import { eventBus } from '../services/EventBus.js';

type MessageActionModalProps = {
  visible: boolean;
  message: MessageLine | null;
  onClose: () => void;
};

function getActionsForType(type: MessageLine['type']): MessageAction[] {
  switch (type) {
    case 'user':
      return ['copy', 'edit'];
    case 'assistant':
      return ['copy', 'retry'];
    default:
      return ['copy'];
  }
}

const ACTION_LABELS: Record<MessageAction, string> = {
  copy: '📋 Copy',
  edit: '✏️  Edit',
  retry: '🔄 Retry',
};

export const MessageActionModal: React.FC<MessageActionModalProps> = ({ visible, message, onClose }) => {
  const { theme } = useTheme();
  const actions = message ? getActionsForType(message.type) : [];
  const [focusIndex, setFocusIndex] = useState(0);
  const [feedback, setFeedback] = useState<string | null>(null);

  // Reset focus when modal opens
  useEffect(() => {
    if (visible) {
      setFocusIndex(0);
      setFeedback(null);
    }
  }, [visible]);

  useEffect(() => {
    if (!feedback) return;
    const timer = setTimeout(() => {
      setFeedback(null);
      onClose();
    }, 800);
    return () => clearTimeout(timer);
  }, [feedback, onClose]);

  const handleAction = useCallback(async (action: MessageAction) => {
    if (!message) return;
    if (action === 'copy') {
      const content = extractMessageContent(message);
      const success = await copyTextToClipboard(content);
      setFeedback(success ? 'Copied!' : 'Copy failed');
    } else if (action === 'edit') {
      eventBus.emit('ui:input:edit', { content: message.content });
      onClose();
    } else if (action === 'retry') {
      eventBus.emit('ui:input:retry', { content: '' });
      onClose();
    }
  }, [message, onClose]);

  useInput((_input, key) => {
    if (key.upArrow) {
      setFocusIndex((i) => Math.max(0, i - 1));
      return true;
    }
    if (key.downArrow) {
      setFocusIndex((i) => Math.min(actions.length - 1, i + 1));
      return true;
    }
    if (key.return) {
      const action = actions[focusIndex];
      if (action) {
        void handleAction(action);
      }
      return true;
    }
  }, { isActive: visible && !feedback, priority: 200 });

  if (!visible || !message) return null;

  return (
    <AppModal
      visible={visible}
      title="Actions"
      onClose={onClose}
      closeOnEscape
      backdrop
      height="100%"
      paddingX={1}
      paddingY={0}
      marginX={0}
      marginY={0}
    >
      {feedback ? (
        <Text color={theme.colors.success} bold>{feedback}</Text>
      ) : (
        <Box flexDirection="column">
          {actions.map((action, i) => {
            const isFocused = i === focusIndex;
            return (
              <Box key={action} paddingX={1}>
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
        </Box>
      )}
    </AppModal>
  );
};
```

Key design decisions:
- **Vertical list** (up/down arrows) instead of horizontal (left/right) since it's a bottom sheet
- **Priority 200** (same as existing MessageActionBar) to capture keyboard
- Reuses `extractMessageContent`, `copyTextToClipboard`, and `eventBus` from MessageLine
- Auto-closes after feedback on copy, immediately closes on edit/retry
- Receives `message: MessageLine | null` so it can determine available actions

**Step 2: Commit**

```bash
git add packages/nuvin-cli/source/components/MessageActionModal.tsx
git commit -m "feat(cli): add MessageActionModal bottom sheet component"
```

---

### Task 3: Lift selection state and render modal in FlexLayout (alt mode only)

**Files:**
- Modify: `packages/nuvin-cli/source/components/FlexLayout/FlexLayout.tsx`
- Modify: `packages/nuvin-cli/source/components/MessageLine.tsx`

Currently, `FlexLayout` tracks `selectedMessageId` and passes `isSelected` to each MessageLine, which renders the inline action bar. In alt mode, we instead:

1. Keep `selectedMessageId` in FlexLayout (already there)
2. Look up the full `MessageLine` object for the selected message
3. Render `MessageActionModal` as an overlay in FlexLayout (alt mode only)
4. Stop rendering the inline `MessageActionBar` in MessageLine when in alt mode

**Step 1: Update FlexLayout to render MessageActionModal in alt mode**

In `packages/nuvin-cli/source/components/FlexLayout/FlexLayout.tsx`:

Add imports:
```tsx
import { useAltMode } from '@/contexts/AltModeContext.js';
import { MessageActionModal } from '../MessageActionModal.js';
```

Add alt mode hook and selected message lookup:
```tsx
export function FlexLayout({ ... }): React.ReactElement {
  const { theme } = useTheme();
  const { altMode } = useAltMode();
  // ...existing code...

  const selectedMessage = useMemo(() => {
    if (!selectedMessageId) return null;
    return mergedMessages.find((m) => m.id === selectedMessageId) ?? null;
  }, [selectedMessageId, mergedMessages]);

  const handleCloseModal = useCallback(() => {
    setSelectedMessageId(null);
  }, []);
```

Update the return JSX — render the modal overlay when in alt mode:
```tsx
  return (
    <Box flexDirection="column" width={width} height={height} paddingX={1} backgroundColor={theme.colors.background} position="relative">
      <Box flexGrow={1} flexShrink={1}>
        <VirtualizedList
          items={listItems}
          renderItem={renderItem}
          keyExtractor={keyExtractor}
          overscan={1}
          mousePriority={10}
          flexGrow={1}
          flexShrink={1}
          onItemClick={handleItemClick}
          onEmptyClick={handleEmptyClick}
          selectedItemKey={selectedMessageId}
        />
      </Box>
      {bottom && (
        <Box flexDirection="column" flexShrink={0}>
          {bottom}
        </Box>
      )}
      {altMode && (
        <Box position="absolute" top={0} left={0} width="100%" height="100%" zIndex={30}>
          <MessageActionModal
            visible={selectedMessageId !== null}
            message={selectedMessage}
            onClose={handleCloseModal}
          />
        </Box>
      )}
    </Box>
  );
```

Key points:
- Add `position="relative"` to the root Box (anchor for absolute children)
- The modal overlay is `position="absolute"` covering the full FlexLayout area
- `zIndex={30}` — higher than all existing overlays (question=25, approval=20, command=10)
- Only rendered when `altMode` is true

**Step 2: Stop rendering inline action bar in alt mode in MessageLine**

In `packages/nuvin-cli/source/components/MessageLine.tsx`, change the action bar conditional:

```tsx
// Before (line 306-310):
{isSelected && (
  <Box position="absolute" top={0} right={0}>
    <MessageActionBar messageType={message.type} onAction={handleAction} />
  </Box>
)}

// After:
{isSelected && !altMode && (
  <Box position="absolute" top={0} right={0}>
    <MessageActionBar messageType={message.type} onAction={handleAction} />
  </Box>
)}
```

The `altMode` variable is already available (line 47: `const { altMode } = useAltMode();`).

**Step 3: Run tests**

```bash
cd packages/nuvin-cli && pnpm test -- --run
```

**Step 4: Run type check**

```bash
cd packages/nuvin-cli && pnpm tsc --noEmit
```

**Step 5: Commit**

```bash
git add packages/nuvin-cli/source/components/FlexLayout/FlexLayout.tsx packages/nuvin-cli/source/components/MessageLine.tsx
git commit -m "feat(cli): show message action modal in alt mode instead of inline bar"
```

---

### Task 4: Handle mouse click on backdrop to dismiss

**Files:**
- Modify: `packages/nuvin-cli/source/components/FlexLayout/FlexLayout.tsx`

When the modal is visible, clicking anywhere should dismiss it (since the backdrop covers the full area). The existing `onEmptyClick` in VirtualizedList already deselects. But since the modal overlay covers the VirtualizedList, clicks won't reach it.

We need the modal's absolute-positioned container to handle mouse clicks for dismissal.

**Step 1: Add mouse handler for backdrop dismiss**

This is already partially handled — the `AppModal` has `closeOnEscape` and the FlexLayout ESC handler clears selection. But for mouse clicks on the backdrop, we need `useMouse` in FlexLayout.

In FlexLayout, import and add:

```tsx
import { useMouse } from '@/contexts/InputContext/useMouse.js';
```

```tsx
// When modal is visible in alt mode, capture clicks at high priority to dismiss
useMouse(
  (event) => {
    if (event.type === 'click' && event.button === 0) {
      setSelectedMessageId(null);
      return true; // consume the event
    }
  },
  { isActive: altMode && selectedMessageId !== null, priority: 100 },
);
```

Priority 100 is higher than VirtualizedList's priority 10, so clicks are captured by the backdrop handler first when the modal is open.

**Step 2: Verify ESC flow still works**

The existing `useInput` handler in FlexLayout (line 55-60) already handles ESC to clear `selectedMessageId`. The `AppModal`'s own `closeOnEscape` also calls `onClose` → `handleCloseModal` → same effect. Both paths are fine — the FlexLayout ESC handler runs first due to `isActive: selectedMessageId !== null`.

**Step 3: Run tests**

```bash
cd packages/nuvin-cli && pnpm test -- --run
```

**Step 4: Commit**

```bash
git add packages/nuvin-cli/source/components/FlexLayout/FlexLayout.tsx
git commit -m "feat(cli): dismiss message action modal on backdrop click"
```

---

### Task 5: Manual testing checklist

Test the following scenarios in the terminal:

1. **Alt mode — click message → modal appears**
   - Click on a user message → modal shows Copy + Edit actions
   - Click on an assistant message → modal shows Copy + Retry actions
   - Click on a tool result → modal shows Copy action only

2. **Alt mode — keyboard navigation in modal**
   - Up/Down arrows navigate between actions
   - Enter triggers the focused action
   - Copy shows "Copied!" feedback then auto-closes
   - Edit populates input area and closes modal
   - Retry triggers retry and closes modal

3. **Alt mode — dismiss modal**
   - Press ESC → modal closes
   - Click anywhere on backdrop → modal closes

4. **Alt mode — backdrop appearance**
   - When modal is open, the background behind it appears dark/dimmed
   - The modal itself appears at the bottom of the screen

5. **Non-alt mode — unchanged behavior**
   - Click on message → inline action bar appears (top-right of message)
   - Action bar has left/right arrow navigation
   - ESC dismisses inline bar
   - No modal, no backdrop

6. **Edge cases**
   - Open modal, resize terminal → modal should adapt
   - Open modal while agent is streaming → modal still works
   - Rapidly click different messages → only latest selection shown

---

## File Summary

| File | Change |
|------|--------|
| `components/AppModal.tsx` | Add `backdrop` prop with dark background + bottom-aligned layout |
| `components/MessageActionModal.tsx` | NEW — Bottom-sheet modal wrapping AppModal for message actions |
| `components/FlexLayout/FlexLayout.tsx` | Render `MessageActionModal` overlay in alt mode, add backdrop click dismiss |
| `components/MessageLine.tsx` | Skip inline `MessageActionBar` when in alt mode |
