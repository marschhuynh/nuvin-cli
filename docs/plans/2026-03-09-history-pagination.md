# History Pagination — Infinite Scroll + Full-Disk Search Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace the current "load all sessions at once" approach in `/history` with two distinct modes:
1. **Browse mode** — infinite-scroll paginated list loading sessions 20 at a time as the user scrolls.
2. **Search mode** — when the user types a query, switch to a full-disk search across all sessions and show matches instantly (debounced 300ms). Clearing the query resets back to browse mode at page 1.

**Architecture:**
- `scanAvailableSessions` gains an `offset` param for pagination.
- A new `searchSessions(query, profile)` function scans all sessions on disk for topic/lastMessage matches, with its own cache keyed by query string.
- `WindowedComboBox` gains an `onQueryChange` prop to expose the internal debounced search query.
- `HistorySelection` receives `hasMore / isLoadingMore / onLoadMore / onQueryChange` and drives mode-switching.
- `history.tsx` owns the paginated state + search state and feeds whichever list is active to `HistorySelection`.

**Tech Stack:** TypeScript, React (Ink), existing `scanAvailableSessions` + `WindowedComboBox`, Node.js `fs/promises`.

---

## Current State (What We're Changing)

```
history.tsx
  └─ useEffect: scanAvailableSessions(undefined, profile)   ← no limit, loads ALL
        └─ reads EVERY history.cli.json on disk
  └─ <HistorySelection availableSessions={all} />           ← passes all at once

scanAvailableSessions(limit?, profile?)
  └─ stops after `limit` entries found, but no offset

WindowedComboBox
  └─ searchQuery: internal state, never exposed to parent
```

**Problems:**
- 500 sessions = 500 file reads on open, multi-second stall
- Cache key `default_all` grows unbounded
- No way to "load more"
- Search only filters already-loaded sessions — misses sessions not yet paginated in

---

## Target Behaviour

### Browse mode (no search query)
- Open `/history` → loads first **20** sessions immediately
- Scroll near the bottom → silently fetches next 20, appends, no flicker
- `"Loading more..."` indicator when a fetch is in flight
- `"All sessions loaded"` when `hasMore = false`

### Search mode (user types a query)
- After 300ms debounce, switch to search mode: call `searchSessions(query, profile)` which scans **all** sessions on disk
- Replace the browse list with search results — show `"Searching..."` while in-flight
- `"N sessions matched"` or `"No sessions matched"` at the bottom
- Clearing the search box resets to browse mode at **page 1**

---

## Task 1: Add `onQueryChange` to `WindowedComboBox`

**Files:**
- Modify: `packages/nuvin-cli/source/components/ComboBox/WindowedComboBox.tsx`
- Modify: `packages/nuvin-cli/source/components/ComboBox/ComboBox.tsx` (type only)

`WindowedComboBox` already debounces the search query internally (200ms). We need to expose it so `HistorySelection` can react to it.

**Step 1: Add `onQueryChange` to `ComboBoxProps`**

In `ComboBox.tsx`, add to the `ComboBoxProps` type:

```ts
onQueryChange?: (query: string) => void;
```

**Step 2: Fire `onQueryChange` in `WindowedComboBox`**

In `WindowedComboBox.tsx`, destructure `onQueryChange` from props and fire it whenever `searchQuery` changes:

```ts
const { ..., onQueryChange } = props;

// after the existing debounce useEffect:
useEffect(() => {
  onQueryChange?.(searchQuery);
}, [searchQuery, onQueryChange]);
```

**Step 3: Run type check**

```bash
cd packages/nuvin-cli && pnpm exec tsc --noEmit
```

**Step 4: Commit**

```bash
git add packages/nuvin-cli/source/components/ComboBox/ComboBox.tsx packages/nuvin-cli/source/components/ComboBox/WindowedComboBox.tsx
git commit -m "feat(combobox): expose onQueryChange prop in WindowedComboBox"
```

---

