# Memory Command Modal Implementation Plan

> **For Nuvin:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Convert the `/memory` command from a text-emitting function command to a React component command with a modal UI matching the `/agent` and `/skill` command patterns.

**Architecture:** Create a `MemoryModal/` component directory following the `AgentModal/` and `SkillModal/` patterns. The modal uses `AppModal` + `ComboBox` for a searchable, keyboard-navigable list of memory entries. Pressing Enter on a selected memory shows its detail view. Delete (`d`) removes entries. Space could toggle scope (or is unused). The command file is converted from `.ts` to `.tsx` with `type: 'component'`.

**Tech Stack:** React (Ink), ComboBox component, AppModal, HelpText, AutoScrollBox, useInput hook

---

## Existing Patterns Reference

### Component command registration pattern (`skills.tsx`, `agent.tsx`)
```tsx
export function registerMemoryCommand(registry: CommandRegistry) {
  registry.register({
    id: '/memory',
    type: 'component',
    description: 'Manage long-term agent memories',
    category: 'session',
    component: MemoryCommandComponent,
  });
}
```

### Modal list component pattern (`AgentModal/`, `SkillModal/`)
- `MemoryModal.tsx` — Main modal wrapper with `AppModal`, loading/empty states, footer `HelpText`
- `MemoryList.tsx` — `ComboBox`-based list with custom `renderItem`, `onSelect`, `onSpace`, `onHighlight`
- `useMemoryModalState.ts` — State hook for selected index, local data management
- `index.ts` — Re-exports

### Key patterns to follow
- `ComboBox` is used for the searchable list (from `@/components/ComboBox/ComboBox.js`)
- `ComboBoxItem` has `{ label: string; value: string }` shape
- `renderItem(item, isSelected)` returns custom JSX per item
- `onSelect` fires on Enter, `onSpace` on Space key, `onHighlight` on cursor move
- `AppModal` takes `visible`, `title`, `closeOnEscape`, `closeOnEnter={false}`, `onClose`, `paddingX={1}`, `paddingY={0}`, `footer`, `height`
- `HelpText` with `segments` array for footer keybindings
- Detail view uses `AutoScrollBox` inside a second `AppModal`

### MemoryService methods available (`source/services/MemoryService.ts`)
- `getAllMemories(): Promise<MemoryEntry[]>` — returns all from global + project stores
- `addMemory(input): Promise<MemoryEntry>` — persist a new entry
- `deleteMemory(id): Promise<boolean>` — remove by id
- `clearMemories(scope?): Promise<void>` — clear all or by scope
- Access via: `orchestratorManager.getMemoryService()`

### MemoryEntry fields (`@nuvin/nuvin-core`)
```ts
interface MemoryEntry {
  id: string;
  content: string;
  type: MemoryType;      // 'semantic' | 'episodic' | 'procedural'
  scope: MemoryScope;    // 'global' | 'project'
  tags: string[];
  createdAt: string;
  updatedAt: string;
  accessCount: number;
  lastAccessedAt: string;
  source: MemorySource;  // 'extracted' | 'explicit' | 'imported'
}
```

---

### Task 1: Create `useMemoryModalState` hook

**Files:**
- Create: `packages/nuvin-cli/source/components/MemoryModal/useMemoryModalState.ts`

**Step 1: Create the state hook**

```ts
import { useState, useCallback, useEffect } from 'react';
import type { MemoryEntry } from '@nuvin/nuvin-core';

interface UseMemoryModalStateResult {
  selectedIndex: number;
  setSelectedIndex: (index: number) => void;
  memories: MemoryEntry[];
  setMemories: (memories: MemoryEntry[]) => void;
}

export function useMemoryModalState(
  initialMemories: MemoryEntry[],
  initialSelectedIndex?: number,
): UseMemoryModalStateResult {
  const [selectedIndex, setSelectedIndex] = useState(initialSelectedIndex ?? 0);
  const [memories, setMemories] = useState<MemoryEntry[]>(initialMemories);

  useEffect(() => {
    setMemories(initialMemories);
  }, [initialMemories]);

  useEffect(() => {
    if (initialSelectedIndex !== undefined) {
      setSelectedIndex(initialSelectedIndex);
    }
  }, [initialSelectedIndex]);

  return {
    selectedIndex,
    setSelectedIndex,
    memories,
    setMemories,
  };
}
```

**Step 2: Verify no type errors**

Run: `cd packages/nuvin-cli && npx tsc --noEmit`
Expected: Clean compile

---

### Task 2: Create `MemoryList` component

