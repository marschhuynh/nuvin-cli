# @nuvin/nuvin-cli

## 1.37.0-rc.3

### Patch Changes

- [#178](https://github.com/marschhuynh/nuvin-cli/pull/178) [`09fceca`](https://github.com/marschhuynh/nuvin-space/commit/09fceca0e83333278a730985c816d7396c877fc5) Thanks [@marschhuynh](https://github.com/marschhuynh)! - Fix all biome lint issues: remove non-null assertions, add explicit types, fix React keys, resolve dependency arrays, suppress conflicting regex rules

## 1.37.0-rc.2

### Minor Changes

- [`93a158a`](https://github.com/marschhuynh/nuvin-space/commit/93a158a6cf8083bd4f2c7f1a8c3108ca1575470c) Thanks [@marschhuynh](https://github.com/marschhuynh)! - feat: inject available skills into system prompt for agent awareness

### Patch Changes

- [`0681187`](https://github.com/marschhuynh/nuvin-space/commit/06811877eb259c52a154b24e57b5bfd418078e13) Thanks [@marschhuynh](https://github.com/marschhuynh)! - Limit tool approval edit input to 3 lines with scrolling

- Updated dependencies [[`93a158a`](https://github.com/marschhuynh/nuvin-space/commit/93a158a6cf8083bd4f2c7f1a8c3108ca1575470c)]:
  - @nuvin/nuvin-core@2.0.0-rc.1

## 1.37.0-rc.1

### Patch Changes

- [`03303e3`](https://github.com/marschhuynh/nuvin-space/commit/03303e35524abd956e30a4cf5369b37e831b99f0) Thanks [@marschhuynh](https://github.com/marschhuynh)! - fix(cli): prevent update when RC version is newer than latest stable (e.g., 1.37.0-rc.0 → 1.36.0)

## 1.37.0-rc.0

### Minor Changes

- [`8e9e8a9`](https://github.com/marschhuynh/nuvin-space/commit/8e9e8a92edb03f0e914905c0c34d566027e30f0b) Thanks [@marschhuynh](https://github.com/marschhuynh)! - feat(acp): implement ACP server mode with full session flow

  - Add ACP JSON-RPC server over stdio with initialize, session/new, session/load, session/prompt, session/cancel
  - Implement model resolver with provider-aware model enumeration and humanized display names
  - Add tool formatter for descriptive tool call titles and kind inference
  - Wire slash command support in ACP mode via command registry
  - Add E2E test script for ACP validation
  - Add available commands update notification
  - Filter ask_user_tool from enabled tools in ACP mode

- [`104722e`](https://github.com/marschhuynh/nuvin-space/commit/104722ec277a914ac1e7ecad8c9fd85ddf233979) Thanks [@marschhuynh](https://github.com/marschhuynh)! - feat(acp): add session/list endpoint and improve history handling

  - Add session/list with pagination support (50 sessions per page)
  - Support both default and cli history message keys
  - Extract text from structured message parts
  - Update agent capabilities to match ACP spec
  - Use getVersion() for dynamic version reporting

- [`9696dd4`](https://github.com/marschhuynh/nuvin-space/commit/9696dd474994e75aec104e12786d6ef26bd1ca50) Thanks [@marschhuynh](https://github.com/marschhuynh)! - feat(cli): add auto-summary continuation and improve summary prompt

  - Auto-submit continuation turn after context window auto-summary
  - Add skipAutoSummaryCheck option to prevent recursive checks
  - Improve summary prompt for better session continuity
  - Lower auto-summary threshold to 30% for earlier intervention

### Patch Changes

- [`d124700`](https://github.com/marschhuynh/nuvin-space/commit/d124700cf1b4296b784bab734501e56f91f5a300) Thanks [@marschhuynh](https://github.com/marschhuynh)! - Improve Responses API compatibility mapping and provider wiring.

- [`3df777d`](https://github.com/marschhuynh/nuvin-space/commit/3df777d839ebca303be6c6eb1d5845042f9297ec) Thanks [@marschhuynh](https://github.com/marschhuynh)! - fix(cli): detect update when RC version transitions to stable (e.g., 1.0.0-rc.1 → 1.0.0)

- Updated dependencies [[`9696dd4`](https://github.com/marschhuynh/nuvin-space/commit/9696dd474994e75aec104e12786d6ef26bd1ca50), [`d124700`](https://github.com/marschhuynh/nuvin-space/commit/d124700cf1b4296b784bab734501e56f91f5a300), [`8e9e8a9`](https://github.com/marschhuynh/nuvin-space/commit/8e9e8a92edb03f0e914905c0c34d566027e30f0b)]:
  - @nuvin/nuvin-core@2.0.0-rc.0

## 1.36.0

### Minor Changes

- [`baee016`](https://github.com/marschhuynh/nuvin-space/commit/baee0168c0fe5cca77c1b6683dbc9c729e1a64f6) Thanks [@marschhuynh](https://github.com/marschhuynh)! - Add display support for ask_user_tool with question count and answer rendering.

- [`ffb522d`](https://github.com/marschhuynh/nuvin-space/commit/ffb522d5c91c80d1fc54d5318d9f70c0c89e10f8) Thanks [@marschhuynh](https://github.com/marschhuynh)! - fix(cli): allow editing all built-in agents via auto-copy to global location

- [`65ca384`](https://github.com/marschhuynh/nuvin-space/commit/65ca384d91f80ceef7618e866cd56bf8dd11472c) Thanks [@marschhuynh](https://github.com/marschhuynh)! - Add hook system for intercepting agent lifecycle events (pre/post-tool, session start/end). Supports bash command hooks with pattern matching, JSON control flow, and integration with Orchestrator.

- [`354a1c7`](https://github.com/marschhuynh/nuvin-space/commit/354a1c75b088b2df5ad274a29558c566049a7ff1) Thanks [@marschhuynh](https://github.com/marschhuynh)! - Add max_tokens field to agent configuration

- [`86aea13`](https://github.com/marschhuynh/nuvin-space/commit/86aea13044d8069ef878946dc4d3d658e433d5bd) Thanks [@marschhuynh](https://github.com/marschhuynh)! - refactor(prompt): restructure system prompt to XML format with modular agent definitions

- [`a916738`](https://github.com/marschhuynh/nuvin-space/commit/a9167387ba32d8958aca22bea4cdc7185a986106) Thanks [@marschhuynh](https://github.com/marschhuynh)! - Redesign agent creation TUI: rename systemPrompt to instructions, simplify state machine, improve keyboard navigation

- [`f0c801c`](https://github.com/marschhuynh/nuvin-space/commit/f0c801cd5230fcdacbe337188d4d457fb62c51aa) Thanks [@marschhuynh](https://github.com/marschhuynh)! - Refactor tool call rendering with comprehensive improvements:

  - Show last lines in result truncation instead of first for better visibility
  - Fix denied/edited states to avoid duplicate content display
  - Add per-tool excludeParams config for cleaner parameter display
  - Use dynamic tool names in SubAgentActivity (Reading/Read/Read failed)
  - Fix abort errorReason to return 'aborted' instead of 'unknown'
  - Show actual error messages in sub-agent status lines

### Patch Changes

- [`458f15a`](https://github.com/marschhuynh/nuvin-space/commit/458f15a831ca7f5d4c54fabfbdf5a2a9e67fcdd4) Thanks [@marschhuynh](https://github.com/marschhuynh)! - ```

  3. Message should be a compact, single sentence (imperative), e.g. `Refresh LSP diagnostics after file edits.`
  4. Commit with conventional commits (e.g. `fix: ...`, `feat: ...`, `chore: ...`).

- [`94ba248`](https://github.com/marschhuynh/nuvin-space/commit/94ba248b7a7ac414babfbe04c2bb0ce6ff3811e8) Thanks [@marschhuynh](https://github.com/marschhuynh)! - Refactor agent imports to use build-time imports instead of runtime file reading

- [#165](https://github.com/marschhuynh/nuvin-cli/pull/165) [`ae426ba`](https://github.com/marschhuynh/nuvin-space/commit/ae426bab43077a14759e692d6d6db703f883935e) Thanks [@marschhuynh](https://github.com/marschhuynh)! - Add MCP image content extraction and base64 image detection for tool results

- [`d52de6c`](https://github.com/marschhuynh/nuvin-space/commit/d52de6cb325b69ce43702b8411e944d1e5d7c877) Thanks [@marschhuynh](https://github.com/marschhuynh)! - feat(bash): add ignoreOutput option to discard stdout/stderr and return only exit code; update prompt formatting

- [`3d12819`](https://github.com/marschhuynh/nuvin-space/commit/3d128190f8c6369ca105238c941e9e175f31d7d9) Thanks [@marschhuynh](https://github.com/marschhuynh)! - Polish message styles for error, warning, info, and system types with bordered boxes

- [`9b79cba`](https://github.com/marschhuynh/nuvin-space/commit/9b79cba94cc16efba897dfa87949dca21c5a73db) Thanks [@marschhuynh](https://github.com/marschhuynh)! - Fix ComboBox lag when holding delete/backspace: debounce search query, memoize list items, add O(1) position map, fix multi-keypress chunk handling

- [#160](https://github.com/marschhuynh/nuvin-cli/pull/160) [`fad37c2`](https://github.com/marschhuynh/nuvin-space/commit/fad37c2880d5733ef561a84cbcacbcbd0f526060) Thanks [@marschhuynh](https://github.com/marschhuynh)! - feat(events): add completion callbacks to custom-command:execute event

- [`dbe79ab`](https://github.com/marschhuynh/nuvin-space/commit/dbe79ab78d5e93821f929823821723a553a8f081) Thanks [@marschhuynh](https://github.com/marschhuynh)! - Fix command menu description rendering and wrapping.

- [#149](https://github.com/marschhuynh/nuvin-cli/pull/149) [`1dd100d`](https://github.com/marschhuynh/nuvin-space/commit/1dd100d42d93c494562d735df91aecce2b7ef60d) Thanks [@marschhuynh](https://github.com/marschhuynh)! - Add tab completion for slash commands in TextInput

- [`572184a`](https://github.com/marschhuynh/nuvin-space/commit/572184ad088edfba950cf846e0d9844a34e2f97d) Thanks [@marschhuynh](https://github.com/marschhuynh)! - Enhance agent and skill list UI with bordered metadata display

- [`47be715`](https://github.com/marschhuynh/nuvin-space/commit/47be7158a5e878e941dc91caa2dcf1ba9034bc67) Thanks [@marschhuynh](https://github.com/marschhuynh)! - Enhance AutoScrollBox with vim-style keyboard nav, simplify TextWrapper usage, improve focus

- [`d6d23c6`](https://github.com/marschhuynh/nuvin-space/commit/d6d23c6b9682e778e55d3f395d6fdfbf638ed589) Thanks [@marschhuynh](https://github.com/marschhuynh)! - Fix focus order in modals by removing duplicate event emissions and adding stable tabIndex sorting

- [`7bce888`](https://github.com/marschhuynh/nuvin-space/commit/7bce888d9113b532706ebca78969266a3f21deaa) Thanks [@marschhuynh](https://github.com/marschhuynh)! - feat(grep): add single file search and context lines; feat(cli): inject git context (branch, repo, commits) into agent system prompts; fix(cli): ComboBox text truncation with flexShrink

- [`2c80900`](https://github.com/marschhuynh/nuvin-space/commit/2c80900bbd377c1b8d8e81e0bdf819da2495ac99) Thanks [@marschhuynh](https://github.com/marschhuynh)! - Add GitHub responses API support and tool validation tweaks.

- [`55d7324`](https://github.com/marschhuynh/nuvin-space/commit/55d73245fc2e6e7748adb30bce5740d41868a5fa) Thanks [@marschhuynh](https://github.com/marschhuynh)! - Refresh LSP diagnostics on file changes and load /export history.

- [#149](https://github.com/marschhuynh/nuvin-cli/pull/149) [`7ae6cb6`](https://github.com/marschhuynh/nuvin-space/commit/7ae6cb668fe7d68e264f8bfe3b365f1977b90aa8) Thanks [@marschhuynh](https://github.com/marschhuynh)! - Refactor Button to use useFocus directly, update AutoScrollBox, clean up demo files

- [`9106fbc`](https://github.com/marschhuynh/nuvin-space/commit/9106fbcd77b8fde9c9c1a1d0ed17a3d93cd94da0) Thanks [@marschhuynh](https://github.com/marschhuynh)! - Fix paste freeze when bracketed paste end marker arrives as separate chunk

- [`0373a85`](https://github.com/marschhuynh/nuvin-space/commit/0373a85cf4b6868746f47d557e87e0f6ab7ff2e8) Thanks [@marschhuynh](https://github.com/marschhuynh)! - feat(core): add PermissionRequest hook for tool approval notifications; fix(core): add timeout handling and reconnection options to MCP client; docs(cli): update hooks usage and agent documentation

- [`9ce689f`](https://github.com/marschhuynh/nuvin-space/commit/9ce689f212a5cd046f44fa171dcb0b0125a98c3b) Thanks [@marschhuynh](https://github.com/marschhuynh)! - Add available tools and improve tool-selection heuristics in prompt.

- [`c2b5de6`](https://github.com/marschhuynh/nuvin-space/commit/c2b5de61fcd6daca677d4560166989fa2f124e60) Thanks [@marschhuynh](https://github.com/marschhuynh)! - refactor: improve swap command UI and input area components

- [`9830b82`](https://github.com/marschhuynh/nuvin-space/commit/9830b82b82cf640a6846ea9fd295a7b268a153a1) Thanks [@marschhuynh](https://github.com/marschhuynh)! - Fix RecentSessions width calculation to prevent overflow.

- [`42b4cc7`](https://github.com/marschhuynh/nuvin-space/commit/42b4cc7099826b964d821bdc79c74e72a2bb8ee6) Thanks [@marschhuynh](https://github.com/marschhuynh)! - fix(ToolResultView): remove unused duration formatting and adjust layout for better display

- [#149](https://github.com/marschhuynh/nuvin-cli/pull/149) [`3f2fb9f`](https://github.com/marschhuynh/nuvin-space/commit/3f2fb9f7bb493328226aa6e4d3a708ee20bc3e5a) Thanks [@marschhuynh](https://github.com/marschhuynh)! - Show main args beside tool name in ToolCallViewer

- [#149](https://github.com/marschhuynh/nuvin-cli/pull/149) [`baef0fb`](https://github.com/marschhuynh/nuvin-space/commit/baef0fbce650664a62cef340004360bb28b95864) Thanks [@marschhuynh](https://github.com/marschhuynh)! - Shorten tool display names and add command creation docs

- [`d5a7511`](https://github.com/marschhuynh/nuvin-space/commit/d5a7511f697917d5c43b8af8c01cb1b830608fec) Thanks [@marschhuynh](https://github.com/marschhuynh)! - Fix UI layout issues with flex properties, scroll behavior, and React hook dependencies

- Updated dependencies [[`458f15a`](https://github.com/marschhuynh/nuvin-space/commit/458f15a831ca7f5d4c54fabfbdf5a2a9e67fcdd4), [`ae426ba`](https://github.com/marschhuynh/nuvin-space/commit/ae426bab43077a14759e692d6d6db703f883935e), [`d52de6c`](https://github.com/marschhuynh/nuvin-space/commit/d52de6cb325b69ce43702b8411e944d1e5d7c877), [`ffb522d`](https://github.com/marschhuynh/nuvin-space/commit/ffb522d5c91c80d1fc54d5318d9f70c0c89e10f8), [`9e42bc5`](https://github.com/marschhuynh/nuvin-space/commit/9e42bc5f0fce408de46718f2dfaaf5f391780a5f), [`32b0f04`](https://github.com/marschhuynh/nuvin-space/commit/32b0f04e8ffb9e449c4fa1aaf6c572ed24ee7af2), [`7bce888`](https://github.com/marschhuynh/nuvin-space/commit/7bce888d9113b532706ebca78969266a3f21deaa), [`2c80900`](https://github.com/marschhuynh/nuvin-space/commit/2c80900bbd377c1b8d8e81e0bdf819da2495ac99), [`65ca384`](https://github.com/marschhuynh/nuvin-space/commit/65ca384d91f80ceef7618e866cd56bf8dd11472c), [`93da975`](https://github.com/marschhuynh/nuvin-space/commit/93da9755fc17231a4d1608bdfe49c85699bb84f5), [`354a1c7`](https://github.com/marschhuynh/nuvin-space/commit/354a1c75b088b2df5ad274a29558c566049a7ff1), [`0373a85`](https://github.com/marschhuynh/nuvin-space/commit/0373a85cf4b6868746f47d557e87e0f6ab7ff2e8), [`a916738`](https://github.com/marschhuynh/nuvin-space/commit/a9167387ba32d8958aca22bea4cdc7185a986106), [`f0c801c`](https://github.com/marschhuynh/nuvin-space/commit/f0c801cd5230fcdacbe337188d4d457fb62c51aa)]:
  - @nuvin/nuvin-core@1.19.0

## 1.36.0-rc.19

### Patch Changes

- [`0373a85`](https://github.com/marschhuynh/nuvin-space/commit/0373a85cf4b6868746f47d557e87e0f6ab7ff2e8) Thanks [@marschhuynh](https://github.com/marschhuynh)! - feat(core): add PermissionRequest hook for tool approval notifications; fix(core): add timeout handling and reconnection options to MCP client; docs(cli): update hooks usage and agent documentation

- Updated dependencies [[`0373a85`](https://github.com/marschhuynh/nuvin-space/commit/0373a85cf4b6868746f47d557e87e0f6ab7ff2e8)]:
  - @nuvin/nuvin-core@1.19.0-rc.12

## 1.36.0-rc.18

### Patch Changes

- [`7bce888`](https://github.com/marschhuynh/nuvin-space/commit/7bce888d9113b532706ebca78969266a3f21deaa) Thanks [@marschhuynh](https://github.com/marschhuynh)! - feat(grep): add single file search and context lines; feat(cli): inject git context (branch, repo, commits) into agent system prompts; fix(cli): ComboBox text truncation with flexShrink

- Updated dependencies [[`7bce888`](https://github.com/marschhuynh/nuvin-space/commit/7bce888d9113b532706ebca78969266a3f21deaa)]:
  - @nuvin/nuvin-core@1.19.0-rc.11

## 1.36.0-rc.17

### Minor Changes

- [`ffb522d`](https://github.com/marschhuynh/nuvin-space/commit/ffb522d5c91c80d1fc54d5318d9f70c0c89e10f8) Thanks [@marschhuynh](https://github.com/marschhuynh)! - fix(cli): allow editing all built-in agents via auto-copy to global location

### Patch Changes

- [`9b79cba`](https://github.com/marschhuynh/nuvin-space/commit/9b79cba94cc16efba897dfa87949dca21c5a73db) Thanks [@marschhuynh](https://github.com/marschhuynh)! - Fix ComboBox lag when holding delete/backspace: debounce search query, memoize list items, add O(1) position map, fix multi-keypress chunk handling

- Updated dependencies [[`ffb522d`](https://github.com/marschhuynh/nuvin-space/commit/ffb522d5c91c80d1fc54d5318d9f70c0c89e10f8)]:
  - @nuvin/nuvin-core@1.19.0-rc.10

## 1.36.0-rc.16

### Patch Changes

- [`d52de6c`](https://github.com/marschhuynh/nuvin-space/commit/d52de6cb325b69ce43702b8411e944d1e5d7c877) Thanks [@marschhuynh](https://github.com/marschhuynh)! - feat(bash): add ignoreOutput option to discard stdout/stderr and return only exit code; update prompt formatting

- [`9106fbc`](https://github.com/marschhuynh/nuvin-space/commit/9106fbcd77b8fde9c9c1a1d0ed17a3d93cd94da0) Thanks [@marschhuynh](https://github.com/marschhuynh)! - Fix paste freeze when bracketed paste end marker arrives as separate chunk

- Updated dependencies [[`d52de6c`](https://github.com/marschhuynh/nuvin-space/commit/d52de6cb325b69ce43702b8411e944d1e5d7c877)]:
  - @nuvin/nuvin-core@1.19.0-rc.9

## 1.36.0-rc.15

### Patch Changes

- [`94ba248`](https://github.com/marschhuynh/nuvin-space/commit/94ba248b7a7ac414babfbe04c2bb0ce6ff3811e8) Thanks [@marschhuynh](https://github.com/marschhuynh)! - Refactor agent imports to use build-time imports instead of runtime file reading

## 1.36.0-rc.14

### Minor Changes

- [`354a1c7`](https://github.com/marschhuynh/nuvin-space/commit/354a1c75b088b2df5ad274a29558c566049a7ff1) Thanks [@marschhuynh](https://github.com/marschhuynh)! - Add max_tokens field to agent configuration

### Patch Changes

- [#165](https://github.com/marschhuynh/nuvin-cli/pull/165) [`ae426ba`](https://github.com/marschhuynh/nuvin-space/commit/ae426bab43077a14759e692d6d6db703f883935e) Thanks [@marschhuynh](https://github.com/marschhuynh)! - Add MCP image content extraction and base64 image detection for tool results

- Updated dependencies [[`ae426ba`](https://github.com/marschhuynh/nuvin-space/commit/ae426bab43077a14759e692d6d6db703f883935e), [`354a1c7`](https://github.com/marschhuynh/nuvin-space/commit/354a1c75b088b2df5ad274a29558c566049a7ff1)]:
  - @nuvin/nuvin-core@1.19.0-rc.8

## 1.36.0-rc.13

### Minor Changes

- [`86aea13`](https://github.com/marschhuynh/nuvin-space/commit/86aea13044d8069ef878946dc4d3d658e433d5bd) Thanks [@marschhuynh](https://github.com/marschhuynh)! - refactor(prompt): restructure system prompt to XML format with modular agent definitions

### Patch Changes

- [`b7201de`](https://github.com/marschhuynh/nuvin-space/commit/b7201de75e386a6787a49126695a4ef6255cc3fc) Thanks [@marschhuynh](https://github.com/marschhuynh)! - Add comprehensive file-based logging to ACP server for debugging editor integrations.

- [`9ce689f`](https://github.com/marschhuynh/nuvin-space/commit/9ce689f212a5cd046f44fa171dcb0b0125a98c3b) Thanks [@marschhuynh](https://github.com/marschhuynh)! - Add available tools and improve tool-selection heuristics in prompt.

- Updated dependencies [[`32b0f04`](https://github.com/marschhuynh/nuvin-space/commit/32b0f04e8ffb9e449c4fa1aaf6c572ed24ee7af2)]:
  - @nuvin/nuvin-core@1.19.0-rc.7

## 1.36.0-rc.12

### Patch Changes

- [`d5a7511`](https://github.com/marschhuynh/nuvin-space/commit/d5a7511f697917d5c43b8af8c01cb1b830608fec) Thanks [@marschhuynh](https://github.com/marschhuynh)! - Fix UI layout issues with flex properties, scroll behavior, and React hook dependencies

## 1.36.0-rc.11

### Patch Changes

- [#160](https://github.com/marschhuynh/nuvin-cli/pull/160) [`fad37c2`](https://github.com/marschhuynh/nuvin-space/commit/fad37c2880d5733ef561a84cbcacbcbd0f526060) Thanks [@marschhuynh](https://github.com/marschhuynh)! - feat(events): add completion callbacks to custom-command:execute event

## 1.36.0-rc.10

### Minor Changes

- [`f0c801c`](https://github.com/marschhuynh/nuvin-space/commit/f0c801cd5230fcdacbe337188d4d457fb62c51aa) Thanks [@marschhuynh](https://github.com/marschhuynh)! - Refactor tool call rendering with comprehensive improvements:

  - Show last lines in result truncation instead of first for better visibility
  - Fix denied/edited states to avoid duplicate content display
  - Add per-tool excludeParams config for cleaner parameter display
  - Use dynamic tool names in SubAgentActivity (Reading/Read/Read failed)
  - Fix abort errorReason to return 'aborted' instead of 'unknown'
  - Show actual error messages in sub-agent status lines

### Patch Changes

- [`3d12819`](https://github.com/marschhuynh/nuvin-space/commit/3d128190f8c6369ca105238c941e9e175f31d7d9) Thanks [@marschhuynh](https://github.com/marschhuynh)! - Polish message styles for error, warning, info, and system types with bordered boxes

- Updated dependencies [[`f0c801c`](https://github.com/marschhuynh/nuvin-space/commit/f0c801cd5230fcdacbe337188d4d457fb62c51aa)]:
  - @nuvin/nuvin-core@1.19.0-rc.6

## 1.36.0-rc.9

### Patch Changes

- [`42b4cc7`](https://github.com/marschhuynh/nuvin-space/commit/42b4cc7099826b964d821bdc79c74e72a2bb8ee6) Thanks [@marschhuynh](https://github.com/marschhuynh)! - fix(ToolResultView): remove unused duration formatting and adjust layout for better display

## 1.36.0-rc.8

### Minor Changes

- [`65ca384`](https://github.com/marschhuynh/nuvin-space/commit/65ca384d91f80ceef7618e866cd56bf8dd11472c) Thanks [@marschhuynh](https://github.com/marschhuynh)! - Add hook system for intercepting agent lifecycle events (pre/post-tool, session start/end). Supports bash command hooks with pattern matching, JSON control flow, and integration with Orchestrator.

### Patch Changes

- Updated dependencies [[`65ca384`](https://github.com/marschhuynh/nuvin-space/commit/65ca384d91f80ceef7618e866cd56bf8dd11472c)]:
  - @nuvin/nuvin-core@1.19.0-rc.4

## 1.36.0-rc.7

### Minor Changes

- [`a916738`](https://github.com/marschhuynh/nuvin-space/commit/a9167387ba32d8958aca22bea4cdc7185a986106) Thanks [@marschhuynh](https://github.com/marschhuynh)! - Redesign agent creation TUI: rename systemPrompt to instructions, simplify state machine, improve keyboard navigation

### Patch Changes

- Updated dependencies [[`a916738`](https://github.com/marschhuynh/nuvin-space/commit/a9167387ba32d8958aca22bea4cdc7185a986106)]:
  - @nuvin/nuvin-core@1.19.0-rc.3

## 1.36.0-rc.5

### Minor Changes

- [`baee016`](https://github.com/marschhuynh/nuvin-space/commit/baee0168c0fe5cca77c1b6683dbc9c729e1a64f6) Thanks [@marschhuynh](https://github.com/marschhuynh)! - Add display support for ask_user_tool with question count and answer rendering.

## 1.35.6-rc.4

### Patch Changes

- [`572184a`](https://github.com/marschhuynh/nuvin-space/commit/572184ad088edfba950cf846e0d9844a34e2f97d) Thanks [@marschhuynh](https://github.com/marschhuynh)! - Enhance agent and skill list UI with bordered metadata display

- [`d6d23c6`](https://github.com/marschhuynh/nuvin-space/commit/d6d23c6b9682e778e55d3f395d6fdfbf638ed589) Thanks [@marschhuynh](https://github.com/marschhuynh)! - Fix focus order in modals by removing duplicate event emissions and adding stable tabIndex sorting

## 1.35.6-rc.3

### Patch Changes

- [#149](https://github.com/marschhuynh/nuvin-cli/pull/149) [`1dd100d`](https://github.com/marschhuynh/nuvin-space/commit/1dd100d42d93c494562d735df91aecce2b7ef60d) Thanks [@marschhuynh](https://github.com/marschhuynh)! - Add tab completion for slash commands in TextInput

- [#149](https://github.com/marschhuynh/nuvin-cli/pull/149) [`7ae6cb6`](https://github.com/marschhuynh/nuvin-space/commit/7ae6cb668fe7d68e264f8bfe3b365f1977b90aa8) Thanks [@marschhuynh](https://github.com/marschhuynh)! - Refactor Button to use useFocus directly, update AutoScrollBox, clean up demo files

- [#149](https://github.com/marschhuynh/nuvin-cli/pull/149) [`3f2fb9f`](https://github.com/marschhuynh/nuvin-space/commit/3f2fb9f7bb493328226aa6e4d3a708ee20bc3e5a) Thanks [@marschhuynh](https://github.com/marschhuynh)! - Show main args beside tool name in ToolCallViewer

- [#149](https://github.com/marschhuynh/nuvin-cli/pull/149) [`baef0fb`](https://github.com/marschhuynh/nuvin-space/commit/baef0fbce650664a62cef340004360bb28b95864) Thanks [@marschhuynh](https://github.com/marschhuynh)! - Shorten tool display names and add command creation docs

## 1.35.6-rc.2

### Patch Changes

- [`dbe79ab`](https://github.com/marschhuynh/nuvin-space/commit/dbe79ab78d5e93821f929823821723a553a8f081) Thanks [@marschhuynh](https://github.com/marschhuynh)! - Fix command menu description rendering and wrapping.

## 1.35.6-rc.1

### Patch Changes

- [`458f15a`](https://github.com/marschhuynh/nuvin-space/commit/458f15a831ca7f5d4c54fabfbdf5a2a9e67fcdd4) Thanks [@marschhuynh](https://github.com/marschhuynh)! - ```

  3. Message should be a compact, single sentence (imperative), e.g. `Refresh LSP diagnostics after file edits.`
  4. Commit with conventional commits (e.g. `fix: ...`, `feat: ...`, `chore: ...`).

- [`9830b82`](https://github.com/marschhuynh/nuvin-space/commit/9830b82b82cf640a6846ea9fd295a7b268a153a1) Thanks [@marschhuynh](https://github.com/marschhuynh)! - Fix RecentSessions width calculation to prevent overflow.

- Updated dependencies [[`458f15a`](https://github.com/marschhuynh/nuvin-space/commit/458f15a831ca7f5d4c54fabfbdf5a2a9e67fcdd4)]:
  - @nuvin/nuvin-core@1.19.0-rc.1

## 1.35.6-rc.0

### Patch Changes

- [`2c80900`](https://github.com/marschhuynh/nuvin-space/commit/2c80900bbd377c1b8d8e81e0bdf819da2495ac99) Thanks [@marschhuynh](https://github.com/marschhuynh)! - Add GitHub responses API support and tool validation tweaks.

- [`55d7324`](https://github.com/marschhuynh/nuvin-space/commit/55d73245fc2e6e7748adb30bce5740d41868a5fa) Thanks [@marschhuynh](https://github.com/marschhuynh)! - Refresh LSP diagnostics on file changes and load /export history.

- Updated dependencies [[`2c80900`](https://github.com/marschhuynh/nuvin-space/commit/2c80900bbd377c1b8d8e81e0bdf819da2495ac99)]:
  - @nuvin/nuvin-core@1.19.0-rc.0

## 1.35.5

### Patch Changes

- [`6e98ad5`](https://github.com/marschhuynh/nuvin-space/commit/6e98ad5c7fd1243566ac15f94f3d32d10ab82366) Thanks [@marschhuynh](https://github.com/marschhuynh)! - Make ASCII logo width dynamic based on version length

- [`0261c7c`](https://github.com/marschhuynh/nuvin-space/commit/0261c7ccf54b896674b1b2e9cf3e2661ee6a1013) Thanks [@marschhuynh](https://github.com/marschhuynh)! - Suppress retry errors in /model modal and show recent models in provider list

## 1.35.5-rc.0

### Patch Changes

- [`6e98ad5`](https://github.com/marschhuynh/nuvin-space/commit/6e98ad5c7fd1243566ac15f94f3d32d10ab82366) Thanks [@marschhuynh](https://github.com/marschhuynh)! - Make ASCII logo width dynamic based on version length

- [`0261c7c`](https://github.com/marschhuynh/nuvin-space/commit/0261c7ccf54b896674b1b2e9cf3e2661ee6a1013) Thanks [@marschhuynh](https://github.com/marschhuynh)! - Suppress retry errors in /model modal and show recent models in provider list

## 1.35.4

### Patch Changes

- [`55904c3`](https://github.com/marschhuynh/nuvin-space/commit/55904c3fed0c190a5d0b7f83bafcdc68e86ef872) Thanks [@marschhuynh](https://github.com/marschhuynh)! - Test stable version dist-tag workflow fix

## 1.35.4-rc.0

### Patch Changes

- [`55904c3`](https://github.com/marschhuynh/nuvin-space/commit/55904c3fed0c190a5d0b7f83bafcdc68e86ef872) Thanks [@marschhuynh](https://github.com/marschhuynh)! - Test stable version dist-tag workflow fix

## 1.35.3

### Patch Changes

- [`a481455`](https://github.com/marschhuynh/nuvin-space/commit/a48145562664250cf5a67d30a7202c9ed4076345) Thanks [@marschhuynh](https://github.com/marschhuynh)! - Final test of complete RC to stable workflow with approval

- [`80de431`](https://github.com/marschhuynh/nuvin-space/commit/80de4318589f6aae396fbcc220be0eca5003428b) Thanks [@marschhuynh](https://github.com/marschhuynh)! - Test complete RC to stable release flow

- [`d37cdeb`](https://github.com/marschhuynh/nuvin-space/commit/d37cdebeda1484d3634cd00e33adabfcce71a8a6) Thanks [@marschhuynh](https://github.com/marschhuynh)! - Test multi-stage promotion workflow with manual approval

- [`c52ecd6`](https://github.com/marschhuynh/nuvin-space/commit/c52ecd68e1064074f00ae69db1eb0ab57ce1a8ad) Thanks [@marschhuynh](https://github.com/marschhuynh)! - Test RC versioning with pre-release mode

## 1.35.3-rc.3

### Patch Changes

- [`a481455`](https://github.com/marschhuynh/nuvin-space/commit/a48145562664250cf5a67d30a7202c9ed4076345) Thanks [@marschhuynh](https://github.com/marschhuynh)! - Final test of complete RC to stable workflow with approval

## 1.35.3-rc.2

### Patch Changes

- [`d37cdeb`](https://github.com/marschhuynh/nuvin-space/commit/d37cdebeda1484d3634cd00e33adabfcce71a8a6) Thanks [@marschhuynh](https://github.com/marschhuynh)! - Test multi-stage promotion workflow with manual approval

## 1.35.3-rc.1

### Patch Changes

- [`80de431`](https://github.com/marschhuynh/nuvin-space/commit/80de4318589f6aae396fbcc220be0eca5003428b) Thanks [@marschhuynh](https://github.com/marschhuynh)! - Test complete RC to stable release flow

## 1.35.3-rc.0

### Patch Changes

- [`c52ecd6`](https://github.com/marschhuynh/nuvin-space/commit/c52ecd68e1064074f00ae69db1eb0ab57ce1a8ad) Thanks [@marschhuynh](https://github.com/marschhuynh)! - Test RC versioning with pre-release mode

## 1.35.2

### Patch Changes

- [`99a4cda`](https://github.com/marschhuynh/nuvin-space/commit/99a4cda29f5525d73f3c4b723c88fbb00ce2a669) Thanks [@marschhuynh](https://github.com/marschhuynh)! - Test RC tag creation workflow

## 1.35.1

### Patch Changes

- [`3da22cc`](https://github.com/marschhuynh/nuvin-space/commit/3da22cc42a23f287eaa7ce80603e03c510c7ace8) Thanks [@marschhuynh](https://github.com/marschhuynh)! - Add pre-release workflow with RC versioning and promotion to stable release

## 1.35.0

### Minor Changes

- [`a92a995`](https://github.com/marschhuynh/nuvin-space/commit/a92a9954519c52c516beb8929becf6e79104f7d1) Thanks [@marschhuynh](https://github.com/marschhuynh)! - Fix UserQuestionPrompt bugs, add ask_user_tool to enabled tools, and improve focus cycling

### Patch Changes

- Updated dependencies [[`a92a995`](https://github.com/marschhuynh/nuvin-space/commit/a92a9954519c52c516beb8929becf6e79104f7d1)]:
  - @nuvin/nuvin-core@1.18.0

## 1.34.0

### Minor Changes

- [`822a763`](https://github.com/marschhuynh/nuvin-space/commit/822a76314ec7fa279dc646c508624c4f60315094) Thanks [@marschhuynh](https://github.com/marschhuynh)! - Add MCP OAuth support with token storage

### Patch Changes

- Updated dependencies [[`822a763`](https://github.com/marschhuynh/nuvin-space/commit/822a76314ec7fa279dc646c508624c4f60315094)]:
  - @nuvin/nuvin-core@1.17.0

## 1.33.3

### Patch Changes

- [`e133ab5`](https://github.com/marschhuynh/nuvin-space/commit/e133ab545cf73d0c414c2d34f7b8275276a24059) Thanks [@marschhuynh](https://github.com/marschhuynh)! - Enable LSP by default and improve skill tool display

- Updated dependencies [[`e133ab5`](https://github.com/marschhuynh/nuvin-space/commit/e133ab545cf73d0c414c2d34f7b8275276a24059)]:
  - @nuvin/nuvin-core@1.16.2

## 1.33.2

### Patch Changes

- [`4a7b6e8`](https://github.com/marschhuynh/nuvin-space/commit/4a7b6e804858f2a639e924a6a980c3aae933a672) Thanks [@marschhuynh](https://github.com/marschhuynh)! - Fix history recall triggering when holding up/down arrow key on multiline input

- [`d8afe06`](https://github.com/marschhuynh/nuvin-space/commit/d8afe063ca111a85d597fab1ffdb98fa23ddc8ff) Thanks [@marschhuynh](https://github.com/marschhuynh)! - Improve MCP URL handling and add visual cursor navigation for wrapped text

## 1.33.1

### Patch Changes

- [`e7e28b6`](https://github.com/marschhuynh/nuvin-space/commit/e7e28b6d2fb8150891005d5010b71e69fb335b6d) Thanks [@marschhuynh](https://github.com/marschhuynh)! - fix(cli): improve AutoScrollBox rendering and update ink to 6.6.4

## 1.33.0

### Minor Changes

- [`91bd298`](https://github.com/marschhuynh/nuvin-space/commit/91bd298e6f9599a18babb38de29bb9c2da771a4d) Thanks [@marschhuynh](https://github.com/marschhuynh)! - Consolidate config directory from `.nuvin-cli` to `.nuvin` with automatic migration

## 1.32.0

### Minor Changes

- [`1d3786f`](https://github.com/marschhuynh/nuvin-space/commit/1d3786f6d4b825d3f1251ea4d1d3965df9660019) Thanks [@marschhuynh](https://github.com/marschhuynh)! - feat(cli): add skills system with SkillModal, SkillsService and skills command

- [`1d3786f`](https://github.com/marschhuynh/nuvin-space/commit/1d3786f6d4b825d3f1251ea4d1d3965df9660019) Thanks [@marschhuynh](https://github.com/marschhuynh)! - feat(cli): add agent deletion support, refactor AgentList with ComboBox

- [`1d3786f`](https://github.com/marschhuynh/nuvin-space/commit/1d3786f6d4b825d3f1251ea4d1d3965df9660019) Thanks [@marschhuynh](https://github.com/marschhuynh)! - refactor(cli): extract keyboard handling and improve command creation UI

- [`1d3786f`](https://github.com/marschhuynh/nuvin-space/commit/1d3786f6d4b825d3f1251ea4d1d3965df9660019) Thanks [@marschhuynh](https://github.com/marschhuynh)! - refactor(cli): adopt ScrollableSelectList across components

- [`1d3786f`](https://github.com/marschhuynh/nuvin-space/commit/1d3786f6d4b825d3f1251ea4d1d3965df9660019) Thanks [@marschhuynh](https://github.com/marschhuynh)! - refactor(cli): refactor ComboBox with AutoScrollBox, add group support, consolidate model definitions

### Patch Changes

- Updated dependencies [[`1d3786f`](https://github.com/marschhuynh/nuvin-space/commit/1d3786f6d4b825d3f1251ea4d1d3965df9660019)]:
  - @nuvin/nuvin-core@1.16.0

## 1.31.0

### Minor Changes

- [`b54b49e`](https://github.com/marschhuynh/nuvin-space/commit/b54b49e528d81840fc5b09f1728c38d399f16ebd) Thanks [@marschhuynh](https://github.com/marschhuynh)! - add Button component and improve modal UI consistency

### Patch Changes

- [`9c88dd7`](https://github.com/marschhuynh/nuvin-space/commit/9c88dd7ce656a087a51153138d2564b464adb81a) Thanks [@marschhuynh](https://github.com/marschhuynh)! - refactor TextInput scroll using Box overflow with visual row rendering

## 1.30.4

### Patch Changes

- [`512c02f`](https://github.com/marschhuynh/nuvin-space/commit/512c02f8cbb6e01eb63f58500a8dc54785147c3c) Thanks [@marschhuynh](https://github.com/marschhuynh)! - add edit mode preview support in AgentCreation

## 1.30.3

### Patch Changes

- [`d53cfdf`](https://github.com/marschhuynh/nuvin-space/commit/d53cfdf3ad4c21095b3b77078ef5588ec9eb287f) Thanks [@marschhuynh](https://github.com/marschhuynh)! - refactor(cli): migrate from SelectInput to ScrollableSelectList, add stdout dimension hooks for dynamic sizing

## 1.30.2

### Patch Changes

- [`9c8f57a`](https://github.com/marschhuynh/nuvin-space/commit/9c8f57acd5645eea59327fdb9bfdbe3491ca2d5f) Thanks [@marschhuynh](https://github.com/marschhuynh)! - feat(cli): add ScrollableSelectList and refactor AgentModal with dynamic sizing

- [`f582077`](https://github.com/marschhuynh/nuvin-space/commit/f582077f76138ee9fa495fd4b4d711b405bfb973) Thanks [@marschhuynh](https://github.com/marschhuynh)! - refactor(cli): modular AgentCreation forms, enhanced TextInput viewport support, simplified ScrollableSelectList

- [`3ce518b`](https://github.com/marschhuynh/nuvin-space/commit/3ce518b8af4c203b1dcb91140936aa4dd55409a5) Thanks [@marschhuynh](https://github.com/marschhuynh)! - fix: sub-agent state immutability and UI fixes

## 1.30.1

### Patch Changes

- [`1411183`](https://github.com/marschhuynh/nuvin-space/commit/1411183beaf6b73e00cbdd1a5d7815c0401d2b9c) Thanks [@marschhuynh](https://github.com/marschhuynh)! - fix(lsp): add .js extension to vscode-jsonrpc/node import for ESM

## 1.30.0

### Minor Changes

- [`7f3cad5`](https://github.com/marschhuynh/nuvin-space/commit/7f3cad51cd98cf70856f365353e69027949f96a4) Thanks [@marschhuynh](https://github.com/marschhuynh)! - feat(cli): enable LSP tool by default and add UI margin

### Patch Changes

- Updated dependencies [[`7f3cad5`](https://github.com/marschhuynh/nuvin-space/commit/7f3cad51cd98cf70856f365353e69027949f96a4)]:
  - @nuvin/nuvin-core@1.15.0

## 1.29.1

### Patch Changes

- [`5f7e5ac`](https://github.com/marschhuynh/nuvin-space/commit/5f7e5accbce99569775122822fce681689fe0bb7) Thanks [@marschhuynh](https://github.com/marschhuynh)! - fix: handle nullish children in Markdown component

## 1.29.0

### Minor Changes

- [`b215ecb`](https://github.com/marschhuynh/nuvin-space/commit/b215ecb1911833416710868d86ef59004b5f1cb5) Thanks [@marschhuynh](https://github.com/marschhuynh)! - Support dynamic custom provider configuration for models command

## 1.28.0

### Minor Changes

- [`795a2cd`](https://github.com/marschhuynh/nuvin-space/commit/795a2cd2c258bbd623576f570522a5321e929038) Thanks [@marschhuynh](https://github.com/marschhuynh)! - Refactor tool approval to per-tool granularity. Each tool now gets its own approval flow: bypass tools execute immediately, approval-required tools wait for individual user decisions. Added new `ui:toolCalls` event for real-time tool tracking. Removed batch approval model in favor of individual tool approvals.

### Patch Changes

- [`d2b7725`](https://github.com/marschhuynh/nuvin-space/commit/d2b77257c787c42d7697e60cedf58797cc001bbb) Thanks [@marschhuynh](https://github.com/marschhuynh)! - Fix `/summary` command to use correct conversation ID from ConversationContext instead of hardcoded 'cli' key

- Updated dependencies [[`795a2cd`](https://github.com/marschhuynh/nuvin-space/commit/795a2cd2c258bbd623576f570522a5321e929038)]:
  - @nuvin/nuvin-core@1.14.0

## 1.27.1

### Patch Changes

- [`c18a168`](https://github.com/marschhuynh/nuvin-space/commit/c18a16881fecf176a2a3ad9ea9137cffe35c08b2) Thanks [@marschhuynh](https://github.com/marschhuynh)! - Update ink to version 6.6.1

- [`4be8d98`](https://github.com/marschhuynh/nuvin-space/commit/4be8d98e9380e1fd80afc79762d9b65db30a66f9) Thanks [@marschhuynh](https://github.com/marschhuynh)! - Refactor ToolResultView into ToolCallViewer, improve markdown rendering, update imports

## 1.27.0

### Minor Changes

- [`2a411fc`](https://github.com/marschhuynh/nuvin-space/commit/2a411fc3afb6b6f2cda837432f18d972cde0f186) Thanks [@marschhuynh](https://github.com/marschhuynh)! - refactor(cli): improve terminal cleanup and command menu state management

## 1.26.2

### Patch Changes

- [`8f0e702`](https://github.com/marschhuynh/nuvin-space/commit/8f0e702cc38c37bf794bf3d33c69b8ba32639572) Thanks [@marschhuynh](https://github.com/marschhuynh)! - Optimize React rendering with stable callbacks and shared cursor blink state

- [`86d9d6d`](https://github.com/marschhuynh/nuvin-space/commit/86d9d6d13bafe32d7b406e9629470e96aad2aad1) Thanks [@marschhuynh](https://github.com/marschhuynh)! - Improve markdown table rendering with dynamic column width calculation

## 1.26.1

### Patch Changes

- [`9219f88`](https://github.com/marschhuynh/nuvin-space/commit/9219f889cf52912a17e79f3070e3efd8de47a461) Thanks [@marschhuynh](https://github.com/marschhuynh)! - Fix altMode layout consistency and InputArea rendering logic

- [`9219f88`](https://github.com/marschhuynh/nuvin-space/commit/9219f889cf52912a17e79f3070e3efd8de47a461) Thanks [@marschhuynh](https://github.com/marschhuynh)! - Update components with styling fixes and AGENTS.md improvements

## 1.26.0

### Minor Changes

- [`c6ada2a`](https://github.com/marschhuynh/nuvin-space/commit/c6ada2ad87c3cd5b55f6fa3ed9098e0d7603af41) Thanks [@marschhuynh](https://github.com/marschhuynh)! - feat: add VirtualizedList component with scrollbar for chat virtualization

## 1.25.7

### Patch Changes

- [`d9a0756`](https://github.com/marschhuynh/nuvin-space/commit/d9a0756c39f4d5bc258881cedb08445c04f94ff5) Thanks [@marschhuynh](https://github.com/marschhuynh)! - fix(cli): use correct history file name and format

## 1.25.6

### Patch Changes

- [`27ff7ca`](https://github.com/marschhuynh/nuvin-space/commit/27ff7ca2bbc89c99ba7d9c73042f7e84bf0621c6) Thanks [@marschhuynh](https://github.com/marschhuynh)! - refactor(core): rename delegation module files to kebab-case

- Updated dependencies [[`27ff7ca`](https://github.com/marschhuynh/nuvin-space/commit/27ff7ca2bbc89c99ba7d9c73042f7e84bf0621c6)]:
  - @nuvin/nuvin-core@1.13.5

## 1.25.5

### Patch Changes

- [`aa6474e`](https://github.com/marschhuynh/nuvin-space/commit/aa6474e5640ffdc9ff10efdd5b188dbca397421d) Thanks [@marschhuynh](https://github.com/marschhuynh)! - feat(core): add AgentStateManager and TaskOutputTool for improved sub-agent session management

  refactor(core): refactor DefaultDelegationService with enhanced state tracking

  feat(core): add MultiFileMemoryPersistence for robust session resumption

  refactor(core): simplify AssignTool with direct AgentManager integration

  refactor(cli): update SubAgentActivity UI for better tool result display

- Updated dependencies [[`aa6474e`](https://github.com/marschhuynh/nuvin-space/commit/aa6474e5640ffdc9ff10efdd5b188dbca397421d)]:
  - @nuvin/nuvin-core@1.13.3

## 1.25.4

### Patch Changes

- [`4406892`](https://github.com/marschhuynh/nuvin-space/commit/4406892422e69e034fa6f00a00a720aef9ae4522) Thanks [@marschhuynh](https://github.com/marschhuynh)! - refactor(AgentCreation): integrate FocusContext; redesign form UI with tab nav

  feat(AgentCreator): add retry logic and configurable options

  refactor(prompt): simplify agent-creator template

- Updated dependencies [[`4406892`](https://github.com/marschhuynh/nuvin-space/commit/4406892422e69e034fa6f00a00a720aef9ae4522)]:
  - @nuvin/nuvin-core@1.13.2

## 1.25.3

### Patch Changes

- [`a079ea9`](https://github.com/marschhuynh/nuvin-space/commit/a079ea9b40c2ba57e2d6fbf8acd7289bd3acccf2) Thanks [@marschhuynh](https://github.com/marschhuynh)! - feat: add thinking parameter support; add ZAI Anthropic-compatible provider; handle reasoning_content in streaming

- [`ef1783b`](https://github.com/marschhuynh/nuvin-space/commit/ef1783b5846dc5082a73d0ea8ffcce87ae3aaa85) Thanks [@marschhuynh](https://github.com/marschhuynh)! - feat: add thinking parameter support with budget tokens; improve thinking UI labels; handle reasoning_content in streaming

- Updated dependencies [[`a079ea9`](https://github.com/marschhuynh/nuvin-space/commit/a079ea9b40c2ba57e2d6fbf8acd7289bd3acccf2), [`ef1783b`](https://github.com/marschhuynh/nuvin-space/commit/ef1783b5846dc5082a73d0ea8ffcce87ae3aaa85)]:
  - @nuvin/nuvin-core@1.13.0

## 1.25.2

### Patch Changes

- [`65c048f`](https://github.com/marschhuynh/nuvin-space/commit/65c048fa33a22a24eb2f509528d50b554a4a1469) Thanks [@marschhuynh](https://github.com/marschhuynh)! - Add Anthropic-compatible provider support; add MiniMax provider; update provider configurations

- [`42810b7`](https://github.com/marschhuynh/nuvin-space/commit/42810b71183d8df1e22054ef6433e503a277ecdc) Thanks [@marschhuynh](https://github.com/marschhuynh)! - Execute bypass tools in parallel during tool approval flow; preserve full metadata

- [`66ae3f8`](https://github.com/marschhuynh/nuvin-space/commit/66ae3f8009805a8a5141dd10db6fc026066556c3) Thanks [@marschhuynh](https://github.com/marschhuynh)! - Add Zod-based tool parameter validation, MCP tool validation, and improved error handling

- Updated dependencies [[`65c048f`](https://github.com/marschhuynh/nuvin-space/commit/65c048fa33a22a24eb2f509528d50b554a4a1469), [`42810b7`](https://github.com/marschhuynh/nuvin-space/commit/42810b71183d8df1e22054ef6433e503a277ecdc), [`66ae3f8`](https://github.com/marschhuynh/nuvin-space/commit/66ae3f8009805a8a5141dd10db6fc026066556c3)]:
  - @nuvin/nuvin-core@1.12.0

## 1.25.1

### Patch Changes

- [`1bdf26f`](https://github.com/marschhuynh/nuvin-space/commit/1bdf26f98d7d29b225d7227d87fd4e9d05f7eb83) Thanks [@marschhuynh](https://github.com/marschhuynh)! - fix: replace hardcoded colors with theme tokens; add fetch function to Anthropic transport; remove ink overrides

- Updated dependencies [[`1bdf26f`](https://github.com/marschhuynh/nuvin-space/commit/1bdf26f98d7d29b225d7227d87fd4e9d05f7eb83)]:
  - @nuvin/nuvin-core@1.11.1

## 1.25.0

### Minor Changes

- [`9d1b7ea`](https://github.com/marschhuynh/nuvin-space/commit/9d1b7ea2de6c8e38713ec5c8316d2c9804d45b93) Thanks [@marschhuynh](https://github.com/marschhuynh)! - rename DirLsTool to LsTool, dir_ls to ls_tool, convert output to YAML

- [`f72d754`](https://github.com/marschhuynh/nuvin-space/commit/f72d754c5b99fe10b7fd03ce807e8957b49e604a) Thanks [@marschhuynh](https://github.com/marschhuynh)! - rename glob to glob_tool, grep to grep_tool; improve color calculation accuracy and theme colors

### Patch Changes

- [`abdf7e4`](https://github.com/marschhuynh/nuvin-space/commit/abdf7e463b260ebae1ccaa05e79c26da04c21364) Thanks [@marschhuynh](https://github.com/marschhuynh)! - fix: improve ESC key handling and abort controller cleanup in InteractionArea

- [`2aa6a68`](https://github.com/marschhuynh/nuvin-space/commit/2aa6a683e3a644db40726ce4768f152c0037d5d1) Thanks [@marschhuynh](https://github.com/marschhuynh)! - fix theme context destructuring; improve layout with useLayoutEffect and debounce; add error flow docs

- [`3b96aca`](https://github.com/marschhuynh/nuvin-space/commit/3b96aca2b6d1bc19ca4833cd91498a175e09238d) Thanks [@marschhuynh](https://github.com/marschhuynh)! - remove unused explain mode feature

- Updated dependencies [[`e8add82`](https://github.com/marschhuynh/nuvin-space/commit/e8add829649db481ab0f15422b90ee63c47fe951), [`9d1b7ea`](https://github.com/marschhuynh/nuvin-space/commit/9d1b7ea2de6c8e38713ec5c8316d2c9804d45b93), [`f72d754`](https://github.com/marschhuynh/nuvin-space/commit/f72d754c5b99fe10b7fd03ce807e8957b49e604a)]:
  - @nuvin/nuvin-core@1.11.0

## 1.24.1

### Patch Changes

- [`42abdc1`](https://github.com/marschhuynh/nuvin-space/commit/42abdc147353077e80ee34f3302b066d715190dc) Thanks [@marschhuynh](https://github.com/marschhuynh)! - Remove debug logger statements from focus and input handling

## 1.24.0

### Minor Changes

- [`7ab770f`](https://github.com/marschhuynh/nuvin-space/commit/7ab770f4b65e2fb6745db6e2419ea66d3d679de8) Thanks [@marschhuynh](https://github.com/marschhuynh)! - Add glob and grep tools for advanced file and content searching

### Patch Changes

- Updated dependencies [[`7ab770f`](https://github.com/marschhuynh/nuvin-space/commit/7ab770f4b65e2fb6745db6e2419ea66d3d679de8)]:
  - @nuvin/nuvin-core@1.10.0

## 1.23.1

### Patch Changes

- [`615ebcd`](https://github.com/marschhuynh/nuvin-space/commit/615ebcdf93aad800454c632f6c764a860a486ca7) Thanks [@marschhuynh](https://github.com/marschhuynh)! - Enhanced command menu and focus system with profile preservation, initial LLM setup, new CommandMenu component, and improved keyboard navigation

- [`7acbf62`](https://github.com/marschhuynh/nuvin-space/commit/7acbf622f2e8351d18ac6d0f4e64bb68c48e37de) Thanks [@marschhuynh](https://github.com/marschhuynh)! - Compact: Fix mcp handler change and minor adjustments

- [`2c8a132`](https://github.com/marschhuynh/nuvin-space/commit/2c8a132bd2cb7fd5f1b9d5c7349ba2d38ebef709) Thanks [@marschhuynh](https://github.com/marschhuynh)! - Improve ESC key handling with proper timeout clearing and sequence management

## 1.23.0

### Minor Changes

- [`6313135`](https://github.com/marschhuynh/nuvin-space/commit/631313587aec57358f856e940719a8b5337a6ce3) Thanks [@marschhuynh](https://github.com/marschhuynh)! - Add profile parameter support to subcommand handlers

  **ConfigCliHandler:**

  - Added `private profile?: string` field
  - Updated constructor to accept `profile?: string` parameter
  - Updated `handleConfigCommand()` to accept `profile?: string`
  - All `configManager.load()` calls now pass `{ profile: this.profile }`

  **ProfileCliHandler:**

  - Updated `handleProfileCommand()` signature to accept `profile?: string` (for API consistency)
  - Profile commands operate on registry, so parameter is unused

  **MCPCliHandler:**

  - Added `private profile?: string` field
  - Updated constructor to accept `profile?: string` parameter
  - Updated `handleMCPCommand()` to accept `profile?: string`
  - Updated `configManager.load()` to pass `{ profile: this.profile }`

  **Help text updates:**

  - Added profile usage examples to MCP help (`nuvin --profile work mcp add server`)
  - Updated CLI help to clarify `--profile` must come before subcommand

### Patch Changes

- [`6313135`](https://github.com/marschhuynh/nuvin-space/commit/631313587aec57358f856e940719a8b5337a6ce3) Thanks [@marschhuynh](https://github.com/marschhuynh)! - Fix `--profile` flag being passed as argument to subcommand handlers

  - Changed subcommand handlers from `process.argv.slice(3)` to `cli.input.slice(1)`
  - This fixes the issue where `nuvin --profile work mcp list` showed "Unknown mcp command: work"
  - Affected handlers: config, profile, and mcp subcommands
  - meow parses flags into `cli.flags`, so we must use `cli.input` for positional arguments only

## 1.22.0

### Minor Changes

- [`6c8a0c2`](https://github.com/marschhuynh/nuvin-space/commit/6c8a0c2cc09ecedd364128b00fa0403e82e9d7d9) Thanks [@marschhuynh](https://github.com/marschhuynh)! - Add FocusContext for centralized keyboard focus management with Tab/Ctrl+N/P navigation between components

### Patch Changes

- [`a1f8287`](https://github.com/marschhuynh/nuvin-space/commit/a1f82872eba755e2dbf27ef00f9dde21d0bf43a0) Thanks [@marschhuynh](https://github.com/marschhuynh)! - Remove focusArea prop from Footer component and simplify UI to display static navigation hints

- [`6c8a0c2`](https://github.com/marschhuynh/nuvin-space/commit/6c8a0c2cc09ecedd364128b00fa0403e82e9d7d9) Thanks [@marschhuynh](https://github.com/marschhuynh)! - Add keyboard navigation to AutoScrollBox and improve input event handling

- [`6c8a0c2`](https://github.com/marschhuynh/nuvin-space/commit/6c8a0c2cc09ecedd364128b00fa0403e82e9d7d9) Thanks [@marschhuynh](https://github.com/marschhuynh)! - Refactor tool approval UI to use FocusContext and improve keyboard navigation

  - Replace manual action selection with FocusContext-based focus system
  - Add dedicated ActionButton components with proper focus handling
  - ToolEditInput now integrates with focus system
  - Simplify keyboard shortcuts to 1/2/3 with Tab/Ctrl+N/P for navigation

- [`6c8a0c2`](https://github.com/marschhuynh/nuvin-space/commit/6c8a0c2cc09ecedd364128b00fa0403e82e9d7d9) Thanks [@marschhuynh](https://github.com/marschhuynh)! - Improve modal UI styling and AutoScrollBox focus indicators

  - Update AppModal styling with better borders and title background
  - Add focus highlighting to AutoScrollBox with background color
  - Consistent border characters across all UI components
  - Better theme integration for modal components

- [`6c8a0c2`](https://github.com/marschhuynh/nuvin-space/commit/6c8a0c2cc09ecedd364128b00fa0403e82e9d7d9) Thanks [@marschhuynh](https://github.com/marschhuynh)! - Remove deprecated virtualized components and simplify chat display

  - Delete VirtualizedChat and VirtualizedList components
  - Clean up FlexLayout by removing chatFocus prop
  - Replace ╰─ box drawing characters with └─ for consistency
  - Streamline message rendering in MessageLine

## 1.21.1

### Patch Changes

- [`59a4717`](https://github.com/marschhuynh/nuvin-space/commit/59a4717de2688be1f2e1e1a9f18ecbbb9bc0fcbf) Thanks [@marschhuynh](https://github.com/marschhuynh)! - Improve BashTool cleanup with proper timer clearing, event listener removal, and comprehensive finally block to prevent resource leaks.

- Updated dependencies [[`59a4717`](https://github.com/marschhuynh/nuvin-space/commit/59a4717de2688be1f2e1e1a9f18ecbbb9bc0fcbf), [`59a4717`](https://github.com/marschhuynh/nuvin-space/commit/59a4717de2688be1f2e1e1a9f18ecbbb9bc0fcbf)]:
  - @nuvin/nuvin-core@1.9.4

## 1.21.0

### Minor Changes

- [`1844522`](https://github.com/marschhuynh/nuvin-space/commit/1844522d698a177bd0a54e1877904701b2fa2da7) Thanks [@marschhuynh](https://github.com/marschhuynh)! - Introduce registry-based tool approval renderer system for flexible parameter display; add file path visibility to file_edit and file_new tools.

### Patch Changes

- [`461a39d`](https://github.com/marschhuynh/nuvin-space/commit/461a39d6f70e16f438de5b023d6d13903786a748) Thanks [@marschhuynh](https://github.com/marschhuynh)! - Improve agent creation form validation and UX; add focus handling and clearer error messages.

- [`c9964f5`](https://github.com/marschhuynh/nuvin-space/commit/c9964f51756e6000ed29baab2f7d45487131c90a) Thanks [@marschhuynh](https://github.com/marschhuynh)! - Expose mousePriority to AutoScrollBox used in VirtualizedList and ToolParameters to improve mouse interaction handling.

- [`026e708`](https://github.com/marschhuynh/nuvin-space/commit/026e7088a903768bd6f65695488bbbb593ffcb2a) Thanks [@marschhuynh](https://github.com/marschhuynh)! - Change explain toggle shortcut from Ctrl+E to Ctrl+B in InputContext middleware; update demo-mode formatting.

- [`1844522`](https://github.com/marschhuynh/nuvin-space/commit/1844522d698a177bd0a54e1877904701b2fa2da7) Thanks [@marschhuynh](https://github.com/marschhuynh)! - Add support for Zai's glm-4.7 model with context window of 200k and max output of 128k tokens.

- [`026e708`](https://github.com/marschhuynh/nuvin-space/commit/026e7088a903768bd6f65695488bbbb593ffcb2a) Thanks [@marschhuynh](https://github.com/marschhuynh)! - Add Home/End navigation and meta/ctrl shortcuts to TextInput; update parseKeypress and types to recognize `home` and `end` keys.

- [`461a39d`](https://github.com/marschhuynh/nuvin-space/commit/461a39d6f70e16f438de5b023d6d13903786a748) Thanks [@marschhuynh](https://github.com/marschhuynh)! - Expose better stdout dimension handling and update StdoutDimensionsContext to reflect terminal resizes more reliably.

- [`1844522`](https://github.com/marschhuynh/nuvin-space/commit/1844522d698a177bd0a54e1877904701b2fa2da7) Thanks [@marschhuynh](https://github.com/marschhuynh)! - Clean up formatting in Markdown test snapshot.

- [`1844522`](https://github.com/marschhuynh/nuvin-space/commit/1844522d698a177bd0a54e1877904701b2fa2da7) Thanks [@marschhuynh](https://github.com/marschhuynh)! - Simplify ToolCallViewer by hiding pending approval tools and using parseToolArguments from nuvin-core.

- [`461a39d`](https://github.com/marschhuynh/nuvin-space/commit/461a39d6f70e16f438de5b023d6d13903786a748) Thanks [@marschhuynh](https://github.com/marschhuynh)! - Adjust tool parameter layout and spacing for better readability in ToolCallViewer and ToolParameters components.

- [`461a39d`](https://github.com/marschhuynh/nuvin-space/commit/461a39d6f70e16f438de5b023d6d13903786a748) Thanks [@marschhuynh](https://github.com/marschhuynh)! - Improve stdout sizing and virtualized list layout to better handle dynamic terminal sizes and varying message heights. This reduces visual clipping and improves scroll behavior.

- [`461a39d`](https://github.com/marschhuynh/nuvin-space/commit/461a39d6f70e16f438de5b023d6d13903786a748) Thanks [@marschhuynh](https://github.com/marschhuynh)! - Fix markdown renderer behavior for edge-case inputs, preventing incorrect inline code highlighting and improving line wrapping.

- Updated dependencies [[`1844522`](https://github.com/marschhuynh/nuvin-space/commit/1844522d698a177bd0a54e1877904701b2fa2da7)]:
  - @nuvin/nuvin-core@1.9.3

## 1.20.2

### Patch Changes

- [`3f1e225`](https://github.com/marschhuynh/nuvin-space/commit/3f1e225233bc2fa7eabca8b2df1afe8f79ca488c) Thanks [@marschhuynh](https://github.com/marschhuynh)! - Disable incremental rendering in CLI default config to avoid rendering artifacts and improve stability

  - Set incrementalRendering to false in the CLI options
  - No public API changes

## 1.20.1

### Patch Changes

- [`1b268c6`](https://github.com/marschhuynh/nuvin-space/commit/1b268c60c6ffbe7d59a6d9468be04521f8f53838) Thanks [@marschhuynh](https://github.com/marschhuynh)! - Enhance AutoScrollBox with improved flexibility and overflow handling

  - Allow `maxHeight` prop to accept both `number` and `string` types for better layout integration
  - Add `mousePriority` prop to control mouse event priority in complex layouts
  - Fix overflow handling by adding `overflow="hidden"` to container for better scroll behavior
  - Improve integration with flexible layout systems

- [`1b268c6`](https://github.com/marschhuynh/nuvin-space/commit/1b268c60c6ffbe7d59a6d9468be04521f8f53838) Thanks [@marschhuynh](https://github.com/marschhuynh)! - Refactor FlexLayout to use AutoScrollBox with percentage-based sizing

  - Replace fixed height calculation with percentage-based `maxHeight="100%"`
  - Remove manual content height calculations for simpler layout logic
  - Simplify component structure by removing redundant Box containers
  - Improve scrolling behavior in virtualized message lists

- [`1b268c6`](https://github.com/marschhuynh/nuvin-space/commit/1b268c60c6ffbe7d59a6d9468be04521f8f53838) Thanks [@marschhuynh](https://github.com/marschhuynh)! - Update Ink package version to 6.5.7

  - Upgrade from 6.5.6 to 6.5.7 for latest bug fixes and improvements
  - Update all package manager overrides (pnpm, npm, yarn) to ensure consistent version

- [`1b268c6`](https://github.com/marschhuynh/nuvin-space/commit/1b268c60c6ffbe7d59a6d9468be04521f8f53838) Thanks [@marschhuynh](https://github.com/marschhuynh)! - Fix InputArea command menu positioning and layout

  - Remove absolute positioning from command menu to improve layout flow
  - Use available terminal rows for better space utilization
  - Simplify menu rendering by removing redundant props and positioning logic

- [`1b268c6`](https://github.com/marschhuynh/nuvin-space/commit/1b268c60c6ffbe7d59a6d9468be04521f8f53838) Thanks [@marschhuynh](https://github.com/marschhuynh)! - Fix InputProvider mouse priority handling for better event management

  - Set default mouse priority to subscriber ID instead of fixed 0 for proper event ordering
  - Add dependency array fixes to prevent unnecessary re-renders
  - Improve mouse subscription logic to handle priority conflicts better

- [`1b268c6`](https://github.com/marschhuynh/nuvin-space/commit/1b268c60c6ffbe7d59a6d9468be04521f8f53838) Thanks [@marschhuynh](https://github.com/marschhuynh)! - Improve ToolParameters with AutoScrollBox for better content handling

  - Wrap ToolParameters in AutoScrollBox to handle large parameter sets
  - Calculate dynamic maxHeight based on terminal dimensions for optimal space usage
  - Enable smooth scrolling with scrollStep configuration
  - Improve parameter display layout and structure

## 1.20.0

### Minor Changes

- [`d643194`](https://github.com/marschhuynh/nuvin-space/commit/d643194d58f0d090af11c167228d82af4ea93f76) Thanks [@marschhuynh](https://github.com/marschhuynh)! - Enhance AutoScrollBox with mouse wheel scrolling and scrollbar

  - Add mouse wheel scroll support via useMouse hook
  - Add visual scrollbar that shows scroll position and content ratio
  - New props: scrollStep, enableMouseScroll, showScrollbar, scrollbarColor, scrollbarTrackColor
  - Preserve user scroll position when new content is added

- [`d643194`](https://github.com/marschhuynh/nuvin-space/commit/d643194d58f0d090af11c167228d82af4ea93f76) Thanks [@marschhuynh](https://github.com/marschhuynh)! - Add mouse scroll support to InputContext with new useMouse hook

  - Add MouseEvent type and MouseHandler for mouse event handling
  - Add parseMouseEvent() to detect SGR and X10 mouse protocol sequences
  - Add subscribeMouse(), enableMouseMode(), disableMouseMode() to InputProvider
  - Create useMouse hook that auto-enables mouse mode and subscribes to mouse events
  - Mouse and keyboard events are handled separately to avoid interference

### Patch Changes

- [`f704d9d`](https://github.com/marschhuynh/nuvin-space/commit/f704d9d98c92364d2dc34c370e0696c69d29776d) Thanks [@marschhuynh](https://github.com/marschhuynh)! - Refactor FlexLayout to use AutoScrollBox for chat content

  - Simplify FlexLayout by removing VirtualizedChat dependency
  - Use AutoScrollBox for scrollable chat content with mouse wheel support
  - Remove unused FixedLayout and VirtualizedList components

- [`9edd9ea`](https://github.com/marschhuynh/nuvin-space/commit/9edd9ea1d8dbab02fe52003099b8183a2576e88b) Thanks [@marschhuynh](https://github.com/marschhuynh)! - Fix command menu positioning in InputArea

  - Add absolute positioning to command menu overlay
  - Set proper zIndex for menu to appear above other content

## 1.19.1

### Patch Changes

- [`cd1246c`](https://github.com/marschhuynh/nuvin-space/commit/cd1246cf84c94e58deacaab254b324af08ecc3e9) Thanks [@marschhuynh](https://github.com/marschhuynh)! - fix: update contextWindowUsage in real-time when LLM call completes

  - Auto-calculate contextWindowUsage in recordLLMCall when contextWindowLimit is set
  - Set contextWindowLimit before orchestrator.send() to enable immediate usage updates
  - Fixes delayed contextWindowUsage display that only updated after request completion

- [`b0db36f`](https://github.com/marschhuynh/nuvin-space/commit/b0db36f204dafc7922876a6a7ede1fe9640cd1cd) Thanks [@marschhuynh](https://github.com/marschhuynh)! - chore(deps): pin @nuvin/ink override to 6.5.5

  - Revert top-level package override and dependency entries to use @nuvin/ink@6.5.5 to avoid unexpected regression from 6.5.6.
  - Updates pnpm overrides/resolutions to match the desired ink version.

- Updated dependencies [[`cd1246c`](https://github.com/marschhuynh/nuvin-space/commit/cd1246cf84c94e58deacaab254b324af08ecc3e9)]:
  - @nuvin/nuvin-core@1.9.2

## 1.19.0

### Minor Changes

- [`93cbecd`](https://github.com/marschhuynh/nuvin-space/commit/93cbecdc38021f18d3ed58a5dca8e8c62fc5db2c) Thanks [@marschhuynh](https://github.com/marschhuynh)! - feat(input): add centralized InputContext system with priority-based input handling

  - Add InputProvider with middleware chain for global input handlers (Ctrl+C, paste detection, explain mode toggle)
  - Add useInput hook with priority-based subscription system for focus management
  - Add parseKeypress utility supporting both legacy terminals and Kitty keyboard protocol
  - Migrate all components from ink's useInput to custom InputContext

### Patch Changes

- [`93cbecd`](https://github.com/marschhuynh/nuvin-space/commit/93cbecdc38021f18d3ed58a5dca8e8c62fc5db2c) Thanks [@marschhuynh](https://github.com/marschhuynh)! - feat(input): add Kitty terminal keyboard protocol support

  - Detect Kitty terminal via TERM, TERM*PROGRAM, and KITTY*\* env vars
  - Enable Kitty keyboard protocol (CSI u encoding) for better modifier key detection
  - Handle Shift+Enter as newline insertion at parser level
  - Support Ctrl+V paste detection for image clipboard in Kitty

- [`93cbecd`](https://github.com/marschhuynh/nuvin-space/commit/93cbecdc38021f18d3ed58a5dca8e8c62fc5db2c) Thanks [@marschhuynh](https://github.com/marschhuynh)! - fix(paste): improve paste detection for text and image clipboard

  - Add bracketed paste sequence detection in middleware
  - Add Ctrl+V keystroke detection for Kitty terminals with image-only clipboard
  - Fix parseKeypress to pass through bracketed paste sequences as raw input

## 1.18.4

### Patch Changes

- [`ad22d25`](https://github.com/marschhuynh/nuvin-space/commit/ad22d2569e4950e755e83434a5b3fb757983415c) Thanks [@marschhuynh](https://github.com/marschhuynh)! - fix(cli): disable incremental rendering for improved performance

## 1.18.3

### Patch Changes

- [`6cf8ad9`](https://github.com/marschhuynh/nuvin-space/commit/6cf8ad92d5bf286f4a29c4856a086d2c5610e106) Thanks [@marschhuynh](https://github.com/marschhuynh)! - refactor: consolidate tool metadata types to eliminate duplication

- [`d53a0c9`](https://github.com/marschhuynh/nuvin-space/commit/d53a0c90f2a83e9e23164debcb3041a2d044120b) Thanks [@marschhuynh](https://github.com/marschhuynh)! - feat: implement lazy session creation - session directory and history.json are now created on first message instead of at startup

- Updated dependencies [[`6cf8ad9`](https://github.com/marschhuynh/nuvin-space/commit/6cf8ad92d5bf286f4a29c4856a086d2c5610e106)]:
  - @nuvin/nuvin-core@1.9.1

## 1.18.2

### Patch Changes

- [`e6891b7`](https://github.com/marschhuynh/nuvin-space/commit/e6891b78c540377d39bcbb966ab271c87ba81676) Thanks [@marschhuynh](https://github.com/marschhuynh)! - Lazy session directory creation - directories are now only created when data is actually written (history, events, or HTTP logs), preventing empty session directories from accumulating

## 1.18.1

### Patch Changes

- [`8478d04`](https://github.com/marschhuynh/nuvin-space/commit/8478d04bbd71d3e3cd1cd82124097a6d8a0825a6) Thanks [@marschhuynh](https://github.com/marschhuynh)! - Fix --profile flag not respecting profile session directory for --history and --resume

## 1.18.0

### Minor Changes

- [`dd9a07b`](https://github.com/marschhuynh/nuvin-space/commit/dd9a07b6f1071cfc439817b71678226fa0ad729b) Thanks [@marschhuynh](https://github.com/marschhuynh)! - Add tool approval edit instruction feature - allows users to provide feedback instead of approving/denying tool calls

### Patch Changes

- Updated dependencies [[`dd9a07b`](https://github.com/marschhuynh/nuvin-space/commit/dd9a07b6f1071cfc439817b71678226fa0ad729b)]:
  - @nuvin/nuvin-core@1.9.0

## 1.17.1

### Patch Changes

- [`7a47468`](https://github.com/marschhuynh/nuvin-space/commit/7a4746890f2630232a9ae1b595f2b87804394e00) Thanks [@marschhuynh](https://github.com/marschhuynh)! - Upgrade nuvin core to support custom command

- Updated dependencies [[`7a47468`](https://github.com/marschhuynh/nuvin-space/commit/7a4746890f2630232a9ae1b595f2b87804394e00)]:
  - @nuvin/nuvin-core@1.8.0

## 1.17.0

### Minor Changes

- [`bd0bf61`](https://github.com/marschhuynh/nuvin-space/commit/bd0bf61b22a08b4f70c2a07288abf7bdbe97e5de) Thanks [@marschhuynh](https://github.com/marschhuynh)! - Add custom command support with `/command` modal for creating reusable prompt templates

## 1.16.0

### Minor Changes

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

### Patch Changes

- Updated dependencies [[`3f7baea`](https://github.com/marschhuynh/nuvin-space/commit/3f7baea91f9866d6ebcf7dee471cb84af9f3a18c)]:
  - @nuvin/nuvin-core@1.7.2

## 1.15.2

### Patch Changes

- [`736df32`](https://github.com/marschhuynh/nuvin-space/commit/736df32e6694e2f6c6d337718e5285f8eee67060) Thanks [@marschhuynh](https://github.com/marschhuynh)! - Upgrade nuvin-core

## 1.15.1

### Patch Changes

- [`c558055`](https://github.com/marschhuynh/nuvin-space/commit/c5580551a5aa820a7572341723e83b2217964abb) Thanks [@marschhuynh](https://github.com/marschhuynh)! - Fix render of user message

## 1.15.0

### Minor Changes

- [`f7750f0`](https://github.com/marschhuynh/nuvin-space/commit/f7750f0ccaac9601719b9e7488de945e305f77c1) Thanks [@marschhuynh](https://github.com/marschhuynh)! - Add scroll and auto-scroll UI components, truncateLines utility, demos and tests to improve chat display scrolling behavior.

## 1.14.0

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

### Patch Changes

- Updated dependencies [[`2bbcbb1`](https://github.com/marschhuynh/nuvin-space/commit/2bbcbb1288d7daf958ff565096ab001dc4834c2f)]:
  - @nuvin/nuvin-core@1.7.0

## 1.13.4

### Patch Changes

- [`14c1a75`](https://github.com/marschhuynh/nuvin-space/commit/14c1a7504e798685d49c461a58115a70ef3186e9) Thanks [@marschhuynh](https://github.com/marschhuynh)! - Fix stale isStreaming flag causing messages to stay dynamic after errors

  - Clear isStreaming flag when error occurs during streaming
  - Add fallback: ignore isStreaming=true if message is not the last non-transient
  - Extract calculateStaticCount to utils/staticCount.ts with tests

## 1.13.3

### Patch Changes

- [`f31947d`](https://github.com/marschhuynh/nuvin-space/commit/f31947db768da35888f1a7fb1c8e912ca150e164) Thanks [@marschhuynh](https://github.com/marschhuynh)! - Fix crash when loading old history files with missing metadata

  - Add `get()` utility for safe nested property access
  - Update ToolResultView to handle missing `metadata.stats` and other optional fields
  - Gracefully degrade display when metadata is incomplete

## 1.13.2

### Patch Changes

- [`6f5ad8d`](https://github.com/marschhuynh/nuvin-space/commit/6f5ad8d79100df0bccf2eae713321c42e457bbe0) Thanks [@marschhuynh](https://github.com/marschhuynh)! - fix(formatters): improve duration formatting for minutes

  - Fix formatDuration to omit "0s" when displaying whole minutes (e.g., "2m" instead of "2m 0s")

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

- [`6f5ad8d`](https://github.com/marschhuynh/nuvin-space/commit/6f5ad8d79100df0bccf2eae713321c42e457bbe0) Thanks [@marschhuynh](https://github.com/marschhuynh)! - feat(ui): improve UI rendering and transient message handling

  - Add `isTransient` metadata flag for temporary system messages (retry notifications)
  - Improve ChatDisplay dynamic rendering: skip transient messages when scanning for pending operations
  - Fix sub-agent activity display: better text wrapping and parameter truncation
  - Enhance tool call duration formatting with `formatDuration()` utility
  - Fix merging logic to always propagate metadata updates (including sub-agent state)

- Updated dependencies [[`6f5ad8d`](https://github.com/marschhuynh/nuvin-space/commit/6f5ad8d79100df0bccf2eae713321c42e457bbe0), [`6f5ad8d`](https://github.com/marschhuynh/nuvin-space/commit/6f5ad8d79100df0bccf2eae713321c42e457bbe0)]:
  - @nuvin/nuvin-core@1.6.1

## 1.13.1

### Patch Changes

- [`b360cc3`](https://github.com/marschhuynh/nuvin-space/commit/b360cc3fef464d8330115d8db1c4e8caab143438) Thanks [@marschhuynh](https://github.com/marschhuynh)! - Refactor: extract formatting utilities into centralized formatters module

  - Add new `formatters.ts` utility module with reusable formatting functions
  - Extract `formatTokens`, `formatDuration`, `formatRelativeTime`, `formatTimeFromSeconds`, `getUsageColor`, and `getMessageCountBadge` from components
  - Improve token formatting to support millions (M) and billions (B) suffixes
  - Add human-readable duration formatting (ms, seconds, minutes)
  - Update Footer, RecentSessions, SubAgentActivity, ToolResultView, and ToolTimer to use centralized formatters

## 1.13.0

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

### Patch Changes

- Updated dependencies [[`d896922`](https://github.com/marschhuynh/nuvin-space/commit/d896922e3e4cb6bcc143344574fbd47dd22382d6), [`3f86c26`](https://github.com/marschhuynh/nuvin-space/commit/3f86c268c933589f9609e2bbaae41e369821e556)]:
  - @nuvin/nuvin-core@1.6.0

## 1.12.2

### Patch Changes

- [`49b6608`](https://github.com/marschhuynh/nuvin-space/commit/49b660831f3e71044aede300095ca73cc8a3a630) Thanks [@marschhuynh](https://github.com/marschhuynh)! - UI/UX improvements: Add footer support to AppModal, improve responsive layout with flexWrap for Footer and MessageLine, enhance text wrapping for better terminal display

- Updated dependencies [[`dadaace`](https://github.com/marschhuynh/nuvin-space/commit/dadaace3556ea0c9423aa54b37202b5ac67de533)]:
  - @nuvin/nuvin-core@1.5.2

## 1.12.1

### Patch Changes

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

- Updated dependencies [[`b5a0214`](https://github.com/marschhuynh/nuvin-space/commit/b5a0214b6437261edb8c024ed36d44be30a45e87), [`ec26a90`](https://github.com/marschhuynh/nuvin-space/commit/ec26a9092e872ca0ee2769e04047936a9045a652)]:
  - @nuvin/nuvin-core@1.5.0

## 1.12.0

### Minor Changes

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

- [`8168642`](https://github.com/marschhuynh/nuvin-space/commit/8168642871eea28f657f2c25a4550b497806dbbd) Thanks [@marschhuynh](https://github.com/marschhuynh)! - Add input history navigation with up/down arrow keys

  - Press ↑/↓ to recall previously submitted messages
  - Loads history from memory on startup, with fallback to last session's message
  - Multi-line input requires double-press at first/last line to navigate history
  - Extracts history logic into reusable `useInputHistory` hook

### Patch Changes

- Updated dependencies [[`7e9140f`](https://github.com/marschhuynh/nuvin-space/commit/7e9140f306fa1a68bb50474003d58bcf561d15c8)]:
  - @nuvin/nuvin-core@1.4.4

## 1.11.3

### Patch Changes

- [`6b0cf9c`](https://github.com/marschhuynh/nuvin-space/commit/6b0cf9c29b3c3ffe1b6d77c43a0064da4fae9436) Thanks [@marschhuynh](https://github.com/marschhuynh)! - Fix publish failure by skipping redundant type check during prepack

## 1.11.2

### Patch Changes

- [`e59a2c5`](https://github.com/marschhuynh/nuvin-space/commit/e59a2c5e5e9fd1c39c553e2d6c814063070c6feb) Thanks [@marschhuynh](https://github.com/marschhuynh)! - Refactor project structure: move all source files into `src/` directory for better organization and standard TypeScript project layout

- Updated dependencies [[`e59a2c5`](https://github.com/marschhuynh/nuvin-space/commit/e59a2c5e5e9fd1c39c553e2d6c814063070c6feb)]:
  - @nuvin/nuvin-core@1.4.3

## 1.11.1

### Patch Changes

- [`239c907`](https://github.com/marschhuynh/nuvin-space/commit/239c9073545c42b1ed4c9341f15a6a9ad9bc943f) Thanks [@marschhuynh](https://github.com/marschhuynh)! - Update dependencies to latest versions

- Updated dependencies [[`239c907`](https://github.com/marschhuynh/nuvin-space/commit/239c9073545c42b1ed4c9341f15a6a9ad9bc943f)]:
  - @nuvin/nuvin-core@1.4.2

## 1.11.0

### Minor Changes

- [`391fee8`](https://github.com/marschhuynh/nuvin-space/commit/391fee8b38db2ea04869f236f9ff65ab02ac3192) Thanks [@marschhuynh](https://github.com/marschhuynh)! - Implement seamless authentication and model selection navigation flow

  ### Features

  - **Interactive Auth Navigation Prompt**: Replace text-based Y/n prompt with styled interactive buttons matching tool approval modal design

    - Tab/Arrow keys to navigate between Yes/No options
    - Enter to select, or quick shortcuts (1/Y for Yes, 2/N for No)
    - Visual feedback with colored buttons and arrow indicator

  - **Smart Model Selection UI**: Hide custom model input option when provider is not configured

    - Prevents confusing UX when authentication is required
    - Shows only the auth navigation prompt when provider needs configuration

  - **Automatic Round-Trip Navigation**: Seamlessly return to model selection after successful authentication

    - `/model` → Select unconfigured provider → Navigate to `/auth` → Configure auth → **Automatically return to `/model`**
    - Provider context preserved throughout the flow
    - Eliminates manual navigation steps

  - **Enhanced Error Detection**: Trigger auth navigation prompt for both LLMFactory and configuration errors
    - Detects authentication errors during model fetching
    - Shows navigation prompt for "not configured" or "/auth" error messages

  ### User Experience Improvements

  - Reduced manual steps from 8 to 5 (3 steps eliminated)
  - 60% reduction in user effort for initial provider setup
  - Consistent UI patterns across authentication flows
  - Clear visual feedback for all interactive elements

  ### Technical Changes

  - Added `--return-to-model` flag to `/auth` command for return navigation
  - Enhanced `AuthNavigationPrompt` component with keyboard navigation
  - Updated `useModelsCommandState` to detect auth errors from multiple sources
  - Improved state management for auth prompt display

### Patch Changes

- [`c2c485a`](https://github.com/marschhuynh/nuvin-space/commit/c2c485a737a3e063eb09fcdf4f22b10f5b2a4028) Thanks [@marschhuynh](https://github.com/marschhuynh)! - Fix text rendering and wrapping issues

  - Fixed unicode character width calculations using string-width library
  - Improved text reflow algorithm to properly handle indentation and ANSI codes
  - Fixed input submission to preserve whitespace (don't trim user input)
  - Added wrap="end" to Markdown component for better text wrapping
  - Enabled markdown rendering for streaming content in MessageLine
  - Added comprehensive text reflow tests

## 1.10.2

### Patch Changes

- [`9480dcd`](https://github.com/marschhuynh/nuvin-space/commit/9480dcd7025ff720702e60f3e805e6c9c62246bd) Thanks [@marschhuynh](https://github.com/marschhuynh)! - Update logo

## 1.10.1

### Patch Changes

- [`6a41065`](https://github.com/marschhuynh/nuvin-space/commit/6a410656e38d5b5020c42e5b94bc83e0ab7900d3) Thanks [@marschhuynh](https://github.com/marschhuynh)! - Update logger level to error for better log management and reduced noise

- Updated dependencies [[`6a41065`](https://github.com/marschhuynh/nuvin-space/commit/6a410656e38d5b5020c42e5b94bc83e0ab7900d3)]:
  - @nuvin/nuvin-core@1.4.1

## 1.10.0

### Minor Changes

- [`2a2ab84`](https://github.com/marschhuynh/nuvin-space/commit/2a2ab8483149e4f1ce56473bb4b40bcd7144b979) Thanks [@marschhuynh](https://github.com/marschhuynh)! - feat(cli): enhance authentication flow with notifications

  - Add success notification when API key is saved in auth flow
  - Improve provider selection UI in InitialConfigSetup
  - Handle edge case when no providers are available
  - Enhance auth command with automatic deactivation on success
  - Add better error handling and user feedback

- [`2a2ab84`](https://github.com/marschhuynh/nuvin-space/commit/2a2ab8483149e4f1ce56473bb4b40bcd7144b979) Thanks [@marschhuynh](https://github.com/marschhuynh)! - refactor(core/cli): migrate to dynamic provider discovery

  - Replace static provider lists with dynamic discovery from core
  - Add getProviderLabel() to core for centralized label management
  - Update provider config schema: name → key field with optional label
  - Enhance InitialConfigSetup to use available providers dynamically
  - Remove hardcoded PROVIDER\_\* constants in favor of runtime discovery

- [`2a2ab84`](https://github.com/marschhuynh/nuvin-space/commit/2a2ab8483149e4f1ce56473bb4b40bcd7144b979) Thanks [@marschhuynh](https://github.com/marschhuynh)! - feat(cli): improve provider and model selection UX

  - Display provider labels instead of provider keys in UI components
  - Add fallback text for undefined provider information
  - Improve model loading and custom model input screens
  - Enhance provider descriptions and selection behavior
  - Update models command to use dynamic provider discovery

### Patch Changes

- [`2a2ab84`](https://github.com/marschhuynh/nuvin-space/commit/2a2ab8483149e4f1ce56473bb4b40bcd7144b979) Thanks [@marschhuynh](https://github.com/marschhuynh)! - chore(cli): improve error messages and enable debug logging

  - Add "wait a moment" context to orchestrator initialization errors
  - Enable debug level logging in file logger by default
  - Provide more descriptive error messages in command flows
  - Improve error feedback in history and summary commands

- [`2a2ab84`](https://github.com/marschhuynh/nuvin-space/commit/2a2ab8483149e4f1ce56473bb4b40bcd7144b979) Thanks [@marschhuynh](https://github.com/marschhuynh)! - test(cli): remove outdated test and update imports

  - Delete provider-registry.test.ts (no longer relevant with dynamic providers)
  - Update stripAnsi and textInputPaste test imports to use core package
  - Remove hardcoded provider assertion tests that don't apply to dynamic system

- [`2a2ab84`](https://github.com/marschhuynh/nuvin-space/commit/2a2ab8483149e4f1ce56473bb4b40bcd7144b979) Thanks [@marschhuynh](https://github.com/marschhuynh)! - refactor(core/cli): move string utilities to core package

  - Remove CLI utils.ts wrapper file
  - Update imports to use @nuvin/nuvin-core utilities directly
  - Move stripAnsiAndControls and canonicalizeTerminalPaste to core exports
  - Update test imports to reference core package utilities
  - Ensure consistent utility usage across packages

- Updated dependencies [[`2a2ab84`](https://github.com/marschhuynh/nuvin-space/commit/2a2ab8483149e4f1ce56473bb4b40bcd7144b979), [`2a2ab84`](https://github.com/marschhuynh/nuvin-space/commit/2a2ab8483149e4f1ce56473bb4b40bcd7144b979)]:
  - @nuvin/nuvin-core@1.4.0

## 1.9.3

### Patch Changes

- [`5b164c5`](https://github.com/marschhuynh/nuvin-space/commit/5b164c5215070d7b2fa1429bddf5bbfbf938832a) Thanks [@marschhuynh](https://github.com/marschhuynh)! - - Support kimi coding

- Updated dependencies [[`5b164c5`](https://github.com/marschhuynh/nuvin-space/commit/5b164c5215070d7b2fa1429bddf5bbfbf938832a)]:
  - @nuvin/nuvin-core@1.3.2

## 1.9.2

### Patch Changes

- [`a9742e0`](https://github.com/marschhuynh/nuvin-space/commit/a9742e07131afeae5b4c7da44074337b941666d0) Thanks [@marschhuynh](https://github.com/marschhuynh)! - - Support kimi coding

## 1.9.1

### Patch Changes

- [`2663741`](https://github.com/marschhuynh/nuvin-space/commit/2663741c5660cd631559722c0505ab88bd57df85) Thanks [@marschhuynh](https://github.com/marschhuynh)! - - Fix duplicate logo and RecentSessions rendering during streaming
  - Consolidate RecentSessions inside WelcomeLogo component for simpler rendering

## 1.9.0

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

### Patch Changes

- Updated dependencies [[`7bb25af`](https://github.com/marschhuynh/nuvin-space/commit/7bb25af570fbbed6b753cbf7c382da84e68bcf2e), [`459c879`](https://github.com/marschhuynh/nuvin-space/commit/459c8797169fa59b7d9186baf216c131d8f182d4)]:
  - @nuvin/nuvin-core@1.3.0

## 1.8.0

### Minor Changes

- [`e400bb9`](https://github.com/marschhuynh/nuvin-space/commit/e400bb955dde2834344002ec9f9746ce5698ac6a) Thanks [@marschhuynh](https://github.com/marschhuynh)! - Add notification-based update system with lifecycle callbacks

  The update checker now runs after app startup and communicates via notifications:

  - Update checks run 2 seconds after app starts (non-blocking)
  - Shows notifications for update availability, start, and completion
  - Added UpdateCheckOptions interface with lifecycle callbacks
  - Improved UX by not blocking app startup for update checks

### Patch Changes

- [`e400bb9`](https://github.com/marschhuynh/nuvin-space/commit/e400bb955dde2834344002ec9f9746ce5698ac6a) Thanks [@marschhuynh](https://github.com/marschhuynh)! - Update CLI branding from 'nuvin-cli' to 'nuvin'

  - Update profile command help text to use 'nuvin' command name
  - Update documentation with consistent branding
  - Improve user-facing documentation clarity

- [`e400bb9`](https://github.com/marschhuynh/nuvin-space/commit/e400bb955dde2834344002ec9f9746ce5698ac6a) Thanks [@marschhuynh](https://github.com/marschhuynh)! - Validate provider authentication in models command

  - Check provider auth configuration before allowing model selection
  - Show helpful error message prompting users to run /auth if provider not configured
  - Prevent saving invalid provider/model configurations
  - Fix isActive prop forwarding in ModelsCommandComponent

- [`e400bb9`](https://github.com/marschhuynh/nuvin-space/commit/e400bb955dde2834344002ec9f9746ce5698ac6a) Thanks [@marschhuynh](https://github.com/marschhuynh)! - Fix ComboBox rendering and config profile tracking

  - Fix ComboBox selection index reset behavior to prevent unnecessary re-renders
  - Ensure current profile is properly tracked when using CLI flag overrides
  - Improve component stability and config state management

## 1.7.6

### Patch Changes

- [`32981d9`](https://github.com/marschhuynh/nuvin-space/commit/32981d9c3e17244570c3e1fc4657ded958a312f9) Thanks [@marschhuynh](https://github.com/marschhuynh)! - Improve diff view and tool content rendering

  - Refactor FileDiffView to use flex wrapping for better long-line handling
  - Replace Markdown with plain text for file_new tool content and streaming messages
  - Clean up RecentSessions styling with underline title
  - Remove unused isInitialMountRef from app.tsx
  - Update snapshots for new diff line format

## 1.7.5

### Patch Changes

- [`1d4e161`](https://github.com/marschhuynh/nuvin-space/commit/1d4e161958837812687fbc7a6d5b0bd5f880ef32) Thanks [@marschhuynh](https://github.com/marschhuynh)! - fix: override ink

## 1.7.4

### Patch Changes

- [`74a6448`](https://github.com/marschhuynh/nuvin-space/commit/74a64481be9c064695ee96bc46926d7afd915f23) Thanks [@marschhuynh](https://github.com/marschhuynh)! - fix: override ink

## 1.7.3

### Patch Changes

- [`ed48791`](https://github.com/marschhuynh/nuvin-space/commit/ed48791da752bc1c6dd16d5df00ebd32156404ee) Thanks [@marschhuynh](https://github.com/marschhuynh)! - fix: override ink

## 1.7.2

### Patch Changes

- [`3010073`](https://github.com/marschhuynh/nuvin-space/commit/3010073037b477e2dbb0701fa3d5c43366d58364) Thanks [@marschhuynh](https://github.com/marschhuynh)! - Adds pnpm override for ink dependency to use @nuvin/ink@6.5.1-alpha.1

## 1.7.1

### Patch Changes

- [`f1e311c`](https://github.com/marschhuynh/nuvin-space/commit/f1e311ca5d2b3cee3111df9cdacf042957d05255) Thanks [@marschhuynh](https://github.com/marschhuynh)! - Update ink to alpha version and remove padding from Footer component

  - Updated @nuvin/ink dependency from 6.5.1 to 6.5.1-alpha.1
  - Removed paddingX from Footer component's working directory display
  - Cleaned up package.json configurations

## 1.7.0

### Minor Changes

- [`20f4322`](https://github.com/marschhuynh/nuvin-space/commit/20f432282fd71509ee886c0faf4407a76d459947) Thanks [@marschhuynh](https://github.com/marschhuynh)! - Add `--resume` (or `-r`) flag to resume the most recent session when starting the app.

### Patch Changes

- [`41b4f59`](https://github.com/marschhuynh/nuvin-space/commit/41b4f5904177aababa9da3f5253f844107126031) Thanks [@marschhuynh](https://github.com/marschhuynh)! - Fix `/history` command to switch to the selected session instead of loading messages into current session. New messages are now appended to the selected session's history.

## 1.6.0

### Minor Changes

- [`de16725`](https://github.com/marschhuynh/nuvin-space/commit/de16725d520098d68355a4cd2b2e3f08268165d3) Thanks [@marschhuynh](https://github.com/marschhuynh)! - feat: Enhance LLM streaming and Github provider

  - **Core**: Improved `BaseLLM` streaming handling to support unknown fields (e.g. reasoning metadata) dynamically.
  - **Core**: Better tool call merging and usage tracking in streaming responses.
  - **GitHub Provider**: Updates to GitHub transport and model definitions.
  - **CLI**: Updated LLM factory and orchestrator to leverage new core capabilities.

- [`2992369`](https://github.com/marschhuynh/nuvin-space/commit/2992369a1f89428c312500f7085f9a7773c5c5ff) Thanks [@marschhuynh](https://github.com/marschhuynh)! - feat: Add multi-profile support

  - Added support for multiple configuration profiles.
  - Profiles allow switching between different environments/configurations easily.
  - New `profile-manager` and related logic in CLI config.

### Patch Changes

- Updated dependencies [[`de16725`](https://github.com/marschhuynh/nuvin-space/commit/de16725d520098d68355a4cd2b2e3f08268165d3)]:
  - @nuvin/nuvin-core@1.2.0

## 1.5.1

### Patch Changes

- [`af0232a`](https://github.com/marschhuynh/nuvin-space/commit/af0232ab2d5ff44afa8e84efdef70be447ae7899) Thanks [@marschhuynh](https://github.com/marschhuynh)! - Improve welcome screen UX with enhanced recent activity display and better time formatting. Refactor streaming markdown hook for better performance. Simplify topic analysis call to fire-and-forget pattern.

- Updated dependencies [[`3f7a1e2`](https://github.com/marschhuynh/nuvin-space/commit/3f7a1e2297bfe7e3602749afdbb3435c30eb9868)]:
  - @nuvin/nuvin-core@1.1.2

## 1.5.0

### Minor Changes

- [`48331d7`](https://github.com/marschhuynh/nuvin-space/commit/48331d78cfb34167e17df70e7fb441c62d980d04) Thanks [@marschhuynh](https://github.com/marschhuynh)! - **New Features:**

  - Topic analyzer now includes all previous user messages for better context analysis
  - Conversation topics are automatically analyzed and updated after each user input
  - `/history` command now displays conversation topics instead of last messages

  **Improvements:**

  - Enhanced topic analysis with full conversation history context
  - Better topic extraction by analyzing only user messages (excluding assistant and tool messages)
  - Session metadata now includes topic information for easier conversation identification

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

### Patch Changes

- Updated dependencies [[`05fad0c`](https://github.com/marschhuynh/nuvin-space/commit/05fad0ca6722b823554dc388e0583c54d8851512)]:
  - @nuvin/nuvin-core@1.0.0

## 0.1.0

### Minor Changes

- [`e43c58b`](https://github.com/marschhuynh/nuvin-space/commit/e43c58bab64c2184010972250d62c63af6a5f393) Thanks [@marschhuynh](https://github.com/marschhuynh)! - Initial release of Nuvin - Interactive AI coding assistant CLI

### Patch Changes

- Updated dependencies [[`e43c58b`](https://github.com/marschhuynh/nuvin-space/commit/e43c58bab64c2184010972250d62c63af6a5f393)]:
  - @nuvin/nuvin-core@0.1.0