## Task 2: Add `offset` param to `scanAvailableSessions`

**Files:**
- Modify: `packages/nuvin-cli/source/hooks/useSessionManagement.ts`

`scanAvailableSessions(limit?, profile?)` currently always scans from the beginning.
Add `offset?: number` as second parameter (shift `profile` to third).

Current signature:
```ts
export const scanAvailableSessions = async (limit?: number, profile?: string): Promise<SessionInfo[]>
```

New signature:
```ts
export const scanAvailableSessions = async (limit?: number, offset?: number, profile?: string): Promise<SessionInfo[]>
```

**Step 1: Update cache key to include offset**

```ts
// line ~62
function getCacheKey(limit?: number, offset?: number, profile?: string): CacheKey {
  return `${profile ?? DEFAULT_PROFILE}_${limit ?? 'all'}_${offset ?? 0}`;
}
```

**Step 2: Update the function signature and skip `offset` entries before collecting**

In the scanning loop (around line 96), skip the first `offset` qualifying sessions:

```ts
export const scanAvailableSessions = async (
  limit?: number,
  offset?: number,
  profile?: string,
): Promise<SessionInfo[]> => {
  const cacheKey = getCacheKey(limit, offset, profile);
  // ... cache check unchanged ...

  const promise = (async () => {
    try {
      const dir = sessionsDir(profile);
      if (!fs.existsSync(dir)) return [];

      const entries = await fsp.readdir(dir, { withFileTypes: true });
      const sessionDirs = entries
        .filter((d) => d.isDirectory())
        .map((d) => d.name)
        .sort((a, b) => parseInt(b, 10) - parseInt(a, 10));

      const sessions: SessionData = [];
      let skipped = 0;
      const skip = offset ?? 0;

      for (const sessionIdStr of sessionDirs) {
        if (limit && sessions.length >= limit) break;

        const historyFile = path.join(dir, sessionIdStr, 'history.cli.json');
        try {
          const historyData = await readJson<Record<string, unknown>>(historyFile);
          if (!historyData) continue;

          const cliMessages = (historyData?.default ?? historyData?.cli ?? []) as Message[];
          if (cliMessages.length === 0) continue;

          // Skip first `skip` qualifying sessions
          if (skipped < skip) {
            skipped++;
            continue;
          }

          // ... rest of existing extraction (lastMessage, topic, timestamp) unchanged ...
          sessions.push({ ... });
        } catch (_err) {}
      }

      sessionCache.set(cacheKey, { timestamp: Date.now(), data: sessions });
      return sessions;
    } finally {
      scanPromises.delete(cacheKey);
    }
  })();

  scanPromises.set(cacheKey, promise);
  return promise;
};
```

**Step 3: Update all existing call sites** that pass `profile` as second argument:

- `packages/nuvin-cli/source/modules/commands/definitions/history.tsx` — change `scanAvailableSessions(undefined, currentProfile)` → `scanAvailableSessions(undefined, undefined, currentProfile)`
- Any other grep hits: `grep -r "scanAvailableSessions" packages/nuvin-cli/source/`

**Step 4: Add comment about offset assumption**

```ts
// NOTE: Offset-based pagination assumes the sessions directory doesn't change
// between page fetches. Since sessions are append-only and the 10s TTL is short,
// this is acceptable. The TTL cache prevents redundant reads within one open.
```

**Step 5: Run type check**

```bash
cd packages/nuvin-cli && pnpm exec tsc --noEmit
```

**Step 6: Commit**

```bash
git add packages/nuvin-cli/source/hooks/useSessionManagement.ts packages/nuvin-cli/source/modules/commands/definitions/history.tsx
git commit -m "feat(history): add offset param to scanAvailableSessions"
```

---

## Task 3: Add `searchSessions` function

**Files:**
- Modify: `packages/nuvin-cli/source/hooks/useSessionManagement.ts`

A dedicated function that scans **all** sessions on disk and returns those whose `topic` or `lastMessage` match the given query (case-insensitive substring). Uses its own cache keyed by `${profile}_search_${query}`.

