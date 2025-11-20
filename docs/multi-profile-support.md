# Multi-Profile Support Design

## Overview

Add support for multiple isolated profiles in the Nuvin CLI, where each profile maintains completely separate configuration, state, agents, MCP servers, and session history. Users can switch between profiles using the `--profile <profile-name>` flag.

## Current Architecture

### Directory Structure (Current)
```
~/.nuvin-cli/
├── config.yaml                 # Global configuration
├── .nuvin_mcp.json            # MCP server configuration
├── agents/                     # Custom agent definitions
│   ├── code-reviewer.yaml
│   └── solution-architect.yaml
└── sessions/                   # Conversation history
    ├── session-1234.json
    └── session-5678.json

<project>/.nuvin-cli/
└── config.yaml                 # Local/project configuration
```

### Configuration System
- **ConfigManager** (`packages/nuvin-cli/source/config/manager.ts`)
  - Manages config loading with scope priority: `global < local < explicit < env < direct`
  - Global config: `~/.nuvin-cli/config.yaml`
  - Local config: `<cwd>/.nuvin-cli/config.yaml`
  - Supports JSON and YAML formats

### State Management
- **Agent Persistence** (`packages/nuvin-core/agent-file-persistence.ts`)
  - Stores custom agents in `~/.nuvin-cli/agents/`
  - YAML format for agent definitions

- **Session Persistence** (`packages/nuvin-cli/source/services/OrchestratorManager.ts`)
  - Stores conversation history in `~/.nuvin-cli/sessions/`
  - JSON format with incremental updates

- **MCP Configuration**
  - Default location: `~/.nuvin-cli/.nuvin_mcp.json`
  - Can be overridden via `--mcp-config` flag or config file

## Proposed Architecture

### Profile Directory Structure
```
~/.nuvin-cli/
├── config.yaml                 # Default profile config (current location)
├── .nuvin_mcp.json            # Default profile MCP config
├── agents/                     # Default profile agents
│   ├── code-reviewer.yaml
│   └── solution-architect.yaml
├── sessions/                   # Default profile sessions
│   └── session-*.json
├── profiles/
│   ├── work/                   # Work profile
│   │   ├── config.yaml
│   │   ├── .nuvin_mcp.json
│   │   ├── agents/
│   │   └── sessions/
│   └── personal/               # Personal profile
│       ├── config.yaml
│       ├── .nuvin_mcp.json
│       ├── agents/
│       └── sessions/
└── profiles.yaml               # Profile registry and metadata (only for non-default)

<project>/.nuvin-cli/
└── config.yaml                 # Local config (unchanged)
```

### Profile Metadata (`profiles.yaml`)
```yaml
# Active profile (if not default)
# When this field is missing or "default", use root ~/.nuvin-cli/ directories
active: work

# Profile definitions (excluding default which uses root)
profiles:
  work:
    name: Work Projects
    description: Enterprise development with company MCP servers
    created: 2024-01-16T09:00:00Z
    lastUsed: 2024-01-19T18:30:00Z

  personal:
    name: Personal Projects
    description: Side projects and experiments
    created: 2024-01-17T20:00:00Z
    lastUsed: 2024-01-18T22:15:00Z
```

**Note**: The `default` profile is implicit and always uses the root `~/.nuvin-cli/` directory structure. It doesn't need an entry in `profiles.yaml`.

## Implementation Plan

### Phase 1: Core Profile Infrastructure

#### 1.1 Profile Manager (`packages/nuvin-cli/source/config/profile-manager.ts`)
```typescript
export interface ProfileMetadata {
  name: string;
  description?: string;
  created: string;
  lastUsed: string;
}

export interface ProfileRegistry {
  active: string; // Current active profile (default if not set or "default")
  profiles: Record<string, ProfileMetadata>; // Only non-default profiles
}

export class ProfileManager {
  private baseDir: string; // ~/.nuvin-cli
  private profilesDir: string; // ~/.nuvin-cli/profiles
  private registryPath: string; // ~/.nuvin-cli/profiles.yaml
  private registry: ProfileRegistry;

  // Core operations
  async list(): Promise<ProfileMetadata[]> // Returns all profiles including implicit "default"
  async create(name: string, options?: CreateProfileOptions): Promise<void>
  async delete(name: string, options?: DeleteProfileOptions): Promise<void>
  async switch(name: string): Promise<void>
  async getActive(): Promise<string> // Returns "default" if not set or registry missing
  async exists(name: string): Promise<boolean>

  // Path resolution
  // Returns root paths for "default", profiles/<name>/ paths for others
  getProfileDir(name: string): string
  getProfileConfigPath(name: string): string
  getProfileMcpConfigPath(name: string): string
  getProfileAgentsDir(name: string): string
  getProfileSessionsDir(name: string): string

  // Check if profile is the default
  isDefault(name: string): boolean
}
```

