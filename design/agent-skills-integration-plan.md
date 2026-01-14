# Agent Skills Integration Plan

## Overview

This document outlines the integration plan for [Agent Skills](https://agentskills.io) into the Nuvin CLI application. Agent Skills are folders of instructions, scripts, and resources that agents can discover and use to perform tasks more accurately and efficiently.

## Agent Skills Specification Summary

### Core Concepts

- **Skill**: A folder containing a `SKILL.md` file with metadata and instructions
- **Progressive Disclosure**: Metadata loaded at startup (~100 tokens), full instructions on activation (<5000 tokens recommended)
- **Directory Structure**:
  ```
  skill-name/
  ├── SKILL.md          # Required: instructions + metadata
  ├── scripts/          # Optional: executable code
  ├── references/       # Optional: documentation
  └── assets/           # Optional: templates, resources
  ```

### SKILL.md Format

```yaml
---
name: skill-name           # Required: 1-64 chars, lowercase alphanumeric + hyphens
description: ...           # Required: 1-1024 chars, what/when to use
license: Apache-2.0        # Optional
compatibility: ...         # Optional: environment requirements
metadata:                  # Optional: arbitrary key-value pairs
  author: example-org
  version: "1.0"
allowed-tools: Bash Read   # Optional: pre-approved tools (experimental)
---

# Skill Instructions (Markdown body)
...
```

### Integration Approach

We use a **tool-based** integration where the agent calls a `skill` tool to load skill content on demand. This approach:
- Keeps initial context small (only skill metadata in tool description)
- Allows permission gating before loading skill content
- Provides structured output with metadata for tracking
- Compatible with Claude Code skills directory format

---

## Implementation Phases

### Phase 1: Skill Discovery Service

**Priority**: High
**Estimated Effort**: 2-3 days

Create a new service to discover and parse skills from configured directories.

#### Tasks

1. **Create `SkillsService` (`source/services/SkillsService.ts`)**
   - Scan configured directories for valid skills (folders with `SKILL.md`)
   - Parse YAML frontmatter to extract metadata
   - Validate skill structure against spec
   - Cache discovered skills metadata per session

2. **Discovery directories (in order)**
   - `.claude/skills/` (project-level Claude Code compatibility)
   - `~/.claude/skills/` (global Claude Code compatibility)
   - `.nuvin-cli/skills/` (project-level Nuvin skills)
   - `~/.nuvin-cli/skills/` (global user skills)
   - Support `NUVIN_SKILLS_PATH` environment variable

3. **Frontmatter parsing**
   ```typescript
   // Parse SKILL.md with YAML frontmatter
   const parseSkillFile = async (path: string): Promise<SkillInfo | null> => {
     const content = await fs.readFile(path, 'utf-8');
     const { data, content: body } = parseFrontmatter(content);

     const parsed = SkillInfoSchema.safeParse(data);
     if (!parsed.success) return null;

     return {
       name: parsed.data.name,
       description: parsed.data.description,
       location: path,
       content: body,
     };
   };
   ```

#### Deliverables

- `SkillsService` class with discovery and parsing logic
- Type definitions for skill metadata
- Unit tests for frontmatter parsing and validation

---

### Phase 2: Skill Tool Implementation

**Priority**: High
**Estimated Effort**: 2-3 days

Create a `skill` tool that agents can invoke to load skill content.

#### Tasks

1. **Create `skill` tool in nuvin-core (`src/tools/skill.ts`)**

   ```typescript
   export const SkillTool = {
     name: 'skill',
     description: '', // Dynamic - populated with available skills
     parameters: z.object({
       name: z.string().describe('The skill identifier from available_skills'),
     }),
     execute: async (params, ctx) => {
       const skill = await SkillsService.get(params.name);
       if (!skill) {
         const available = await SkillsService.all();
         throw new Error(`Skill "${params.name}" not found. Available: ${Object.keys(available).join(', ') || 'none'}`);
       }

       // Load and return skill content
       const content = await fs.readFile(skill.location, 'utf-8');
       const { content: body } = parseFrontmatter(content);
       const dir = path.dirname(skill.location);

       return {
         title: `Loaded skill: ${skill.name}`,
         output: [
           `## Skill: ${skill.name}`,
           '',
           `**Base directory**: ${dir}`,
           '',
           body.trim(),
         ].join('\n'),
         metadata: { name: skill.name, dir },
       };
     },
   };
   ```

2. **Dynamic tool description with available skills**

   The tool description is generated dynamically with discovered skills:
   ```typescript
   const buildSkillToolDescription = async (): Promise<string> => {
     const skills = await SkillsService.all();

     if (Object.keys(skills).length === 0) {
       return 'Load a skill to get detailed instructions. No skills available.';
     }

     return [
       'Load a skill to get detailed instructions for a specific task.',
       'Skills provide specialized knowledge and step-by-step guidance.',
       'Use this when a task matches an available skill description.',
       '<available_skills>',
       ...Object.values(skills).flatMap((skill) => [
         '  <skill>',
         `    <name>${skill.name}</name>`,
         `    <description>${skill.description}</description>`,
         '  </skill>',
       ]),
       '</available_skills>',
     ].join('\n');
   };
   ```

3. **Register skill tool in `OrchestratorManager`**
   - Add `skill` to `baseEnabledTools`
   - Initialize `SkillsService` during orchestrator setup
   - Pass skills to tool registry

4. **Tool approval integration**
   - Respect `requireToolApproval` setting
   - Allow per-skill permission configuration

#### Deliverables

- `skill` tool implementation
- Integration with tool registry
- Tool approval support

---

### Phase 3: Configuration & Permissions

**Priority**: High
**Estimated Effort**: 1-2 days

Add skill configuration to CLI config.

#### Tasks

1. **Add skill configuration to `CLIConfig` (`source/config/types.ts`)**
   ```typescript
   interface CLIConfig {
     // ... existing fields
     skills?: {
       /** Enable/disable skills feature (default: true) */
       enabled?: boolean;
       /** Additional directories to search for skills */
       directories?: string[];
       /** Skill names to exclude */
       exclude?: string[];
       /** Per-skill permission: 'allow' | 'ask' | 'deny' */
       permissions?: Record<string, 'allow' | 'ask' | 'deny'>;
     };
   }
   ```

2. **Permission levels**
   - `allow`: Load skill without user confirmation
   - `ask`: Prompt user before loading skill content
   - `deny`: Skill not available to agent

3. **Default permissions**
   - Global skills (`~/.nuvin-cli/skills/`): `allow`
   - Project skills (`.nuvin-cli/skills/`): `allow`
   - External skills: `ask`

#### Deliverables

- Config type updates
- Permission evaluation logic
- Config documentation

---

### Phase 4: CLI Commands for Skills Management

**Priority**: Medium
**Estimated Effort**: 2-3 days

Add CLI commands to manage skills.

#### Tasks

1. **`/skills` command** - List all discovered skills
   ```
   /skills              # List all skills with descriptions
   /skills --verbose    # Show full details including location
   ```

2. **`/skills add <path|url>` command** - Add a skill
   - Copy skill folder to user skills directory
   - Support cloning from git URL
   - Validate skill before adding

3. **`/skills remove <name>` command** - Remove a skill
   - Remove from user skills directory
   - Prompt for confirmation

4. **`/skills info <name>` command** - Show skill details
   - Display full metadata and description
   - Show skill location and files

5. **`/skills validate <path>` command** - Validate a skill
   - Check SKILL.md format
   - Validate frontmatter fields
   - Report issues

#### Deliverables

- Command definitions in `source/modules/commands/definitions/skills/`
- UI components for skill listing and info display
- Unit tests for commands

---

### Phase 5: Advanced Features

**Priority**: Low
**Estimated Effort**: 3-5 days

#### Tasks

1. **Session compaction protection**
   - Protect skill tool invocations from being pruned during context compaction

2. **Skill analytics**
   - Track skill usage frequency
   - Record in session metrics

3. **`allowed-tools` support** (experimental)
   - Parse `allowed-tools` from frontmatter
   - Auto-approve specified tools when skill is active

4. **Custom skill creation wizard**
   - `/skills create` interactive command
   - Template generation

---

## File Structure

```
packages/nuvin-cli/source/
├── services/
│   └── SkillsService.ts           # New: Skill discovery and management
├── config/
│   └── types.ts                   # Update: Add skills config
├── modules/commands/definitions/
│   └── skills/
│       ├── index.ts               # New: Skills command entry
│       ├── list.ts                # New: /skills command
│       ├── add.ts                 # New: /skills add command
│       ├── remove.ts              # New: /skills remove command
│       ├── info.ts                # New: /skills info command
│       └── validate.ts            # New: /skills validate command
└── types/
    └── skills.ts                  # New: Skill type definitions

