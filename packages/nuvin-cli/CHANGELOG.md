# @nuvin/nuvin-cli

## 1.4.0

### Minor Changes

- [`8a1b3c9`](https://github.com/marschhuynh/nuvin-space/commit/8a1b3c95e8e7e501ae24d7030f9d26aed5548ecf) Thanks [@marschhuynh](https://github.com/marschhuynh)! - **Help Bar Feature:**

  - Add help bar above input area showing keyboard shortcuts
    - Displays 'Ctrl+E show detail · ESC×2 stop · / command'
    - Uses single border line for clean appearance
    - Highlighted shortcuts in accent color

  **Tool Result Display Improvements:**

  - Simplify file_new display to match file_read pattern
    - Normal mode: Shows only file path and status (└─ Created)
    - Explain mode: Shows full file content with Markdown rendering
    - Add FileNewRenderer for better tool result visualization
    - Update ToolContentRenderer to conditionally render based on explain mode

  **Display Refinements:**

  - Clean up file_read and file_new result display
    - Hide 'Done' line for file_read and file_new in normal mode
    - Show 'Done' line only in explain mode when content is displayed
    - Restructure shouldShowResult logic to separate status line from content

  **Status Handling:**

  - Add 'denied by user' status handling in ToolResultView
    - Detect denial in error messages
    - Show 'Denied' status in yellow/warning color
    - Consistent with 'Aborted' status handling

  **Explain Mode Footer:**

  - Update Footer for explain mode
    - Show only 'Ctrl+E to toggle' message when in explain mode
    - Hide all other status info (provider, model, tokens, costs)
    - Provides focused, minimal interface in explain mode

### Patch Changes

- [`8a1b3c9`](https://github.com/marschhuynh/nuvin-space/commit/8a1b3c95e8e7e501ae24d7030f9d26aed5548ecf) Thanks [@marschhuynh](https://github.com/marschhuynh)! - **Critical Fixes:**

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

- Updated dependencies [[`8a1b3c9`](https://github.com/marschhuynh/nuvin-space/commit/8a1b3c95e8e7e501ae24d7030f9d26aed5548ecf)]:
  - @nuvin/nuvin-core@1.1.1

## 1.3.0

### Minor Changes

- [`77334ba`](https://github.com/marschhuynh/nuvin-space/commit/77334bae65ad541b25eaf99459f8f7097dc1c440) Thanks [@marschhuynh](https://github.com/marschhuynh)! - Add explain mode with Ctrl+E toggle and improve tool result display

  **Explain Mode Features:**

  - Press Ctrl+E to toggle between interactive and explain modes
  - View-only mode with full tool call/result details
  - Pretty-printed JSON parameters with 2-space indentation
  - Full content display without truncation
  - Footer shows "Ctrl+E to toggle" message in explain mode

  **Tool Display Improvements:**

  - Add help bar above input showing keyboard shortcuts (Ctrl+E, ESC×2, /)
  - Simplify file_new and file_read display in normal mode
    - Show only file path and status (e.g., "└─ Created", "└─ Read 59 lines")
    - Hide verbose content and "Done" line
  - Explain mode shows full file content with Markdown rendering
  - Add friendly tool name mapping (file_read → "Read file", todo_write → "Update todo", etc.)

  **Status Handling:**

  - Add "Denied" status for user-denied tool approvals
  - Consistent yellow/warning color for Denied and Aborted statuses
  - Improved status line logic for cleaner output

  **User Experience:**

  - Clean, minimal display in normal mode
  - Detailed inspection mode via Ctrl+E toggle
  - Consistent across all tool types
  - Better visual hierarchy with proper tree branching (├─, └─)

## 1.2.1

### Patch Changes

- [`5f528cd`](https://github.com/marschhuynh/nuvin-space/commit/5f528cd5274cd7058e8c3945d198db6dadb92b65) Thanks [@marschhuynh](https://github.com/marschhuynh)! - Test trusted publishing workflow configuration

## 1.2.0

### Minor Changes

- [`ad080e2`](https://github.com/marschhuynh/nuvin-space/commit/ad080e21036ebd74752cee6105349c487c894f00) Thanks [@marschhuynh](https://github.com/marschhuynh)! - Add custom provider configuration support in config.yaml. Users can now define custom OpenAI-compatible providers with type, baseUrl, and models fields. Custom providers automatically appear in the /model command and support dynamic model listing.

- [`6182a96`](https://github.com/marschhuynh/nuvin-space/commit/6182a966aa3579983f67a46647d935e0ea2f1819) Thanks [@marschhuynh](https://github.com/marschhuynh)! - Upgrade Ink to v6.5.0 with incremental rendering support. Enable incrementalRendering flag and increase maxFps to 60 for smoother UI updates and better performance.

### Patch Changes

- [`7513ee8`](https://github.com/marschhuynh/nuvin-space/commit/7513ee818ed28e3efbc98d1cca2c0765d4355e27) Thanks [@marschhuynh](https://github.com/marschhuynh)! - Fix markdown rendering for final assistant messages. Always update content and trigger re-render when streaming completes to ensure markdown is properly rendered. Previously, final messages would sometimes display raw markdown instead of formatted content.

- Updated dependencies [[`4ecfa09`](https://github.com/marschhuynh/nuvin-space/commit/4ecfa09550f43e60943c1d06dcc27eb782580f27), [`da66afa`](https://github.com/marschhuynh/nuvin-space/commit/da66afae845e697e9706d9175c888618811388fd), [`d3411e4`](https://github.com/marschhuynh/nuvin-space/commit/d3411e453323d9de85f42b40a3f66f4f06132398)]:
  - @nuvin/nuvin-core@1.1.0

## 1.1.0

### Minor Changes

- [`6b42a67`](https://github.com/marschhuynh/nuvin-space/commit/6b42a67a90cf1d4ff8be9679eede9f8fdbfc5b41) Thanks [@marschhuynh](https://github.com/marschhuynh)! - Add automatic update functionality with background updates

  - Add UpdateChecker service to query npm registry for latest version
  - Add AutoUpdater service with intelligent package manager detection (npm/pnpm/yarn)
  - Integrate auto-update check on CLI startup with background update capability
  - Support detection of installation method via executable path analysis

## 1.0.2

### Patch Changes

- [`1408707`](https://github.com/marschhuynh/nuvin-space/commit/140870791f123de29ea5550150d0efcd4c2b3ae9) Thanks [@marschhuynh](https://github.com/marschhuynh)! - Fix config set command to properly handle array notation

  Added support for array bracket notation (e.g., `auth[0]`) in config paths. Previously, `nuvin config set providers.openrouter.auth[0].api-key "sk-xxx" --global` would create an incorrect structure with `auth[0]` as a string key. Now it properly creates an array with indexed elements.

  - Fix createNestedObject to parse and handle array notation
  - Fix deepMerge to merge array elements by index
  - Add comprehensive tests (26 new tests)

## 1.0.1

### Patch Changes

- [`ac0575a`](https://github.com/marschhuynh/nuvin-space/commit/ac0575a8691a3340796d8867f88cbadf998daae5) Thanks [@marschhuynh](https://github.com/marschhuynh)! - Add path alias configuration for @/ imports across TypeScript, build, and test tools

- [`40b208c`](https://github.com/marschhuynh/nuvin-space/commit/40b208cbf0994b65152469e4590bffd087144123) Thanks [@marschhuynh](https://github.com/marschhuynh)! - Fix cost tracking to return actual cost from OpenRouter and prevent double-counting in event processor

- [`97c6320`](https://github.com/marschhuynh/nuvin-space/commit/97c6320b2875ea35800d76b1720149b100f8e92a) Thanks [@marschhuynh](https://github.com/marschhuynh)! - Replace relative imports with @/ path alias for improved code maintainability

- Updated dependencies [[`40b208c`](https://github.com/marschhuynh/nuvin-space/commit/40b208cbf0994b65152469e4590bffd087144123)]:
  - @nuvin/nuvin-core@1.0.1

## 1.0.0

### Major Changes

- [`05fad0c`](https://github.com/marschhuynh/nuvin-space/commit/05fad0ca6722b823554dc388e0583c54d8851512) Thanks [@marschhuynh](https://github.com/marschhuynh)! - **BREAKING CHANGE:** Sub-agent delegation API signatures changed

  Enable fresh LLM configuration for sub-agents with factory pattern. Sub-agents now automatically pick up the current active model and provider without requiring orchestrator restart.

  ## Features

  - **Fresh Config for Sub-Agents**: Sub-agents now get fresh LLM instances with current model/provider configuration via factory pattern
  - **Template Overrides**: Agent templates can specify `provider` and `model` fields to override defaults (e.g., `provider: zai`, `model: glm-4-flash`)
  - **Config Resolver Pattern**: Added callback to provide fresh config values (model, reasoningEffort) on each sub-agent creation
  - **Cleaner Architecture**: Factory and resolver patterns for better separation of concerns

  ## Breaking Changes

  ### API Signature Changes

  **AgentManager:**

  ```typescript
  // Before
  new AgentManager(config, llm, tools, llmFactory?, eventCallback?)

  // After
  new AgentManager(config, tools, llmFactory?, eventCallback?, configResolver?)
  ```

  **AgentManagerCommandRunner:**

  ```typescript
  // Before
  new AgentManagerCommandRunner(config, llm, tools, llmFactory?)

  // After
  new AgentManagerCommandRunner(config, tools, llmFactory?, configResolver?)
  ```

  **ToolPort.setOrchestrator:**

  ```typescript
  // Before
  setOrchestrator(config, llm, tools, llmFactory?)

  // After
  setOrchestrator(config, tools, llmFactory?, configResolver?)
  ```

  ### Removed Parameters

  - Removed `llm` parameter from entire delegation chain (use factory instead)
  - Removed unused `apiKey` field from `AgentTemplate`, `SpecialistAgentConfig`, and `LLMConfig` (API keys managed via ConfigManager only)

  ## Implementation Details

  - **LLMFactory & LLMResolver**: Always creates fresh LLM instances via factory pattern
  - **Config Priority**: Template model/provider > Fresh active config > Delegating agent config
  - **Provider Validation**: Validates provider has auth configured before using template override
  - **Type Safety**: Proper interface segregation with `AgentAwareToolPort` and `OrchestratorAwareToolPort`

  ## Migration Guide

  If you're using the delegation APIs directly, update your code:

  ```typescript
  // Update AgentManager instantiation
  const agentManager = new AgentManager(
  	delegatingConfig,
  	delegatingTools, // llm parameter removed
  	llmFactory,
  	eventCallback,
  	configResolver, // new parameter
  );

  // Update setOrchestrator calls
  toolRegistry.setOrchestrator(
  	config,
  	tools, // llm parameter removed
  	llmFactory,
  	configResolver, // new parameter
  );
  ```

  Most users won't be affected as these are internal APIs. The `assign_task` tool works the same as before.

### Patch Changes

- Updated dependencies [[`05fad0c`](https://github.com/marschhuynh/nuvin-space/commit/05fad0ca6722b823554dc388e0583c54d8851512)]:
  - @nuvin/nuvin-core@1.0.0

## 0.1.0

### Minor Changes

- [`e43c58b`](https://github.com/marschhuynh/nuvin-space/commit/e43c58bab64c2184010972250d62c63af6a5f393) Thanks [@marschhuynh](https://github.com/marschhuynh)! - Initial release of Nuvin - Interactive AI coding assistant CLI

### Patch Changes

- Updated dependencies [[`e43c58b`](https://github.com/marschhuynh/nuvin-space/commit/e43c58bab64c2184010972250d62c63af6a5f393)]:
  - @nuvin/nuvin-core@0.1.0
