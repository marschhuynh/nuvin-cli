# @nuvin/nuvin-core

## 1.1.1

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

## 1.1.0

### Minor Changes

- [`4ecfa09`](https://github.com/marschhuynh/nuvin-space/commit/4ecfa09550f43e60943c1d06dcc27eb782580f27) Thanks [@marschhuynh](https://github.com/marschhuynh)! - Add support for custom LLM providers with flexible model configuration. Custom providers can be defined with OpenAI-compatible APIs and support multiple model configuration types: pre-defined lists, custom endpoints, or dynamic fetching.

- [`d3411e4`](https://github.com/marschhuynh/nuvin-space/commit/d3411e453323d9de85f42b40a3f66f4f06132398) Thanks [@marschhuynh](https://github.com/marschhuynh)! - Remove unused className and transportName fields from provider configuration. The createTransport function signature has been updated to remove the unused \_name parameter. This is a breaking change for any code that directly uses createTransport.

### Patch Changes

- [`da66afa`](https://github.com/marschhuynh/nuvin-space/commit/da66afae845e697e9706d9175c888618811388fd) Thanks [@marschhuynh](https://github.com/marschhuynh)! - Improve streaming behavior by only stripping leading newlines from the first chunk. Emit AssistantMessage events for both streaming and non-streaming modes to ensure proper UI finalization and markdown rendering.

## 1.0.1

### Patch Changes

- [`40b208c`](https://github.com/marschhuynh/nuvin-space/commit/40b208cbf0994b65152469e4590bffd087144123) Thanks [@marschhuynh](https://github.com/marschhuynh)! - Fix cost tracking to return actual cost from OpenRouter and prevent double-counting in event processor

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
    configResolver // new parameter
  );

  // Update setOrchestrator calls
  toolRegistry.setOrchestrator(
    config,
    tools, // llm parameter removed
    llmFactory,
    configResolver // new parameter
  );
  ```

  Most users won't be affected as these are internal APIs. The `assign_task` tool works the same as before.

## 0.1.0

### Minor Changes

- [`e43c58b`](https://github.com/marschhuynh/nuvin-space/commit/e43c58bab64c2184010972250d62c63af6a5f393) Thanks [@marschhuynh](https://github.com/marschhuynh)! - Initial release of Nuvin - Interactive AI coding assistant CLI
