# Workspace-Isolated Memory Upgrade Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make Nuvin long-term memory smarter and strictly scoped so an agent only reads `global` + current workspace/project memory, never other workspaces.

**Architecture:** Introduce a `WorkspaceContext` resolver (stable workspace identity), refactor memory prompt assembly into a single idempotent builder, and evolve `MemoryService` into retrieval-time scoped + query-aware ranking with consolidation/upsert rules. Preserve JSON-file persistence, profile isolation, and backward compatibility.

**Tech Stack:** TypeScript (strict), Vitest, existing `MemoryService` + `JsonFileMemoryStore`, existing config system.

---

### Task 1: Lock current behavior with failing tests

**Files:**
- Create: `packages/nuvin-cli/tests/orchestrator-memory-injection.test.ts`
- Modify: `packages/nuvin-cli/tests/memory-service.test.ts`

**Step 1: Add failing test for prompt duplication**

Create test that calls `OrchestratorManager.send()` twice and asserts system prompt contains only one `## Long-Term Memory` section.

**Step 2: Add failing test for workspace isolation**

Create two temp workspaces (`repo-a`, `repo-b`) with different project memory files. Assert manager started in `repo-a` cannot retrieve project memories from `repo-b`.

**Step 3: Add failing test for extraction scope**

Assert background extraction defaults to `project` scope for project-specific sessions (current behavior incorrectly saves as `global`).

**Step 4: Run tests**

Run: `pnpm --filter @nuvin/nuvin-cli test -- orchestrator-memory-injection.test.ts memory-service.test.ts`
Expected: FAIL on new assertions.

**Step 5: Commit**

```bash
git add packages/nuvin-cli/tests/orchestrator-memory-injection.test.ts packages/nuvin-cli/tests/memory-service.test.ts
git commit -m "test(cli): add failing tests for workspace-scoped memory behavior"
```

### Task 2: Add stable workspace identity resolution

**Files:**
- Create: `packages/nuvin-cli/source/services/WorkspaceContextService.ts`
- Modify: `packages/nuvin-cli/source/services/OrchestratorManager.ts`
- Test: `packages/nuvin-cli/tests/workspace-context-service.test.ts`

**Step 1: Implement `WorkspaceContextService`**

Return:
- `workspaceRoot` (prefer `git rev-parse --show-toplevel`, fallback `realpath(process.cwd())`)
- `workspaceId` (stable hash of canonical root path)

**Step 2: Use workspace root for project memory directory**

Replace `projectDir = path.join(process.cwd(), '.nuvin', 'memory')` with `path.join(workspaceRoot, '.nuvin', 'memory')`.

**Step 3: Add tests for subdirectory behavior**

Assert starting in `/repo/sub/dir` resolves to `/repo` and same `workspaceId`.

**Step 4: Run tests**

Run: `pnpm --filter @nuvin/nuvin-cli test -- workspace-context-service.test.ts`
Expected: PASS.

**Step 5: Commit**

```bash
git add packages/nuvin-cli/source/services/WorkspaceContextService.ts packages/nuvin-cli/source/services/OrchestratorManager.ts packages/nuvin-cli/tests/workspace-context-service.test.ts
git commit -m "feat(cli): resolve stable workspace identity for memory scoping"
```

### Task 3: Make memory prompt injection idempotent

**Files:**
- Create: `packages/nuvin-cli/source/services/memory-prompt-builder.ts`
- Modify: `packages/nuvin-cli/source/services/OrchestratorManager.ts`
- Test: `packages/nuvin-cli/tests/orchestrator-memory-injection.test.ts`

**Step 1: Extract prompt-builder function**

Implement `buildSystemPromptWithMemory(basePrompt, memoryBlock)` with explicit start/end markers:
- `<!-- nuvin:memory:start -->`
- `<!-- nuvin:memory:end -->`

Function must remove old block before injecting new one.

**Step 2: Track immutable base system prompt**

Store base prompt in manager (`baseSystemPrompt`) from init/agent swap and always build from base, never from previously injected prompt.

**Step 3: Update tests**

Assert repeated sends do not duplicate memory sections.

**Step 4: Run tests**

Run: `pnpm --filter @nuvin/nuvin-cli test -- orchestrator-memory-injection.test.ts`
Expected: PASS.

**Step 5: Commit**

```bash
git add packages/nuvin-cli/source/services/memory-prompt-builder.ts packages/nuvin-cli/source/services/OrchestratorManager.ts packages/nuvin-cli/tests/orchestrator-memory-injection.test.ts
git commit -m "fix(cli): make long-term memory prompt injection idempotent"
```

### Task 4: Enforce strict extraction scope + tool gating

**Files:**
- Modify: `packages/nuvin-cli/source/config/types.ts`
- Modify: `packages/nuvin-cli/source/services/OrchestratorManager.ts`
- Modify: `packages/nuvin-cli/source/services/MemoryService.ts`
- Test: `packages/nuvin-cli/tests/orchestrator-memory-injection.test.ts`

**Step 1: Add memory config defaults**

Add optional fields:
- `memory.defaultScope?: 'project' | 'global' | 'auto'` (default to `'project'`)
- `memory.enableExtractionEnvGate?: boolean` (default `false`, preserve env gate only when enabled)

**Step 2: Fix extraction scope decision**

In `extractMemoriesInBackground`, resolve scope using config + workspace context:
- `project` default
- `auto` chooses project when workspace exists, else global

