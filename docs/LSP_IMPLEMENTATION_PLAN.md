# LSP Implementation Plan for Nuvin CLI

This document provides a comprehensive plan for implementing LSP (Language Server Protocol) support in nuvin-cli, based on the OpenCode LSP implementation and adapted to the nuvin-cli architecture.

---

## Table of Contents

1. [Executive Summary](#executive-summary)
2. [Current Architecture Review](#current-architecture-review)
3. [LSP Integration Points](#lsp-integration-points)
4. [Implementation Phases](#implementation-phases)
5. [File Structure](#file-structure)
6. [Core Components](#core-components)
7. [Configuration Schema](#configuration-schema)
8. [Event System Integration](#event-system-integration)
9. [UI Integration](#ui-integration)
10. [Tool Integration](#tool-integration)
11. [Dependencies](#dependencies)
12. [Migration from OpenCode](#migration-from-opencode)

---

## Executive Summary

### Goals
1. **Diagnostics Feedback** - Provide real-time error/warning feedback to the LLM via explicit `lsp` tool calls
2. **Code Intelligence** - Enable go-to-definition, find-references, hover info for the LLM via dedicated tool
3. **Automatic LSP Management** - Auto-detect and spawn appropriate LSP servers per file type
4. **Configuration** - Allow users to configure/disable LSP servers via config

### Key Benefits
- LLM can explicitly request code intelligence features on demand
- Clean separation between file operations and LSP queries
- More control over when diagnostics are fetched
- Enables advanced code navigation for better code understanding

---

## Current Architecture Review

### Nuvin CLI Structure

```
nuvin-cli/
├── source/
│   ├── adapters/           # UI event adapters
│   ├── components/         # React/Ink UI components
│   ├── config/             # Configuration management
│   │   ├── manager.ts      # ConfigManager singleton
│   │   ├── types.ts        # CLIConfig type definitions
│   │   └── utils.ts        # Configuration utilities
│   ├── contexts/           # React contexts
│   ├── hooks/              # React hooks
│   ├── modules/            # Feature modules (commands)
│   ├── services/           # Core services
│   │   ├── OrchestratorManager.ts  # Main orchestrator
│   │   ├── MCPServerManager.ts     # MCP server management
│   │   ├── EventBus.ts             # Typed event bus
│   │   └── LLMFactory.ts           # LLM creation
│   ├── utils/              # Utilities
│   ├── app.tsx             # Main application component
│   └── cli.tsx             # CLI entry point
```

### Key Integration Points

| Component | Role | LSP Relevance |
|-----------|------|---------------|
| `OrchestratorManager` | Orchestrates LLM + tools | Needs LSP integration for diagnostics |
| `ToolRegistry` (nuvin-core) | Registers available tools | Add LSP tool |
| `EventBus` | Typed event emitter | Add LSP events |
| `ConfigManager` | Manages config | Add LSP configuration |
| `UIEventAdapter` | Processes agent events | Handle LSP diagnostic display |
| `Footer` | Status display | Show LSP connection status |

### Current Tool Flow

```
User Message → OrchestratorManager.send()
     ↓
AgentOrchestrator → Tool Execution
     ↓
ToolRegistry.execute() → file_edit, file_new, etc.
     ↓
UIEventAdapter → Display Results
```

**LSP needs to inject after file operations:**
```
file_edit/file_new completes
     ↓
LSP.touchFile() → Notify LSP of change
     ↓
Wait for diagnostics
     ↓
Append diagnostics to LLM context
```

---

## LSP Integration Points

### 1. Service Layer (`source/services/`)

Create `LSPManager.ts` - manages LSP client lifecycle:
- Initialize/shutdown LSP clients
- Route file operations to appropriate clients
- Collect and expose diagnostics

### 2. Configuration (`source/config/`)

Extend `CLIConfig` type to include LSP settings:
- Enable/disable LSP globally
- Per-server configuration
- Custom server definitions

### 3. Event System (`source/services/EventBus.ts`)

Add LSP-related events:
- `lsp:updated` - LSP client connected/disconnected
- `lsp:diagnostics` - New diagnostics received
- `lsp:status` - Status changes

### 4. Tool Integration (Option B: Dedicated LSP Tool)

We will implement a **dedicated LSP Tool** that exposes LSP operations to the LLM. This approach:

- Provides clean separation of concerns
- Allows LLM to explicitly request code intelligence features
- Is more discoverable and debuggable
- Can be gated behind experimental flags independently

### 5. UI Integration

- Footer: Show LSP connection status
- ChatDisplay: Show diagnostic summaries after file edits

---

## Implementation Phases

### Phase 1: Core Infrastructure (Priority: High)

**Goal:** Basic LSP client/server communication

1. **Create LSP service module** (`source/services/lsp/`)
   - `index.ts` - Main LSP namespace with public API
   - `client.ts` - LSP client implementation
   - `server.ts` - Server definitions registry
   - `language.ts` - Extension to language ID map
   - `types.ts` - TypeScript types/interfaces

2. **Add dependencies**
   ```json
   {
     "vscode-jsonrpc": "^8.2.0",
     "vscode-languageserver-types": "^3.17.5"
   }
   ```

3. **Implement basic client lifecycle**
   - Spawn server process (portable Node.js, not Bun-specific)
   - Initialize JSON-RPC connection
   - Handle initialize/initialized handshake
   - Shutdown cleanly

### Phase 2: LSP Tool Creation (Priority: High)

**Goal:** Create dedicated LSP Tool with comprehensive operations

1. **Create LspTool in nuvin-core**
   - Define all LSP operations with parameters
   - Implement parameter validation
   - Handle errors gracefully

2. **Add to OrchestratorManager**
   - Conditionally register based on config/experimental flag
   - Inject LSP service dependency

### Phase 3: Built-in Servers (Priority: High)

**Goal:** Support major languages out-of-box

Priority order based on typical usage:
1. TypeScript/JavaScript (typescript-language-server)
2. Python (pyright)
3. Go (gopls)
4. Rust (rust-analyzer)
5. JSON/JSONC (vscode-json-languageserver)
6. YAML (yaml-language-server)
7. Vue (volar)
8. HTML/CSS/JSON/YAML (basic servers)

### Phase 4: Configuration (Priority: Medium)

**Goal:** User-configurable LSP settings

1. **Extend CLIConfig type**
   ```typescript
   interface CLIConfig {
     // ... existing fields
     lsp?: false | Record<string, LSPServerConfig>;
   }
   
   interface LSPServerConfig {
     disabled?: boolean;
     command?: string[];
     extensions?: string[];
     env?: Record<string, string>;
     initialization?: Record<string, any>;
   }
   ```

2. **Config validation**
   - Validate custom server commands
   - Require extensions for custom servers

3. **Environment variables**
   - `NUVIN_DISABLE_LSP_DOWNLOAD` - Disable auto-install
   - `NUVIN_LSP_DEBUG` - Enable LSP debug logging
   - `NUVIN_EXPERIMENTAL_LSP_TOOL` - Enable LSP tool for LLM

### Phase 5: Event System & CLI Commands (Priority: Medium)

**Goal:** Visual feedback and CLI access

1. **Add LSP events to EventBus**
2. **Footer status indicator**
3. **CLI commands:**
   - `nuvin lsp status` - Show connected LSP servers
   - `nuvin lsp diagnostics <file>` - Show diagnostics for file
   - `nuvin lsp symbols <file>` - Show document symbols
   - `nuvin lsp <operation> <file> <line> <char>` - Direct LSP operations

### Phase 6: Advanced Features (Priority: Low)

**Goal:** Additional capabilities

1. **Multi-root workspace support**
2. **Call hierarchy operations**
3. **Semantic tokens/colorization**
4. **Inlay hints**
5. **Code actions/quick fixes

---

## File Structure

```
source/services/lsp/
├── index.ts              # LSP namespace with public API
├── client.ts             # LSP client implementation
├── server.ts             # Built-in server definitions
├── language.ts           # Extension → language ID map
├── types.ts              # TypeScript types/interfaces
└── servers/              # Individual server configs (optional)
    ├── typescript.ts
    ├── python.ts
    └── ...

nuvin-core/src/tools/
├── LspTool.ts            # Dedicated LSP tool for LLM
├── LspToolTypes.ts       # LSP-specific types
└── tool-params.ts        # Parameter definitions
```

---

## Core Components

### LSP Namespace (`index.ts`)

```typescript
export namespace LSP {
  // Events
  export const Event = {
    Updated: 'lsp:updated',
    Diagnostics: 'lsp:diagnostics',
  }

  // State
  interface State {
    clients: LSPClient[]
    servers: Record<string, LSPServerInfo>
    broken: Set<string>
    spawning: Map<string, Promise<LSPClient | undefined>>
  }

  // Public API - Core
  export async function init(): Promise<void>
  export async function status(): Promise<LSPStatus[]>
  export async function hasClients(file: string): Promise<boolean>
  export async function touchFile(path: string, waitDiagnostics?: boolean): Promise<void>
  export async function diagnostics(): Promise<Record<string, Diagnostic[]>>
  export async function shutdown(): Promise<void>

  // Code Intelligence Operations (for LspTool)
  export async function definition(pos: Position): Promise<Location[]>
  export async function references(pos: Position): Promise<Location[]>
  export async function hover(pos: Position): Promise<Hover | null>
  export async function documentSymbol(uri: string): Promise<(DocumentSymbol | SymbolInformation)[]>
  export async function workspaceSymbol(query: string): Promise<SymbolInformation[]>
  export async function implementation(pos: Position): Promise<Location[]>
  export async function prepareCallHierarchy(pos: Position): Promise<CallHierarchyItem[]>
  export async function incomingCalls(pos: Position): Promise<CallHierarchyIncomingCall[]>
  export async function outgoingCalls(pos: Position): Promise<CallHierarchyOutgoingCall[]>
}
```

### LSP Client (`client.ts`)

```typescript
export namespace LSPClient {
  export interface Info {
    serverID: string
    root: string
    connection: MessageConnection
    diagnostics: Map<string, Diagnostic[]>
    notify: {
      open(input: { path: string }): Promise<void>
    }
    waitForDiagnostics(input: { path: string }): Promise<void>
    shutdown(): Promise<void>
  }

  export async function create(input: {
    serverID: string
    server: LSPServerHandle
    root: string
  }): Promise<Info>
}
```

### LSP Server Info (`server.ts`)

```typescript
export interface LSPServerInfo {
  id: string
  extensions: string[]
  root: (file: string) => Promise<string | undefined>
  spawn: (root: string) => Promise<LSPServerHandle | undefined>
}

export interface LSPServerHandle {
  process: ChildProcess
  initialization?: Record<string, any>
}

// Built-in servers
export const TypeScript: LSPServerInfo = { ... }
export const Python: LSPServerInfo = { ... }
export const Go: LSPServerInfo = { ... }
// etc.
```

---

## Configuration Schema

### Config Type Extension

```typescript
// In source/config/types.ts

export interface LSPServerConfig {
  /** Disable this LSP server */
  disabled?: boolean;
  /** Command to start the LSP server */
  command?: string[];
  /** File extensions this server handles */
  extensions?: string[];
  /** Environment variables */
  env?: Record<string, string>;
  /** Initialization options */
  initialization?: Record<string, any>;
}

export interface CLIConfig {
  // ... existing fields
  
  /** LSP configuration. Set to false to disable all LSP. */
  lsp?: false | Record<string, LSPServerConfig>;
}
```

### Example Configurations

**Disable all LSP:**
```yaml
lsp: false
```

**Disable specific server:**
```yaml
lsp:
  typescript:
    disabled: true
```

**Custom server:**
```yaml
lsp:
  my-lsp:
    command: ["my-lsp-server", "--stdio"]
    extensions: [".myext"]
    env:
      MY_VAR: "value"
```

---

## Event System Integration

### New Event Types

```typescript
// In source/services/EventBus.ts

type EventMap = {
  // ... existing events
  
  // LSP events
  'lsp:updated': { status: 'connected' | 'disconnected'; serverId: string };
  'lsp:diagnostics': { path: string; serverId: string; diagnostics: Diagnostic[] };
  'lsp:error': { serverId: string; error: string };
};
```

### Usage

```typescript
// Publishing
eventBus.emit('lsp:diagnostics', {
  path: '/path/to/file.ts',
  serverId: 'typescript',
  diagnostics: [...]
});

// Subscribing
eventBus.on('lsp:diagnostics', ({ path, diagnostics }) => {
  // Update UI or context
});
```

---

## UI Integration

### Footer Status

Add LSP status indicator to Footer component:

```tsx
// In source/components/Footer.tsx

const [lspStatus, setLspStatus] = useState<{ connected: number; total: number }>({ connected: 0, total: 0 });

useEffect(() => {
  const updateStatus = async () => {
    const status = await LSP.status();
    setLspStatus({
      connected: status.filter(s => s.status === 'connected').length,
      total: status.length
    });
  };
  
  eventBus.on('lsp:updated', updateStatus);
  return () => eventBus.off('lsp:updated', updateStatus);
}, []);

// In render:
{lspStatus.total > 0 && (
  <Text color={lspStatus.connected > 0 ? 'green' : 'gray'}>
    LSP: {lspStatus.connected}/{lspStatus.total}
  </Text>
)}
```

### Diagnostics in Tool Results

Extend tool result formatting to include diagnostics:

```typescript
// After file_edit execution
const diagnostics = await LSP.diagnostics();
const fileDiags = diagnostics[editedFilePath] || [];

if (fileDiags.length > 0) {
  const formatted = fileDiags
    .map(d => `${severityName(d.severity)} [${d.range.start.line + 1}:${d.range.start.character + 1}] ${d.message}`)
    .join('\n');
  
  // Append to tool result
  result.output += `\n\nDiagnostics:\n${formatted}`;
}
```

---

## Tool Integration (Option B: Dedicated LSP Tool)

We implement a **dedicated LSP Tool** that exposes LSP operations to the LLM. This approach provides clean separation of concerns and allows the LLM to explicitly request code intelligence features.

### LspTool Definition

```typescript
// In nuvin-core/src/tools/LspTool.ts

import { z } from 'zod'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { pathToFileURL } from 'node:url'
import type { ToolDefinition } from './types'

export const LspTool: ToolDefinition = {
  name: 'lsp',
  description: `Interact with Language Server Protocol (LSP) servers to get code intelligence features.
  
Supported operations:
- goToDefinition: Find where a symbol is defined
- findReferences: Find all references to a symbol  
- hover: Get hover information (documentation, type info) for a symbol
- documentSymbol: Get all symbols (functions, classes, variables) in a document
- workspaceSymbol: Search for symbols across the entire workspace
- goToImplementation: Find implementations of an interface or abstract method
- prepareCallHierarchy: Get call hierarchy item at a position
- incomingCalls: Find all functions/methods that call the function at a position
- outgoingCalls: Find all functions/methods called by the function at a position
- diagnostics: Get all diagnostics for a file

All operations require:
- filePath: The file to operate on (absolute or relative to project root)
- line: The line number (1-based, as shown in editors)
- character: The character offset (1-based, as shown in editors)

Note: LSP servers must be configured for the file type. If no server is available, an error will be returned.`,
  
  parameters: z.object({
    operation: z.enum([
      'goToDefinition',
      'findReferences', 
      'hover',
      'documentSymbol',
      'workspaceSymbol',
      'goToImplementation',
      'prepareCallHierarchy',
      'incomingCalls',
      'outgoingCalls',
      'diagnostics',
    ]).describe('The LSP operation to perform'),
    
    filePath: z.string().describe('The absolute or relative path to the file'),
    
    line: z.number().int().min(1).describe('The line number (1-based, as shown in editors)'),
    
    character: z.number().int().min(1).describe('The character offset (1-based, as shown in editors)'),
    
    query: z.string().optional().describe('Search query for workspaceSymbol operation'),
  }),
  
  execute: async (args, context) => {
    const { operation, filePath, line, character, query } = args
    
    // Convert to LSP positions (0-based)
    const position = {
      file: filePath,
      line: line - 1,
      character: character - 1,
    }
    
    // Get LSP service from context (injected by OrchestratorManager)
    const lsp = context.lspService
    
    // Resolve absolute path
    const absolutePath = path.isAbsolute(filePath) 
      ? filePath 
      : path.join(process.cwd(), filePath)
    
    // Check if file exists (Node.js compatible)
    if (!fs.existsSync(absolutePath)) {
      throw new Error(`File not found: ${absolutePath}`)
    }
    
    // Check if LSP server is available
    const hasClients = await lsp.hasClients(absolutePath)
    if (!hasClients) {
      throw new Error(`No LSP server available for file type: ${filePath}`)
    }
    
    // Touch file to ensure LSP is ready
    await lsp.touchFile(absolutePath, true)
    
    // Execute operation
    let result: unknown
    
    switch (operation) {
      case 'goToDefinition':
        result = await lsp.definition(position)
        break
        
      case 'findReferences':
        result = await lsp.references(position)
        break
        
      case 'hover':
        result = await lsp.hover(position)
        break
        
      case 'documentSymbol':
        const uri = pathToFileURL(absolutePath).href
        result = await lsp.documentSymbol(uri)
        break
        
      case 'workspaceSymbol':
        result = await lsp.workspaceSymbol(query || '')
        break
        
      case 'goToImplementation':
        result = await lsp.implementation(position)
        break
        
      case 'prepareCallHierarchy':
        result = await lsp.prepareCallHierarchy(position)
        break
        
      case 'incomingCalls':
        result = await lsp.incomingCalls(position)
        break
        
      case 'outgoingCalls':
        result = await lsp.outgoingCalls(position)
        break
        
      case 'diagnostics':
        const allDiagnostics = await lsp.diagnostics()
        result = allDiagnostics[absolutePath] || []
        break
    }
    
    // Format output
    const output = formatLspResult(operation, result)
    
    return {
      content: output,
      metadata: {
        operation,
        filePath: absolutePath,
        line,
        character,
        result,
      },
    }
  },
}
```

### LspTool Operations Detail

| Operation | LSP Method | Description | Parameters |
|-----------|------------|-------------|------------|
| `goToDefinition` | `textDocument/definition` | Find definition location | filePath, line, character |
| `findReferences` | `textDocument/references` | Find all references | filePath, line, character |
| `hover` | `textDocument/hover` | Get hover info | filePath, line, character |
| `documentSymbol` | `textDocument/documentSymbol` | Get document symbols | filePath, line, character |
| `workspaceSymbol` | `workspace/symbol` | Search workspace symbols | filePath, line, character, query |
| `goToImplementation` | `textDocument/implementation` | Find implementations | filePath, line, character |
| `prepareCallHierarchy` | `textDocument/prepareCallHierarchy` | Get call hierarchy item | filePath, line, character |
| `incomingCalls` | `callHierarchy/incomingCalls` | Find callers | filePath, line, character |
| `outgoingCalls` | `callHierarchy/outgoingCalls` | Find callees | filePath, line, character |
| `diagnostics` | `textDocument/publishDiagnostics` | Get diagnostics | filePath, line, character |

### Result Formatting

```typescript
function formatLspResult(operation: string, result: unknown): string {
  if (Array.isArray(result) && result.length === 0) {
    return `No results found for ${operation}`
  }
  
  if (result === null || result === undefined) {
    return `No result for ${operation}`
  }
  
  return JSON.stringify(result, null, 2)
}
```

### LLM Prompt Example

When the LLM needs to understand a function:

```
The LLM can call: lsp({ operation: "hover", filePath: "src/utils.ts", line: 42, character: 10 })

This returns hover information including type signatures and documentation.
```

### Integration with OrchestratorManager

```typescript
// In nuvin-cli/source/services/OrchestratorManager.ts

import { LSP } from './lsp/index.js'
import { LspTool } from '@nuvin/nuvin-core'

// Initialize LSP service
await LSP.init()

// In tool creation, conditionally include LspTool
const tools = [
  ...baseTools,
  // Gate behind experimental flag
  ...(process.env.NUVIN_EXPERIMENTAL_LSP_TOOL === 'true' ? [LspTool] : []),
]

// Inject LSP service into tool context
const toolContext = {
  ...baseContext,
  lspService: LSP,  // LSP namespace as service
}
```

### Tool Export Pattern

```typescript
// In nuvin-core/src/tools.ts - add export
export { LspTool } from './tools/LspTool.js'

// In nuvin-core/src/index.ts - re-export
export { LspTool } from './tools.js'
```

### Experimental Flag

The LspTool is gated behind an environment variable:

```bash
# Enable LSP tool for LLM
NUVIN_EXPERIMENTAL_LSP_TOOL=true nuvin
```

### CLI Command for Testing

```bash
# Test LSP operations from CLI
nuvin lsp definition src/utils.ts 42 10
nuvin lsp references src/utils.ts 42 10  
nuvin lsp hover src/utils.ts 42 10
nuvin lsp document-symbol src/utils.ts
nuvin lsp workspace-symbol "function_name"
nuvin lsp diagnostics src/utils.ts
```

### LSP Operations Reference

All operations accept `filePath`, `line`, and `character` parameters (1-based, matching editor display).

#### 1. goToDefinition
```typescript
lsp({ 
  operation: "goToDefinition", 
  filePath: "src/utils.ts", 
  line: 42, 
  character: 10 
})
```
**LSP Method:** `textDocument/definition`
**Returns:** Array of Location objects pointing to definitions
**Use when:** Finding where a function/variable/class is defined

#### 2. findReferences
```typescript
lsp({ 
  operation: "findReferences", 
  filePath: "src/utils.ts", 
  line: 42, 
  character: 10 
})
```
**LSP Method:** `textDocument/references`
**Returns:** Array of Location objects with all references
**Use when:** Finding all usages of a symbol

#### 3. hover
```typescript
lsp({ 
  operation: "hover", 
  filePath: "src/utils.ts", 
  line: 42, 
  character: 10 
})
```
**LSP Method:** `textDocument/hover`
**Returns:** Hover object with contents, range, and format
**Use when:** Getting type information and documentation

#### 4. documentSymbol
```typescript
lsp({ 
  operation: "documentSymbol", 
  filePath: "src/utils.ts", 
  line: 1, 
  character: 1 
})
```
**LSP Method:** `textDocument/documentSymbol`
**Returns:** Array of DocumentSymbol or SymbolInformation
**Use when:** Getting all symbols (functions, classes, variables) in a file

#### 5. workspaceSymbol
```typescript
lsp({ 
  operation: "workspaceSymbol", 
  filePath: "src/utils.ts", 
  line: 1, 
  character: 1,
  query: "function_name" 
})
```
**LSP Method:** `workspace/symbol`
**Returns:** Array of SymbolInformation across workspace
**Use when:** Searching for symbols by name

#### 6. goToImplementation
```typescript
lsp({ 
  operation: "goToImplementation", 
  filePath: "src/utils.ts", 
  line: 42, 
  character: 10 
})
```
**LSP Method:** `textDocument/implementation`
**Returns:** Array of Location objects pointing to implementations
**Use when:** Finding implementations of interface/abstract method

#### 7. prepareCallHierarchy
```typescript
lsp({ 
  operation: "prepareCallHierarchy", 
  filePath: "src/utils.ts", 
  line: 42, 
  character: 10 
})
```
**LSP Method:** `textDocument/prepareCallHierarchy`
**Returns:** Array of CallHierarchyItem
**Use when:** Preparing for call hierarchy navigation

#### 8. incomingCalls
```typescript
lsp({ 
  operation: "incomingCalls", 
  filePath: "src/utils.ts", 
  line: 42, 
  character: 10 
})
```
**LSP Method:** `callHierarchy/incomingCalls`
**Returns:** Array of CallHierarchyIncomingCall (from locations)
**Use when:** Finding functions that call this function

#### 9. outgoingCalls
```typescript
lsp({ 
  operation: "outgoingCalls", 
  filePath: "src/utils.ts", 
  line: 42, 
  character: 10 
})
```
**LSP Method:** `callHierarchy/outgoingCalls`
**Returns:** Array of CallHierarchyOutgoingCall (to locations)
**Use when:** Finding functions called by this function

#### 10. diagnostics
```typescript
lsp({ 
  operation: "diagnostics", 
  filePath: "src/utils.ts", 
  line: 1, 
  character: 1 
})
```
**LSP Method:** `textDocument/publishDiagnostics` (via event)
**Returns:** Array of Diagnostic objects for the file
**Use when:** Getting errors, warnings, hints for a file

### Operation Flow

```
LLM decides it needs code intelligence
          ↓
Calls lsp tool with operation + position
          ↓
LspTool → LSP Service → LSP Client → LSP Server
          ↓
Results formatted and returned to LLM
          ↓
LLM continues with enriched context
```

---

## Dependencies

### Required Packages

Add to **nuvin-cli** (not nuvin-core, as LSP service lives in CLI):

```json
{
  "dependencies": {
    "vscode-jsonrpc": "^8.2.0",
    "vscode-languageserver-types": "^3.17.5"
  }
}
```

### Node.js Compatibility

All LSP code must use Node.js APIs (not Bun-specific):
- Use `fs.existsSync()` instead of `Bun.file().exists()`
- Use `child_process.spawn()` for process management
- Use `node:path`, `node:url` for path utilities
```

### Built-in Server Dependencies

Most servers are auto-installed or use system binaries:
- TypeScript: Uses `bun x typescript-language-server`
- Python: Auto-installs pyright via npm
- Go: Auto-installs gopls via `go install`
- Rust: Requires system-installed `rust-analyzer`

---

## Migration from OpenCode

### Files to Port

| OpenCode File | Nuvin CLI Target | Priority | Notes |
|---------------|------------------|----------|-------|
| `src/lsp/index.ts` | `source/services/lsp/index.ts` | High | Main LSP namespace |
| `src/lsp/client.ts` | `source/services/lsp/client.ts` | High | Client implementation |
| `src/lsp/server.ts` | `source/services/lsp/server.ts` | High | Server definitions |
| `src/lsp/language.ts` | `source/services/lsp/language.ts` | High | Language map |
| `src/tool/lsp.ts` | `nuvin-core/src/tools/LspTool.ts` | High | Dedicated LSP tool |
| `test/fixture/lsp/fake-lsp-server.js` | `test/fixture/lsp/fake-lsp-server.js` | Medium | Fake server for testing |

### Key Adaptations

1. **Instance → ConfigManager**
   - OpenCode uses `Instance.directory` for project root
   - Nuvin uses `process.cwd()` and ConfigManager

2. **Config.get() → ConfigManager.getConfig()**
   - Different config loading patterns

3. **Bus → eventBus**
   - OpenCode has `Bus.publish()` / `Bus.subscribe()`
   - Nuvin has `eventBus.emit()` / `eventBus.on()`

4. **Flag → Environment Variables**
   - OpenCode uses `Flag.OPENCODE_EXPERIMENTAL_LSP_TOOL`
   - Nuvin uses `process.env.NUVIN_*`

5. **BunProc → Node child_process**
   - OpenCode uses Bun-specific APIs
   - Nuvin should use portable Node.js APIs

6. **Global.Path.bin → Platform-specific binary path**
   - Need to define where auto-installed binaries go

### Example Adaptation

**OpenCode:**
```typescript
const cfg = await Config.get()
if (cfg.lsp === false) return
```

**Nuvin CLI:**
```typescript
const config = ConfigManager.getInstance().getConfig()
if (config.lsp === false) return
```

---

## Testing Strategy

### Unit Tests

1. **LSP Client**
   - Mock JSON-RPC connection
   - Test initialize handshake
   - Test notification handling

2. **Server Registry**
   - Test root resolution
   - Test extension matching

### Integration Tests

1. **Fake LSP Server**
   - Port `test/fixture/lsp/fake-lsp-server.js` from OpenCode
   - Test full client lifecycle

2. **Diagnostics Flow**
   - Edit file → receive diagnostics

### E2E Tests

1. **TypeScript Project**
   - Real tsserver
   - Edit file with type error
   - Verify diagnostic received

---

## Timeline Estimate

| Phase | Focus | Effort | Priority |
|-------|-------|--------|----------|
| Phase 1 | Core Infrastructure | 2-3 days | High |
| Phase 2 | LSP Tool Creation | 2-3 days | High |
| Phase 3 | Built-in Servers | 2-3 days | High |
| Phase 4 | Configuration | 1-2 days | Medium |
| Phase 5 | Event System & CLI | 1-2 days | Medium |
| Phase 6 | Advanced Features | 1-2 days | Low |

**Total: ~10-14 days**

**Note:** Phase 2 (LSP Tool) is now high priority as it's the primary interface for the LLM to interact with LSP servers. The tool exposes 10 different operations for comprehensive code intelligence.

---

## Open Questions

1. **Binary Storage Location**
   - Where should auto-downloaded LSP binaries be stored?
   - Suggestion: `~/.nuvin/bin/` or `~/.local/share/nuvin/lsp/`

2. **LspTool vs Auto-Diagnostics**
   - Should diagnostics be auto-injected after file edits, or should LLM explicitly call `lsp({ operation: "diagnostics" })`?
   - Current plan: Explicit via LspTool (Option B)

3. **Multi-root Workspaces**
   - How to handle monorepos with multiple package.json files?
   - Each server resolves its own root per OpenCode pattern

4. **LSP Tool Gating**
   - Should LSP tool be experimental-only?
   - Suggestion: Yes, behind `NUVIN_EXPERIMENTAL_LSP_TOOL=true`

5. **Operation Defaults**
   - For `workspaceSymbol`, should empty query return all symbols or none?
   - Suggestion: Empty query returns empty array (explicit search)

6. **Result Size Limits**
   - How many results to return for `workspaceSymbol`/`findReferences`?
   - Suggestion: Limit to 20-50 results to avoid context bloat

---

## References

- [OpenCode LSP Implementation](/packages/opencode/src/lsp/)
- [Language Server Protocol Specification](https://microsoft.github.io/language-server-protocol/)
- [vscode-languageserver-node](https://github.com/microsoft/vscode-languageserver-node)