**Step 1: Add search cache**

```ts
const searchCache = new Map<CacheKey, { timestamp: number; data: SessionData }>();
const searchPromises = new Map<CacheKey, Promise<SessionData>>();
```

**Step 2: Implement `searchSessions`**

```ts
export const searchSessions = async (query: string, profile?: string): Promise<SessionInfo[]> => {
  const q = query.toLowerCase().trim();
  if (!q) return [];

  const cacheKey = `${profile ?? DEFAULT_PROFILE}_search_${q}`;

  const cached = searchCache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return cached.data;
  }

  const existing = searchPromises.get(cacheKey);
  if (existing) return existing;

  const promise = (async () => {
    try {
      const dir = sessionsDir(profile);
      if (!fs.existsSync(dir)) return [];

      const entries = await fsp.readdir(dir, { withFileTypes: true });
      const sessionDirs = entries
        .filter((d) => d.isDirectory())
        .map((d) => d.name)
        .sort((a, b) => parseInt(b, 10) - parseInt(a, 10));

      const results: SessionData = [];

      for (const sessionIdStr of sessionDirs) {
        const historyFile = path.join(dir, sessionIdStr, 'history.cli.json');
        try {
          const historyData = await readJson<Record<string, unknown>>(historyFile);
          if (!historyData) continue;

          const cliMessages = (historyData?.default ?? historyData?.cli ?? []) as Message[];
          if (cliMessages.length === 0) continue;

          // extract lastMessage, topic, timestamp (identical logic as scanAvailableSessions)
          let lastMessage = 'No messages';
          for (let i = cliMessages.length - 1; i >= 0; i--) {
            const msg = cliMessages[i] as { role?: string; content?: unknown };
            if (msg?.role === 'user') {
              lastMessage = typeof msg.content === 'string' ? msg.content : '';
              break;
            }
          }

          const metadataKey = '__metadata__default';
          const metadataArray = historyData?.[metadataKey] as unknown[];
          const metadata = metadataArray?.[0] ?? null;
          const topic =
            metadata && typeof metadata === 'object' && 'topic' in metadata
              ? (metadata as { topic?: string }).topic
              : undefined;

          // Only include if query matches topic or lastMessage
          const haystack = `${topic ?? ''} ${lastMessage}`.toLowerCase();
          if (!haystack.includes(q)) continue;

          results.push({
            sessionId: sessionIdStr,
            timestamp: new Date(parseInt(sessionIdStr, 10)).toLocaleString(),
            lastMessage,
            messageCount: cliMessages.length,
            topic,
          });
        } catch (_err) {}
      }

      searchCache.set(cacheKey, { timestamp: Date.now(), data: results });
      return results;
    } finally {
      searchPromises.delete(cacheKey);
    }
  })();

  searchPromises.set(cacheKey, promise);
  return promise;
};
```

**Step 3: Export `searchSessions` from the hook**

Add `searchSessions` to the returned object of `useSessionManagement` and to the standalone export at the bottom of the file.

**Step 4: Run type check**

```bash
cd packages/nuvin-cli && pnpm exec tsc --noEmit
```

**Step 5: Commit**

```bash
git add packages/nuvin-cli/source/hooks/useSessionManagement.ts
git commit -m "feat(history): add searchSessions for full-disk query search"
```

---

## Task 4: Add `onHighlight` + `hasMore` / `onQueryChange` to `HistorySelection`

**Files:**
- Modify: `packages/nuvin-cli/source/components/HistorySelection.tsx`

**Step 1: Extend `HistorySelectionProps`**

```ts
type HistorySelectionProps = {
  availableSessions: SessionInfo[];
  hasMore: boolean;
  isLoadingMore: boolean;
  isSearching: boolean;      // true while searchSessions is in-flight
  searchResultCount: number | null; // null = not in search mode
  onLoadMore: () => void;
  onQueryChange: (query: string) => void;
};
```