**Files:**
- Create: `packages/nuvin-cli/source/components/MemoryModal/MemoryList.tsx`

This is the core list component. Each memory item shows:
- Type icon (🧠 semantic, 📖 episodic, ⚙️ procedural)
- Content (truncated to ~60 chars on non-selected)
- Scope badge `[global]` or `[project]`
- When selected: full content, tags, access count, created date, source

**Step 1: Create the list component**

```tsx
import type React from 'react';
import { useMemo, useCallback } from 'react';
import { Box, Text } from 'ink';
import { useTheme } from '@/contexts/ThemeContext.js';
import { ComboBox, type ComboBoxItem } from '@/components/ComboBox/ComboBox.js';
import type { MemoryEntry, MemoryType } from '@nuvin/nuvin-core';

interface MemoryListProps {
  memories: MemoryEntry[];
  onMemorySelect: (index: number) => void;
  onView?: (id: string) => void;
  onDelete?: (id: string) => void;
  focus?: boolean;
}

const TYPE_ICONS: Record<MemoryType, string> = {
  semantic: '🧠',
  episodic: '📖',
  procedural: '⚙️',
};

function truncate(text: string, maxLen: number): string {
  if (text.length <= maxLen) return text;
  return `${text.slice(0, maxLen - 1)}…`;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString();
}

export const MemoryList: React.FC<MemoryListProps> = ({
  memories,
  onMemorySelect,
  onView,
  onDelete,
  focus = true,
}) => {
  const { theme } = useTheme();

  const comboBoxItems = useMemo<ComboBoxItem[]>(
    () =>
      memories.map((m) => ({
        label: m.content,
        value: m.id,
      })),
    [memories],
  );

  const renderMemoryItem = useCallback(
    (item: ComboBoxItem, isSelected: boolean) => {
      const memory = memories.find((m) => m.id === item.value);
      if (!memory) return null;

      const icon = TYPE_ICONS[memory.type];
      const accentColor = theme.colors.accent;
      const scopeColor = memory.scope === 'global' ? theme.tokens.yellow : theme.tokens.cyan;

      return (
        <Box flexDirection="column">
          <Box>
            <Text>{icon} </Text>
            <Text color={isSelected ? accentColor : undefined}>{isSelected ? '› ' : '  '}</Text>
            <Text color={isSelected ? accentColor : theme.colors.text} bold={isSelected}>
              {isSelected ? memory.content : truncate(memory.content, 60)}
            </Text>
            <Text> </Text>
            <Text color={scopeColor} dimColor>
              [{memory.scope}]
            </Text>
          </Box>
          {isSelected && (
            <Box flexDirection="column">
              <Box
                marginLeft={4}
                borderStyle={'single'}
                borderTop={false}
                borderBottom={false}
                borderRight={false}
                borderLeft
                borderDimColor
                paddingX={1}
              >
                <Text dimColor wrap="wrap">
                  <Text>type: </Text>
                  <Text color={theme.colors.text}>{memory.type}</Text>
                  <Text> • source: </Text>
                  <Text color={theme.colors.text}>{memory.source}</Text>
                  <Text> • accessed: </Text>
                  <Text color={theme.colors.text}>{memory.accessCount}×</Text>
                  <Text> • created: </Text>
                  <Text color={theme.colors.text}>{formatDate(memory.createdAt)}</Text>
                </Text>
              </Box>
              {memory.tags.length > 0 && (
                <Box marginLeft={4}>
                  <Text dimColor>
                    └─ tags: {memory.tags.join(', ')}
                  </Text>
                </Box>
              )}
            </Box>
          )}
        </Box>
      );
    },
    [memories, theme],
  );

  const handleSelect = useCallback(
    (item: ComboBoxItem) => {
      onView?.(item.value);
    },
    [onView],
  );

  const handleDelete = useCallback(
    (item: ComboBoxItem) => {
      onDelete?.(item.value);
    },
    [onDelete],
  );

  const handleHighlight = useCallback(
    (_item: ComboBoxItem | null, index: number) => {
      onMemorySelect(index);
    },
    [onMemorySelect],
  );

  // Group counts by type
  const typeCounts = useMemo(() => {
    const counts = { semantic: 0, episodic: 0, procedural: 0 };
    for (const m of memories) counts[m.type]++;
    return counts;
  }, [memories]);

  return (
    <Box flexDirection="column" width="100%" flexGrow={1} overflow="hidden">
      <Box marginBottom={1} flexShrink={0}>
        <Text color={theme.tokens.cyan} bold>
          Memories ({memories.length})
        </Text>
        <Text dimColor>
          {' '}— 🧠{typeCounts.semantic} 📖{typeCounts.episodic} ⚙️{typeCounts.procedural}
        </Text>
      </Box>

      <ComboBox
        items={comboBoxItems}
        placeholder="Search memories..."
        enableRotation={true}
        showItemCount={false}
        focus={focus}
        renderItem={renderMemoryItem}
        onSelect={handleSelect}
        onHighlight={handleHighlight}
        onDelete={handleDelete}
      />
    </Box>
  );
};
```