#### 1.2 Update ConfigManager
- Add profile awareness to `ConfigManager`
- Update path resolution to use profile directories
- Maintain backward compatibility (default profile = current behavior at root)

```typescript
// ConfigManager changes
export class ConfigManager {
  private profileManager?: ProfileManager;

  async load(options: ConfigLoadOptions = {}): Promise<ConfigLoadResult> {
    // Determine active profile
    const profile = options.profile || await this.getActiveProfile();

    // Update paths based on profile
    // For "default", this will be ~/.nuvin-cli
    // For others, this will be ~/.nuvin-cli/profiles/<name>
    this.globalDir = this.profileManager?.getProfileDir(profile)
      || path.join(os.homedir(), '.nuvin-cli');

    // Rest of existing logic...
  }

  private async getActiveProfile(): Promise<string> {
    if (!this.profileManager) return 'default';
    return this.profileManager.getActive(); // Returns "default" if not set
  }
}
```

#### 1.3 CLI Flag Support
Update `packages/nuvin-cli/source/cli.tsx`:

```typescript
const cli = meow(`
  Usage
    $ nuvin-cli [options]
    $ nuvin-cli --profile <name> [options]
    $ nuvin-cli profile <command> [options]

  Profile Commands
    profile list                List all profiles
    profile create <name>       Create a new profile
    profile delete <name>       Delete a profile
    profile switch <name>       Switch active profile
    profile show                Show current profile info
    profile clone <src> <dst>   Clone an existing profile

  Options
    --profile NAME      Use specific profile (overrides active profile)
    // ... existing options
`, {
  flags: {
    profile: { type: 'string' },
    // ... existing flags
  }
});
```

### Phase 2: Service Integration

#### 2.1 Update OrchestratorManager
```typescript
// packages/nuvin-cli/source/services/OrchestratorManager.ts
export class OrchestratorManager {
  constructor(
    private profileManager: ProfileManager,
    private profile: string,
    // ... existing params
  ) {
    // For "default": ~/.nuvin-cli/sessions
    // For others: ~/.nuvin-cli/profiles/<name>/sessions
    this.sessionsDir = this.profileManager.getProfileSessionsDir(profile);
    this.agentsDir = this.profileManager.getProfileAgentsDir(profile);
  }
}
```

#### 2.2 Update MCPServerManager
```typescript
// packages/nuvin-cli/source/services/MCPServerManager.ts
export class MCPServerManager {
  constructor(
    private profileManager: ProfileManager,
    // ... existing params
  ) {}

  private getDefaultMcpConfigPath(profile: string): string {
    // For "default": ~/.nuvin-cli/.nuvin_mcp.json
    // For others: ~/.nuvin-cli/profiles/<name>/.nuvin_mcp.json
    return this.profileManager.getProfileMcpConfigPath(profile);
  }
}
```

#### 2.3 Update AgentFilePersistence
No direct changes needed - paths are injected via constructor, but ensure:
- Agent directory is profile-specific when instantiated
- Agent loading respects current profile

### Phase 3: Migration & Backward Compatibility

#### 3.1 Migration Strategy
**No migration needed!** The default profile continues to use the existing root `~/.nuvin-cli/` structure:

On first run after upgrade:
1. Check if `~/.nuvin-cli/profiles.yaml` exists
2. If not, create it with no active profile (implies "default")
3. All existing files remain in place:
   ```
   ~/.nuvin-cli/
   ├── config.yaml        (default profile config - no change)
   ├── .nuvin_mcp.json    (default profile MCP - no change)
   ├── agents/            (default profile agents - no change)
   └── sessions/          (default profile sessions - no change)
   ```
4. New profiles created with `profile create` will go under `profiles/` directory

**Key Benefit**: Zero migration, 100% backward compatible!

