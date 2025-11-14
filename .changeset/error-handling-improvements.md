---
'@nuvin/nuvin-core': patch
'@nuvin/nuvin-cli': patch
---

**Critical Fixes:**

- Fix unsafe type casting in EventBus that could cause runtime errors
- Add error handling for JSON parsing in ToolResultView to prevent crashes from malformed tool arguments
- Export `ErrorReason` enum from `@nuvin/nuvin-core` for better error categorization

**Improvements:**

- Add `ErrorReason` metadata to tool execution results for better error tracking
- Improve error categorization in BashTool (permission denied, not found, timeout)
- Better error display in ToolResultView with status icons for different error types
- Add fallback behavior for `useExplainMode` when used outside provider context
- Refactor UpdateChecker and AutoUpdater to use namespaces instead of static classes
- Extract magic numbers to constants in BashToolRenderer

**Code Quality:**

- Remove unnecessary biome-ignore comments
- Fix useMemo dependencies in ExplainModeContext
- Improve error messaging and user feedback throughout the application