packages/nuvin-core/src/
├── tools/
│   └── skill.ts                   # New: Skill tool implementation
└── index.ts                       # Update: Export skill tool
```

---

## Type Definitions

```typescript
// packages/nuvin-cli/source/types/skills.ts

import { z } from 'zod';

export const SkillInfoSchema = z.object({
  name: z.string().min(1).max(64).regex(/^[a-z0-9]+(-[a-z0-9]+)*$/),
  description: z.string().min(1).max(1024),
  license: z.string().optional(),
  compatibility: z.string().max(500).optional(),
  metadata: z.record(z.string()).optional(),
  allowedTools: z.string().optional(), // space-delimited
});

export interface SkillInfo {
  name: string;
  description: string;
  location: string;
}

export interface Skill extends SkillInfo {
  content: string;
  license?: string;
  compatibility?: string;
  metadata?: Record<string, string>;
  allowedTools?: string[];
  hasScripts: boolean;
  hasReferences: boolean;
  hasAssets: boolean;
}

export interface SkillsConfig {
  enabled?: boolean;
  directories?: string[];
  exclude?: string[];
  permissions?: Record<string, 'allow' | 'ask' | 'deny'>;
}

export interface SkillToolResult {
  title: string;
  output: string;
  metadata: {
    name: string;
    dir: string;
  };
}
```

---

## Configuration Example

```yaml
# ~/.nuvin-cli/config.yaml