#### 3.2 Initialization (No Migration Needed)
```typescript
// packages/nuvin-cli/source/config/profile-manager.ts
export class ProfileManager {
  async initialize(): Promise<void> {
    // Ensure profiles directory exists
    await fs.promises.mkdir(this.profilesDir, { recursive: true });

    // Create profiles.yaml if it doesn't exist
    if (!fs.existsSync(this.registryPath)) {
      const initialRegistry: ProfileRegistry = {
        active: 'default',
        profiles: {}
      };
      await this.saveRegistry(initialRegistry);
    }
  }

  private async loadRegistry(): Promise<ProfileRegistry> {
    if (!fs.existsSync(this.registryPath)) {
      return { active: 'default', profiles: {} };
    }
    // Load and parse profiles.yaml
  }
}
```

### Phase 4: Profile Commands

#### 4.1 Profile Command Handler
```typescript
// packages/nuvin-cli/source/config/profile-handler.ts
export class ProfileCliHandler {
  async handleProfileCommand(args: string[]): Promise<void> {
    const [command, ...rest] = args;

    switch (command) {
      case 'list':
        await this.listProfiles();
        break;
      case 'create':
        await this.createProfile(rest[0], rest.slice(1));
        break;
      case 'delete':
        await this.deleteProfile(rest[0]);
        break;
      case 'switch':
        await this.switchProfile(rest[0]);
        break;
      case 'show':
        await this.showProfile();
        break;
      case 'clone':
        await this.cloneProfile(rest[0], rest[1]);
        break;
      default:
        this.showHelp();
    }
  }

  private async listProfiles(): Promise<void> {
    // Shows all profiles including "default"
    // Indicates which is active
  }

  private async createProfile(name: string, options: string[]): Promise<void> {
    // Error if name is "default" (reserved)
  }

  private async deleteProfile(name: string): Promise<void> {
    // Error if name is "default" (cannot delete)
  }

  private async switchProfile(name: string): Promise<void> {
    // Updates active in profiles.yaml
    // "default" is valid target
  }

  private async showProfile(): Promise<void> {
    // Shows current active profile
    // Shows path (root for default, profiles/<name> for others)
  }

  private async cloneProfile(source: string, target: string): Promise<void> {
    // Can clone from "default" to named profile
    // Cannot clone TO "default" (reserved)
  }
}
```

### Phase 5: Enhanced Features

#### 5.1 Profile Templates
```yaml
# ~/.nuvin-cli/profile-templates/enterprise.yaml
name: Enterprise Development
description: Template for enterprise work
config:
  requireToolApproval: true
  thinking: HIGH
  activeProvider: anthropic
agents:
  - code-reviewer
  - security-scanner
mcpServers:
  company-tools:
    command: npx
    args: ["-y", "company-mcp-server"]
```

#### 5.2 Profile-Specific Environment Variables
```bash
# Profile can override specific env vars
NUVIN_PROFILE=work nuvin-cli

# Or via flag
nuvin-cli --profile work
```

#### 5.3 Profile Context Display
Update Footer component to show active profile when not default:

**Current Footer (default profile)**:
```
anthropic | claude-sonnet-4-5 | SUDO
```

**Updated Footer (non-default profile)**:
```
work | anthropic | claude-sonnet-4-5 | SUDO
```

Implementation in `packages/nuvin-cli/source/components/Footer.tsx`:
```typescript
// Add profile to the status line
const profile = get<string>('activeProfile'); // Get from config or context

<Text color={theme.footer.status} dimColor>
  {[
    profile && profile !== 'default' ? profile : null, // Only show if not default
    provider,
    model,
    thinking && thinking !== THINKING_LEVELS.OFF ? `Thinking: ${thinking}` : '',
    !toolApprovalMode ? 'SUDO' : '',
  ]
    .filter(Boolean)
    .join(' | ')}
</Text>
```

## Configuration Scope Priority (Updated)

With profiles, the priority becomes:
1. **Direct** (CLI flags): `--model`, `--provider`, etc.
2. **Env** (Environment variables): `OPENROUTER_API_KEY`, etc.
3. **Explicit** (--config file): User-specified config file
4. **Local** (Project .nuvin-cli): `<cwd>/.nuvin-cli/config.yaml`
5. **Global** (Active profile):
   - Default profile: `~/.nuvin-cli/config.yaml`
   - Other profiles: `~/.nuvin-cli/profiles/<active>/config.yaml`

Note: There is no separate "shared global" config - the default profile IS the global config.

## Benefits

### Isolation
- Complete separation of credentials, agents, and state
- Work vs personal projects use different API keys
- Different MCP servers per profile

### Organization
- Categorize projects by client/team/purpose
- Each profile has own conversation history
- Custom agent sets per use case

