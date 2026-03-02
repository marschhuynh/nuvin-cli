# @nuvin/nuvin-core

## 2.0.0-rc.6

### Minor Changes

- [`9ea61e9`](https://github.com/marschhuynh/nuvin-space/commit/9ea61e972bcb2d86c4d4d320c67df8a89a0d34f3) Thanks [@marschhuynh](https://github.com/marschhuynh)! - feat(memory): replace JSON store with BM25 topic-based markdown storage

  - Rewrite MemoryService with frontmatter-topic-md format (one file per topic)
  - Add BM25 retrieval engine with recency/frequency/type-weight scoring
  - Add query-scoped memory injection per message instead of full dump
  - Migrate legacy memories.json entries on startup
  - Add `topic`, `title`, `keywords`, `updateMode` fields to memory_save tool
  - Add `upsertTopicMemory` for merge/replace semantics
  - Wire workspaceId for project-scoped memory isolation
  - Add retrieval/storage/index config options to MemorySettings
  - Export `MemoryEntryInput` type from nuvin-core

## 2.0.0-rc.5

### Minor Changes

- [`aab1a6a`](https://github.com/marschhuynh/nuvin-space/commit/aab1a6aebae5398407235b6615b1a2046df2a26e) Thanks [@marschhuynh](https://github.com/marschhuynh)! - Fix preloaded messages lost when migrating to persisted storage; add snapshot control params to ComputerUseTool

## 2.0.0-rc.4

### Patch Changes

- [`dd64099`](https://github.com/marschhuynh/nuvin-space/commit/dd64099576e818850c53cbd60349f52e1eff119f) Thanks [@marschhuynh](https://github.com/marschhuynh)! - Copy ax-helper Swift source to dist during build, fix setup command to read from dist location

## 2.0.0-rc.3

### Minor Changes

- [`340f343`](https://github.com/marschhuynh/nuvin-space/commit/340f34357001894a25ef93e96e73c78a8093e895) Thanks [@marschhuynh](https://github.com/marschhuynh)! - Add ComputerUseTool for macOS automation via AX tree, add safe tool call argument parsing with sanitization, add mixed content result type for text+image outputs

## 2.0.0-rc.2

### Minor Changes

- [`c0b2b87`](https://github.com/marschhuynh/nuvin-space/commit/c0b2b875ad78deb1794c9939e46a51919df962c1) Thanks [@marschhuynh](https://github.com/marschhuynh)! - Add long-term memory system with JSON file store, semantic ranking, and background extraction; add `memory_save` tool.

### Patch Changes

- [`fe94e2f`](https://github.com/marschhuynh/nuvin-space/commit/fe94e2fbb353203b3011623c9c5cbc7aa20886ea) Thanks [@marschhuynh](https://github.com/marschhuynh)! - Fix JSON.parse crash when tool call arguments is empty string.

## 2.0.0-rc.1

### Minor Changes

- [`93a158a`](https://github.com/marschhuynh/nuvin-space/commit/93a158a6cf8083bd4f2c7f1a8c3108ca1575470c) Thanks [@marschhuynh](https://github.com/marschhuynh)! - feat: inject available skills into system prompt for agent awareness

## 2.0.0-rc.0

### Major Changes

- [`8e9e8a9`](https://github.com/marschhuynh/nuvin-space/commit/8e9e8a92edb03f0e914905c0c34d566027e30f0b) Thanks [@marschhuynh](https://github.com/marschhuynh)! - BREAKING: Make temperature and topP optional in CompletionParams and AgentConfig

  - temperature and topP are now optional in CompletionParams (LLMPort)
  - temperature and topP are now optional in AgentConfig
  - BaseLLM only sends temperature/topP to API when explicitly provided
  - AgentManager and AgentRegistry respect undefined temperature values
  - Orchestrator passes temperature/topP only when defined

### Patch Changes

- [`9696dd4`](https://github.com/marschhuynh/nuvin-space/commit/9696dd474994e75aec104e12786d6ef26bd1ca50) Thanks [@marschhuynh](https://github.com/marschhuynh)! - feat(cli): add auto-summary continuation and improve summary prompt

  - Auto-submit continuation turn after context window auto-summary
  - Add skipAutoSummaryCheck option to prevent recursive checks
  - Improve summary prompt for better session continuity
  - Lower auto-summary threshold to 30% for earlier intervention

- [`d124700`](https://github.com/marschhuynh/nuvin-space/commit/d124700cf1b4296b784bab734501e56f91f5a300) Thanks [@marschhuynh](https://github.com/marschhuynh)! - Improve Responses API compatibility mapping and provider wiring.

## 1.19.0

### Minor Changes

- [`458f15a`](https://github.com/marschhuynh/nuvin-space/commit/458f15a831ca7f5d4c54fabfbdf5a2a9e67fcdd4) Thanks [@marschhuynh](https://github.com/marschhuynh)! - ```

  3. Message should be a compact, single sentence (imperative), e.g. `Refresh LSP diagnostics after file edits.`
  4. Commit with conventional commits (e.g. `fix: ...`, `feat: ...`, `chore: ...`).

- [#165](https://github.com/marschhuynh/nuvin-cli/pull/165) [`ae426ba`](https://github.com/marschhuynh/nuvin-space/commit/ae426bab43077a14759e692d6d6db703f883935e) Thanks [@marschhuynh](https://github.com/marschhuynh)! - Add MCP image content extraction and base64 image detection for tool results

- [`d52de6c`](https://github.com/marschhuynh/nuvin-space/commit/d52de6cb325b69ce43702b8411e944d1e5d7c877) Thanks [@marschhuynh](https://github.com/marschhuynh)! - feat(bash): add ignoreOutput option to discard stdout/stderr and return only exit code; update prompt formatting

- [`7bce888`](https://github.com/marschhuynh/nuvin-space/commit/7bce888d9113b532706ebca78969266a3f21deaa) Thanks [@marschhuynh](https://github.com/marschhuynh)! - feat(grep): add single file search and context lines; feat(cli): inject git context (branch, repo, commits) into agent system prompts; fix(cli): ComboBox text truncation with flexShrink

- [`2c80900`](https://github.com/marschhuynh/nuvin-space/commit/2c80900bbd377c1b8d8e81e0bdf819da2495ac99) Thanks [@marschhuynh](https://github.com/marschhuynh)! - Add GitHub responses API support and tool validation tweaks.

- [`65ca384`](https://github.com/marschhuynh/nuvin-space/commit/65ca384d91f80ceef7618e866cd56bf8dd11472c) Thanks [@marschhuynh](https://github.com/marschhuynh)! - Add hook system for intercepting agent lifecycle events (pre/post-tool, session start/end). Supports bash command hooks with pattern matching, JSON control flow, and integration with Orchestrator.

- [`93da975`](https://github.com/marschhuynh/nuvin-space/commit/93da9755fc17231a4d1608bdfe49c85699bb84f5) Thanks [@marschhuynh](https://github.com/marschhuynh)! - Add version option to GenericAnthropicLLM for User-Agent header; migrate Kimi provider from openai-compat to anthropic-compat

- [`0373a85`](https://github.com/marschhuynh/nuvin-space/commit/0373a85cf4b6868746f47d557e87e0f6ab7ff2e8) Thanks [@marschhuynh](https://github.com/marschhuynh)! - feat(core): add PermissionRequest hook for tool approval notifications; fix(core): add timeout handling and reconnection options to MCP client; docs(cli): update hooks usage and agent documentation

- [`a916738`](https://github.com/marschhuynh/nuvin-space/commit/a9167387ba32d8958aca22bea4cdc7185a986106) Thanks [@marschhuynh](https://github.com/marschhuynh)! - Redesign agent creation TUI: rename systemPrompt to instructions, simplify state machine, improve keyboard navigation

### Patch Changes

- [`ffb522d`](https://github.com/marschhuynh/nuvin-space/commit/ffb522d5c91c80d1fc54d5318d9f70c0c89e10f8) Thanks [@marschhuynh](https://github.com/marschhuynh)! - fix(cli): allow editing all built-in agents via auto-copy to global location

- [`9e42bc5`](https://github.com/marschhuynh/nuvin-space/commit/9e42bc5f0fce408de46718f2dfaaf5f391780a5f) Thanks [@marschhuynh](https://github.com/marschhuynh)! - feat: add mergeAgentConfig function for hot agent swapping

- [#164](https://github.com/marschhuynh/nuvin-cli/pull/164) [`32b0f04`](https://github.com/marschhuynh/nuvin-space/commit/32b0f04e8ffb9e449c4fa1aaf6c572ed24ee7af2) Thanks [@marschhuynh](https://github.com/marschhuynh)! - Fix token usage calculation to include cached tokens in prompt_tokens

- [`354a1c7`](https://github.com/marschhuynh/nuvin-space/commit/354a1c75b088b2df5ad274a29558c566049a7ff1) Thanks [@marschhuynh](https://github.com/marschhuynh)! - Add max_tokens field to agent configuration

- [`f0c801c`](https://github.com/marschhuynh/nuvin-space/commit/f0c801cd5230fcdacbe337188d4d457fb62c51aa) Thanks [@marschhuynh](https://github.com/marschhuynh)! - Refactor tool call rendering with comprehensive improvements:

  - Show last lines in result truncation instead of first for better visibility
  - Fix denied/edited states to avoid duplicate content display
  - Add per-tool excludeParams config for cleaner parameter display
  - Use dynamic tool names in SubAgentActivity (Reading/Read/Read failed)
  - Fix abort errorReason to return 'aborted' instead of 'unknown'
  - Show actual error messages in sub-agent status lines

## 1.19.0-rc.12

### Minor Changes

- [`0373a85`](https://github.com/marschhuynh/nuvin-space/commit/0373a85cf4b6868746f47d557e87e0f6ab7ff2e8) Thanks [@marschhuynh](https://github.com/marschhuynh)! - feat(core): add PermissionRequest hook for tool approval notifications; fix(core): add timeout handling and reconnection options to MCP client; docs(cli): update hooks usage and agent documentation

## 1.19.0-rc.11

### Minor Changes

- [`7bce888`](https://github.com/marschhuynh/nuvin-space/commit/7bce888d9113b532706ebca78969266a3f21deaa) Thanks [@marschhuynh](https://github.com/marschhuynh)! - feat(grep): add single file search and context lines; feat(cli): inject git context (branch, repo, commits) into agent system prompts; fix(cli): ComboBox text truncation with flexShrink

## 1.19.0-rc.10

### Patch Changes

- [`ffb522d`](https://github.com/marschhuynh/nuvin-space/commit/ffb522d5c91c80d1fc54d5318d9f70c0c89e10f8) Thanks [@marschhuynh](https://github.com/marschhuynh)! - fix(cli): allow editing all built-in agents via auto-copy to global location

## 1.19.0-rc.9

### Minor Changes

- [`d52de6c`](https://github.com/marschhuynh/nuvin-space/commit/d52de6cb325b69ce43702b8411e944d1e5d7c877) Thanks [@marschhuynh](https://github.com/marschhuynh)! - feat(bash): add ignoreOutput option to discard stdout/stderr and return only exit code; update prompt formatting

## 1.19.0-rc.8

### Minor Changes

- [#165](https://github.com/marschhuynh/nuvin-cli/pull/165) [`ae426ba`](https://github.com/marschhuynh/nuvin-space/commit/ae426bab43077a14759e692d6d6db703f883935e) Thanks [@marschhuynh](https://github.com/marschhuynh)! - Add MCP image content extraction and base64 image detection for tool results

### Patch Changes

- [`354a1c7`](https://github.com/marschhuynh/nuvin-space/commit/354a1c75b088b2df5ad274a29558c566049a7ff1) Thanks [@marschhuynh](https://github.com/marschhuynh)! - Add max_tokens field to agent configuration

## 1.19.0-rc.7

### Patch Changes

- [#164](https://github.com/marschhuynh/nuvin-cli/pull/164) [`32b0f04`](https://github.com/marschhuynh/nuvin-space/commit/32b0f04e8ffb9e449c4fa1aaf6c572ed24ee7af2) Thanks [@marschhuynh](https://github.com/marschhuynh)! - Fix token usage calculation to include cached tokens in prompt_tokens

## 1.19.0-rc.6

### Patch Changes

- [`f0c801c`](https://github.com/marschhuynh/nuvin-space/commit/f0c801cd5230fcdacbe337188d4d457fb62c51aa) Thanks [@marschhuynh](https://github.com/marschhuynh)! - Refactor tool call rendering with comprehensive improvements:

  - Show last lines in result truncation instead of first for better visibility
  - Fix denied/edited states to avoid duplicate content display
  - Add per-tool excludeParams config for cleaner parameter display
  - Use dynamic tool names in SubAgentActivity (Reading/Read/Read failed)
  - Fix abort errorReason to return 'aborted' instead of 'unknown'
  - Show actual error messages in sub-agent status lines

## 1.19.0-rc.5

### Minor Changes

- [`93da975`](https://github.com/marschhuynh/nuvin-space/commit/93da9755fc17231a4d1608bdfe49c85699bb84f5) Thanks [@marschhuynh](https://github.com/marschhuynh)! - Add version option to GenericAnthropicLLM for User-Agent header; migrate Kimi provider from openai-compat to anthropic-compat

## 1.19.0-rc.4

### Minor Changes

- [`65ca384`](https://github.com/marschhuynh/nuvin-space/commit/65ca384d91f80ceef7618e866cd56bf8dd11472c) Thanks [@marschhuynh](https://github.com/marschhuynh)! - Add hook system for intercepting agent lifecycle events (pre/post-tool, session start/end). Supports bash command hooks with pattern matching, JSON control flow, and integration with Orchestrator.

## 1.19.0-rc.3

### Minor Changes

- [`a916738`](https://github.com/marschhuynh/nuvin-space/commit/a9167387ba32d8958aca22bea4cdc7185a986106) Thanks [@marschhuynh](https://github.com/marschhuynh)! - Redesign agent creation TUI: rename systemPrompt to instructions, simplify state machine, improve keyboard navigation

## 1.19.0-rc.2

### Patch Changes

- [`9e42bc5`](https://github.com/marschhuynh/nuvin-space/commit/9e42bc5f0fce408de46718f2dfaaf5f391780a5f) Thanks [@marschhuynh](https://github.com/marschhuynh)! - feat: add mergeAgentConfig function for hot agent swapping

## 1.19.0-rc.1

### Minor Changes

- [`458f15a`](https://github.com/marschhuynh/nuvin-space/commit/458f15a831ca7f5d4c54fabfbdf5a2a9e67fcdd4) Thanks [@marschhuynh](https://github.com/marschhuynh)! - ```

  3. Message should be a compact, single sentence (imperative), e.g. `Refresh LSP diagnostics after file edits.`
  4. Commit with conventional commits (e.g. `fix: ...`, `feat: ...`, `chore: ...`).

## 1.19.0-rc.0

### Minor Changes

- [`2c80900`](https://github.com/marschhuynh/nuvin-space/commit/2c80900bbd377c1b8d8e81e0bdf819da2495ac99) Thanks [@marschhuynh](https://github.com/marschhuynh)! - Add GitHub responses API support and tool validation tweaks.

## 1.18.0

### Minor Changes

- [`a92a995`](https://github.com/marschhuynh/nuvin-space/commit/a92a9954519c52c516beb8929becf6e79104f7d1) Thanks [@marschhuynh](https://github.com/marschhuynh)! - Fix UserQuestionPrompt bugs, add ask_user_tool to enabled tools, and improve focus cycling

## 1.17.0

### Minor Changes

- [`822a763`](https://github.com/marschhuynh/nuvin-space/commit/822a76314ec7fa279dc646c508624c4f60315094) Thanks [@marschhuynh](https://github.com/marschhuynh)! - Add MCP OAuth support with token storage

## 1.16.2

### Patch Changes

- [`e133ab5`](https://github.com/marschhuynh/nuvin-space/commit/e133ab545cf73d0c414c2d34f7b8275276a24059) Thanks [@marschhuynh](https://github.com/marschhuynh)! - Enable LSP by default and improve skill tool display

## 1.16.1

### Patch Changes

- [`7ce583d`](https://github.com/marschhuynh/nuvin-space/commit/7ce583de849fdc1a38bfa44c6d8403480ae3a4cf) Thanks [@marschhuynh](https://github.com/marschhuynh)! - chore(core): remove deprecated zai provider configuration

## 1.16.0

### Minor Changes

- [`1d3786f`](https://github.com/marschhuynh/nuvin-space/commit/1d3786f6d4b825d3f1251ea4d1d3965df9660019) Thanks [@marschhuynh](https://github.com/marschhuynh)! - feat(core): add SkillTool for agent skill management

## 1.15.0

### Minor Changes

- [`7f3cad5`](https://github.com/marschhuynh/nuvin-space/commit/7f3cad51cd98cf70856f365353e69027949f96a4) Thanks [@marschhuynh](https://github.com/marschhuynh)! - feat(cli): enable LSP tool by default and add UI margin

## 1.14.1

### Patch Changes

- [`e78209c`](https://github.com/marschhuynh/nuvin-space/commit/e78209c97bcab81438bba01a14205a2cb077f2c1) Thanks [@marschhuynh](https://github.com/marschhuynh)! - Add thinking_blocks with signature support for Anthropic extended thinking

## 1.14.0

### Minor Changes

- [`795a2cd`](https://github.com/marschhuynh/nuvin-space/commit/795a2cd2c258bbd623576f570522a5321e929038) Thanks [@marschhuynh](https://github.com/marschhuynh)! - Refactor tool approval to per-tool granularity. Each tool now gets its own approval flow: bypass tools execute immediately, approval-required tools wait for individual user decisions. Added new `ui:toolCalls` event for real-time tool tracking. Removed batch approval model in favor of individual tool approvals.

## 1.13.5

### Patch Changes

- [`27ff7ca`](https://github.com/marschhuynh/nuvin-space/commit/27ff7ca2bbc89c99ba7d9c73042f7e84bf0621c6) Thanks [@marschhuynh](https://github.com/marschhuynh)! - refactor(core): rename delegation module files to kebab-case

## 1.13.4

### Patch Changes

- [`124f83b`](https://github.com/marschhuynh/nuvin-space/commit/124f83b40145ae76c131e0c54c5d4ecc933ea774) Thanks [@marschhuynh](https://github.com/marschhuynh)! - refactor(core): rename delegation module files to kebab-case

## 1.13.3

### Patch Changes

- [`aa6474e`](https://github.com/marschhuynh/nuvin-space/commit/aa6474e5640ffdc9ff10efdd5b188dbca397421d) Thanks [@marschhuynh](https://github.com/marschhuynh)! - feat(core): add AgentStateManager and TaskOutputTool for improved sub-agent session management

  refactor(core): refactor DefaultDelegationService with enhanced state tracking

  feat(core): add MultiFileMemoryPersistence for robust session resumption

  refactor(core): simplify AssignTool with direct AgentManager integration

  refactor(cli): update SubAgentActivity UI for better tool result display

## 1.13.2

### Patch Changes

- [`4406892`](https://github.com/marschhuynh/nuvin-space/commit/4406892422e69e034fa6f00a00a720aef9ae4522) Thanks [@marschhuynh](https://github.com/marschhuynh)! - refactor(AgentCreation): integrate FocusContext; redesign form UI with tab nav

  feat(AgentCreator): add retry logic and configurable options

  refactor(prompt): simplify agent-creator template

## 1.13.1

### Patch Changes

- [`d1bf395`](https://github.com/marschhuynh/nuvin-space/commit/d1bf395c46b95aac51e89f1505f2bf848f9abb67) Thanks [@marschhuynh](https://github.com/marschhuynh)! - fix: add onUsage callback to prevent empty assistant chunks during streaming

## 1.13.0

### Minor Changes

- [`a079ea9`](https://github.com/marschhuynh/nuvin-space/commit/a079ea9b40c2ba57e2d6fbf8acd7289bd3acccf2) Thanks [@marschhuynh](https://github.com/marschhuynh)! - feat: add thinking parameter support; add ZAI Anthropic-compatible provider; handle reasoning_content in streaming

- [`ef1783b`](https://github.com/marschhuynh/nuvin-space/commit/ef1783b5846dc5082a73d0ea8ffcce87ae3aaa85) Thanks [@marschhuynh](https://github.com/marschhuynh)! - feat: add thinking parameter support with budget tokens; improve thinking UI labels; handle reasoning_content in streaming

## 1.12.0

### Minor Changes

- [`65c048f`](https://github.com/marschhuynh/nuvin-space/commit/65c048fa33a22a24eb2f509528d50b554a4a1469) Thanks [@marschhuynh](https://github.com/marschhuynh)! - Add Anthropic-compatible provider support; add MiniMax provider; update provider configurations

- [`42810b7`](https://github.com/marschhuynh/nuvin-space/commit/42810b71183d8df1e22054ef6433e503a277ecdc) Thanks [@marschhuynh](https://github.com/marschhuynh)! - Execute bypass tools in parallel during tool approval flow; preserve full metadata

### Patch Changes

- [`66ae3f8`](https://github.com/marschhuynh/nuvin-space/commit/66ae3f8009805a8a5141dd10db6fc026066556c3) Thanks [@marschhuynh](https://github.com/marschhuynh)! - Add Zod-based tool parameter validation, MCP tool validation, and improved error handling

## 1.11.1

### Patch Changes

- [`1bdf26f`](https://github.com/marschhuynh/nuvin-space/commit/1bdf26f98d7d29b225d7227d87fd4e9d05f7eb83) Thanks [@marschhuynh](https://github.com/marschhuynh)! - fix: replace hardcoded colors with theme tokens; add fetch function to Anthropic transport; remove ink overrides

## 1.11.0

### Minor Changes

- [`e8add82`](https://github.com/marschhuynh/nuvin-space/commit/e8add829649db481ab0f15422b90ee63c47fe951) Thanks [@marschhuynh](https://github.com/marschhuynh)! - add LLMErrorTransport and improve error classification with expanded retryable status codes

- [`9d1b7ea`](https://github.com/marschhuynh/nuvin-space/commit/9d1b7ea2de6c8e38713ec5c8316d2c9804d45b93) Thanks [@marschhuynh](https://github.com/marschhuynh)! - rename DirLsTool to LsTool, dir_ls to ls_tool, convert output to YAML

- [`f72d754`](https://github.com/marschhuynh/nuvin-space/commit/f72d754c5b99fe10b7fd03ce807e8957b49e604a) Thanks [@marschhuynh](https://github.com/marschhuynh)! - rename glob to glob_tool, grep to grep_tool; improve color calculation accuracy and theme colors

## 1.10.0

### Minor Changes

- [`7ab770f`](https://github.com/marschhuynh/nuvin-space/commit/7ab770f4b65e2fb6745db6e2419ea66d3d679de8) Thanks [@marschhuynh](https://github.com/marschhuynh)! - Add glob and grep tools for advanced file and content searching

## 1.9.4

### Patch Changes

- [`59a4717`](https://github.com/marschhuynh/nuvin-space/commit/59a4717de2688be1f2e1e1a9f18ecbbb9bc0fcbf) Thanks [@marschhuynh](https://github.com/marschhuynh)! - Improve BashTool cleanup with proper timer clearing, event listener removal, and comprehensive finally block to prevent resource leaks.

- [`59a4717`](https://github.com/marschhuynh/nuvin-space/commit/59a4717de2688be1f2e1e1a9f18ecbbb9bc0fcbf) Thanks [@marschhuynh](https://github.com/marschhuynh)! - Add Windows platform support for BashTool with platform-specific process killing and detached process spawning.

## 1.9.3

### Patch Changes

- [`1844522`](https://github.com/marschhuynh/nuvin-space/commit/1844522d698a177bd0a54e1877904701b2fa2da7) Thanks [@marschhuynh](https://github.com/marschhuynh)! - Add support for Zai's glm-4.7 model with context window of 200k and max output of 128k tokens.

## 1.9.2

### Patch Changes

- [`cd1246c`](https://github.com/marschhuynh/nuvin-space/commit/cd1246cf84c94e58deacaab254b324af08ecc3e9) Thanks [@marschhuynh](https://github.com/marschhuynh)! - fix: update contextWindowUsage in real-time when LLM call completes

  - Auto-calculate contextWindowUsage in recordLLMCall when contextWindowLimit is set
  - Set contextWindowLimit before orchestrator.send() to enable immediate usage updates
  - Fixes delayed contextWindowUsage display that only updated after request completion

## 1.9.1

### Patch Changes

- [`6cf8ad9`](https://github.com/marschhuynh/nuvin-space/commit/6cf8ad92d5bf286f4a29c4856a086d2c5610e106) Thanks [@marschhuynh](https://github.com/marschhuynh)! - refactor: consolidate tool metadata types to eliminate duplication

## 1.9.0

### Minor Changes

- [`dd9a07b`](https://github.com/marschhuynh/nuvin-space/commit/dd9a07b6f1071cfc439817b71678226fa0ad729b) Thanks [@marschhuynh](https://github.com/marschhuynh)! - Add tool approval edit instruction feature - allows users to provide feedback instead of approving/denying tool calls

## 1.8.0

### Minor Changes

- [`7a47468`](https://github.com/marschhuynh/nuvin-space/commit/7a4746890f2630232a9ae1b595f2b87804394e00) Thanks [@marschhuynh](https://github.com/marschhuynh)! - Upgrade nuvin core to support custom command

## 1.7.2

### Patch Changes

- [`3f7baea`](https://github.com/marschhuynh/nuvin-space/commit/3f7baea91f9866d6ebcf7dee471cb84af9f3a18c) Thanks [@marschhuynh](https://github.com/marschhuynh)! - **MCP Configuration Consolidation & CLI Commands**

  **Breaking Changes:**

  - Removed `--mcp-config` CLI flag
  - Removed `mcpConfigPath` config field
  - Removed legacy `.nuvin_mcp.json` file support
  - MCP config is now consolidated into main CLI config under `mcp.servers`

  **New Features:**

  - Added `nuvin mcp` subcommand for server management:
    - `nuvin mcp list` - List configured servers
    - `nuvin mcp add <name>` - Add new server via cmdline
    - `nuvin mcp remove <name>` - Remove server
    - `nuvin mcp show <name>` - Display server details
    - `nuvin mcp enable/disable <name>` - Toggle server status
    - `nuvin mcp test <name>` - Test server connection

  **Improvements:**

  - Enhanced MCP modal with server enable/disable toggle (Space key)
  - Added server reconnection functionality (R key)
  - Better error handling and status display in MCP UI
  - Config manager now supports auto scope detection for optimal persistence
  - Added atomic file writes and mutex protection for concurrent updates
  - Tool permissions now stored in `mcp.allowedTools` config key
  - Deprecated MCP config types moved to nuvin-core for backward compatibility

## 1.7.1

### Patch Changes

- [`a679a4b`](https://github.com/marschhuynh/nuvin-space/commit/a679a4b3d2e89508532d548022a38ebd6e98e048) Thanks [@marschhuynh](https://github.com/marschhuynh)! - Deduplicate models by ID in getModels for all LLM providers (GitHub, Anthropic, and custom providers)

## 1.7.0

### Minor Changes

- [`2bbcbb1`](https://github.com/marschhuynh/nuvin-space/commit/2bbcbb1288d7daf958ff565096ab001dc4834c2f) Thanks [@marschhuynh](https://github.com/marschhuynh)! - Major UI/UX improvements and tool system refactoring

  ### Tool Registry System

  - Added centralized tool registry for managing tool metadata, display names, status strategies, parameter renderers, and collapse behavior
  - Eliminates scattered tool name mapping and provides single source of truth
  - Supports extensibility for new tools and consistent behavior across the application

  ### Enhanced Tool Approval Flow

  - Integrated proper denied tool handling with visual feedback
  - Added `isAwaitingApproval` state for better user experience
  - Enhanced error categorization with `ErrorReason.Denied`
  - Improved tool result event emission for denied operations

  ### Component Architecture Improvements

  - **BaseRenderer**: Created reusable base component for tool result rendering with configurable truncation modes
  - **ParamLayout**: Extracted common layout logic for consistent parameter display styling
  - **Constants Centralization**: Added `LAYOUT` and `TRUNCATION` constants for uniform spacing and content limits

  ### UI/UX Enhancements

  - Refined message spacing and visual hierarchy
  - Improved truncation behavior for different content types (head vs tail modes)
  - Better visual distinction between tool execution states
  - Consistent border styling and layout across all tool displays

  ### Core Functionality

  - Added streaming support for sub-agent task delegation
  - Made `max_tokens` parameter conditional in LLM API calls for efficiency
  - Enhanced agent template configuration with streaming options

  ### Code Quality

  - Eliminated code duplication across parameter renderers
  - Improved TypeScript interfaces and type safety
  - Better component composition and reusability
  - Enhanced maintainability through centralized configuration

## 1.6.2

### Patch Changes

- [`2642fde`](https://github.com/marschhuynh/nuvin-space/commit/2642fdeb239dfec1dc005d5e8b4e9834091be582) Thanks [@marschhuynh](https://github.com/marschhuynh)! - refactor(transports): extract AnthropicAuthTransport from LLM class

  - Move OAuth token refresh logic to dedicated `AnthropicAuthTransport` class
  - Add `createFetchFunction()` for AI SDK integration
  - Add `createRetryTransport()` factory method
  - Export from transports index
  - Simplify `AnthropicAISDKLLM` to use the new transport

## 1.6.1

### Patch Changes

- [`6f5ad8d`](https://github.com/marschhuynh/nuvin-space/commit/6f5ad8d79100df0bccf2eae713321c42e457bbe0) Thanks [@marschhuynh](https://github.com/marschhuynh)! - fix(agent-manager): make event callbacks async

  - Update all `eventCallback` invocations to use `await`
  - Ensures proper event sequencing for sub-agent lifecycle events

- [`6f5ad8d`](https://github.com/marschhuynh/nuvin-space/commit/6f5ad8d79100df0bccf2eae713321c42e457bbe0) Thanks [@marschhuynh](https://github.com/marschhuynh)! - feat(retry): move retry logic to transport layer with exponential backoff

  **Core Changes:**

  - Add `RetryTransport` with exponential backoff and jitter (maxRetries: 10, baseDelay: 1s, maxDelay: 60s)
  - Respects `Retry-After` headers from API responses
  - Configurable callbacks: `onRetry`, `onExhausted`, `shouldRetry`
  - Error classification: retry on 429, 500, 502, 503, 504, network errors, timeouts
  - Add `AbortError` for user-initiated cancellations
  - Export retry utilities: `isRetryableError`, `isRetryableStatusCode`, `calculateBackoff`, `parseRetryAfterHeader`
  - Add `retry?: Partial<RetryConfig>` option to `BaseLLMOptions`
  - `GenericLLM` and `GithubLLM` wrap transports with `RetryTransport` when retry config provided
  - Remove `retry?: boolean` option from `SendMessageOptions`

  **CLI Changes:**

  - Integrate retry configuration into `LLMFactory` with default retry callbacks
  - Show retry notifications in UI with countdown timer
  - Remove application-layer retry logic from `OrchestratorManager.send()`
  - Delete obsolete `retry()` method from OrchestratorManager
  - Deprecate CLI retry utilities (`retry-utils.ts`, `error-classification.ts`)

## 1.6.0

### Minor Changes

- [`d896922`](https://github.com/marschhuynh/nuvin-space/commit/d896922e3e4cb6bcc143344574fbd47dd22382d6) Thanks [@marschhuynh](https://github.com/marschhuynh)! - feat: stream sub-agent metrics to UI in real-time

  - Add `SubAgentMetrics` event type to stream metrics during sub-agent execution
  - Create metrics port in AgentManager to emit live metrics (llmCallCount, totalTokens, totalCost)
  - Handle `SubAgentMetrics` event in CLI eventProcessor to update SubAgentState
  - Display live metrics in SubAgentActivity during "Working..." state
  - Show final metrics in ToolResultView when sub-agent completes (calls, tokens, cost, duration)
  - Increase default maxTokens for sub-agents from 4000 to 64000

- [`3f86c26`](https://github.com/marschhuynh/nuvin-space/commit/3f86c268c933589f9609e2bbaae41e369821e556) Thanks [@marschhuynh](https://github.com/marschhuynh)! - # Tool Typing Refactor - Complete Implementation

  ## Breaking Changes

  ### 1. ToolExecutionResult is now a Discriminated Union

  `ToolExecutionResult` has been converted from a simple type to a discriminated union for better type safety:

  ```typescript
  // Before
  type ToolExecutionResult = {
    status: 'success' | 'error';
    type: 'text' | 'json';
    result: string | object;  // No type safety
    metadata?: Record<string, unknown>;
  }

  // After
  type ToolExecutionResult =
    | { status: 'success'; type: 'text'; result: string; ... }
    | { status: 'success'; type: 'json'; result: Record<string, unknown> | unknown[]; ... }
    | { status: 'error'; type: 'text'; result: string; ... }
  ```

  **Migration**: Replace `typeof result.result === 'string'` checks with `result.type === 'text'`

  ### 2. DirLsTool Now Returns JSON

  `DirLsTool` now returns structured JSON instead of formatted text:

  ```typescript
  // Before (text)
  "drwxr-xr-x  4096 Dec 8 16:32 src/"

  // After (JSON)
  {
    "path": ".",
    "entries": [
      { "name": "src", "type": "directory", "size": 4096, ... }
    ],
    "truncated": false,
    "total": 1
  }
  ```

  **Impact**: LLMs can now consume structured data. CLI updated to handle both formats.

  ### 3. Helper Functions Changed

  - Removed: `ok(result)` function
  - Added: `okText(result, metadata)` and `okJson(result, metadata)`

  ```typescript
  // Before
  return ok("success message", { someData: 123 });

  // After
  return okText("success message", { someData: 123 });
  // or
  return okJson({ data: "value" }, { someData: 123 });
  ```

  ## New Features

  ### 1. Tool-Specific Type Guards

  All 9 tools now have specific type guards for their results:

  ```typescript
  import {
    isBashSuccess,
    isFileReadSuccess,
    isDirLsSuccess,
    isAssignSuccess,
    // ... etc
  } from "@nuvin/nuvin-core";

  if (isBashSuccess(result)) {
    // result.metadata has CommandMetadata type
    const exitCode = result.metadata?.code; // Type-safe!
  }
  ```

  ### 2. Tool Parameter Types

  Added typed parameter definitions for all tools:

  ```typescript
  import {
    type BashToolArgs,
    type FileReadArgs,
    parseToolArguments,
    isBashToolArgs,
  } from "@nuvin/nuvin-core";

  const args = parseToolArguments(toolCall.arguments);
  if (isBashToolArgs(args)) {
    console.log(args.cmd); // Type-safe!
  }
  ```

  ### 3. Sub-Agent Types in Core

  Moved `SubAgentState` and related types to `@nuvin/nuvin-core`:

  ```typescript
  import { type SubAgentState } from "@nuvin/nuvin-core";
  ```

  ### 4. Enhanced Metadata Types

  - `CommandMetadata` - For bash tool (cwd, code, signal, etc.)
  - `FileMetadata` - For file operations (path, size, timestamps)
  - `LineRangeMetadata` - For file read ranges
  - `DelegationMetadata` - For sub-agent execution (includes MetricsSnapshot with cost!)

  ### 5. Metrics Passthrough for Sub-Agents

  AssignTool now returns complete metrics including cost tracking:

  ```typescript
  if (isAssignSuccess(result)) {
    const cost = result.metadata.metrics?.totalCost; // $0.0042
    const tokens = result.metadata.metrics?.totalTokens; // 850
    const duration = result.metadata.executionTimeMs; // 2500
  }
  ```

  ## Improvements

  ### Type Safety

  - ✅ No more `any` or unsafe casts in tool result handling
  - ✅ Full TypeScript type narrowing with discriminated unions
  - ✅ IntelliSense support for tool-specific metadata
  - ✅ Compile-time errors for typos in metadata access

  ### CLI Enhancements

  - Enhanced status messages with rich metadata display:

    - `bash_tool "npm test" (exit 0)`
    - `file_new "package.json" (1234 bytes)`
    - `web_fetch "https://example.com" (200, 15234 bytes)`
    - `todo_write "Updated (3/5 - 60%)"`
    - `assign_task "Done • 5 tools • 850 tokens • $0.0042 • 2500ms"`

  - Sub-agent tool calls now show tool-specific parameters:
    - `✓ bash_tool "npm test" (150ms)`
    - `✓ file_read "src/index.ts (lines 1-50)" (25ms)`
    - `✓ web_search "TypeScript best practices (10 results)" (500ms)`

  ### Developer Experience

  - Type-safe metadata access throughout codebase
  - Better error messages with errorReason in metadata
  - Comprehensive JSDoc with examples on key tools
  - Consistent patterns across all tool implementations

  ## Files Changed

  ### Core Package (`@nuvin/nuvin-core`)

  **New Files:**

  - `src/tools/metadata-types.ts` - Common metadata type definitions
  - `src/tools/type-guards.ts` - Generic type guards (isSuccess, isError, etc.)
  - `src/tools/tool-type-guards.ts` - Tool-specific type guards
  - `src/tools/tool-params.ts` - Tool parameter types and type guards
  - `src/sub-agent-types.ts` - Sub-agent state and tool call types

  **Modified Files:**

  - `src/tools/types.ts` - Discriminated union for ExecResult
  - `src/tools/result-helpers.ts` - okText(), okJson(), err() helpers
  - `src/ports.ts` - ToolExecutionResult as discriminated union
  - `src/orchestrator.ts` - Use type discriminators
  - `src/agent-manager.ts` - Capture metrics snapshot
  - `src/delegation/DefaultDelegationResultFormatter.ts` - Pass through metrics
  - `src/mcp/mcp-tools.ts` - Support discriminated unions
  - All 9 tool files - Tool-specific result types and metadata
  - `src/index.ts` - Export all new types and helpers

  ### CLI Package (`@nuvin/nuvin-cli`)

  **Modified Files:**

  - `source/components/ToolResultView/ToolResultView.tsx` - Use type guards, enhanced status messages
  - `source/components/ToolResultView/SubAgentActivity.tsx` - Tool-specific parameter display
  - `source/components/ToolResultView/renderers/FileReadRenderer.tsx` - Type guards
  - `source/components/ToolResultView/renderers/FileEditRenderer.tsx` - Type guards
  - `source/components/ToolResultView/utils.ts` - Type discriminators
  - `source/utils/eventProcessor.ts` - Import SubAgentState from core

  ## Testing

  - ✅ All 411 tests passing
  - ✅ TypeScript compilation clean (no errors)
  - ✅ No regressions in tool execution
  - ✅ Full type safety verified

  ## Documentation

  New documentation files:

  - `IMPLEMENTATION_STATUS.md` - Phase tracking and verification
  - `IMPLEMENTATION_COMPLETE.md` - Complete summary with examples
  - `TYPE_GUARD_EXPLANATION.md` - Technical explanation of type system
  - `TYPE_SAFE_METADATA_USAGE.md` - CLI usage examples
  - `SUB_AGENT_TOOL_RENDERING.md` - Sub-agent display enhancements
  - `TOOL_PARAMS_AND_SUB_AGENT_TYPES.md` - Architecture documentation

  ## Upgrade Guide

  ### For Tool Result Consumers

  ```typescript
  // ❌ Old
  if (typeof result.result === "string") {
    const content = result.result;
  }

  // ✅ New
  if (result.type === "text") {
    const content = result.result; // TypeScript knows it's string
  }

  // ✅ Better - use type guards
  import { isFileReadSuccess } from "@nuvin/nuvin-core";

  if (isFileReadSuccess(result)) {
    const content = result.result; // Fully typed!
    const path = result.metadata?.path; // Type-safe!
  }
  ```

  ### For DirLsTool Results

  ```typescript
  // ❌ Old
  const lines = result.result.split("\n"); // Parsing text

  // ✅ New
  if (isDirLsSuccess(result)) {
    const entries = result.result.entries; // Structured data!
    entries.forEach((entry) => {
      console.log(entry.name, entry.type, entry.size);
    });
  }
  ```

  ### For Tool Implementations

  ```typescript
  // ❌ Old
  return ok("Success message", { data: 123 });

  // ✅ New - use specific helpers
  return okText("Success message", { data: 123 });
  // or
  return okJson({ items: [...] }, { count: 10 });
  ```

  ## Benefits Summary

  1. **Type Safety**: 100% type-safe tool result handling
  2. **Better DX**: Full IntelliSense and compile-time checks
  3. **Observability**: Complete metrics with cost tracking
  4. **Maintainability**: Single source of truth for types
  5. **Extensibility**: Easy to add new tools with type safety

  This is a foundational improvement that enables better tooling, safer code, and improved observability across the entire codebase.

## 1.5.2

### Patch Changes

- [`dadaace`](https://github.com/marschhuynh/nuvin-space/commit/dadaace3556ea0c9423aa54b37202b5ac67de533) Thanks [@marschhuynh](https://github.com/marschhuynh)! - fix(core): improve timeout handling in sub-agent execution

  - Fix timeout to properly abort downstream operations (LLM calls, tool executions)
  - Use AbortSignal.any() to combine user abort signal with timeout signal
  - Use Promise.race() for immediate rejection on abort or timeout
  - Add comprehensive test suite for sub-agent timeout with running bash tools
  - Test abort vs timeout priority and signal propagation to tools

  Previously, timeout only rejected the promise but didn't cancel running operations, leading to potential resource leaks. Now timeout properly propagates abort signal to orchestrator and all downstream tools.

## 1.5.1

### Patch Changes

- [`0ff7e19`](https://github.com/marschhuynh/nuvin-space/commit/0ff7e1939d0c6eca1edd36ae9a03369446207994) Thanks [@marschhuynh](https://github.com/marschhuynh)! - Refactor HTTP transport layer and improve test coverage

  **Transport Changes:**

  - Unified `postJson` and `postStream` into single `post()` method
  - Simplified transport interface from 3 methods to 2 (get, post)
  - Updated BaseLLM to use unified post method for both streaming and non-streaming requests
  - Updated all transport implementations (BaseBearerAuthTransport, GithubAuthTransport, FetchTransport)

  **Test Improvements:**

  - Enhanced test coverage with proper TypeScript type safety
  - Fixed all test mocking to use proper vi.spyOn patterns instead of direct mock assignments
  - Added proper beforeEach/afterEach cleanup in all test files
  - Enabled typecheck in vitest configuration
  - Updated test configuration: `vitest --typecheck` in package.json
  - Fixed all type errors in test files
  - Improved test isolation with proper mock setup and teardown

  **Bug Fixes:**

  - Increased retry count from 3 to 10 in AnthropicAISDKLLM for better reliability
  - Fixed formatting inconsistencies across codebase

## 1.5.0

### Minor Changes

- [`b5a0214`](https://github.com/marschhuynh/nuvin-space/commit/b5a0214b6437261edb8c024ed36d44be30a45e87) Thanks [@marschhuynh](https://github.com/marschhuynh)! - Add getModels support for Anthropic provider

  **Core Changes:**

  - Implement `getModels()` method in `AnthropicAISDKLLM` class
  - Fetch models from Anthropic API endpoint: `https://api.anthropic.com/v1/models`
  - Support both API key and OAuth authentication for model fetching
  - Handle OAuth token refresh on 401/403 errors during model listing
  - Add Anthropic case to `normalizeModelLimits()` function
  - Use `display_name` field from API response for Anthropic model names
  - Update fallback limits with all current Claude models (Opus 4.5, Haiku 4.5, Sonnet 4.5, etc.)

  **CLI Changes:**

  - Update `LLMFactory.getModels()` to support Anthropic OAuth credentials
  - Allow model fetching with either API key or OAuth authentication for Anthropic

  **Tests:**

  - Add comprehensive unit tests for getModels functionality
  - Add integration tests for real API calls (skipped without credentials)
  - All existing tests continue to pass

### Patch Changes

- [`ec26a90`](https://github.com/marschhuynh/nuvin-space/commit/ec26a9092e872ca0ee2769e04047936a9045a652) Thanks [@marschhuynh](https://github.com/marschhuynh)! - Refactor usage data transformation to provider-owned pattern

  - Add `transformUsage()` method to BaseLLM for generic OpenAI/Anthropic field name mapping
  - Implement provider-specific `transformUsage()` in AnthropicAISDKLLM, GithubLLM
  - Remove centralized `normalizeUsage()` utility in favor of provider-owned transformation
  - Improve Anthropic token calculation: `prompt_tokens = input_tokens + cache_creation_input_tokens + cache_read_input_tokens`
  - Ensure accurate context window tracking across all providers

## 1.4.4

### Patch Changes

- [`7e9140f`](https://github.com/marschhuynh/nuvin-space/commit/7e9140f306fa1a68bb50474003d58bcf561d15c8) Thanks [@marschhuynh](https://github.com/marschhuynh)! - Refactor /new and /summary commands to preserve session history

  **Session Management:**

  - `/new` command now creates new session via `OrchestratorManager.createNewConversation()`
  - Replace `ui:new:conversation` event with `conversation:created` event
  - `ToolApprovalContext` listens to `conversation:created` to clear session-approved tools

  **Auto-Summary & /summary Refactoring:**

  - Auto-summary (at 95% context window) now creates a new session instead of replacing memory in-place
  - `/summary` and `/summary beta` commands create new sessions with summary, preserving original
  - Add `summarizedFrom` field to `ConversationMetadata` to track session lineage
  - Add `summarizeAndCreateNewSession()` and `compressAndCreateNewSession()` methods to share logic

  **Test Fixes:**

  - Fix `commands.test.ts`: use `vi.hoisted()` for proper mock hoisting
  - Fix `context-window-auto-summary.test.ts`: update constructor call, fix types
  - Apply biome formatting to all test files

## 1.4.3

### Patch Changes

- [`e59a2c5`](https://github.com/marschhuynh/nuvin-space/commit/e59a2c5e5e9fd1c39c553e2d6c814063070c6feb) Thanks [@marschhuynh](https://github.com/marschhuynh)! - Refactor project structure: move all source files into `src/` directory for better organization and standard TypeScript project layout

## 1.4.2

### Patch Changes

- [`239c907`](https://github.com/marschhuynh/nuvin-space/commit/239c9073545c42b1ed4c9341f15a6a9ad9bc943f) Thanks [@marschhuynh](https://github.com/marschhuynh)! - Update dependencies to latest versions

## 1.4.1

### Patch Changes

- [`6a41065`](https://github.com/marschhuynh/nuvin-space/commit/6a410656e38d5b5020c42e5b94bc83e0ab7900d3) Thanks [@marschhuynh](https://github.com/marschhuynh)! - Update logger level to error for better log management and reduced noise

## 1.4.0

### Minor Changes

- [`2a2ab84`](https://github.com/marschhuynh/nuvin-space/commit/2a2ab8483149e4f1ce56473bb4b40bcd7144b979) Thanks [@marschhuynh](https://github.com/marschhuynh)! - refactor(core/cli): migrate to dynamic provider discovery

  - Replace static provider lists with dynamic discovery from core
  - Add getProviderLabel() to core for centralized label management
  - Update provider config schema: name → key field with optional label
  - Enhance InitialConfigSetup to use available providers dynamically
  - Remove hardcoded PROVIDER\_\* constants in favor of runtime discovery

- [`2a2ab84`](https://github.com/marschhuynh/nuvin-space/commit/2a2ab8483149e4f1ce56473bb4b40bcd7144b979) Thanks [@marschhuynh](https://github.com/marschhuynh)! - refactor(core/cli): move string utilities to core package

  - Remove CLI utils.ts wrapper file
  - Update imports to use @nuvin/nuvin-core utilities directly
  - Move stripAnsiAndControls and canonicalizeTerminalPaste to core exports
  - Update test imports to reference core package utilities
  - Ensure consistent utility usage across packages

## 1.3.2

### Patch Changes

- [`5b164c5`](https://github.com/marschhuynh/nuvin-space/commit/5b164c5215070d7b2fa1429bddf5bbfbf938832a) Thanks [@marschhuynh](https://github.com/marschhuynh)! - - Support kimi coding

## 1.3.1

### Patch Changes

- [`18ebf8f`](https://github.com/marschhuynh/nuvin-space/commit/18ebf8f3967c86144fa51112fac6ebd955be1d29) Thanks [@marschhuynh](https://github.com/marschhuynh)! - - Support kimi coding

## 1.3.0

### Minor Changes

- [`7bb25af`](https://github.com/marschhuynh/nuvin-space/commit/7bb25af570fbbed6b753cbf7c382da84e68bcf2e) Thanks [@marschhuynh](https://github.com/marschhuynh)! - Refactor session metrics and orchestrator architecture

  - Move metrics tracking to dedicated port in orchestrator
  - Add model limits support for context window management
  - Simplify orchestrator dependency injection with optional deps
  - Remove deprecated setMemory() from CommandRegistry
  - Fix all related tests

- [`459c879`](https://github.com/marschhuynh/nuvin-space/commit/459c8797169fa59b7d9186baf216c131d8f182d4) Thanks [@marschhuynh](https://github.com/marschhuynh)! - Refactor session metrics to be session-oriented

  - **Breaking**: Remove `SessionMetricsTracker` from `@nuvin/nuvin-core` (unused)
  - **Breaking**: `SessionMetricsService` methods now require explicit `conversationId` parameter
  - Add `SessionBoundMetricsPort` adapter to bind metrics to specific sessions
  - Fix `contextWindowUsage` not displaying - now correctly tracks and displays percentage in Footer
  - Update subscriber callback to include `conversationId` for filtering
  - Ensure all metrics operations use consistent session ID
  - Update command handlers (`/clear`, `/new`, `/summary`) to pass session ID explicitly

## 1.2.0

### Minor Changes

- [`de16725`](https://github.com/marschhuynh/nuvin-space/commit/de16725d520098d68355a4cd2b2e3f08268165d3) Thanks [@marschhuynh](https://github.com/marschhuynh)! - feat: Enhance LLM streaming and Github provider

  - **Core**: Improved `BaseLLM` streaming handling to support unknown fields (e.g. reasoning metadata) dynamically.
  - **Core**: Better tool call merging and usage tracking in streaming responses.
  - **GitHub Provider**: Updates to GitHub transport and model definitions.
  - **CLI**: Updated LLM factory and orchestrator to leverage new core capabilities.

## 1.1.2

### Patch Changes

- [`3f7a1e2`](https://github.com/marschhuynh/nuvin-space/commit/3f7a1e2297bfe7e3602749afdbb3435c30eb9868) Thanks [@marschhuynh](https://github.com/marschhuynh)! - Fix race condition in event persistence causing streaming chunk events to be lost. Serialize writes using promise queue to prevent concurrent overwrites.

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
