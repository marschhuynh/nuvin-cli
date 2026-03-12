# Tool Output Spill Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Create a general-purpose utility for tools to spill large output to session-scoped files, replacing ad-hoc temp file logic.

**Architecture:** Add `sessionDir` to `ToolExecutionContext` (propagated from orchestrator). Create a `ToolOutputSpill` utility that any tool can use to write overflow output to `{sessionDir}/{toolName}_{toolCallId}.log`. BashTool uses it first; other tools can adopt later.

**Tech Stack:** Node.js fs, path — no new dependencies.

---

### Task 1: Add sessionDir to ToolExecutionContext

**Files:**
- Modify: `packages/nuvin-core/src/tools/types.ts` — add `sessionDir?: string`
- Modify: `packages/nuvin-core/src/orchestrator.ts` — add `sessionDir` field, setter/getter, pass in context

### Task 2: Create ToolOutputSpill utility

**Files:**
- Create: `packages/nuvin-core/src/tools/tool-output-spill.ts`

API:
```typescript
export function spillToolOutput(opts: {
  content: string | Buffer;
  toolName: string;
  toolCallId: string;
  sessionDir?: string;
}): string | null
```
Returns the file path written, or null if no sessionDir.
Filename: `{toolName}_{toolCallId}.log`

### Task 3: Refactor BashTool to use ToolOutputSpill

**Files:**
- Modify: `packages/nuvin-core/src/tools/BashTool.ts` — replace inline spill logic with ToolOutputSpill

### Task 4: Pass sessionDir from CLI SessionManager

**Files:**
- Modify: `packages/nuvin-cli/source/services/orchestrator-modules/SessionManager.ts` — call `orchestrator.setSessionDir()`

### Task 5: Tests and commit

- Run existing tests
- Commit with changeset