### Flexibility
- Quick switching between contexts
- Clone profiles for similar setups
- Templates for common configurations

### Security
- Isolate sensitive credentials
- Different approval requirements per profile
- Audit trail per profile

## Testing Strategy

### Unit Tests
- ProfileManager CRUD operations
- Path resolution (default vs non-default profiles)
- Profile registry loading/saving
- Profile command parsing
- Default profile protection (cannot delete/rename)

### Integration Tests
- End-to-end profile creation and switching
- Config loading with different profiles
- Session persistence per profile
- MCP server isolation between profiles
- Default profile backward compatibility

### Initialization Tests
- Fresh install (creates empty profiles.yaml)
- Existing install (respects current data)
- Concurrent profile operations

## Rollout Plan

### Version 1.x (Current)
- Current single-profile behavior (default profile)

### Version 2.0 (Profile Support)
1. Release with NO breaking changes
2. Default profile continues to use root `~/.nuvin-cli/`
3. Add profile management commands
4. Announce profile feature

### Post-Release
- Collect user feedback
- Add profile templates (Phase 5.1)
- Add profile export/import
- Add profile switching shortcuts
- Profile-specific environment variable support

## Design Decisions

1. **Default Profile Location**: Default profile remains at `~/.nuvin-cli/` root for backward compatibility
   - ✅ Zero migration required
   - ✅ Existing users see no changes
   - ✅ New profiles go under `profiles/` directory

2. **Profile Name Restrictions**: Alphanumeric, hyphens, underscores only
   - Reserved name: `default` (cannot create a profile called "default")
   - Sanitize to filesystem-safe names

3. **Default Profile Behavior**:
   - Cannot be deleted
   - Cannot be renamed
   - Always available as fallback
   - Active when no profile specified

4. **Local Config with Profiles**: Project `.nuvin-cli/config.yaml` overrides profile config
   - Priority: local > profile global

5. **Profile Export/Import**: Phase 2 feature
   - Export profile as portable YAML/ZIP
   - Import to create new profile from backup

## File Changes Summary

### New Files
- `packages/nuvin-cli/source/config/profile-manager.ts` - Profile management and path resolution
- `packages/nuvin-cli/source/config/profile-handler.ts` - CLI commands for profiles
- `packages/nuvin-cli/source/config/profile-types.ts` - Profile type definitions

### Modified Files
- `packages/nuvin-cli/source/config/manager.ts` - Add profile awareness for path resolution
- `packages/nuvin-cli/source/cli.tsx` - Add --profile flag and profile commands
- `packages/nuvin-cli/source/services/OrchestratorManager.ts` - Use ProfileManager for session/agent paths
- `packages/nuvin-cli/source/services/MCPServerManager.ts` - Use ProfileManager for MCP config path
- `packages/nuvin-cli/source/components/Footer.tsx` - Display active profile when not default
- `packages/nuvin-cli/source/config/types.ts` - Add profile-related types
- `packages/nuvin-cli/source/app.tsx` - Pass active profile to Footer component

### Directory Structure Changes
```
~/.nuvin-cli/
├── config.yaml            # UNCHANGED: Default profile config
├── .nuvin_mcp.json       # UNCHANGED: Default profile MCP config
├── agents/               # UNCHANGED: Default profile agents
├── sessions/             # UNCHANGED: Default profile sessions
├── profiles/             # NEW: Non-default profiles directory
│   ├── work/
│   │   ├── config.yaml
│   │   ├── .nuvin_mcp.json
│   │   ├── agents/
│   │   └── sessions/
│   └── personal/
│       └── ...
└── profiles.yaml         # NEW: Profile registry (non-default profiles only)
```

## Example Usage

```bash
# List all profiles
nuvin-cli profile list

# Create a new profile
nuvin-cli profile create work --description "Work projects"

# Switch to work profile
nuvin-cli profile switch work

# Use specific profile for one session
nuvin-cli --profile personal

# Show current profile
nuvin-cli profile show

# Clone an existing profile
nuvin-cli profile clone work client-acme

# Delete a profile
nuvin-cli profile delete old-project
```

## Success Metrics

1. **Zero breaking changes** for existing users (no migration required)
2. **Profile operations** complete in <100ms
3. **Clear separation** of state between profiles
4. **User adoption**: Track profile creation after feature release
5. **Backward compatibility**: Existing setups work without any changes
6. **Default profile isolation**: Default profile never interferes with named profiles
