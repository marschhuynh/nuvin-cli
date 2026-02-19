// Hook types and interfaces
export * from './types.js';

// Hook registry for matching and storage
export { HookRegistry } from './hook-registry.js';

// Command hook executor
export { CommandHookExecutor } from './command-hook-executor.js';

// Config loader for agent frontmatter
export {
  loadHooksFromFrontmatter,
  type AgentFrontmatter,
  type FrontmatterHooks,
  type FrontmatterHookDef,
} from './config-loader.js';

// Composite hook port
export { CompositeHookPort } from './composite-hook-port.js';