**Important:** The `ComboBox` component needs to support an `onDelete` callback (triggered by `d` key). Check if `ComboBox` already supports this. If not, we may need to handle deletion at the modal level using `useInput` instead. In that case, remove `onDelete` from `ComboBox` props and handle it in the parent `MemoryModal.tsx` via `useInput` listening for `d` key.

**Step 2: Verify no type errors**

Run: `cd packages/nuvin-cli && npx tsc --noEmit`
Expected: Clean compile (may need adjustments based on ComboBox API)

---

### Task 3: Create `MemoryModal` component

**Files:**
- Create: `packages/nuvin-cli/source/components/MemoryModal/MemoryModal.tsx`
- Create: `packages/nuvin-cli/source/components/MemoryModal/index.ts`

The modal has two views:
1. **List view** — Shows `MemoryList` with search/navigation
2. **Detail view** — Shows full memory content in `AutoScrollBox` (on Enter)

**Step 1: Create the modal component**

```tsx
import type React from 'react';
import { useCallback, useState } from 'react';
import { Box, Text } from 'ink';
import { useInput } from '@/contexts/InputContext/index.js';
import { useTheme } from '@/contexts/ThemeContext.js';
import { AppModal } from '@/components/AppModal.js';
import { HelpText } from '@/components/HelpText.js';
import { AutoScrollBox } from '@/components/AutoScrollBox.js';
import { useStdoutDimensions } from '@/hooks/useStdoutDimensions.js';
import { useMemoryModalState } from './useMemoryModalState.js';
import { MemoryList } from './MemoryList.js';
import type { MemoryEntry, MemoryType } from '@nuvin/nuvin-core';

const MODAL_HEIGHT = 30;

const TYPE_LABELS: Record<MemoryType, string> = {
  semantic: '🧠 Semantic',
  episodic: '📖 Episodic',
  procedural: '⚙️ Procedural',
};

interface MemoryModalProps {
  visible: boolean;
  memories: MemoryEntry[];
  onClose: () => void;
  onDelete?: (id: string) => void;
}

type ActiveView = 'list' | 'detail';

export const MemoryModal: React.FC<MemoryModalProps> = ({
  visible,
  memories,
  onClose,
  onDelete,
}) => {
  const { theme } = useTheme();
  const { rows } = useStdoutDimensions();
  const state = useMemoryModalState(memories);

  const [activeView, setActiveView] = useState<ActiveView>('list');
  const [viewingMemory, setViewingMemory] = useState<MemoryEntry | null>(null);

  const handleView = useCallback(
    (id: string) => {
      const memory = memories.find((m) => m.id === id);
      if (memory) {
        setViewingMemory(memory);
        setActiveView('detail');
      }
    },
    [memories],
  );

  const handleBackToList = useCallback(() => {
    setActiveView('list');
    setViewingMemory(null);
  }, []);

  const handleDelete = useCallback(
    (id: string) => {
      onDelete?.(id);
    },
    [onDelete],
  );

  useInput(
    (_input, key) => {
      if (activeView === 'detail' && key.escape) {
        handleBackToList();
      }
    },
    { isActive: activeView === 'detail' },
  );

  if (!visible) return null;

  const modalHeight = Math.min(MODAL_HEIGHT, rows - 4);

  // Detail view
  if (activeView === 'detail' && viewingMemory) {
    const maxHeight = Math.max(5, rows - 12);

    return (
      <AppModal
        visible={true}
        title={`Memory: ${TYPE_LABELS[viewingMemory.type]}`}
        onClose={handleBackToList}
        closeOnEscape={true}
        footer={
          <Box marginLeft={1} flexGrow={1} marginRight={1} flexShrink={0}>
            <HelpText
              segments={[
                { text: 'j/k', highlight: true },
                { text: ' scroll • ' },
                { text: 'ESC', highlight: true },
                { text: ' back' },
              ]}
            />
          </Box>
        }
        height="100%"
      >
        <Box flexDirection="column" flexGrow={1}>
          <Box marginBottom={1} flexDirection="column">
            <Text>{viewingMemory.content}</Text>
          </Box>
          <AutoScrollBox maxHeight={maxHeight} showScrollbar focus={true} enableKeyboardScroll={true}>
            <Box flexDirection="column">
              <Text dimColor>───────────────────────</Text>
              <Text dimColor>
                Type: <Text color={theme.colors.text}>{viewingMemory.type}</Text>
              </Text>
              <Text dimColor>
                Scope: <Text color={viewingMemory.scope === 'global' ? theme.tokens.yellow : theme.tokens.cyan}>{viewingMemory.scope}</Text>
              </Text>
              <Text dimColor>
                Source: <Text color={theme.colors.text}>{viewingMemory.source}</Text>
              </Text>
              <Text dimColor>
                Access count: <Text color={theme.colors.text}>{viewingMemory.accessCount}</Text>
              </Text>
              <Text dimColor>
                Created: <Text color={theme.colors.text}>{new Date(viewingMemory.createdAt).toLocaleString()}</Text>
              </Text>
              <Text dimColor>
                Updated: <Text color={theme.colors.text}>{new Date(viewingMemory.updatedAt).toLocaleString()}</Text>
              </Text>
              <Text dimColor>
                Last accessed: <Text color={theme.colors.text}>{new Date(viewingMemory.lastAccessedAt).toLocaleString()}</Text>
              </Text>
              {viewingMemory.tags.length > 0 && (
                <Text dimColor>
                  Tags: <Text color={theme.colors.text}>{viewingMemory.tags.join(', ')}</Text>
                </Text>
              )}
              <Text dimColor>
                ID: <Text color={theme.colors.text}>{viewingMemory.id}</Text>
              </Text>
            </Box>
          </AutoScrollBox>
        </Box>
      </AppModal>
    );
  }

  // List view
  const footerContent = (
    <Box marginLeft={1} flexGrow={1} marginRight={1} flexShrink={0}>
      <HelpText
        segments={[
          { text: '↑↓', highlight: true },
          { text: ' navigate • ' },
          { text: 'Enter', highlight: true },
          { text: ' view • ' },
          { text: 'd', highlight: true },
          { text: ' delete • ' },
          { text: 'ESC', highlight: true },
          { text: ' exit' },
        ]}
      />
    </Box>
  );

  return (
    <AppModal
      visible={visible}
      title="Memories"
      closeOnEscape={true}
      closeOnEnter={false}
      onClose={onClose}
      paddingX={1}
      paddingY={0}
      footer={footerContent}
      height={modalHeight}
    >
      {memories.length === 0 ? (
        <Box marginX={1} flexDirection="column">
          <Text color={theme.history.help}>No memories stored yet.</Text>
          <Text color={theme.colors.muted} dimColor>
            {'\n'}Memories are stored from:
          </Text>
          <Text color={theme.colors.muted} dimColor>
            • Background extraction after each turn
          </Text>
          <Text color={theme.colors.muted} dimColor>
            • memory_save tool usage
          </Text>
          <Text color={theme.colors.muted} dimColor>
            • /memory add {"<content>"} command
          </Text>
        </Box>
      ) : (
        <MemoryList
          memories={state.memories}
          onMemorySelect={state.setSelectedIndex}
          onView={handleView}
          onDelete={handleDelete}
          focus={true}
        />
      )}
    </AppModal>
  );
};
```

