# @nuvin/nuvin-cli

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
