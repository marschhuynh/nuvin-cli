# Critical Fix: Double-Slash Command Pattern

**Date:** 2026-01-27  
**Severity:** CRITICAL  
**Status:** FIXED ✅

## Issue Description

The ACP slash commands implementation was using **single-slash pattern** (`/command`) but Nuvin actually uses **double-slash pattern** (`//command`).

## Impact

**Before Fix:** The entire slash commands feature was non-functional because:
- Regex pattern was `/^\/([a-z][a-z0-9_-]*)\s*(.*)/` (matches `/command`)
- Actual commands are `//exit`, `//sudo`, `//help`, etc (double-slash)
- Pattern would never match → commands never invoked

**Result:** 100% failure rate for slash command invocation via ACP.

## Root Cause

Implementation was based on plan assumption that Nuvin used single-slash syntax like many CLI tools. However, Nuvin's actual command system uses double-slash to avoid conflicts with file paths and URLs that contain single slashes.

## Fix Applied

### Code Changes (commit `418c527`)

**File: `packages/nuvin-cli/source/acp-entry.ts`**
```diff
- if (text.trim().startsWith('/')) {
-   const match = text.match(/^\/([a-z][a-z0-9_-]*)\s*(.*)/);
+ if (text.trim().startsWith('//')) {
+   const match = text.match(/^\/\/([a-z][a-z0-9_-]*)\s*(.*)/);
```

**File: `docs/acp-slash-commands.md`**
- Changed all `/command` examples to `//command`
- Updated command list: `//help`, `//clear`, `//sudo`, etc
- Fixed JSON-RPC invocation example

## Verification

✅ **Tests:** All 23 ACP tests passing  
✅ **Build:** Successful compilation  
✅ **Pattern:** Now correctly matches `//` prefix  

## Correct Usage

**Built-in commands:**
```
//help        - Show help
//clear       - Clear conversation
//sudo        - Enable sudo mode
//exit        - Exit session
//new         - Create new items
//vim         - Vim mode
//summary     - Generate summaries
//brainstorm  - Brainstorm ideas
```

**Custom commands:**
```
//review src/api.ts    - Run custom review command
//test unit            - Run custom test command
```

## Protocol Example

```json
{
  "jsonrpc": "2.0",
  "method": "session/prompt",
  "params": {
    "prompt": [{"type": "text", "text": "//help"}]
  }
}
```

## Lessons Learned

1. **Verify assumptions early:** Should have tested with actual Nuvin CLI before implementing
2. **Check existing patterns:** Review codebase for existing command syntax before designing new features
3. **Integration testing:** Manual testing with real commands would have caught this immediately

## Acknowledgment

Thanks to the user for catching this critical bug during review! The issue was identified and fixed before the feature was deployed to production.