**Step 2: Create the index.ts barrel export**

```ts
export { MemoryModal } from './MemoryModal.js';
export { MemoryList } from './MemoryList.js';
export { useMemoryModalState } from './useMemoryModalState.js';
```

**Step 3: Verify no type errors**

Run: `cd packages/nuvin-cli && npx tsc --noEmit`

---

### Task 4: Convert `/memory` command to component type

**Files:**
- Delete: `packages/nuvin-cli/source/modules/commands/definitions/memory.ts`
- Create: `packages/nuvin-cli/source/modules/commands/definitions/memory.tsx`
- Modify: `packages/nuvin-cli/source/modules/commands/definitions/index.ts` (import path change from `./memory.js` — no change needed since JS extension stays the same)

The command component loads memories from `MemoryService`, passes them to `MemoryModal`, and handles delete callbacks.

**Step 1: Create the new memory.tsx command file**

```tsx
import { useCallback, useEffect, useState } from 'react';
import { Text } from 'ink';
import { AppModal } from '@/components/AppModal.js';
import type { CommandRegistry, CommandComponentProps } from '@/modules/commands/types.js';
import { useTheme } from '@/contexts/ThemeContext.js';
import { orchestratorManager } from '@/services/OrchestratorManager.js';
import { MemoryModal } from '@/components/MemoryModal/index.js';
import type { MemoryEntry } from '@nuvin/nuvin-core';

const MemoryCommandComponent = ({ deactivate }: CommandComponentProps) => {
  const { theme } = useTheme();
  const [memories, setMemories] = useState<MemoryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadMemories = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const memoryService = orchestratorManager.getMemoryService();
      if (!memoryService) {
        setError('Memory is not enabled. Set memory.enabled = true in your config.');
        return;
      }
      const entries = await memoryService.getAllMemories();
      setMemories(entries);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setError(`Failed to load memories: ${message}`);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadMemories();
  }, [loadMemories]);

  const handleDelete = useCallback(async (id: string) => {
    const memoryService = orchestratorManager.getMemoryService();
    if (!memoryService) return;

    const deleted = await memoryService.deleteMemory(id);
    if (deleted) {
      setMemories((prev) => prev.filter((m) => m.id !== id));
    }
  }, []);

  if (loading) {
    return (
      <AppModal visible={true} title="Memories" onClose={deactivate} closeOnEscape={true}>
        <Text color={theme.colors.warning}>Loading memories...</Text>
      </AppModal>
    );
  }

  if (error) {
    return (
      <AppModal
        visible={true}
        title="Memories"
        titleColor={theme.colors.error}
        type="error"
        onClose={deactivate}
        closeOnEscape={true}
      >
        <Text color={theme.colors.error}>{error}</Text>
      </AppModal>
    );
  }

  return (
    <MemoryModal
      visible={true}
      memories={memories}
      onClose={deactivate}
      onDelete={handleDelete}
    />
  );
};

export function registerMemoryCommand(registry: CommandRegistry): void {
  registry.register({
    id: '/memory',
    type: 'component',
    description: 'Manage long-term agent memories',
    category: 'session',
    keywords: ['memory', 'memories', 'remember', 'forget'],
    component: MemoryCommandComponent,
  });
}
```