**Step 3: Respect `memory.saveTool`**

Only add `memory_save` to enabled tools when memory is enabled and `saveTool !== false`.

**Step 4: Add tests**

Verify:
- extraction writes project entries by default
- save tool is absent when disabled
- env-gate logic behaves as configured

**Step 5: Run tests**

Run: `pnpm --filter @nuvin/nuvin-cli test -- orchestrator-memory-injection.test.ts`
Expected: PASS.

**Step 6: Commit**

```bash
git add packages/nuvin-cli/source/config/types.ts packages/nuvin-cli/source/services/OrchestratorManager.ts packages/nuvin-cli/source/services/MemoryService.ts packages/nuvin-cli/tests/orchestrator-memory-injection.test.ts
git commit -m "fix(cli): enforce project-first extraction scope and memory tool gating"
```

### Task 5: Add memory consolidation and conflict handling

**Files:**
- Modify: `packages/nuvin-core/src/memory/types.ts`
- Modify: `packages/nuvin-core/src/memory/memory-store.ts`
- Modify: `packages/nuvin-cli/source/services/MemoryService.ts`
- Test: `packages/nuvin-cli/tests/memory-service.test.ts`

**Step 1: Extend memory schema for consolidation**

Add optional fields:
- `key?: string` (stable semantic key, e.g., `style.indent`, `project.architecture`)
- `workspaceId?: string` (for observability/debug)

**Step 2: Add upsert behavior**

Implement `upsertMemoryByKeyOrContent` in `MemoryService`:
- same `scope + key` updates existing entry
- if no key, normalized-content dedupe threshold prevents near-duplicate writes

**Step 3: Implement project-over-global precedence**

At retrieval time, when both scopes contain same `key`, keep project entry and suppress global duplicate.

**Step 4: Add tests**

Verify dedupe, key-based upsert, and precedence logic.

**Step 5: Run tests**

Run: `pnpm --filter @nuvin/nuvin-cli test -- memory-service.test.ts`
Expected: PASS.

**Step 6: Commit**

```bash
git add packages/nuvin-core/src/memory/types.ts packages/nuvin-core/src/memory/memory-store.ts packages/nuvin-cli/source/services/MemoryService.ts packages/nuvin-cli/tests/memory-service.test.ts
git commit -m "feat(memory): add consolidation and project-over-global conflict resolution"
```

### Task 6: Upgrade retrieval to be query-aware and scope-safe

**Files:**
- Modify: `packages/nuvin-cli/source/services/MemoryService.ts`
- Modify: `packages/nuvin-cli/source/services/OrchestratorManager.ts`
- Test: `packages/nuvin-cli/tests/memory-service.test.ts`

**Step 1: Add query-aware retrieval API**

Change:
- `getMemoryPromptInjection(limit?)`
To:
- `getMemoryPromptInjection({ query, workspaceId, limit })`

**Step 2: Add hybrid ranking**

Score by:
- semantic relevance to current user message (`query`) via lexical overlap now
- recency/frequency/type (existing score)

Keep deterministic fallback when query is empty.

**Step 3: Update manager call-site**

Pass latest user text + workspace id into injection API.

**Step 4: Add tests**

Verify relevant memories are preferred over irrelevant high-recency items.

**Step 5: Run tests**

Run: `pnpm --filter @nuvin/nuvin-cli test -- memory-service.test.ts orchestrator-memory-injection.test.ts`
Expected: PASS.

**Step 6: Commit**

```bash
git add packages/nuvin-cli/source/services/MemoryService.ts packages/nuvin-cli/source/services/OrchestratorManager.ts packages/nuvin-cli/tests/memory-service.test.ts packages/nuvin-cli/tests/orchestrator-memory-injection.test.ts
git commit -m "feat(memory): add query-aware scoped retrieval for prompt injection"
```

### Task 7: Migrate and document behavior

**Files:**
- Modify: `packages/nuvin-cli/source/utils/config-migration.ts`
- Modify: `README.md`
- Create: `docs/memory-scoping.md`

**Step 1: Config migration defaults**

When memory config exists and `defaultScope` absent, set to `'project'` during migration.

**Step 2: Document scope rules**

Document:
- Read scope = `global + current workspace`
- Never read other workspace project memories
- Conflict resolution precedence
- How to override via config

**Step 3: Run lint/tests**

Run:
- `pnpm lint`
- `pnpm --filter @nuvin/nuvin-cli test`

Expected: PASS.

**Step 4: Commit**

```bash
git add packages/nuvin-cli/source/utils/config-migration.ts README.md docs/memory-scoping.md
git commit -m "docs(cli): document workspace-isolated memory model and migration defaults"
```

### Task 8: Final verification

**Files:**
- No file changes

**Step 1: Full regression run**

Run:
- `pnpm test`
- `pnpm build`

Expected: all pass.

**Step 2: Manual smoke checks**

1. Start in workspace A, store project memory, confirm retrieval.
2. Start in workspace B, confirm A project memory not visible.
3. Confirm global memory visible in both.
4. Send multiple turns and confirm exactly one memory section in system prompt.

**Step 3: Final commit**

```bash
git add -A
git commit -m "chore: verify workspace-isolated memory upgrade end-to-end"
```

---

## Notes

- This plan intentionally prioritizes correctness and isolation before “smarter” retrieval quality.
- Embedding-based semantic retrieval can be added later as an optional phase once this baseline is stable.