skills:
  enabled: true
  directories:
    - ~/my-org-skills
  exclude:
    - deprecated-skill
  permissions:
    sensitive-skill: ask
    internal-tool: deny
```

---

## Integration Flow

```
┌─────────────────────────────────────────────────────────────┐
│                    Startup / Initialize                      │
│  1. SkillsService discovers skills from all directories      │
│  2. Parse frontmatter (name, description) for each skill     │
│  3. Build skill tool description with <available_skills>     │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                    User Sends Message                        │
│  Agent receives message and sees skill tool in available     │
│  tools with list of skills in description                    │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                Agent Decides to Use Skill                    │
│  Agent matches task to skill description                     │
│  Calls: skill({ name: "code-review" })                      │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                  Permission Check                            │
│  Check skills.permissions config for this skill              │
│  - allow: proceed                                            │
│  - ask: prompt user for approval                             │
│  - deny: return error                                        │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                  Load Skill Content                          │
│  1. Read SKILL.md from filesystem                            │
│  2. Parse frontmatter and body content                       │
│  3. Return formatted output with metadata                    │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│              Agent Uses Skill Instructions                   │
│  Agent incorporates skill guidance into response             │
│  Can reference skill scripts/assets via bash/file_read       │
└─────────────────────────────────────────────────────────────┘
```

---

## Security Considerations

1. **Permission Gating**: User must approve skill loading (configurable per-skill)
2. **Trusted Directories**: Only scan known skill directories
3. **Content Validation**: Validate frontmatter schema before loading
4. **Audit Logging**: Log all skill invocations in session history
5. **Script Execution**: Skills don't auto-execute scripts; agent uses bash_tool separately
6. **Compaction Protection**: Skill tool calls preserved in context history

---

## Claude Code Compatibility

The implementation maintains compatibility with Claude Code's skill format:
- Scans `.claude/skills/` directories
- Uses same `SKILL.md` frontmatter format
- Skills work across both Nuvin and Claude Code

---

## Testing Strategy

1. **Unit Tests**
   - YAML frontmatter parsing
   - Skill validation logic
   - Path resolution and discovery
   - Permission evaluation

2. **Integration Tests**
   - Skill discovery across multiple directories
   - Tool registration and execution
   - Permission prompting flow

3. **E2E Tests**
   - Full skill activation flow
   - Agent using skill in conversation

---

## Migration Notes

- Skills feature enabled by default
- No breaking changes to existing functionality
- Skills directories created on first skill add
- Existing Claude Code skills automatically discovered

---

## References

- [Agent Skills Specification](https://agentskills.io/specification)
- [Integration Guide](https://agentskills.io/integrate-skills)
- [Reference Implementation](https://github.com/agentskills/agentskills/tree/main/skills-ref)
- [Example Skills](https://github.com/anthropics/skills)
