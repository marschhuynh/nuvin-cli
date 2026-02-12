# Skill Awareness via System Prompt Injection

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make the agent aware of available skills by injecting skill metadata into the system prompt via `buildInjectedSystem`, following the [agentskills.io integration spec](https://agentskills.io/integrate-skills).

**Architecture:** Extend `buildInjectedSystem()` to accept an optional `availableSkills` parameter containing skill metadata (name + description). When skills are present, append an `<available_skills>` XML block to the injected system context. The OrchestratorManager passes discovered skills from `skillsService` into `buildInjectedSystem`. This ensures the agent sees available skills in its system prompt **without** needing to inspect the `skill` tool's description first.

**Tech Stack:** TypeScript, vitest

---

## Current State

Skills are currently only surfaced through the `skill` tool's dynamic description — the tool lists `<available_skills>` in its own definition. The agent must read the tool description to know what skills exist. This is indirect and the agent may not notice skills are available unless it specifically looks at the tool.

The integration spec at agentskills.io recommends injecting skill metadata directly into the system prompt so the model knows what skills are available at all times.

## Approach

1. Add `availableSkills` to `InjectedSystemParams` in `prompt-utils.ts`
2. Render `<available_skills>` XML block in `buildInjectedSystem()` when skills are present
3. Pass discovered skills from `skillsService.list()` into `buildInjectedSystem()` in OrchestratorManager
4. Also pass skills to the sub-agent factory's `systemContextProvider` so sub-agents see them too

---

### Task 1: Add skill metadata to `buildInjectedSystem`

**Files:**
- Modify: `packages/nuvin-core/src/prompt-utils.ts:13-75`
- Test: `packages/nuvin-core/tests/prompt-utils.test.ts` (create if needed)

**Step 1: Write the failing test**

Check if a test file exists first. If not, create one:

```typescript
// packages/nuvin-core/tests/prompt-utils-skills.test.ts
import { describe, it, expect } from 'vitest';
import { buildInjectedSystem } from '../src/prompt-utils.js';

const baseParams = {
  today: '2026-02-12',
  platform: 'darwin',
  arch: 'arm64',
  tempDir: '/tmp',
  workspaceDir: '/workspace',
};

describe('buildInjectedSystem - skills', () => {
  it('does not include skills section when no skills provided', () => {
    const result = buildInjectedSystem(baseParams);
    expect(result).not.toContain('available_skills');
  });

  it('does not include skills section when empty array', () => {
    const result = buildInjectedSystem({ ...baseParams, availableSkills: [] });
    expect(result).not.toContain('available_skills');
  });

  it('includes available_skills XML block when skills are provided', () => {
    const result = buildInjectedSystem({
      ...baseParams,
      availableSkills: [
        { name: 'test-driven-development', description: 'Use when implementing features' },
        { name: 'brainstorming', description: 'Use before creative work' },
      ],
    });

    expect(result).toContain('<available_skills>');
    expect(result).toContain('</available_skills>');
    expect(result).toContain('<name>test-driven-development</name>');
    expect(result).toContain('<description>Use when implementing features</description>');
    expect(result).toContain('<name>brainstorming</name>');
    expect(result).toContain('<description>Use before creative work</description>');
  });

  it('renders skills section after folder structure', () => {
    const result = buildInjectedSystem({
      ...baseParams,
      folderTree: 'src/\n  index.ts',
      availableSkills: [
        { name: 'my-skill', description: 'A skill' },
      ],
    });

    const folderIdx = result.indexOf('Folder structure:');
    const skillIdx = result.indexOf('<available_skills>');
    expect(folderIdx).toBeGreaterThan(-1);
    expect(skillIdx).toBeGreaterThan(folderIdx);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd packages/nuvin-core && pnpm vitest run tests/prompt-utils-skills.test.ts`
Expected: FAIL — `availableSkills` property doesn't exist on type

**Step 3: Implement the changes**

In `packages/nuvin-core/src/prompt-utils.ts`:

1. Add to `InjectedSystemParams`:
```typescript
availableSkills?: Array<{ name: string; description: string }>;
```

2. Add to the end of `buildInjectedSystem()`, before `return parts.join('\n')`:
```typescript
if (p.availableSkills && p.availableSkills.length > 0) {
  parts.push('');
  parts.push('Available skills (use skill tool to load):');
  parts.push('<available_skills>');
  for (const skill of p.availableSkills) {
    parts.push('  <skill>');
    parts.push(`    <name>${skill.name}</name>`);
    parts.push(`    <description>${skill.description}</description>`);
    parts.push('  </skill>');
  }
  parts.push('</available_skills>');
}
```

**Step 4: Run tests to verify they pass**

Run: `cd packages/nuvin-core && pnpm vitest run tests/prompt-utils-skills.test.ts`
Expected: PASS

**Step 5: Run all existing prompt-utils tests**

Run: `cd packages/nuvin-core && pnpm vitest run --reporter verbose 2>&1 | head -60`
Expected: No regressions

**Step 6: Commit**

```bash
git add packages/nuvin-core/src/prompt-utils.ts packages/nuvin-core/tests/prompt-utils-skills.test.ts
git commit -m "feat(core): add availableSkills to buildInjectedSystem"
```

---

### Task 2: Pass skills into `buildInjectedSystem` in OrchestratorManager

**Files:**
- Modify: `packages/nuvin-cli/source/services/OrchestratorManager.ts:455-470`
- Modify: `packages/nuvin-cli/source/services/OrchestratorManager.ts:1549-1564` (swapToAgent)
- Modify: `packages/nuvin-cli/source/services/OrchestratorManager.ts:1669-1684` (swapToMainAgent)

**Step 1: Update main agent initialization (line ~455)**

After `skillsService.discover()` completes (line 389-390), the `buildInjectedSystem` call at line 455 needs to receive skill data.

Add `availableSkills` to the params object at line 455:

```typescript
const availableSkills = enableSkills
  ? skillsService.list().map(s => ({ name: s.name, description: s.description }))
  : [];

const injectedSystem = buildInjectedSystem(
  {
    today: new Date().toLocaleString(),
    platform: process.platform,
    arch: process.arch,
    tempDir: os.tmpdir?.() ?? '',
    workspaceDir: process.cwd(),
    availableAgents,
    folderTree,
    shell: gitContextInfo.shell,
    gitBranch: gitContextInfo.gitBranch,
    gitRepo: gitContextInfo.gitRepo,
    recentCommits: gitContextInfo.recentCommits,
    availableSkills,
  },
  { withSubAgent: true },
);
```

**Step 2: Update `swapToAgent` (line ~1549)**

Same pattern — get skills from `skillsService.list()` and pass to `buildInjectedSystem`.

**Step 3: Update `swapToMainAgent` (line ~1669)**

Same pattern.

**Step 4: Update sub-agent factory systemContextProvider (line ~356)**

Add skills to the `SystemContext` type in `agent-factory.ts` and pass them through:

In `packages/nuvin-core/src/delegation/agent-factory.ts`, add `availableSkills` to the `SystemContext` type and pass it through to `buildInjectedSystem`.

In the `OrchestratorManager.ts` `systemContextProvider` (line 356), add:
```typescript
systemContextProvider: () => ({
  // ...existing fields...
  availableSkills: enableSkills
    ? skillsService.list().map(s => ({ name: s.name, description: s.description }))
    : [],
}),
```

**Step 5: Verify LSP diagnostics**

Run: `cd packages/nuvin-cli && pnpm tsc --noEmit 2>&1 | head -20`
Expected: No errors

**Step 6: Commit**

```bash
git add packages/nuvin-cli/source/services/OrchestratorManager.ts packages/nuvin-core/src/delegation/agent-factory.ts
git commit -m "feat(cli): inject available skills into system prompt"
```

---

### Task 3: Update agent-factory to pass skills through

**Files:**
- Modify: `packages/nuvin-core/src/delegation/agent-factory.ts:7-15` (SystemContext type)
- Modify: `packages/nuvin-core/src/delegation/agent-factory.ts:63-78` (buildInjectedSystem call)

**Step 1: Add `availableSkills` to SystemContext type**

```typescript
type SystemContext = {
  timeISO: string;
  platform: NodeJS.Platform;
  arch: string;
  tempDir: string;
  workspaceDir: string;
  shell?: string;
  gitBranch?: string;
  gitRepo?: string;
  recentCommits?: string;
  folderTree?: string;
  availableSkills?: Array<{ name: string; description: string }>;
};
```

**Step 2: Pass availableSkills to buildInjectedSystem**

In the `create` method, add `availableSkills` to the params:

```typescript
const injectedSystem = buildInjectedSystem(
  {
    // ...existing fields...
    availableSkills: systemContext.availableSkills,
  },
  { withSubAgent: false },
);
```

**Step 3: Verify types compile**

Run: `cd packages/nuvin-core && pnpm tsc --noEmit`
Expected: No errors

**Step 4: Commit**

```bash
git add packages/nuvin-core/src/delegation/agent-factory.ts
git commit -m "feat(core): pass skills through sub-agent factory"
```

---

### Task 4: Integration test

**Files:**
- Modify: `packages/nuvin-cli/tests/skills-integration.test.ts`

**Step 1: Add test case verifying skills appear in system prompt context**

Add a test that verifies when skills are discovered, the system prompt (via `buildInjectedSystem`) contains the skill metadata. This can be a unit-level test using `buildInjectedSystem` directly with skill data.

```typescript
it('injects discovered skills into buildInjectedSystem output', () => {
  const result = buildInjectedSystem({
    today: '2026-02-12',
    platform: 'darwin',
    arch: 'arm64',
    tempDir: '/tmp',
    workspaceDir: '/workspace',
    availableSkills: [
      { name: 'test-skill', description: 'A test skill for testing' },
    ],
  });

  expect(result).toContain('<available_skills>');
  expect(result).toContain('<name>test-skill</name>');
  expect(result).toContain('<description>A test skill for testing</description>');
});
```

**Step 2: Run all skill tests**

Run: `cd packages/nuvin-cli && pnpm vitest run tests/skills-integration.test.ts`
Expected: PASS

**Step 3: Run full test suite**

Run: `cd packages/nuvin-core && pnpm vitest run`
Run: `cd packages/nuvin-cli && pnpm vitest run`
Expected: All pass

**Step 4: Commit**

```bash
git add packages/nuvin-cli/tests/skills-integration.test.ts
git commit -m "test: verify skill injection into system prompt"
```

---

## Summary of Changes

| File | Change |
|------|--------|
| `packages/nuvin-core/src/prompt-utils.ts` | Add `availableSkills` to params type + render `<available_skills>` XML |
| `packages/nuvin-core/tests/prompt-utils-skills.test.ts` | New test file for skills injection |
| `packages/nuvin-core/src/delegation/agent-factory.ts` | Add `availableSkills` to SystemContext, pass through |
| `packages/nuvin-cli/source/services/OrchestratorManager.ts` | Pass `skillsService.list()` to all 3 `buildInjectedSystem` calls + sub-agent factory |
| `packages/nuvin-cli/tests/skills-integration.test.ts` | Integration test for skill injection |

## Notes

- The `skill` tool description will continue to list available skills too — this is intentional redundancy. The system prompt gives the agent awareness upfront, while the tool description provides details when the agent inspects its tools.
- Skills are rendered without `<location>` since we use tool-based access (not filesystem-based), per the agentskills.io spec.
- The XML format follows the recommended Claude format from the spec.
