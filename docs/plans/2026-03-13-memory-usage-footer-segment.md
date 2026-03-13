# Memory Usage Footer Segment Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add an opt-in `'memory'` statusline segment that displays Node.js heap used (e.g. `Mem: 128MB`) updated every 2 seconds.

**Architecture:** Self-contained in the Footer component — a `setInterval` polling `process.memoryUsage().heapUsed` updates a local React state every 2s. The segment is registered in the type system and the `/statusline` picker but is not in the default layout (users opt-in).

**Tech Stack:** TypeScript, React (Ink), no new dependencies.

---

### Task 1: Add `'memory'` to the `StatuslineSegment` type

**Files:**
- Modify: `packages/nuvin-cli/source/config/types.ts:109-122`

**Step 1: Add the segment to the union**

In `packages/nuvin-cli/source/config/types.ts`, change:

```ts
export type StatuslineSegment =
  | 'model'
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
```

to:

```ts
export type StatuslineSegment =
  | 'model'
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
  | 'keybindings'
  | 'memory';
```

**Step 2: Check for TypeScript errors**

Run: `cd packages/nuvin-cli && pnpm tsc --noEmit 2>&1 | head -30`

Expected: errors only about `memory` not being in `SEGMENT_LABELS` / `ALL_SEGMENTS` (we fix those in the next task). No other new errors.

**Step 3: Commit**

```bash
git add packages/nuvin-cli/source/config/types.ts
git commit -m "feat(cli): add 'memory' to StatuslineSegment type"
```

---

### Task 2: Register `'memory'` in the `/statusline` command picker

**Files:**
- Modify: `packages/nuvin-cli/source/modules/commands/definitions/statusline.tsx:16-46`

**Step 1: Add to `ALL_SEGMENTS`**

In `statusline.tsx`, change:

```ts
const ALL_SEGMENTS: StatuslineSegment[] = [
  'model',
  'session',
  'thinking',
  'sudo',
  'tokens',
  'context',
  'cached',
  'requests',
  'tools',
  'cost',
  'lsp',
  'gitBranch',
  'keybindings',
];
```

to:

```ts
const ALL_SEGMENTS: StatuslineSegment[] = [
  'model',
  'session',
  'thinking',
  'sudo',
  'tokens',
  'context',
  'cached',
  'requests',
  'tools',
  'cost',
  'lsp',
  'gitBranch',
  'keybindings',
  'memory',
];
```

**Step 2: Add to `SEGMENT_LABELS`**

Change:

```ts
const SEGMENT_LABELS: Record<StatuslineSegment, string> = {
  model: 'Provider:Model',
  session: 'Session ID',
  thinking: 'Thinking',
  sudo: 'SUDO',
  tokens: 'Tokens',
  context: 'Context %',
  cached: 'Cached',
  requests: 'Requests',
  tools: 'Tools',
  cost: 'Cost',
  lsp: 'LSP',
  gitBranch: 'Git branch',
  keybindings: 'Keybindings',
};
```

to:

```ts
const SEGMENT_LABELS: Record<StatuslineSegment, string> = {
  model: 'Provider:Model',
  session: 'Session ID',
  thinking: 'Thinking',
  sudo: 'SUDO',
  tokens: 'Tokens',
  context: 'Context %',
  cached: 'Cached',
  requests: 'Requests',
  tools: 'Tools',
  cost: 'Cost',
  lsp: 'LSP',
  gitBranch: 'Git branch',
  keybindings: 'Keybindings',
  memory: 'Memory (heap)',
};
```

**Step 3: Check for TypeScript errors**

Run: `cd packages/nuvin-cli && pnpm tsc --noEmit 2>&1 | head -30`

Expected: errors reduced — `SEGMENT_LABELS` exhaustiveness error gone. Footer's `renderSegment` switch may still warn about missing case (fixed in next task).

**Step 4: Commit**

```bash
git add packages/nuvin-cli/source/modules/commands/definitions/statusline.tsx
git commit -m "feat(cli): register memory segment in statusline picker"
```

---

### Task 3: Implement the `'memory'` segment in Footer

**Files:**
- Modify: `packages/nuvin-cli/source/components/Footer.tsx`

**Step 1: Add heap state and polling effect**

Inside `FooterComponent`, after the existing `const [lspServers, setLspServers] = useState(...)` line, add:

```ts
const [heapMB, setHeapMB] = useState(() =>
  Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
);

useEffect(() => {
  const id = setInterval(() => {
    setHeapMB(Math.round(process.memoryUsage().heapUsed / 1024 / 1024));
  }, 2000);
  return () => clearInterval(id);
}, []);
```

**Step 2: Add `case 'memory'` to `renderSegment`**

In the `renderSegment` switch, after the `case 'keybindings':` block and before the `default:` case, add:

```tsx
case 'memory':
  return (
    <Text key="memory" color={theme.footer.status} dimColor>
      Mem: {heapMB}MB
    </Text>
  );
```

**Step 3: Verify no TypeScript errors**

Run: `cd packages/nuvin-cli && pnpm tsc --noEmit 2>&1 | head -30`

Expected: clean (zero errors).

**Step 4: Commit**

```bash
git add packages/nuvin-cli/source/components/Footer.tsx
git commit -m "feat(cli): show heap memory usage in footer as opt-in segment"
```

---

### Task 4: Smoke-test in the running app

No automated test is needed — the segment is pure UI with no logic to unit-test. Verify manually:

1. Run nuvin: `cd packages/nuvin-cli && pnpm dev` (or however you normally launch the app)
2. Type `/statusline` and press Enter
3. Find `Memory (heap)` in the hidden-segments list and add it to a row
4. Confirm the footer shows `Mem: XXX MB`
5. Wait 2–4 seconds — confirm the number updates