**Step 2: Use `onHighlight` to trigger load more (browse mode only)**

```tsx
const LOAD_MORE_THRESHOLD = 5;

const handleHighlight = useCallback(
  (_item: ComboBoxItem | null, index: number) => {
    // Only trigger in browse mode (no active search)
    if (searchResultCount !== null) return;
    if (!hasMore || isLoadingMore) return;
    if (index >= comboBoxItems.length - LOAD_MORE_THRESHOLD) {
      onLoadMore();
    }
  },
  [hasMore, isLoadingMore, comboBoxItems.length, onLoadMore, searchResultCount],
);
```

**Step 3: Show status line**

```tsx
return (
  <Box flexDirection="column" flexGrow={1} overflow="hidden">
    <WindowedComboBox
      items={comboBoxItems}
      showSearchInput={true}
      placeholder="Search sessions..."
      showItemCount={false}
      enableRotation={false}
      focus={true}
      fuzzySearch={false}           // ← disable internal fuzzy: search is handled server-side
      onHighlight={handleHighlight}
      onQueryChange={onQueryChange}
      renderItem={...}
      onSelect={handleSelect}
    />
    <Box height={1} flexShrink={0}>
      {/* Search mode */}
      {isSearching && <Text dimColor>  Searching all sessions...</Text>}
      {searchResultCount !== null && !isSearching && searchResultCount === 0 && (
        <Text dimColor>  No sessions matched</Text>
      )}
      {searchResultCount !== null && !isSearching && searchResultCount > 0 && (
        <Text dimColor>  {searchResultCount} sessions matched</Text>
      )}
      {/* Browse mode */}
      {searchResultCount === null && isLoadingMore && <Text dimColor> ↓ Loading more sessions...</Text>}
      {searchResultCount === null && !hasMore && !isLoadingMore && availableSessions.length > 0 && (
        <Text dimColor>  All sessions loaded ({availableSessions.length} total)</Text>
      )}
    </Box>
  </Box>
);
```

**Note on `fuzzySearch={false}`:** Since `searchSessions` already does substring matching server-side (full disk), passing search results to the ComboBox with `fuzzySearch=false` and an empty query means `WindowedComboBox` renders results as-is without re-filtering. The `onQueryChange` callback fires the server-side search. This avoids double filtering.

**Step 4: Run type check**

```bash
cd packages/nuvin-cli && pnpm exec tsc --noEmit
```

**Step 5: Commit**

```bash
git add packages/nuvin-cli/source/components/HistorySelection.tsx
git commit -m "feat(history): add onLoadMore/hasMore/onQueryChange + search status to HistorySelection"
```

---

## Task 5: Wire pagination + search state in `history.tsx`

**Files:**
- Modify: `packages/nuvin-cli/source/modules/commands/definitions/history.tsx`

**Step 1: Add constants and state**

```ts
const PAGE_SIZE = 20;

// in component:
const [browsesessions, setBrowseSessions] = useState<SessionInfo[]>([]);
const [page, setPage] = useState(0);
const [hasMore, setHasMore] = useState(true);
const [isLoadingMore, setIsLoadingMore] = useState(false);
const [loading, setLoading] = useState(true);

const [searchQuery, setSearchQuery] = useState('');
const [searchResults, setSearchResults] = useState<SessionInfo[] | null>(null); // null = browse mode
const [isSearching, setIsSearching] = useState(false);

// Active list shown in HistorySelection:
const activeSessions = searchResults ?? browseSessions;
```

**Step 2: `loadPage` function**

```ts
const loadPage = useCallback(async (pageIndex: number, existing: SessionInfo[]) => {
  if (isLoadingMore) return;
  setIsLoadingMore(true);
  try {
    const offset = pageIndex * PAGE_SIZE;
    const newSessions = await scanAvailableSessions(PAGE_SIZE, offset, currentProfile);
    if (newSessions.length === 0) {
      setHasMore(false);
    } else {
      setBrowseSessions([...existing, ...newSessions]);
      setPage(pageIndex + 1);
      if (newSessions.length < PAGE_SIZE) setHasMore(false);
    }
  } catch (err) {
    // emit error event
  } finally {
    setIsLoadingMore(false);
  }
}, [isLoadingMore, currentProfile]);
```