**Step 2: Delete the old memory.ts file**

```bash
rm packages/nuvin-cli/source/modules/commands/definitions/memory.ts
```

**Step 3: Verify no type errors**

Run: `cd packages/nuvin-cli && npx tsc --noEmit`
Expected: Clean compile

---

### Task 5: Handle ComboBox `onDelete` support

**Files:**
- Modify: `packages/nuvin-cli/source/components/ComboBox/ComboBox.tsx` (check if `onDelete` prop exists)

**Step 1: Check ComboBox interface**

Check if `ComboBox` already has an `onDelete` or similar callback. Look at the component's props interface.

**If `onDelete` is NOT supported:**

Two options:
1. **Add `onDelete` to ComboBox** — Add a `d` key handler in ComboBox that calls `onDelete?.(highlightedItem)` (preferred, consistent with `onSpace` pattern)
2. **Handle at modal level** — Use `useInput` in `MemoryModal` to listen for `d` and call delete on the currently selected memory (fallback)

If adding to ComboBox, the change is minimal:
- Add `onDelete?: (item: ComboBoxItem) => void` to props
- In the key handler, add a case for input `d` (when not in search mode) that calls `onDelete?.(currentItem)`

**Step 2: Verify no type errors**

Run: `cd packages/nuvin-cli && npx tsc --noEmit`

---

### Task 6: Run tests and build

**Step 1: Run CLI tests**

Run: `cd packages/nuvin-cli && pnpm test`
Expected: All tests pass

**Step 2: Run build**

Run: `cd packages/nuvin-cli && pnpm build`
Expected: Clean build

**Step 3: Run tsc**

Run: `cd packages/nuvin-cli && npx tsc --noEmit`
Expected: No errors

**Step 4: Commit**

```bash
git add -A
git commit -m "feat(memory): convert /memory command to modal UI with searchable list"
```

---

## Summary of files

### New files (4):
- `packages/nuvin-cli/source/components/MemoryModal/useMemoryModalState.ts`
- `packages/nuvin-cli/source/components/MemoryModal/MemoryList.tsx`
- `packages/nuvin-cli/source/components/MemoryModal/MemoryModal.tsx`
- `packages/nuvin-cli/source/components/MemoryModal/index.ts`

### Replaced files (1):
- `packages/nuvin-cli/source/modules/commands/definitions/memory.ts` → `memory.tsx`

### Potentially modified files (1):
- `packages/nuvin-cli/source/components/ComboBox/ComboBox.tsx` (if `onDelete` needs adding)

### No changes needed:
- `packages/nuvin-cli/source/modules/commands/definitions/index.ts` — import `from './memory.js'` works for both `.ts` and `.tsx`