**Step 3: Initial load**

```ts
useEffect(() => {
  const init = async () => {
    try {
      const first = await scanAvailableSessions(PAGE_SIZE, 0, currentProfile);
      if (first.length === 0) {
        context.eventBus.emit('ui:line', { /* no sessions */ });
        deactivate();
        return;
      }
      setBrowseSessions(first);
      setPage(1);
      setHasMore(first.length === PAGE_SIZE);
    } catch (err) {
      // emit error + deactivate
    } finally {
      setLoading(false);
    }
  };
  init();
}, [/* same deps as before */]);
```

**Step 4: Handle query change — debounce is already done by WindowedComboBox**

```ts
const handleQueryChange = useCallback(async (query: string) => {
  setSearchQuery(query);
  if (!query.trim()) {
    // Clear search → reset to browse mode at page 1
    setSearchResults(null);
    return;
  }
  setIsSearching(true);
  try {
    const results = await searchSessions(query, currentProfile);
    setSearchResults(results);
  } catch (_err) {
    setSearchResults([]);
  } finally {
    setIsSearching(false);
  }
}, [currentProfile]);
```

**Step 5: `onLoadMore` callback**

```ts
const handleLoadMore = useCallback(() => {
  loadPage(page, browseSessions);
}, [loadPage, page, browseSessions]);
```

**Step 6: Pass all props to `HistorySelection`**

```tsx
<HistorySelection
  availableSessions={activeSessions}
  hasMore={hasMore}
  isLoadingMore={isLoadingMore}
  isSearching={isSearching}
  searchResultCount={searchResults !== null ? searchResults.length : null}
  onLoadMore={handleLoadMore}
  onQueryChange={handleQueryChange}
/>
```

**Step 7: Run type check**

```bash
cd packages/nuvin-cli && pnpm exec tsc --noEmit
```

**Step 8: Commit**

```bash
git add packages/nuvin-cli/source/modules/commands/definitions/history.tsx
git commit -m "feat(history): wire pagination + full-disk search state in history.tsx"
```

---

## Task 6: Manual smoke test

No automated tests exist for this flow (it's all file I/O + ink rendering). Do a manual verification:

**Browse mode:**
1. Run the CLI and type `/history` — modal opens, first 20 sessions appear immediately
2. Arrow-down to the end — `"↓ Loading more sessions..."` briefly, then more appended
3. Keep scrolling until `"All sessions loaded (N total)"` appears

**Search mode:**
4. Type a word in the search box — after ~300ms, `"Searching all sessions..."` flashes, then results appear
5. Results include sessions from pages that weren't loaded yet
6. `"N sessions matched"` or `"No sessions matched"` shows at the bottom
7. Clear the search box — browse list resets to page 1

**General:**
8. Press `Esc` — modal closes cleanly
9. Select any session — switches session correctly

---

## Summary of Changes

| File | Change |
|---|---|
| `components/ComboBox/ComboBox.tsx` | Add `onQueryChange` to `ComboBoxProps` type |
| `components/ComboBox/WindowedComboBox.tsx` | Fire `onQueryChange` when `searchQuery` changes |
| `hooks/useSessionManagement.ts` | Add `offset` param + skip loop to `scanAvailableSessions`; add `searchSessions` |
| `components/HistorySelection.tsx` | Add `hasMore/isLoadingMore/isSearching/searchResultCount/onLoadMore/onQueryChange` props; `onHighlight` trigger; status line |
| `modules/commands/definitions/history.tsx` | Browse + search state, `loadPage()`, `handleQueryChange()`, initial load `PAGE_SIZE=20` |

